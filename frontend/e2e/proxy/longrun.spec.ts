import { test, expect, type Page } from '@playwright/test'
import {
  createLongrunPageProbe,
  longrunPagePorts,
  type LongrunPageProbe,
} from '../real/reconnect-longrun-page'
import { createLoopbackProxy } from '../real/reconnect-proxy'
import type { ReconnectLease, ReconnectProxy } from '../real/reconnect-proxy-types'
import { PUBLIC_TARGET, serve } from './public-fixtures'
import { mountCalibration, calibrationStep, calibrationSawError } from './longrun-calibration'

let proxy: ReconnectProxy,
  lease: ReconnectLease,
  endpoint: Awaited<ReturnType<typeof serve>>,
  probe: LongrunPageProbe | undefined
const resources = { opened: 0, closed: 0, wrongPrefix: 0 }
// 公開proxy只用OS port，頁面僅setContent、不載正式runtime。
test.beforeEach(async ({ page }) => {
  resources.opened = resources.closed = resources.wrongPrefix = 0
  probe = undefined
  endpoint = await serve(/* 只作公開owner基礎，不提供假RustDesk。 */ (_req, res) => res.end())
  proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  lease = proxy.beginCase('', PUBLIC_TARGET)
  await page.setContent(
    '<canvas data-testid="console-canvas" width="1280" height="720"></canvas><p data-testid="console-streaming">Public streaming</p>',
  )
})
// 無論assertion失敗仍只釋放本case的公開owner。
test.afterEach(async () => {
  try {
    await probe?.close()
  } finally {
    try {
      await proxy?.close()
    } finally {
      await endpoint?.close()
    }
  }
})
// 每case最多一個probe，方便finally驗真close。
async function setup(page: Page): Promise<LongrunPageProbe> {
  probe = await createLongrunPageProbe(page, lease, resources)
  return probe
}
// DOM短暫顯示1、2再移除，不能只看最後空狀態。
test('records retry 1 then 2 even if badge disappears', async ({ page }) => {
  const value = await setup(page)
  await page.evaluate(() => {
    const p = document.createElement('p')
    p.dataset.testid = 'console-reconnect'
    p.textContent = '重新連線第 1／3 次'
    document.body.append(p)
  })
  await page.evaluate(() => {
    document.querySelector('[data-testid="console-reconnect"]')!.textContent = '重新連線第 2／3 次'
  })
  await page.evaluate(() => document.querySelector('[data-testid="console-reconnect"]')!.remove())
  expect((await value.read(new AbortController().signal)).retryMask).toBe(3)
  await value.mark(null)
  expect((await value.read(new AbortController().signal)).retryMask).toBe(0)
})
// 一度hidden與fatal不應因mark或DOM移除被洗成健康。
test('latches hidden and transient terminal', async ({ page }) => {
  const value = await setup(page)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    const p = document.createElement('p')
    p.dataset.errorCode = 'Public private sentinel'
    document.body.append(p)
  })
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.querySelector('[data-error-code]')!.remove()
  })
  await value.mark(null)
  const state = await value.read(new AbortController().signal)
  expect(state.visibleThroughout).toBe(false)
  expect(state.terminal).toBe('other')
  expect(JSON.stringify(state).includes('Public private sentinel')).toBe(false)
})
// 同一DOM task出現又刪掉的fatal屬性也不能被最後狀態洗掉。
test('latches an error attribute removed in the same DOM task', async ({ page }) => {
  await page.evaluate(() => {
    const p = document.createElement('p')
    p.id = 'public-alert'
    document.body.append(p)
  })
  const value = await setup(page)
  await page.evaluate(() => {
    const p = document.querySelector('#public-alert')!
    p.setAttribute('data-error-code', 'Public transient private code')
    p.removeAttribute('data-error-code')
  })
  expect((await value.read(new AbortController().signal)).terminal).toBe('other')
})
// 被同task改回1的2仍是實際DOM變動，不能證first-only。
test('latches a retry badge changed twice in the same DOM task', async ({ page }) => {
  await page.evaluate(() => {
    const p = document.createElement('p')
    p.dataset.testid = 'console-reconnect'
    p.textContent = '重新連線第 1／3 次'
    document.body.append(p)
  })
  const value = await setup(page)
  await page.evaluate(() => {
    const p = document.querySelector('[data-testid="console-reconnect"]')!
    p.textContent = '重新連線第 2／3 次'
    p.textContent = '重新連線第 1／3 次'
  })
  expect((await value.read(new AbortController().signal)).retryMask).toBe(3)
})
// checksum僅在私有handle；固定像素不能假造clockChanged。
test('frozen clock never becomes healthy and mark resets baseline', async ({ page }) => {
  const value = await setup(page),
    signal = new AbortController().signal
  expect((await value.read(signal)).clockChanged).toBe(false)
  await page.evaluate(() => {
    const context = document.querySelector<HTMLCanvasElement>('canvas')!.getContext('2d')!
    context.fillStyle = '#1a668f'
    context.fillRect(200, 250, 100, 100)
  })
  expect((await value.read(signal)).clockChanged).toBe(true)
  expect((await value.read(signal)).clockChanged).toBe(false)
  await value.mark(null)
  expect((await value.read(signal)).clockChanged).toBe(false)
})
// 正確Worker需原生identity，關掉後不能維持sameWorker=true。
test('tracks the identity of an owned public Worker', async ({ page }) => {
  const value = await setup(page)
  const pending = page.waitForEvent('worker')
  await page.evaluate(() => {
    const worker = new Worker(
      URL.createObjectURL(new Blob(['onmessage=()=>{}'], { type: 'text/javascript' })),
    )
    ;(
      document.querySelector('canvas') as HTMLCanvasElement & { publicWorker?: Worker }
    ).publicWorker = worker
  })
  const worker = await pending
  await value.mark(worker)
  expect((await value.read(new AbortController().signal)).sameWorker).toBe(true)
  await page.evaluate(() => {
    ;(
      document.querySelector('canvas') as HTMLCanvasElement & { publicWorker?: Worker }
    ).publicWorker!.terminate()
  })
  await expect
    .poll(
      /* 真browser Worker close才改identity結果。 */ async () =>
        (await value.read(new AbortController().signal)).sameWorker,
    )
    .toBe(false)
})
// close或已取消read一律拒絕，ports的sleep也要可取消。
test('disposed probe and cancelled ports refuse work', async ({ page }) => {
  const value = await setup(page),
    abort = new AbortController()
  const ports = longrunPagePorts(value)
  const pending = ports.wait(10000, abort.signal)
  const rejected = expect(pending).rejects.toThrow()
  abort.abort()
  await rejected
  await expect(value.read(abort.signal)).rejects.toThrow('longrun_cancelled')
  await value.close()
  await expect(value.read(new AbortController().signal)).rejects.toThrow('longrun_cancelled')
  await expect(value.mark(null)).rejects.toThrow('longrun_cancelled')
})
// 被動觀察不得觸碰native clipboard、輸入、網路或額外Worker。
test('native ports untouched', async ({ page }) => {
  let requests = 0,
    workers = 0,
    sockets = 0
  page.on('request', /* 未預期網路請求直接計越界。 */ () => requests++)
  page.on('worker', /* 本案不應建立Worker。 */ () => workers++)
  page.on('websocket', /* 本案不應建立WS。 */ () => sockets++)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      get: /* 禁止任何OS入口。 */ () => {
        throw new Error('public_clipboard_forbidden')
      },
    })
  })
  const value = await setup(page)
  await value.mark(null)
  await value.read(new AbortController().signal)
  expect({ requests, workers, sockets }).toEqual({ requests: 0, workers: 0, sockets: 0 })
})

// 正常retry不應短暫顯示終態錯誤；短恢復與stable重設均由正式排程器裁決。
for (const [label, cause, stable] of [
  ['network after stable reset', 'network', true],
  ['network after short recovery', 'network', false],
  ['temporary within the original cycle', 'temporary', false],
] as const) {
  test(`retry presentation stays error-free for ${label}`, async ({ page }) => {
    await page.goto('http://127.0.0.1:' + endpoint.port)
    let nativeCalls = 0
    page.on('request', /* mount後不應有任何真HTTP。 */ () => nativeCalls++)
    page.on('worker', /* typed公開port不應建立native Worker。 */ () => nativeCalls++)
    page.on('websocket', /* 不應建立真串流。 */ () => nativeCalls++)
    await mountCalibration(page)
    try {
      await expect(page.getByTestId('console-streaming')).toHaveCount(1)
      const value = await setup(page)
      await calibrationStep(page, 'network')
      await expect(page.getByTestId('console-reconnect')).toHaveText('重新連線第 1／3 次')
      expect((await value.read(new AbortController().signal)).terminal).toBe('none')
      expect(await calibrationSawError(page)).toBe(false)
      await page.clock.runFor(2100)
      await expect(page.getByTestId('console-streaming')).toHaveCount(1)
      await value.mark(null)
      // 逐段維持公開activity，不偽造真正MAC或畫面更新；只驗狀態轉換。
      if (stable)
        for (let i = 0; i < 3; i++) {
          await calibrationStep(page, 'active')
          await page.clock.runFor(21000)
        }
      await calibrationStep(page, cause)
      await expect(page.getByTestId('console-reconnect')).toHaveText('重新連線第 1／3 次')
      await expect(page.locator('[data-error-code]')).toHaveCount(0)
      expect(await calibrationSawError(page)).toBe(false)
      // observer完全不放寬；UI本身不能製造短命的fatal樣式錯誤。
      expect(await value.read(new AbortController().signal)).toMatchObject({
        terminal: 'none',
        visibleThroughout: true,
        retryMask: 1,
      })
      await page.clock.runFor(stable ? 2100 : 5100)
      await expect(page.getByTestId('console-streaming')).toHaveCount(1)
      expect((await value.read(new AbortController().signal)).terminal).toBe('none')
      expect(nativeCalls).toBe(0)
    } finally {
      await calibrationStep(page, 'close')
    }
  })
}

// 真fatal使用相同connection_failed；不可為讓network過渡通過而加入全域白名單。
test('calibrates fatal with the same public error code', async ({ page }) => {
  await page.goto('http://127.0.0.1:' + endpoint.port)
  await mountCalibration(page)
  try {
    await expect(page.getByTestId('console-streaming')).toHaveCount(1)
    const value = await setup(page)
    await calibrationStep(page, 'fatal')
    await expect(page.locator('[data-error-code="connection_failed"]')).toHaveCount(1)
    await expect(page.getByTestId('console-reconnect')).toHaveCount(0)
    expect(await calibrationSawError(page)).toBe(true)
    expect((await value.read(new AbortController().signal)).terminal).toBe('other')
  } finally {
    await calibrationStep(page, 'close')
  }
})

// 不能因延後attempt錯誤呈現而吞掉外層已決定終止的錯誤。
for (const [label, cause, expected] of [
  ['disabled auto reconnect', 'network', 'connection_failed'],
  ['temporary without an active cycle', 'temporary', 'connection_failed'],
  ['fatal rate limited', 'rate-limited', 'rate_limited'],
] as const) {
  test(`terminal error remains visible for ${label}`, async ({ page }) => {
    await page.goto('http://127.0.0.1:' + endpoint.port)
    await mountCalibration(page)
    try {
      await expect(page.getByTestId('console-streaming')).toHaveCount(1)
      const value = await setup(page)
      if (cause === 'network') await page.getByTestId('console-auto-reconnect').uncheck()
      await calibrationStep(page, cause)
      await expect(page.locator(`[data-error-code="${expected}"]`)).toHaveCount(1)
      await expect(page.getByTestId('console-reconnect')).toHaveCount(0)
      expect((await value.read(new AbortController().signal)).terminal).toBe('other')
      await page.clock.runFor(10500)
      await expect(page.locator(`[data-error-code="${expected}"]`)).toHaveCount(1)
      await expect(page.getByTestId('console-streaming')).toHaveCount(0)
      await expect(page.getByTestId('console-reconnect')).toHaveCount(0)
    } finally {
      await calibrationStep(page, 'close')
    }
  })
}
