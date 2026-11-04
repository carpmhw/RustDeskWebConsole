import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { base, createFixture, fillPrivate, loginUi, resetStack } from './helpers/fixtures'

// 管理矩陣中的真正server UI，沿用隔離DB／KV與正式權限。
test.beforeEach(() => resetStack())

// 真正表單CRUD／Version／probe及刪除，沒有mock登入或API。
test('administrator manages a saved server through the UI', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/servers')
    await expect(
      page.getByRole('heading', { name: 'RustDesk 伺服器', exact: true }).first(),
    ).toBeVisible()
    await page.getByRole('button', { name: '新增伺服器', exact: true }).click()
    const name = 'ui-server-' + randomUUID()
    await page.getByLabel('名稱', { exact: true }).fill(name)
    await page.getByLabel('ID Server 端點', { exact: true }).fill('127.0.0.1')
    await page.getByLabel('ID Server port', { exact: true }).fill('1')
    await page.getByLabel('Relay Server 端點', { exact: true }).fill('127.0.0.1')
    await page.getByLabel('Relay Server port', { exact: true }).fill('2')
    await fillPrivate(
      page.getByLabel('伺服器公鑰', { exact: true }),
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    )
    await page.getByLabel('明確允許私網／同機端點', { exact: true }).check()
    await page.getByRole('button', { name: '保存設定', exact: true }).click()
    const row = page.locator('tbody tr').filter({ hasText: name })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: '測試 TCP 連通', exact: true }).click()
    await expect(row.getByTestId('probe-result')).toContainText('無法連通')
    await row.getByRole('button', { name: '編輯', exact: true }).click()
    await page.getByLabel('名稱', { exact: true }).fill(name + '-updated')
    await page.getByRole('button', { name: '保存設定', exact: true }).click()
    const updated = page.locator('tbody tr').filter({ hasText: name + '-updated' })
    await expect(updated).toHaveCount(1)
    // 只接受由此次刪除按鈕產生的標準確認對話。
    page.once('dialog', (dialog) => dialog.accept())
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' && response.url().includes('/api/v1/servers/'),
    )
    await updated.getByRole('button', { name: '刪除', exact: true }).click()
    expect((await deleted).status()).toBe(204)
    await expect(updated).toHaveCount(0)
  } finally {
    await fixture.context.dispose()
  }
})

// 只填主機即以傳輸方式的 OSS 預設 port 保存；送出仍為明確 host:port。
test('server form saves host-only endpoints with transport default ports', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/servers')
    for (const [transport, id, relay] of [
      ['tcp', '127.0.0.1:21116', '127.0.0.1:21117'],
      ['ws', '127.0.0.1:21118', '127.0.0.1:21119'],
    ] as const) {
      await page.getByRole('button', { name: '新增伺服器', exact: true }).click()
      await page.getByLabel('名稱', { exact: true }).fill('default-port-' + randomUUID())
      await page.getByLabel('傳輸', { exact: true }).selectOption(transport)
      await page.getByLabel('ID Server 端點', { exact: true }).fill('127.0.0.1')
      await page.getByLabel('Relay Server 端點', { exact: true }).fill('127.0.0.1')
      await fillPrivate(
        page.getByLabel('伺服器公鑰', { exact: true }),
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      )
      await page.getByLabel('明確允許私網／同機端點', { exact: true }).check()
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().endsWith('/api/v1/servers'),
      )
      await page.getByRole('button', { name: '保存設定', exact: true }).click()
      const response = await saved
      expect(response.status()).toBe(201)
      // 只取公開端點欄位比對，不輸出整個 body（含公鑰）。
      const body = response.request().postDataJSON() as { id_server: string; relay_server: string }
      expect([body.id_server, body.relay_server]).toEqual([id, relay])
    }
  } finally {
    await fixture.context.dispose()
  }
})

// 編輯既有設定只拆回原值，不因傳輸方式不同而改寫 port（WS 設定保存 TCP 預設 port 的情境）。
test('editing a saved server keeps its explicit ports', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/servers')
    const name = 'keep-port-' + randomUUID()
    await page.getByRole('button', { name: '新增伺服器', exact: true }).click()
    await page.getByLabel('名稱', { exact: true }).fill(name)
    await page.getByLabel('傳輸', { exact: true }).selectOption('ws')
    await page.getByLabel('ID Server 端點', { exact: true }).fill('127.0.0.1')
    await page.getByLabel('ID Server port', { exact: true }).fill('21116')
    await page.getByLabel('Relay Server 端點', { exact: true }).fill('127.0.0.1')
    await page.getByLabel('Relay Server port', { exact: true }).fill('21117')
    await fillPrivate(
      page.getByLabel('伺服器公鑰', { exact: true }),
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    )
    await page.getByLabel('明確允許私網／同機端點', { exact: true }).check()
    await page.getByRole('button', { name: '保存設定', exact: true }).click()
    const row = page.locator('tbody tr').filter({ hasText: name })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: '編輯', exact: true }).click()
    await expect(page.getByLabel('ID Server port', { exact: true })).toHaveValue('21116')
    await expect(page.getByLabel('Relay Server port', { exact: true })).toHaveValue('21117')
    const updated = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' && response.url().includes('/api/v1/servers/'),
    )
    await page.getByRole('button', { name: '保存設定', exact: true }).click()
    const body = (await updated).request().postDataJSON() as {
      id_server: string
      relay_server: string
    }
    expect([body.id_server, body.relay_server]).toEqual(['127.0.0.1:21116', '127.0.0.1:21117'])
  } finally {
    await fixture.context.dispose()
  }
})

// 切換傳輸方式只替換仍為預設的 port；手動改過的 port 保留。
test('switching transport swaps only default ports', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/servers')
    await page.getByRole('button', { name: '新增伺服器', exact: true }).click()
    await page.getByLabel('Relay Server port', { exact: true }).fill('9000')
    await page.getByLabel('傳輸', { exact: true }).selectOption('ws')
    await expect(page.getByLabel('ID Server port', { exact: true })).toHaveValue('21118')
    await expect(page.getByLabel('Relay Server port', { exact: true })).toHaveValue('9000')
    await page.getByLabel('ID Server port', { exact: true }).fill('21118')
    await page.getByLabel('傳輸', { exact: true }).selectOption('tcp')
    await expect(page.getByLabel('ID Server port', { exact: true })).toHaveValue('21116')
  } finally {
    await fixture.context.dispose()
  }
})
