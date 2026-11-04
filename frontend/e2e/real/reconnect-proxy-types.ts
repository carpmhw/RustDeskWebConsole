export type ProxyBase = '' | '/rdweb' | '/a/b/c'
export type RouteClass =
  'other' | 'me' | 'target' | 'ticket' | 'assist' | 'login' | 'refresh' | 'logout'
export interface RouteCounts {
  requested: number
  succeeded: number
  denied: number
  limited: number
  lastAt: number | null
}
export interface AttemptTiming {
  metadataAt: number
  meAt: number | null
  ticketAt: number | null
  acceptedAt: number | null
  cutAt: number | null
}
export interface ProxySummary {
  accepted: number
  active: number
  sockets: number
  http: number
  upgrades: number
  waiters: number
  timers: number
  closed: boolean
  pauses: number
  drains: number
  peakReadable: number
  peakWritable: number
  routes: Readonly<Record<RouteClass, Readonly<RouteCounts>>>
  attempts: ReadonlyArray<Readonly<AttemptTiming>>
}
export interface TunnelHandle {
  readonly index: number
  readonly acceptedAt: number
}
export interface ReconnectLease {
  // 取消僅影響這個等待者，不切其他連線。
  nextAccepted(signal: AbortSignal): Promise<TunnelHandle>
  // 只接受同owner尚未中斷的handle identity。
  interrupt(handle: TunnelHandle): void
  // 只回安全scalar的深層copy。
  summary(): ProxySummary
  // 重入回同一收尾結果，成功代表真資源結束。
  close(): Promise<void>
}
export interface ReconnectProxy {
  readonly port: number
  // 保存的target UUID只在Node closure中匹配。
  beginCase(base: ProxyBase, targetId: string): ReconnectLease
  // 回worker owner內的安全摘要。
  summary(): ProxySummary
  // 關閉listener及所有自有連線。
  close(): Promise<void>
}

// 新owner只持有固定欄位，不建立任意header／payload索引。
export function newProxySummary(): ProxySummary {
  const routes = {} as Record<RouteClass, RouteCounts>
  for (const route of [
    'other',
    'me',
    'target',
    'ticket',
    'assist',
    'login',
    'refresh',
    'logout',
  ] as const) {
    routes[route] = { requested: 0, succeeded: 0, denied: 0, limited: 0, lastAt: null }
  }
  return {
    accepted: 0,
    active: 0,
    sockets: 0,
    http: 0,
    upgrades: 0,
    waiters: 0,
    timers: 0,
    closed: false,
    pauses: 0,
    drains: 0,
    peakReadable: 0,
    peakWritable: 0,
    routes,
    attempts: [],
  }
}
