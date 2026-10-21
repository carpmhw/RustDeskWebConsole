import { expect, test, type Page } from '@playwright/test'
import { pageOverflows } from './helpers'
// 只在Node測試端呼叫公開座標helper，不執行其fixture／API／Docker函數或匯入瀏覽器bundle。
import { clickRemote } from '../real/input-fixtures'

const fixture = '/e2e/ui/index.html?scene=console'

// 隱藏IME不得繼承一般textarea的95px最小高度而擠壓或撐大串流viewport。
test('IME surface remains one pixel without changing ownership', async ({ page }) => {
  await page.goto(fixture)
  const box = (await page.getByTestId('console-ime').boundingBox())!
  expect(box.width).toBeLessThanOrEqual(1)
  expect(box.height).toBeLessThanOrEqual(1)
})

// 僅讀公開計數與固定座標，不擷取普通文字或真實遠端資料。
async function state(page: Page): Promise<{
  lastPoint: { x: number; y: number }
  points: number
  keys: number
  releases: number
  issues: number
  ended: boolean
  fullscreenUnavailable: boolean
}> {
  return JSON.parse((await page.getByTestId('public-input-state').textContent())!)
}

// 點擊helper必須先等原生surface穩定才取比例，不能把等待前的rect用於等待後的點擊。
test('remote click uses settled surface geometry instead of a stale scale', async ({ page }) => {
  await page.goto(fixture)
  await page.getByTestId('console-zoom').selectOption('original')
  await expect(page.getByTestId('console-canvas')).toHaveCSS('width', '320px')
  // 公開fixture刻意以原生CSS轉場重現actionability等待前後尺寸不同，不改產品動效。
  await page.addStyleTag({
    content:
      '[data-testid="console-canvas"] { transition: width 400ms linear, height 400ms linear; }',
  })
  await page.getByTestId('console-zoom').selectOption('2')
  await clickRemote(page, 80, 120)
  await expect.poll(async () => (await state(page)).lastPoint).toEqual({ x: 80, y: 120 })
  expect((await state(page)).points).toBe(1)
})

// 使用真DOM點擊公開畫面中心，座標預期由固定320×240 fixture獨立手算。
async function center(page: Page): Promise<void> {
  const points = (await state(page)).points
  const canvas = page.getByTestId('console-canvas')
  // fullscreen標記生效早於ResizeObserver；先等公開固定畫面的尺寸符合目前viewport再取中心。
  await expect
    .poll(() =>
      page.evaluate(() => {
        const surface = document.querySelector<HTMLCanvasElement>('[data-testid="console-canvas"]')!
        const viewport = document.querySelector<HTMLElement>('[data-testid="console-viewport"]')!
        const value = document.querySelector<HTMLSelectElement>(
          '[data-testid="console-zoom"]',
        )!.value
        const scale =
          value === 'fit'
            ? Math.min(viewport.clientWidth / 320, viewport.clientHeight / 240)
            : value === 'original'
              ? 1
              : Number(value)
        const rect = surface.getBoundingClientRect()
        return Math.abs(rect.width - 320 * scale) < 0.5 && Math.abs(rect.height - 240 * scale) < 0.5
      }),
    )
    .toBe(true)
  const box = (await canvas.boundingBox())!
  await canvas.click({ position: { x: box.width / 2 + 0.1, y: box.height / 2 + 0.1 } })
  await expect.poll(async () => (await state(page)).points).toBeGreaterThan(points)
  await expect.poll(async () => (await state(page)).lastPoint).toEqual({ x: 160, y: 120 })
}

// 切模式必須保留node、釋放原輸入且讓退出／結束入口可達，不能靠重掛畫布完成。
test('focus mode retains surface ownership and releases input', async ({ page }) => {
  await page.goto(fixture)
  const canvas = (await page.getByTestId('console-canvas').elementHandle())!
  const ime = (await page.getByTestId('console-ime').elementHandle())!
  await center(page)
  await page.keyboard.down('Control')
  const before = await state(page)
  const originalHeight = (await page.getByTestId('console-viewport').boundingBox())!.height
  await page.getByTestId('console-focus-mode').click()
  await expect(page.getByTestId('console-focus-mode')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('public-app-header')).not.toBeVisible()
  expect((await page.getByTestId('console-viewport').boundingBox())!.height).toBeGreaterThan(
    originalHeight,
  )
  expect(
    await canvas.evaluate(
      (node) => node === document.querySelector('[data-testid="console-canvas"]'),
    ),
  ).toBe(true)
  expect(
    await ime.evaluate((node) => node === document.querySelector('[data-testid="console-ime"]')),
  ).toBe(true)
  await expect.poll(async () => (await state(page)).releases).toBeGreaterThan(before.releases)
  await expect(page.getByTestId('console-ime')).not.toBeFocused()
  const keys = (await state(page)).keys
  // 晚到的公開composition必須被真controller忽略，不使工具列重獲遠端焦點。
  await ime.evaluate((node) =>
    node.dispatchEvent(new CompositionEvent('compositionend', { data: '公開測試', bubbles: true })),
  )
  await page.keyboard.up('Control')
  expect((await state(page)).keys).toBe(keys)
  await page.getByTestId('console-focus-mode').click()
  await expect(page.getByTestId('public-app-header')).toBeVisible()
  await expect(page.getByTestId('console-end')).toBeVisible()
  await page.getByTestId('console-end').click()
  expect((await state(page)).ended).toBe(true)
})

for (const width of [375, 768, 1024, 1440]) {
  // 真InputController座標必須跟目前client rect，不可在縮放／模式切換後沿用舊offset。
  test(`coordinates remain valid after layout changes: ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(fixture)
    for (const focused of [false, true]) {
      if (focused) await page.getByTestId('console-focus-mode').click()
      await expect(page.getByTestId('console-focus-mode')).toHaveAttribute(
        'aria-pressed',
        String(focused),
      )
      for (const zoom of ['fit', 'original', '0.5', '1', '1.5', '2']) {
        await page.getByTestId('console-zoom').selectOption(zoom)
        await center(page)
        expect(await pageOverflows(page)).toBe(false)
      }
    }
    await expect(page.getByTestId('console-canvas')).toHaveCSS('filter', 'none')
    expect((await state(page)).issues).toBe(0)
  })
}

// 原生fullscreen成功路徑及dialog焦點釋放均不允許更換surface。
test('fullscreen and dialog preserve input scope', async ({ page }) => {
  await page.goto(fixture)
  await center(page)
  const before = (await state(page)).releases
  await page.getByTestId('public-dialog-open').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(async () => (await state(page)).releases).toBeGreaterThan(before)
  await expect(page.getByTestId('console-ime')).not.toBeFocused()
  await page.keyboard.press('Escape')
  await page.getByTestId('console-fullscreen').click()
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid')))
    .toBe('console-viewport')
  await center(page)
  await page.evaluate(() => document.exitFullscreen())
  await center(page)
  expect((await state(page)).fullscreenUnavailable).toBe(false)
})

// 拒絕只在公開fixture注入，不放寬正式API或把失敗偽裝成已全螢幕。
test('fullscreen rejection stays a local recoverable state', async ({ page }) => {
  await page.addInitScript(() => {
    // 只拒絕此頁的瀏覽器入口，不呼叫OS視窗或遠端session。
    HTMLElement.prototype.requestFullscreen = () =>
      Promise.reject(new Error('Public fixture rejection'))
  })
  await page.goto(fixture)
  await page.getByTestId('console-fullscreen').click()
  await expect.poll(async () => (await state(page)).fullscreenUnavailable).toBe(true)
  await center(page)
  expect((await state(page)).ended).toBe(false)
})

// 公開幾何fixture不可偷偷啟Worker／網路連線或觸碰系統clipboard。
test('console fixture has no network or system clipboard operations', async ({ page }) => {
  let attempts = 0
  // 拒絕所有WS，避免未來誤匯入Host時真的建立連線。
  await page.routeWebSocket('**', (socket) => {
    attempts++
    socket.close()
  })
  // 只提供同來源靜態fixture，任何API或外站均拒絕且只記次數。
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:18083' || url.pathname.includes('/api/')) {
      attempts++
      await route.abort()
    } else await route.continue()
  })
  // 在應用載入前阻斷clipboard，計數不包含實際內容。
  await page.addInitScript(() => {
    const state = window as Window & { clipboardCalls?: number }
    state.clipboardCalls = 0
    // 每個入口只記次數並拒絕，不讀寫宿主資料。
    const denied = () => {
      state.clipboardCalls = (state.clipboardCalls ?? 0) + 1
      return Promise.reject(new Error('Clipboard disabled'))
    }
    Object.defineProperty(navigator, 'clipboard', {
      value: { read: denied, write: denied, readText: denied, writeText: denied },
    })
  })
  await page.goto(fixture)
  await center(page)
  await page.getByTestId('console-focus-mode').click()
  expect(attempts).toBe(0)
  expect(
    await page.evaluate(() => (window as Window & { clipboardCalls?: number }).clipboardCalls),
  ).toBe(0)
})
