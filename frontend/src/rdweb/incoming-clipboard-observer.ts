import { hbb } from './codec'
import type { ClipboardTag } from './interaction-types'
import { INTERACTION_LIMITS as L } from './interaction-limits'

export interface PreDecodeClipboardEvidence {
  observed: boolean
  compressed: boolean
  uncompressedCompared: boolean
  uncompressedExact: boolean
  overflow: boolean
  unavailable: boolean
}
export type IncomingClipboardSnapshot = ClipboardTag & PreDecodeClipboardEvidence
export interface IncomingClipboardObserver {
  // 只回本輪Public fixture參考，null表示沒有matching opt-in。
  expected(tag: ClipboardTag): string | null
  // 只接獨立tag與布林，永不拿Message／文字／bytes。
  record(value: IncomingClipboardSnapshot): void
  // 明確opt-in才接收未壓縮且raw exact的公開文字，不拿bytes／Message。
  recordText?(tag: ClipboardTag, text: string): void
  // 診斷失效不能變更原產品reply或錯誤。
  unavailable(tag: ClipboardTag, overflow?: boolean): void
}
export type IncomingClipboardObserverSource =
  IncomingClipboardObserver | (() => IncomingClipboardObserver | undefined)
// 接點只借用原content，額外工作限已opt-in；provider／callback故障不改產品。
export function observeIncomingClipboard(
  message: hbb.Message,
  tag: ClipboardTag,
  source?: IncomingClipboardObserverSource,
): void {
  if (!source) return
  const localTag = { revision: tag.revision, request_id: tag.request_id }
  let observer: IncomingClipboardObserver | undefined,
    expected = '',
    bytes: Uint8Array | undefined
  // 只回安全分類；診斷錯誤不能污染原decoder或產品例外。
  function fail(overflow = false): void {
    try {
      observer?.unavailable({ ...localTag }, overflow)
    } catch {
      /* 故障observer不拋出。 */
    }
  }
  try {
    observer = typeof source === 'function' ? source() : source
    if (!observer) return
    const value = observer.expected({ ...localTag })
    if (value === null) return
    if (
      typeof value !== 'string' ||
      !value.startsWith('Public ') ||
      value.includes('\0') ||
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
    ) {
      fail()
      return
    }
    expected = value
    if (expected.length > L.text) {
      fail(true)
      return
    }
    bytes = new TextEncoder().encode(expected)
    if (bytes.length > L.text) {
      fail(true)
      return
    }
    const single = message.clipboard
    const entries = single ? [single] : (message.multiClipboards?.clipboards ?? [])
    if (entries.length > L.clipboardEntries) {
      fail(true)
      return
    }
    const texts = entries.filter(
      /* 只處理pinned Text default，非Text不讀content。 */ (entry) =>
        (entry.format ?? hbb.ClipboardFormat.Text) === hbb.ClipboardFormat.Text,
    )
    if (!texts.length) return
    if (texts.length !== 1) {
      fail()
      return
    }
    const entry = texts[0]!
    if (
      (entry.width ?? 0) !== 0 ||
      (entry.height ?? 0) !== 0 ||
      entry.specialName ||
      (entry.compress != null && typeof entry.compress !== 'boolean')
    ) {
      fail()
      return
    }
    const compressed = entry.compress === true,
      content = entry.content ?? new Uint8Array()
    if (!(content instanceof Uint8Array) || !(content.buffer instanceof ArrayBuffer)) {
      fail()
      return
    }
    if (content.length > (compressed ? L.clipboardWire : L.clipboard)) {
      fail(true)
      return
    }
    const exact =
      !compressed &&
      content.length === bytes.length &&
      content.every(
        /* 比的是UTF8 bytes，不解碼／normalize／hash。 */ (byte, index) => byte === bytes![index],
      )
    observer.record({
      ...localTag,
      observed: true,
      compressed,
      uncompressedCompared: !compressed,
      uncompressedExact: exact,
      overflow: false,
      unavailable: false,
    })
    // 明確own hook才額外轉換已比對相等的公開content，壓縮／未知內容完全不解碼。
    if (exact && Object.hasOwn(observer, 'recordText')) {
      const recordText = observer.recordText
      if (typeof recordText === 'function') {
        let text = ''
        try {
          text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content)
          if (text !== expected) {
            fail()
            return
          }
          recordText.call(observer, { ...localTag }, text)
        } finally {
          text = ''
        }
      }
    }
  } catch {
    fail()
  } finally {
    bytes?.fill(0)
    expected = ''
  }
}
