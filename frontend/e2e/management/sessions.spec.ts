import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  base,
  createFixture,
  fillPrivate,
  loginUi,
  origin,
  password,
  resetStack,
} from './helpers/fixtures'

// 每個案例使用全新 backend／DB／KV（登入限流也一併重置）。
test.beforeEach(() => resetStack())

// 在獨立的瀏覽器 context 登入，模擬另一台裝置。
async function device(browser: Browser, username: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await loginUi(page, username)
  return page
}

// 重新載入後是否被導向登入頁（session 已被登出）：等到登入頁或已登入的導覽列其中之一出現。
async function signedOut(page: Page): Promise<boolean> {
  await page.reload()
  await page.waitForFunction(
    () =>
      document.querySelector('#login-title') !== null ||
      document.querySelector('.app-nav') !== null,
  )
  return (await page.locator('#login-title').count()) === 1
}

// 管理員在使用者頁開啟某人的登入裝置：登出其中一個只影響該裝置，全部登出後兩台都要重新登入。
test('admin signs out one and then all devices of a user', async ({ page, browser }) => {
  const fixture = await createFixture('operator')
  const first = await device(browser, fixture.user.username)
  const second = await device(browser, fixture.user.username)
  try {
    await loginUi(page, process.env.RDWEB_E2E_USERNAME!)
    await page.goto(base + '/users')
    await page
      .getByTestId('user-row')
      .filter({ hasText: fixture.user.username })
      .getByTestId('user-sessions')
      .click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog.getByTestId('session-row')).toHaveCount(2)
    await dialog
      .getByTestId('session-row')
      .first()
      .getByRole('button', { name: '登出', exact: true })
      .click()
    await dialog.getByRole('button', { name: '確認', exact: true }).click()
    await expect(dialog.getByText('已登出 1 個裝置。', { exact: true })).toBeVisible()
    await expect(dialog.getByTestId('session-row')).toHaveCount(1)
    expect([await signedOut(first), await signedOut(second)].filter(Boolean)).toHaveLength(1)
    await dialog.getByRole('button', { name: '全部登出', exact: true }).click()
    await dialog.getByRole('button', { name: '確認', exact: true }).click()
    await expect(dialog.getByText('已登出 1 個裝置。', { exact: true })).toBeVisible()
    await expect(dialog.getByText('目前沒有登入中的裝置。', { exact: true })).toBeVisible()
    expect(await signedOut(first)).toBe(true)
    expect(await signedOut(second)).toBe(true)
    // 稽核頁可篩選這個動作。
    await page.goto(base + '/audit')
    await expect(page.getByRole('option', { name: '登出裝置', exact: true })).toHaveCount(1)
  } finally {
    await first.context().close()
    await second.context().close()
    await fixture.context.dispose()
  }
})

// 本人在帳號安全頁只看到自己的裝置並標示目前這個；登出其他所有裝置後另一台需重新登入、目前這台照常；窄螢幕不水平溢出。
test('users sign out their other devices', async ({ page, browser }) => {
  const fixture = await createFixture('operator')
  const other = await device(browser, fixture.user.username)
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/security')
    const card = page.getByTestId('session-devices')
    await expect(card.getByTestId('session-row')).toHaveCount(2)
    await expect(card.getByText('目前這個', { exact: true })).toHaveCount(1)
    await card.getByRole('button', { name: '登出其他所有裝置', exact: true }).click()
    await card.getByRole('button', { name: '確認', exact: true }).click()
    await expect(card.getByText('已登出 1 個裝置。', { exact: true })).toBeVisible()
    await expect(card.getByTestId('session-row')).toHaveCount(1)
    await expect(card.getByRole('button', { name: '登出其他所有裝置', exact: true })).toBeDisabled()
    expect(await signedOut(other)).toBe(true)
    expect(await signedOut(page)).toBe(false)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await other.context().close()
    await fixture.context.dispose()
  }
})

// 閒置登出設定：範圍外不能送出，儲存需再次驗證，重新載入後保留。
test('admin changes the idle sign-out setting', async ({ page }) => {
  await loginUi(page, process.env.RDWEB_E2E_USERNAME!)
  await page.goto(base + '/users')
  const settings = page.getByTestId('session-settings')
  const idle = settings.getByLabel('閒置時間（分鐘）', { exact: true })
  await expect(idle).toHaveValue('60')
  await idle.fill('20')
  await expect(settings.getByRole('button', { name: '儲存', exact: true })).toBeDisabled()
  await idle.fill('0')
  await settings.getByRole('button', { name: '儲存', exact: true }).click()
  await fillPrivate(settings.getByLabel('目前密碼', { exact: true }), password)
  const saved = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/settings/sessions'),
  )
  await settings.getByRole('button', { name: '確認', exact: true }).click()
  expect((await saved).status()).toBe(200)
  await expect(settings.getByText('已儲存。', { exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.getByTestId('session-settings').getByLabel('閒置時間（分鐘）', { exact: true }),
  ).toHaveValue('0')
  expect(new URL(page.url()).origin + new URL(page.url()).pathname).toBe(origin + base + '/users')
})
