import { request, type APIRequestContext, type Page, type Response } from '@playwright/test'
import { test, expect } from './reconnect-fixtures'
import { resetStack, password, base, api } from '../management/helpers/fixtures'
import { randomUUID } from 'node:crypto'
import { closeCodes, installCloseCodeDiagnostics } from './close-code-diagnostics'
import { createReconnectSecurityProbe } from './reconnect-security-probe'
import { prepareOfficialTarget, openOfficialConsole, observeConsole } from './fixtures'
import { prepareLinuxInputTarget, waitForInputVideo } from './input-fixtures'
import type { ReconnectProxy } from './reconnect-proxy-types'

// 八案各自隔離backend資料與quota；不降低正式限制或重置同案中的auth／KV。
test.beforeEach(() => resetStack())

// 純auth安全案不建立target／observer，也不先做其他正式login。
async function authContext(): Promise<APIRequestContext> {
  if (!process.env.RDWEB_E2E_USERNAME || password.length < 12)
    throw new Error('reconnect_security_runtime_unavailable')
  return request.newContext()
}

// 以worker累積值的差量隔離純auth案，不用假UUID beginCase或混入前案ticket。
function counters(proxy: ReconnectProxy) {
  const value = proxy.summary()
  return {
    accepted: value.accepted,
    tickets: value.routes.ticket.requested,
    login: value.routes.login.requested,
    refresh: value.routes.refresh.requested,
    logout: value.routes.logout.requested,
  }
}

// 只列本案安全scalar，不展開response／cookie／context或任何credential。
function record(name: string, proxy: ReconnectProxy, before: ReturnType<typeof counters>): void {
  const after = counters(proxy)
  console.info(
    JSON.stringify({
      event: 'reconnect_security',
      utc: new Date().toISOString(),
      case: name,
      base,
      platform: 'linux',
      mode: process.env.PREFIX_MODE,
      counts: {
        accepted: after.accepted - before.accepted,
        tickets: after.tickets - before.tickets,
        login: after.login - before.login,
        refresh: after.refresh - before.refresh,
        logout: after.logout - before.logout,
      },
    }),
  )
}

// 真80 origin登入與cookie／refresh，僅assert固定status及cookie布林，不讀回cookie值。
test('public origin login refresh cookie', async ({ reconnectProxy }) => {
  const before = counters(reconnectProxy),
    context = await authContext()
  const probe = createReconnectSecurityProbe(context, { base: base as '' | '/rdweb' | '/a/b/c' })
  try {
    expect(await probe.login(process.env.RDWEB_E2E_USERNAME!, password)).toEqual({
      status: 200,
      code: 'none',
    })
    expect(await probe.cookiePolicy()).toEqual({
      present: true,
      httpOnly: true,
      sameSiteStrict: true,
      pathMatches: true,
    })
    expect(await probe.refresh()).toEqual({ status: 200, code: 'none' })
    expect(await probe.cookiePolicy()).toEqual({
      present: true,
      httpOnly: true,
      sameSiteStrict: true,
      pathMatches: true,
    })
    record('public_origin', reconnectProxy, before)
  } finally {
    probe.close()
    await context.dispose()
  }
})

// 本案真ticket先201，錯Origin mutation及WS仍403；不接RustDesk或用無效ticket冒充Origin拒絕。
test('wrong origin denied', async ({ reconnectCase, reconnectProxy }) => {
  const before = counters(reconnectProxy)
  const fixture = await prepareOfficialTarget('tcp')
  const lease = reconnectCase.begin(fixture.targetId)
  const probe = createReconnectSecurityProbe(fixture.context, {
    base: base as '' | '/rdweb' | '/a/b/c',
  })
  try {
    expect(await probe.login(fixture.username, password)).toEqual({ status: 200, code: 'none' })
    expect(await probe.refresh('wrong-origin')).toEqual({ status: 403, code: 'invalid_origin' })
    expect(await probe.wrongOriginUpgrade(fixture.targetId)).toEqual({
      status: 403,
      code: 'invalid_origin',
    })
    expect(lease.summary().accepted).toBe(0)
    expect(lease.summary().routes.ticket).toMatchObject({ requested: 1, succeeded: 1, limited: 0 })
    record('wrong_origin', reconnectProxy, before)
  } finally {
    probe.close()
    await fixture.context.dispose()
  }
})

// 有正式cookie但沒有CSRF仍必須拒絕；其後正常refresh成功，避免把缺cookie誤認CSRF驗收。
test('missing csrf denied', async ({ reconnectProxy }) => {
  const before = counters(reconnectProxy),
    context = await authContext()
  const probe = createReconnectSecurityProbe(context, { base: base as '' | '/rdweb' | '/a/b/c' })
  try {
    expect(await probe.login(process.env.RDWEB_E2E_USERNAME!, password)).toEqual({
      status: 200,
      code: 'none',
    })
    expect((await probe.cookiePolicy()).present).toBe(true)
    expect(await probe.refresh('missing-csrf')).toEqual({ status: 403, code: 'invalid_csrf' })
    expect(await probe.refresh()).toEqual({ status: 200, code: 'none' })
    record('missing_csrf', reconnectProxy, before)
  } finally {
    probe.close()
    await context.dispose()
  }
})

// 只有此案真串流與一次cut；第二tab沿真正UI handler登出，console維持可見排除hidden捷徑。
test('logout stops pending retry', async ({ page, browser, reconnectCase, reconnectProxy }) => {
  const before = counters(reconnectProxy),
    resources = observeConsole(page.context())
  const fixture = await prepareLinuxInputTarget('tcp')
  const lease = reconnectCase.begin(fixture.targetId),
    abort = new AbortController()
  const accepted = lease.nextAccepted(abort.signal)
  void accepted.catch(/* finally取消時不留下unhandled waiter。 */ () => {})
  let remote: Awaited<ReturnType<typeof openOfficialConsole>> | undefined
  let canvas: Awaited<ReturnType<ReturnType<typeof page.getByTestId>['elementHandle']>> | null =
    null
  try {
    remote = await openOfficialConsole(page, fixture)
    const handle = await accepted
    await waitForInputVideo(remote, fixture)
    expect(
      await remote.evaluate(
        /* 不以hidden自動停止當logout證據。 */ () => document.visibilityState === 'visible',
      ),
    ).toBe(true)
    canvas = await remote.getByTestId('console-canvas').elementHandle()
    expect(!!canvas).toBe(true)
    lease.interrupt(handle)
    console.info(
      JSON.stringify({
        event: 'reconnect_security_cut',
        case: 'logout',
        cuts: 1,
        utc: new Date().toISOString(),
        browser: browser.version(),
      }),
    )
    await expect(remote.getByTestId('console-reconnect')).toBeVisible({ timeout: 1000 })
    const completed = page.waitForResponse(
      /* 只匹配固定路徑，不把request原物件寫report。 */ (response) =>
        new URL(response.url()).pathname === base + '/api/v1/auth/logout',
    )
    // 在既有登入父tab執行真UI handler，不切換前景，不從測試端注入auth／BroadcastChannel。
    await page
      .getByTestId('logout')
      .evaluate(
        /* HTMLElement.click仍走AppHeader的正式logout。 */ (node) =>
          (node as HTMLButtonElement).click(),
      )
    const response = await completed
    expect(response.status()).toBe(204)
    await response.finished()
    await expect(remote).toHaveURL(new RegExp(base + '/login$'))
    expect(
      await remote.evaluate(
        /* 登出後仍可見，因果不能只剩visibility取消。 */ () =>
          document.visibilityState === 'visible',
      ),
    ).toBe(true)
    expect(
      await canvas!.evaluate(
        /* 已卸載canvas只驗原renderer清零布林，不回像素。 */ (node) => {
          const surface = node as HTMLCanvasElement
          return surface
            .getContext('2d')!
            .getImageData(0, 0, surface.width, surface.height)
            .data.every(/* 只認透明黑。 */ (byte) => byte === 0)
        },
      ),
    ).toBe(true)
    await expect
      .poll(/* 必須收到原Worker的native close。 */ () => resources.closed)
      .toBe(resources.opened)
    expect(resources.opened).toBe(1)
    const deadline = performance.now() + 10500
    do {
      const state = lease.summary()
      expect({
        accepted: state.accepted,
        tickets: state.routes.ticket.requested,
        metadata: state.routes.target.requested,
        workers: resources.opened,
      }).toEqual({ accepted: 1, tickets: 1, metadata: 1, workers: 1 })
      await remote.waitForTimeout(Math.min(100, Math.max(1, deadline - performance.now())))
    } while (performance.now() < deadline)
    expect(resources.wrongPrefix).toBe(0)
    record('logout', reconnectProxy, before)
  } finally {
    abort.abort()
    try {
      await canvas?.dispose()
    } finally {
      try {
        if (remote && !remote.isClosed()) await remote.close()
      } finally {
        await fixture.context.dispose()
      }
    }
  }
})

// 以正式UI連線耗用login-assist每分鐘5次額度，第5次串流後切斷；自動重試第6次收到真429即須停止，不再排程。
test('retry rate limit stops reconnect', async ({
  page,
  browser,
  reconnectCase,
  reconnectProxy,
}) => {
  const before = counters(reconnectProxy),
    resources = observeConsole(page.context())
  const fixture = await prepareLinuxInputTarget('tcp')
  const lease = reconnectCase.begin(fixture.targetId),
    abort = new AbortController()
  let limited = 0
  // 只計login-assist的status，不保存URL、body或credential。
  const response = (value: Response): void => {
    if (value.status() === 429 && new URL(value.url()).pathname.endsWith('/login-assist')) limited++
  }
  page.context().on('response', response)
  let remote: Page | undefined
  let firstAssistAt = 0
  // 父tab已登入後直接點targets連線link，不重複loginUi以免先耗盡登入額度。
  const reopen = async (): Promise<Page> => {
    await page.goto(base + '/targets')
    const popup = page.context().waitForEvent('page')
    await page
      .locator('tbody tr')
      .filter({ hasText: fixture.name })
      .getByRole('link', { name: '連線', exact: true })
      .click()
    const opened = await popup
    await opened.bringToFront()
    return opened
  }
  try {
    for (let cycle = 1; cycle <= 4; cycle++) {
      const consolePage = cycle === 1 ? await openOfficialConsole(page, fixture) : await reopen()
      await expect(consolePage.getByTestId('console-streaming')).toBeVisible({ timeout: 45000 })
      if (cycle === 1) firstAssistAt = performance.now()
      await consolePage.getByTestId('console-end').click()
      await expect(consolePage.getByTestId('console-phase')).toHaveText('連線已取消／關閉')
      await consolePage.close()
    }
    expect(lease.summary().routes.assist.requested).toBe(4)
    const accepted = lease.nextAccepted(abort.signal)
    void accepted.catch(/* finally取消時不留下unhandled waiter。 */ () => {})
    remote = await reopen()
    const handle = await accepted
    await waitForInputVideo(remote, fixture)
    expect(lease.summary().routes.assist.requested).toBe(5)
    // 額度視窗60秒；超過50秒就無法證明第6次落在同視窗，固定失敗而非重試。
    if (performance.now() - firstAssistAt > 50000) throw new Error('retry_quota_window_exceeded')
    lease.interrupt(handle)
    console.info(
      JSON.stringify({
        event: 'reconnect_security_cut',
        case: 'retry_rate_limit',
        cuts: 1,
        utc: new Date().toISOString(),
        browser: browser.version(),
      }),
    )
    await expect(remote.locator('[data-error-code="rate_limited"]')).toBeVisible({ timeout: 15000 })
    expect(limited).toBe(1)
    await expect(remote.getByTestId('console-reconnect')).toHaveCount(0)
    await expect.poll(/* 所有Worker都須真正關閉。 */ () => resources.closed).toBe(resources.opened)
    const settled = lease.summary()
    const deadline = performance.now() + 10500
    do {
      const state = lease.summary()
      expect({
        accepted: state.accepted,
        tickets: state.routes.ticket.requested,
        assist: state.routes.assist.requested,
        limited,
      }).toEqual({
        accepted: settled.accepted,
        tickets: settled.routes.ticket.requested,
        assist: 6,
        limited: 1,
      })
      await remote.waitForTimeout(Math.min(100, Math.max(1, deadline - performance.now())))
    } while (performance.now() < deadline)
    expect(resources.wrongPrefix).toBe(0)
    record('retry_rate_limit', reconnectProxy, before)
  } finally {
    abort.abort()
    page.context().off('response', response)
    try {
      if (remote && !remote.isClosed()) await remote.close()
    } finally {
      await fixture.context.dispose()
    }
  }
})

// admin建target後另建operator並明確授予can_connect；回傳以operator身分連線的fixture與admin token。
async function prepareOperatorTarget() {
  const fixture = await prepareLinuxInputTarget('tcp')
  const admin = await api<{ access_token: string }>(fixture.context, 'auth/login', 'POST', {
    username: process.env.RDWEB_E2E_USERNAME,
    password,
  })
  const operator = await api<{ id: string; username: string }>(
    fixture.context,
    'users',
    'POST',
    { username: 'e2e-' + randomUUID().replaceAll('-', ''), password, role: 'operator' },
    admin.access_token,
  )
  await setGrants(fixture, admin.access_token, [
    {
      user_id: operator.id,
      role: null,
      can_connect: true,
      can_view_password: false,
      can_edit: false,
    },
  ])
  return {
    fixture: { ...fixture, username: operator.username },
    token: admin.access_token,
    operator,
  }
}

// 以目前target版本覆寫授權清單；空陣列即撤銷全部明確授權。
async function setGrants(
  fixture: { context: APIRequestContext; targetId: string },
  token: string,
  grants: unknown[],
): Promise<void> {
  const current = await api<{ version: number }>(
    fixture.context,
    `targets/${fixture.targetId}/permissions`,
    'GET',
    undefined,
    token,
  )
  await api(
    fixture.context,
    `targets/${fixture.targetId}/permissions`,
    'PUT',
    { version: current.version, grants },
    token,
  )
}

// operator串流中由admin變更權限；後端須立即以1008關閉，前端顯示access_revoked且不再嘗試重連。
for (const change of ['revoked permission', 'deactivated user'] as const) {
  test(`${change} closes session without reconnect`, async ({
    page,
    reconnectCase,
    reconnectProxy,
  }) => {
    const before = counters(reconnectProxy),
      resources = observeConsole(page.context())
    const { fixture, token, operator } = await prepareOperatorTarget()
    const lease = reconnectCase.begin(fixture.targetId),
      abort = new AbortController()
    const accepted = lease.nextAccepted(abort.signal)
    void accepted.catch(/* finally取消時不留下unhandled waiter。 */ () => {})
    let remote: Page | undefined
    try {
      await installCloseCodeDiagnostics(page.context())
      remote = await openOfficialConsole(page, fixture)
      await accepted
      await waitForInputVideo(remote, fixture)
      if (change === 'revoked permission') await setGrants(fixture, token, [])
      else await api(fixture.context, `users/${operator.id}`, 'PATCH', { is_active: false }, token)
      await expect(remote.locator('[data-error-code="access_revoked"]')).toBeVisible({
        timeout: 10000,
      })
      await expect(remote.getByTestId('console-reconnect')).toHaveCount(0)
      await expect
        .poll(/* 後端政策關閉須直接觀測為原生1008。 */ () => closeCodes(remote!))
        .toEqual([1008])
      await expect.poll(/* 原Worker真正關閉。 */ () => resources.closed).toBe(resources.opened)
      expect(resources.opened).toBe(1)
      const deadline = performance.now() + 10500
      do {
        const state = lease.summary()
        expect({
          accepted: state.accepted,
          tickets: state.routes.ticket.requested,
          workers: resources.opened,
        }).toEqual({ accepted: 1, tickets: 1, workers: 1 })
        await remote.waitForTimeout(Math.min(100, Math.max(1, deadline - performance.now())))
      } while (performance.now() < deadline)
      expect(resources.wrongPrefix).toBe(0)
      record(
        change === 'revoked permission' ? 'revoked_permission' : 'deactivated_user',
        reconnectProxy,
        before,
      )
    } finally {
      abort.abort()
      try {
        if (remote && !remote.isClosed()) await remote.close()
      } finally {
        await fixture.context.dispose()
      }
    }
  })
}

// 不得createFixture／loginUi預先消耗quota；相同bootstrap帳號／IP第1–5次200，第6次才429。
test('login quota remains enforced', async ({ reconnectProxy }) => {
  const before = counters(reconnectProxy),
    context = await authContext()
  const probe = createReconnectSecurityProbe(context, { base: base as '' | '/rdweb' | '/a/b/c' })
  try {
    for (let attempt = 1; attempt <= 5; attempt++)
      expect(await probe.loginStatus(process.env.RDWEB_E2E_USERNAME!, password)).toEqual({
        status: 200,
        code: 'none',
      })
    expect(await probe.loginStatus(process.env.RDWEB_E2E_USERNAME!, password)).toEqual({
      status: 429,
      code: 'rate_limited',
    })
    const after = counters(reconnectProxy)
    expect({
      login: after.login - before.login,
      tickets: after.tickets - before.tickets,
      accepted: after.accepted - before.accepted,
    }).toEqual({ login: 6, tickets: 0, accepted: 0 })
    record('login_quota', reconnectProxy, before)
  } finally {
    probe.close()
    await context.dispose()
  }
})
