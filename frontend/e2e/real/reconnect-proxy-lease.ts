import {
  newProxySummary,
  type ProxyBase,
  type ProxySummary,
  type ReconnectLease,
  type TunnelHandle,
} from './reconnect-proxy-types.ts'
import { timing } from './reconnect-proxy-metrics.ts'

type Resource = { done: Promise<void>; stop: () => void; kind: 'socket' | 'http' | 'upgrade' }
type Waiter = {
  resolve: (handle: TunnelHandle) => void
  reject: (error: Error) => void
  remove: () => void
}

// Node-only lease以物件identity隔離epoch，從不解析或保存WS frame。
export class ProxyLease implements ReconnectLease {
  readonly state = newProxySummary()
  readonly resources = new Map<object, Resource>()
  readonly timers = new Set<object>()
  readonly #pairs = new Map<TunnelHandle, { stop: () => void; cut: boolean; row: number }>()
  readonly #queue: TunnelHandle[] = []
  readonly #waiters: Waiter[] = []
  #closing: Promise<void> | undefined
  #upgradeCount = 0
  // base與UUID在建立時已驗證，僅供固定路徑匹配。
  readonly base: ProxyBase
  readonly target: string
  // 顯式欄位指定，讓Node24原生strip也能載入，不用parameter property。
  constructor(base: ProxyBase, target: string) {
    this.base = base
    this.target = target
  }
  // 關閉後不允許任何新控制或上游工作。
  get closed(): boolean {
    return !!this.#closing
  }
  // HTTP與socket各自追蹤真完成promise，不能只清map作假。
  track(key: object, resource: Resource): void {
    if (this.closed) {
      resource.stop()
      return
    }
    if (this.resources.has(key)) return
    this.resources.set(key, resource)
    void resource.done.then(/* native結束才移除。 */ () => this.resources.delete(key))
  }
  // pending與accepted皆計入active上限，不能以慢握手繞過容量。
  reserve(): boolean {
    if (
      this.closed ||
      this.#upgradeCount >= 16 ||
      this.summary().active + this.summary().upgrades >= 4
    )
      return false
    this.#upgradeCount++
    return true
  }
  // 真101後才發handle；callback只收到安全identity及時間。
  accept(stop: () => void, done: Promise<void>): TunnelHandle {
    if (this.closed) {
      stop()
      throw new Error('proxy_closed')
    }
    const handle = Object.freeze({ index: this.state.accepted++, acceptedAt: performance.now() })
    const row = this.state.attempts.length - 1
    this.#pairs.set(handle, { stop, cut: false, row })
    timing(this.state, row, 'acceptedAt', handle.acceptedAt)
    void done.then(/* 不能保留已死pair讓舊handle再次生效。 */ () => this.#pairs.delete(handle))
    const waiter = this.#waiters.shift()
    if (waiter) {
      waiter.remove()
      waiter.resolve(handle)
    } else this.#queue.push(handle)
    return handle
  }
  // 一次出隊且可由相同case AbortSignal取消，不影響既有tunnel。
  nextAccepted(signal: AbortSignal): Promise<TunnelHandle> {
    if (this.closed) return Promise.reject(new Error('proxy_closed'))
    if (signal.aborted) return Promise.reject(new Error('proxy_cancelled'))
    while (this.#queue.length) {
      const handle = this.#queue.shift()!
      if (this.#pairs.has(handle)) return Promise.resolve(handle)
    }
    if (this.#waiters.length >= 16) return Promise.reject(new Error('proxy_capacity'))
    return new Promise<TunnelHandle>((resolve, reject) => {
      // 取消時移除listener與原resolver，晚到101不能叫醒舊waiter。
      const abort = (): void => {
        const index = this.#waiters.indexOf(waiter)
        if (index >= 0) this.#waiters.splice(index, 1)
        waiter.remove()
        reject(new Error('proxy_cancelled'))
      }
      const waiter: Waiter = {
        resolve,
        reject,
        remove: /* 控制listener有單一owner。 */ () => signal.removeEventListener('abort', abort),
      }
      this.#waiters.push(waiter)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  // 不接受index相同的copy、已cut、自然關閉或其他lease的handle。
  interrupt(handle: TunnelHandle): void {
    const pair = this.#pairs.get(handle)
    if (this.closed || !pair || pair.cut) throw new Error('proxy_invalid_handle')
    pair.cut = true
    timing(this.state, pair.row, 'cutAt', performance.now())
    pair.stop()
  }
  // 只回深拷貝scalar，不暴露cancel callback或resource key。
  summary(): ProxySummary {
    const kinds = { socket: 0, http: 0, upgrade: 0 }
    for (const item of this.resources.values()) kinds[item.kind]++
    return structuredClone({
      ...this.state,
      sockets: kinds.socket,
      http: kinds.http,
      upgrades: kinds.upgrade,
      active: this.#pairs.size,
      waiters: this.#waiters.length,
      timers: this.timers.size,
      closed: this.closed,
    })
  }
  // 收尾先作廢epoch、拒舊waiter，再等待真resource close；重入共享結果。
  close(): Promise<void> {
    if (!this.#closing) {
      this.#closing = Promise.resolve().then(async () => {
        for (const waiter of this.#waiters.splice(0)) {
          waiter.remove()
          waiter.reject(new Error('proxy_closed'))
        }
        this.#queue.length = 0
        const resources = [...this.resources.values()]
        for (const resource of resources) resource.stop()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            Promise.all(resources.map(/* 等原生done，不靠stop回傳。 */ (item) => item.done)),
            new Promise<never>(
              /* cleanup亦有界。 */ (_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('proxy_cleanup_timeout')), 5000)
                this.timers.add(timer)
              },
            ),
          ])
        } finally {
          if (timer) {
            clearTimeout(timer)
            this.timers.delete(timer)
          }
        }
      })
    }
    return this.#closing
  }
}
