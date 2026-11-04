import { expect, it, vi } from 'vitest'
import { WorkerInputSender } from './worker-input'
import { KeyboardInput } from './keyboard-input'
import {
  CONTROL_NAMES,
  type InputState,
  type PeerInputMetadata,
  type InputIntent,
} from './interaction-types'
const meta: PeerInputMetadata = {
  geometry: { display: 0, width: 320, height: 240, x: 0, y: 0 },
  platform: 'linux',
  sas: false,
}
// 注入唯一 sender；測 wire 與 release 語意，不假造 MAC 成功。
function fixture(platform: PeerInputMetadata['platform'] = 'linux') {
  const states: InputState[] = [],
    send = vi.fn(),
    ack = vi.fn(),
    issue = vi.fn()
  const sender = new WorkerInputSender(4, send, (v) => states.push(v), ack, issue)
  sender.setPeer({ ...meta, platform })
  sender.media(2, true)
  let id = 0
  // 每條新 batch 使用最新 generation 與遞增 tag。
  const receive = (events: InputIntent[]) =>
    sender.receive({
      revision: 4,
      input_generation: states.at(-1)!.input_generation,
      batch_id: ++id,
      events,
    })
  return { sender, states, send, ack, issue, receive }
}
// input 世代與 decoder 分離；只改 origin 亦拒舊座標並還原 credit。
it('invalidates old coordinates without requiring a media reset', () => {
  const f = fixture(),
    old = f.states.at(-1)!.input_generation
  f.sender.setPeer({ ...meta, geometry: { ...meta.geometry, x: -320 } })
  f.sender.receive({
    revision: 4,
    input_generation: old,
    batch_id: 1,
    events: [{ kind: 'move', x: 5, y: 6 }],
  })
  expect(f.ack).toHaveBeenCalledExactlyOnceWith({
    revision: 4,
    input_generation: old,
    batch_id: 1,
    sent: false,
  })
  expect(f.send).not.toHaveBeenCalled()
  expect(f.states.at(-1)!.ready).toBe(true)
  expect(f.states.at(-1)).not.toHaveProperty('geometry')
  expect(f.states.at(-1)!.display).not.toHaveProperty('x')
})
// 私有 ledger 是已送 down，repeat 不重複記錄；up 不移回舊 drag 位置。
it('releases exactly the known held keys and buttons before geometry changes', () => {
  const f = fixture()
  f.receive([
    { kind: 'key', key: 'Control', down: true, modifiers: [] },
    { kind: 'key', key: 'Control', down: true, modifiers: [] },
    { kind: 'button', button: 'middle', x: 10, y: 20, down: true, modifiers: [] },
  ])
  f.send.mockClear()
  f.sender.setPeer({ ...meta, geometry: { ...meta.geometry, x: -320 } })
  expect(f.send.mock.calls.map((c) => c[0])).toEqual([
    { keyEvent: { controlKey: 4, down: false, press: false, mode: 0, modifiers: [] } },
    { mouseEvent: { mask: 34, modifiers: [] } },
  ])
  f.sender.release()
  f.sender.dispose()
  f.sender.dispose()
  expect(f.send).toHaveBeenCalledTimes(2)
})
// 權限先於 peer 到達的否定不能被 metadata 重設，恢復也不復活舊輸入。
it('preserves permission denial and separates clipboard from keyboard generation', () => {
  const states: InputState[] = [],
    send = vi.fn(),
    ack = vi.fn()
  const s = new WorkerInputSender(4, send, (v) => states.push(v), ack, vi.fn())
  s.permission({ keyboard: false, clipboard: true })
  s.setPeer(meta)
  s.media(1, true)
  expect(states.at(-1)).toMatchObject({ ready: false, keyboard: false, clipboard: true })
  s.receive({
    revision: 4,
    input_generation: states.at(-1)!.input_generation,
    batch_id: 1,
    events: [{ kind: 'move', x: 1, y: 2 }],
  })
  expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({ sent: false }))
  expect(send).not.toHaveBeenCalled()
  s.permission({ keyboard: true, clipboard: true })
  const gen = states.at(-1)!.input_generation
  s.permission({ keyboard: true, clipboard: false })
  expect(states.at(-1)).toMatchObject({ ready: true, clipboard: false, input_generation: gen })
  const count = states.length
  s.media(1, true)
  s.setPeer(meta)
  expect(states).toHaveLength(count)
})
// decoder 重配與 keyboard 撤銷先釋放舊 down，重新 ready 不重送。
it('invalidates media generation and releases on keyboard revocation', () => {
  const f = fixture()
  f.receive([{ kind: 'key', key: 'Return', down: true, modifiers: [] }])
  const old = f.states.at(-1)!.input_generation
  f.sender.media(3, false)
  expect(f.states.at(-1)!.input_generation).toBeGreaterThan(old)
  expect(f.send.mock.calls.at(-1)![0].keyEvent.down).toBe(false)
  f.sender.media(3, true)
  f.receive([{ kind: 'key', key: 'Shift', down: true, modifiers: [] }])
  f.sender.permission({ keyboard: false, clipboard: true })
  expect(f.send.mock.calls.at(-1)![0].keyEvent.down).toBe(false)
})
// 真DOM語意adapter到Worker wire捕捉self-modifier被Legacy放開後Translate失去Ctrl的缺口。
it.each(['a', 'c', 'v'] as const)('keeps Ctrl held across the Windows %s shortcut wire', (char) => {
  const f = fixture('windows')
  const keyboard = new KeyboardInput(
    // 使用真sender及encoder，只有外部加密sender出口被觀察。
    (intent) => f.receive([intent]),
    f.issue,
  )
  const control = {
    key: 'Control',
    code: 'ControlLeft',
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    // 此公開測試沒有lock或AltGraph。
    getModifierState: () => false,
  }
  keyboard.keyDown(control)
  keyboard.keyDown({ ...control, key: char, code: 'Key' + char.toUpperCase() })
  keyboard.keyUp({ ...control, key: char, code: 'Key' + char.toUpperCase() })
  keyboard.keyUp({ ...control, ctrlKey: false })
  const vk = { a: 0x410000, c: 0x430000, v: 0x560000 }[char]!
  expect(f.send.mock.calls.map(/* 只觀察公開wire欄位。 */ (c) => c[0].keyEvent)).toEqual([
    { controlKey: 4, down: true, press: false, mode: 0, modifiers: [] },
    { chr: vk, down: true, press: false, mode: 2, modifiers: [4] },
    { chr: vk, down: false, press: false, mode: 2, modifiers: [4] },
    { controlKey: 4, down: false, press: false, mode: 0, modifiers: [] },
  ])
  expect(f.issue).not.toHaveBeenCalled()
  f.send.mockClear()
  f.sender.release()
  expect(f.send).not.toHaveBeenCalled()
})
// 暫加Ctrl同樣不能帶self-modifier；text前仍放開已送ledger。
it('uses temporary Windows modifiers and releases hotkeys before semantic text', () => {
  const f = fixture('windows')
  f.receive([{ kind: 'shortcut', char: 'a', down: true, modifiers: ['Control'] }])
  expect(f.send.mock.calls.map((c) => c[0].keyEvent)).toEqual([
    { controlKey: 4, down: true, press: false, mode: 0, modifiers: [] },
    { chr: 0x410000, down: true, press: false, mode: 2, modifiers: [4] },
    { controlKey: 4, down: false, press: false, mode: 0, modifiers: [] },
  ])
  f.receive([
    { kind: 'shortcut', char: 'a', down: false, modifiers: [] },
    { kind: 'key', key: 'Control', down: true, modifiers: [] },
  ])
  f.send.mockClear()
  f.receive([{ kind: 'text', text: '中文', modifiers: [] }])
  expect(f.send.mock.calls.map((c) => c[0].keyEvent)).toEqual([
    { controlKey: 4, down: false, press: false, mode: 0, modifiers: [] },
    { seq: '中文', down: true, press: false, mode: 0, modifiers: [] },
  ])
  f.send.mockClear()
  f.sender.release()
  expect(f.send).not.toHaveBeenCalled()
})
// 整批預驗格式與額度，不先送第一筆再發現後續非法。
it('prevalidates full batches and bounds bytes, count and held ledger', () => {
  const f = fixture()
  expect(() =>
    f.receive([
      { kind: 'move', x: 1, y: 2 },
      { kind: 'move', x: -1, y: 2 },
    ]),
  ).toThrow('protocol_error')
  expect(f.send).not.toHaveBeenCalled()
  expect(() => f.receive(Array.from({ length: 17 }, () => ({ kind: 'move', x: 1, y: 2 })))).toThrow(
    'protocol_error',
  )
  expect(() =>
    f.receive(
      Array.from({ length: 3 }, () => ({ kind: 'text', text: 'a'.repeat(4096), modifiers: [] })),
    ),
  ).toThrow('protocol_error')
  expect(f.send).not.toHaveBeenCalled()
  const held: InputIntent[] = CONTROL_NAMES.map((key) => ({
    kind: 'key',
    key,
    down: true,
    modifiers: [],
  }))
  for (let i = 0; i < held.length; i += 16) f.receive(held.slice(i, i + 16))
  for (let i = 0; i < 64 - held.length; i++)
    f.receive([{ kind: 'shortcut', char: String.fromCharCode(65 + i), down: true, modifiers: [] }])
  f.send.mockClear()
  expect(() =>
    f.receive([
      { kind: 'move', x: 1, y: 2 },
      { kind: 'shortcut', char: 'z', down: true, modifiers: [] },
    ]),
  ).toThrow('input_backpressure')
  expect(f.send).not.toHaveBeenCalled()
})
// 操作文字超額可恢復，但已經開始送半批的 sender 故障不能當可恢復文字錯誤。
it('returns dropped credit for unsupported input but propagates partial send failure', () => {
  const f = fixture()
  f.receive([
    { kind: 'move', x: 1, y: 2 },
    { kind: 'text', text: 'a'.repeat(4097), modifiers: [] },
  ])
  expect(f.send).not.toHaveBeenCalled()
  expect(f.issue).toHaveBeenCalledWith('input_text_too_large')
  expect(f.ack).toHaveBeenLastCalledWith(expect.objectContaining({ sent: false }))
  f.send.mockImplementationOnce(() => {
    throw new Error('connection_failed')
  })
  expect(() => f.receive([{ kind: 'key', key: 'Return', down: true, modifiers: [] }])).toThrow(
    'connection_failed',
  )
  expect(f.ack).toHaveBeenCalledOnce()
})
// 精確 tag 不能 replay 或使用非整數；dispose 後不回 ACK。
it('rejects duplicate or unsafe tags and ignores disposed revisions', () => {
  const f = fixture()
  const batch = {
    revision: 4,
    input_generation: f.states.at(-1)!.input_generation,
    batch_id: 1,
    events: [{ kind: 'move', x: 1, y: 2 } as InputIntent],
  }
  f.sender.receive(batch)
  expect(() => f.sender.receive(batch)).toThrow('protocol_error')
  expect(() => f.sender.receive({ ...batch, batch_id: 1.5 })).toThrow('protocol_error')
  expect(() => f.sender.receive({ ...batch, batch_id: 2, input_generation: NaN })).toThrow(
    'protocol_error',
  )
  f.sender.receive({ ...batch, revision: 3, batch_id: 2 })
  expect(f.ack).toHaveBeenCalledOnce()
  f.sender.dispose()
  f.sender.receive({ ...batch, batch_id: 2 })
  expect(f.ack).toHaveBeenCalledOnce()
})
// SAS 不入 ledger，只在已驗 platform／capability／keyboard gate 下單次送出。
it('gates SAS in the Worker and never synthesizes its keyup', () => {
  const f = fixture('windows')
  f.receive([{ kind: 'sas' }])
  expect(f.send).not.toHaveBeenCalled()
  expect(f.issue).toHaveBeenCalledWith('input_unsupported')
  f.sender.setPeer({ ...meta, platform: 'windows', sas: true })
  f.receive([{ kind: 'sas' }])
  expect(f.send).toHaveBeenCalledExactlyOnceWith({
    keyEvent: { controlKey: 100, down: true, press: false, mode: 0 },
  })
  f.sender.release()
  expect(f.send).toHaveBeenCalledOnce()
})
