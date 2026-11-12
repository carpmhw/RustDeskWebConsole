export interface SessionUser {
  id: string
  username: string
  role: 'admin' | 'operator' | 'viewer'
  totp_enabled: boolean
  mfa_enrollment_required: boolean
  password_change_required: boolean
}
export interface SessionGrant {
  access_token: string
  csrf_token: string
  expires_in: number
  user: SessionUser
  recovery_codes?: string[] | null
}
export interface Enrollment {
  secret: string
  otpauth_uri: string
}
export type AuthPhase = 'unknown' | 'anonymous' | 'mfa' | 'authenticated'
export interface AuthState {
  phase: AuthPhase
  user: SessionUser | null
  // 被後端因閒置登出時為 idle，供登入頁說明；只是固定字面值，不跨分頁傳遞，下次登入即清除。
  ended?: 'idle'
}
