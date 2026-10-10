import { expect, test } from '@playwright/test'
import { api, base, createFixture, loginUi, resetStack } from '../e2e/helpers/fixtures'
import { waitForClock } from './fixtures'

// 每個正式crypto case重建隔離DB/KV，維持原限流而非test bypass。
test.beforeEach(() => resetStack())
for (const transport of ['tcp', 'ws']) {
  // 真UI新tab與Worker必須收到cipher LoginResponse.PeerInfo，ready不是成功。
  test(`official peer secure login over ${transport}`, async ({ page, context }) => {
    if (!process.env.RDWEB_RUSTDESK_PASSWORD || !process.env.RDWEB_RUSTDESK_TARGET_ID)
      throw new Error('Use test-m3b1-login.sh')
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
      await api(
        fixture.context,
        'targets',
        'POST',
        {
          name: 'official-login-target',
          server_id: server.id,
          rustdesk_id: process.env.RDWEB_RUSTDESK_TARGET_ID,
          password: process.env.RDWEB_RUSTDESK_PASSWORD,
        },
        fixture.admin.access_token,
      )
      await loginUi(page, fixture.user.username)
      await page.goto(base + '/targets')
      const row = page.locator('tbody tr').filter({ hasText: 'official-login-target' })
      await expect(row).toHaveCount(1)
      const popup = context.waitForEvent('page')
      await row.getByRole('link', { name: '連線', exact: true }).click()
      const console = await popup
      const wrong: string[] = []
      // 真正deep reload的Worker／HTTP資源也只能走掛載prefix，診斷只存pathname。
      console.on('request', (request) => {
        const url = new URL(request.url())
        if (base && url.origin === 'http://127.0.0.1:18080' && !url.pathname.startsWith(base + '/'))
          wrong.push(url.pathname)
      })
      try {
        await expect(console.getByTestId('console-verified')).toBeVisible({ timeout: 45000 })
        await waitForClock(console)
      } catch {
        const code = await console
          .getByRole('alert')
          .getAttribute('data-error-code')
          .catch(() => null)
        throw new Error('Official browser login failed: ' + (code ?? 'no-result'))
      }
      await expect(console.getByTestId('console-phase')).toHaveText('畫面已連線。')
      // B2保留已登入連線；深層重新整理必須新ticket／key並再次真正登入及呈現。
      await console.reload()
      await expect(console.getByTestId('console-verified')).toBeVisible({ timeout: 45000 })
      await waitForClock(console)
      await expect(console.getByTestId('console-phase')).toHaveText('畫面已連線。')
      expect(wrong.length).toBe(0)
      // Keys/proofs不在storage，斷言只欄名或布林，不回顯值。
      expect(
        await console.evaluate(
          () =>
            Object.keys(localStorage).every((key) =>
              ['rdweb.colorMode', 'rdweb.locale', 'rdweb.displayTimeZone'].includes(key),
            ) && sessionStorage.length === 0,
        ),
      ).toBe(true)
      await console.getByTestId('console-end').click()
      await expect(console.getByTestId('console-phase')).toHaveText('連線已取消／關閉')
      await console.close()
    } finally {
      await fixture.context.dispose()
    }
  })
}
