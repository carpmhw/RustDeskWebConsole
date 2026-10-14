import { afterEach, expect, it, vi } from 'vitest'
import { installInputDiagnostics, INPUT_DIAGNOSTIC_FIELDS } from '../../e2e-real/input-diagnostics'
const publicSample = 'Public 中文 RdWeb 00000000-0000-4000-8000-000000000000'

// 假Worker只觀察原訊息轉送與安全摘要，不能冒充Windows原生輸入。
function fixture(nativePromise = Promise.resolve(), nativeError?: Error) {
  class FakeWorker extends EventTarget {
    sent: unknown[] = []
    // 保存本測試自有訊息，驗instrumentation沒有改寫或重送。
    postMessage(value: unknown, transfer?: unknown): void {
      this.sent.push([value, transfer])
    }
    // 模擬Worker回覆，不複製或讀取payload。
    reply(data: unknown): void {
      this.dispatchEvent(new MessageEvent('message', { data }))
    }
  }
  const win = { Worker: FakeWorker } as unknown as Window & typeof globalThis
  vi.stubGlobal('window', win)
  const nativeWrites: unknown[] = []
  vi.stubGlobal('navigator', {
    clipboard: {
      // 假native port只記錄本測試公開參數，供驗證observer沒有修改原寫入。
      writeText(value: unknown): Promise<void> {
        if (nativeError) throw nativeError
        nativeWrites.push(value)
        return nativePromise
      },
    },
  })
  installInputDiagnostics()
  const port = win.__rdwebInputDiagnostics!
  const worker = new win.Worker('public-test') as unknown as FakeWorker
  port.begin()
  return { worker, port, nativePromise, nativeWrites }
}
// 每案恢復全域，不影響其他input controller測試。
afterEach(() => vi.unstubAllGlobals())
// 自有公開事件只用固定鍵名與boolean，不把文字或tag存入報告。
function batch(batch_id: number, events: unknown[], revision = 1, input_generation = 1) {
  return { type: 'input-batch', revision, input_generation, batch_id, events }
}
// 送出與matching ACK分開；sent=false不得冒充已提交。
it('separates submitted text/select/copy from matching accepted acknowledgments', () => {
  const { worker, port } = fixture()
  worker.postMessage(batch(1, [{ kind: 'text', text: 'Public sample' }]))
  worker.postMessage(
    batch(2, [{ kind: 'shortcut', char: 'a', down: true, modifiers: ['Control'] }]),
  )
  worker.postMessage(
    batch(3, [{ kind: 'shortcut', char: 'c', down: true, modifiers: ['Control'] }]),
  )
  expect(port.snapshot()).toMatchObject({
    textSubmitted: true,
    selectSubmitted: true,
    copySubmitted: true,
    textAccepted: false,
    selectAccepted: false,
    copyAccepted: false,
  })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 2, sent: true })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 3, sent: false })
  expect(port.snapshot()).toMatchObject({
    textAccepted: true,
    selectAccepted: true,
    copyAccepted: false,
    rejected: true,
  })
})
// 舊revision／generation／batch與reset前ACK都不得更新本輪。
it('ignores stale and reset acknowledgments', () => {
  const { worker, port } = fixture()
  worker.postMessage(batch(1, [{ kind: 'text', text: 'Public sample' }]))
  for (const tag of [
    { revision: 2, input_generation: 1, batch_id: 1 },
    { revision: 1, input_generation: 2, batch_id: 1 },
    { revision: 1, input_generation: 1, batch_id: 2 },
  ])
    worker.reply({ type: 'input-ack', ...tag, sent: true })
  expect(port.snapshot().textAccepted).toBe(false)
  port.begin()
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  expect(port.snapshot().textAccepted).toBe(false)
})
// clipboard資料只觀察matching tag，絕不讀bytes；先於C提交與先於C ACK分開。
it('detects early matching clipboard delivery without inspecting bytes', () => {
  const { worker, port } = fixture()
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  const reply = {
    type: 'clipboard-data',
    revision: 1,
    request_id: 7,
    /* getter驗observer不讀clipboard bytes。 */ get bytes(): never {
      throw new Error('must_not_read')
    },
  }
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 8 })
  expect(port.snapshot().clipboardDelivered).toBe(false)
  worker.reply(reply)
  expect(port.snapshot()).toMatchObject({
    pullSubmitted: true,
    clipboardDelivered: true,
    clipboardPayloadCompared: false,
    clipboardPayloadExact: false,
    dataBeforeCopySubmitted: true,
    dataBeforeCopyAccepted: true,
  })
})
// capture opt-in只屬本輪matching pull，其他request的payload永遠不讀。
it('does not inspect a nonmatching clipboard payload in opt-in mode', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, true, true, true)
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  let read = false
  worker.reply({
    type: 'clipboard-data',
    revision: 1,
    request_id: 8,
    get bytes() {
      read = true
      throw new Error('must_not_read_nonmatching_payload')
    },
  })
  expect(read).toBe(false)
  expect(port.snapshot()).toMatchObject({
    clipboardDelivered: false,
    clipboardPayloadCompared: false,
    clipboardPayloadExact: false,
  })
})
// 新的payload compare opt-in需再由captureText保護，不能只因一般inspectInput讀bytes。
it('requires explicit private capture before enabling clipboard payload comparison', () => {
  const { port } = fixture()
  expect(() => port.begin(publicSample, false, false, true)).toThrow(
    'input_clipboard_diagnostics_unavailable',
  )
})
// matching transfer ingress只回exact boolean，並保持原bytes供後續Main handler使用。
it.each([
  ['exact', publicSample, true],
  ['mismatch', 'Public different clipboard value', false],
  ['preserved BOM mismatch', '\uFEFF' + publicSample, false],
])('compares a matching Worker clipboard payload at Main ingress: %s', (_name, value, exact) => {
  const { worker, port } = fixture()
  port.begin(publicSample, true, true, true)
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  const bytes = new TextEncoder().encode(value)
  const original = new Uint8Array(bytes)
  let productBytes: Uint8Array | undefined
  // 產品事件listener在diagnostic observer後接收同一event。
  worker.addEventListener('message', (event: Event) => {
    const message = (event as MessageEvent).data as { type?: string; bytes?: Uint8Array }
    if (message.type === 'clipboard-data') productBytes = message.bytes
  })
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7, bytes })
  expect(port.snapshot()).toMatchObject({
    clipboardDelivered: true,
    clipboardPayloadCompared: true,
    clipboardPayloadExact: exact,
    overflow: false,
  })
  expect(bytes).toEqual(original)
  // observer先於產品onmessage，後續Main handler仍收到同一bytes引用。
  expect(productBytes).toBe(bytes)
})
// malformed／NUL／oversized transfer不能偽裝為可比較的payload mismatch。
it.each([
  ['malformed UTF-8', new Uint8Array([0xff])],
  ['embedded NUL', new TextEncoder().encode('Public\0invalid')],
  ['oversized', new Uint8Array(32769)],
])('refuses %s clipboard payload comparison', (_name, bytes) => {
  const { worker, port } = fixture()
  port.begin(publicSample, true, true, true)
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  const original = new Uint8Array(bytes)
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7, bytes })
  expect(port.snapshot()).toMatchObject({
    clipboardDelivered: true,
    clipboardPayloadCompared: false,
    clipboardPayloadExact: false,
    overflow: true,
  })
  expect(bytes).toEqual(original)
})
// 即使回覆晚於C ACK，也只能說Worker提交，不得宣称Windows已複製。
it('distinguishes clipboard delivery after copy acknowledgment', () => {
  const { worker, port } = fixture()
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.postMessage(
    batch(1, [{ kind: 'shortcut', char: 'c', down: true, modifiers: ['Control'] }]),
  )
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  expect(port.snapshot()).toMatchObject({
    clipboardDelivered: true,
    dataBeforeCopySubmitted: false,
    dataBeforeCopyAccepted: false,
  })
})
// 失焦release及matching取消可見，取消後資料不能算本輪結果。
it('records release and cancellation but rejects later clipboard delivery', () => {
  const { worker, port } = fixture()
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.postMessage({ type: 'input-release', revision: 1 })
  worker.postMessage({ type: 'clipboard-cancel', revision: 1, request_id: 7 })
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  expect(port.snapshot()).toMatchObject({
    releaseObserved: true,
    pullCancelled: true,
    clipboardDelivered: false,
  })
})
// 非Control組合及keyup不能被當成Ctrl+A／C；文字內容getter不可讀。
it('ignores unrelated shortcuts and never retains text or security messages', () => {
  const { worker, port } = fixture()
  const text = {
    kind: 'text',
    /* getter驗observer不讀原文字。 */ get text(): never {
      throw new Error('must_not_read')
    },
  }
  worker.postMessage(
    batch(1, [
      text,
      { kind: 'shortcut', char: 'a', down: false, modifiers: ['Control'] },
      { kind: 'shortcut', char: 'c', down: true, modifiers: [] },
    ]),
  )
  worker.postMessage({
    type: 'start',
    /* getter驗observer不讀安全runtime。 */ get ticket(): never {
      throw new Error('must_not_read')
    },
  })
  expect(port.snapshot()).toMatchObject({
    textSubmitted: true,
    selectSubmitted: false,
    copySubmitted: false,
  })
  expect(
    Object.values(port.snapshot()).every(
      /* 報告僅允許boolean。 */ (value) => typeof value === 'boolean',
    ),
  ).toBe(true)
})
// 自有hook只被動觀察，原訊息與transfer物件必須原封不動送一次。
it('preserves original postMessage and isolates different workers', () => {
  const { worker, port } = fixture()
  const value = batch(1, [{ kind: 'text', text: 'Public' }]),
    transfer: unknown[] = []
  worker.postMessage(value, transfer)
  expect(worker.sent).toHaveLength(1)
  expect(worker.sent[0]).toEqual([value, transfer])
  const sent = worker.sent[0] as unknown[]
  expect(sent[0]).toBe(value)
  expect(sent[1]).toBe(transfer)
  const other = new window.Worker('public-other') as unknown as typeof worker
  other.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  expect(port.snapshot().textAccepted).toBe(false)
})
// pending上限固定64；超限只標記診斷不完整，不阻擋原Worker。
it('bounds diagnostic pending state without changing worker submission', () => {
  const { worker, port } = fixture()
  for (let id = 1; id <= 65; id++) worker.postMessage(batch(id, [{ kind: 'text', text: 'Public' }]))
  expect(port.snapshot().overflow).toBe(true)
  expect(worker.sent).toHaveLength(65)
})
// 接收前A與其晚到ACK不能冒充接收後重新全選；文字證據仍可保留。
it('resets selection evidence when receiving starts but preserves text submission', () => {
  const { worker, port } = fixture()
  worker.postMessage(
    batch(1, [
      { kind: 'text', text: 'Public' },
      { kind: 'shortcut', char: 'a', down: true, modifiers: ['Control'] },
    ]),
  )
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  expect(port.snapshot()).toMatchObject({
    textSubmitted: true,
    textAccepted: true,
    selectSubmitted: false,
    selectAccepted: false,
  })
})
// CapsLock／NumLock摘要不改Ctrl+A/C的身分，額外Alt／Shift仍不算核准shortcut。
it('recognizes control shortcuts with lock-state modifiers', () => {
  const { worker, port } = fixture()
  worker.postMessage(
    batch(1, [
      { kind: 'shortcut', char: 'a', down: true, modifiers: ['Control', 'NumLock'] },
      { kind: 'shortcut', char: 'c', down: true, modifiers: ['Control', 'CapsLock', 'NumLock'] },
    ]),
  )
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  expect(port.snapshot()).toMatchObject({
    selectSubmitted: true,
    selectAccepted: true,
    copySubmitted: true,
    copyAccepted: true,
  })
})

// 本輪public expected只用來比對，不讀bytes；matching資料之後的native參數分辨內容形狀。
it.each([
  [publicSample, true, false, false, true, true, true],
  [
    'Public 漢字 RdWeb 00000000-0000-4000-8000-000000000000',
    false,
    false,
    false,
    true,
    true,
    false,
  ],
  [
    'Public 中文 RdWeb 11111111-1111-4111-8111-111111111111',
    false,
    false,
    false,
    false,
    false,
    false,
  ],
  ['Public 中文', false, false, true, false, false, false],
  ['extra ' + publicSample, false, true, false, true, false, false],
  [publicSample + '\r\n', false, true, false, true, false, true],
  ['', false, false, false, false, false, false],
] as const)(
  'classifies public native write shape without changing strict success: %#',
  async (actual, exact, contains, fragment, uuid, ascii, trim) => {
    const { worker, port, nativePromise, nativeWrites } = fixture()
    port.begin(publicSample)
    worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
    worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
    const result = navigator.clipboard.writeText(actual)
    expect(result).toBe(nativePromise)
    await result
    expect(nativeWrites).toEqual([actual])
    expect(port.snapshot()).toMatchObject({
      nativeWriteHooked: true,
      nativeWriteObserved: true,
      nativeWriteExact: exact,
      nativeWriteContainsExpected: contains,
      nativeWriteIsExpectedFragment: fragment,
      nativeWriteUuidMatches: uuid,
      nativeWriteAsciiMatches: ascii,
      nativeWriteTrimMatches: trim,
    })
    expect(
      Object.values(port.snapshot()).every(
        /* 摘要不含任何實際文字或UUID。 */ (value) => typeof value === 'boolean',
      ),
    ).toBe(true)
  },
)
// 接收前的本機sentinel及第一筆native寫入後的其他變更，不可覆寫本輪證據。
it('ignores local sentinel writes and preserves the first received write classification', async () => {
  const { worker, port } = fixture()
  port.begin(publicSample)
  await navigator.clipboard.writeText('Public local sentinel')
  expect(port.snapshot()).toMatchObject({ nativeWriteObserved: false })
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  await navigator.clipboard.writeText(publicSample)
  await navigator.clipboard.writeText('Public other local value')
  expect(port.snapshot()).toMatchObject({ nativeWriteObserved: true, nativeWriteExact: true })
  port.begin(publicSample)
  expect(port.snapshot()).toMatchObject({ nativeWriteObserved: false, nativeWriteExact: false })
})
// 觀察到exact參數不是OS寫入成功；原native拒絕Promise與同步例外都不得被observer替換。
it('preserves native rejection and synchronous errors without claiming write success', async () => {
  const failure = new Error('public_native_write_rejected')
  const rejected = Promise.reject(failure)
  const f = fixture(rejected)
  f.port.begin(publicSample)
  f.worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  f.worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  const result = navigator.clipboard.writeText(publicSample)
  expect(result).toBe(rejected)
  await expect(result).rejects.toBe(failure)
  expect(f.port.snapshot()).toMatchObject({ nativeWriteObserved: true, nativeWriteExact: true })
  const thrown = new Error('public_native_write_thrown')
  const g = fixture(undefined, thrown)
  g.port.begin(publicSample)
  g.worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  g.worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  expect(() => navigator.clipboard.writeText(publicSample)).toThrow(thrown)
  expect(g.port.snapshot()).toMatchObject({ nativeWriteObserved: false })
})
// 預設仍不保存文字；只有顯式enable才保留matching資料後第一筆native參數且取出即清。
it('captures the first native text only on explicit local diagnostic opt-in', async () => {
  const { worker, port } = fixture()
  port.begin(publicSample, true)
  await navigator.clipboard.writeText('Public ignored sentinel')
  expect(port.takeText()).toBe(null)
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  await navigator.clipboard.writeText('Public reordered 中文')
  await navigator.clipboard.writeText('Public later write')
  expect(port.takeText()).toBe('Public reordered 中文')
  expect(port.takeText()).toBe(null)
})
// 關閉與新begin都清除舊文字，原boolean API不因本機log而擴充內容。
it('never exposes text by default or after a diagnostic generation reset', async () => {
  const { worker, port } = fixture()
  for (const capture of [false, true]) {
    port.begin(publicSample, capture)
    worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
    worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
    await navigator.clipboard.writeText(publicSample)
    expect(
      Object.values(port.snapshot()).every(
        /* 摘要仍只有boolean。 */ (value) => typeof value === 'boolean',
      ),
    ).toBe(true)
    if (!capture) expect(port.takeText()).toBe(null)
    port.begin(publicSample)
    expect(port.takeText()).toBe(null)
  }
})
// 文字捕捉使用原32KiB UTF-8上限，不能截斷或擴張原生entry的保存範圍。
it('refuses oversized diagnostic capture without changing native arguments', async () => {
  const { worker, port, nativeWrites } = fixture()
  port.begin(publicSample, true)
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  const value = '中'.repeat(10923)
  await navigator.clipboard.writeText(value)
  expect(nativeWrites).toEqual([value])
  expect(port.takeText()).toBe(null)
  expect(port.snapshot().overflow).toBe(true)
})
// 診斷begin只能接短命Public expected，拒絕任意資料、非字串與無界輸入且不回顯值。
it.each([123, 'private-test-input', 'Public '.repeat(6000)] as const)(
  'rejects malformed public diagnostic expected: %#',
  (value) => {
    const { port } = fixture()
    expect(() => port.begin(value as unknown as string)).toThrow(
      'input_clipboard_diagnostics_unavailable',
    )
  },
)
// 沿既有oracle的讀取只保存最後值，不觸發新native讀取、不讓預設模式落文字。
it('captures only the last existing oracle readback on opt-in and clears it on take', () => {
  const { port } = fixture()
  port.begin(publicSample)
  port.observeReadback('Public ignored', 'native')
  expect(port.takeReadback()).toEqual({ value: null, source: 'unavailable' })
  port.begin(publicSample, true)
  port.observeReadback('Public sentinel', 'native')
  port.observeReadback('Public reordered', 'fallback')
  expect(port.takeReadback()).toEqual({ value: 'Public reordered', source: 'fallback' })
  expect(port.takeReadback()).toEqual({ value: null, source: 'unavailable' })
  port.observeReadback(publicSample, 'native')
  port.begin(publicSample, true)
  expect(port.takeReadback()).toEqual({ value: null, source: 'unavailable' })
})
// 超額或未知source不得留前一筆誤導資料，錯誤只反映overflow。
it('rejects oversized or malformed readback capture without retaining prior data', () => {
  const { port } = fixture()
  port.begin(publicSample, true)
  port.observeReadback(publicSample, 'native')
  port.observeReadback('中'.repeat(10923), 'native')
  expect(port.takeReadback()).toEqual({ value: null, source: 'unavailable' })
  expect(port.snapshot().overflow).toBe(true)
  port.begin(publicSample, true)
  port.observeReadback(publicSample, 'other' as 'native')
  expect(port.takeReadback()).toEqual({ value: null, source: 'unavailable' })
  expect(port.snapshot().overflow).toBe(true)
})
// 原oracle最後讀取拒絕時，不能把前一筆成功poll讀取當成最後回讀。
it('clears earlier readback on a final native read failure without claiming overflow', () => {
  const { port } = fixture()
  port.begin(publicSample, true)
  port.observeReadback(publicSample, 'native')
  port.observeReadback(null, 'unavailable')
  expect(port.takeReadback()).toEqual({ value: null, source: 'unavailable' })
  expect(port.snapshot().overflow).toBe(false)
})

// 手列完整primitive chord，省略Control up或翻轉字母up應讓真observer失敗。
function chord(char: 'a' | 'c') {
  return [
    { kind: 'key', key: 'Control', down: true, modifiers: ['Control', 'NumLock'] },
    { kind: 'shortcut', char, down: true, modifiers: ['Control', 'NumLock'] },
    { kind: 'shortcut', char, down: false, modifiers: ['Control', 'NumLock'] },
    { kind: 'key', key: 'Control', down: false, modifiers: ['NumLock'] },
  ]
}
// prefix拆成每edge一batch以驗全部ACK，不把Text ACK當Ctrl放開證據。
function textPrefix(worker: ReturnType<typeof fixture>['worker']) {
  for (const [index, event] of [
    ...chord('a'),
    { kind: 'text', text: publicSample, modifiers: [] },
  ].entries()) {
    worker.postMessage(batch(index + 1, [event]))
  }
}
// 同Worker matching ACK逐batch驗，省略其中一筆就不可accepted。
function acceptPrefix(worker: ReturnType<typeof fixture>['worker'], rejected = 0) {
  for (let id = 1; id <= 5; id++)
    worker.reply({
      type: 'input-ack',
      revision: 1,
      input_generation: 1,
      batch_id: id,
      sent: id !== rejected,
    })
}
// 截斷prefix或忽略Control up的ACK會使此案失敗。
it('accepts text-only prefix only after every matching batch ACK', () => {
  const { worker, port } = fixture()
  port.beginTextOnly(publicSample)
  textPrefix(worker)
  expect(port.textOnlySnapshot()).toEqual({
    prefixSubmitted: true,
    prefixAccepted: false,
    postTextInput: false,
    clipboardObserved: false,
    scopeInterrupted: false,
    overflow: false,
  })
  acceptPrefix(worker)
  expect(port.textOnlySnapshot().prefixAccepted).toBe(true)
  expect(Object.keys(port.snapshot()).sort()).toEqual([...INPUT_DIAGNOSTIC_FIELDS].sort())
})
// 少任何edge都不得假稱單筆完整Text前已有正確全選。
it.each([0, 1, 2, 3])('rejects text-only prefix missing initial edge: %i', (missing) => {
  const { worker, port } = fixture()
  port.beginTextOnly(publicSample)
  const events: unknown[] = [...chord('a'), { kind: 'text', text: publicSample, modifiers: [] }]
  events.splice(missing, 1)
  worker.postMessage(batch(1, events))
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  expect(port.textOnlySnapshot().prefixAccepted).toBe(false)
})
// 任一batch拒絕即使Text被接受仍須拒絕prefix。
it('rejects text-only prefix when a control-only batch is refused', () => {
  const { worker, port } = fixture()
  port.beginTextOnly(publicSample)
  textPrefix(worker)
  acceptPrefix(worker, 4)
  expect(port.textOnlySnapshot().prefixAccepted).toBe(false)
})
// 文字之後任何event都會干擾隔離，move也不能沿完整oracle默許。
it.each([
  { kind: 'move' },
  { kind: 'button' },
  chord('a')[0],
  {
    kind: 'text',
    get text(): never {
      /* 第二筆不讀內容。 */ throw new Error('must_not_read')
    },
  },
  { kind: 'wheel' },
  { kind: 'sas' },
])('detects post-text input without reading payload: %#', (event) => {
  const { worker, port } = fixture()
  port.beginTextOnly(publicSample)
  textPrefix(worker)
  acceptPrefix(worker)
  worker.postMessage(batch(6, [event]))
  expect(port.textOnlySnapshot().postTextInput).toBe(true)
})
// 任何clipboard command或data只看type，不讀bytes或觸發native API。
it.each([
  'clipboard-pull',
  'clipboard-send',
  'clipboard-cancel',
  'clipboard-data',
  'clipboard-error',
])('detects clipboard traffic in text-only observation: %s', (type) => {
  const { worker, port } = fixture()
  port.beginTextOnly(publicSample)
  textPrefix(worker)
  worker.postMessage({
    type,
    revision: 1,
    request_id: 7,
    get bytes(): never {
      /* payload不可讀。 */ throw new Error('must_not_read')
    },
  })
  expect(port.textOnlySnapshot().clipboardObserved).toBe(true)
})
// scope失效或current release中斷，stale release不得污染現行世代。
it.each(['release', 'generation', 'state', 'terminal'])(
  'detects text-only scope interruption: %s',
  (change) => {
    const { worker, port } = fixture()
    port.beginTextOnly(publicSample)
    textPrefix(worker)
    if (change === 'release') worker.postMessage({ type: 'input-release', revision: 1 })
    if (change === 'generation') worker.postMessage(batch(6, [{ kind: 'move' }], 1, 2))
    if (change === 'state')
      worker.reply({
        type: 'input-state',
        revision: 1,
        input_generation: 1,
        ready: false,
        keyboard: false,
      })
    if (change === 'terminal') worker.reply({ type: 'error', revision: 1 })
    expect(port.textOnlySnapshot().scopeInterrupted).toBe(true)
  },
)
// 清text-only模式後不讀文字getter；固定summary全部reset。
it('clears text-only mode when the original diagnostic begins', () => {
  const { worker, port } = fixture()
  port.beginTextOnly(publicSample)
  textPrefix(worker)
  worker.postMessage({ type: 'input-release', revision: 2 })
  expect(port.textOnlySnapshot().scopeInterrupted).toBe(false)
  port.begin()
  worker.postMessage(
    batch(6, [
      {
        kind: 'text',
        get text(): never {
          /* 預設不讀文字。 */ throw new Error('must_not_read')
        },
      },
    ]),
  )
  expect(
    Object.values(port.textOnlySnapshot()).every(
      /* reset不可留綠燈或干擾。 */ (value) => value === false,
    ),
  ).toBe(true)
  expect(port.snapshot().overflow).toBe(false)
})
// 使用正式Worker的failure／disposed與權限訊息，不以合成terminal代替。
it.each([
  { type: 'failure', revision: 1 },
  { type: 'disposed', revision: 1 },
  { type: 'operation-error', revision: 1 },
  { type: 'activity', revision: 1, open: false },
  {
    type: 'input-state',
    revision: 1,
    input_generation: 1,
    ready: true,
    keyboard: true,
    clipboard: false,
    platform: 'windows',
  },
])('detects native protocol interruption during text observation: %#', (message) => {
  const { worker, port } = fixture()
  port.beginTextOnly(publicSample)
  textPrefix(worker)
  worker.reply(message)
  expect(port.textOnlySnapshot().scopeInterrupted).toBe(true)
})
// Worker原生error不經message，不能讓已壞的scope繼續正常觀察。
it.each(['error', 'messageerror'])(
  'detects a native Worker fault during text observation: %s',
  (name) => {
    const { worker, port } = fixture()
    port.beginTextOnly(publicSample)
    textPrefix(worker)
    worker.dispatchEvent(new Event(name))
    expect(port.textOnlySnapshot().scopeInterrupted).toBe(true)
  },
)
// 公開完整序列跨兩個batch；不假造OS執行，ACK由測試按明確tag回覆。
function completeSequence(
  worker: ReturnType<typeof fixture>['worker'],
  text: unknown = publicSample,
) {
  worker.postMessage(batch(1, [...chord('a'), { kind: 'text', text, modifiers: ['NumLock'] }]))
  worker.postMessage({ type: 'input-release', revision: 1 })
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.postMessage(batch(2, [...chord('a'), ...chord('c')]))
}
// 真observer比對單筆全文與兩次全選／完整copy；Main提交和Worker接受不能混成OS成功。
it('inspects the exact full input sequence without claiming worker acceptance before ACK', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  completeSequence(worker)
  expect(port.snapshot()).toMatchObject({
    textExactSubmitted: true,
    textSingleSubmitted: true,
    initialSelectChordSubmitted: true,
    receiveSelectChordSubmitted: true,
    receiveCopyChordSubmitted: true,
    inputSequenceSubmitted: true,
    inputSequenceAccepted: false,
    sequenceInvalid: false,
  })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 2, sent: true })
  expect(port.snapshot().inputSequenceAccepted).toBe(false)
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  expect(port.snapshot().inputSequenceAccepted).toBe(true)
  expect(Object.keys(port.snapshot()).sort()).toEqual([...INPUT_DIAGNOSTIC_FIELDS].sort())
})
// HR的public copy-return pipeline取native write及原oracle最後讀值，不送outbound clipboard。
it('captures a remote input return record without an outbound clipboard send', async () => {
  const returned = 'Public remote return 中文'
  const { worker, port, nativeWrites } = fixture()
  port.begin(publicSample, true, true)
  completeSequence(worker)
  for (const batch_id of [1, 2])
    worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id, sent: true })
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  await navigator.clipboard.writeText(returned)
  port.observeReadback('Public local sentinel', 'native')
  port.observeReadback(returned, 'native')
  const readback = port.takeReadback()
  const record = {
    expected: publicSample,
    nativeWrite: port.takeText(),
    readback: readback.value,
    source: readback.source,
  }
  expect(record).toEqual({
    expected: publicSample,
    nativeWrite: returned,
    readback: returned,
    source: 'native',
  })
  expect(port.snapshot().inputSequenceAccepted).toBe(true)
  expect(nativeWrites).toEqual([returned])
  expect(
    worker.sent.some(
      /* 單向remote_input回讀不得額外send clipboard。 */ (entry) =>
        Array.isArray(entry) && (entry[0] as { type?: string }).type === 'clipboard-send',
    ),
  ).toBe(false)
})
// 缺字、字序、非string及超額均不能因Text kind存在而宣稱完整相等。
it.each(['Public 中文', publicSample.slice(16) + ' Public 中文 RdWeb ', 123, '中'.repeat(10923)])(
  'rejects non-exact submitted public text without reflecting payload: %#',
  (text) => {
    const { worker, port } = fixture()
    port.begin(publicSample, false, true)
    completeSequence(worker, text)
    expect(port.snapshot()).toMatchObject({
      textExactSubmitted: false,
      textSingleSubmitted: true,
      sequenceInvalid: true,
      inputSequenceSubmitted: false,
    })
    expect(
      Object.values(port.snapshot()).every(
        /* 摘要沒有text或tag。 */ (value) => typeof value === 'boolean',
      ),
    ).toBe(true)
  },
)
// 完整序列後再收到第二筆Text不能保留先前的single／exact綠燈。
it('invalidates duplicate text instead of accepting the last matching fragment', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  completeSequence(worker)
  worker.postMessage(batch(3, [{ kind: 'text', text: publicSample, modifiers: [] }]))
  expect(port.snapshot()).toMatchObject({
    textSingleSubmitted: false,
    textExactSubmitted: false,
    sequenceInvalid: true,
    inputSequenceSubmitted: false,
  })
})
// 截掉任何一個down/up都不能將兩次全選混為同一份證據。
it.each([0, 1, 2, 3, 4, 5, 6, 7])('rejects a missing receive chord edge: %i', (missing) => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  worker.postMessage(batch(1, [...chord('a'), { kind: 'text', text: publicSample, modifiers: [] }]))
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  const events = [...chord('a'), ...chord('c')]
  events.splice(missing, 1)
  worker.postMessage(batch(2, events))
  expect(port.snapshot()).toMatchObject({
    initialSelectChordSubmitted: true,
    receiveCopyChordSubmitted: false,
    inputSequenceSubmitted: false,
  })
})
// copy不能先於接收後的全選；初始Text不能先於初始Control放開。
it('rejects reordered selection/copy and a text event inside the initial chord', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  worker.postMessage(
    batch(1, [...chord('a').slice(0, 3), { kind: 'text', text: publicSample, modifiers: [] }]),
  )
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.postMessage(batch(2, [...chord('c'), ...chord('a')]))
  expect(port.snapshot()).toMatchObject({
    initialSelectChordSubmitted: false,
    receiveSelectChordSubmitted: false,
    receiveCopyChordSubmitted: false,
    sequenceInvalid: true,
  })
})
// 最後copy up之前資料可能已到，旗標只描述時序、不否定資料或阻擋正常keyup。
it('keeps inspecting keyup after early clipboard delivery and native expected cleanup', async () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  worker.postMessage(batch(1, [...chord('a'), { kind: 'text', text: publicSample, modifiers: [] }]))
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.postMessage(batch(2, [...chord('a'), ...chord('c').slice(0, 2)]))
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  await navigator.clipboard.writeText(publicSample)
  expect(port.snapshot()).toMatchObject({
    dataBeforeCopyChordSubmitted: true,
    receiveCopyChordSubmitted: false,
  })
  worker.postMessage(batch(3, chord('c').slice(2)))
  expect(port.snapshot()).toMatchObject({
    receiveCopyChordSubmitted: true,
    inputSequenceSubmitted: true,
    sequenceInvalid: false,
  })
})
// chord中release或遠端點擊不可當正常文字後失焦；診斷不阻擋原指令。
it.each(['release', 'button'])('invalidates an interrupted receive chord: %s', (kind) => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  worker.postMessage(batch(1, [...chord('a'), { kind: 'text', text: publicSample, modifiers: [] }]))
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.postMessage(batch(2, chord('a').slice(0, 2)))
  if (kind === 'release') worker.postMessage({ type: 'input-release', revision: 1 })
  else
    worker.postMessage(
      batch(3, [{ kind: 'button', button: 'left', down: true, x: 20, y: 30, modifiers: [] }]),
    )
  worker.postMessage(batch(4, [...chord('a').slice(2), ...chord('c')]))
  expect(port.snapshot()).toMatchObject({ sequenceInvalid: true, inputSequenceSubmitted: false })
})
// 完整最後batch不准覆蓋前面某個Control edge被Worker拒絕的事實。
it('does not accept a full sequence when any relevant batch is rejected or stale', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  completeSequence(worker)
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 2, batch_id: 1, sent: true })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 2, sent: true })
  expect(port.snapshot().inputSequenceAccepted).toBe(false)
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: false })
  expect(port.snapshot()).toMatchObject({
    inputSequenceSubmitted: true,
    inputSequenceAccepted: false,
    rejected: true,
  })
})
// begin清除完整序列；預設仍不讀text getter、不接受前一輪ACK補綠。
it('resets sequence inspection and never reads text by default', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  completeSequence(worker)
  expect(port.snapshot().inputSequenceSubmitted).toBe(true)
  port.begin(publicSample)
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  worker.postMessage(
    batch(3, [
      {
        kind: 'text',
        /* 預設不得讀私有值。 */ get text(): never {
          throw new Error('must_not_read')
        },
      },
    ]),
  )
  expect(port.snapshot()).toMatchObject({
    inputSequenceSubmitted: false,
    inputSequenceAccepted: false,
    sequenceInvalid: false,
    overflow: false,
  })
})
// Control edge在自己的batch被拒絕，A／C down的綠燈不能掩蓋它。
it('tracks acknowledgments for control-only and keyup-only batches', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  let id = 0
  for (const event of [...chord('a'), { kind: 'text', text: publicSample, modifiers: [] }])
    worker.postMessage(batch(++id, [event]))
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  for (const event of [...chord('a'), ...chord('c')]) worker.postMessage(batch(++id, [event]))
  for (let tag = 1; tag <= id; tag++) {
    if (tag === 4) continue
    worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: tag, sent: true })
  }
  expect(port.snapshot()).toMatchObject({
    inputSequenceSubmitted: true,
    inputSequenceAccepted: false,
  })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 4, sent: false })
  expect(port.snapshot()).toMatchObject({ inputSequenceAccepted: false, rejected: true })
})
// mouse move不打斷chord，正常在完整chord外點回遠端亦不被誤判。
it('allows pointer motion and outside-chord clicks without rewriting the sequence', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  worker.postMessage(
    batch(1, [
      { kind: 'move', x: 20, y: 30 },
      { kind: 'button', button: 'left', down: true, x: 20, y: 30, modifiers: [] },
      ...chord('a'),
      { kind: 'text', text: publicSample, modifiers: [] },
    ]),
  )
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.postMessage(
    batch(2, [
      chord('a')[0],
      { kind: 'move', x: 20, y: 30 },
      ...chord('a').slice(1),
      ...chord('c'),
    ]),
  )
  worker.reply({ type: 'clipboard-data', revision: 1, request_id: 7 })
  expect(port.snapshot()).toMatchObject({
    inputSequenceSubmitted: true,
    sequenceInvalid: false,
    dataBeforeCopyChordSubmitted: false,
  })
})
// 第二個Worker不能補齊或破壞第一個Worker的chord。
it('keeps the complete sequence scoped to its original worker', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  worker.postMessage(batch(1, [...chord('a'), { kind: 'text', text: publicSample, modifiers: [] }]))
  const other = new window.Worker('public-other') as unknown as typeof worker
  other.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  other.postMessage(batch(2, [...chord('a'), ...chord('c')]))
  expect(port.snapshot()).toMatchObject({
    inputSequenceSubmitted: false,
    receiveCopyChordSubmitted: false,
    sequenceInvalid: false,
  })
})
// 同Worker跨世代／重複batch不准拼出貌似完整的序列。
it.each(['generation', 'duplicate', 'pull_revision'])('rejects mixed input tags: %s', (change) => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  worker.postMessage(batch(1, [...chord('a'), { kind: 'text', text: publicSample, modifiers: [] }]))
  worker.postMessage({
    type: 'clipboard-pull',
    revision: change === 'pull_revision' ? 2 : 1,
    request_id: 7,
  })
  worker.postMessage(
    batch(
      change === 'duplicate' ? 1 : 2,
      [...chord('a'), ...chord('c')],
      1,
      change === 'generation' ? 2 : 1,
    ),
  )
  expect(port.snapshot()).toMatchObject({ sequenceInvalid: true, inputSequenceSubmitted: false })
})
// 診斷亦不能把產品會拒絕的NUL／surrogate或4096-byte超額Text標成exact。
it.each(['Public \0', 'Public \ud800', 'Public ' + '中'.repeat(1364)])(
  'rejects invalid input expected before inspection: %#',
  (text) => {
    const { port } = fixture()
    expect(() => port.begin(text, false, true)).toThrow('input_clipboard_diagnostics_unavailable')
  },
)
// inspect必須顯式boolean且有public expected，不能truthy啟用或誤讀私人文字。
it.each([
  ['', true],
  [publicSample, 'yes'],
] as const)('rejects invalid sequence opt-in: %#', (text, inspect) => {
  const { port } = fixture()
  expect(() => port.begin(text, false, inspect as boolean)).toThrow(
    'input_clipboard_diagnostics_unavailable',
  )
})
// 批次超額不逐一讀payload；fail-closed摘要不影響原postMessage。
it('bounds inspected batch events and never reports acceptance after diagnostic overflow', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  const event = {
    kind: 'text',
    /* 超額時不得碰payload。 */ get text(): never {
      throw new Error('must_not_read')
    },
  }
  worker.postMessage(batch(1, Array(17).fill(event)))
  expect(port.snapshot()).toMatchObject({
    overflow: true,
    sequenceInvalid: true,
    inputSequenceAccepted: false,
  })
})
// 不需要再讀第二筆Text的內容，光重複事件就足以否定single／exact。
it('rejects a duplicate text kind without reading its payload getter', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  completeSequence(worker)
  worker.postMessage(
    batch(3, [
      {
        kind: 'text',
        /* 重複時不可多留或讀取文字。 */ get text(): never {
          throw new Error('must_not_read')
        },
      },
    ]),
  )
  expect(port.snapshot()).toMatchObject({
    sequenceInvalid: true,
    textSingleSubmitted: false,
    textExactSubmitted: false,
    overflow: false,
  })
})
// stale release不得打斷新revision的chord，原legacy release摘要仍只表示有觀察到。
it('ignores a stale release when inspecting a chord in another revision', () => {
  const { worker, port } = fixture()
  port.begin(publicSample, false, true)
  worker.postMessage(batch(1, chord('a').slice(0, 2)))
  worker.postMessage({ type: 'input-release', revision: 2 })
  worker.postMessage(
    batch(2, [...chord('a').slice(2), { kind: 'text', text: publicSample, modifiers: [] }]),
  )
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.postMessage(batch(3, [...chord('a'), ...chord('c')]))
  expect(port.snapshot()).toMatchObject({ inputSequenceSubmitted: true, sequenceInvalid: false })
})
// malformed／未知event不可被跳過後還宣稱全文序列有效。
it.each([null, { kind: 'unknown' }])(
  'does not skip malformed events in an inspected batch: %#',
  (event) => {
    const { worker, port } = fixture()
    port.begin(publicSample, false, true)
    worker.postMessage(
      batch(1, [event, ...chord('a'), { kind: 'text', text: publicSample, modifiers: [] }]),
    )
    worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
    worker.postMessage(batch(2, [...chord('a'), ...chord('c')]))
    expect(port.snapshot()).toMatchObject({ sequenceInvalid: true, inputSequenceSubmitted: false })
  },
)
