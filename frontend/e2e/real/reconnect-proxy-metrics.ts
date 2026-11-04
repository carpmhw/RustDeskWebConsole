import type { ProxyBase, ProxySummary, RouteClass } from './reconnect-proxy-types.ts'

// 僅以有限路由類別計數，不保留path、query、target或憑證原值。
export function routeClass(
  method: string,
  path: string,
  scope?: { base: ProxyBase; target: string },
): RouteClass {
  for (const base of ['', '/rdweb', '/a/b/c']) {
    if (method === 'GET' && path === base + '/api/v1/auth/me') return 'me'
    for (const kind of ['login', 'refresh', 'logout'] as const) {
      if (method === 'POST' && path === base + '/api/v1/auth/' + kind) return kind
    }
  }
  if (scope) {
    const target = scope.base + '/api/v1/targets/' + scope.target
    if (method === 'GET' && path === target) return 'target'
    if (method === 'POST' && path === target + '/connect-ticket') return 'ticket'
    if (method === 'POST' && path === target + '/login-assist') return 'assist'
  }
  return 'other'
}

// Requested時間只來自本機單調clock，不從peer JSON讀取。
export function countRequest(state: ProxySummary, kind: RouteClass, now: number): void {
  const previous = state.routes[kind]
  state.routes = {
    ...state.routes,
    [kind]: { ...previous, requested: previous.requested + 1, lastAt: now },
  }
}

// 只分固定status bucket，不讀response body或header。
export function countResponse(state: ProxySummary, kind: RouteClass, status: number): void {
  const previous = state.routes[kind]
  state.routes = {
    ...state.routes,
    [kind]: {
      ...previous,
      succeeded: previous.succeeded + (status >= 200 && status < 300 ? 1 : 0),
      denied: previous.denied + (status >= 400 && status < 500 && status !== 429 ? 1 : 0),
      limited: previous.limited + (status === 429 ? 1 : 0),
    },
  }
}

// 每列首次時間不可覆寫；沒有metadata便不虛構attempt。
export function timing(
  state: ProxySummary,
  index: number,
  field: 'meAt' | 'ticketAt' | 'acceptedAt' | 'cutAt',
  now: number,
): void {
  const previous = state.attempts[index]
  if (!previous || previous[field] !== null) return
  state.attempts = state.attempts.map(
    /* 只copy本列，snapshot不能改owner。 */ (row, position) =>
      position === index ? { ...row, [field]: now } : row,
  )
}

// metadata開始下一列，沒有101也必須受16列容量限制。
export function requestTiming(state: ProxySummary, kind: RouteClass, now: number): boolean {
  if (kind === 'target') {
    if (state.attempts.length >= 16) return false
    state.attempts = [
      ...state.attempts,
      { metadataAt: now, meAt: null, ticketAt: null, acceptedAt: null, cutAt: null },
    ]
  } else if (kind === 'me' || kind === 'ticket')
    timing(state, state.attempts.length - 1, kind === 'me' ? 'meAt' : 'ticketAt', now)
  return true
}
