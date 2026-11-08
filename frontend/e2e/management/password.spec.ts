import { randomUUID } from 'node:crypto'
import { expect, request, test } from '@playwright/test'
import {
  api,
  base,
  createFixture,
  fillPrivate,
  loginUi,
  origin,
  password,
  resetStack,
} from './helpers/fixtures'

// 每個案例使用全新 backend／DB／KV，避免限流與工作階段互相干擾。
test.beforeEach(() => resetStack())

const next = password + '-next'

// 管理員建立的帳號登入後只能設定新密碼；設定後才能使用其他頁面，舊密碼失效。
test('created user must set a new password before anything else', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    const username = 'fresh-' + randomUUID().replaceAll('-', '')
    await api(
      fixture.context,
      'users',
      'POST',
      { username, password, role: 'operator' },
      fixture.admin.access_token,
    )
    await loginUi(page, username)
    await expect(page).toHaveURL(origin + base + '/password')
    await expect(page.getByRole('heading', { name: '設定新密碼', exact: true })).toBeVisible()
    await expect(page.locator('.app-nav a')).toHaveCount(0)
    await page.goto(base + '/targets')
    await expect(page).toHaveURL(origin + base + '/password')
    await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
    await fillPrivate(page.getByLabel('新密碼', { exact: true }), next)
    await fillPrivate(page.getByLabel('再輸入一次新密碼', { exact: true }), next)
    await page.getByRole('button', { name: '設定新密碼', exact: true }).click()
    await expect(page).toHaveURL(origin + base + '/')
    await expect(page.getByRole('heading', { name: '概覽', exact: true })).toBeVisible()
    const probe = await request.newContext({ ignoreHTTPSErrors: origin.startsWith('https:') })
    try {
      const old = await probe.fetch(origin + base + '/api/v1/auth/login', {
        method: 'POST',
        data: { username, password },
        headers: { Origin: origin },
      })
      expect(old.status()).toBe(401)
    } finally {
      await probe.dispose()
    }
  } finally {
    await fixture.context.dispose()
  }
})

// 兩次新密碼不一致時不送出，仍停在設定新密碼頁。
test('mismatched new passwords are not submitted', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    const username = 'fresh-' + randomUUID().replaceAll('-', '')
    await api(
      fixture.context,
      'users',
      'POST',
      { username, password, role: 'viewer' },
      fixture.admin.access_token,
    )
    await loginUi(page, username)
    await expect(page).toHaveURL(origin + base + '/password')
    let sent = 0
    page.on('request', (value) => {
      if (value.url().endsWith('/api/v1/auth/password')) sent++
    })
    await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
    await fillPrivate(page.getByLabel('新密碼', { exact: true }), next)
    await fillPrivate(page.getByLabel('再輸入一次新密碼', { exact: true }), next + 'x')
    await page.getByRole('button', { name: '設定新密碼', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('兩次輸入的新密碼不一致')
    expect(sent).toBe(0)
    await expect(page).toHaveURL(origin + base + '/password')
  } finally {
    await fixture.context.dispose()
  }
})

// 帳號安全頁自行變更密碼後，其他已登入的分頁／裝置被登出。
test('security page changes own password and signs out other sessions', async ({
  page,
  browser,
}) => {
  const fixture = await createFixture('viewer')
  const other = await browser.newContext({ baseURL: origin, acceptDownloads: false })
  try {
    const otherPage = await other.newPage()
    await loginUi(otherPage, fixture.user.username)
    await expect(otherPage).toHaveURL(origin + base + '/')
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/security')
    await expect(page.getByRole('heading', { name: '變更密碼', exact: true })).toBeVisible()
    const section = page.getByTestId('change-password')
    await fillPrivate(section.getByLabel('目前密碼', { exact: true }), password)
    await fillPrivate(section.getByLabel('新密碼', { exact: true }), next)
    await fillPrivate(section.getByLabel('再輸入一次新密碼', { exact: true }), next)
    await section.getByRole('button', { name: '變更密碼', exact: true }).click()
    await expect(section.getByRole('status')).toContainText('密碼已變更')
    await expect(page.getByRole('heading', { name: '帳號安全', exact: true })).toBeVisible()
    await otherPage.reload()
    await expect(otherPage.getByRole('heading', { name: '登入主控台', exact: true })).toBeVisible()
  } finally {
    await other.close()
    await fixture.context.dispose()
  }
})
