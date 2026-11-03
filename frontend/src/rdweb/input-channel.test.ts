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
// Windows控速fixture：可控clock與手動排程，驗切片、間隔與取消；platform可改linux對照。
function pacedFixture(gap = 20, platform: InputState['platform'] = 'windows') {
  let time = 0
  const batches: InputBatch[] = [],
    release = vi.fn(),
    fail = vi.fn(),
    issue = vi.fn()
  const wakes: { wake: () => void; ms: number; cancelled: boolean }[] = []
  const c = new InputChannel(
    (b) => batches.push(b),
    release,
    fail,
    () => time,
    {
      textGapMs: gap,
      issue,
      schedule: /* 只記錄排程，由測試決定何時喚醒。 */ (wake, ms) => {
        const entry = { wake, ms, cancelled: false }
        wakes.push(entry)
        return () => {
          entry.cancelled = true
        }
      },
    },
  )
  c.setState({ ...state, platform })
  c.focus()
  return {
    c,
    batches,
    fail,
    issue,
    wakes,
    // 回覆第i批的matching ACK。
    ack: (i: number, sent = true) => c.ack({ ...batches[i]!, sent }),
    // 喚醒最新且未取消的排程。
    fire: () => {
      const entry = wakes.at(-1)
      if (entry && !entry.cancelled) entry.wake()
    },
    advance: (n: number) => {
      time = n
    },
  }
}
// 只取各批文字或kind，方便比對切片順序。
function texts(batches: InputBatch[]): string[][] {
  return batches.map((b) => b.events.map((e) => (e.kind === 'text' ? e.text : e.kind)))
}
// 建立帶NumLock的公開文字intent。
const text = (value: string): InputIntent => ({ kind: 'text', text: value, modifiers: ['NumLock'] })
// 每片一個code point、單獨成批；ACK後須等間隔到期才送下一片。
it('paces windows text one code point per batch after each ACK and gap', () => {
  const f = pacedFixture()
  f.c.enqueue(text('ab中'))
  expect(f.batches[0]!.events).toEqual([{ kind: 'text', text: 'a', modifiers: ['NumLock'] }])
  f.ack(0)
  expect(f.batches).toHaveLength(1)
  expect(f.wakes).toHaveLength(1)
  expect(f.wakes[0]!.ms).toBe(20)
  f.advance(20)
  f.fire()
  f.ack(1)
  f.advance(40)
  f.fire()
  f.ack(2)
  expect(texts(f.batches)).toEqual([['a'], ['b'], ['中']])
  expect(f.c.count).toBe(0)
  expect(f.c.bytes).toBe(0)
})
// 代理對是同一個code point，不得拆成兩片。
it('keeps surrogate pairs in one slice', () => {
  const f = pacedFixture()
  f.c.enqueue(text('a😀'))
  f.ack(0)
  f.advance(20)
  f.fire()
  expect(texts(f.batches)).toEqual([['a'], ['😀']])
})
// 最後一片後的非文字事件同樣等間隔，且不與文字合批。
it('waits the text gap before any following event', () => {
  const f = pacedFixture()
  f.c.enqueue(text('ab'))
  f.c.enqueue(key)
  f.ack(0)
  f.advance(20)
  f.fire()
  f.ack(1)
  f.advance(39)
  f.c.tick()
  expect(texts(f.batches)).toEqual([['a'], ['b']])
  f.advance(40)
  f.fire()
  expect(texts(f.batches)).toEqual([['a'], ['b'], ['key']])
})
// timer被延後很久後恢復，每次喚醒仍只送一片，不補送連發。
it('sends at most one slice per wake after a long timer delay', () => {
  const f = pacedFixture()
  f.c.enqueue(text('abcd'))
  for (let i = 0; i < 3; i++) {
    f.ack(i)
    f.advance((i + 1) * 5000)
    f.fire()
    expect(f.batches).toHaveLength(i + 2)
  }
})
// 某片未送出即丟棄同段剩餘文字；之後事件照常送。
it('drops the remaining text when a slice is not sent', () => {
  const f = pacedFixture()
  f.c.enqueue(text('abc'))
  f.ack(0, false)
  expect(f.c.count).toBe(0)
  expect(f.c.bytes).toBe(0)
  f.c.enqueue(key)
  f.advance(20)
  f.fire()
  f.c.tick()
  expect(texts(f.batches)).toEqual([['a'], ['key']])
})
// 失焦、世代變更、dispose都清剩餘文字與timer，且不提示。
it.each(['blur', 'state', 'dispose'] as const)(
  'clears remaining text and timer on blur, state change and dispose: %s',
  (mode) => {
    const f = pacedFixture()
    f.c.enqueue(text('abc'))
    f.ack(0)
    expect(f.wakes).toHaveLength(1)
    if (mode === 'blur') f.c.blur()
    if (mode === 'state') f.c.setState({ ...state, platform: 'windows', input_generation: 2 })
    if (mode === 'dispose') f.c.dispose()
    expect(f.wakes[0]!.cancelled).toBe(true)
    f.advance(100)
    f.ack(0)
    f.fire()
    f.c.tick()
    expect(f.batches).toHaveLength(1)
    expect(f.c.count).toBe(0)
    expect(f.issue).not.toHaveBeenCalled()
  },
)
// 待送文字整段仍算一個pending，bytes隨送出片遞減。
it('keeps pending count at one and bytes decreasing per slice', () => {
  const f = pacedFixture()
  f.c.enqueue(key)
  f.c.enqueue(text('中文'))
  expect(f.c.count).toBe(1)
  expect(f.c.bytes).toBe(6)
  f.ack(0)
  expect(f.c.count).toBe(1)
  expect(f.c.bytes).toBe(3)
  f.ack(1)
  f.advance(20)
  f.fire()
  expect(f.c.count).toBe(0)
  expect(f.c.bytes).toBe(0)
})
// linux維持整段文字一批，且從不排程。
it('leaves linux batching unchanged', () => {
  const f = pacedFixture(20, 'linux')
  f.c.enqueue(text('ab'))
  f.c.enqueue(key)
  f.ack(0)
  expect(texts(f.batches)).toEqual([['ab'], ['key']])
  expect(f.wakes).toHaveLength(0)
})
// 送出第一片後補滿佇列到64（剩餘文字算1筆）。
function fillDuringPacing(f: ReturnType<typeof pacedFixture>, value = 'abc'): void {
  f.c.enqueue(text(value))
  while (f.c.count < 64) f.c.enqueue(key)
}
// 逐步ACK／推進時間／喚醒，直到佇列清空；回傳結束時間。
function drain(f: ReturnType<typeof pacedFixture>, start = 0): number {
  let time = start
  for (let guard = 0; guard < 200 && (f.c.count || f.c.inflight); guard++) {
    if (f.c.inflight) f.ack(f.batches.length - 1)
    time += 20
    f.advance(time)
    f.fire()
    f.c.tick()
  }
  if (f.c.inflight) f.ack(f.batches.length - 1)
  return time
}
// 控速中佇列滿：拒收並提示，連線不終止，文字照常送完。
it('rejects new input with input_text_busy when the queue is full during windows pacing', () => {
  const f = pacedFixture()
  fillDuringPacing(f)
  f.c.enqueue(key)
  expect(f.issue).toHaveBeenCalledExactlyOnceWith('input_text_busy')
  expect(f.fail).not.toHaveBeenCalled()
  expect(f.c.count).toBe(64)
  drain(f)
  expect(texts(f.batches).slice(0, 3)).toEqual([['a'], ['b'], ['c']])
  expect(f.fail).not.toHaveBeenCalled()
})
// 同一段控速只提示一次；下一段控速再次拒收時才再提示。
it('issues the busy hint once per pacing run', () => {
  const f = pacedFixture()
  fillDuringPacing(f)
  for (let i = 0; i < 3; i++) f.c.enqueue(key)
  expect(f.issue).toHaveBeenCalledTimes(1)
  const time = drain(f)
  fillDuringPacing(f, 'xy')
  f.c.enqueue(key)
  expect(f.issue).toHaveBeenCalledTimes(2)
  drain(f, time)
})
// 佇列未滿時，短字詞後的輸入照順序排隊，不提示也不遺失。
it('queues ordinary input behind a short paced text without a busy hint', () => {
  const f = pacedFixture()
  f.c.enqueue(text('中文'))
  for (let i = 0; i < 5; i++) {
    f.c.enqueue(key)
    f.c.enqueue({ ...key, down: false })
  }
  drain(f)
  expect(f.issue).not.toHaveBeenCalled()
  const flat = texts(f.batches).flat()
  expect(flat.slice(0, 2)).toEqual(['中', '文'])
  expect(flat.slice(2)).toEqual(Array(10).fill('key'))
})
// Windows但沒有控速文字時，溢位仍是既有致命處理。
it('still fails fatally on overflow without pacing', () => {
  const f = pacedFixture()
  f.c.enqueue(key)
  for (let i = 0; i < 64; i++) f.c.enqueue(key)
  expect(f.fail).not.toHaveBeenCalled()
  f.c.enqueue(key)
  expect(f.fail).toHaveBeenCalledExactlyOnceWith('input_backpressure')
  expect(f.issue).not.toHaveBeenCalled()
})
const shift: InputIntent = { kind: 'key', key: 'Shift', down: true, modifiers: ['Shift'] }
// 放開事件不可丟：按下仍在佇列時兩者一併移除，遠端不會卡鍵。
it('removes a queued down with its rejected up instead of leaving a stuck key', () => {
  const f = pacedFixture()
  f.c.enqueue(text('abc'))
  while (f.c.count < 63) f.c.enqueue(key)
  f.c.enqueue(shift)
  expect(f.c.count).toBe(64)
  f.c.enqueue({ ...shift, down: false, modifiers: [] })
  expect(f.fail).not.toHaveBeenCalled()
  expect(f.c.count).toBe(63)
  drain(f)
  expect(
    f.batches.flatMap((b) => b.events).some((e) => e.kind === 'key' && e.key === 'Shift'),
  ).toBe(false)
})
// 按下已送出而放開排不進去時，沿用既有致命處理（不新增放寬）。
it('fails fatally when the up of an already sent down cannot be queued', () => {
  const f = pacedFixture()
  f.c.enqueue(shift)
  f.ack(0)
  fillDuringPacing(f)
  f.c.enqueue({ ...shift, down: false, modifiers: [] })
  expect(f.fail).toHaveBeenCalledExactlyOnceWith('input_backpressure')
})
// 控速中佇列滿時hover move靜默捨棄，不提示也不終止。
it('drops hover moves silently while paced queue is full', () => {
  const f = pacedFixture()
  fillDuringPacing(f)
  f.c.enqueue({ kind: 'move', x: 1, y: 1 })
  expect(f.issue).not.toHaveBeenCalled()
  expect(f.fail).not.toHaveBeenCalled()
})
// 未指定間隔時，Windows預設使用INTERACTION_LIMITS.textGapMs控速。
it('uses INTERACTION_LIMITS.textGapMs by default on windows', () => {
  const batches: InputBatch[] = []
  const waits: number[] = []
  const c = new InputChannel(
    (b) => batches.push(b),
    vi.fn(),
    vi.fn(),
    () => 0,
    {
      schedule: /* 只記錄等待毫秒。 */ (_wake, ms) => {
        waits.push(ms)
        return () => undefined
      },
    },
  )
  c.setState({ ...state, platform: 'windows' })
  c.focus()
  c.enqueue(text('ab'))
  c.ack({ ...batches[0]!, sent: true })
  expect(texts(batches)).toEqual([['a']])
  expect(waits).toEqual([20])
})
const escape: InputIntent = { kind: 'key', key: 'Escape', down: true, modifiers: [] }
const leftDown: InputIntent = {
  kind: 'button',
  x: 1,
  y: 1,
  button: 'left',
  down: true,
  modifiers: [],
}
// 按下已被拒收時，其放開排不進去也不得終止連線（遠端沒有這個按下）。
it.each([
  ['key', escape],
  ['button', leftDown],
] as const)(
  'does not end the session when the up of a rejected %s down cannot be queued',
  (_n, down) => {
    const f = pacedFixture()
    fillDuringPacing(f)
    f.c.enqueue(down)
    expect(f.issue).toHaveBeenCalledExactlyOnceWith('input_text_busy')
    f.c.enqueue({ ...down, down: false } as InputIntent)
    expect(f.fail).not.toHaveBeenCalled()
    expect(f.c.count).toBe(64)
  },
)
// 只移除尚未配對放開的按下；佇列中已完整的一組按鍵不得被拆成孤立放開。
it('removes only an unpaired queued down', () => {
  const f = pacedFixture()
  f.c.enqueue(text('abc'))
  f.c.enqueue(escape)
  f.c.enqueue({ ...escape, down: false })
  while (f.c.count < 64) f.c.enqueue(key)
  f.c.enqueue(escape)
  f.c.enqueue({ ...escape, down: false })
  expect(f.fail).not.toHaveBeenCalled()
  drain(f)
  const sent = f.batches
    .flatMap((b) => b.events)
    .filter((e) => e.kind === 'key' && e.key === 'Escape')
    .map((e) => (e as Extract<InputIntent, { kind: 'key' }>).down)
  expect(sent).toEqual([true, false])
})
// 已送出的按下即使佇列有重複按下，放開排不進去仍走致命，不能拆掉重複按下而留遠端卡鍵。
it('keeps the fatal path for a sent down even when a repeat down is queued', () => {
  const f = pacedFixture()
  f.c.enqueue(shift)
  f.ack(0)
  f.c.enqueue(text('abc'))
  f.c.enqueue(shift)
  while (f.c.count < 64) f.c.enqueue(key)
  f.c.enqueue({ ...shift, down: false, modifiers: [] })
  expect(f.fail).toHaveBeenCalledExactlyOnceWith('input_backpressure')
})
// 失焦清掉控速文字後，Ctrl+Alt+Del不再被殘留間隔卡住。
it('allows SAS right after blur once paced text is cleared', () => {
  const f = pacedFixture()
  f.c.setState({ ...state, platform: 'windows', sas: true })
  f.c.focus()
  f.c.enqueue(text('ab'))
  f.ack(0)
  f.c.blur()
  expect(f.c.commandSas()).toBe(true)
  expect(texts(f.batches).at(-1)).toEqual(['sas'])
})
// 文字間隔尚未到期時SAS回報忙碌且不留在佇列。
it('refuses SAS during the text gap without leaving it queued', () => {
  const f = pacedFixture()
  f.c.setState({ ...state, platform: 'windows', sas: true })
  f.c.focus()
  f.c.enqueue(text('a'))
  f.ack(0)
  expect(f.c.commandSas()).toBe(false)
  expect(f.c.count).toBe(0)
})
// 失焦後舊片的sent:false不得把重新取焦後的新文字當成同段剩餘片丟掉。
it('does not drop new text when a stale slice is refused after refocus', () => {
  const f = pacedFixture()
  f.c.enqueue(text('abc'))
  f.c.blur()
  f.c.focus()
  f.c.enqueue(text('xy'))
  f.ack(0, false)
  expect(texts(f.batches)).toEqual([['a'], ['x']])
})

// hover 30Hz：前一筆 move 送出後 33ms 內即使已有 credit 也不送下一筆，滿 1000/30ms 才送。
it('holds the next hover move until the thirty hertz interval elapses', () => {
  const { c, batches, advance } = fixture()
  c.enqueue({ kind: 'move', x: 1, y: 1 })
  c.ack({ ...batches[0]!, sent: true })
  advance(33)
  c.enqueue({ kind: 'move', x: 2, y: 1 })
  c.tick()
  expect(batches).toHaveLength(1)
  // fixture 的 advance 設定絕對時間。
  advance(34)
  c.tick()
  expect(batches).toHaveLength(2)
  expect((batches[1]!.events[0] as Extract<InputIntent, { kind: 'move' }>).x).toBe(2)
})
