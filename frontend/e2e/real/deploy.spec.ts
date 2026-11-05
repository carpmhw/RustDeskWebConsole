import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  api,
  base,
  createFixture,
  fillPrivate,
  loginUi,
  logoutUi,
  origin,
  password,
} from '../management/helpers/fixtures'
import { totpCode } from '../management/helpers/totp'
import { waitForClock } from './fixtures'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const work = process.env.RDWEB_M4_WORK ?? ''
const conf = process.env.RDWEB_CONF ?? ''
const project = process.env.RDWEB_PROJECT ?? ''
const override = process.env.RDWEB_COMPOSE_EXTRA ?? ''
const backups = process.env.RDWEB_BACKUP_DIR ?? ''
const lifecycle = process.env.RDWEB_M4_LIFECYCLE === '1'
const probeIp = /(^|:)172\.31\.81\.20$/

// 只能由 test-m4-deploy.sh 提供隔離部署環境。
test.beforeAll(() => {
  if (!work || !conf || !project || !override || !backups || !process.env.RDWEB_RUSTDESK_PASSWORD)
    throw new Error('Use test-m4-deploy.sh')
})

// 以與正式腳本相同的專案、設定檔與 compose 檔操作本 runner 的部署；失敗只回固定訊息。
function compose(args: string[]): string {
  try {
    return execFileSync(
      'docker',
      [
        'compose',
        '-p',
        project,
        '--env-file',
        conf,
        '-f',
        join(repo, 'deploy/prod/compose.yml'),
        '-f',
        override,
        ...args,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
  } catch {
    throw new Error('Deploy compose command failed: ' + args[0])
  }
}

// 以 sudo 執行正式維運腳本（與文件相同），環境只帶非秘密路徑設定。
function opsScript(script: string, args: string[]): void {
  try {
    execFileSync(
      'sudo',
      [
        '-n',
        'env',
        `RDWEB_CONF=${conf}`,
        `RDWEB_PROJECT=${project}`,
        `RDWEB_COMPOSE_EXTRA=${override}`,
        `RDWEB_BACKUP_DIR=${backups}`,
        'sh',
        join(repo, 'deploy/prod', script),
        ...args,
      ],
      { stdio: 'pipe' },
    )
  } catch (error) {
    // 維運腳本只輸出固定訊息與 compose 狀態，不含秘密；保留最後幾行協助診斷。
    const stderr = String((error as { stderr?: Buffer }).stderr ?? '')
      .trim()
      .split('\n')
      .slice(-5)
      .join(' | ')
    throw new Error('Deploy script failed: ' + script + ': ' + stderr)
  }
}

// 線上備份後回傳本次新增的備份檔路徑（比對前後目錄內容，不依檔名排序）。
function backupNow(): string {
  const before = new Set(readdirSync(backups))
  opsScript('backup.sh', [backups])
  const created = readdirSync(backups).filter(
    (name) => !before.has(name) && /^rdweb-\d{8}T\d{6}Z-\d+\.db$/.test(name),
  )
  if (created.length !== 1) throw new Error('Backup file missing')
  return join(backups, created[0]!)
}

// 讀取最新備份中最後幾筆登入失敗稽核的來源 IP；備份為 root 0600，先複製為本 runner 可讀的暫存檔。
function failedLoginSources(limit: number): string[] {
  const copy = join(work, `audit-${randomUUID()}.db`)
  writeFileSync(copy, execFileSync('sudo', ['-n', 'cat', backupNow()]), { mode: 0o600 })
  const database = new DatabaseSync(copy, { readOnly: true })
  try {
    return database
      .prepare(
        "SELECT source_ip FROM audit_logs WHERE action = 'Login' AND result = 'Failure' ORDER BY rowid DESC LIMIT ?",
      )
      .all(limit)
      .map((row) => String(row.source_ip))
  } finally {
    database.close()
  }
}

// 從固定 IP 探測容器送出一次必定失敗的登入；回傳 HTTP 狀態碼以確認確實抵達後端。
function probeLogin(url: string, spoofed: boolean): string {
  return compose([
    'run',
    '--rm',
    '--no-deps',
    '-T',
    'probe',
    '--insecure',
    '--silent',
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    '--header',
    'Content-Type: application/json',
    '--header',
    'Origin: ' + origin,
    '--header',
    'Host: ' + new URL(origin).host,
    ...(spoofed ? ['--header', 'X-Forwarded-For: 203.0.113.9'] : []),
    '--data',
    JSON.stringify({
      username: 'm4-probe-' + randomUUID().slice(0, 8),
      password: 'wrong-password-value',
    }),
    url,
  ])
}

// 以管理員 API 建立官方 fixture 的 TCP 伺服器與目標；目標密碼只經 API 進 Vault。
async function createTarget(
  context: APIRequestContext,
  token: string,
  name: string,
): Promise<{ id: string }> {
  const server = await api<{ id: string }>(
    context,
    'servers',
    'POST',
    {
      name: 'official-fixture-' + name,
      id_server: 'hbbs:21116',
      relay_server: 'hbbr:21117',
      public_key: process.env.RDWEB_RUSTDESK_PUBLIC_KEY,
      transport: 'tcp',
      enabled: true,
      allow_private_network: true,
      version: 0,
    },
    token,
  )
  return api<{ id: string }>(
    context,
    'targets',
    'POST',
    {
      name,
      server_id: server.id,
      rustdesk_id: process.env.RDWEB_RUSTDESK_TARGET_ID,
      password: process.env.RDWEB_RUSTDESK_PASSWORD,
    },
    token,
  )
}

// 以新管理員登入列出目前資料庫內的目標名稱。
async function targetNames(): Promise<string[]> {
  const fixture = await createFixture('admin')
  try {
    const targets = await api<{ items?: { name: string }[] } | { name: string }[]>(
      fixture.context,
      'targets',
      'GET',
      undefined,
      fixture.admin.access_token,
    )
    return (Array.isArray(targets) ? targets : (targets.items ?? [])).map((target) => target.name)
  } finally {
    await fixture.context.dispose()
  }
}

// 在同源頁面以指定 ticket 嘗試 WebSocket；只回 open／rejected，不回顯 ticket。
async function tryTicket(page: Page, targetId: string, ticket: string): Promise<string> {
  const url = origin.replace(/^https:/, 'wss:') + base + `/api/v1/targets/${targetId}/connect`
  return page.evaluate(
    /* 開啟即關閉，避免占用真實連線。 */ ([address, value]) =>
      new Promise<string>((resolve) => {
        const socket = new WebSocket(address!, ['rdweb.v1', 'rdweb.ticket.' + value])
        socket.onopen = () => {
          socket.close()
          resolve('open')
        }
        socket.onerror = () => resolve('rejected')
        socket.onclose = () => resolve('rejected')
      }),
    [url, ticket],
  )
}

// 正式部署下完成 TOTP 登入、深層重新整理、真實遠端畫面，且 Cookie 與資源路徑都在掛載前綴下。
test('deployed console logs in with TOTP, survives deep refresh and opens a real session', async ({
  page,
  context,
}) => {
  const fixture = await createFixture('admin')
  try {
    const own = await api<{ access_token: string }>(fixture.context, 'auth/login', 'POST', {
      username: fixture.user.username,
      password,
    })
    const pending = await api<{ secret: string }>(
      fixture.context,
      'auth/totp/enroll',
      'POST',
      { password },
      own.access_token,
    )
    await api(
      fixture.context,
      'auth/totp/confirm',
      'POST',
      { code: totpCode(pending.secret) },
      own.access_token,
    )
    // 六組共用同一份部署資料，目標名稱每組唯一。
    const targetName = 'm4-deploy-' + randomUUID().slice(0, 8)
    await createTarget(fixture.context, fixture.admin.access_token, targetName)
    let wrongPrefix = 0
    context.on('request', (request) => {
      const url = new URL(request.url())
      if (url.origin === origin && base && !url.pathname.startsWith(base + '/')) wrongPrefix++
    })
    await loginUi(page, fixture.user.username)
    await expect(page.getByRole('heading', { name: '完成第二步驗證', exact: true })).toBeVisible()
    await fillPrivate(
      page.getByLabel('驗證碼', { exact: true }),
      totpCode(pending.secret, Date.now(), 1),
    )
    await page.getByRole('button', { name: '驗證並登入', exact: true }).click()
    await expect(page).toHaveURL(origin + base + '/')
    await page.goto(base + '/targets')
    await page.reload()
    const row = page.locator('tbody tr').filter({ hasText: targetName })
    await expect(row).toHaveCount(1)
    expect(
      (await context.cookies()).some(
        (cookie) =>
          cookie.name === 'rdweb_refresh' &&
          cookie.path === base + '/api/v1/auth' &&
          cookie.secure &&
          cookie.httpOnly &&
          cookie.sameSite === 'Strict',
      ),
    ).toBe(true)
    const popup = context.waitForEvent('page')
    await row.getByRole('link', { name: '連線', exact: true }).click()
    const consolePage = await popup
    await expect(consolePage.getByTestId('console-verified')).toBeVisible({ timeout: 45000 })
    await waitForClock(consolePage)
    await consolePage.getByTestId('console-end').click()
    await expect(consolePage.getByTestId('console-phase')).toHaveText('連線已取消／關閉')
    await consolePage.close()
    expect(wrongPrefix).toBe(0)
    await logoutUi(page)
    expect((await context.cookies()).some((cookie) => cookie.name === 'rdweb_refresh')).toBe(false)
  } finally {
    await fixture.context.dispose()
  }
})

// 稽核來源 IP 為外層 nginx 看到的用戶端；用戶端偽造或非外層來源送來的 X-Forwarded-For 都不被採信。
test('real client ip reaches audit and spoofed forwarding is ignored', async () => {
  const viaOuter = `https://outer${base}/api/v1/auth/login`
  expect(probeLogin(viaOuter, false)).toBe('401')
  expect(probeLogin(viaOuter, true)).toBe('401')
  expect(probeLogin(`http://web:8080${base}/api/v1/auth/login`, true)).toBe('401')
  // 稽核由背景佇列寫入；以條件輪詢等待三筆皆落地後再判定。
  await expect
    .poll(
      () => {
        const sources = failedLoginSources(3)
        return sources.length === 3 && sources.every((source) => probeIp.test(source))
      },
      { timeout: 30000 },
    )
    .toBe(true)
})

// 重啟後資料保留、記憶體內的舊連線 ticket 失效，新 ticket 仍可連線。
test('restart keeps data and invalidates old tickets', async ({ page }) => {
  test.skip(!lifecycle, '生命週期案例只在 /rdweb preserve 執行')
  const name = 'm4-restart-' + randomUUID().slice(0, 8)
  const fixture = await createFixture('admin')
  let targetId = ''
  let oldTicket = ''
  try {
    targetId = (await createTarget(fixture.context, fixture.admin.access_token, name)).id
    oldTicket = (
      await api<{ ticket: string }>(
        fixture.context,
        `targets/${targetId}/connect-ticket`,
        'POST',
        {},
        fixture.admin.access_token,
      )
    ).ticket
  } finally {
    await fixture.context.dispose()
  }
  compose(['restart', 'backend', 'web'])
  compose(['up', '-d', '--wait', '--wait-timeout', '120'])
  expect(await targetNames()).toContain(name)
  await page.goto(base + '/login')
  expect(await tryTicket(page, targetId, oldTicket)).toBe('rejected')
  const fresh = await createFixture('admin')
  try {
    const ticket = await api<{ ticket: string }>(
      fresh.context,
      `targets/${targetId}/connect-ticket`,
      'POST',
      {},
      fresh.admin.access_token,
    )
    expect(await tryTicket(page, targetId, ticket.ticket)).toBe('open')
  } finally {
    await fresh.context.dispose()
  }
})

// 以正式腳本線上備份、新增資料、還原後回到備份時的內容。
test('backup and restore round trip', async () => {
  test.skip(!lifecycle, '生命週期案例只在 /rdweb preserve 執行')
  const suffix = randomUUID().slice(0, 8)
  const fixture = await createFixture('admin')
  let snapshot = ''
  try {
    await createTarget(fixture.context, fixture.admin.access_token, 'm4-before-' + suffix)
    snapshot = backupNow()
    await createTarget(fixture.context, fixture.admin.access_token, 'm4-after-' + suffix)
  } finally {
    await fixture.context.dispose()
  }
  opsScript('restore.sh', ['--yes', snapshot])
  const names = await targetNames()
  expect(names).toContain('m4-before-' + suffix)
  expect(names).not.toContain('m4-after-' + suffix)
})

// 映像與容器環境不含秘密值、不帶秘密類檔案，且兩個服務都以非 root 執行。
test('images carry no secrets', () => {
  test.skip(!lifecycle, '生命週期案例只在 /rdweb preserve 執行')
  const secrets = ['secret_key', 'vault_key', 'bootstrap_admin_password'].map((name) =>
    execFileSync('sudo', ['-n', 'cat', join(work, 'secrets', name)], { encoding: 'utf8' }).trim(),
  )
  const leaks = (text: string) => secrets.some((secret) => text.includes(secret))
  for (const [service, image, dirs] of [
    ['backend', 'rdweb-backend:local', ['/app']],
    ['web', 'rdweb-web:local', ['/usr/share/nginx/html', '/etc/rdweb']],
  ] as const) {
    const container = compose(['ps', '-q', service])
    expect(
      leaks(
        execFileSync('docker', ['inspect', '--format', '{{json .Config.Env}}', container], {
          encoding: 'utf8',
        }),
      ),
    ).toBe(false)
    expect(
      leaks(
        execFileSync('docker', ['image', 'inspect', '--format', '{{json .Config.Env}}', image], {
          encoding: 'utf8',
        }),
      ),
    ).toBe(false)
    expect(
      leaks(
        execFileSync('docker', ['history', '--no-trunc', '--format', '{{.CreatedBy}}', image], {
          encoding: 'utf8',
        }),
      ),
    ).toBe(false)
    const found = execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--entrypoint',
        'find',
        image,
        ...dirs,
        '(',
        '-name',
        '.env',
        '-o',
        '-name',
        '*.pem',
        '-o',
        '-name',
        '*.pfx',
        '-o',
        '-name',
        '*.key',
        '-o',
        '-name',
        'id_ed25519*',
        ')',
        '-print',
      ],
      { encoding: 'utf8' },
    )
    expect(found.trim()).toBe('')
    expect(compose(['exec', '-T', service, 'id', '-u'])).not.toBe('0')
  }
})
