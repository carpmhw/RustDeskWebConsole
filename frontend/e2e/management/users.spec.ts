import { randomUUID } from 'node:crypto'
import { expect, request, test, type Page } from '@playwright/test'
import {
  api,
  base,
  createFixture,
  createUser,
  fillPrivate,
  loginUi,
  origin,
  password,
  resetStack,
} from './helpers/fixtures'

// 每個案例使用全新 backend／DB／KV。
test.beforeEach(() => resetStack())

// 以帳密表單登入並等待導向，用於以非測試固定密碼登入的情境。
async function loginWith(page: Page, username: string, secret: string): Promise<void> {
  await page.goto(base + '/login')
  await page.getByLabel('帳號', { exact: true }).fill(username)
  await fillPrivate(page.getByLabel('密碼', { exact: true }), secret)
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.waitForURL((url) => url.pathname !== base + '/login')
}

// 直接以 API 嘗試登入並回傳狀態碼，不使用會在失敗時擲錯的 fixture helper。
async function loginStatus(username: string, secret: string): Promise<number> {
  const context = await request.newContext({ ignoreHTTPSErrors: origin.startsWith('https:') })
  try {
    const response = await context.fetch(origin + base + '/api/v1/auth/login', {
      method: 'POST',
      data: { username, password: secret },
      headers: { Origin: origin },
    })
    return response.status()
  } finally {
    await context.dispose()
  }
}

// 在使用者列表中找到指定帳號的列。
function row(page: Page, username: string) {
  return page.getByTestId('user-row').filter({ hasText: username })
}

// 管理員以自動產生的初始密碼建立帳號；密碼只顯示一次，同事以其登入後須設定新密碼。
test('admin creates a user with a generated password shown once', async ({ page, browser }) => {
  const fixture = await createFixture('admin')
  const colleague = await browser.newContext({ baseURL: origin, acceptDownloads: false })
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/users')
    await expect(page.getByRole('heading', { name: '使用者管理', exact: true })).toBeVisible()
    const username = 'new-' + randomUUID().replaceAll('-', '').slice(0, 12)
    await page.getByRole('button', { name: '新增使用者', exact: true }).click()
    await page.getByLabel('帳號', { exact: true }).fill(username)
    await page.getByLabel('角色', { exact: true }).selectOption('operator')
    await page.getByRole('button', { name: '自動產生', exact: true }).click()
    // 欄位只顯示遮罩，提示管理員建立後才會看到可複製的密碼；手動改動後不再顯示密碼，提示也隨之消失。
    const pending = page.getByText('已產生密碼，完成後會在頁面上方顯示一次，可複製。', {
      exact: true,
    })
    await expect(pending).toBeVisible()
    await page.getByLabel('初始密碼', { exact: true }).press('End')
    await page.getByLabel('初始密碼', { exact: true }).press('x')
    await expect(pending).toHaveCount(0)
    await page.getByRole('button', { name: '自動產生', exact: true }).click()
    await expect(pending).toBeVisible()
    await page.getByRole('button', { name: '建立', exact: true }).click()
    const shown = page.getByTestId('generated-password')
    await expect(shown).toBeVisible()
    await expect(shown.getByRole('button', { name: '複製', exact: true })).toBeVisible()
    const initial = (await shown.locator('code').textContent()) ?? ''
    expect(initial.length).toBe(20)
    await expect(row(page, username)).toContainText('待改密碼')
    await shown.getByRole('button', { name: '完成', exact: true }).click()
    await expect(page.getByTestId('generated-password')).toHaveCount(0)
    await page.goto(base + '/')
    await page.goto(base + '/users')
    await expect(page.getByTestId('generated-password')).toHaveCount(0)
    const colleaguePage = await colleague.newPage()
    await loginWith(colleaguePage, username, initial)
    await expect(colleaguePage).toHaveURL(origin + base + '/password')
  } finally {
    await colleague.close()
    await fixture.context.dispose()
  }
})

// 重設密碼、停用、改角色與 Email；管理員自己那一列沒有重設雙重驗證。
test('admin resets password, disables and changes role', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    const username = 'mate-' + randomUUID().replaceAll('-', '').slice(0, 12)
    const rowUser = await createUser(fixture.context, fixture.admin.access_token, username, 'admin')
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/users')
    await expect(
      row(page, fixture.user.username).getByRole('button', { name: '重設雙重驗證', exact: true }),
    ).toHaveCount(0)
    // 自己的密碼改在帳號安全頁變更，避免重設後立即登出而看不到自動產生的密碼。
    await expect(
      row(page, fixture.user.username).getByRole('button', { name: '重設密碼', exact: true }),
    ).toHaveCount(0)
    await expect(
      row(page, fixture.user.username).getByRole('link', { name: '變更密碼', exact: true }),
    ).toHaveAttribute('href', base + '/security')
    const reset = password + '-reset'
    await row(page, username).getByRole('button', { name: '重設密碼', exact: true }).click()
    await fillPrivate(page.getByLabel('新密碼', { exact: true }), reset)
    await fillPrivate(
      page.getByTestId('reauth-proof').getByLabel('目前密碼', { exact: true }),
      password,
    )
    // 帳號原本已是待改密碼，須等待重設 API 成功，不能以未變的列狀態判斷完成。
    const resetResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/api/v1/users/' + rowUser.id + '/reset-password'),
    )
    await page.getByRole('button', { name: '確認重設', exact: true }).click()
    expect((await resetResponse).status()).toBe(204)
    await expect(row(page, username)).toContainText('待改密碼')
    expect(await loginStatus(username, reset)).toBe(200)
    await row(page, username).getByRole('button', { name: '編輯', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill('mate@example.com')
    await page.getByLabel('角色', { exact: true }).selectOption('viewer')
    await page.getByLabel('啟用', { exact: true }).uncheck()
    await page.getByRole('button', { name: '儲存', exact: true }).click()
    await expect(row(page, username)).toContainText('mate@example.com')
    await expect(row(page, username)).toContainText('檢視者')
    await expect(row(page, username)).toContainText('已停用')
    expect(await loginStatus(username, reset)).toBe(401)
  } finally {
    await fixture.context.dispose()
  }
})

// 系統只剩一位有效管理員時不能停用自己，狀態保持不變。
test('last admin cannot be disabled', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/users')
    const bootstrap = process.env.RDWEB_E2E_USERNAME!
    await row(page, bootstrap).getByRole('button', { name: '編輯', exact: true }).click()
    await page.getByLabel('啟用', { exact: true }).uncheck()
    await page.getByRole('button', { name: '儲存', exact: true }).click()
    await expect(row(page, bootstrap)).toContainText('已停用')
    await row(page, fixture.user.username)
      .getByRole('button', { name: '編輯', exact: true })
      .click()
    await page.getByLabel('啟用', { exact: true }).uncheck()
    await page.getByRole('button', { name: '儲存', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('最後一位')
    await page.reload()
    await expect(row(page, fixture.user.username)).toContainText('啟用中')
  } finally {
    await fixture.context.dispose()
  }
})

// 非管理員看不到使用者管理，直接進入網址會被導回概覽，API 也拒絕。
test('non-admin cannot reach user management', async ({ page }) => {
  const fixture = await createFixture('operator')
  try {
    await loginUi(page, fixture.user.username)
    await expect(
      page.locator('.app-nav').getByRole('link', { name: '使用者', exact: true }),
    ).toHaveCount(0)
    await page.goto(base + '/users')
    await expect(page).toHaveURL(origin + base + '/')
    const grant = await api<{ access_token: string }>(fixture.context, 'auth/login', 'POST', {
      username: fixture.user.username,
      password,
    })
    const denied = await fixture.context.fetch(origin + base + '/api/v1/users', {
      headers: { Origin: origin, Authorization: 'Bearer ' + grant.access_token },
    })
    expect(denied.status()).toBe(403)
  } finally {
    await fixture.context.dispose()
  }
})

// 政策改為要求所有人：取消再次驗證時不變；確認後未綁定的同事登入被導到帳號安全頁。
test('mfa policy all forces enrollment and cancel keeps policy', async ({ page, browser }) => {
  const fixture = await createFixture('admin')
  const colleague = await browser.newContext({ baseURL: origin, acceptDownloads: false })
  try {
    const username = 'policy-' + randomUUID().replaceAll('-', '').slice(0, 12)
    await createUser(fixture.context, fixture.admin.access_token, username, 'operator')
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/users')
    const policy = page.getByTestId('mfa-policy')
    await expect(policy.getByLabel('雙重驗證政策', { exact: true })).toHaveValue('off')
    await policy.getByLabel('雙重驗證政策', { exact: true }).selectOption('all')
    await policy.getByRole('button', { name: '儲存政策', exact: true }).click()
    await policy.getByRole('button', { name: '取消', exact: true }).click()
    await page.reload()
    await expect(
      page.getByTestId('mfa-policy').getByLabel('雙重驗證政策', { exact: true }),
    ).toHaveValue('off')
    await page
      .getByTestId('mfa-policy')
      .getByLabel('雙重驗證政策', { exact: true })
      .selectOption('all')
    await page
      .getByTestId('mfa-policy')
      .getByRole('button', { name: '儲存政策', exact: true })
      .click()
    // 再驗證欄位與其他單欄表單一樣限寬 560px。
    expect(
      (await page.getByTestId('mfa-policy').getByLabel('目前密碼', { exact: true }).boundingBox())!
        .width,
    ).toBeLessThanOrEqual(560)
    await fillPrivate(
      page.getByTestId('mfa-policy').getByLabel('目前密碼', { exact: true }),
      password,
    )
    const saved = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/settings/security'),
    )
    await page.getByTestId('mfa-policy').getByRole('button', { name: '確認', exact: true }).click()
    expect((await saved).status()).toBe(200)
    const colleaguePage = await colleague.newPage()
    await loginUi(colleaguePage, username)
    await expect(colleaguePage).toHaveURL(origin + base + '/security')
  } finally {
    await colleague.close()
    await fixture.context.dispose()
  }
})
