import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
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

// 管理矩陣保留真正API與隔離stack，不增加production test bypass。
test.beforeEach(() => resetStack())

// 目標表單與metadata CSV／批刪實際呼叫後端，沒有auth mock。
test('operator edits targets and transfers metadata through the UI', async ({ page }) => {
  const fixture = await createFixture()
  const wrong: string[] = []
  const errors: string[] = []
  // 只記HTTP pathname，不能把query／body或任何憑證寫入report。
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (base && url.origin === origin && !url.pathname.startsWith(base + '/'))
      wrong.push(url.pathname)
  })
  // 錯誤僅布林計數，不收集可能含動態內容的message。
  page.on('pageerror', () => errors.push('runtime'))
  // CSP違規只計數，涵蓋動態dialog／下載而不收集事件URL或原始內容。
  await page.addInitScript(() => {
    const state = window as Window & { managementCspErrors: number }
    state.managementCspErrors = 0
    // 標準事件監測不改CSP或production權限。
    document.addEventListener('securitypolicyviolation', () => state.managementCspErrors++)
  })
  try {
    const server = await api<{ id: string }>(
      fixture.context,
      'servers',
      'POST',
      {
        name: 'fixture-server',
        id_server: 'server.example:21116',
        relay_server: 'relay.example:21117',
        public_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        transport: 'tcp',
        enabled: true,
        allow_private_network: false,
        version: 0,
      },
      fixture.admin.access_token,
    )
    await loginUi(page, fixture.user.username)
    const navigation = await page.goto(base + '/targets')
    expect(navigation?.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
    await expect(page.getByRole('heading', { name: '目標主機', exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: '新增目標', exact: true }).click()
    const name = 'ui-target-' + randomUUID()
    await page.getByLabel('目標名稱', { exact: true }).fill(name)
    await page.getByLabel('伺服器', { exact: true }).selectOption(server.id)
    await page.getByLabel('RustDesk ID', { exact: true }).fill('123456789')
    await page.getByRole('dialog').getByLabel('群組', { exact: true }).fill('work')
    await page.getByLabel('密碼設定', { exact: true }).selectOption('replace')
    await fillPrivate(page.getByLabel('目標固定密碼', { exact: true }), password)
    await page.getByRole('button', { name: '保存目標', exact: true }).click()
    const row = page.locator('tbody tr').filter({ hasText: name })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: '編輯', exact: true }).click()
    await page.getByLabel('目標名稱', { exact: true }).fill(name + '-updated')
    await page.getByRole('button', { name: '保存目標', exact: true }).click()
    const updated = page.locator('tbody tr').filter({ hasText: name + '-updated' })
    await expect(updated).toHaveCount(1)
    // Owner operator的保持密碼更新後仍可reauth，正式TTL真正等待30秒。
    await updated.getByRole('button', { name: '顯示密碼', exact: true }).click()
    await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
    const revealed = page.waitForResponse((response) => response.url().endsWith('/password/reveal'))
    await page.getByRole('button', { name: '驗證並顯示', exact: true }).click()
    expect((await revealed).status()).toBe(200)
    // 只檢查布林，不能把真正密碼放入report。
    await page.waitForFunction(() => {
      const input = document.querySelector('[data-testid=revealed-password]')
      return input instanceof HTMLInputElement && input.value.length > 0
    })
    // Production期限沒有測試縮短開關，亦檢查不能提早在較短TTL通過。
    const revealStarted = Date.now()
    await page.waitForFunction(
      () => document.querySelector('[data-testid=revealed-password]') === null,
      {},
      { timeout: 35000 },
    )
    expect(Date.now() - revealStarted >= 29000).toBe(true)
    await expect(page.getByRole('status').filter({ hasText: '已自動遮蔽' })).toBeVisible()
    await page.getByRole('button', { name: '關閉', exact: true }).click()
    // 另一位admin已改資料時，舊editor必須收到409，不可自動覆寫。
    await updated.getByRole('button', { name: '編輯', exact: true }).click()
    const current = await api<{ items: Array<{ id: string; version: number }> }>(
      fixture.context,
      'targets',
      'GET',
      undefined,
      fixture.admin.access_token,
    )
    const target = current.items[0]!
    await api(
      fixture.context,
      'targets/' + target.id,
      'PUT',
      {
        name: name + '-updated',
        server_id: server.id,
        rustdesk_id: '123456789',
        group_name: 'work',
        version: target.version,
      },
      fixture.admin.access_token,
    )
    await page.getByRole('button', { name: '保存目標', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('版本')
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '搜尋', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '匯出 CSV', exact: true }).click()
    expect((await download).suggestedFilename()).toBe('targets.csv')
    await page.getByLabel('匯入 CSV 檔案', { exact: true }).setInputFiles({
      name: 'targets.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'server_id,name,rustdesk_id,group_name,tags,notes\r\n' +
          server.id +
          ',imported-fixture,other-id,work,[],public-note\r\n',
      ),
    })
    await expect(page.getByRole('status').filter({ hasText: '已匯入 1' })).toBeVisible()
    await expect(page.locator('tbody tr').filter({ hasText: 'imported-fixture' })).toHaveCount(1)
    // 選取條件只包含安全target名稱，不涉及password或token。
    for (const checkbox of await page.locator('tbody input[type=checkbox]').all())
      await checkbox.check()
    // 選取後遭另一位管理員改版，批刪全拒絕並刷新／清選取，不能沿用舊Version。
    const latest = await api<{ items: Array<{ id: string; version: number; name: string }> }>(
      fixture.context,
      'targets',
      'GET',
      undefined,
      fixture.admin.access_token,
    )
    const edited = latest.items.find((item) => item.id === target.id)!
    await api(
      fixture.context,
      'targets/' + edited.id,
      'PUT',
      {
        name: name + '-updated',
        server_id: server.id,
        rustdesk_id: '123456789',
        group_name: 'work',
        version: edited.version,
      },
      fixture.admin.access_token,
    )
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '刪除所選', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('版本')
    await expect(page.getByRole('button', { name: '刪除所選', exact: true })).toBeDisabled()
    await expect(page.locator('tbody input[type=checkbox]:checked')).toHaveCount(0)
    await expect(page.locator('tbody tr').filter({ hasText: name })).toHaveCount(1)
    await expect(page.locator('tbody tr').filter({ hasText: 'imported-fixture' })).toHaveCount(1)
    // 重新選取最新版本後才可再次送出，不自動重送破壞性操作。
    for (const checkbox of await page.locator('tbody input[type=checkbox]').all())
      await checkbox.check()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '刪除所選', exact: true }).click()
    await expect(page.locator('tbody tr').filter({ hasText: name })).toHaveCount(0)
    await expect(page.locator('tbody tr').filter({ hasText: 'imported-fixture' })).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(wrong.length).toBe(0)
    expect(errors.length).toBe(0)
    expect(
      await page.evaluate(
        () => (window as Window & { managementCspErrors: number }).managementCspErrors,
      ),
    ).toBe(0)
  } finally {
    await fixture.context.dispose()
  }
})

// Reveal真正30秒消失、關閉清proof；ACL仍由admin與backend角色ceiling限制。
test('administrator grants metadata and reveal clears after thirty seconds', async ({
  page,
  context,
}) => {
  const fixture = await createFixture('admin')
  try {
    const server = await api<{ id: string }>(
      fixture.context,
      'servers',
      'POST',
      {
        name: 'fixture-server',
        id_server: 'server.example:21116',
        relay_server: 'relay.example:21117',
        public_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        transport: 'tcp',
        enabled: true,
        allow_private_network: false,
        version: 0,
      },
      fixture.admin.access_token,
    )
    const target = await api<{ id: string }>(
      fixture.context,
      'targets',
      'POST',
      { name: 'reveal-fixture', server_id: server.id, rustdesk_id: '123456789', password },
      fixture.admin.access_token,
    )
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/targets')
    const row = page.locator('tbody tr').filter({ hasText: 'reveal-fixture' })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: '顯示密碼', exact: true }).click()
    await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
    const revealed = page
      .waitForResponse((response) => response.url().endsWith('/password/reveal'), { timeout: 5000 })
      .catch(async () => {
        // 診斷只包含DOM狀態布林，不擷取proof／password／body或header。
        const state = await page.evaluate(() => {
          const input = document.querySelector('#reveal-proof-password')
          return {
            dialog: document.querySelectorAll('dialog[open]').length,
            proofEmpty: input instanceof HTMLInputElement ? input.value.length === 0 : null,
            valid: input instanceof HTMLInputElement ? input.validity.valid : null,
            revealed: document.querySelector('[data-testid=revealed-password]') !== null,
          }
        })
        throw new Error('Reveal response missing: ' + JSON.stringify(state))
      })
    await page.getByRole('button', { name: '驗證並顯示', exact: true }).click()
    expect((await revealed).status()).toBe(200)
    // 只斷言布林，不把真實密碼放入expect的錯誤report。
    await page.waitForFunction(
      () => {
        const value = document.querySelector('[data-testid=revealed-password]')
        return value instanceof HTMLInputElement && value.value.length > 0
      },
      {},
      { timeout: 5000 },
    )
    await test.step('wait for the real reveal deadline', async () => {
      await page.waitForFunction(
        () => document.querySelector('[data-testid=revealed-password]') === null,
        {},
        { timeout: 35000 },
      )
    })
    await expect(page.getByRole('status').filter({ hasText: '已自動遮蔽' })).toBeVisible()
    await page.getByRole('button', { name: '關閉', exact: true }).click()
    await row.getByRole('button', { name: '目標權限', exact: true }).click()
    await page.getByRole('button', { name: '新增授權', exact: true }).click()
    await page.getByLabel('授權角色', { exact: true }).selectOption('role:viewer')
    await page.getByRole('button', { name: '保存權限', exact: true }).click()
    const reader = await api<{ username: string }>(
      fixture.context,
      'users',
      'POST',
      { username: 'reader-' + randomUUID().replaceAll('-', ''), password, role: 'viewer' },
      fixture.admin.access_token,
    )
    const viewer = await context.browser()!.newContext({ baseURL: origin, acceptDownloads: false })
    try {
      const viewerPage = await viewer.newPage()
      await loginUi(viewerPage, reader.username)
      await viewerPage.goto(base + '/targets')
      await expect(
        viewerPage.locator('tbody tr').filter({ hasText: 'reveal-fixture' }),
      ).toHaveCount(1)
      expect(await viewerPage.getByRole('button', { name: '顯示密碼', exact: true }).count()).toBe(
        0,
      )
      expect(await viewerPage.getByRole('button', { name: '新增目標', exact: true }).count()).toBe(
        0,
      )
      expect(await viewerPage.getByRole('button', { name: '目標權限', exact: true }).count()).toBe(
        0,
      )
      await viewerPage.goto(base + '/servers')
      await expect(viewerPage.getByRole('heading', { name: '概覽', exact: true })).toBeVisible()
      // 同一viewer session下一次查詢即受撤銷ACL限制，不需要重登入。
      await row.getByRole('button', { name: '目標權限', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '刪除', exact: true }).click()
      await page.getByRole('button', { name: '保存權限', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await viewerPage.goto(base + '/targets')
      await expect(viewerPage.getByRole('heading', { name: '目標主機', exact: true })).toBeVisible()
      await expect(
        viewerPage.locator('tbody tr').filter({ hasText: 'reveal-fixture' }),
      ).toHaveCount(0)
    } finally {
      await viewer.close()
    }
    expect(target.id.length > 0).toBe(true)
  } finally {
    await fixture.context.dispose()
  }
})
