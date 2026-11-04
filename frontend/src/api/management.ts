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

export interface AvailableServer {
  id: string
  name: string
}
export interface TargetRights {
  can_connect: boolean
  can_view_password: boolean
  can_edit: boolean
}
export interface TargetRow {
  id: string
  server_id: string
  name: string
  rustdesk_id: string
  group_name: string | null
  tags: string[]
  notes: string | null
  created_by: string
  has_password: boolean
  permissions: TargetRights
  version: number
  created_at: string
  updated_at: string
}
export interface TargetPage {
  count: number
  page: number
  page_size: number
  items: TargetRow[]
}
export interface TargetGrant {
  user_id: string | null
  role: 'operator' | 'viewer' | null
  can_connect: boolean
  can_view_password: boolean
  can_edit: boolean
}
export interface TargetPermissions {
  version: number
  grants: TargetGrant[]
}
export interface AvailableUser {
  id: string
  username: string
  role: 'admin' | 'operator' | 'viewer'
  is_active: boolean
}
