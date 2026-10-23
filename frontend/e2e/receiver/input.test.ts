import { expect, it } from 'vitest'
import { binding, receiverApi } from './test-fixtures'
import { publicReceiverText } from './contract.ts'

// 手寫pinned事件序列；不以sender encoder或既有分類器產生期望。
const expected = publicReceiverText(binding())
const CONTROL = 4,
  CAPS_LOCK = 3,
  NUM_LOCK = 63,
  A_KEY = 65 * 65536,
  LEGACY = 0,
  TRANSLATE = 2

type Message = {
  union: string
  keyEvent?: Record<string, unknown>
  mouseEvent?: Record<string, unknown>
}

// 鍵事件固定press=false；每個案只覆寫要驗證的欄位。
function key(value: Record<string, unknown>): Message {
  return {
    union: 'keyEvent',
    keyEvent: { down: false, press: false, mode: LEGACY, modifiers: [], ...value },
  }
}

// 公開surface固定(20,30)；mask只用手寫0／9／10，不呼叫正式input codec。
function mouse(value: Record<string, unknown> = {}): Message {
  return {
    union: 'mouseEvent',
    mouseEvent: { mask: 0, x: 20, y: 30, modifiers: [], ...value },
  }
}

// 五鍵固定順序：Ctrl down→Translate A down→A up→Ctrl up→一次Legacy Seq。
function sequence(text = expected): Message[] {
  return [
    key({ controlKey: CONTROL, down: true }),
    key({ chr: A_KEY, down: true, mode: TRANSLATE, modifiers: [CONTROL] }),
    key({ chr: A_KEY, down: false, mode: TRANSLATE, modifiers: [CONTROL] }),
    key({ controlKey: CONTROL, down: false }),
    key({ seq: text, down: true }),
  ]
}

// 可控制單調時鐘，讓4999／5000邊界與回退能確定性命中。
async function fixture(start = 0) {
  const c = (await receiverApi('input')) as typeof import('./input')
  let value = start,
    fail = false
  return {
    input: c.createReceiverInput(binding(), () => (fail ? Number.NaN : value)),
    advance(ms: number) {
      value += ms
    },
    set(next: number) {
      value = next
    },
    breakClock() {
      fail = true
    },
  }
}

// 投影必須只有固定九欄，且不得帶出原文、長度或run值。
const SNAPSHOT_KEYS = [
  'received',
  'parsed',
  'textSingle',
  'textExact',
  'sequenceComplete',
  'sequenceValid',
  'windowComplete',
  'overflow',
  'unavailable',
]

// 正向案：Ctrl前click、精確五鍵、獨立5000ms窗及固定snapshot形狀。
it('accepts a pre-key click then the exact five-key sequence after 5000ms', async () => {
  const f = await fixture()
  for (const message of [mouse(), mouse({ mask: 9 }), mouse({ mask: 10 }), ...sequence()])
    f.input.record(message)
  f.advance(4999)
  expect(f.input.snapshot()).toEqual({
    received: true,
    parsed: true,
    textSingle: true,
    textExact: true,
    sequenceComplete: true,
    sequenceValid: true,
    windowComplete: false,
    overflow: false,
    unavailable: false,
  })
  f.advance(1)
  expect(f.input.snapshot()).toMatchObject({ windowComplete: true })
  expect(Object.keys(f.input.snapshot()).sort()).toEqual([...SNAPSHOT_KEYS].sort())
  expect(JSON.stringify(f.input.snapshot())).not.toContain('Public')
})

// CapsLock／NumLock是唯一允許的附帶lock，且不得改變五鍵語意。
it('allows CapsLock and NumLock as passive locks on the five keys', async () => {
  const f = await fixture()
  const [ctrlDown, aDown, aUp, ctrlUp, seq] = sequence()
  for (const message of [
    { ...ctrlDown!, keyEvent: { ...ctrlDown!.keyEvent!, modifiers: [CAPS_LOCK, NUM_LOCK] } },
    {
      ...aDown!,
      keyEvent: { ...aDown!.keyEvent!, modifiers: [CONTROL, CAPS_LOCK, NUM_LOCK] },
    },
    {
      ...aUp!,
      keyEvent: { ...aUp!.keyEvent!, modifiers: [CONTROL, NUM_LOCK] },
    },
    {
      ...ctrlUp!,
      keyEvent: { ...ctrlUp!.keyEvent!, modifiers: [CAPS_LOCK] },
    },
    seq!,
  ])
    f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    textSingle: true,
    textExact: true,
    sequenceComplete: true,
    sequenceValid: true,
    windowComplete: true,
    unavailable: false,
  })
})

// 錯字／缺字／前後空白都不得trim或normalize成成功。
it.each([
  ['missing last character', expected.slice(0, -1)],
  ['extra character', expected + 'x'],
  ['trailing space', expected + ' '],
  ['leading space', ' ' + expected],
  ['different Chinese glyph', expected.replace('中', '台')],
])('marks %s as a complete but invalid sequence', async (_name, text) => {
  const f = await fixture()
  for (const message of sequence(text)) f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    received: true,
    parsed: true,
    textSingle: true,
    textExact: false,
    sequenceComplete: true,
    sequenceValid: false,
    windowComplete: true,
    overflow: false,
    unavailable: false,
  })
})

// 五類訊息都收到但順序錯仍是完整證據；不得因後續正確重送而恢復。
it('keeps a complete out-of-order sequence invalid and never recovers', async () => {
  const f = await fixture()
  const [ctrlDown, aDown, aUp, ctrlUp, seq] = sequence()
  for (const message of [seq!, ctrlDown!, aDown!, aUp!, ctrlUp!]) f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    textSingle: true,
    textExact: true,
    sequenceComplete: true,
    sequenceValid: false,
    windowComplete: true,
    unavailable: false,
  })
  for (const message of sequence()) f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    textSingle: false,
    sequenceComplete: true,
    sequenceValid: false,
    unavailable: false,
  })
})

// 任一鍵的mode／modifier／down方向錯誤都毒化結果，即使五類都出現。
it.each([
  ['Ctrl down mode', 0, { mode: TRANSLATE }, true],
  ['A down mode', 1, { mode: LEGACY }, true],
  ['A up without Control', 2, { modifiers: [] }, true],
  ['Ctrl up carrying Control', 3, { modifiers: [CONTROL] }, true],
  ['Seq carrying a modifier', 4, { modifiers: [CAPS_LOCK] }, true],
  ['A down with Alt', 1, { modifiers: [CONTROL, 1] }, true],
  ['Ctrl down with Alt', 0, { modifiers: [1] }, true],
  ['Ctrl down declaring itself', 0, { modifiers: [CONTROL] }, true],
  ['wrong down direction', 0, { down: false }, false],
  ['wrong press flag', 0, { press: true }, true],
])('marks %s as invalid without recovering', async (_name, index, change, complete) => {
  const f = await fixture()
  const messages = sequence().map(
    /* 只改指定索引，維持其餘四鍵固定。 */ (message, i) =>
      i === index ? { ...message, keyEvent: { ...message.keyEvent!, ...change } } : message,
  )
  for (const message of messages) f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    sequenceComplete: complete,
    sequenceValid: false,
    windowComplete: complete,
    unavailable: false,
  })
})

// 五鍵前的click只允許固定座標及left down/up；五鍵開始後不得再混入mouse。
it.each([
  ['wrong x', 0, { x: 21 }],
  ['wrong y', 0, { y: 31 }],
  ['unsupported mask', 0, { mask: 1 }],
  ['wheel mask', 0, { mask: 3 }],
  ['carrying Control', 0, { modifiers: [CONTROL] }],
  ['up before down', 1, { mask: 10 }],
])('poisons the sequence on %s', async (_name, index, change) => {
  const f = await fixture()
  const messages = index === 0 ? [mouse(change)] : [mouse(), mouse(change), mouse({ mask: 10 })]
  for (const message of [...messages, ...sequence()]) f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    sequenceComplete: true,
    sequenceValid: false,
    windowComplete: true,
  })
})

// 五鍵完成後的晚到mouse及鍵間mouse都屬額外輸入，不得忽略。
it.each(['between keys', 'after sequence'])('rejects mouse %s', async (position) => {
  const f = await fixture()
  const messages = sequence()
  if (position === 'between keys') messages.splice(2, 0, mouse())
  for (const message of messages) f.input.record(message)
  if (position === 'after sequence') f.input.record(mouse())
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    sequenceComplete: true,
    sequenceValid: false,
    windowComplete: true,
  })
})

// 第二個Seq使textSingle／textExact永久false，即使第一筆完全正確。
it('rejects a duplicate Seq without overwriting the first result', async () => {
  const f = await fixture()
  for (const message of [...sequence(), key({ seq: expected, down: true })]) f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    textSingle: false,
    textExact: false,
    sequenceComplete: true,
    sequenceValid: false,
    windowComplete: true,
  })
})

// 缺任一鍵不得宣稱完整；dispose後仍未完成只能unavailable，晚到不得補成成功。
it('keeps an incomplete sequence unavailable and ignores late messages', async () => {
  const f = await fixture()
  for (const message of sequence().slice(0, 4)) f.input.record(message)
  expect(f.input.snapshot()).toMatchObject({
    sequenceComplete: false,
    sequenceValid: false,
    windowComplete: false,
    unavailable: false,
  })
  f.input.dispose()
  expect(f.input.snapshot()).toMatchObject({ unavailable: true })
  for (const message of sequence()) f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    sequenceComplete: false,
    sequenceValid: false,
    windowComplete: false,
    unavailable: true,
  })
})

// 使用者輸入最多64；第65個立即overflow並停止，不截斷成成功。
it('accepts 64 inputs and rejects the 65th as overflow', async () => {
  const exact = await fixture()
  for (let i = 0; i < 59; i++) exact.input.record(mouse())
  for (const message of sequence()) exact.input.record(message)
  exact.advance(5000)
  expect(exact.input.snapshot()).toMatchObject({
    sequenceComplete: true,
    sequenceValid: true,
    overflow: false,
    unavailable: false,
  })
  const over = await fixture()
  for (let i = 0; i < 60; i++) over.input.record(mouse())
  for (const message of sequence()) over.input.record(message)
  over.advance(5000)
  expect(over.input.snapshot()).toMatchObject({
    sequenceComplete: false,
    sequenceValid: false,
    overflow: true,
    unavailable: true,
    windowComplete: false,
  })
})

// 時鐘回退或非有限值不得完成觀察窗；已完成的正向也不能保留。
it('rejects clock rollback and non-finite time', async () => {
  const rollback = await fixture()
  for (const message of [...sequence()]) rollback.input.record(message)
  rollback.advance(6000)
  expect(rollback.input.snapshot()).toMatchObject({ windowComplete: true })
  rollback.set(1)
  expect(rollback.input.snapshot()).toMatchObject({
    windowComplete: false,
    unavailable: true,
  })
  const broken = await fixture()
  for (const message of [...sequence()]) broken.input.record(message)
  broken.breakClock()
  expect(broken.input.snapshot()).toMatchObject({
    windowComplete: false,
    unavailable: true,
  })
})

// 非法／未知／不唯一訊息立即unavailable，後續合法五鍵不得恢復。
it.each([
  ['null', null],
  ['array', []],
  ['missing union', {}],
  ['unknown union', { union: 'videoAck', videoAck: {} }],
  [
    'duplicate oneof',
    {
      union: 'keyEvent',
      keyEvent: {
        controlKey: CONTROL,
        seq: expected,
        down: true,
        press: false,
        mode: LEGACY,
        modifiers: [],
      },
    },
  ],
  ['NUL in Seq', key({ seq: 'a\0b', down: true })],
  ['lone high surrogate', key({ seq: 'a\uD800', down: true })],
  ['lone low surrogate', key({ seq: '\uDC00a', down: true })],
  ['oversized Seq', key({ seq: 'a'.repeat(4097), down: true })],
  ['non-string Seq', key({ seq: 7, down: true })],
  [
    'duplicate modifiers',
    key({ controlKey: CONTROL, down: true, modifiers: [CAPS_LOCK, CAPS_LOCK] }),
  ],
  ['unknown modifier', key({ controlKey: CONTROL, down: true, modifiers: [5] })],
  ['non-boolean down', key({ controlKey: CONTROL, down: 1 })],
  ['unknown mode', key({ controlKey: CONTROL, down: true, mode: 9 })],
  ['floating mouse x', mouse({ x: 20.5 })],
])('rejects malformed %s before any success', async (_name, message) => {
  const f = await fixture()
  f.input.record(message)
  expect(f.input.snapshot()).toMatchObject({
    parsed: false,
    sequenceValid: false,
    unavailable: true,
  })
  for (const valid of sequence()) f.input.record(valid)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({
    sequenceComplete: false,
    sequenceValid: false,
    unavailable: true,
  })
})

// dispose已完成的正向結果不被晚到事件翻轉，也不保留可變文字。
it('freezes a completed result on dispose', async () => {
  const f = await fixture()
  for (const message of [...sequence()]) f.input.record(message)
  f.advance(5000)
  expect(f.input.snapshot()).toMatchObject({ sequenceValid: true, windowComplete: true })
  f.input.dispose()
  f.input.record(key({ seq: 'late', down: true }))
  expect(f.input.snapshot()).toMatchObject({
    textSingle: true,
    textExact: true,
    sequenceComplete: true,
    sequenceValid: true,
    windowComplete: true,
    unavailable: false,
  })
})
