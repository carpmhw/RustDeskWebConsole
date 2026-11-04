import { expect, it, vi } from 'vitest'
import { HttpClient, HttpError } from './client'
import { AuthSession } from './session'

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  username: 'public-test-user',
  role: 'admin',
  totp_enabled: false,
  mfa_enrollment_required: false,
}
const grant = {
  access_token: 'public.access.token',
  csrf_token: 'a'.repeat(43),
  expires_in: 900,
  user,
}

// 同時恢復只可一組 csrf／refresh，公開狀態不含 access 或 csrf。
it('restores once and exposes no credentials in state', async () => {
  const client = new HttpClient()
  vi.spyOn(client, 'send').mockImplementation(async (path) =>
    path.endsWith('/csrf') ? { csrf_token: 'a'.repeat(43) } : grant,
  )
  const session = new AuthSession(client)
  await Promise.all([session.restore(), session.restore(), session.restore()])
  expect(session.state.phase).toBe('authenticated')
  expect(client.send).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(session.state).includes('access_token')).toBe(false)
  expect(JSON.stringify(session.state).includes('csrf_token')).toBe(false)
})

// 已登出後的舊restore不能把登入重新寫回RAM。
it('ignores stale restoration after logout', async () => {
  const client = new HttpClient()
  let finish!: (value: unknown) => void
  const delayed = new Promise((resolve) => {
    finish = resolve
  })
  vi.spyOn(client, 'send').mockImplementation(async (path) =>
    path.endsWith('/csrf')
      ? { csrf_token: 'a'.repeat(43) }
      : path.endsWith('/refresh')
        ? delayed
        : undefined,
  )
  const session = new AuthSession(client)
  const restoring = session.restore()
  await vi.waitFor(() => expect(client.send).toHaveBeenCalledTimes(2))
  await session.logout()
  finish(grant)
  await restoring
  expect(session.state.phase).toBe('anonymous')
})

// MFA新票證只在私有RAM替換，錯誤code不進行refresh。
it('uses the replacement MFA challenge without exposing it', async () => {
  const client = new HttpClient()
  const spy = vi.spyOn(client, 'send')
  spy.mockResolvedValueOnce({ mfa_required: true, mfa_token: 'a'.repeat(43) })
  const session = new AuthSession(client)
  await session.login('fixture', 'public-fixture-password')
  spy.mockRejectedValueOnce(new HttpError('invalid_mfa', 401, 'b'.repeat(43)))
  await expect(session.verifyMfa('123456')).rejects.toThrow('invalid_mfa')
  spy.mockResolvedValueOnce(grant)
  await session.verifyMfa('654321')
  const body = spy.mock.calls[2]?.[2] as { mfa_token: string }
  expect(body.mfa_token === 'b'.repeat(43)).toBe(true)
  expect(session.state.phase).toBe('authenticated')
  expect(spy.mock.calls.some(([path]) => path.endsWith('/refresh'))).toBe(false)
})

// 二次驗證錯誤不能自動重試，也不能誤認成access過期。
it('does not refresh sensitive credential failures', async () => {
  const client = new HttpClient()
  const spy = vi.spyOn(client, 'send').mockResolvedValueOnce(grant)
  const session = new AuthSession(client)
  await session.login('fixture', 'public-fixture-password')
  spy.mockRejectedValueOnce(new HttpError('invalid_credentials', 401))
  await expect(session.enroll('incorrect-fixture-password')).rejects.toThrow('invalid_credentials')
  expect(spy).toHaveBeenCalledTimes(2)
  expect(session.state.phase).toBe('authenticated')
})

// 遠端撤銷失敗仍清RAM，並禁止自動restore誤報登出成功。
it('keeps an anonymous state after failed remote logout', async () => {
  const client = new HttpClient()
  const spy = vi.spyOn(client, 'send').mockResolvedValueOnce(grant)
  const session = new AuthSession(client)
  await session.login('fixture', 'public-fixture-password')
  spy.mockRejectedValueOnce(new HttpError('network_error', 0))
  await expect(session.logout()).rejects.toThrow('logout_failed')
  await session.restore()
  expect(session.state.phase).toBe('anonymous')
  expect(spy).toHaveBeenCalledTimes(2)
})

// 登出後抵達的舊authorized回應也不得交給呼叫者，避免跨身分敏感資料回寫。
it('rejects an authorized response arriving after logout', async () => {
  const client = new HttpClient()
  const spy = vi.spyOn(client, 'send').mockResolvedValueOnce(grant)
  const session = new AuthSession(client)
  await session.login('fixture', 'public-fixture-password')
  let finish!: (value: unknown) => void
  spy.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = session.request('api/v1/auth/me')
  spy.mockRejectedValueOnce(new HttpError('unauthorized', 401))
  await session.logout()
  finish({ value: 'public-fixture' })
  await expect(pending).rejects.toThrow('cancelled')
})

// restore期間收到其它分頁換session訊號，要在舊promise結束後重新恢復，不能停在unknown。
it('restarts restoration after a cross-tab session change', async () => {
  class Channel {
    static active: Channel
    onmessage: ((event: { data: unknown }) => void | Promise<void>) | null = null
    // 捕捉測試通道，訊息沒有憑證資料。
    constructor() {
      Channel.active = this
    }
    // 此案例只測接收，不把訊息送到真實通道。
    postMessage(): void {}
    // 測試沒有資源需要釋放。
    close(): void {}
  }
  vi.stubGlobal('window', {})
  vi.stubGlobal('BroadcastChannel', Channel)
  let session: AuthSession | undefined
  try {
    const client = new HttpClient('')
    let finish!: (value: unknown) => void
    let refreshes = 0
    const delayed = new Promise((resolve) => {
      finish = resolve
    })
    const spy = vi.spyOn(client, 'send').mockImplementation(async (path) => {
      if (path.endsWith('/csrf')) return { csrf_token: 'a'.repeat(43) }
      return ++refreshes === 1 ? delayed : grant
    })
    session = new AuthSession(client, async (operation) => operation())
    const restoring = session.restore()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    const changed = Channel.active.onmessage?.({ data: 'changed' })
    finish(grant)
    await restoring
    await changed
    expect(session.state.phase).toBe('authenticated')
    expect(spy).toHaveBeenCalledTimes(4)
  } finally {
    session?.dispose()
    vi.unstubAllGlobals()
  }
})

// 所有會改cookie的認證操作必須共享協調鎖，避免refresh覆寫較新的登入／MFA cookie。
it('coordinates every cookie-changing authentication operation', async () => {
  let locked = false
  // 注入可觀察鎖，確認沒有重入或漏掉認證cookie寫入。
  const exclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
    expect(locked).toBe(false)
    locked = true
    try {
      return await operation()
    } finally {
      locked = false
    }
  }
  const client = new HttpClient()
  vi.spyOn(client, 'send').mockImplementation(async (path) => {
    expect(locked).toBe(true)
    if (path.endsWith('/login')) return { mfa_required: true, mfa_token: 'a'.repeat(43) }
    if (path.endsWith('/confirm'))
      return {
        ...grant,
        recovery_codes: Array.from({ length: 10 }, (_, index) =>
          index.toString(16).padStart(32, '0'),
        ),
      }
    if (path.endsWith('/disable')) return { reauthentication_required: true }
    return grant
  })
  const session = new AuthSession(client, exclusive)
  await session.login('fixture', 'public-fixture-password')
  await session.verifyMfa('123456')
  await session.confirm('654321')
  await session.disable({ password: 'public-fixture-password' })
  expect(session.state.phase).toBe('anonymous')
})

// 伺服器flags若成為字串不得用truthiness產生完整登入狀態。
it('rejects malformed MFA flags in a session grant', async () => {
  const client = new HttpClient()
  vi.spyOn(client, 'send').mockResolvedValue({
    ...grant,
    user: { ...user, mfa_enrollment_required: 'false' },
  })
  const session = new AuthSession(client)
  await expect(session.login('fixture', 'public-fixture-password')).rejects.toThrow(
    'service_unavailable',
  )
  expect(session.state.phase === 'authenticated').toBe(false)
})

// 失效access最多rotate與重試一次，不能無限重試敏感request。
it('retries an unauthorized request only once', async () => {
  const client = new HttpClient()
  const spy = vi.spyOn(client, 'send')
  spy.mockResolvedValueOnce(grant)
  const session = new AuthSession(client)
  await session.login('fixture', 'public-fixture-password')
  spy.mockRejectedValueOnce(new HttpError('unauthorized', 401))
  spy.mockResolvedValueOnce({ csrf_token: 'a'.repeat(43) })
  spy.mockResolvedValueOnce(grant)
  spy.mockRejectedValueOnce(new HttpError('unauthorized', 401))
  await expect(session.request('api/v1/auth/me')).rejects.toThrow('unauthorized')
  expect(spy).toHaveBeenCalledTimes(5)
})
