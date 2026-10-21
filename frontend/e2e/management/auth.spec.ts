import { expect, test } from '@playwright/test'
import {
  api,
  base,
  createFixture,
  enrollUi,
  fillPrivate,
  loginUi,
  logoutUi,
  origin,
  password,
  resetStack,
} from './helpers/fixtures'
import { totpCode } from './helpers/totp'

// Auth案例各有全新backend／DB／KV，避免安全限流跨案例造成干擾。
test.beforeEach(() => resetStack())

// 帳密、reload、跨分頁refresh与logout均由真正API完成。
test('sign in, restore in two tabs and revoke on logout', async ({ page, context }) => {
  const fixture = await createFixture()
  try {
    await loginUi(page, fixture.user.username)
    await expect(page).toHaveURL(origin + base + '/')
    await page.goto(base + '/security')
    // Navigation load不代表refresh已完成；先等待真正的授權頁面。
    await expect(page.getByRole('heading', { name: '帳號安全', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: '帳號安全', exact: true })).toBeVisible()
    const second = await context.newPage()
    await second.goto(base + '/')
    await expect(second.getByRole('heading', { name: '概覽', exact: true })).toBeVisible()
    await Promise.all([page.reload(), second.reload()])
    await expect(page.getByRole('heading', { name: '帳號安全', exact: true })).toBeVisible()
    await expect(second.getByRole('heading', { name: '概覽', exact: true })).toBeVisible()
    const cookies = await context.cookies()
    expect(
      cookies.some(
        (cookie) =>
          cookie.name === 'rdweb_refresh' &&
          cookie.path === base + '/api/v1/auth' &&
          cookie.httpOnly &&
          cookie.sameSite === 'Strict',
      ),
    ).toBe(true)
    // 本機匿名先於遠端撤銷，必須等待真正的logout response才檢查cookie。
    const revoked = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/logout'),
    )
    await page.getByTestId('logout').click()
    const logoutResponse = await revoked
    expect(logoutResponse.status()).toBe(204)
    await logoutResponse.finished()
    await expect(page.getByRole('heading', { name: '登入主控台', exact: true })).toBeVisible()
    await expect(second.getByRole('heading', { name: '登入主控台', exact: true })).toBeVisible()
    expect((await context.cookies()).some((cookie) => cookie.name === 'rdweb_refresh')).toBe(false)
  } finally {
    await fixture.context.dispose()
  }
})

// 綁定、QR、真正TOTP登入、備援碼登入與碼重用拒絕。
test('TOTP and recovery code lifecycle uses real authentication', async ({ page }) => {
  const fixture = await createFixture()
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/security')
    const result = await enrollUi(page)
    // 測列印操作只捕捉公開布林標記，不產生含備援碼的PDF或快照。
    await page.evaluate(() => {
      window.print = () => {
        document.documentElement.dataset.printProbe =
          document.body.dataset.printing === 'recovery' ? 'ok' : 'failed'
      }
    })
    await page.getByRole('button', { name: '列印', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-print-probe', 'ok')
    // 接受下載被測試設定禁用，只確認產生下載事件與安全檔名，不保存內容。
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: '下載', exact: true }).click()
    expect((await downloaded).suggestedFilename()).toBe('rustdesk-recovery-codes.txt')
    await page.getByTestId('codes-saved').click()
    expect(await page.locator('[data-testid=manual-secret]').count()).toBe(0)
    await page.reload()
    expect(await page.locator('[data-testid=recovery-codes]').count()).toBe(0)
    await logoutUi(page)
    await loginUi(page, fixture.user.username)
    await expect(page.getByRole('heading', { name: '完成第二步驗證', exact: true })).toBeVisible()
    await expect(page.getByRole('form', { name: '完成第二步驗證', exact: true })).toBeVisible()
    await expect(page.locator('.app-nav')).toHaveCount(0)
    await expect(page.getByTestId('appearance-menu')).toBeVisible()
    await fillPrivate(
      page.getByLabel('驗證碼', { exact: true }),
      totpCode(result.secret, Date.now(), 1),
    )
    await page.getByRole('button', { name: '驗證並登入', exact: true }).click()
    await expect(page).toHaveURL(origin + base + '/')
    await logoutUi(page)
    await loginUi(page, fixture.user.username)
    await page.getByRole('button', { name: '備援碼', exact: true }).click()
    await fillPrivate(page.getByLabel('備援碼', { exact: true }), result.codes[0]!)
    await page.getByRole('button', { name: '驗證並登入', exact: true }).click()
    await expect(page).toHaveURL(origin + base + '/')
    await logoutUi(page)
    await loginUi(page, fixture.user.username)
    await page.getByRole('button', { name: '備援碼', exact: true }).click()
    await fillPrivate(page.getByLabel('備援碼', { exact: true }), result.codes[0]!)
    await page.getByRole('button', { name: '驗證並登入', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('無效')
    expect(
      await page
        .locator('#mfa-code')
        .evaluate((input) => input instanceof HTMLInputElement && input.value.length === 0),
    ).toBe(true)
    // 同一失敗後的新challenge仍可用未使用備援碼，不多做帳密登入。
    await fillPrivate(page.getByLabel('備援碼', { exact: true }), result.codes[1]!)
    await page.getByRole('button', { name: '驗證並登入', exact: true }).click()
    await expect(page).toHaveURL(origin + base + '/')
    await page.goto(base + '/security')
    await page.getByRole('button', { name: '重新產生備援碼', exact: true }).click()
    await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
    await page.getByRole('button', { name: '確認操作', exact: true }).click()
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid=recovery-codes] li').length === 10,
      )
    } catch {
      throw new Error('Regenerated recovery codes were not displayed')
    }
    const regenerated = await page.locator('[data-testid=recovery-codes] li').allTextContents()
    expect(regenerated.some((value) => result.codes.includes(value))).toBe(false)
    await page.getByTestId('codes-saved').click()
    await page.getByRole('button', { name: '停用雙重驗證', exact: true }).click()
    await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
    const disabled = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/totp/disable'),
    )
    await page.getByRole('button', { name: '確認操作', exact: true }).click()
    expect((await disabled).status()).toBe(200)
    await expect(page.getByRole('heading', { name: '登入主控台', exact: true })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '已停用雙重驗證' })).toBeVisible()
  } finally {
    await fixture.context.dispose()
  }
})

// all政策透過正式admin API設定，operator前端無法繞過restricted guard。
test('required MFA redirects and unlocks only after confirmation', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    const adminLogin = await api<{ access_token: string }>(fixture.context, 'auth/login', 'POST', {
      username: fixture.user.username,
      password,
    })
    const pending = await api<{ secret: string }>(
      fixture.context,
      'auth/totp/enroll',
      'POST',
      { password },
      adminLogin.access_token,
    )
    const verified = await api<{ access_token: string }>(
      fixture.context,
      'auth/totp/confirm',
      'POST',
      { code: totpCode(pending.secret) },
      adminLogin.access_token,
    )
    const target = await api<{ username: string }>(
      fixture.context,
      'users',
      'POST',
      { username: fixture.user.username + '-op', password, role: 'operator' },
      verified.access_token,
    )
    await api(
      fixture.context,
      'settings/security',
      'PUT',
      { require_mfa: 'all', password },
      verified.access_token,
    )
    await loginUi(page, target.username)
    await expect(page).toHaveURL(origin + base + '/security')
    await expect(page.getByTestId('mfa-required')).toBeVisible()
    await expect(page.locator('.app-nav a')).toHaveCount(1)
    await expect(page.getByTestId('appearance-menu')).toBeVisible()
    await page.goto(base + '/preferences')
    await expect(page).toHaveURL(origin + base + '/security')
    await page.goto(base + '/missing-public-route')
    await expect(page).toHaveURL(origin + base + '/security')
    await enrollUi(page)
    await page.getByTestId('codes-saved').click()
    await page.goto(base + '/')
    await expect(page.getByRole('heading', { name: '概覽', exact: true })).toBeVisible()
  } finally {
    await fixture.context.dispose()
  }
})

// 非敏感偏好持久化，真實資源與API都遵守BASE，沒有CSP／執行錯誤。
test('themes, locales and time zones follow base without storing credentials', async ({ page }) => {
  const fixture = await createFixture()
  const wrong: string[] = []
  const errors: string[] = []
  // 只記pathname，不收集可能含祕密的URL／header／body。
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (base && url.origin === origin && !url.pathname.startsWith(base + '/'))
      wrong.push(url.pathname)
  })
  // 錯誤判斷用布林，不把任意pageerror文字寫進report。
  page.on('pageerror', () => errors.push('runtime'))
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/preferences')
    await expect(page.getByRole('heading', { name: '顯示偏好', exact: true })).toBeVisible()
    await page.locator('[data-theme-choice=dark]').click()
    await page.reload()
    await expect(page.getByRole('heading', { name: '顯示偏好', exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.locator('[data-theme-choice=system]').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByLabel('頁面時區', { exact: true }).selectOption('UTC')
    await page.getByLabel('語言', { exact: true }).selectOption('en')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Preferences', exact: true })).toBeVisible()
    await expect(page.getByLabel('Display time zone', { exact: true })).toHaveValue('UTC')
    const keys = await page.evaluate(() => Object.keys(localStorage))
    expect(
      keys.every((key) =>
        ['rdweb.colorMode', 'rdweb.locale', 'rdweb.displayTimeZone'].includes(key),
      ),
    ).toBe(true)
    expect(await page.evaluate(() => Object.keys(sessionStorage).length === 0)).toBe(true)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(wrong.length).toBe(0)
    expect(errors.length).toBe(0)
  } finally {
    await fixture.context.dispose()
  }
})
