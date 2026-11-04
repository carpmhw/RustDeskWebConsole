import type { Page } from '@playwright/test'
import type { ReconnectLease } from './reconnect-proxy-types'
import type { LongrunPageProbe } from './reconnect-longrun-page'
import type { IngressWatchPorts } from './reconnect-ingress-watch'
import { routeClass } from './reconnect-proxy-metrics'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Request, Response } from '@playwright/test'
// Main四種正式API的第一個失敗永久拒絕，不讀body／headers或保存URL。
export function observeIngressHttp(
  page: Page,
  targetId: string,
): { failed: Promise<never>; close(): void } {
  let rejectFailed!: (error: Error) => void,
    closed = false
  const failed = new Promise<never>(
    /* 原promise交給主流程race。 */ (_resolve, reject) => {
      rejectFailed = reject
    },
  )
  void failed.catch(/* 不吞掉原promise的拒絕。 */ () => {})
  // URL只瞬時分類；不存request、ticket或認證內容。
  const relevant = (request: Request): boolean => {
    try {
      const url = new URL(request.url())
      return (
        url.origin === 'http://127.0.0.1:18080' &&
        ['target', 'me', 'ticket', 'assist'].includes(
          routeClass(request.method(), url.pathname, { base: '/rdweb', target: targetId }),
        )
      )
    } catch {
      return false
    }
  }
  const response = /* 任一非2xx都不能由後續auto洗掉。 */ (value: Response): void => {
    if (!closed && relevant(value.request()) && (value.status() < 200 || value.status() >= 300))
      rejectFailed(new Error('ingress_observation_failed'))
  }
  const requestFailed = /* 不回報原生failure字串。 */ (value: Request): void => {
    if (!closed && relevant(value)) rejectFailed(new Error('ingress_observation_failed'))
  }
  page.on('response', response)
  page.on('requestfailed', requestFailed)
  return {
    failed,
    close: /* 關頁前同步解除，只移除自己的listener。 */ () => {
      closed = true
      page.off('response', response)
      page.off('requestfailed', requestFailed)
    },
  }
}
// 沿用既有被動probe，不新增產品事件、frame或crypto觀察。
export function ingressPagePorts(
  probe: LongrunPageProbe,
  lease: ReconnectLease,
): IngressWatchPorts {
  return {
    now: /* 固定Node時計。 */ () => performance.now(),
    read: /* 只合併安全copy，probe仍單owner。 */ async (signal) => {
      const value = await probe.read(signal),
        state = lease.summary()
      return {
        ...value,
        routes: {
          target: { ...state.routes.target },
          me: { ...state.routes.me },
          ticket: { ...state.routes.ticket },
          assist: { ...state.routes.assist },
        },
        cutsNull: state.attempts.every(/* 不偽造cut。 */ (row) => row.cutAt === null),
      }
    },
    wait: /* close／取消沿同signal終止sleep。 */ async (ms, signal) => {
      await sleep(ms, undefined, { signal })
    },
  }
}
