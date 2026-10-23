import { createHash, timingSafeEqual } from 'node:crypto'
import type { hbb } from '../../src/rdweb/generated/message.js'
import { receiverUnavailable } from './contract.ts'
import { RECEIVER_VERSION } from './rendezvous.ts'

const VP8_SHA256 = '503cd8dfafcba01760afc0794752803aa36143a14b9ad49b62c28b43de795c02'
const VP8_BYTES = 12230
const KEY_OFFSET = 522
const KEY_BYTES = 4826

// 只從固定公開WPT原始檔驗完整SHA-256後切出keyframe；錯誤不洩漏偏移或hash。
export function verifyReceiverVp8(source: Uint8Array): Uint8Array {
  try {
    if (!(source instanceof Uint8Array) || source.length !== VP8_BYTES) return receiverUnavailable()
    const actual = createHash('sha256').update(source).digest()
    try {
      const expected = Buffer.from(VP8_SHA256, 'hex')
      if (!timingSafeEqual(actual, expected)) return receiverUnavailable()
    } finally {
      actual.fill(0)
    }
    return new Uint8Array(source.subarray(KEY_OFFSET, KEY_OFFSET + KEY_BYTES))
  } catch {
    return receiverUnavailable()
  }
}

// PeerInfo固定本工具Windows／320×240能力；權限另由session的PermissionInfo宣告。
export function receiverPeerInfo(): hbb.IPeerInfo {
  return {
    platform: 'Windows',
    version: RECEIVER_VERSION,
    displays: [{ x: 0, y: 0, width: 320, height: 240 }],
    currentDisplay: 0,
    sasEnabled: false,
    features: { privacyMode: false, terminal: false },
    encoding: { vp8: true },
  }
}
