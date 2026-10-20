import { test, expect } from '@playwright/test'
import { observeIngressHttp } from '../e2e-real/reconnect-ingress-page'
import { startIngressWatch, type IngressSnapshot } from '../e2e-real/reconnect-ingress-watch'
import { newProxySummary } from '../e2e-real/reconnect-proxy-types'
import { setTimeout as sleep } from 'node:timers/promises'
const target = '00000000-0000-4000-8000-000000000001'
// 公開route只在測試替身提供，未連真18080或產品認證。
for (const mode of ['503', 'network', '429']) {
  test('first API failure latch over public Main HTTP: ' + mode, async ({ page }) => {
    let broken = false
    await page.route(
      'http://127.0.0.1:18080/**',
      /* 不觸正式runtime，公開頁面與API皆由替身回應。 */ async (route) => {
        if (!route.request().url().includes('/api/')) {
          await route.fulfill({ contentType: 'text/html', body: '<p>public</p>' })
          return
        }
        if (broken && mode === 'network') await route.abort('connectionfailed')
        else await route.fulfill({ status: broken ? Number(mode) : 200, body: '{}' })
      },
    )
    await page.goto('http://127.0.0.1:18080/rdweb/')
    const latch = observeIngressHttp(page, target)
    let rejected = false
    void latch.failed.catch(
      /* 僅公開布林，不讀原錯誤或資料。 */ () => {
        rejected = true
      },
    )
    try {
      await page.evaluate(
        /* 公開請求不含認證。 */ async (path) => {
          await fetch(path).catch(() => {})
        },
        `/rdweb/api/v1/targets/${target}`,
      )
      expect(rejected).toBe(false)
      broken = true
      const failed = expect(latch.failed).rejects.toThrow('ingress_observation_failed')
      await page.evaluate(
        /* 真Main requestfailed或status由事件產生。 */ async (path) => {
          await fetch(path, { method: 'POST' }).catch(() => {})
        },
        `/rdweb/api/v1/targets/${target}/connect-ticket`,
      )
      await failed
    } finally {
      latch.close()
    }
  })
}
// 真公開Worker關閉校準新Worker提前close，不攔截WS／crypto或產品worker。
test('failed first upgrade closes new public Worker and remains fatal to watch', async ({
  page,
}) => {
  let opened = 0,
    closed = 0
  page.on(
    'worker',
    /* 只讀真正Worker生命週期。 */ (worker) => {
      opened++
      worker.once('close', () => {
        closed++
      })
    },
  )
  await page.setContent('<p>public worker fixture</p>')
  const first = await page.evaluateHandle(
    /* 公開空Worker不連網。 */ () => {
      const url = URL.createObjectURL(
        new Blob(['onmessage=()=>close()'], { type: 'text/javascript' }),
      )
      const worker = new Worker(url)
      URL.revokeObjectURL(url)
      return worker
    },
  )
  await expect.poll(/* 等實際事件到位，不手寫opened。 */ () => opened).toBe(1)
  const rows = newProxySummary().routes
  const state: IngressSnapshot = {
    counts: { metadata: 1, tickets: 1, accepted: 1, opened: 1, closed: 0 },
    visibleThroughout: true,
    streaming: true,
    sameWorker: true,
    terminal: 'none',
    retryMask: 0,
    clockChanged: false,
    latestMetadataAt: performance.now(),
    cutsNull: true,
    routes: {
      target: { ...rows.target, requested: 1, succeeded: 1 },
      ticket: { ...rows.ticket, requested: 1, succeeded: 1 },
      me: { ...rows.me, requested: 2, succeeded: 2 },
      assist: { ...rows.assist, requested: 1, succeeded: 1 },
    },
  }
  const watch = startIngressWatch(
    {
      now: /* 真Node時鐘。 */ () => performance.now(),
      read: /* 只有HTTP scalar是公開producer，Worker數來自真事件。 */ async () => ({
        ...structuredClone(state),
        counts: { ...state.counts, opened, closed },
      }),
      wait: /* runtime sleep有取消，不用fake clock。 */ async (ms, signal) => {
        await sleep(ms, undefined, { signal })
      },
    },
    structuredClone(state),
    new AbortController().signal,
  )
  let second: typeof first | undefined
  try {
    await first.evaluate(
      /* 結束本案第一個公開Worker。 */ (worker) => worker.postMessage('public-stop'),
    )
    await expect.poll(/* 舊Worker真close。 */ () => closed).toBe(1)
    second = await page.evaluateHandle(
      /* 第二個公開Worker也不載產品程式。 */ () => {
        const url = URL.createObjectURL(
          new Blob(['onmessage=()=>close()'], { type: 'text/javascript' }),
        )
        const worker = new Worker(url)
        URL.revokeObjectURL(url)
        return worker
      },
    )
    await expect.poll(/* 第二個open必須來自真事件。 */ () => opened).toBe(2)
    state.counts = { metadata: 2, tickets: 2, accepted: 2, opened: 2, closed: 1 }
    state.latestMetadataAt = performance.now()
    state.retryMask = 1
    state.routes = {
      ...state.routes,
      target: { ...rows.target, requested: 2, succeeded: 2 },
      ticket: { ...rows.ticket, requested: 2, succeeded: 2 },
      me: { ...rows.me, requested: 3, succeeded: 3 },
    }
    await watch.fresh
    const failed = expect(watch.failed).rejects.toThrow('ingress_observation_failed')
    await second.evaluate(
      /* 未beginEnd先關新Worker，必須FAIL。 */ (worker) => worker.postMessage('public-stop'),
    )
    await failed
  } finally {
    await watch.close()
    await first.evaluate(/* 僅終止自有公開worker。 */ (worker) => worker.terminate())
    await second?.evaluate(/* 不清理其他Worker。 */ (worker) => worker.terminate())
    await first.dispose()
    await second?.dispose()
    await expect.poll(/* 所有公開Worker真close。 */ () => closed).toBe(opened)
  }
})
