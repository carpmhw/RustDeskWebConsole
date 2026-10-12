import { expect, test } from '@playwright/test'
import { resetStack } from '../e2e/helpers/fixtures'
import {
  prepareOfficialTarget,
  openOfficialConsole,
  waitForClock,
  clockChanges,
  observeConsole,
} from './fixtures'
// 每案重建隔離DB/KV，真正配額及auth不調低。
test.beforeEach(() => resetStack())
for (const transport of ['tcp', 'ws'] as const) {
  // 真Canvas時計背景與變化才是成功，不以PeerInfo或streaming文字作唯一oracle。
  test('official video controls and lifecycle over ' + transport, async ({ page, browser }) => {
    const resources = observeConsole(page.context())
    const fixture = await prepareOfficialTarget(transport)
    try {
      const consolePage = await openOfficialConsole(page, fixture)
      await waitForClock(consolePage)
      await expect(consolePage.getByTestId('console-streaming')).toBeVisible()
      expect(await clockChanges(consolePage)).toBe(true)
      // Task12主控台接線回歸：真正MAC／Canvas之後才接管native DOM輸入。
      await expect(consolePage.getByTestId('console-auto-reconnect')).toBeChecked()
      await expect(consolePage.getByTestId('console-cad')).toHaveCount(0)
      await consolePage.getByTestId('console-canvas').click({ position: { x: 10, y: 10 } })
      await expect(consolePage.getByTestId('console-input-active')).toBeVisible()
      await consolePage.getByTestId('console-zoom').focus()
      await expect(consolePage.getByTestId('console-input-active')).toHaveCount(0)
      // 只在test端模擬browser拒絕native read，auth／WS／crypto沿正式API。
      await consolePage.evaluate(() => {
        navigator.clipboard.readText = async () => {
          throw new Error('public-native-denial')
        }
      })
      await consolePage.getByTestId('console-clipboard-send').click()
      await expect(consolePage.getByTestId('console-clipboard-dialog')).toBeVisible()
      await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
      await consolePage.getByTestId('console-clipboard-text').fill('Public transient fallback')
      await consolePage.getByTestId('console-clipboard-close').click()
      expect(
        await consolePage
          .getByTestId('console-clipboard-text')
          .evaluate(
            /* 不把DOM內容帶到report。 */ (element) =>
              (element as HTMLTextAreaElement).value === '',
          ),
      ).toBe(true)
      await consolePage.getByTestId('console-clipboard-send').click()
      await expect(consolePage.getByTestId('console-clipboard-dialog')).toBeVisible()
      await consolePage.getByTestId('console-clipboard-text').fill('Public expiring fallback')
      await expect(consolePage.getByTestId('console-clipboard-dialog')).not.toBeVisible({
        timeout: 35000,
      })
      expect(
        await consolePage
          .getByTestId('console-clipboard-text')
          .evaluate(
            /* 30秒清除只回布林。 */ (element) => (element as HTMLTextAreaElement).value === '',
          ),
      ).toBe(true)
      expect(await clockChanges(consolePage)).toBe(true)
      for (const value of ['fit', 'original', '0.5', '1', '1.5', '2']) {
        await consolePage.getByTestId('console-zoom').selectOption(value)
        expect(
          await consolePage.getByTestId('console-canvas').evaluate((element, zoom) => {
            const canvas = element as HTMLCanvasElement
            const viewport = canvas.parentElement!
            const scale =
              zoom === 'fit'
                ? Math.min(viewport.clientWidth / 1280, viewport.clientHeight / 720)
                : zoom === 'original'
                  ? 1
                  : Number(zoom)
            return (
              canvas.width === 1280 &&
              canvas.height === 720 &&
              Math.abs(parseFloat(canvas.style.width) - 1280 * scale) < 1 &&
              Math.abs(parseFloat(canvas.style.height) - 720 * scale) < 1
            )
          }, value),
        ).toBe(true)
      }
      for (const value of ['low', 'balanced', 'high'])
        await consolePage.getByTestId('console-quality').selectOption(value)
      await consolePage.getByTestId('console-fullscreen').click()
      await expect
        .poll(() => consolePage.evaluate(() => document.fullscreenElement !== null))
        .toBe(true)
      await consolePage.evaluate(() => document.exitFullscreen())
      await consolePage.getByTestId('console-zoom').selectOption('fit')
      // 拒絕路徑是test端browser行為，production不增加flag或降級。
      await consolePage.evaluate(() => {
        HTMLElement.prototype.requestFullscreen = async () => {
          throw new Error('public-denial')
        }
      })
      await consolePage.getByTestId('console-fullscreen').click()
      await expect(consolePage.getByTestId('console-fullscreen-unavailable')).toBeVisible()
      await expect(consolePage.getByTestId('console-streaming')).toBeVisible()
      expect(await clockChanges(consolePage)).toBe(true)
      await consolePage.reload()
      await waitForClock(consolePage)
      await consolePage.getByTestId('console-end').click()
      await expect(consolePage.getByTestId('console-phase')).toHaveText('連線已取消／關閉')
      expect(
        await consolePage.getByTestId('console-canvas').evaluate((element) => {
          const canvas = element as HTMLCanvasElement
          return canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height)
            .data.every((value) => value === 0)
        }),
      ).toBe(true)
      await expect.poll(() => resources.closed).toBe(resources.opened)
      await consolePage.getByTestId('console-retry').click()
      await waitForClock(consolePage)
      expect(resources.wrongPrefix).toBe(0)
      expect(resources.workerAssets >= 3 && resources.opened >= 3 && resources.sockets >= 3).toBe(
        true,
      )
      const codec = await consolePage.getByTestId('console-stats').textContent()
      expect(/^(VP8|VP9|AV1|H264)/.test(codec ?? '')).toBe(true)
      console.log(
        'Official video: ' +
          browser.version() +
          '/' +
          transport +
          '/' +
          codec?.match(/^(VP8|VP9|AV1|H264)/)?.[0],
      )
      expect(
        await consolePage.evaluate(
          () =>
            Object.keys(localStorage).every((key) =>
              ['rdweb.colorMode', 'rdweb.locale', 'rdweb.displayTimeZone'].includes(key),
            ) && sessionStorage.length === 0,
        ),
      ).toBe(true)
      await consolePage.close()
    } finally {
      await fixture.context.dispose()
    }
  })
  // Main停頓仍有真加密影像，30秒inflight timeout必须清資源及Canvas。
  test('official slow presentation remains bounded over ' + transport, async ({ page }) => {
    const resources = observeConsole(page.context())
    // 在renderer捕捉native方法之前加入test端wrapper，production沒有測試flag。
    await page.context().addInitScript(() => {
      let paused = false
      const original = window.requestAnimationFrame.bind(window)
      window.addEventListener('rdweb-public-test-pause', () => {
        paused = true
      })
      window.requestAnimationFrame = (callback) =>
        original((time) => {
          if (!paused) callback(time)
        })
    })
    const fixture = await prepareOfficialTarget(transport)
    try {
      const consolePage = await openOfficialConsole(page, fixture)
      await waitForClock(consolePage)
      expect(await clockChanges(consolePage)).toBe(true)
      const cdp = await consolePage.context().newCDPSession(consolePage)
      await cdp.send('Performance.enable')
      // CDP只讀Main JS heap數字，沒有像素或native/GPU總bytes的宣稱。
      const heap = async (): Promise<number> => {
        const result = await cdp.send('Performance.getMetrics')
        const value = result.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value
        if (value === undefined || !Number.isFinite(value))
          throw new Error('Safe heap metric unavailable')
        return Math.round(value / 1024)
      }
      const before = await heap()
      await consolePage.evaluate(() => window.dispatchEvent(new Event('rdweb-public-test-pause')))
      // 固定觀察間隔用來取趨勢，不修改production期限或等待假的成功訊號。
      await consolePage.waitForTimeout(12000)
      const during = await heap()
      await expect(consolePage.getByRole('alert')).toHaveAttribute(
        'data-error-code',
        'video_timeout',
        { timeout: 45000 },
      )
      expect(
        await consolePage.getByTestId('console-canvas').evaluate((element) => {
          const canvas = element as HTMLCanvasElement
          return canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height)
            .data.every((value) => value === 0)
        }),
      ).toBe(true)
      await expect.poll(() => resources.closed).toBe(resources.opened)
      expect(resources.wrongPrefix).toBe(0)
      console.log(
        'Main JS heap KiB: ' + transport + '/' + before + '/' + during + '/' + (await heap()),
      )
      await cdp.detach()
      await consolePage.close()
    } finally {
      await fixture.context.dispose()
    }
  })
}
