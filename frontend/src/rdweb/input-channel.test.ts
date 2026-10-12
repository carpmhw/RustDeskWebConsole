import { expect, it, vi } from 'vitest'
import { InputChannel } from './input-channel'
import type { InputBatch, InputState, InputIntent } from './interaction-types'
const state: InputState = {
  revision: 2,
  input_generation: 1,
  display: { display: 0, width: 320, height: 240 },
  platform: 'linux',
  sas: false,
  ready: true,
  keyboard: true,
  clipboard: true,
}
const key: InputIntent = { kind: 'key', key: 'Return', down: true, modifiers: [] }
// 使用可控 clock 與收集 port，真 channel 驗 credit 與資料 ownership。
function fixture() {
  let time = 0
  const batches: InputBatch[] = [],
    release = vi.fn(),
    fail = vi.fn()
  const c = new InputChannel(
    (b) => batches.push(b),
    release,
    fail,
    () => time,
  )
  c.setState(state)
  c.focus()
  return {
    c,
    batches,
    release,
    fail,
    advance: (n: number) => {
      time = n
    },
  }
}
// 只有完全相符 tag 可歸還一次 credit。
it('keeps one batch in flight and rejects duplicate or mismatched ACKs', () => {
  const { c, batches } = fixture()
  c.enqueue(key)
  c.enqueue({ ...key, down: false })
  expect(batches).toHaveLength(1)
  c.ack({ ...batches[0]!, revision: 1, sent: true })
  expect(batches).toHaveLength(1)
  c.ack({ ...batches[0]!, sent: true })
  expect(batches).toHaveLength(2)
  c.ack({ ...batches[0]!, sent: true })
  expect(batches).toHaveLength(2)
})
// 舊 generation 被作廢仍只靠原本 ACK 還 credit，blur 不重送。
it('drops pending input on generation changes without minting credit', () => {
  const { c, batches } = fixture()
  c.enqueue(key)
  c.enqueue(key)
  c.setState({ ...state, input_generation: 2 })
  c.focus()
  c.enqueue(key)
  expect(batches).toHaveLength(1)
  c.ack({ ...batches[0]!, sent: false })
  expect(batches).toHaveLength(2)
  expect(batches[1]!.input_generation).toBe(2)
  c.enqueue(key)
  c.blur()
  c.ack({ ...batches[1]!, sent: true })
  expect(batches).toHaveLength(2)
  expect(c.count).toBe(0)
})
// 超 64 events 或 32KiB 待送文字皆 fail closed。
it('bounds pending count and text bytes', () => {
  for (const mode of ['count', 'bytes'] as const) {
    const { c, fail } = fixture()
    c.enqueue(key)
    const intent: InputIntent =
      mode === 'count' ? key : { kind: 'text', text: 'a'.repeat(4096), modifiers: [] }
    const limit = mode === 'count' ? 64 : 8
    for (let i = 0; i < limit; i++) c.enqueue(intent)
    expect(c.count).toBe(limit)
    expect(c.bytes).toBe(mode === 'count' ? 0 : 32768)
    expect(fail).not.toHaveBeenCalled()
    c.enqueue(intent)
    expect(fail).toHaveBeenCalledExactlyOnceWith('input_backpressure')
    expect(c.count).toBe(0)
    expect(c.bytes).toBe(0)
    expect(c.inflight).toBe(false)
  }
})
// 每 batch 至多 16 events／8KiB，copy 意圖且送後不再保留文字。
it('limits batches and owns queued payloads independently', () => {
  const { c, batches } = fixture()
  c.enqueue(key)
  const text: InputIntent = { kind: 'text', text: 'a'.repeat(4096), modifiers: [] }
  c.enqueue(text)
  c.enqueue(text)
  c.enqueue(text)
  text.text = 'changed'
  c.ack({ ...batches[0]!, sent: true })
  expect(batches[1]!.events).toHaveLength(2)
  expect((batches[1]!.events[0] as typeof text).text).toHaveLength(4096)
  expect(c.bytes).toBe(4096)
  c.ack({ ...batches[1]!, sent: true })
  expect(c.bytes).toBe(0)
  for (let i = 0; i < 20; i++) c.enqueue(key)
  c.ack({ ...batches[2]!, sent: true })
  expect(batches[3]!.events).toHaveLength(16)
})
// 兩秒期限在 ACK 入口亦必須驗明，late ACK 不復活 queue。
it('fails a timed out credit and disposes once', () => {
  const { c, batches, fail, release, advance } = fixture()
  c.enqueue(key)
  c.enqueue(key)
  advance(2000)
  c.ack({ ...batches[0]!, sent: true })
  c.tick()
  c.dispose()
  expect(fail).toHaveBeenCalledExactlyOnceWith('input_backpressure')
  expect(batches).toHaveLength(1)
  expect(release).toHaveBeenCalledOnce()
})
// revision 換新可開始新 operation，舊 ACK 無法覆寫其 credit。
it('resets credit only for a different revision', () => {
  const { c, batches } = fixture()
  c.enqueue(key)
  c.setState({ ...state, revision: 3 })
  c.focus()
  c.enqueue(key)
  expect(batches).toHaveLength(2)
  c.ack({ ...batches[0]!, sent: true })
  expect(c.inflight).toBe(true)
})
// hover 只留 latest 且 30Hz，button 必要定位不建無界 move queue。
it('throttles latest moves while preserving discrete order and nonnegative bytes', () => {
  const { c, batches, advance } = fixture()
  c.enqueue({ kind: 'move', x: 1, y: 1 })
  c.ack({ ...batches[0]!, sent: true })
  for (let x = 2; x < 100; x++) c.enqueue({ kind: 'move', x, y: 1 })
  expect(c.count).toBe(1)
  expect(c.bytes).toBe(0)
  expect(batches).toHaveLength(1)
  c.enqueue({ kind: 'button', x: 99, y: 1, button: 'left', down: true, modifiers: [] })
  advance(34)
  c.tick()
  expect(batches[1]!.events.map((e) => e.kind)).toEqual(['move', 'button'])
  expect((batches[1]!.events[0] as Extract<InputIntent, { kind: 'move' }>).x).toBe(99)
  expect(c.bytes).toBe(0)
})
// SAS 專用按鈕不奪焦點且不能建立第二份在途命令。
it('sends SAS once without reclaiming ordinary focus', () => {
  const { c, batches } = fixture()
  c.blur()
  c.setState({ ...state, platform: 'windows', sas: true })
  expect(c.commandSas()).toBe(true)
  expect(c.commandSas()).toBe(false)
  c.ack({ ...batches[0]!, sent: true })
  c.enqueue(key)
  expect(batches).toHaveLength(1)
  expect(batches[0]!.events).toEqual([{ kind: 'sas' }])
})
// 沒有 ready／權限／焦點時不納入事件。
it('gates input by readiness, focus and keyboard permission', () => {
  const { c, batches } = fixture()
  c.blur()
  c.enqueue(key)
  c.setState({ ...state, keyboard: false })
  c.focus()
  c.enqueue(key)
  c.setState({ ...state, ready: false })
  c.focus()
  c.enqueue(key)
  expect(batches).toHaveLength(0)
})
