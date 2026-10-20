import { test as base, expect } from '@playwright/test'
import { startReconnectProxy } from './reconnect-proxy.ts'
import type {
  ProxyBase,
  ProxySummary,
  ReconnectLease,
  ReconnectProxy,
} from './reconnect-proxy-types.ts'

interface ReconnectTestFixtures {
  reconnectCase: {
    // 同test僅可保存一個case lease，不從browser接目的地。
    begin(target: string): ReconnectLease
    // 尚未begin時只回worker owner摘要。
    summary(): ProxySummary
  }
}
interface ReconnectWorkerFixtures {
  reconnectProxy: ReconnectProxy
}

// 固定runtime或公開factory都用相同owner流程，collection／list不建立資源。
export function createReconnectTest(start: () => Promise<ReconnectProxy>) {
  return base.extend<ReconnectTestFixtures, ReconnectWorkerFixtures>({
    reconnectProxy: [
      async ({ browserName }, use) => {
        if (browserName !== 'chromium') throw new Error('proxy_invalid_config')
        const proxy = await start()
        try {
          await use(proxy)
        } finally {
          await proxy.close()
        }
      },
      { scope: 'worker', auto: true, timeout: 5000 },
    ],
    reconnectCase: [
      async ({ reconnectProxy }, use) => {
        let lease: ReconnectLease | undefined
        try {
          await use({
            // 每test只有一個lease，close後亦不容許同test重新建立來重設scope。
            begin: (target) => {
              if (lease) throw new Error('proxy_capacity')
              lease = reconnectProxy.beginCase(
                (process.env.APP_BASE_PATH ?? '/').replace(/\/$/, '') as ProxyBase,
                target,
              )
              return lease
            },
            // 準備fixture期間看worker，begin後只能看該test scope。
            summary: () => lease?.summary() ?? reconnectProxy.summary(),
          })
        } finally {
          if (lease) {
            await lease.close()
            const remaining = lease.summary()
            if (
              remaining.active ||
              remaining.sockets ||
              remaining.http ||
              remaining.upgrades ||
              remaining.waiters ||
              remaining.timers
            )
              throw new Error('proxy_cleanup_timeout')
          }
        }
      },
      { auto: true, timeout: 5000 },
    ],
  })
}

export const test = createReconnectTest(startReconnectProxy)
export { expect }
