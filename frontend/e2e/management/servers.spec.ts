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
    await page.getByLabel('ID Server 端點', { exact: true }).fill('127.0.0.1:1')
    await page.getByLabel('Relay Server 端點', { exact: true }).fill('127.0.0.1:2')
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
