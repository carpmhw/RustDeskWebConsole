import { expect, test } from '@playwright/test'
import {
  base,
  createFixture,
  fillPrivate,
  loginUi,
  origin,
  password,
  resetStack,
} from './helpers/fixtures'

// 每個案例使用全新 backend／DB／KV。
test.beforeEach(() => resetStack())

// 管理員從導覽進入稽核頁，看到自己的登入紀錄、可篩選、匯出含兩種時間欄的 CSV，並經再驗證修改保留天數。
test('admin views, filters and exports audit and changes retention', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    await loginUi(page, fixture.user.username)
    // 首次載入完成前不得顯示「沒有紀錄」，避免誤導；延遲回應以觀察載入中的畫面。
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/v1/audit?*', async (route) => {
      await held
      await route.continue()
    })
    await page.locator('.app-nav').getByRole('link', { name: '稽核', exact: true }).click()
    await expect(page.getByRole('heading', { name: '稽核紀錄', exact: true })).toBeVisible()
    await expect(page.getByText('這段期間沒有符合條件的紀錄。', { exact: true })).toHaveCount(0)
    // 放行後之後的查詢不再延遲（held 已完成）。
    release()
    await expect(page).toHaveURL(origin + base + '/audit')
    await expect(page.getByRole('heading', { name: '稽核紀錄', exact: true })).toBeVisible()
    const rows = page.locator('tbody tr')
    const ownLogin = rows.filter({ hasText: fixture.user.username }).filter({ hasText: '登入' })
    // 稽核由背景佇列寫入：以重新查詢等待自己的登入紀錄出現，不用固定等待。
    await expect(async () => {
      await page.getByRole('button', { name: '查詢', exact: true }).click()
      await expect(ownLogin.first()).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15000 })
    await page.getByLabel('動作', { exact: true }).selectOption('ConnectionEnded')
    await page.getByRole('button', { name: '查詢', exact: true }).click()
    await expect(page.getByText('這段期間沒有符合條件的紀錄。', { exact: true })).toBeVisible()
    await page.getByLabel('動作', { exact: true }).selectOption('Login')
    await page.getByRole('button', { name: '查詢', exact: true }).click()
    await expect(ownLogin.first()).toBeVisible()
    await expect(page.getByText(/^第 1 頁 · 共 \d+ 筆$/)).toBeVisible()
    await expect(page.getByRole('button', { name: '下一頁', exact: true })).toBeDisabled()
    // CSV 內容取自回應本身；下載只確認固定檔名。
    const exported = page.waitForResponse((response) =>
      response.url().includes('/api/v1/audit/export'),
    )
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '匯出 CSV', exact: true }).click()
    const csv = await (await exported).text()
    expect((await download).suggestedFilename()).toBe('audit.csv')
    expect(csv.split('\r\n')[0]).toContain('"time_utc","time_local(Asia/Taipei)"')
    expect(csv).toContain(fixture.user.username)
    // 保留天數：預設 365；延長不出現刪除警告，需再驗證才儲存；縮短時提示不可復原。
    const retention = page.getByTestId('audit-retention')
    const days = retention.getByLabel('保留天數', { exact: true })
    await expect(days).toHaveValue('365')
    // 與其他單欄表單一樣限寬 560px。
    expect((await days.boundingBox())!.width).toBeLessThanOrEqual(560)
    await days.fill('400')
    await retention.getByRole('button', { name: '儲存', exact: true }).click()
    await expect(retention.getByText(/^縮短為/)).toHaveCount(0)
    expect(
      (await retention.getByLabel('目前密碼', { exact: true }).boundingBox())!.width,
    ).toBeLessThanOrEqual(560)
    await fillPrivate(retention.getByLabel('目前密碼', { exact: true }), password)
    const saved = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/settings/audit'),
    )
    await retention.getByRole('button', { name: '確認', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await expect(retention.getByText('已儲存。', { exact: true })).toBeVisible()
    await page.reload()
    await expect(
      page.getByTestId('audit-retention').getByLabel('保留天數', { exact: true }),
    ).toHaveValue('400')
    await page.getByTestId('audit-retention').getByLabel('保留天數', { exact: true }).fill('200')
    await page
      .getByTestId('audit-retention')
      .getByRole('button', { name: '儲存', exact: true })
      .click()
    await expect(
      page
        .getByTestId('audit-retention')
        .getByText('縮短為 200 天後，下一次自動清除會刪除更舊的紀錄，且無法復原。', {
          exact: true,
        }),
    ).toBeVisible()
    await page
      .getByTestId('audit-retention')
      .getByRole('button', { name: '取消', exact: true })
      .click()
    await expect(
      page.getByTestId('audit-retention').getByLabel('保留天數', { exact: true }),
    ).toHaveValue('400')
    // 窄螢幕下表格在自己的容器捲動，頁面不水平溢出。
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    // 窄螢幕的動作欄不逐字折行：單一儲存格維持一行高。
    const action = page.locator('tbody tr').first().locator('td').nth(2)
    const lineHeight = parseFloat(
      await action.evaluate((node) => getComputedStyle(node).lineHeight),
    )
    expect(await action.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(
      lineHeight * 2 + 2 * 16,
    )
  } finally {
    await fixture.context.dispose()
  }
})

// 非管理員看不到稽核導覽，直接開網址也被導回概覽。
test('non-admins cannot reach the audit page', async ({ page }) => {
  const fixture = await createFixture('operator')
  try {
    await loginUi(page, fixture.user.username)
    await expect(
      page.locator('.app-nav').getByRole('link', { name: '目標主機', exact: true }),
    ).toBeVisible()
    await expect(
      page.locator('.app-nav').getByRole('link', { name: '稽核', exact: true }),
    ).toHaveCount(0)
    await page.goto(base + '/audit')
    await expect(page).toHaveURL(origin + base + '/')
  } finally {
    await fixture.context.dispose()
  }
})
