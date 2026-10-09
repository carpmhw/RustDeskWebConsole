export type Phase =
  | 'connecting'
  | 'awaiting_ready'
  | 'verifying_identity'
  | 'awaiting_hash'
  | 'assisting'
  | 'awaiting_login'
  | 'verified'
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
export interface PeerSummary {
  platform: string
  version: string
  displayCount: number
}
export type MainEvent =
  | {
      type: 'start'
      revision: number
      target: string
      peer: string
      origin: string
      base: string
      ticket: string
    }
  | { type: 'assist-result'; revision: number; proof: Uint8Array }
  | { type: 'dispose'; revision: number }
  | { type: 'assist-failed'; revision: number }
export type WorkerEvent =
  | { type: 'phase'; revision: number; phase: Phase }
  | { type: 'assist'; revision: number; connection: string; salt: string; challenge: string }
  | { type: 'verified'; revision: number; summary: PeerSummary }
  | { type: 'failure'; revision: number; code: string }
  | { type: 'disposed'; revision: number }
export interface Callbacks {
  send: (bytes: Uint8Array) => void
  assist: (connectionId: string, salt: string, challenge: string) => Promise<Uint8Array>
  phase: (value: Phase) => void
  verified: (value: PeerSummary) => void
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
