import type { APIRequestContext, Page, BrowserContext } from '@playwright/test'
import { api, createFixture, loginUi, base } from '../e2e/helpers/fixtures'
export interface OfficialFixture {
  context: APIRequestContext
  username: string
  targetId: string
  name: string
}
// 只保存prefix違規及Worker生命週期計數，不保存URL、WS資料或認證headers。
export function observeConsole(context: BrowserContext) {
  const state = { wrongPrefix: 0, workerAssets: 0, opened: 0, closed: 0, sockets: 0 }
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:18080') return
    if (base && !url.pathname.startsWith(base + '/')) state.wrongPrefix++
    if (url.pathname.includes('protocol.worker-')) state.workerAssets++
  })
  context.on('page', (page) => {
    page.on('worker', (worker) => {
      state.opened++
      worker.on('close', () => state.closed++)
    })
    page.on('websocket', (socket) => {
      state.sockets++
      const url = new URL(socket.url())
      if (
        url.origin !== 'ws://127.0.0.1:18080' ||
        !url.pathname.startsWith(base + '/api/v1/targets/')
      )
        state.wrongPrefix++
    })
  })
  return state
}
// Runtime password只經正式admin API進Vault，不傳browser或helper回傳資料。
export async function prepareOfficialTarget(transport: 'tcp' | 'ws'): Promise<OfficialFixture> {
  if (!process.env.RDWEB_RUSTDESK_PASSWORD || !process.env.RDWEB_RUSTDESK_TARGET_ID)
    throw new Error('Use official RustDesk runner')
  const fixture = await createFixture('admin')
  try {
    const server = await api<{ id: string }>(
      fixture.context,
      'servers',
      'POST',
      {
        name: 'official-fixture',
        id_server: 'hbbs:' + (transport === 'tcp' ? 21116 : 21118),
        relay_server: 'hbbr:' + (transport === 'tcp' ? 21117 : 21119),
        public_key: process.env.RDWEB_RUSTDESK_PUBLIC_KEY,
        transport,
        enabled: true,
        allow_private_network: true,
        version: 0,
      },
      fixture.admin.access_token,
    )
    const name = 'official-video-target'
    const target = await api<{ id: string }>(
      fixture.context,
      'targets',
      'POST',
      {
        name,
        server_id: server.id,
        rustdesk_id: process.env.RDWEB_RUSTDESK_TARGET_ID,
        password: process.env.RDWEB_RUSTDESK_PASSWORD,
      },
      fixture.admin.access_token,
    )
    return { context: fixture.context, username: fixture.user.username, targetId: target.id, name }
  } catch {
    await fixture.context.dispose()
    throw new Error('Official fixture unavailable')
  }
}
// 真UI登入及連線link開新tab，URL不帶ticket或proof。
export async function openOfficialConsole(page: Page, fixture: OfficialFixture): Promise<Page> {
  await loginUi(page, fixture.username)
  await page.goto(base + '/targets')
  const popup = page.context().waitForEvent('page')
  await page
    .locator('tbody tr')
    .filter({ hasText: fixture.name })
    .getByRole('link', { name: '連線', exact: true })
    .click()
  const consolePage = await popup
  await consolePage.bringToFront()
  return consolePage
}
// 只回公開測試clock的布林／checksum變化，不回pixels或hash值至report。
export async function waitForClock(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="console-canvas"]')
        if (!canvas || canvas.width !== 1280 || canvas.height !== 720) return false
        const context = canvas.getContext('2d')
        if (!context) return false
        const pixels = context.getImageData(200, 250, 700, 120).data
        let blue = 0
        const colors = new Set<number>()
        for (let index = 0; index < pixels.length; index += 4) {
          if (colors.size < 8)
            colors.add(pixels[index]! * 65536 + pixels[index + 1]! * 256 + pixels[index + 2]!)
          if (
            Math.abs(pixels[index]! - 26) <= 20 &&
            Math.abs(pixels[index + 1]! - 102) <= 20 &&
            Math.abs(pixels[index + 2]! - 143) <= 20
          )
            blue++
        }
        return blue >= 1000 && colors.size >= 2
      },
      undefined,
      { timeout: 45000 },
    )
  } catch {
    const code = await page
      .getByRole('alert')
      .getAttribute('data-error-code')
      .catch(() => null)
    throw new Error('Official image failed: ' + (code ?? 'no-image'))
  }
}
// 專用clock至少兩次pixel內容不同；hash僅存在page closure且立即丟棄。
export async function clockChanges(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="console-canvas"]')!
    // 私有短命取樣，不將遠端畫面或checksum放window/global。
    const checksum = (): number => {
      const pixels = canvas.getContext('2d')!.getImageData(200, 250, 700, 120).data
      let hash = 2166136261
      for (let index = 0; index < pixels.length; index += 4)
        hash =
          Math.imul(
            hash ^ (pixels[index]! * 65536 + pixels[index + 1]! * 256 + pixels[index + 2]!),
            16777619,
          ) >>> 0
      return hash
    }
    let previous = checksum(),
      changes = 0
    for (let index = 0; index < 5; index++) {
      await new Promise((resolve) => setTimeout(resolve, 1100))
      const current = checksum()
      if (previous !== current) changes++
      previous = current
      if (changes >= 2) return true
    }
    return false
  })
}
