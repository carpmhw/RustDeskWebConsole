import { expect, test } from '@playwright/test'
import { api, base, createFixture, loginUi, origin, password, resetStack } from './helpers/fixtures'

const longTargetName = 'public-development-workspace-'.repeat(4)

// 透過正式API建立公開metadata與明確ACL，不連線受控端，密碼僅留測試程序環境。
async function publicTarget(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<void> {
  const server = await api<{ id: string }>(
    fixture.context,
    'servers',
    'POST',
    {
      name: 'public-development-server-'.repeat(4),
      id_server: 'long-public-development-server.example:21116',
      relay_server: 'long-public-development-relay.example:21117',
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
    {
      name: longTargetName,
      server_id: server.id,
      rustdesk_id: 'public-development-target-123456789',
      group_name: 'development-workspace-'.repeat(2),
      password,
    },
    fixture.admin.access_token,
  )
  const acl = await api<{ version: number }>(
    fixture.context,
    'targets/' + target.id + '/permissions',
    'GET',
    undefined,
    fixture.admin.access_token,
  )
  await api(
    fixture.context,
    'targets/' + target.id + '/permissions',
    'PUT',
    {
      version: acl.version,
      grants: [
        {
          role: 'viewer',
          user_id: null,
          can_connect: false,
          can_view_password: false,
          can_edit: false,
        },
        {
          role: 'operator',
          user_id: null,
          can_connect: true,
          can_view_password: true,
          can_edit: true,
        },
      ],
    },
    fixture.admin.access_token,
  )
}

// 真API案例依原正式安全設定重建隔離DB／KV，不以mock登入代替。
test.beforeEach(() => resetStack())

// 匿名頁仍須能調整顯示，但不得暴露管理導覽；已登入後集中到偏好頁。
test('header keeps anonymous restricted appearance access', async ({ page }) => {
  await page.goto(base + '/login')
  await expect(page.locator('.app-nav')).toHaveCount(0)
  const disclosure = page.getByTestId('appearance-menu')
  await expect(disclosure).toBeVisible()
  await disclosure.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(disclosure.getByLabel('語言')).toBeVisible()
  await disclosure.locator('[data-theme-choice="dark"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const rect = await disclosure.locator('.display-preferences').boundingBox()
    expect(rect).not.toBeNull()
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width)
  }
})

for (const role of ['admin', 'operator', 'viewer'] as const) {
  // 導覽只沿真身分顯示，搬移偏好不得改admin與operator的servers邊界。
  test(`header keeps role gates and centralized preferences: ${role}`, async ({ page }) => {
    const fixture = await createFixture(role)
    try {
      await loginUi(page, fixture.user.username)
      const nav = page.locator('.app-nav')
      await expect(nav.getByRole('link', { name: '目標主機', exact: true })).toBeVisible()
      await expect(nav.getByRole('link', { name: 'RustDesk 伺服器', exact: true })).toHaveCount(
        role === 'admin' ? 1 : 0,
      )
      await expect(page.locator('.header-actions [data-theme-choice]')).toHaveCount(0)
      await nav.getByRole('link', { name: '顯示偏好', exact: true }).click()
      await expect(page.locator('main .display-preferences')).toBeVisible()
      await expect(page.getByLabel('頁面時區')).toHaveCount(1)
      await expect(page.getByLabel('語言')).toHaveCount(1)
      await page.setViewportSize({ width: 1024, height: 900 })
      // 桌面臨界寬度需明確收合，不能把兩行導覽擠成過高header。
      expect(
        await page.locator('.app-header').evaluate((node) => node.getBoundingClientRect().height),
      ).toBeLessThanOrEqual(80)
      const toggle = page.getByTestId('navigation-toggle')
      await expect(toggle).toBeVisible()
      await toggle.click()
      await expect(nav.getByRole('link', { name: '目標主機', exact: true })).toBeVisible()
    } finally {
      await fixture.context.dispose()
    }
  })
}

// 登入表單需具可辨識的語義名稱，不因改版出現管理nav或第二套假登入。
test('anonymous and MFA surfaces have no management navigation', async ({ page }) => {
  await page.goto(base + '/login')
  await expect(page.getByRole('form', { name: '登入主控台', exact: true })).toBeVisible()
  await expect(page.locator('.app-nav')).toHaveCount(0)
  await expect(page.getByTestId('appearance-menu')).toBeVisible()
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    )
    await expect(page.getByRole('button', { name: '登入', exact: true })).toBeVisible()
  }
})

for (const role of ['admin', 'operator', 'viewer'] as const) {
  // 總覽入口由真角色決定，不能用草圖假資料或新統計API取代。
  test(`overview links respect current role: ${role}`, async ({ page }) => {
    const fixture = await createFixture(role)
    try {
      await loginUi(page, fixture.user.username)
      const workspace = page.getByRole('navigation', { name: '工作區', exact: true })
      await expect(workspace).toBeVisible()
      for (const label of ['目標主機', '帳號安全', '顯示偏好'])
        await expect(workspace.getByRole('link', { name: label, exact: true })).toBeVisible()
      await expect(
        workspace.getByRole('link', { name: 'RustDesk 伺服器', exact: true }),
      ).toHaveCount(role === 'admin' ? 1 : 0)
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        ).toBe(false)
      }
      await workspace.getByRole('link', { name: '目標主機', exact: true }).click()
      await expect(page).toHaveURL(origin + base + '/targets')
    } finally {
      await fixture.context.dispose()
    }
  })
}

for (const authenticated of [false, true]) {
  // 404入口仍交給原router guard，匿名不應因此直接進總覽。
  test(`not found returns through the original guard: ${authenticated ? 'authenticated' : 'anonymous'}`, async ({
    page,
  }) => {
    const fixture = authenticated ? await createFixture() : undefined
    try {
      if (fixture) await loginUi(page, fixture.user.username)
      await page.goto(base + '/missing-public-route')
      const home = page.getByRole('link', { name: '返回概覽', exact: true })
      await expect(home).toBeVisible()
      await expect(home).toHaveClass(/primary/)
      await home.click()
      if (authenticated) await expect(page).toHaveURL(origin + base + '/')
      // 匿名返回保留原guard的安全next路由，不要求移除既有query。
      else
        await expect(page).toHaveURL(
          (url) => url.pathname === base + '/login' && url.searchParams.get('next') === 'overview',
        )
    } finally {
      await fixture?.context.dispose()
    }
  })
}

// 長資料與文字200%放大只允許表格內捲動，已啟用不得假裝已探測健康。
test('long management rows keep actions reachable', async ({ page }) => {
  const fixture = await createFixture('admin')
  try {
    await publicTarget(fixture)
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/targets')
    const row = page.locator('tbody tr').filter({ hasText: longTargetName })
    await expect(row).toHaveCount(1)
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
        false,
      )
      await expect(page.locator('.table-scroll')).toHaveCSS('overflow-x', 'auto')
      await row.getByRole('button', { name: '刪除', exact: true }).scrollIntoViewIfNeeded()
      await expect(row.getByRole('button', { name: '刪除', exact: true })).toBeInViewport()
    }
    await page.goto(base + '/preferences')
    await page.getByLabel('語言').selectOption('en')
    await page.goto(base + '/targets')
    await expect(row).toHaveCount(1)
    await page.setViewportSize({ width: 375, height: 900 })
    // 固定讀完原始字級再放大，避免繼承值連乘或保存DOM內容。
    await page.evaluate(() => {
      const sizes = Array.from(
        document.querySelectorAll<HTMLElement>('main, main *'),
        (element) => ({ element, size: parseFloat(getComputedStyle(element).fontSize) }),
      )
      for (const { element, size } of sizes) element.style.fontSize = size * 2 + 'px'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    )
    await row.getByRole('link', { name: 'Connect', exact: true }).scrollIntoViewIfNeeded()
    await expect(row.getByRole('link', { name: 'Connect', exact: true })).toBeInViewport()
    await page.goto(base + '/servers')
    const saved = page.locator('tbody tr').filter({ hasText: 'public-development-server-' })
    await expect(saved.locator('.status-pill--neutral')).toHaveText('Enabled')
    await expect(page.getByTestId('probe-result')).toHaveCount(0)
  } finally {
    await fixture.context.dispose()
  }
})

for (const role of ['admin', 'operator', 'viewer'] as const) {
  // ACL與role ceiling必須保留；主要連線、敏感reveal與危險刪除仍各自可辨識。
  test(`danger actions remain distinct from primary connect: ${role}`, async ({ page }) => {
    const fixture = await createFixture(role)
    try {
      await publicTarget(fixture)
      await loginUi(page, fixture.user.username)
      await page.goto(base + '/targets')
      const row = page.locator('tbody tr').filter({ hasText: longTargetName })
      await expect(row).toHaveCount(1)
      const allowed = role !== 'viewer'
      const connect = row.getByRole('link', { name: '連線', exact: true })
      await expect(connect).toHaveCount(allowed ? 1 : 0)
      await expect(row.getByRole('button', { name: '顯示密碼', exact: true })).toHaveCount(
        allowed ? 1 : 0,
      )
      await expect(row.getByRole('button', { name: '目標權限', exact: true })).toHaveCount(
        role === 'admin' ? 1 : 0,
      )
      const remove = row.getByRole('button', { name: '刪除', exact: true })
      await expect(remove).toHaveCount(allowed ? 1 : 0)
      if (allowed) {
        await expect(connect).toHaveClass(/primary/)
        await expect(connect).toHaveAttribute('target', '_blank')
        await expect(connect).toHaveAttribute('rel', 'noopener noreferrer')
        expect(new URL((await connect.getAttribute('href')) ?? '', page.url()).search).toBe('')
        await expect(remove).toHaveClass(/danger/)
        await expect(page.getByRole('button', { name: '刪除所選', exact: true })).toBeDisabled()
      }
    } finally {
      await fixture.context.dispose()
    }
  })
}

// 尚未啟用MFA不能用成功綠色或勾選圖示誤導已受保護。
test('security state distinguishes disabled protection from success', async ({ page }) => {
  const fixture = await createFixture()
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/security')
    await expect(page.locator('.page-intro .status-pill')).toHaveText('尚未啟用')
    await expect(page.locator('.page-intro .status-pill')).toHaveClass(/warning/)
  } finally {
    await fixture.context.dispose()
  }
})

// 使用原有非法UUID拒絕路徑驗真正App／Console布局收尾，不建立RustDesk attempt或成功捷徑。
test('console chrome restores navigation without a remote attempt', async ({ page }) => {
  const fixture = await createFixture()
  let attempts = 0
  let workers = 0
  // 任何WS均先攔截，這個管理UI案例不得建立真串流。
  await page.routeWebSocket('**', (socket) => {
    attempts++
    socket.close()
  })
  // 只允許登入與列表頁既有metadata；detail／ticket／assist等都拒絕並只記計數。
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (
      path.includes('/api/v1/auth/') ||
      path.endsWith('/api/v1/health') ||
      path.endsWith('/api/v1/targets') ||
      path.endsWith('/api/v1/servers/available')
    )
      await route.continue()
    else {
      attempts++
      await route.abort()
    }
  })
  // constructor不應先啟Worker，僅留安全個數。
  page.on('worker', () => {
    workers++
  })
  try {
    await loginUi(page, fixture.user.username)
    await page.goto(base + '/console/not-a-uuid')
    await expect(page.locator('[data-error-code="connection_failed"]')).toBeVisible()
    await expect(page.getByTestId('console-streaming')).toHaveCount(0)
    await expect(page.getByTestId('console-clipboard-send')).toBeDisabled()
    await expect(page.getByTestId('console-clipboard-copy')).toBeDisabled()
    // 僅檢查原本存在但未開啟的空dialog外觀／名稱，不啟動clipboard操作。
    await expect(page.getByTestId('console-clipboard-dialog')).toHaveCSS('border-radius', '14px')
    await expect(page.getByTestId('console-clipboard-dialog')).toHaveAttribute(
      'aria-label',
      '傳送本機文字',
    )
    const canvas = (await page.getByTestId('console-canvas').elementHandle())!
    await page.getByTestId('console-focus-mode').click()
    await expect(page.locator('.app-header')).not.toBeVisible()
    expect(
      await canvas.evaluate(
        (node) => node === document.querySelector('[data-testid="console-canvas"]'),
      ),
    ).toBe(true)
    await expect(page.getByTestId('console-end')).toBeVisible()
    await page.getByRole('link', { name: '目標主機', exact: true }).click()
    await expect(page).toHaveURL(origin + base + '/targets')
    await expect(page.locator('.app-header')).toBeVisible()
    expect(attempts).toBe(0)
    expect(workers).toBe(0)
  } finally {
    await fixture.context.dispose()
  }
})
