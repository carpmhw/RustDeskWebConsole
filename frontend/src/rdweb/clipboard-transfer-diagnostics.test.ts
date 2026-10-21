import { afterEach, expect, it, vi } from 'vitest'
import {
  installWorkerClipboardTransferDiagnostics,
  prepareClipboardTransferWorker,
  type ClipboardTransferWorkerScope,
} from '../../e2e/real/clipboard-transfer-diagnostics'
import type { Page } from '@playwright/test'
import { WorkerClipboard } from './worker-clipboard'
import { hbb } from './codec'
import samples from './__fixtures__/clipboard-samples.json'
import { observeIncomingClipboard } from './incoming-clipboard-observer'

const expected = 'Public 中文 RdWeb 00000000-0000-4000-8000-000000000000'
const tag = { revision: 1, request_id: 7 }
// 使用真正structuredClone transfer驗buffer先比對、後detach；不模擬Windows。
function fixture(publicExpected = expected, captureText = false) {
  const received: unknown[] = []
  const sent: { value: unknown; transfer?: Transferable[]; receiver: unknown }[] = []
  const scope: ClipboardTransferWorkerScope = {
    // 原產品handler接收同一event及receiver。
    onmessage(event) {
      received.push([this, event])
    },
    // 原transport保持參數，並真正移交ArrayBuffer ownership。
    postMessage(value, transfer) {
      sent.push({ value, transfer, receiver: this })
      if (transfer?.length) structuredClone(value, { transfer })
    },
  }
  vi.stubGlobal('self', scope)
  const originalMessage = scope.onmessage,
    originalPost = scope.postMessage
  installWorkerClipboardTransferDiagnostics({
    expected: publicExpected,
    scope: 1,
    ...(captureText ? { captureText: true } : {}),
  })
  // 只送本測試自有控制，與產品handler同一呼叫路徑。
  function incoming(value: unknown) {
    const event = new MessageEvent('message', { data: value })
    scope.onmessage?.call(scope, event)
    return event
  }
  return { scope, incoming, received, sent, originalMessage, originalPost }
}
// 真helper→原decoder→真正transfer，不把fake callback／expected當文字來源。
function deliver(f: ReturnType<typeof fixture>, text = expected, compress = false): void {
  const clipboard = new WorkerClipboard(
    1,
    /* 保留原同步sender及option順序。 */ () => undefined,
    /* 原產品owned bytes經真structuredClone detach。 */ (reply, transfer) =>
      f.scope.postMessage(reply, transfer),
    /* 公開單元clock不含新等待。 */ () => 0,
    /* 與正式晚安裝provider同一入口。 */ () => f.scope.__rdwebIncomingClipboardObserver,
  )
  f.incoming({ type: 'clipboard-pull', ...tag })
  clipboard.pull(tag)
  const bytes = compress
    ? Uint8Array.from(
        atob(samples[0]!.compressed),
        /* 公開native壓縮fixture。 */ (char) => char.charCodeAt(0),
      )
    : new TextEncoder().encode(text)
  clipboard.receive(hbb.Message.create({ clipboard: { content: bytes, compress } }))
  clipboard.dispose()
}
// callback有raw exact仍需原產品同tag成功返回，否則不能出文字。
it('takes actual pre-decode text only after matching original transfer succeeds', () => {
  const f = fixture(expected, true)
  deliver(f)
  const result = f.scope.__rdwebClipboardTransferDiagnostics?.takeWithText()
  expect(result?.preDecodeText).toBe(expected)
  expect(result?.preDecodeClipboard).toEqual({
    observed: true,
    compressed: false,
    uncompressedCompared: true,
    uncompressedExact: true,
    overflow: false,
    unavailable: false,
  })
  expect(result?.preTransferClipboard).toEqual({
    compared: true,
    exact: true,
    overflow: false,
    unavailable: false,
  })
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeUndefined()
  expect(f.scope.__rdwebClipboardTransferDiagnostics).toBeUndefined()
})
// 除了精確未壓縮公開內容之外，其他分支無文字來源或未獲授權。
it.each(['off', 'mismatch', 'compressed', 'missing', 'no-delivery', 'decoder-invalid', 'cancel'])(
  'returns null for %s pre-decode text',
  (mode) => {
    const f = fixture(mode === 'compressed' ? samples[0]!.plain : expected, mode !== 'off')
    if (mode === 'missing') {
      /* 沒有packet亦不能以expected補文字。 */
    } else if (mode === 'no-delivery' || mode === 'cancel') {
      f.incoming({ type: 'clipboard-pull', ...tag })
      observeIncomingClipboard(
        hbb.Message.create({ clipboard: { content: new TextEncoder().encode(expected) } }),
        tag,
        f.scope.__rdwebIncomingClipboardObserver,
      )
      if (mode === 'cancel') f.incoming({ type: 'clipboard-cancel', ...tag })
    } else
      deliver(
        f,
        mode === 'mismatch'
          ? 'Public unknown'
          : mode === 'decoder-invalid'
            ? 'Public \0invalid'
            : expected,
        mode === 'compressed',
      )
    const result = f.scope.__rdwebClipboardTransferDiagnostics?.takeWithText()
    expect(result?.preDecodeText).toBeNull()
    expect(JSON.stringify(result)).not.toContain('Public unknown')
  },
)
// 成功reply後等待取證的文字仍受原120秒deadline限制。
it('clears pending captured text at the original protection deadline after success', () => {
  vi.useFakeTimers()
  const f = fixture(expected, true)
  deliver(f)
  vi.advanceTimersByTime(120000)
  const result = f.scope.__rdwebClipboardTransferDiagnostics?.takeWithText()
  expect(result?.preDecodeText).toBeNull()
  expect(result?.preDecodeClipboard.unavailable).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
// 舊兩摘要take不應暗帶文字，並且同樣清除pending字串／保護timer。
it('preserves the legacy two-summary shape and consumes captured text with it', () => {
  vi.useFakeTimers()
  const f = fixture(expected, true)
  deliver(f)
  const result = f.scope.__rdwebClipboardTransferDiagnostics?.takeWithIncoming()
  expect(Object.keys(result ?? {}).sort()).toEqual(['preDecodeClipboard', 'preTransferClipboard'])
  expect(JSON.stringify(result)).not.toContain(expected)
  expect(f.scope.__rdwebClipboardTransferDiagnostics).toBeUndefined()
  expect(vi.getTimerCount()).toBe(0)
})
// 沒有先讀到raw exact、或tag不符的callback不能建立文字來源。
it('ignores foreign tags and refuses a text hook without raw evidence', () => {
  const f = fixture(expected, true)
  f.incoming({ type: 'clipboard-pull', ...tag })
  f.scope.__rdwebIncomingClipboardObserver!.recordText?.({ ...tag, request_id: 8 }, expected)
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeDefined()
  f.scope.__rdwebIncomingClipboardObserver!.recordText?.(tag, expected)
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.takeWithText().preDecodeText).toBeNull()
})
// 明確own flag才開capture，prototype宣告不能增加正式Worker的額外decoder。
it('does not install a text hook through an inherited setup flag', () => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  installWorkerClipboardTransferDiagnostics(
    Object.assign(Object.create({ captureText: true }), { expected, scope: 2 }),
  )
  expect(f.scope.__rdwebIncomingClipboardObserver?.recordText).toBeUndefined()
  deliver(f)
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.takeWithText().preDecodeText).toBeNull()
})
// 每案取消本次觀察，避免診斷保護timer跨測試殘留。
afterEach(() => {
  ;(
    globalThis.self as unknown as ClipboardTransferWorkerScope
  )?.__rdwebClipboardTransferDiagnostics?.cancel()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
// 移除同步比較或將decode放在postMessage後，都應使這些transfer斷言失敗。
it.each([
  [expected, true],
  ['Public other response', false],
  ['\uFEFF' + expected, false],
])('compares before the original transfer detaches bytes: %#', (value, exact) => {
  const f = fixture()
  const event = f.incoming({ type: 'clipboard-pull', ...tag })
  const bytes = new TextEncoder().encode(value)
  const message = { type: 'clipboard-data', ...tag, bytes },
    transfer = [bytes.buffer]
  f.scope.postMessage(message, transfer)
  expect(bytes.byteLength).toBe(0)
  expect(f.sent[0]).toEqual({ value: message, transfer, receiver: f.scope })
  expect(f.received).toEqual([[f.scope, event]])
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.take()).toEqual({
    compared: true,
    exact,
    overflow: false,
    unavailable: false,
  })
  expect(f.scope.postMessage).toBe(f.originalPost)
  expect(f.scope.onmessage).toBe(f.originalMessage)
  expect(f.scope.__rdwebClipboardTransferDiagnostics).toBeUndefined()
})
// 不符tag或未訂閱時不能讀bytes，也不能攔截原產品消息。
it.each(['before-pull', 'wrong-request', 'wrong-revision', 'after-cancel', 'after-take'])(
  'never reads unmatched payload: %s',
  (mode) => {
    const f = fixture()
    if (mode !== 'before-pull') f.incoming({ type: 'clipboard-pull', ...tag })
    if (mode === 'after-cancel') f.incoming({ type: 'clipboard-cancel', ...tag })
    if (mode === 'after-take') f.scope.__rdwebClipboardTransferDiagnostics?.take()
    let reads = 0
    const message = {
      type: 'clipboard-data',
      ...tag,
      request_id: mode === 'wrong-request' ? 8 : 7,
      revision: mode === 'wrong-revision' ? 2 : 1,
      // getter只驗observer是否意外讀取，不傳入真transfer。
      get bytes() {
        reads++
        throw new Error('private_payload')
      },
    }
    f.scope.postMessage(message)
    expect(reads).toBe(0)
    expect(f.sent[0]?.value).toBe(message)
    expect(f.scope.__rdwebClipboardTransferDiagnostics?.take().compared ?? false).toBe(false)
  },
)
// 不合法decode不可冒充有效mismatch，observer也不能阻止原發送。
it.each([
  new Uint8Array([255]),
  new TextEncoder().encode('Public\0invalid'),
  new Uint8Array(32769),
])('rejects invalid or oversized bytes without modifying transfer: %#', (bytes) => {
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  const message = { type: 'clipboard-data', ...tag, bytes }
  const original = new Uint8Array(bytes)
  f.scope.postMessage(message)
  expect(bytes).toEqual(original)
  expect(f.sent[0]?.value).toBe(message)
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.take()).toEqual({
    compared: false,
    exact: false,
    overflow: true,
    unavailable: true,
  })
})
// observer讀取例外只作廢摘要，不能變成產品postMessage例外。
it('isolates a throwing payload getter from product delivery', () => {
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  const message = {
    type: 'clipboard-data',
    ...tag,
    // 使用公開固定錯誤，確保診斷不把例外文字回傳。
    get bytes() {
      throw new Error('public_observer_fault')
    },
  }
  expect(() => f.scope.postMessage(message)).not.toThrow()
  expect(f.sent[0]?.value).toBe(message)
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.take()).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
})
// 同scope不可重裝、異scope不可覆寫；take缺結果或cancel後不留舊scope。
it('rejects overlapping installation and clears unavailable evidence on take', () => {
  const f = fixture()
  expect(() => installWorkerClipboardTransferDiagnostics({ expected, scope: 2 })).toThrow(
    'clipboard_transfer_diagnostics_unavailable',
  )
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.take()).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
  installWorkerClipboardTransferDiagnostics({ expected, scope: 2 })
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  expect(f.scope.onmessage).toBe(f.originalMessage)
  expect(f.scope.postMessage).toBe(f.originalPost)
})
// 保護期限只停診斷，晚到reply依原路送出且不能恢復相等證據。
it('expires after 120 seconds without affecting late delivery', () => {
  vi.useFakeTimers()
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  vi.advanceTimersByTime(120000)
  f.scope.postMessage({ type: 'clipboard-data', ...tag, bytes: new TextEncoder().encode(expected) })
  expect(f.sent).toHaveLength(1)
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.take()).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
})
// 不覆寫其他instrumentation晚安裝的handler，保留同Worker工作。
it('does not restore over a newer wrapper', () => {
  const f = fixture()
  // 新包裝不是本輪所有，不可被cancel還原。
  const newer = () => undefined
  f.scope.postMessage = newer
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  expect(f.scope.postMessage).toBe(newer)
})
// 原產品handler的receiver/event/throw都不能被診斷try/catch吞掉。
it('preserves an original handler exception', () => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  const error = new Error('public_product_fault')
  // 產品故障應照原行為往外拋，不被observer安全處理取代。
  f.scope.onmessage = function () {
    expect(this).toBe(f.scope)
    throw error
  }
  installWorkerClipboardTransferDiagnostics({ expected, scope: 2 })
  expect(() => f.incoming({ type: 'clipboard-pull', ...tag })).toThrow(error)
})
// 完整頁面選擇與evaluate用真的installer，只有瀏覽器 transport是假port。
it('selects the unique same-origin Worker and takes only four booleans', async () => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  const worker = {
    // 假URL只供同源正式資產選擇，沒有敏感票證。
    url: () => 'http://localhost/assets/protocol.worker-public.js',
    // 真正執行序列化函數，避免只驗mock被呼叫。
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
  }
  const page = {
    // 唯一頁面origin不含basePath猜測。
    url: () => 'http://localhost/console',
    // 只有這個Worker符合pattern。
    workers: () => [worker],
  } as unknown as Page
  const handle = await prepareClipboardTransferWorker(page, expected)
  f.incoming({ type: 'clipboard-pull', ...tag })
  f.scope.postMessage({ type: 'clipboard-data', ...tag, bytes: new TextEncoder().encode(expected) })
  expect(await handle.take()).toEqual({
    compared: true,
    exact: true,
    overflow: false,
    unavailable: false,
  })
  expect(await handle.take()).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
  await handle.cancel()
})
// 正式WorkerClipboard經實際codec產生owned bytes，observer不取代產品decode。
it('observes the real WorkerClipboard decoder output before transfer', () => {
  const f = fixture()
  const clipboard = new WorkerClipboard(
    1,
    /* option仍送到原同步sender，不製造成功shortcut。 */ () => undefined,
    /* 正式reply動態經scope.postMessage移交owned buffer。 */ (value, transfer) =>
      f.scope.postMessage(value, transfer),
    /* 單元測試只固定clock，不更改正式期限。 */ () => 0,
  )
  f.incoming({ type: 'clipboard-pull', ...tag })
  clipboard.pull(tag)
  const upstream = new TextEncoder().encode(expected)
  clipboard.receive(hbb.Message.create({ clipboard: { content: upstream } }))
  expect(upstream).toEqual(new TextEncoder().encode(expected))
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.take()).toEqual({
    compared: true,
    exact: true,
    overflow: false,
    unavailable: false,
  })
  expect(f.sent).toHaveLength(1)
  expect((f.sent[0]!.value as { bytes: Uint8Array }).bytes.byteLength).toBe(0)
  clipboard.dispose()
})
// raw匹配與產品reply同tag才算同一份完整證據；真正decoder與detach保留。
it.each([
  [expected, true],
  ['Public other response', false],
  ['\uFEFF' + expected, false],
])('takes incoming byte evidence and transfer evidence atomically: %#', (text, exact) => {
  const f = fixture()
  const clipboard = new WorkerClipboard(
    1,
    /* 原option／sender不被collector取代。 */ () => undefined,
    /* 真產品owned buffer經原postMessage detach。 */ (reply, transfer) =>
      f.scope.postMessage(reply, transfer),
    /* clock僅固定本公開單元fixture。 */ () => 0,
    /* 模擬entry晚安裝provider但執行真helper／decoder。 */ () =>
      f.scope.__rdwebIncomingClipboardObserver,
  )
  f.incoming({ type: 'clipboard-pull', ...tag })
  clipboard.pull(tag)
  clipboard.receive(hbb.Message.create({ clipboard: { content: new TextEncoder().encode(text) } }))
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.takeWithIncoming()).toEqual({
    preDecodeClipboard: {
      observed: true,
      compressed: false,
      uncompressedCompared: true,
      uncompressedExact: exact,
      overflow: false,
      unavailable: false,
    },
    preTransferClipboard: { compared: true, exact, overflow: false, unavailable: false },
  })
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeUndefined()
  expect(f.scope.__rdwebClipboardTransferDiagnostics).toBeUndefined()
  clipboard.dispose()
})
// 真native壓縮公開fixture只報compress，不將壓縮bytes和明文硬比。
it('does not compare compressed content with plaintext expectations', () => {
  const sample = samples[0]!,
    f = fixture(sample.plain)
  const clipboard = new WorkerClipboard(
    1,
    /* 原sender只負責option。 */ () => undefined,
    /* 原codec／transfer仍產生完整public plain。 */ (reply, transfer) =>
      f.scope.postMessage(reply, transfer),
    /* 固定真clock界限。 */ () => 0,
    /* 正式entry同款getter。 */ () => f.scope.__rdwebIncomingClipboardObserver,
  )
  f.incoming({ type: 'clipboard-pull', ...tag })
  clipboard.pull(tag)
  const bytes = Uint8Array.from(
    atob(sample.compressed),
    /* 公開fixture base64。 */ (c) => c.charCodeAt(0),
  )
  clipboard.receive(hbb.Message.create({ clipboard: { content: bytes, compress: true } }))
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.takeWithIncoming()).toEqual({
    preDecodeClipboard: {
      observed: true,
      compressed: true,
      uncompressedCompared: false,
      uncompressedExact: false,
      overflow: false,
      unavailable: false,
    },
    preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
  })
  clipboard.dispose()
})
// 非法UTF8／NUL是原decoder拒絕，不准讓raw byte mismatch當有效成功reply。
it.each([new Uint8Array([255]), new TextEncoder().encode('Public\0invalid')])(
  'makes incoming evidence unavailable when the real decoder rejects: %#',
  (bytes) => {
    const f = fixture()
    const clipboard = new WorkerClipboard(
      1,
      /* 原option按同一順序送。 */ () => undefined,
      /* 原錯誤reply交collector，不遮蓋其code。 */ (reply, transfer) =>
        f.scope.postMessage(reply, transfer),
      /* clock只用公開fixture。 */ () => 0,
      /* 只供應本輪provider。 */ () => f.scope.__rdwebIncomingClipboardObserver,
    )
    f.incoming({ type: 'clipboard-pull', ...tag })
    clipboard.pull(tag)
    clipboard.receive(hbb.Message.create({ clipboard: { content: bytes } }))
    expect(f.sent.at(-1)?.value).toMatchObject({
      type: 'clipboard-error',
      code: 'clipboard_invalid',
    })
    expect(
      f.scope.__rdwebClipboardTransferDiagnostics?.takeWithIncoming().preDecodeClipboard
        .unavailable,
    ).toBe(true)
    clipboard.dispose()
  },
)
// 原raw callback有資料但產品未交同tag成功reply，不能冒稱完整取證。
it('requires a matching product reply and ignores wrong-tag observations', () => {
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  const message = hbb.Message.create({ clipboard: { content: new TextEncoder().encode(expected) } })
  observeIncomingClipboard(
    message,
    { ...tag, request_id: 8 },
    f.scope.__rdwebIncomingClipboardObserver,
  )
  observeIncomingClipboard(message, tag, f.scope.__rdwebIncomingClipboardObserver)
  const evidence =
    f.scope.__rdwebClipboardTransferDiagnostics?.takeWithIncoming().preDecodeClipboard
  expect(evidence).toMatchObject({ observed: true, uncompressedExact: true, unavailable: true })
})
// 64次容量以沒有Text的實際觀察呼叫累計，超過後不再讀payload。
it('bounds incoming observation attempts and clears the installed provider', () => {
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  const observer = f.scope.__rdwebIncomingClipboardObserver
  for (let i = 0; i < 65; i++)
    observeIncomingClipboard(hbb.Message.create({ clipboard: { format: 1 } }), tag, observer)
  expect(
    f.scope.__rdwebClipboardTransferDiagnostics?.takeWithIncoming().preDecodeClipboard,
  ).toMatchObject({
    observed: false,
    overflow: true,
    unavailable: true,
  })
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeUndefined()
})
// Worker helper Main側一次evaluate原子取出，不分兩次跨終態讀摘要。
it('takes both evidence objects once through the Playwright handle', async () => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  const page = {
    // 同源selector沿正式資產樣式。
    url: () => 'http://localhost/console',
    // 真執行installer及atomic take函數，不fake布林結果。
    workers: () => [
      {
        url: /* 唯一Worker URL。 */ () => 'http://localhost/assets/protocol.worker-public.js',
        evaluate: /* 原子執行call，不改產品訊息。 */ async (
          fn: (arg: unknown) => unknown,
          arg: unknown,
        ) => fn(arg),
      },
    ],
  } as unknown as Page
  const handle = await prepareClipboardTransferWorker(page, expected)
  f.incoming({ type: 'clipboard-pull', ...tag })
  observeIncomingClipboard(
    hbb.Message.create({ clipboard: { content: new TextEncoder().encode(expected) } }),
    tag,
    f.scope.__rdwebIncomingClipboardObserver,
  )
  f.scope.postMessage({ type: 'clipboard-data', ...tag, bytes: new TextEncoder().encode(expected) })
  const result = await handle.takeWithIncoming()
  expect(result.preDecodeClipboard).toEqual({
    observed: true,
    compressed: false,
    uncompressedCompared: true,
    uncompressedExact: true,
    overflow: false,
    unavailable: false,
  })
  expect(result.preTransferClipboard.exact).toBe(true)
  expect((await handle.takeWithIncoming()).preDecodeClipboard.unavailable).toBe(true)
  expect((await handle.take()).unavailable).toBe(true)
  await handle.cancel()
})
// 沒有解碼前hook的產品reply只能保留transfer證據，不得借用其true補raw綠燈。
it('does not infer incoming evidence from a successful transfer alone', () => {
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  f.scope.postMessage({ type: 'clipboard-data', ...tag, bytes: new TextEncoder().encode(expected) })
  const result = f.scope.__rdwebClipboardTransferDiagnostics?.takeWithIncoming()
  expect(result?.preTransferClipboard.exact).toBe(true)
  expect(result?.preDecodeClipboard).toEqual({
    observed: false,
    compressed: false,
    uncompressedCompared: false,
    uncompressedExact: false,
    overflow: false,
    unavailable: true,
  })
})
// 舊observer引用在cancel／deadline之後也必須拒絕，不能讀晚到message。
it.each(['cancel', 'deadline'])('never reads incoming payload after %s', (mode) => {
  vi.useFakeTimers()
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  const observer = f.scope.__rdwebIncomingClipboardObserver
  if (mode === 'cancel') f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  else vi.advanceTimersByTime(120000)
  let reads = 0
  const message = {
    // 原helper應在此getter之前由expected=null返回。
    get clipboard() {
      reads++
      throw new Error('public_late_clipboard')
    },
  } as unknown as hbb.Message
  observeIncomingClipboard(message, tag, observer)
  expect(reads).toBe(0)
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeUndefined()
})
// 卸載只刪本輪provider，不能清掉別的工作晚安裝的hook。
it('preserves a newer incoming observer when cancelling its own scope', () => {
  const f = fixture()
  const newer = {
    // 外部scope由外部owner取消，這裡不供fixture。
    expected: () => null,
    // 外部observer本案不處理產品資料。
    record: () => undefined,
    // 外部scope的錯誤狀態不可被本輪寫入。
    unavailable: () => undefined,
  }
  f.scope.__rdwebIncomingClipboardObserver = newer
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  expect(f.scope.__rdwebIncomingClipboardObserver).toBe(newer)
})
// 原transport拋錯仍原封拋出，raw metadata不能誤當成功交付。
it('marks incoming evidence unavailable if the original transfer throws', () => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  const error = new Error('public_native_transfer_fault')
  // 只在本fixture故障原sender，沒有產品成功捷徑。
  f.scope.postMessage = () => {
    throw error
  }
  installWorkerClipboardTransferDiagnostics({ expected, scope: 2 })
  f.incoming({ type: 'clipboard-pull', ...tag })
  observeIncomingClipboard(
    hbb.Message.create({ clipboard: { content: new TextEncoder().encode(expected) } }),
    tag,
    f.scope.__rdwebIncomingClipboardObserver,
  )
  expect(() =>
    f.scope.postMessage({
      type: 'clipboard-data',
      ...tag,
      bytes: new TextEncoder().encode(expected),
    }),
  ).toThrow(error)
  expect(
    f.scope.__rdwebClipboardTransferDiagnostics?.takeWithIncoming().preDecodeClipboard.unavailable,
  ).toBe(true)
})
// 任何取消／terminal都作廢短命expected，不准晚到reply復活。
it.each(['clipboard-error', 'clipboard-cancelled', 'failure', 'disposed'])(
  'clears expected on matching %s',
  (type) => {
    const f = fixture()
    f.incoming({ type: 'clipboard-pull', ...tag })
    f.scope.postMessage({ type, ...tag })
    let reads = 0
    f.scope.postMessage({
      type: 'clipboard-data',
      ...tag,
      // 取消後的bytes getter不得被observer碰觸。
      get bytes() {
        reads++
        throw new Error('public_late_payload')
      },
    })
    expect(reads).toBe(0)
    expect(f.sent).toHaveLength(2)
    expect(f.scope.__rdwebClipboardTransferDiagnostics?.take().unavailable).toBe(true)
  },
)
// 原postMessage的throw仍是產品例外；不被observer安全catch吞掉。
it('preserves the original postMessage exception and receiver', () => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  const error = new Error('public_transfer_fault')
  // 合成transport錯誤不包含真剪貼簿或workerruntime資料。
  f.scope.postMessage = function () {
    expect(this).toBe(f.scope)
    throw error
  }
  installWorkerClipboardTransferDiagnostics({ expected, scope: 2 })
  f.incoming({ type: 'clipboard-pull', ...tag })
  expect(() =>
    f.scope.postMessage({
      type: 'clipboard-data',
      ...tag,
      bytes: new TextEncoder().encode(expected),
    }),
  ).toThrow(error)
})
// 非公開／超額／無效Unicode與錯scope在安裝前拒絕，不更改原handler。
it.each([
  { expected: 'Private value', scope: 1 },
  { expected: 'Public ' + '中'.repeat(2000), scope: 1 },
  { expected: 'Public \0invalid', scope: 1 },
  { expected: 'Public \uD800invalid', scope: 1 },
  { expected, scope: 0 },
])('rejects invalid setup without changing product handlers: %#', (config) => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  expect(() => installWorkerClipboardTransferDiagnostics(config)).toThrow(
    'clipboard_transfer_diagnostics_unavailable',
  )
  expect(f.scope.onmessage).toBe(f.originalMessage)
  expect(f.scope.postMessage).toBe(f.originalPost)
})
// 邊界32768有效bytes仍能比較；不能把等於上限誤拒絕。
it('compares valid bytes exactly at the 32768-byte limit', () => {
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  f.scope.postMessage({
    type: 'clipboard-data',
    ...tag,
    bytes: new TextEncoder().encode('a'.repeat(32768)),
  })
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.take()).toEqual({
    compared: true,
    exact: false,
    overflow: false,
    unavailable: false,
  })
})
// helper真的執行installer；只在讀摘要時模擬瀏覽器阻塞或異常回覆。
function handleFixture(reply: Promise<unknown>) {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  let calls = 0
  const page = {
    // 公開測試origin，不讀任何真browser或Windows內容。
    url: () => 'http://localhost/console',
    // 第二次evaluate為take；其餘都真的執行同scope setup／cleanup。
    workers: () => [
      {
        // 使用正式compiled Worker命名樣式。
        url: () => 'http://localhost/assets/protocol.worker-public.js',
        // 對讀摘要施加不良回覆，驗handle本身拒絕而非mock呼叫。
        evaluate: (fn: (arg: unknown) => unknown, arg: unknown) =>
          ++calls === 2 ? reply : Promise.resolve(fn(arg)),
      },
    ],
  } as unknown as Page
  return { ...f, page }
}
// Main handle需一次evaluate原子取兩摘要與公開文字，不能把expected當回覆。
it('takes pre-decode text once through the real Worker installer and handle', async () => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  const page = {
    url: /* 原同源page selector。 */ () => 'http://localhost/console',
    workers: /* 只用本案唯一Worker與真installer／take。 */ () => [
      {
        url: /* 正式asset樣式不替換其他Worker。 */ () =>
          'http://localhost/assets/protocol.worker-public.js',
        evaluate: /* 真執行序列化函數，不假造成功摘要。 */ async (
          fn: (arg: unknown) => unknown,
          arg: unknown,
        ) => fn(arg),
      },
    ],
  } as unknown as Page
  const handle = await prepareClipboardTransferWorker(page, expected, true)
  deliver(f)
  const result = await handle.takeWithText()
  expect(result.preDecodeText).toBe(expected)
  expect(result.preDecodeClipboard.uncompressedExact).toBe(true)
  expect(result.preTransferClipboard.exact).toBe(true)
  expect((await handle.takeWithIncoming()).preDecodeClipboard.unavailable).toBe(true)
  expect((await handle.takeWithText()).preDecodeText).toBeNull()
})
// reply的原文須matching expected及所有證據，額外raw／prototype／getter不得逃過Main。
it.each([
  'wrong',
  'extra',
  'missing',
  'compressed',
  'no-observation',
  'raw-not-exact',
  'transfer-not-exact',
  'prototype',
  'getter',
])('refuses %s captured clipboard text in a Worker response', async (mode) => {
  const value = {
    preDecodeClipboard: {
      observed: true,
      compressed: false,
      uncompressedCompared: true,
      uncompressedExact: true,
      overflow: false,
      unavailable: false,
    },
    preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
    preDecodeText: expected,
  }
  if (mode === 'wrong') value.preDecodeText = 'Public unknown'
  if (mode === 'extra') Object.assign(value, { raw: [65] })
  if (mode === 'missing') Reflect.deleteProperty(value, 'preDecodeText')
  if (mode === 'compressed') value.preDecodeClipboard.compressed = true
  if (mode === 'no-observation') value.preDecodeClipboard.observed = false
  if (mode === 'raw-not-exact') value.preDecodeClipboard.uncompressedExact = false
  if (mode === 'transfer-not-exact') value.preTransferClipboard.exact = false
  if (mode === 'prototype')
    value.preDecodeClipboard = Object.assign(Object.create(value.preDecodeClipboard), {
      a: true,
      b: true,
      c: true,
      d: true,
      e: true,
      f: true,
    })
  if (mode === 'getter')
    Object.defineProperty(value, 'preDecodeText', {
      get: /* getter錯誤只能作廢診斷。 */ () => {
        throw new Error('public_bad_text_getter')
      },
    })
  const f = handleFixture(Promise.resolve(value)),
    handle = await prepareClipboardTransferWorker(f.page, expected, true)
  const result = await handle.takeWithText()
  expect(result.preDecodeText).toBeNull()
  expect(result.preDecodeClipboard.unavailable).toBe(true)
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeUndefined()
})
// nested欄位若驗好後getter換另一份DTO，不能把未知字串冒充boolean帶到Node。
it('rejects a changing nested evidence getter before copying a captured response', async () => {
  const raw = {
    observed: true,
    compressed: false,
    uncompressedCompared: true,
    uncompressedExact: true,
    overflow: false,
    unavailable: false,
  }
  let reads = 0
  const value = {
    preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
    preDecodeText: expected,
    // 只有本public fixture有此不良DTO，第一份合法、第二份不合法。
    get preDecodeClipboard() {
      return ++reads === 1 ? raw : { ...raw, observed: 'Public unknown_in_boolean' }
    },
  }
  const f = handleFixture(Promise.resolve(value)),
    handle = await prepareClipboardTransferWorker(f.page, expected, true)
  const result = await handle.takeWithText()
  expect(result.preDecodeText).toBeNull()
  expect(result.preDecodeClipboard.unavailable).toBe(true)
  expect(JSON.stringify(result)).not.toContain('Public unknown_in_boolean')
})
// 原diag decoder不獲內容相等佐證時不解碼，故障後原產品data仍維持。
it('clears captured text when the opt-in callback faults but preserves product data', () => {
  const f = fixture(expected, true)
  f.scope.__rdwebIncomingClipboardObserver!.recordText = /* 本synthetic observer失效。 */ () => {
    throw new Error('public_text_callback_fault')
  }
  deliver(f)
  expect(f.sent[0]?.value).toMatchObject({ type: 'clipboard-data', ...tag })
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.takeWithText().preDecodeText).toBeNull()
})
// 字串即使已轉換，也不是成功交付ACK；原transport失敗不能保存。
it('drops pre-decode text if the original product transfer throws', () => {
  const f = fixture()
  f.scope.__rdwebClipboardTransferDiagnostics?.cancel()
  const error = new Error('public_transfer_fault')
  // 故障只作用本案transport，不吞掉原throw。
  f.scope.postMessage = () => {
    throw error
  }
  installWorkerClipboardTransferDiagnostics({ expected, scope: 2, captureText: true })
  f.incoming({ type: 'clipboard-pull', ...tag })
  observeIncomingClipboard(
    hbb.Message.create({ clipboard: { content: new TextEncoder().encode(expected) } }),
    tag,
    f.scope.__rdwebIncomingClipboardObserver,
  )
  expect(() =>
    f.scope.postMessage({
      type: 'clipboard-data',
      ...tag,
      bytes: new TextEncoder().encode(expected),
    }),
  ).toThrow(error)
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.takeWithText().preDecodeText).toBeNull()
})
// text take同樣2000ms截止，晚到回覆不復活、不能再用其他take讀取。
it('bounds pre-decode text take and rejects a late captured result', async () => {
  vi.useFakeTimers()
  let resolve!: (value: unknown) => void
  const reply = new Promise(
    /* 外部transport只控制settlement，不供應真文字。 */ (r) => {
      resolve = r
    },
  )
  const f = handleFixture(reply),
    handle = await prepareClipboardTransferWorker(f.page, expected, true)
  const pending = handle.takeWithText()
  await vi.advanceTimersByTimeAsync(2000)
  expect(await pending).toMatchObject({
    preDecodeText: null,
    preDecodeClipboard: { unavailable: true },
  })
  resolve({
    preDecodeClipboard: {
      observed: true,
      compressed: false,
      uncompressedCompared: true,
      uncompressedExact: true,
      overflow: false,
      unavailable: false,
    },
    preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
    preDecodeText: expected,
  })
  expect((await handle.take()).unavailable).toBe(true)
})
// 新nested schema必須同時有六／四個own boolean，不能夾raw或繼承欄位。
it.each([
  {
    preDecodeClipboard: {
      observed: true,
      compressed: false,
      uncompressedCompared: true,
      uncompressedExact: true,
      overflow: false,
      unavailable: false,
      text: 'Public denied',
    },
    preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
  },
  {
    preDecodeClipboard: { observed: true },
    preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
  },
  {
    preDecodeClipboard: {
      observed: true,
      compressed: false,
      uncompressedCompared: true,
      uncompressedExact: true,
      overflow: false,
      unavailable: false,
    },
    preTransferClipboard: { compared: true, exact: 1, overflow: false, unavailable: false },
  },
])('refuses unsafe atomic summary results: %#', async (value) => {
  const f = handleFixture(Promise.resolve(value)),
    handle = await prepareClipboardTransferWorker(f.page, expected)
  const result = await handle.takeWithIncoming()
  expect(result.preDecodeClipboard.unavailable).toBe(true)
  expect(result.preTransferClipboard.unavailable).toBe(true)
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeUndefined()
})
// atomic take同樣有2000ms期限、與舊take共享一次消費guard。
it('times out atomic take without reviving a late nested response', async () => {
  vi.useFakeTimers()
  let resolve!: (value: unknown) => void
  const reply = new Promise(
    /* 外部假transport只控制settlement時間。 */ (r) => {
      resolve = r
    },
  )
  const f = handleFixture(reply),
    handle = await prepareClipboardTransferWorker(f.page, expected)
  const pending = handle.takeWithIncoming()
  await vi.advanceTimersByTimeAsync(2000)
  expect((await pending).preDecodeClipboard.unavailable).toBe(true)
  resolve({
    preDecodeClipboard: {
      observed: true,
      compressed: false,
      uncompressedCompared: true,
      uncompressedExact: true,
      overflow: false,
      unavailable: false,
    },
    preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
  })
  expect((await handle.take()).unavailable).toBe(true)
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeUndefined()
})
// 異常回覆的getter亦只能作廢診斷，不把任意例外丟到oracle finally。
it('isolates throwing getters while validating an atomic response', async () => {
  const value = {
    // 不良外部DTO只能由本測試建立，不含真payload。
    get preTransferClipboard() {
      throw new Error('public_bad_summary_getter')
    },
    preDecodeClipboard: {
      observed: true,
      compressed: false,
      uncompressedCompared: true,
      uncompressedExact: true,
      overflow: false,
      unavailable: false,
    },
  }
  const f = handleFixture(Promise.resolve(value)),
    handle = await prepareClipboardTransferWorker(f.page, expected)
  await expect(handle.takeWithIncoming()).resolves.toMatchObject({
    preDecodeClipboard: { unavailable: true },
    preTransferClipboard: { unavailable: true },
  })
  expect(f.scope.__rdwebIncomingClipboardObserver).toBeUndefined()
})
// 固定四boolean外任何額外資料不得通過Main側schema。
it.each([
  { compared: true, exact: true, overflow: false, unavailable: false, text: 'Public raw' },
  { compared: true, exact: 1, overflow: false, unavailable: false },
  { compared: true, exact: true, overflow: false },
])('refuses malformed take results and clears its scope: %#', async (result) => {
  const f = handleFixture(Promise.resolve(result))
  const handle = await prepareClipboardTransferWorker(f.page, expected)
  expect(await handle.take()).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
  expect(f.scope.__rdwebClipboardTransferDiagnostics).toBeUndefined()
})
// 2000ms原oracle後取證期限及晚回覆隔離，不能悄悄延長deadline。
it('times out take and ignores a late response', async () => {
  vi.useFakeTimers()
  let resolve!: (value: unknown) => void
  const reply = new Promise(
    /* 本測試掌握晚回覆，沒有產品或OS等待。 */ (r) => {
      resolve = r
    },
  )
  const f = handleFixture(reply)
  const handle = await prepareClipboardTransferWorker(f.page, expected)
  const result = handle.take()
  await vi.advanceTimersByTimeAsync(2000)
  expect(await result).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
  resolve({ compared: true, exact: true, overflow: false, unavailable: false })
  await Promise.resolve()
  expect(await handle.take()).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
  expect(f.scope.__rdwebClipboardTransferDiagnostics).toBeUndefined()
})
// 背景timer尚未派送時也不能接受超過120秒的payload。
it('rejects an expired reply even before the safety timer fires', () => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockReturnValue(0)
  const f = fixture()
  f.incoming({ type: 'clipboard-pull', ...tag })
  vi.mocked(performance.now).mockReturnValue(120000)
  let reads = 0
  f.scope.postMessage({
    type: 'clipboard-data',
    ...tag,
    // 截止即不再讀任何晚到內容。
    get bytes() {
      reads++
      throw new Error('public_expired_payload')
    },
  })
  expect(reads).toBe(0)
  expect(f.scope.__rdwebClipboardTransferDiagnostics?.take().unavailable).toBe(true)
})
// 四個任意own欄位不可藉由prototype繼承的合法booleans通過schema。
it('rejects inherited summary booleans with extra own payload fields', async () => {
  const result = Object.assign(
    Object.create({ compared: true, exact: true, overflow: false, unavailable: false }),
    { text: 'Public raw', bytes: [65], hash: 'public_denied', scope: 1 },
  )
  const f = handleFixture(Promise.resolve(result))
  const handle = await prepareClipboardTransferWorker(f.page, expected)
  expect(await handle.take()).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
})
// cancel與pending take競態必須先清scope；late green不可恢復本輪。
it('cancels a pending take without restoring late evidence', async () => {
  let resolve!: (value: unknown) => void
  const reply = new Promise(
    /* 公開late摘要不帶任何payload。 */ (r) => {
      resolve = r
    },
  )
  const f = handleFixture(reply)
  const handle = await prepareClipboardTransferWorker(f.page, expected)
  const result = handle.take()
  await handle.cancel()
  resolve({ compared: true, exact: true, overflow: false, unavailable: false })
  expect(await result).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
  expect(f.scope.__rdwebClipboardTransferDiagnostics).toBeUndefined()
})
// 舊handle不得取出或取消另一scope，即使相同Worker已換新的測試控制物件。
it('does not take or cancel a different Worker scope', async () => {
  const f = handleFixture(Promise.resolve(undefined))
  const handle = await prepareClipboardTransferWorker(f.page, expected)
  const previous = f.scope.__rdwebClipboardTransferDiagnostics!
  let touched = false
  const foreign = {
    scope: previous.scope + 1,
    // 新take不得越過scope取外部文字，提供完整port契約。
    takeWithText() {
      touched = true
      return {
        preDecodeClipboard: {
          observed: false,
          compressed: false,
          uncompressedCompared: false,
          uncompressedExact: false,
          overflow: false,
          unavailable: true,
        },
        preTransferClipboard: { compared: false, exact: false, overflow: false, unavailable: true },
        preDecodeText: null,
      }
    },
    // 錯scope原子take亦不得呼叫，保持完整新port契約。
    takeWithIncoming() {
      touched = true
      return {
        preDecodeClipboard: {
          observed: true,
          compressed: false,
          uncompressedCompared: true,
          uncompressedExact: true,
          overflow: false,
          unavailable: false,
        },
        preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
      }
    },
    // 錯scope的take永不呼叫，避免舊handle消費新摘要。
    take() {
      touched = true
      return { compared: true, exact: true, overflow: false, unavailable: false }
    },
    // 錯scope的cancel永不呼叫，避免破壞新觀察器。
    cancel() {
      touched = true
    },
  }
  f.scope.__rdwebClipboardTransferDiagnostics = foreign
  expect(await handle.take()).toEqual({
    compared: false,
    exact: false,
    overflow: false,
    unavailable: true,
  })
  await handle.cancel()
  expect(f.scope.__rdwebClipboardTransferDiagnostics).toBe(foreign)
  expect(touched).toBe(false)
  previous.cancel()
})
// 無唯一同源正式Worker時setup失敗，不裝到外部或任意Worker。
it.each([
  [],
  ['http://other/assets/protocol.worker-a.js'],
  ['http://localhost/assets/protocol.worker-a.js', 'http://localhost/assets/protocol.worker-b.js'],
])('refuses unavailable or ambiguous Worker selection: %#', async (...urls) => {
  const page = {
    // 公開origin僅用於測試同源篩選。
    url: () => 'http://localhost/console',
    // 不可被選中的Worker沒有evaluate，不容許誤注入。
    workers: () => urls.map(/* 每個Worker保留自己的URL。 */ (url) => ({ url: () => url })),
  } as unknown as Page
  await expect(prepareClipboardTransferWorker(page, expected)).rejects.toThrow(
    'clipboard_transfer_diagnostics_unavailable',
  )
})
