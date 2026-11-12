import type { AuthState } from '../api/types'

export type AppRoute =
  | 'overview'
  | 'security'
  | 'preferences'
  | 'servers'
  | 'targets'
  | 'console'
  | 'password'
  | 'users'
  | 'audit'
  | 'connections'
  | 'login'
  | 'not-found'
// 只接受已知站內路由名稱，不把任意query當作redirect URL。
export function safeNext(
  value: unknown,
):
  | 'overview'
  | 'security'
  | 'preferences'
  | 'servers'
  | 'targets'
  | 'users'
  | 'audit'
  | 'connections' {
  return value === 'security' ||
    value === 'preferences' ||
    value === 'servers' ||
    value === 'targets' ||
    value === 'users' ||
    value === 'audit' ||
    value === 'connections'
    ? value
    : 'overview'
}
// 集中匿名／restricted／已登入導向，unknown由router先等restore。
export function routeDecision(
  state: AuthState,
  target: AppRoute,
  needsAuth: boolean,
): AppRoute | null {
  if (state.phase === 'unknown') return null
  if (needsAuth && state.phase !== 'authenticated') return 'login'
  // 必須改密碼優先於雙重驗證綁定；完成後才進入其他限制或頁面。
  if (state.phase === 'authenticated' && state.user?.password_change_required)
    return target === 'password' ? null : 'password'
  if (state.phase === 'authenticated' && target === 'password')
    return state.user?.mfa_enrollment_required ? 'security' : 'overview'
  if (
    state.phase === 'authenticated' &&
    state.user?.mfa_enrollment_required &&
    target !== 'security'
  )
    return 'security'
  if (state.phase === 'authenticated' && target === 'login') return 'overview'
  if (state.phase === 'authenticated' && target === 'console' && state.user?.role === 'viewer')
    return 'targets'
  if (
    state.phase === 'authenticated' &&
    (target === 'servers' ||
      target === 'users' ||
      target === 'audit' ||
      target === 'connections') &&
    state.user?.role !== 'admin'
  )
    return 'overview'
  return null
}
