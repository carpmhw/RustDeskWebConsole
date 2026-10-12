export const INTERACTION_LIMITS = Object.freeze({
  held: 64,
  pending: 64,
  pendingBytes: 32768,
  batch: 16,
  batchBytes: 8192,
  text: 4096,
  clipboard: 32768,
  clipboardWire: 65536,
  clipboardEntries: 8,
  zstdWindow: 262144,
  zstdBlocks: 64,
  moveHz: 30,
  inputAckMs: 2000,
  clipboardMs: 5000,
  leaseMs: 30000,
  cleanupMs: 250,
  retryMs: 120000,
  stableMs: 60000,
  activityMs: 30000,
})
// 編碼前驗 Unicode scalar 與 bytes，不截斷或替換使用者文字。
export function utf8(value: string, max: number, code: string): Uint8Array {
  if (typeof value !== 'string') throw new Error('input_unsupported')
  if (value.length > max) throw new Error(code)
  for (const char of value) {
    const cp = char.codePointAt(0)!
    if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff)) throw new Error('input_unsupported')
  }
  const bytes = new TextEncoder().encode(value)
  if (bytes.length > max) {
    bytes.fill(0)
    throw new Error(code)
  }
  return bytes
}
// 遠端座標及相加結果只能使用精確 signed int32。
export function int32(value: number): number {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new Error('protocol_error')
  return value
}
// strict UTF-8 保留 BOM，固定分類不包含原生解碼錯誤或資料。
export function textFromBytes(bytes: Uint8Array): string {
  if (bytes.length > INTERACTION_LIMITS.clipboard) throw new Error('clipboard_too_large')
  try {
    const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    if (value.includes('\0')) throw new Error()
    return value
  } catch {
    throw new Error('clipboard_invalid')
  }
}
// 同時觀測單調時間與 wallclock，睡眠及時間倒退不延長期限。
export function interactionClock(): () => number {
  const p0 = performance.now(),
    d0 = Date.now()
  let elapsed = 0
  // 以已經觀測到的最大實際經過時間計算期限。
  return () => (elapsed = Math.max(elapsed, performance.now() - p0, Date.now() - d0))
}
