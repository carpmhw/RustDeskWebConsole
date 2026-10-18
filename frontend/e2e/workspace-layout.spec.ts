import { expect, test, type Page } from '@playwright/test'
import { base, createFixture, loginUi, resetStack } from './helpers/fixtures'

// 每輪只重建本輪核准的管理fixture，不改正式quota或建立遠端連線。
test.beforeEach(() => resetStack())

// 僅回傳幾何／公開主題狀態，不擷取認證頁DOM或敏感文字。
async function checkLayout(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false,
  )
}

// 八頁沿真正auth／router，在兩語系／深淺／四寬度下檢查布局；主控台僅非法UUID拒絕狀態。
test('all non-streaming pages adapt to both locales themes and four widths', async ({ page }) => {
  const fixture = await createFixture('admin')
  let attempts = 0
  let workers = 0
  let layouts = 0
  // 阻斷所有WS，錯誤匯入連線流程只能讓本案例失敗，不能真的操作受控端。
  await page.routeWebSocket('**', (socket) => {
    attempts++
    socket.close()
  })
  // 只放行本管理矩陣需要的auth、health、server與target列表metadata。
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (
      path.includes('/api/v1/auth/') ||
      path.endsWith('/api/v1/health') ||
      path.endsWith('/api/v1/targets') ||
      path.endsWith('/api/v1/servers') ||
      path.endsWith('/api/v1/servers/available')
    )
      await route.continue()
    else {
      attempts++
      await route.abort()
    }
  })
  // 不保留Worker內容或message，只驗零attempt場景沒有意外啟動它。
  page.on('worker', () => {
    workers++
  })
  try {
    await page.goto(base + '/login')
    const appearance = page.getByTestId('appearance-menu')
    await appearance.locator('summary').click()
    await appearance.locator('[data-theme-choice="system"]').click()
    for (const locale of ['zh-TW', 'en']) {
      await appearance.getByLabel(/^(語言|Language)$/).selectOption(locale)
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme })
        for (const width of [375, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          await checkLayout(page, theme)
          layouts++
        }
      }
    }
    await appearance.getByLabel('Language').selectOption('zh-TW')
    await loginUi(page, fixture.user.username)
    for (const locale of ['zh-TW', 'en']) {
      await page.goto(base + '/preferences')
      await page.getByLabel(/^(語言|Language)$/).selectOption(locale)
      await page.locator('[data-theme-choice="system"]').click()
      for (const path of [
        '/',
        '/targets',
        '/servers',
        '/security',
        '/preferences',
        '/missing-public-route',
        '/console/not-a-uuid',
      ]) {
        await page.goto(base + path)
        for (const theme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: theme })
          for (const width of [375, 768, 1024, 1440]) {
            await page.setViewportSize({ width, height: 900 })
            await checkLayout(page, theme)
            layouts++
            if (path.startsWith('/console/')) {
              await expect(page.locator('[data-error-code="connection_failed"]')).toBeVisible()
              await page.getByTestId('console-focus-mode').click()
              await checkLayout(page, theme)
              layouts++
              await expect(page.locator('.app-header')).not.toBeVisible()
              await page.getByTestId('console-focus-mode').click()
              await expect(page.locator('.app-header')).toBeVisible()
            }
          }
        }
      }
    }
    expect(attempts).toBe(0)
    expect(workers).toBe(0)
    // 唯一矩陣輸出為實際計數，不包含帳號、票證、DOM或遠端內容。
    console.log(
      'workspace_layout_matrix_observed,' +
        JSON.stringify({ layouts, remoteAttempts: attempts, workers }),
    )
  } finally {
    await fixture.context.dispose()
  }
})
