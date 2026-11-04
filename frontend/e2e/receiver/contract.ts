export interface ReceiverBinding {
  schemaVersion: 1
  purpose: 'rustdesk_test_receiver_v1'
  runId: string
  requestId: string
  peerId: string
  createdUtc: string
  expiresUtc: string
}
export interface ReceiverEndpoint {
  host: string
  port: number
}
export interface ReceiverEndpoints {
  hbbsUdp: ReceiverEndpoint
  hbbsTcp: ReceiverEndpoint
  hbbrTcp: ReceiverEndpoint
  serverPublicKey: string
}
export interface ReceiverEvidence {
  identityBound: boolean
  authenticated: boolean
  received: boolean
  macVerified: boolean
  parsed: boolean
  textSingle: boolean
  textExact: boolean
  sequenceComplete: boolean
  sequenceValid: boolean
  windowComplete: boolean
  overflow: boolean
  unavailable: boolean
  resourcesClosed: boolean
}
export type ReceiverCode = 'receiver_match' | 'receiver_mismatch' | 'receiver_unavailable'
export interface ReceiverResult extends ReceiverEvidence {
  schemaVersion: 1
  purpose: ReceiverBinding['purpose']
  runId: string
  requestId: string
  code: ReceiverCode
}
export interface ReceiverClientReport {
  schemaVersion: 1
  purpose: ReceiverBinding['purpose']
  runId: string
  requestId: string
  identityVerified: boolean
  videoPresented: boolean
  submitted: boolean
  observationComplete: boolean
  scopeIntact: boolean
  resourcesClosed: boolean
  unavailable: boolean
}
const HEADER = ['schemaVersion', 'purpose', 'runId', 'requestId'] as const
export const RECEIVER_FLAGS = [
  'identityBound',
  'authenticated',
  'received',
  'macVerified',
  'parsed',
  'textSingle',
  'textExact',
  'sequenceComplete',
  'sequenceValid',
  'windowComplete',
  'overflow',
  'unavailable',
  'resourcesClosed',
] as const
const CLIENT_FLAGS = [
  'identityVerified',
  'videoPresented',
  'submitted',
  'observationComplete',
  'scopeIntact',
  'resourcesClosed',
  'unavailable',
] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// 所有不可信輸入失敗僅回固定分類，不附帶原生例外或資料。
export function receiverUnavailable(): never {
  throw new Error('receiver_unavailable')
}

// 先驗普通data descriptor與精確key集合，避免執行accessor或複製額外資料。
export function receiverFields(value: unknown, names: readonly string[]): Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
      return receiverUnavailable()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(value).length !== names.length) return receiverUnavailable()
    const copy: Record<string, unknown> = {}
    for (const name of names) {
      const d = descriptors[name]
      if (!d || !('value' in d) || !d.enumerable) return receiverUnavailable()
      copy[name] = d.value
    }
    return copy
  } catch {
    return receiverUnavailable()
  }
}

// header只信固定用途與canonical UUID，不從其他格式猜測同輪。
function header(v: Record<string, unknown>): void {
  if (
    v.schemaVersion !== 1 ||
    v.purpose !== 'rustdesk_test_receiver_v1' ||
    typeof v.runId !== 'string' ||
    !UUID.test(v.runId) ||
    typeof v.requestId !== 'string' ||
    !UUID.test(v.requestId) ||
    v.runId === v.requestId
  )
    receiverUnavailable()
}

// round-trip拒絕無效日期與timezone正規化，時間只接受UTC毫秒格式。
function utc(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))
    return receiverUnavailable()
  const n = Date.parse(value)
  if (!Number.isFinite(n) || new Date(n).toISOString() !== value) return receiverUnavailable()
  return n
}

// 準備設定只驗結構；真正claim／讀取有效期由IO層另外檢查。
export function validateReceiverBinding(value: unknown): ReceiverBinding {
  const v = receiverFields(value, [...HEADER, 'peerId', 'createdUtc', 'expiresUtc'])
  header(v)
  if (
    typeof v.peerId !== 'string' ||
    !/^[1-9]\d{8}$/.test(v.peerId) ||
    utc(v.expiresUtc) - utc(v.createdUtc) !== 1800000
  )
    return receiverUnavailable()
  return v as unknown as ReceiverBinding
}

// endpoint不接URL／userinfo／path或隱含port，不從來訊覆寫目的地。
function endpoint(value: unknown): ReceiverEndpoint {
  const v = receiverFields(value, ['host', 'port'])
  if (
    typeof v.host !== 'string' ||
    !v.host ||
    v.host.length > 253 ||
    /[\s\0/@\\?#%]/.test(v.host) ||
    v.host.includes('://') ||
    typeof v.port !== 'number' ||
    !Number.isInteger(v.port) ||
    v.port < 1 ||
    v.port > 65535
  )
    return receiverUnavailable()
  return v as unknown as ReceiverEndpoint
}

// Base64要求canonical編碼與32bytes；不接受Buffer的寬鬆尾碼容忍。
export function validateReceiverEndpoints(value: unknown): ReceiverEndpoints {
  const v = receiverFields(value, ['hbbsUdp', 'hbbsTcp', 'hbbrTcp', 'serverPublicKey'])
  if (typeof v.serverPublicKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(v.serverPublicKey))
    return receiverUnavailable()
  const key = Buffer.from(v.serverPublicKey, 'base64')
  if (key.length !== 32 || key.toString('base64') !== v.serverPublicKey)
    return receiverUnavailable()
  return {
    hbbsUdp: endpoint(v.hbbsUdp),
    hbbsTcp: endpoint(v.hbbsTcp),
    hbbrTcp: endpoint(v.hbbrTcp),
    serverPublicKey: v.serverPublicKey,
  }
}

// 新公開文字只在呼叫者RAM形成，不從舊輪或剪貼簿讀內容。
export function publicReceiverText(binding: ReceiverBinding): string {
  return 'Public 中文 RdWeb ' + validateReceiverBinding(binding).runId
}

// 缺coverage／安全或收尾證據優先不可用；完整有效接收才有match／mismatch。
export function classifyReceiverEvidence(v: ReceiverEvidence): ReceiverCode {
  if (
    v.unavailable ||
    v.overflow ||
    !v.identityBound ||
    !v.authenticated ||
    !v.received ||
    !v.macVerified ||
    !v.parsed ||
    !v.sequenceComplete ||
    !v.windowComplete ||
    !v.resourcesClosed
  )
    return 'receiver_unavailable'
  return v.textSingle && v.textExact && v.sequenceValid ? 'receiver_match' : 'receiver_mismatch'
}

// 所有安全旗標必須真boolean，不容許字串轉型或缺值默認成功。
function booleans(v: Record<string, unknown>, names: readonly string[]): void {
  for (const name of names) if (typeof v[name] !== 'boolean') receiverUnavailable()
}

// 拒絕code與證據矛盾，並只回白名單資料副本。
export function validateReceiverResult(value: unknown): ReceiverResult {
  const v = receiverFields(value, [...HEADER, 'code', ...RECEIVER_FLAGS])
  header(v)
  booleans(v, RECEIVER_FLAGS)
  const result = v as unknown as ReceiverResult
  if (result.code !== classifyReceiverEvidence(result)) return receiverUnavailable()
  return result
}

// Client是獨立同輪安全證據，不接受未知欄位或跨輪結果。
export function validateReceiverClient(value: unknown): ReceiverClientReport {
  const v = receiverFields(value, [...HEADER, ...CLIENT_FLAGS])
  header(v)
  booleans(v, CLIENT_FLAGS)
  return v as unknown as ReceiverClientReport
}

// join才合併server／peer正常驗證，receiver本地綁定不能代替Client證據。
export function joinReceiverResults(
  binding: ReceiverBinding,
  receiver: ReceiverResult,
  client: ReceiverClientReport,
): ReceiverResult {
  const b = validateReceiverBinding(binding),
    r = validateReceiverResult(receiver),
    c = validateReceiverClient(client)
  if (
    r.runId !== b.runId ||
    c.runId !== b.runId ||
    r.requestId !== b.requestId ||
    c.requestId !== b.requestId
  )
    return receiverUnavailable()
  const complete =
    c.identityVerified &&
    c.videoPresented &&
    c.submitted &&
    c.observationComplete &&
    c.scopeIntact &&
    c.resourcesClosed &&
    !c.unavailable
  const joined = {
    ...r,
    identityBound: r.identityBound && c.identityVerified,
    resourcesClosed: r.resourcesClosed && c.resourcesClosed,
    unavailable: r.unavailable || !complete,
  }
  joined.code = classifyReceiverEvidence(joined)
  return joined
}
