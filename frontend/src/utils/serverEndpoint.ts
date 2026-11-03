export type ServerTransport = 'tcp' | 'ws'
export type EndpointField = 'id' | 'relay'

// RustDesk OSS（1.1.14 已驗證）預設 port；只用於表單預填，保存值仍為明確 host:port。
export const DEFAULT_PORTS: Record<ServerTransport, Record<EndpointField, number>> = {
  tcp: { id: 21116, relay: 21117 },
  ws: { id: 21118, relay: 21119 },
}

// 把保存的 host:port（含 [IPv6]:port）拆回表單兩欄；不補預設值，避免改寫既有設定。
export function splitEndpoint(value: string): { host: string; port: string } {
  const bracketed = /^\[([^\]]+)\]:(\d+)$/.exec(value)
  if (bracketed) return { host: bracketed[1]!, port: bracketed[2]! }
  const plain = /^([^:]+):(\d+)$/.exec(value)
  return plain ? { host: plain[1]!, port: plain[2]! } : { host: value, port: '' }
}

// 組回後端要求的 host:port；IPv6 主機加方括號，最終格式仍由後端驗證。
export function joinEndpoint(host: string, port: string): string {
  const value = host.trim()
  return (value.includes(':') ? '[' + value + ']' : value) + ':' + port
}

// 切換傳輸方式時，只有仍等於舊預設的 port 換成新預設；使用者改過的值保留。
export function switchedPort(
  port: string,
  field: EndpointField,
  from: ServerTransport,
  to: ServerTransport,
): string {
  return port === String(DEFAULT_PORTS[from][field]) ? String(DEFAULT_PORTS[to][field]) : port
}
