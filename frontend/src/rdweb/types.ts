import type { PeerVideo, DisplayGeometry, VideoPacket } from './video-types'

export type Phase =
  | 'connecting'
  | 'awaiting_ready'
  | 'verifying_identity'
  | 'awaiting_hash'
  | 'assisting'
  | 'awaiting_login'
  | 'awaiting_video'
  | 'streaming'
  | 'failed'
  | 'closed'
export interface Ready {
  type: 'rdweb.ready'
  protocol: 'rustdesk/1.4.2'
  transport: 'tcp' | 'ws'
  connection_id: string
  target_id: string
  rustdesk_id: string
  peer_signing_key: string
}
export const FAILURE_CODES = [
  'insecure_context',
  'video_unsupported',
  'codec_unsupported',
  'protocol_error',
  'crypto_failed',
  'remote_login_failed',
  'remote_desktop_unavailable',
  'peer_display_invalid',
  'login_assist_failed',
  'video_decode_failed',
  'video_backpressure',
  'video_timeout',
  'connection_failed',
  'connection_timeout',
] as const
export type FailureCode = (typeof FAILURE_CODES)[number]
// 所有跨執行緒與UI錯誤只能使用固定分類，不傳原生或remote任意字串。
export function failureCode(value: string): FailureCode {
  return FAILURE_CODES.find((code) => code === value) ?? 'connection_failed'
}
export interface Callbacks {
  // 傳送握手或加密binary，不回傳原始資料至UI。
  send: (bytes: Uint8Array) => void
  // 僅向Main請求當次最終登入proof。
  assist: (connectionId: string, salt: string, challenge: string) => Promise<Uint8Array>
  // 發布固定安全狀態，影像成功另由presented確認。
  phase: (value: Phase) => void
  // 更新已驗證的peer摘要及有界幾何，不含hostname或username。
  verified: (value: PeerVideo) => void
  // 在plaintext清除之前同步納入有限media管線。
  video: (value: VideoPacket) => void
  // 官方display更新作廢舊generation並驗新幾何。
  display: (value: DisplayGeometry) => void
  // 固定failure分類由Worker與host共同白名單化。
  failure: (code: string) => void
}
// 嚴格解析public control metadata，防未驗證SignedId自建trust root。
export function parseReady(raw: unknown, target: string, peer: string): Ready {
  const value = raw as Partial<Ready> | null
  if (
    !value ||
    value.type !== 'rdweb.ready' ||
    value.protocol !== 'rustdesk/1.4.2' ||
    !['tcp', 'ws'].includes(value.transport ?? '') ||
    value.target_id !== target ||
    value.rustdesk_id !== peer ||
    !/^[a-f0-9-]{36}$/i.test(value.connection_id ?? '') ||
    !/^[A-Za-z0-9+/]{43}=$/.test(value.peer_signing_key ?? '')
  )
    throw new Error('protocol_error')
  return value as Ready
}
// Base64只轉短命byte buffer，錯誤不附輸入。
export function base64Bytes(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  } catch {
    throw new Error('protocol_error')
  }
}
