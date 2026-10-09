import type { AuthState } from '../api/types'

export type AppRoute =
  | 'overview'
  | 'security'
  | 'preferences'
  | 'servers'
  | 'targets'
  | 'console'
  | 'login'
  | 'not-found'
// 只接受已知站內路由名稱，不把任意query當作redirect URL。
export function safeNext(
  value: unknown,
): 'overview' | 'security' | 'preferences' | 'servers' | 'targets' {
  return value === 'security' ||
    value === 'preferences' ||
    value === 'servers' ||
    value === 'targets'
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
  if (
    state.phase === 'authenticated' &&
    state.user?.mfa_enrollment_required &&
    target !== 'security'
  )
    return 'security'
  if (state.phase === 'authenticated' && target === 'login') return 'overview'
  if (state.phase === 'authenticated' && target === 'console' && state.user?.role === 'viewer')
    return 'targets'
  if (state.phase === 'authenticated' && target === 'servers' && state.user?.role !== 'admin')
    return 'overview'
  return null
}
