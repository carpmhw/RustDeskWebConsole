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

export interface UserRow {
  id: string
  username: string
  email: string | null
  role: 'admin' | 'operator' | 'viewer'
  is_active: boolean
  totp_enabled: boolean
  password_change_required: boolean
}

// 稽核查詢的一筆紀錄；名稱由後端解析，已刪除對象保留識別碼。
export interface AuditRow {
  id: string
  time: string
  user_id: string | null
  user_name: string | null
  user_deleted: boolean
  action: string
  result: 'Success' | 'Failure'
  object_type: string | null
  object_id: string | null
  object_name: string | null
  object_deleted: boolean
  source_ip: string | null
  user_agent: string | null
  reason: string | null
  duration_ms: number | null
  bytes_sent: number | null
  bytes_received: number | null
}
export interface AuditPage {
  items: AuditRow[]
  page: number
  page_size: number
  total: number
}

// 作用中連線的一列；名稱由後端解析，流量為目前累計位元組。
export interface ActiveConnection {
  id: string
  user_id: string
  user_name: string | null
  target_id: string
  target_name: string | null
  started_at: string
  source_ip: string | null
  bytes_sent: number
  bytes_received: number
}

// 一個登入 session（一次登入）；裝置名稱由後端辨識，時間為 UTC ISO 字串。
export interface SessionRow {
  id: string
  browser: string | null
  os: string | null
  ip: string | null
  signed_in_at: string
  last_used_at: string
  current: boolean
}
