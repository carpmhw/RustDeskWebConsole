import { afterEach, expect, it, vi } from 'vitest'
import { encodeMessage } from './codec'
import { observeEncodedInput, type EncodedInputSnapshot } from './encoded-input-observer'
import {
  installWorkerEncodedInputDiagnostics,
  type EncodedWorkerScope,
  type PreEncryptInputEvidence,
  type PreEncryptInputCapture,
} from '../../e2e-real/encoded-input-diagnostics'

const enums = { control: 4, capsLock: 3, numLock: 63, legacy: 0, translate: 2 }
const sample = 'Public 中文 RdWeb'
// 數字期望由pinned wire另核，避免使用被測encoder生成兩側oracle。
function key(
  union: string,
  value: number | string,
  down: boolean,
  control = false,
): EncodedInputSnapshot {
  return {
    kind: 'key',
    union,
    mode: union === 'chr' ? 2 : 0,
    down,
    press: false,
    controlKey: union === 'controlKey' ? (value as number) : 0,
    chr: union === 'chr' ? (value as number) : 0,
    seq: union === 'seq' ? (value as string) : '',
    modifiers: control ? [4] : [],
  }
}
// 四個明確edge，而不是以A down或單一ACK代替完整chord。
function chord(letter: number): EncodedInputSnapshot[] {
  return [
    key('controlKey', 4, true),
    key('chr', letter * 65536, true, true),
    key('chr', letter * 65536, false, true),
    key('controlKey', 4, false),
  ]
}
// 只使用public sequence；文字與按鍵不存入診斷輸出。
function sequence(): EncodedInputSnapshot[] {
  return [...chord(65), key('seq', sample, true), ...chord(65), ...chord(67)]
}
// 自有EventTarget代替Worker控制transport；觀察器本體仍是真安裝函數。
function fixture(expected = sample, captureText = false) {
  const target = new EventTarget() as EventTarget & EncodedWorkerScope
  vi.stubGlobal('self', target)
  target.addEventListener(
    'message',
    /* NodeEventTarget沒有原生onmessage屬性，僅配送同一event。 */ (event) =>
      target.onmessage?.call(target, event as MessageEvent),
  )
  installWorkerEncodedInputDiagnostics(enums)
  const posted: PreEncryptInputEvidence[] = []
  const captured: PreEncryptInputCapture[] = []
  const port = {
    postMessage: /* 新原子capture與舊十boolean分開驗，未知原文不保存。 */ (
      value: PreEncryptInputEvidence | PreEncryptInputCapture,
    ) => {
      if ('preEncryptInput' in value) captured.push(value)
      else posted.push(value)
    },
    close: vi.fn(),
  }
  // 固定診斷控制不携帶security DTO。
  const control = (action: string, scope = 1, publicExpected = expected): void => {
    const event = new Event('message')
    Object.defineProperties(event, {
      data: {
        value: {
          type: 'rdweb-encoded-input-diagnostic',
          action,
          scope,
          ...(action === 'begin'
            ? { expected: publicExpected, ...(captureText ? { captureText: true } : {}) }
            : {}),
        },
      },
      ports: { value: action === 'begin' ? [port] : [] },
    })
    target.dispatchEvent(event)
  }
  control('begin')
  const listener = target.onmessage!.bind(target)
  return {
    observer: target.__rdwebEncodedInputObserver!,
    control,
    posted,
    captured,
    port,
    listener,
  }
}
// 只恢復本測試擁有的scope。
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// 缺少實際encode後接點時本案必須RED，callback不得拿到原bytes。
it('decodes actual protobuf into independent input-only primitives', () => {
  const bytes = encodeMessage({ keyEvent: { seq: sample, down: true, mode: 0 } })
  const original = new Uint8Array(bytes),
    rows: EncodedInputSnapshot[] = []
  observeEncodedInput(bytes, {
    record: /* 只在測試RAM校準DTO。 */ (value) => rows.push(value),
    unavailable: vi.fn(),
  })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    kind: 'key',
    union: 'seq',
    seq: sample,
    down: true,
    press: false,
    mode: 0,
  })
  expect(bytes).toEqual(original)
})
// 13個鍵訊息必須完整；normal chord外mouse不假判順序錯誤。
it('reports the complete encoded sequence using only ten booleans', () => {
  const f = fixture()
  for (const value of sequence()) f.observer.record(value)
  f.control('take')
  expect(f.posted[0]).toEqual({
    observed: true,
    textExact: true,
    textSingle: true,
    initialSelectComplete: true,
    receiveSelectComplete: true,
    receiveCopyComplete: true,
    sequenceComplete: true,
    sequenceInvalid: false,
    overflow: false,
    unavailable: false,
  })
  expect(JSON.stringify(f.posted)).not.toContain(sample)
})
// 若以expected代填、未opt-in就保存、或從Main intent讀值，本組真encode與mutation會失敗。
it('captures the actual encoded seq only with explicit public-text opt-in', () => {
  const f = fixture(sample, true)
  for (const event of sequence()) {
    if (event.kind === 'key' && event.union === 'seq')
      observeEncodedInput(
        encodeMessage({ keyEvent: { seq: sample, down: true, mode: 0 } }),
        f.observer,
      )
    else f.observer.record(event)
  }
  f.control('takeWithText')
  expect(f.captured).toHaveLength(1)
  expect(f.captured[0]?.preEncryptText).toBe('Public 中文 RdWeb')
  expect(f.captured[0]?.preEncryptInput).toMatchObject({
    sequenceComplete: true,
    textExact: true,
    textSingle: true,
  })
  f.control('takeWithText')
  expect(f.captured).toHaveLength(1)
  expect(f.port.close).toHaveBeenCalled()
})
// 未有seq即使先送expected也不能補原文，未知seq完全不出Worker。
it.each(['missing', 'mismatch', 'duplicate', 'overflow', 'fault'])(
  'returns null rather than unknown text for %s capture',
  (mode) => {
    const f = fixture(sample, true),
      events = sequence()
    if (mode === 'missing') events.splice(4, 1)
    if (mode === 'mismatch')
      (events[4] as Extract<EncodedInputSnapshot, { kind: 'key' }>).seq = 'Public unknown'
    if (mode === 'duplicate') events.push(key('seq', sample, true))
    for (const event of events) f.observer.record(event)
    if (mode === 'overflow')
      for (let i = 0; i < 65; i++) f.observer.record({ kind: 'mouse', mask: 0 })
    if (mode === 'fault') f.observer.unavailable()
    f.control('takeWithText')
    expect(f.captured[0]?.preEncryptText).toBeNull()
    expect(JSON.stringify(f.captured)).not.toContain('Public unknown')
  },
)
// 新scope／cancel必清短命seq，舊訊號不能恢復它。
it('clears captured seq on cancel and does not reuse it in a new scope', () => {
  const f = fixture(sample, true)
  for (const event of sequence()) f.observer.record(event)
  f.control('cancel')
  f.control('takeWithText')
  expect(f.captured).toEqual([])
  f.control('begin', 2, 'Public second')
  f.control('takeWithText', 1)
  f.control('takeWithText', 2)
  expect(f.captured[0]?.preEncryptText).toBeNull()
})
// opt-in是獨立條件，舊十boolean consumer仍不能取得文字。
it('preserves legacy take even when text capture was explicitly enabled', () => {
  const f = fixture(sample, true)
  for (const event of sequence()) f.observer.record(event)
  f.control('take')
  expect(Object.keys(f.posted[0] ?? {})).toHaveLength(10)
  expect(f.posted[0]?.textExact).toBe(true)
  expect(f.captured).toEqual([])
  expect(JSON.stringify(f.posted)).not.toContain(sample)
})
// 舊begin沒有capture權限，直接請求新take仍不得回原文。
it('never exposes text through a capture take unless begin explicitly opted in', () => {
  const f = fixture()
  for (const event of sequence()) f.observer.record(event)
  f.control('takeWithText')
  expect(f.captured[0]?.preEncryptText).toBeNull()
  expect(f.captured[0]?.preEncryptInput.textExact).toBe(true)
})
// 只有own captureText=true才授權，prototype欄位不能升成文字紀錄。
it('does not enable text capture through an inherited begin flag', () => {
  const f = fixture()
  f.control('cancel')
  const data = Object.assign(Object.create({ captureText: true }), {
    type: 'rdweb-encoded-input-diagnostic',
    action: 'begin',
    scope: 2,
    expected: sample,
  })
  const message = new Event('message')
  Object.defineProperties(message, { data: { value: data }, ports: { value: [f.port] } })
  f.listener(message as MessageEvent)
  for (const event of sequence()) f.observer.record(event)
  f.control('takeWithText', 2)
  expect(f.captured[0]?.preEncryptText).toBeNull()
})
// 多byte上限以UTF8計算，合法邊界原樣保留而非截斷／normalize。
it('preserves exactly 4096 UTF-8 bytes of verified public text', () => {
  const publicText = 'Public ' + '中'.repeat(1363)
  expect(new TextEncoder().encode(publicText)).toHaveLength(4096)
  const f = fixture(publicText, true)
  for (const event of chord(65)) f.observer.record(event)
  observeEncodedInput(encodeMessage({ keyEvent: { seq: publicText, down: true } }), f.observer)
  f.control('takeWithText')
  expect(f.captured[0]?.preEncryptText).toBe(publicText)
})
// NUL／非法Unicode／超4096 UTF8都不是可保存的公開fixture。
it.each(['Public \0bad', 'Public \uD800', 'Public ' + '中'.repeat(1400)])(
  'rejects an unsafe text-capture expectation: %#',
  (expected) => {
    const f = fixture(expected, true)
    expect(f.posted[0]?.unavailable).toBe(true)
    f.control('takeWithText')
    expect(f.captured).toEqual([])
  },
)
// 兩段嚴格操作間插入遠端點擊不可仍報完整序列。
it.each([
  [4, 'initial select and text'],
  [9, 'receive select and copy'],
])('rejects mouse input between %s edges (%s)', (index) => {
  const f = fixture(),
    events = sequence()
  events.splice(index, 0, { kind: 'mouse', mask: 9 })
  for (const value of events) f.observer.record(value)
  f.control('take')
  expect(f.posted[0]?.sequenceInvalid).toBe(true)
  expect(f.posted[0]?.sequenceComplete).toBe(false)
})
// 接收按鈕後用來點回編輯區的單一mouse action屬於預期操作。
it('allows the explicit focus click between text and the receive chord', () => {
  const f = fixture(),
    events = sequence()
  events.splice(5, 0, { kind: 'mouse', mask: 9 })
  for (const value of events) f.observer.record(value)
  f.control('take')
  expect(f.posted[0]?.sequenceInvalid).toBe(false)
  expect(f.posted[0]?.sequenceComplete).toBe(true)
})
// 改壞wire值而非Main intent，摘要必須抓到缺口。
it.each(['text', 'keyup', 'mode', 'vk', 'modifier', 'duplicate', 'mouse', 'incomplete'])(
  'refuses an encoded sequence with %s mutation',
  /* 各變因只改一個wire邊界。 */ (mutation) => {
    const f = fixture(),
      events = sequence()
    if (mutation === 'text')
      (events[4] as Extract<EncodedInputSnapshot, { kind: 'key' }>).seq = 'Public wrong'
    if (mutation === 'keyup') events.splice(3, 1)
    if (mutation === 'mode') (events[1] as Extract<EncodedInputSnapshot, { kind: 'key' }>).mode = 0
    if (mutation === 'vk') (events[1] as Extract<EncodedInputSnapshot, { kind: 'key' }>).chr = 65
    if (mutation === 'modifier')
      (events[4] as Extract<EncodedInputSnapshot, { kind: 'key' }>).modifiers = [4]
    if (mutation === 'duplicate') events.splice(5, 0, key('seq', sample, true))
    if (mutation === 'mouse') events.splice(2, 0, { kind: 'mouse', mask: 9 })
    if (mutation === 'incomplete') events.pop()
    for (const value of events) f.observer.record(value)
    f.control('take')
    expect(f.posted[0]?.sequenceComplete).toBe(false)
    if (mutation !== 'incomplete') expect(f.posted[0]?.sequenceInvalid).toBe(true)
    if (mutation === 'text') expect(f.posted[0]?.textExact).toBe(false)
    if (mutation === 'duplicate') expect(f.posted[0]?.textSingle).toBe(false)
  },
)
// 超額不截斷當完整證據，callback故障明確標不可用。
it('marks overflow and observer failure without preserving any payload', () => {
  const f = fixture()
  for (let i = 0; i < 65; i++) f.observer.record({ kind: 'mouse', mask: 0 })
  f.observer.unavailable()
  f.control('take')
  expect(f.posted[0]).toMatchObject({ overflow: true, unavailable: true, sequenceComplete: false })
})
// 舊scope與結束後的文字不能污染新輪次。
it('clears completed scopes and ignores stale control messages', () => {
  const f = fixture()
  for (const value of sequence()) f.observer.record(value)
  f.control('take')
  f.control('begin', 2, 'Public second')
  f.control('take', 1)
  expect(f.posted).toHaveLength(1)
  f.observer.record(key('seq', sample, true))
  f.control('take', 2)
  expect(f.posted[1]).toMatchObject({
    textExact: false,
    sequenceComplete: false,
    sequenceInvalid: true,
  })
  f.control('take', 2)
  expect(f.posted).toHaveLength(2)
  expect(f.port.close).toHaveBeenCalled()
})
// 診斷無效bytes及throw不得改原輸出或洩漏任意exception。
it('marks decoder and observer faults without mutating encoded bytes', () => {
  const unavailable = vi.fn(),
    bytes = encodeMessage({ mouseEvent: { mask: 9, x: 42, y: 53 } }),
    original = new Uint8Array(bytes)
  expect(() =>
    observeEncodedInput(bytes, {
      record: /* 注入未知診斷故障。 */ () => {
        throw new Error('private_exception')
      },
      unavailable,
    }),
  ).not.toThrow()
  observeEncodedInput(new Uint8Array([255]), { record: vi.fn(), unavailable })
  expect(unavailable).toHaveBeenCalledTimes(2)
  expect(bytes).toEqual(original)
})
// 觀察器不得得到任意envelope或借用mutable plaintext。
it('does not expose non-input data and detached DTO mutation cannot modify bytes', () => {
  const rows: EncodedInputSnapshot[] = [],
    observer = {
      record: /* 嘗試修改觀察副本。 */ (value: EncodedInputSnapshot) => {
        rows.push(value)
        if (value.kind === 'key') value.seq = 'Public mutated'
      },
      unavailable: vi.fn(),
    }
  observeEncodedInput(encodeMessage({ clipboard: { content: new Uint8Array([65]) } }), observer)
  expect(rows).toHaveLength(0)
  const bytes = encodeMessage({ keyEvent: { seq: sample, down: true } }),
    original = new Uint8Array(bytes)
  observeEncodedInput(bytes, observer)
  expect(rows).toHaveLength(1)
  expect(bytes).toEqual(original)
})
// 未啟用／取消後不讀取文字；非法或超額公開scope明確不可用。
it.each(['private', 'Public ' + '中'.repeat(1400), 'Public \uD800'])(
  'refuses an invalid expected scope',
  /* 同步界限不能截斷文字求相等。 */ (expected) => {
    const f = fixture(expected)
    f.observer.record(key('seq', sample, true))
    expect(f.posted[0]?.unavailable).toBe(true)
    f.control('take')
    expect(f.posted).toHaveLength(1)
  },
)
// cancel清引用與port，後續late record或take不能新增結果。
it('does not collect after cancellation or outside chord boundaries', () => {
  const f = fixture()
  f.observer.record({ kind: 'mouse', mask: 0 })
  for (const value of sequence()) f.observer.record(value)
  f.observer.record({ kind: 'mouse', mask: 9 })
  f.control('take')
  expect(f.posted[0]?.sequenceComplete).toBe(true)
  f.control('begin', 2)
  f.control('cancel', 2)
  for (const value of sequence()) f.observer.record(value)
  f.control('take', 2)
  expect(f.posted).toHaveLength(1)
})
// port發送故障不能變成Worker uncaught error或產品fatal。
it('contains diagnostic control transport failures inside the bootstrap', () => {
  const f = fixture()
  f.port.postMessage = /* 模擬獨立診斷port已失效。 */ () => {
    throw new Error('public_port_fault')
  }
  const event = new MessageEvent('message', {
    data: { type: 'rdweb-encoded-input-diagnostic', action: 'take', scope: 1 },
  })
  expect(() => f.listener(event)).not.toThrow()
  expect(f.port.close).toHaveBeenCalled()
})
// Late install須攔控制而保留正式handler的receiver、event、一次配送及原例外。
it('intercepts only diagnostic control before the existing product handler', () => {
  const target = new EventTarget() as EventTarget & EncodedWorkerScope
  vi.stubGlobal('self', target)
  let received = 0,
    receiverIsTarget = false,
    eventSeen: MessageEvent | undefined
  target.onmessage = /* 正式handler語意不能被診斷吃掉或重送。 */ function (this: unknown, event) {
    received++
    receiverIsTarget = this === target
    eventSeen = event
    if (event.data.type === 'product-fault') throw new Error('public_product_fault')
  }
  installWorkerEncodedInputDiagnostics(enums)
  const diagnostic = new MessageEvent('message', {
    data: { type: 'rdweb-encoded-input-diagnostic', action: 'cancel', scope: 1 },
  })
  target.onmessage.call(target, diagnostic)
  expect(received).toBe(0)
  const product = new MessageEvent('message', { data: { type: 'input-batch' } })
  target.onmessage.call(target, product)
  expect(received).toBe(1)
  expect(receiverIsTarget).toBe(true)
  expect(eventSeen).toBe(product)
  expect(() =>
    target.onmessage!.call(
      target,
      new MessageEvent('message', { data: { type: 'product-fault' } }),
    ),
  ).toThrow('public_product_fault')
})
