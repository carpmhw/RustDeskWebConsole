import type { DisplayGeometry } from './video-types'
export const VIDEO_LIMITS = Object.freeze({
  control: 65536,
  envelope: 8388608,
  wire: 8388624,
  chunks: 16,
  pendingBytes: 16777216,
  decodeQueue: 8,
  side: 4096,
  pixels: 16777216,
  probeMs: 5000,
  firstMs: 15000,
  stallMs: 30000,
})
// 僅轉精確非負int64，乘1000後仍必須在安全Number範圍。
export function ptsMicros(value: string): number {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value)) throw new Error('protocol_error')
  const micros = BigInt(value) * 1000n
  if (micros > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('protocol_error')
  return Number(micros)
}
// 幾何在建立decoder與繪製之前都驗，拒絕非整數、負值及超額資料。
export function checkDisplay(value: DisplayGeometry): true {
  if (
    !Number.isInteger(value.display) ||
    value.display < 0 ||
    value.display > 31 ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    value.width < 1 ||
    value.height < 1 ||
    value.width > VIDEO_LIMITS.side ||
    value.height > VIDEO_LIMITS.side ||
    value.width * value.height > VIDEO_LIMITS.pixels
  )
    throw new Error('protocol_error')
  return true
}
