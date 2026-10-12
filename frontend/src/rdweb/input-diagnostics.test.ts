import { afterEach, expect, it, vi } from 'vitest'
import { installInputDiagnostics } from '../../e2e-real/input-diagnostics'

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
    dataBeforeCopySubmitted: true,
    dataBeforeCopyAccepted: true,
  })
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

const publicSample = 'Public 中文 RdWeb 00000000-0000-4000-8000-000000000000'
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
