import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, request, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { totpCode } from './totp'

export const base = (process.env.APP_BASE_PATH ?? '/').replace(/\/$/, '')
export const origin = 'http://127.0.0.1:18080'
export const password = process.env.RDWEB_E2E_PASSWORD ?? ''
export interface FixtureUser {
  id: string
  username: string
  role: string
}
interface Grant {
  access_token: string
  csrf_token: string
  user: FixtureUser
}
const compose = fileURLToPath(
  new URL('../../../../deploy/dev/docker-compose.spikes.yml', import.meta.url),
)

// 每authcase重建隔離stack，不降低配額或增加production test bypass。
export function resetStack(): void {
  if (password.length < 12 || !process.env.RDWEB_E2E_USERNAME)
    throw new Error('Use test-subpaths.sh to provide runtime E2E credentials')
  try {
    const args = ['compose', '-f', compose]
    const override = process.env.RDWEB_E2E_COMPOSE_OVERRIDE
    if (
      override !== undefined &&
      ![
        'frontend/e2e/docker/docker-compose.browser-login-test.yml',
        'frontend/e2e/docker/docker-compose.reconnect-test.yml',
      ].includes(override)
    )
      throw new Error()
    if (override !== undefined)
      args.push(
        '-f',
        fileURLToPath(
          new URL('../../docker/docker-compose.browser-login-test.yml', import.meta.url),
        ),
      )
    if (override === 'frontend/e2e/docker/docker-compose.reconnect-test.yml') {
      args.push(
        '-f',
        fileURLToPath(new URL('../../docker/docker-compose.reconnect-test.yml', import.meta.url)),
      )
    }
    execFileSync(
      'docker',
      [...args, 'up', '-d', '--force-recreate', '--wait', '--wait-timeout', '60'],
      { stdio: 'pipe', env: process.env },
    )
  } catch {
    throw new Error('Isolated E2E stack did not become healthy')
  }
}

// 防止Playwright失敗的fill call log洩漏輸入值。
export async function fillPrivate(locator: Locator, value: string): Promise<void> {
  try {
    await locator.fill(value)
  } catch {
    throw new Error('Sensitive input is unavailable')
  }
}

// API失敗只回安全診斷，不回傳header／payload至test report。
export async function api<T>(
  context: APIRequestContext,
  path: string,
  method = 'GET',
  body?: unknown,
  token?: string,
): Promise<T> {
  try {
    const response = await context.fetch(origin + base + '/api/v1/' + path, {
      method,
      data: method === 'GET' ? undefined : (body ?? {}),
      headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    })
    expect(response.ok()).toBe(true)
    return response.status() === 204 ? (undefined as T) : ((await response.json()) as T)
  } catch {
    throw new Error('Fixture API request failed')
  }
}

// Bootstrap只建立管理員，測試使用者透過正式CRUD API建立。
export async function createFixture(
  role: 'viewer' | 'operator' | 'admin' = 'operator',
): Promise<{ user: FixtureUser; admin: Grant; context: APIRequestContext }> {
  const context = await request.newContext()
  const admin = await api<Grant>(context, 'auth/login', 'POST', {
    username: process.env.RDWEB_E2E_USERNAME,
    password,
  })
  const user = await api<FixtureUser>(
    context,
    'users',
    'POST',
    { username: 'e2e-' + randomUUID().replaceAll('-', ''), password, role },
    admin.access_token,
  )
  return { user, admin, context }
}

// 真正操作帳密表單，沒有route mock或直接植入登入狀態。
export async function loginUi(page: Page, username: string): Promise<void> {
  await page.goto(base + '/login')
  const appearance = page.getByTestId('appearance-menu')
  if (await appearance.count()) await appearance.locator('summary').click()
  await page.getByLabel('語言', { exact: true }).selectOption('zh-TW')
  await page.getByLabel('帳號', { exact: true }).fill(username)
  await fillPrivate(page.getByLabel('密碼', { exact: true }), password)
  const completed = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/login'),
  )
  await page.getByRole('button', { name: '登入', exact: true }).click()
  expect((await completed).status()).toBe(200)
  // 點擊完成不代表登入完成；等待新session導向或第二步真正出現。
  await page.waitForFunction(
    (prefix) =>
      location.pathname !== prefix + '/login' || document.querySelector('#mfa-code') !== null,
    base,
  )
}

// 等待遠端cookie撤銷，避免立即換頁取消仍在傳送的logout。
export async function logoutUi(page: Page): Promise<void> {
  const response = page.waitForResponse((value) => value.url().endsWith('/api/v1/auth/logout'))
  await page.getByTestId('logout').click()
  const result = await response
  expect(result.status()).toBe(204)
  await result.finished()
}

// 真正的enrol／QR／confirm，codes只讀RAM，所有斷言只輸出布林或計數。
export async function enrollUi(page: Page): Promise<{ secret: string; codes: string[] }> {
  await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
  await page.getByRole('button', { name: '開始綁定', exact: true }).click()
  try {
    await page.locator('[data-testid=manual-secret]').waitFor({ state: 'attached' })
  } catch {
    throw new Error('Enrollment did not complete')
  }
  const secret = (await page.locator('[data-testid=manual-secret]').textContent())!
  expect(
    await page
      .locator('[data-testid=totp-qr]')
      .evaluate(
        (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      ),
  ).toBe(true)
  await fillPrivate(page.getByLabel('驗證碼', { exact: true }), totpCode(secret))
  await page.getByRole('button', { name: '確認並啟用', exact: true }).click()
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid=recovery-codes] li').length === 10,
    )
  } catch {
    throw new Error('Recovery codes were not displayed')
  }
  const codes = await page.locator('[data-testid=recovery-codes] li').allTextContents()
  expect(codes.length).toBe(10)
  return { secret, codes }
}
