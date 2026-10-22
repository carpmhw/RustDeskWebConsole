import { expect, test, type Page } from '@playwright/test'

const base = (process.env.APP_BASE_PATH ?? '/').replace(/\/$/, '')

// 匿名外觀控制集中在原生disclosure，先以真操作打開再調整同一偏好。
async function openAppearance(page: Page): Promise<void> {
  await page.getByTestId('appearance-menu').locator('summary').click()
}

// 瀏覽器接受的合法別名必須能在下拉選單呈現，不能只在 formatter 中有效。
test('saved timezone alias remains selected', async ({ page }) => {
  // 在應用啟動前模擬使用者已保存的合法時區別名。
  await page.addInitScript(() => localStorage.setItem('rdweb.displayTimeZone', 'Etc/UTC'))
  await page.goto(`${base}/`)
  await openAppearance(page)
  await expect(page.getByLabel('頁面時區')).toHaveValue('Etc/UTC')
})

// 真實瀏覽器的深層路由刷新、個人時區與所有資源請求皆遵循執行期前綴。
test('deep route, runtime prefix and timezone preference', { tag: '@proxy' }, async ({ page }) => {
  const wrongRequests: string[] = []
  const errors: string[] = []
  // 收集違反掛載路徑的同來源請求，避免只檢查 HTML 而漏掉 JS／CSS。
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (base && url.origin === 'http://127.0.0.1:18080' && !url.pathname.startsWith(base + '/')) {
      wrongRequests.push(url.pathname)
    }
  })
  // CSP 或執行期錯誤應直接使端對端驗收失敗。
  page.on('pageerror', (error) => errors.push(error.message))
  const navigation = await page.goto(`${base}/login`)
  expect(navigation?.status()).toBe(200)
  expect(navigation?.headers()['x-frame-options']).toBe('DENY')
  expect(navigation?.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  await expect(page.getByTestId('health-status')).toHaveText('服務正常')
  await openAppearance(page)
  await expect(page.getByLabel('頁面時區')).toHaveValue('Asia/Taipei')
  await page.getByLabel('頁面時區').selectOption('UTC')
  await page.reload()
  await openAppearance(page)
  await expect(page.getByLabel('頁面時區')).toHaveValue('UTC')
  await expect(page.getByTestId('health-status')).toHaveText('服務正常')
  expect(wrongRequests).toEqual([])
  expect(errors).toEqual([])
})

// 兩層真實 nginx 代理後 Cookie Path、redirect 與 WebSocket 握手仍正確。
test('proxy redirect, cookie and WebSocket ready', { tag: '@proxy' }, async ({ page, request }) => {
  const response = await request.get(`${base}/api/v1/spikes/redirect`, { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  expect(response.headers()['location']).toBe(`http://127.0.0.1:18080${base}/api/v1/health`)
  expect(response.headers()['set-cookie']).toContain(`path=${base}/api/v1/auth`)
  await page.goto(`${base}/`)
  // 從瀏覽器來源發出 WebSocket，Origin 由瀏覽器產生且不經人工偽造。
  const ready = await page.evaluate(async (prefix) => {
    return await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(`ws://${location.host}${prefix}/api/v1/spikes/ws`)
      const timeout = setTimeout(() => {
        socket.close()
        reject(new Error('WebSocket timeout'))
      }, 5000)
      socket.onmessage = (event) => {
        clearTimeout(timeout)
        resolve(String(event.data))
        socket.close()
      }
      socket.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('WebSocket failed'))
      }
    })
  }, base)
  expect(JSON.parse(ready)).toEqual({ status: 'ready' })
})
