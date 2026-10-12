import { expect, it, vi } from 'vitest'
import {
  ConsoleSession,
  sameIdentity,
  type SessionAuth,
  type AuthIdentity,
} from './console-session'
import { AttemptLifecycle } from './attempt-lifecycle'
import { HttpError } from '../api/client'
import type { AuthPhase, SessionUser } from '../api/types'
import type { TargetRow } from '../api/management'
import type { RetryState, Terminal } from './interaction-types'
const id = '00000000-0000-0000-0000-000000000001'
const user: SessionUser = {
  id: '00000000-0000-0000-0000-000000000002',
  username: 'public-test',
  role: 'operator',
  totp_enabled: true,
  mfa_enrollment_required: false,
}
const row: TargetRow = {
  id,
  server_id: '00000000-0000-0000-0000-000000000003',
  name: 'public target',
  rustdesk_id: '123456789',
  group_name: null,
  tags: [],
  notes: null,
  created_by: user.id,
  has_password: true,
  permissions: { can_connect: true, can_edit: false, can_view_password: false },
  version: 1,
  created_at: '2026-10-11T00:00:00Z',
  updated_at: '2026-10-11T00:00:00Z',
}
// 控制 promise 的 producer 不取任何真正登入或票證。
function pending<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(
    /* 收集受控 producer。 */ (r) => {
      resolve = r
    },
  )
  return { promise, resolve }
}
// 清掉 controlled ports 的有限 microtask 反應，不冒充真WS時序。
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
// 純單元 Main auth port，泛型轉型只在這個受控資料邊界。
class Auth implements SessionAuth {
  phase: AuthPhase = 'authenticated'
  user: SessionUser | null = { ...user }
  requests: Array<{ path: string; signal?: AbortSignal }> = []
  // 回原始 API DTO shape，auth/me不是user wrapper。
  respond = async (path: string): Promise<unknown> =>
    path.endsWith('/auth/me') ? { ...this.user } : { ...row, permissions: { ...row.permissions } }
  // 只觀測安全path與取消signal，不記任何HTTP headers／body或credentials。
  request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    expect(method).toBe('GET')
    expect(body).toBeUndefined()
    expect(signal?.aborted).toBe(false)
    this.requests.push({ path, signal })
    return this.respond(path).then(/* 固定測試DTO由各案明確控制。 */ (value) => value as T)
  }
}
// Host port 重用真純 lifecycle 模組，唯有開WS／登入互通才留待後面整合驗收。
function fixture() {
  let now = 0,
    sequence = 0
  const auth = new Auth(),
    states: RetryState[] = [],
    lives: AttemptLifecycle[] = [],
    cleanup = vi.fn()
  const host = {
    // 每次傳入的資料只能是saved target／peer，不是任意endpoint。
    open: vi.fn((target: string, peer: string, signal?: AbortSignal) => {
      expect(target).toBe(id)
      expect(peer).toBe(row.rustdesk_id)
      const life = new AttemptLifecycle(++sequence, cleanup)
      // signal只取消這一個handle，不能disposal新的host session。
      const abort = (): void => life.handle.cancel()
      signal?.addEventListener('abort', abort, { once: true })
      // 終態移除本輪listener，避免舊handle持有新的session。
      void life.handle.finished.then(() => signal?.removeEventListener('abort', abort))
      lives.push(life)
      life.prepared()
      return life.handle
    }),
    // fake資源亦採當次handle收尾，不把label當native已回收。
    dispose: vi.fn(() => lives.at(-1)?.handle.cancel()),
  }
  const c = new ConsoleSession(
    auth,
    host,
    /* 只收安全retry摘要。 */ (s) => states.push(s),
    /* 正式clock在Task12注入。 */ () => now,
  )
  return {
    c,
    auth,
    host,
    lives,
    states,
    cleanup,
    time: /* tick由唯一owner呼叫。 */ async (n: number) => {
      now = n
      c.tick()
      await flush()
    },
    clock: /* 模擬未執行ticker的背景經過時間。 */ (n: number) => {
      now = n
    },
    end: /* 模擬真正固定來源終態，不看generic錯誤字串。 */ async (
      index: number,
      terminal: Terminal = { cause: 'network', code: 'connection_failed' },
    ) => {
      lives[index]!.finish(terminal)
      await flush()
    },
  }
}
// 同一actor正常refresh的DTO新引用不是身份切換，phase／role／MFA真變才停。
it('compares only the approved identity tuple', () => {
  const a: AuthIdentity = { phase: 'authenticated', id: user.id, role: 'operator', mfa: false }
  expect(sameIdentity(a, { ...a })).toBe(true)
  for (const patch of [{ phase: 'anonymous' }, { id: 'other' }, { role: 'admin' }, { mfa: true }])
    expect(sameIdentity(a, { ...a, ...patch })).toBe(false)
})
// 每個自動attempt重取metadata／me，fresh revision及signal不能沿用。
it('revalidates metadata and actor on every fresh attempt', async () => {
  const f = fixture()
  f.c.start(id)
  await flush()
  expect(f.host.open).toHaveBeenCalledOnce()
  expect(f.auth.requests.map(/* 只檢查相對API path。 */ (r) => r.path)).toEqual([
    `api/v1/targets/${id}`,
    'api/v1/auth/me',
  ])
  expect(f.c.targetName).toBe('public target')
  f.c.phase(f.lives[0]!.handle.revision, 'streaming')
  f.c.activity(f.lives[0]!.handle.revision)
  await f.end(0)
  await f.time(2000)
  expect(f.host.open).toHaveBeenCalledTimes(2)
  expect(f.auth.requests).toHaveLength(4)
  expect(f.lives[1]!.handle.revision).not.toBe(f.lives[0]!.handle.revision)
  expect(f.auth.requests[2]!.signal).not.toBe(f.auth.requests[0]!.signal)
  f.c.dispose()
})
// 最新角色／MFA／can_connect與viewer硬上限都會阻止open，即使先前localgrant為true。
it('fails closed for revoked grants, viewer role and authoritative actor changes', async () => {
  for (const mode of [
    'grant',
    'viewer',
    'mfa',
    'role',
    'actor',
    'malformed-grant',
    'wrong-target',
  ] as const) {
    const f = fixture()
    if (mode === 'viewer') f.auth.user = { ...user, role: 'viewer' }
    // 只有受控單元DTO，沒有測試模式加入正式AuthSession。
    f.auth.respond = async (path) => {
      if (path.endsWith('/auth/me'))
        return {
          ...user,
          ...(mode === 'mfa' ? { mfa_enrollment_required: true } : {}),
          ...(mode === 'role' ? { role: 'admin' } : {}),
          ...(mode === 'actor' ? { id: 'different-public-actor' } : {}),
        }
      return {
        ...row,
        id: mode === 'wrong-target' ? user.id : id,
        permissions: {
          ...row.permissions,
          can_connect: mode === 'grant' ? false : mode === 'malformed-grant' ? 'false' : true,
        },
      }
    }
    f.c.start(id)
    await flush()
    expect(f.auth.requests.length).toBeGreaterThan(0)
    expect(f.host.open).not.toHaveBeenCalled()
    expect(f.states.at(-1)?.phase).toBe('exhausted')
    f.c.dispose()
  }
})
// Cancel先作廢outer epoch，late target或me授權不能復活WS。
it('ignores late grants during both metadata and me requests', async () => {
  for (const stage of ['target', 'me'] as const) {
    const f = fixture(),
      p = pending<unknown>()
    // 只延後原正式shape回覆；不建假WebSocket。
    f.auth.respond = async (path) =>
      stage === 'target' || path.endsWith('/auth/me') ? p.promise : { ...row }
    f.c.start(id)
    await flush()
    expect(f.auth.requests).toHaveLength(stage === 'target' ? 1 : 2)
    f.c.cancel()
    p.resolve(stage === 'target' ? { ...row } : { ...user })
    await flush()
    expect(f.host.open).not.toHaveBeenCalled()
    f.c.dispose()
  }
})
// refresh同tuple不關長連線，真正identity變動則整個outer owner取消。
it('keeps same-actor refresh alive and stops on actual auth changes', async () => {
  const f = fixture()
  f.c.start(id)
  await flush()
  expect(f.host.open).toHaveBeenCalledOnce()
  f.auth.user = { ...user }
  f.c.authChanged({ phase: 'authenticated', id: user.id, role: 'operator', mfa: false })
  expect(f.auth.requests[0]!.signal?.aborted).toBe(false)
  f.c.authChanged({ phase: 'authenticated', id: user.id, role: 'admin', mfa: false })
  expect(f.auth.requests[0]!.signal?.aborted).toBe(true)
  await f.time(999999)
  expect(f.host.open).toHaveBeenCalledOnce()
  f.c.dispose()
})
// stable健康依已驗activity，static畫面不用每秒新frame；oldrevision不延長健康。
it('uses only current activity for stability and ignores old phases', async () => {
  const f = fixture()
  f.c.start(id)
  await flush()
  expect(f.host.open).toHaveBeenCalledOnce()
  const first = f.lives[0]!.handle.revision
  f.c.phase(first, 'streaming')
  await f.end(0)
  await f.time(2000)
  expect(f.host.open).toHaveBeenCalledTimes(2)
  const current = f.lives[1]!.handle.revision
  f.c.phase(first, 'streaming')
  f.c.activity(first)
  expect(f.states.at(-1)?.phase).toBe('connecting')
  f.c.phase(current, 'streaming')
  f.clock(62000)
  f.c.activity(first)
  f.c.tick()
  expect(f.states.at(-1)?.attempt).toBe(1)
  f.c.activity(current)
  f.c.tick()
  expect(f.states.at(-1)?.attempt).toBe(0)
  f.c.dispose()
})
// 429及未知本機fault沒有retry，HTTP分類只讀HttpError安全欄位。
it('stops a retry on typed HTTP rate limiting and never opens another attempt', async () => {
  const f = fixture()
  f.c.start(id)
  await flush()
  expect(f.host.open).toHaveBeenCalledOnce()
  f.c.phase(f.lives[0]!.handle.revision, 'streaming')
  await f.end(0)
  // 下一次metadata由正式HttpError來源拒絕，不靠UIcode猜network。
  f.auth.respond = async () => {
    throw new HttpError('rate_limited', 429)
  }
  await f.time(2000)
  expect(f.states.at(-1)?.code).toBe('rate_limited')
  await f.time(100000)
  expect(f.host.open).toHaveBeenCalledOnce()
  f.c.dispose()
})
// 無效路徑與disposed owner不能建立授權HTTP；取消後manualstart才可重開。
it('rejects invalid route identifiers and does not resurrect a disposed owner', async () => {
  const f = fixture()
  f.c.start('not-a-uuid')
  await flush()
  expect(f.auth.requests).toHaveLength(0)
  f.c.start(id)
  await flush()
  expect(f.host.open).toHaveBeenCalledOnce()
  f.c.dispose()
  f.c.start(id)
  await flush()
  expect(f.host.open).toHaveBeenCalledOnce()
})

// 身份改變即使watch尚未dispatch，HTTP回覆入口仍不能用舊actor開新WS。
it('checks current identity after a late reply even before the auth watcher runs', async () => {
  const f = fixture(),
    target = pending<unknown>()
  // 僅延後safe metadata，auth/me不得因舊回覆復活。
  f.auth.respond = async () => target.promise
  f.c.start(id)
  await flush()
  expect(f.auth.requests).toHaveLength(1)
  f.auth.user = { ...user, id: 'other-public-actor' }
  target.resolve(row)
  await flush()
  expect(f.host.open).not.toHaveBeenCalled()
  expect(f.auth.requests).toHaveLength(1)
  f.c.dispose()
})

// candidate等待policy／protocol時socket已非open，不能以30秒舊activity重設stable。
it('does not reset stability during a pending native socket failure', async () => {
  const f = fixture()
  f.c.start(id)
  await flush()
  expect(f.host.open).toHaveBeenCalledOnce()
  f.c.phase(f.lives[0]!.handle.revision, 'streaming')
  await f.end(0)
  await f.time(2000)
  const revision = f.lives[1]!.handle.revision
  f.c.phase(revision, 'streaming')
  f.clock(61000)
  f.c.activity(revision, true)
  f.clock(61999)
  f.c.activity(revision, false)
  await f.time(62000)
  expect(f.states.at(-1)?.attempt).toBe(1)
  f.c.dispose()
})
