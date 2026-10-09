import { expect, test, type Page } from '@playwright/test'
import {
  api,
  base,
  createFixture,
  fillPrivate,
  loginUi,
  logoutUi,
  password,
  resetStack,
} from './helpers/fixtures'

// 每案例使用獨立測試stack，reauth配額維持正式設定。
test.beforeEach(() => resetStack())

// 真正API顯示成功後只檢查布林，沒有密碼assert值／snapshot。
async function show(page: Page): Promise<void> {
  await page
    .locator('tbody tr')
    .filter({ hasText: 'lifecycle-fixture' })
    .getByRole('button', { name: '顯示密碼', exact: true })
    .click()
  await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
  const response = page.waitForResponse((value) => value.url().endsWith('/password/reveal'))
  await page.getByRole('button', { name: '驗證並顯示', exact: true }).click()
  expect((await response).status()).toBe(200)
  // DOM檢查只回傳非空布林，不讀出或輸出明文。
  await page.waitForFunction(
    () => {
      const input = document.querySelector('[data-testid=revealed-password]')
      return input instanceof HTMLInputElement && input.value.length > 0
    },
    {},
    { timeout: 5000 },
  )
}

// 關閉／背景事件／真正跨tab登出都立即清除，路由退出不能留下短命dialog。
test('reveal clears on close, visibility event, route exit and cross-tab logout', async ({
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
    await api(
      fixture.context,
      'targets',
      'POST',
      { name: 'lifecycle-fixture', server_id: server.id, rustdesk_id: '123456789', password },
      fixture.admin.access_token,
    )
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/targets')
    await expect(page.locator('tbody tr').filter({ hasText: 'lifecycle-fixture' })).toHaveCount(1)
    await show(page)
    await page.keyboard.press('Escape')
    expect(await page.locator('[data-testid=revealed-password]').count()).toBe(0)
    await page.getByRole('link', { name: '概覽', exact: true }).click()
    await expect(page.getByRole('heading', { name: '概覽', exact: true })).toBeVisible()
    expect(await page.locator('dialog[open]').count()).toBe(0)
    await page.getByRole('link', { name: '目標主機', exact: true }).click()
    await show(page)
    // Headless不保證OS背景tab狀態，僅注入標準DOM事件；認證仍是真正API。
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
      Reflect.deleteProperty(document, 'hidden')
    })
    expect(await page.locator('[data-testid=revealed-password]').count()).toBe(0)
    await expect(page.getByRole('status').filter({ hasText: '已自動遮蔽' })).toBeVisible()
    await page.getByRole('button', { name: '關閉', exact: true }).click()
    await show(page)
    // 瀏覽器返回觸發SPA卸載，原生modal即使仍開啟也不能留下明文。
    await page.goBack()
    await expect(page.getByRole('heading', { name: '概覽', exact: true })).toBeVisible()
    expect(await page.locator('dialog[open]').count()).toBe(0)
    await page.getByRole('link', { name: '目標主機', exact: true }).click()
    // 只延遲真正後端的reveal response；不mock proof／auth，也不輸出payload。
    let release!: () => void
    let received!: (status: number) => void
    let delivered!: () => void
    // 三個同步點只傳遞安全狀態，讓關閉早於真實回應交付。
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const status = new Promise<number>((resolve) => {
      received = resolve
    })
    const delivery = new Promise<void>((resolve) => {
      delivered = resolve
    })
    const path = '**/api/v1/targets/*/password/reveal'
    // 已關dialog會取消request；預期的中止只留安全完成訊號。
    await page.route(path, async (route) => {
      try {
        const response = await route.fetch()
        received(response.status())
        await hold
        try {
          await route.fulfill({ response })
        } catch {
          /* 關閉已取消request，不記錄私密例外。 */
        }
      } catch {
        received(0)
      } finally {
        delivered()
      }
    })
    await page
      .locator('tbody tr')
      .filter({ hasText: 'lifecycle-fixture' })
      .getByRole('button', { name: '顯示密碼', exact: true })
      .click()
    await fillPrivate(page.getByLabel('目前密碼', { exact: true }), password)
    await page.getByRole('button', { name: '驗證並顯示', exact: true }).click()
    try {
      expect(await status).toBe(200)
      await page.keyboard.press('Escape')
    } finally {
      release()
      await delivery
      await page.unroute(path)
    }
    expect(await page.locator('dialog[open]').count()).toBe(0)
    // 重新開啟必須從空proof開始，舊response不能回填到新dialog。
    await page
      .locator('tbody tr')
      .filter({ hasText: 'lifecycle-fixture' })
      .getByRole('button', { name: '顯示密碼', exact: true })
      .click()
    expect(
      await page
        .locator('#reveal-proof-password')
        .evaluate((input) => input instanceof HTMLInputElement && input.value.length === 0),
    ).toBe(true)
    expect(await page.locator('[data-testid=revealed-password]').count()).toBe(0)
    await page.getByRole('button', { name: '關閉', exact: true }).click()
    const second = await context.newPage()
    await second.goto(base + '/')
    await expect(second.getByRole('heading', { name: '概覽', exact: true })).toBeVisible()
    await page.bringToFront()
    await show(page)
    await logoutUi(second)
    await expect(page.getByRole('heading', { name: '登入主控台', exact: true })).toBeVisible()
    expect(await page.locator('[data-testid=revealed-password]').count()).toBe(0)
    expect(await page.locator('dialog[open]').count()).toBe(0)
  } finally {
    await fixture.context.dispose()
  }
})
