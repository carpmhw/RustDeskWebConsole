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

// 管理員從導覽進入「連線」頁：沒有連線時顯示空狀態；連線管控設定需再驗證才儲存，0 表示關閉。
test('admin views active connections and changes connection limits', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    await loginUi(page, fixture.user.username)
    await page.locator('.app-nav').getByRole('link', { name: '連線', exact: true }).click()
    await expect(page).toHaveURL(origin + base + '/connections')
    await expect(page.getByRole('heading', { name: '作用中連線', exact: true })).toBeVisible()
    await expect(page.getByText('目前沒有作用中的連線。', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '重新整理', exact: true }).click()
    await expect(page.getByText('目前沒有作用中的連線。', { exact: true })).toBeVisible()
    const settings = page.getByTestId('connection-settings')
    const idle = settings.getByLabel('閒置逾時（分鐘）', { exact: true })
    const hours = settings.getByLabel('單次連線上限（小時）', { exact: true })
    await expect(idle).toHaveValue('30')
    await expect(hours).toHaveValue('8')
    expect((await idle.boundingBox())!.width).toBeLessThanOrEqual(560)
    // 範圍外不可送出。
    await idle.fill('3')
    await expect(settings.getByRole('button', { name: '儲存', exact: true })).toBeDisabled()
    await idle.fill('0')
    await hours.fill('2')
    await settings.getByRole('button', { name: '儲存', exact: true }).click()
    await fillPrivate(settings.getByLabel('目前密碼', { exact: true }), password)
    const saved = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/settings/connections'),
    )
    await settings.getByRole('button', { name: '確認', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await expect(settings.getByText('已儲存。', { exact: true })).toBeVisible()
    await page.reload()
    await expect(
      page.getByTestId('connection-settings').getByLabel('閒置逾時（分鐘）', { exact: true }),
    ).toHaveValue('0')
    await expect(
      page.getByTestId('connection-settings').getByLabel('單次連線上限（小時）', { exact: true }),
    ).toHaveValue('2')
    // 窄螢幕下頁面不水平溢出。
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await fixture.context.dispose()
  }
})

// 非管理員看不到「連線」導覽，直接開網址也被導回概覽。
test('non-admins cannot reach the connections page', async ({ page }) => {
  const fixture = await createFixture('operator')
  try {
    await loginUi(page, fixture.user.username)
    await expect(
      page.locator('.app-nav').getByRole('link', { name: '目標主機', exact: true }),
    ).toBeVisible()
    await expect(
      page.locator('.app-nav').getByRole('link', { name: '連線', exact: true }),
    ).toHaveCount(0)
    await page.goto(base + '/connections')
    await expect(page).toHaveURL(origin + base + '/')
  } finally {
    await fixture.context.dispose()
  }
})
