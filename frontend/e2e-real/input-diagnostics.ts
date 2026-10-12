export interface InputDiagnosticEvidence {
  textSubmitted: boolean
  textAccepted: boolean
  selectSubmitted: boolean
  selectAccepted: boolean
  copySubmitted: boolean
  copyAccepted: boolean
  rejected: boolean
  releaseObserved: boolean
  pullSubmitted: boolean
  pullCancelled: boolean
  clipboardDelivered: boolean
  dataBeforeCopySubmitted: boolean
  dataBeforeCopyAccepted: boolean
  overflow: boolean
  nativeWriteHooked: boolean
  nativeWriteObserved: boolean
  nativeWriteExact: boolean
  nativeWriteContainsExpected: boolean
  nativeWriteIsExpectedFragment: boolean
  nativeWriteUuidMatches: boolean
  nativeWriteAsciiMatches: boolean
  nativeWriteTrimMatches: boolean
}
export interface InputDiagnostics {
  // 開始本輪被動診斷，不送input或clipboard指令。
  begin(publicExpected?: string, captureText?: boolean): void
  // 僅回固定boolean摘要，ACK不代表遠端OS執行。
  snapshot(): InputDiagnosticEvidence
  // 只有顯式核准的本機診斷可取得第一筆native參數，取出後立即清除。
  takeText(): string | null
  // 沿原oracle已有的讀取保存最後結果，不額外讀取OS剪貼簿。
  observeReadback(value: string | null, source: 'native' | 'fallback' | 'unavailable'): void
  // 取出即清；source刻意區分OS、fallback與未取得資料。
  takeReadback(): { value: string | null; source: 'native' | 'fallback' | 'unavailable' }
}
export const INPUT_DIAGNOSTIC_FIELDS = [
  'textSubmitted',
  'textAccepted',
  'selectSubmitted',
  'selectAccepted',
  'copySubmitted',
  'copyAccepted',
  'rejected',
  'releaseObserved',
  'pullSubmitted',
  'pullCancelled',
  'clipboardDelivered',
  'dataBeforeCopySubmitted',
  'dataBeforeCopyAccepted',
  'overflow',
  'nativeWriteHooked',
  'nativeWriteObserved',
  'nativeWriteExact',
  'nativeWriteContainsExpected',
  'nativeWriteIsExpectedFragment',
  'nativeWriteUuidMatches',
  'nativeWriteAsciiMatches',
  'nativeWriteTrimMatches',
] as const
declare global {
  interface Window {
    __rdwebInputDiagnostics?: InputDiagnostics
  }
}
// 只由E2E addInitScript安裝被動observer；本函數可序列化且沒有外部runtime相依。
export function installInputDiagnostics(): void {
  if (window.__rdwebInputDiagnostics) return
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  const canObserveWrite = typeof clipboard?.writeText === 'function'
  // 每輪重新建立純boolean摘要，沒有原訊息、文字、bytes或安全DTO。
  function empty(): InputDiagnosticEvidence {
    return {
      textSubmitted: false,
      textAccepted: false,
      selectSubmitted: false,
      selectAccepted: false,
      copySubmitted: false,
      copyAccepted: false,
      rejected: false,
      releaseObserved: false,
      pullSubmitted: false,
      pullCancelled: false,
      clipboardDelivered: false,
      dataBeforeCopySubmitted: false,
      dataBeforeCopyAccepted: false,
      overflow: false,
      nativeWriteHooked: canObserveWrite,
      nativeWriteObserved: false,
      nativeWriteExact: false,
      nativeWriteContainsExpected: false,
      nativeWriteIsExpectedFragment: false,
      nativeWriteUuidMatches: false,
      nativeWriteAsciiMatches: false,
      nativeWriteTrimMatches: false,
    }
  }
  let evidence = empty(),
    enabled = false,
    owner: Worker | null = null,
    pull: string | null = null,
    expected = '',
    captureText = false,
    capturedText: string | null = null,
    readback: { value: string | null; source: 'native' | 'fallback' | 'unavailable' } = {
      value: null,
      source: 'unavailable',
    }
  // 保存文字前按UTF-8驗原32KiB上限，不截斷、trim或normalize。
  function boundedText(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.length <= 32768 &&
      new TextEncoder().encode(value).byteLength <= 32768
    )
  }
  const pending = new Map<string, number>()
  // 僅允許正整數tag，不將任意值或原訊息拼入診斷狀態。
  function tag(value: Record<string, unknown>, input: boolean): string | null {
    const fields = input
      ? [value.revision, value.input_generation, value.batch_id]
      : [value.revision, value.request_id]
    return fields.every(
      /* 禁止非數字與非精確整數。 */ (n) =>
        typeof n === 'number' && Number.isSafeInteger(n) && n > 0,
    )
      ? fields.join(':')
      : null
  }
  // 僅處理指定互動訊息；不存payload、不讀clipboard bytes或start ticket。
  function observe(worker: Worker, value: unknown, outgoing: boolean): void {
    if (!enabled || !value || typeof value !== 'object') return
    const message = value as Record<string, unknown>
    const type = message.type
    if (outgoing && (type === 'input-batch' || type === 'clipboard-pull')) owner ??= worker
    if (worker !== owner) return
    if (outgoing && type === 'input-batch') {
      const key = tag(message, true)
      if (!key || !Array.isArray(message.events)) return
      let mask = 0
      for (const raw of message.events) {
        if (!raw || typeof raw !== 'object') continue
        const event = raw as Record<string, unknown>
        if (event.kind === 'text') mask |= 1
        if (
          event.kind === 'shortcut' &&
          event.down === true &&
          Array.isArray(event.modifiers) &&
          event.modifiers.includes('Control') &&
          event.modifiers.length <= 3 &&
          event.modifiers.every(
            /* lock狀態不改shortcut身分，其他家族一律排除。 */ (modifier) =>
              ['Control', 'CapsLock', 'NumLock'].includes(modifier),
          )
        ) {
          if (event.char === 'a') mask |= 2
          if (event.char === 'c') mask |= 4
        }
      }
      evidence.textSubmitted ||= !!(mask & 1)
      evidence.selectSubmitted ||= !!(mask & 2)
      evidence.copySubmitted ||= !!(mask & 4)
      if (mask) {
        if (pending.size >= 64) evidence.overflow = true
        else pending.set(key, mask)
      }
    } else if (!outgoing && type === 'input-ack') {
      const key = tag(message, true),
        mask = key ? pending.get(key) : undefined
      if (mask === undefined || !key || typeof message.sent !== 'boolean') return
      pending.delete(key)
      if (!message.sent) evidence.rejected = true
      else {
        evidence.textAccepted ||= !!(mask & 1)
        evidence.selectAccepted ||= !!(mask & 2)
        evidence.copyAccepted ||= !!(mask & 4)
      }
    } else if (outgoing && type === 'input-release') evidence.releaseObserved = true
    else if (outgoing && type === 'clipboard-pull') {
      pull = tag(message, false)
      if (!pull) return
      evidence.pullSubmitted = true
      // 接收前的全選不能替代「點回遠端後重新選取」證據；文字提交證據仍保留。
      evidence.selectSubmitted =
        evidence.selectAccepted =
        evidence.copySubmitted =
        evidence.copyAccepted =
          false
      for (const [key, mask] of pending) {
        if (mask & 1) pending.set(key, 1)
        else pending.delete(key)
      }
    } else if (pull && tag(message, false) === pull) {
      if (!outgoing && type === 'clipboard-data') {
        evidence.clipboardDelivered = true
        evidence.dataBeforeCopySubmitted = !evidence.copySubmitted
        evidence.dataBeforeCopyAccepted = !evidence.copyAccepted
        pull = null
      } else if (
        type === 'clipboard-cancel' ||
        type === 'clipboard-cancelled' ||
        type === 'clipboard-error'
      ) {
        evidence.pullCancelled = true
        pull = null
      }
    }
  }
  window.__rdwebInputDiagnostics = {
    // 清除本輪tag與booleans；不干預產品queue或deadline。
    begin(publicExpected = '', capture = false): void {
      if (
        typeof publicExpected !== 'string' ||
        publicExpected.length > 32768 ||
        (publicExpected && !publicExpected.startsWith('Public ')) ||
        typeof capture !== 'boolean' ||
        (capture && !publicExpected)
      )
        throw new Error('input_clipboard_diagnostics_unavailable')
      evidence = empty()
      pending.clear()
      pull = null
      owner = null
      enabled = true
      expected = publicExpected
      captureText = capture
      capturedText = null
      readback = { value: null, source: 'unavailable' }
    },
    // spread對象只有固定boolean，不包含原訊息、tag、nonce或文字。
    snapshot(): InputDiagnosticEvidence {
      return { ...evidence }
    },
    // 顯式捕捉與一般boolean摘要分離；取出即清，不留第二份payload引用。
    takeText(): string | null {
      const text = capturedText
      capturedText = null
      return text
    },
    // 僅沿原oracle已讀到的值保存最後一筆，不另讀clipboard或改原比較結果。
    observeReadback(value, source): void {
      if (!enabled || !captureText) return
      readback = { value: null, source: 'unavailable' }
      if (value === null && source === 'unavailable') return
      if (boundedText(value) && (source === 'native' || source === 'fallback'))
        readback = { value, source }
      else evidence.overflow = true
    },
    // 取出後清除引用，下一輪不可看見前一輪回讀。
    takeReadback() {
      const value = readback
      readback = { value: null, source: 'unavailable' }
      return value
    },
  }
  if (canObserveWrite && clipboard) {
    clipboard.writeText = new Proxy(clipboard.writeText, {
      // 保留原字串／receiver／Promise；只對matching資料後第一筆native入口做即時計算。
      apply(method, receiver, parameters) {
        const result = Reflect.apply(method, receiver, parameters)
        if (enabled && expected && evidence.clipboardDelivered && !evidence.nativeWriteObserved) {
          try {
            const value: unknown = parameters[0]
            if (typeof value !== 'string') {
              evidence.overflow = true
              return result
            }
            const uuid = expected.match(
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            )?.[0]
            evidence.nativeWriteObserved = true
            if (captureText) {
              if (boundedText(value)) capturedText = value
              else evidence.overflow = true
            }
            evidence.nativeWriteExact = value === expected
            evidence.nativeWriteContainsExpected = value !== expected && value.includes(expected)
            evidence.nativeWriteIsExpectedFragment =
              !!value && value !== expected && expected.includes(value)
            evidence.nativeWriteUuidMatches = !!uuid && value.includes(uuid)
            evidence.nativeWriteAsciiMatches =
              value.replace(/[^\p{ASCII}]/gu, '') === expected.replace(/[^\p{ASCII}]/gu, '')
            evidence.nativeWriteTrimMatches = value.trim() === expected
          } catch {
            evidence.overflow = true
          } finally {
            // 僅清本輪public expected；從不保留實際native文字或Promise。
            expected = ''
          }
        }
        return result
      },
    })
  }
  window.Worker = new Proxy(window.Worker, {
    // 保留原constructor參數與原Worker；每instance的matching tag互不污染。
    construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker
      worker.postMessage = new Proxy(worker.postMessage, {
        // 先原封不動提交一次，成功後才記錄；observer例外不改產品路徑。
        apply(method, receiver, parameters) {
          const result = Reflect.apply(method, receiver, parameters)
          try {
            observe(worker, parameters[0], true)
          } catch {
            evidence.overflow = true
          }
          return result
        },
      })
      worker.addEventListener(
        'message',
        /* 被動讀固定type／tag，不取得transfer或像素。 */ (event: MessageEvent<unknown>) => {
          try {
            observe(worker, event.data, false)
          } catch {
            evidence.overflow = true
          }
        },
      )
      return worker
    },
  })
}
