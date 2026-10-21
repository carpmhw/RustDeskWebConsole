import type { Page } from '@playwright/test'
import type {
  IncomingClipboardObserver,
  PreDecodeClipboardEvidence,
} from '../../src/rdweb/incoming-clipboard-observer'
export type { PreDecodeClipboardEvidence } from '../../src/rdweb/incoming-clipboard-observer'

export interface PreTransferClipboardEvidence {
  compared: boolean
  exact: boolean
  overflow: boolean
  unavailable: boolean
}
export interface ClipboardTransferDiagnostics {
  // 只在原oracle後讀取固定布林，不取得payload。
  take(): Promise<PreTransferClipboardEvidence>
  // 同scope一次取出解碼前及transfer前布林，不傳回任何raw資料。
  takeWithIncoming(): Promise<ClipboardTransferEvidence>
  // 同scope取兩摘要及opt-in公開文字，其他回null。
  takeWithText(): Promise<ClipboardTransferCapture>
  // 清本輪診斷，不取消產品clipboard操作。
  cancel(): Promise<void>
}
export interface ClipboardTransferEvidence {
  preDecodeClipboard: PreDecodeClipboardEvidence
  preTransferClipboard: PreTransferClipboardEvidence
}
export interface ClipboardTransferCapture extends ClipboardTransferEvidence {
  preDecodeText: string | null
}
export interface ClipboardTransferWorkerScope {
  onmessage: ((this: unknown, event: MessageEvent) => void) | null
  // 沿原Worker同步transport移交，不保存payload。
  postMessage(value: unknown, transfer?: Transferable[]): void
  __rdwebIncomingClipboardObserver?: IncomingClipboardObserver
  __rdwebClipboardTransferDiagnostics?: {
    scope: number
    // 摘要取出即清，不能重讀或帶出文字。
    take(): PreTransferClipboardEvidence
    // 原子取出兩份固定摘要；舊take介面保持四boolean。
    takeWithIncoming(): ClipboardTransferEvidence
    // opt-in公開文字取出後清引用，舊take仍只回原摘要。
    takeWithText(): ClipboardTransferCapture
    // 停止觀察及清理本輪引用。
    cancel(): void
  }
}
// 可序列化test-only接點：借用owned bytes在原postMessage transfer之前同步比較。
export function installWorkerClipboardTransferDiagnostics(value: {
  expected: string
  scope: number
  captureText?: boolean
}): void {
  const worker = self as unknown as ClipboardTransferWorkerScope
  if (
    worker.__rdwebClipboardTransferDiagnostics ||
    worker.__rdwebIncomingClipboardObserver ||
    !Number.isSafeInteger(value.scope) ||
    value.scope < 1 ||
    typeof value.expected !== 'string' ||
    !value.expected.startsWith('Public ') ||
    value.expected.length > 4096 ||
    value.expected.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      value.expected,
    ) ||
    new TextEncoder().encode(value.expected).length > 4096 ||
    (Object.hasOwn(value, 'captureText') && typeof value.captureText !== 'boolean') ||
    typeof worker.postMessage !== 'function' ||
    typeof worker.onmessage !== 'function'
  )
    throw new Error('clipboard_transfer_diagnostics_unavailable')
  const id = value.scope
  const captureText = Object.hasOwn(value, 'captureText') && value.captureText === true
  const deadline = performance.now() + 120000
  let expected = value.expected
  // 不讓初始config物件成為另一份長命expected引用。
  value = { expected: '', scope: id }
  let enabled = true,
    pull: { revision: number; request_id: number } | null = null
  const evidence: PreTransferClipboardEvidence = {
    compared: false,
    exact: false,
    overflow: false,
    unavailable: false,
  }
  const incoming: PreDecodeClipboardEvidence = {
    observed: false,
    compressed: false,
    uncompressedCompared: false,
    uncompressedExact: false,
    overflow: false,
    unavailable: false,
  }
  let attempts = 0,
    incomingReplyMatched = false
  let capturedText: string | null = null
  const originalMessage = worker.onmessage,
    originalPost = worker.postMessage
  // tag只能來自本輪首筆有效pull，不能由回覆資料自行建立。
  function matches(message: Record<string, unknown>): boolean {
    return !!pull && message.revision === pull.revision && message.request_id === pull.request_id
  }
  // 只還原仍由本輪擁有的包裝；同Worker新instrumentation不能被覆寫。
  function stop(unavailable = false): void {
    enabled = false
    expected = ''
    pull = null
    evidence.unavailable ||= unavailable
    incoming.unavailable ||= unavailable
    if (unavailable) capturedText = null
    // 成功交付後待取文字仍受原保護期限限制，不能留下無期限的字串。
    if (capturedText === null) clearTimeout(timer)
    if (worker.onmessage === onmessage) worker.onmessage = originalMessage
    if (worker.postMessage === postMessage) worker.postMessage = originalPost
    if (worker.__rdwebIncomingClipboardObserver === incomingObserver)
      delete worker.__rdwebIncomingClipboardObserver
  }
  // observer例外與產品例外分界：try/catch僅含被動觀察，不包原handler。
  function onmessage(this: unknown, event: MessageEvent): void {
    try {
      if (enabled && performance.now() >= deadline) stop(true)
      if (enabled) {
        const message = event.data as Record<string, unknown> | null
        if (message?.type === 'clipboard-pull') {
          if (
            pull ||
            !Number.isSafeInteger(message.revision) ||
            Number(message.revision) < 1 ||
            !Number.isSafeInteger(message.request_id) ||
            Number(message.request_id) < 1
          )
            stop(true)
          else
            pull = {
              revision: message.revision as number,
              request_id: message.request_id as number,
            }
        } else if (message?.type === 'clipboard-cancel' && matches(message)) stop(true)
        else if (message?.type === 'dispose' && (!pull || message.revision === pull.revision))
          stop(true)
      }
    } catch {
      stop(true)
    }
    originalMessage?.call(this, event)
  }
  // Reflect保留原receiver、所有overload參數與原postMessage例外／回傳值。
  function postMessage(
    this: unknown,
    ...args: Parameters<ClipboardTransferWorkerScope['postMessage']>
  ): void {
    let confirmIncoming = false
    try {
      if (enabled && performance.now() >= deadline) stop(true)
      const message = args[0] as Record<string, unknown> | null
      if (enabled && message && typeof message === 'object') {
        if (message.type === 'clipboard-data' && matches(message)) {
          confirmIncoming = incoming.observed
          let text = ''
          try {
            const bytes = message.bytes
            if (
              !(bytes instanceof Uint8Array) ||
              !(bytes.buffer instanceof ArrayBuffer) ||
              bytes.byteLength > 32768
            ) {
              evidence.overflow = true
              throw new Error()
            }
            try {
              text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
              if (text.includes('\0')) throw new Error()
            } catch {
              evidence.overflow = true
              throw new Error()
            }
            evidence.compared = true
            evidence.exact = text === expected
          } finally {
            text = ''
            stop()
          }
        } else if (
          ['clipboard-error', 'clipboard-cancelled'].includes(String(message.type)) &&
          matches(message)
        )
          stop(true)
        else if (
          ['failure', 'disposed'].includes(String(message.type)) &&
          (!pull || message.revision === pull.revision)
        )
          stop(true)
      }
    } catch {
      stop(true)
    }
    try {
      const result = Reflect.apply(originalPost, this, args)
      if (confirmIncoming) incomingReplyMatched = true
      return result
    } catch (error) {
      if (confirmIncoming) {
        incoming.unavailable = true
        capturedText = null
        clearTimeout(timer)
      }
      throw error
    }
  }
  const incomingObserver: IncomingClipboardObserver = {
    // 真active tag與本輪scope都匹配才供應同一public expected，不留另一份副本。
    expected(tag): string | null {
      if (enabled && performance.now() >= deadline) stop(true)
      if (!enabled || !matches(tag as unknown as Record<string, unknown>) || incoming.observed)
        return null
      if (++attempts > 64) {
        incoming.overflow = true
        stop(true)
        return null
      }
      return expected
    },
    // callback只拿六boolean與獨立tag，不能把原message或bytes帶到Main。
    record(value): void {
      if (enabled && performance.now() >= deadline) stop(true)
      if (!enabled || !matches(value as unknown as Record<string, unknown>) || incoming.observed)
        return
      const fields = [
        'observed',
        'compressed',
        'uncompressedCompared',
        'uncompressedExact',
        'overflow',
        'unavailable',
      ] as const
      if (
        Object.keys(value).length !== 8 ||
        fields.some(
          /* 拒絕缺欄／extra／prototype及非boolean。 */ (field) =>
            !Object.hasOwn(value, field) || typeof value[field] !== 'boolean',
        )
      ) {
        incoming.unavailable = true
        stop(true)
        return
      }
      for (const field of fields) incoming[field] = value[field]
    },
    // 原decoder仍照常做admission，這裡不改產品成功／失敗條件。
    unavailable(tag, overflow = false): void {
      if (!enabled || !matches(tag as unknown as Record<string, unknown>)) return
      incoming.overflow ||= overflow
      incoming.unavailable = true
      stop(true)
    },
  }
  if (captureText)
    incomingObserver.recordText = /* 只收原helper轉換且同tag／raw exact的公開字串。 */ (
      tag,
      text,
    ): void => {
      if (performance.now() >= deadline) stop(true)
      if (!enabled || !matches(tag as unknown as Record<string, unknown>)) return
      if (
        !incoming.observed ||
        incoming.compressed ||
        !incoming.uncompressedCompared ||
        !incoming.uncompressedExact ||
        incoming.overflow ||
        incoming.unavailable ||
        typeof text !== 'string' ||
        text !== expected ||
        capturedText !== null
      ) {
        stop(true)
        return
      }
      capturedText = text
    }
  const port = {
    scope: id,
    // 真原transport成功返回才回公開字串，與舊take共用一次消費及清除。
    takeWithText(): ClipboardTransferCapture {
      if (performance.now() >= deadline) stop(true)
      const preDecodeText =
        captureText &&
        incomingReplyMatched &&
        incoming.observed &&
        !incoming.compressed &&
        incoming.uncompressedCompared &&
        incoming.uncompressedExact &&
        !incoming.overflow &&
        !incoming.unavailable &&
        evidence.compared &&
        evidence.exact &&
        !evidence.overflow &&
        !evidence.unavailable
          ? capturedText
          : null
      return { ...port.takeWithIncoming(), preDecodeText }
    },
    // 同一同步呼叫先截六boolean再清四boolean與所有自有引用。
    takeWithIncoming(): ClipboardTransferEvidence {
      if (enabled && performance.now() >= deadline) stop(true)
      const preDecodeClipboard = {
        ...incoming,
        unavailable: incoming.unavailable || !incomingReplyMatched,
      }
      return { preDecodeClipboard, preTransferClipboard: port.take() }
    },
    // 只回獨立四boolean，無tag／原文／buffer，取出後不可復用。
    take(): PreTransferClipboardEvidence {
      if (enabled && performance.now() >= deadline) stop(true)
      stop(!evidence.compared)
      capturedText = null
      clearTimeout(timer)
      if (worker.__rdwebClipboardTransferDiagnostics === port)
        delete worker.__rdwebClipboardTransferDiagnostics
      return { ...evidence }
    },
    // 即使未發pull亦清setup expected，不發任何產品控制消息。
    cancel(): void {
      stop(true)
      if (worker.__rdwebClipboardTransferDiagnostics === port)
        delete worker.__rdwebClipboardTransferDiagnostics
    },
  }
  const timer = setTimeout(/* 保護期限只停止診斷，不延長clipboard期限。 */ () => stop(true), 120000)
  worker.__rdwebClipboardTransferDiagnostics = port
  worker.__rdwebIncomingClipboardObserver = incomingObserver
  worker.onmessage = onmessage
  worker.postMessage = postMessage
}

let nextScope = 0
// 只在原HR logger opt-in接線選唯一同源正式Worker；不改URL或安全設定。
export async function prepareClipboardTransferWorker(
  page: Page,
  publicExpected: string,
  captureText = false,
): Promise<ClipboardTransferDiagnostics> {
  if (typeof captureText !== 'boolean')
    throw new Error('clipboard_transfer_diagnostics_unavailable')
  let allowedExpected = captureText ? publicExpected : ''
  const origin = new URL(page.url()).origin
  const workers = page.workers().filter(
    /* 不選其他frame／外部或合成Worker。 */ (worker) => {
      try {
        const url = new URL(worker.url())
        return url.origin === origin && /\/assets\/protocol\.worker-[\w-]+\.js$/.test(url.pathname)
      } catch {
        return false
      }
    },
  )
  if (workers.length !== 1 || nextScope >= Number.MAX_SAFE_INTEGER)
    throw new Error('clipboard_transfer_diagnostics_unavailable')
  const worker = workers[0]!,
    scope = ++nextScope
  try {
    await worker.evaluate(installWorkerClipboardTransferDiagnostics, {
      expected: publicExpected,
      scope,
      ...(captureText ? { captureText: true } : {}),
    })
  } catch {
    throw new Error('clipboard_transfer_diagnostics_unavailable')
  }
  let consumed = false,
    cancelled = false
  // 缺資料不能當有效不相等，僅回固定安全狀態。
  function unavailable(): PreTransferClipboardEvidence {
    return { compared: false, exact: false, overflow: false, unavailable: true }
  }
  // Promise晚settle已被接住，但不能改變本輪已交付結果。
  async function bounded<T>(promise: Promise<T>): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = performance.now() + 2000
    try {
      const result = await Promise.race([
        promise.catch(/* 不把Worker原生錯誤或payload帶到report。 */ () => undefined),
        new Promise<undefined>(
          /* 僅限制oracle後讀摘要／cleanup。 */ (resolve) => {
            timer = setTimeout(/* 截止回unavailable，不復活。 */ () => resolve(undefined), 2000)
          },
        ),
      ])
      return performance.now() < deadline ? result : undefined
    } finally {
      clearTimeout(timer)
    }
  }
  // 只取消matching scope；背景cleanup即使失敗也由Worker保護期限清expected。
  function cleanup(): Promise<void> {
    return worker.evaluate(
      /* 此函數可序列化且只清本次測試引用。 */ (id) => {
        const port = (self as unknown as ClipboardTransferWorkerScope)
          .__rdwebClipboardTransferDiagnostics
        if (port?.scope === id) port.cancel()
      },
      scope,
    )
  }
  // 缺證據回固定兩份不可用摘要，舊take仍只取其中四boolean。
  function unavailableBoth(): ClipboardTransferCapture {
    return {
      preDecodeClipboard: {
        observed: false,
        compressed: false,
        uncompressedCompared: false,
        uncompressedExact: false,
        overflow: false,
        unavailable: true,
      },
      preTransferClipboard: unavailable(),
      preDecodeText: null,
    }
  }
  // 原oracle後一次evaluate取證；只認精確own boolean白名單。
  async function take(incoming: boolean, withText = false): Promise<ClipboardTransferCapture> {
    if (consumed || cancelled) return unavailableBoth()
    consumed = true
    let value: unknown
    try {
      value = await bounded(
        worker.evaluate(
          /* 同Worker、同scope才原子取指定摘要。 */ (request) => {
            const port = (self as unknown as ClipboardTransferWorkerScope)
              .__rdwebClipboardTransferDiagnostics
            return port?.scope === request.scope
              ? request.incoming
                ? request.withText
                  ? port.takeWithText()
                  : port.takeWithIncoming()
                : port.take()
              : undefined
          },
          { scope, incoming, withText },
        ),
      )
    } catch {
      /* evaluate同步拒絕亦僅標不可用。 */
    }
    // 回覆僅為已序列化primitive，檢查前不保留任意DTO到結果。
    function valid(value: unknown, fields: readonly string[]): value is Record<string, boolean> {
      return (
        !!value &&
        typeof value === 'object' &&
        Object.keys(value).length === fields.length &&
        fields.every(
          /* own白名單避免prototype冒充合法boolean。 */ (field) =>
            Object.hasOwn(value, field) &&
            typeof Object.getOwnPropertyDescriptor(value, field)?.value === 'boolean',
        )
      )
    }
    const fields = ['compared', 'exact', 'overflow', 'unavailable'] as const
    const incomingFields = [
      'observed',
      'compressed',
      'uncompressedCompared',
      'uncompressedExact',
      'overflow',
      'unavailable',
    ] as const
    try {
      const pair = incoming ? (value as ClipboardTransferCapture | undefined) : undefined
      // 只讀own data property一次，nested getter不能在驗證後換DTO。
      const raw = pair
        ? (Object.getOwnPropertyDescriptor(pair, 'preDecodeClipboard')?.value as
            PreDecodeClipboardEvidence | undefined)
        : undefined
      const transfer = incoming
        ? pair && Object.getOwnPropertyDescriptor(pair, 'preTransferClipboard')?.value
        : value
      if (
        cancelled ||
        !valid(transfer, fields) ||
        (incoming &&
          (!pair ||
            Object.keys(pair).length !== (withText ? 3 : 2) ||
            !Object.hasOwn(pair, 'preDecodeClipboard') ||
            !Object.hasOwn(pair, 'preTransferClipboard') ||
            !valid(raw, incomingFields)))
      )
        throw new Error()
      const text =
        withText && pair ? Object.getOwnPropertyDescriptor(pair, 'preDecodeText')?.value : null
      if (
        text !== null &&
        (!captureText ||
          typeof text !== 'string' ||
          text !== allowedExpected ||
          !text.startsWith('Public ') ||
          text.includes('\0') ||
          text.length > 4096 ||
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text) ||
          new TextEncoder().encode(text).length > 4096 ||
          !raw?.observed ||
          raw.compressed ||
          !raw.uncompressedCompared ||
          !raw.uncompressedExact ||
          raw.overflow ||
          raw.unavailable ||
          !transfer.compared ||
          !transfer.exact ||
          transfer.overflow ||
          transfer.unavailable)
      )
        throw new Error()
      if (withText && (!pair || !Object.hasOwn(pair, 'preDecodeText'))) throw new Error()
      return {
        preTransferClipboard: Object.fromEntries(
          fields.map(
            /* 只copy四boolean data property，不重讀getter。 */ (field) => [
              field,
              Object.getOwnPropertyDescriptor(transfer, field)!.value,
            ],
          ),
        ) as unknown as PreTransferClipboardEvidence,
        preDecodeClipboard: incoming
          ? (Object.fromEntries(
              incomingFields.map(
                /* 只copy六boolean data property。 */ (field) => [
                  field,
                  Object.getOwnPropertyDescriptor(raw!, field)!.value,
                ],
              ),
            ) as unknown as PreDecodeClipboardEvidence)
          : unavailableBoth().preDecodeClipboard,
        preDecodeText: text,
      }
    } catch {
      try {
        void cleanup().catch(/* 不拋背景cleanup錯誤。 */ () => undefined)
      } catch {
        /* 同步evaluate拒絕亦不洩漏原例外。 */
      }
      return unavailableBoth()
    } finally {
      allowedExpected = ''
    }
  }
  return {
    // 同scope一次取兩摘要與允許文字，未opt-in或缺證據只回null。
    async takeWithText(): Promise<ClipboardTransferCapture> {
      return take(true, true)
    },
    // 原子取出同scope兩摘要，2000ms後或取消不得復活。
    async takeWithIncoming(): Promise<ClipboardTransferEvidence> {
      const result = await take(true)
      return {
        preDecodeClipboard: result.preDecodeClipboard,
        preTransferClipboard: result.preTransferClipboard,
      }
    },
    // 保持既有四booleantake契約，與新原子take共用單次消費guard。
    async take(): Promise<PreTransferClipboardEvidence> {
      return (await take(false)).preTransferClipboard
    },
    // 不關產品Worker／clipboard，只清本輪hook；cancel期間take不得恢復摘要。
    async cancel(): Promise<void> {
      cancelled = true
      allowedExpected = ''
      try {
        await bounded(cleanup())
      } catch {
        /* 已關閉Worker不再有私有scope。 */
      }
    },
  }
}
