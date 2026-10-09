export interface ServerRow {
  id: string
  name: string
  id_server: string
  relay_server: string
  public_key: string
  transport: 'tcp' | 'ws'
  enabled: boolean
  allow_private_network: boolean
  notes: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface ServerProbe {
  check: 'tcp_socket'
  protocol_verified: boolean
  public_key_valid: boolean
  id_server: { status: string; latency_ms: number }
  relay_server: { status: string; latency_ms: number }
}
