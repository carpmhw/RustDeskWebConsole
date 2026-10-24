import { expect, it } from 'vitest'
import { ConsoleSession, type SessionAuth } from '../../src/rdweb/console-session'
import { AttemptLifecycle } from '../../src/rdweb/attempt-lifecycle'
import type { SessionUser } from '../../src/api/types'
import type { TargetRow } from '../../src/api/management'
import type { RetryState } from '../../src/rdweb/interaction-types'
import { installReceiverPolicyGate } from '../real/test-receiver-policy'
import { policyFixture, policyTarget } from './policy-fixture'

// 只排空受控promise，不用真timer或真網路假造互通。
async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

// 真ConsoleSession／RetryController只替換原HTTP及Host邊界，metadata由gate繼續原請求才交付。
async function fixture() {
  const browser = policyFixture()
  const gate = await installReceiverPolicyGate(browser.source, browser.consoleUrl, '')
  const user: SessionUser = {
    id: '00000000-0000-4000-8000-000000000002',
    username: 'public-policy-user',
    role: 'operator',
    totp_enabled: true,
    mfa_enrollment_required: false,
  }
  const target: TargetRow = {
    id: policyTarget,
    server_id: '00000000-0000-4000-8000-000000000003',
    name: 'public-policy-target',
    rustdesk_id: '987654321',
    group_name: null,
    tags: [],
    notes: null,
    created_by: user.id,
    has_password: true,
    permissions: { can_connect: true, can_edit: false, can_view_password: false },
    version: 1,
    created_at: '2026-10-24T00:00:00Z',
    updated_at: '2026-10-24T00:00:00Z',
  }
  let deliver!: (target: TargetRow) => void
  const metadata = new Promise<TargetRow>(
    /* 公開HTTP producer，不存憑證或原文。 */ (resolve) => {
      deliver = resolve
    },
  )
  const states: RetryState[] = []
  const attempts: AttemptLifecycle[] = []
  const paths: string[] = []
  let now = 0
  const auth: SessionAuth = {
    phase: 'authenticated',
    user,
    // 泛型只存在於受控HTTP邊界；原metadata與me檢查在真session內執行。
    async request<T>(
      path: string,
      _method?: string,
      _body?: unknown,
      signal?: AbortSignal,
    ): Promise<T> {
      paths.push(path)
      if (signal?.aborted) throw new Error('public-cancelled')
      if (path === 'api/v1/auth/me') return { ...user } as T
      if (path !== 'api/v1/targets/' + policyTarget) throw new Error('public-wrong-target')
      void browser.initial.dispatch()
      return (await metadata) as T
    },
  }
  const session = new ConsoleSession(
    auth,
    {
      // Host唯有通過真metadata／actor／ACL守衛後才能取得新handle。
      open(targetId, peer) {
        expect(targetId).toBe(policyTarget)
        expect(peer).toBe('987654321')
        const life = new AttemptLifecycle(
          attempts.length + 1,
          /* 沒有native資源的公開port。 */ () => {},
        )
        life.prepared()
        attempts.push(life)
        browser.worker()
        browser.socket()
        return life.handle
      },
      dispose: /* 只取消本案當前handle，不建立其他attempt。 */ () =>
        attempts.at(-1)?.handle.cancel(),
    },
    /* 只收已驗狀態布林／literal。 */ (state) => states.push(state),
    /* 公開單調clock。 */ () => now,
  )
  browser.onChange(
    /* 與Console.vue的正常change接線相同，並非直接設定RetryController。 */ (enabled) =>
      session.setEnabled(enabled),
  )
  browser.afterContinue(/* 只在原route真正continue時傳回公開DTO。 */ () => deliver(target))
  // 模型化Vue離頁dispose；不讓測試晚回覆自行關閉其他owner。
  const closed = (): void => session.dispose()
  browser.popup.on('close', closed)
  browser.open()
  session.start(policyTarget)
  return {
    browser,
    gate,
    session,
    attempts,
    states,
    paths,
    lateMetadata: /* 模型化外部fetch忽略abort後的晚回覆，原epoch必須拒絕。 */ () => deliver(target),
    time: /* 真retry ticker只由本案單調clock驅動。 */ (value: number) => {
      now = value
      session.tick()
    },
    dispose: /* 只收本案gate／session／listener，不讀寫檔案。 */ async () => {
      gate.beginCleanup()
      session.dispose()
      await gate.dispose()
      browser.popup.off('close', closed)
    },
  }
}

// 沒有gate／正常change時會先open或自動retry；本案觀測真正Host副作用，不只斷言mock被呼叫。
it('keeps host closed until UI disable and never retries the first streamed connection', async () => {
  const f = await fixture()
  try {
    await flush()
    expect(f.attempts).toHaveLength(0)
    expect(f.browser.checked()).toBe(true)
    expect(f.paths).toEqual(['api/v1/targets/' + policyTarget])
    await f.gate.prepare()
    await flush()
    expect(f.states.at(-1)?.enabled).toBe(false)
    expect(f.attempts).toHaveLength(1)
    expect(f.paths).toEqual(['api/v1/targets/' + policyTarget, 'api/v1/auth/me'])
    f.session.phase(f.attempts[0]!.handle.revision, 'streaming')
    f.attempts[0]!.finish({ cause: 'network', code: 'connection_failed' })
    await flush()
    f.time(2000)
    f.time(999999)
    await flush()
    expect(f.attempts).toHaveLength(1)
    expect(f.browser.initial.counts()).toEqual({ continued: 1, aborted: 0 })
  } finally {
    await f.dispose()
  }
})

// 關頁取消後，即使transport交付先前metadata，真session的epoch／closed仍不open。
it('does not open a host after popup cancellation and a late metadata reply', async () => {
  const f = await fixture()
  try {
    const failure = expect(f.gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
    await f.browser.popup.close()
    await failure
    await f.gate.dispose()
    f.lateMetadata()
    await flush()
    f.time(999999)
    expect(f.attempts).toHaveLength(0)
    expect(f.paths).toEqual(['api/v1/targets/' + policyTarget])
    expect(f.browser.initial.counts().continued).toBe(0)
  } finally {
    await f.dispose()
  }
})
