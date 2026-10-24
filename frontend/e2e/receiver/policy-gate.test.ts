import { afterEach, expect, it, vi } from 'vitest'
import * as control from '../real/test-receiver-control'
import { installReceiverPolicyGate } from '../real/test-receiver-policy'
import { binding } from './test-fixtures'
import { policyFixture } from './policy-fixture'
import type { ReceiverPolicyGate } from '../real/test-receiver-policy'

// 認證是外部邊界，保留真正opener／link驗證／政策準備控制流。
vi.mock('../management/helpers/fixtures', () => ({
  base: '',
  origin: 'http://127.0.0.1:18080',
  loginUi: /* 不讀程序密碼或開HTTP。 */ async () => {},
}))

// 每案收回自有timer，避免負向測試遺留等待。
afterEach(() => {
  vi.useRealTimers()
})

// 首GET若未被hold，預設checked=true會直接進Host；本案抓真opener缺少政策準備。
it('disables the default checked policy before continuing the first console metadata request', async () => {
  const f = policyFixture()
  let gate: ReceiverPolicyGate | undefined
  const page = await control.openSavedReceiverConsole(
    f.source,
    {
      root: '/tmp/opencode/public-policy-unused',
      targetName: 'receiver-test-target-0123456789abcdef',
      username: 'e2e-' + 'a'.repeat(32),
    },
    binding(),
    undefined,
    (owner) => {
      gate = owner
    },
  )
  try {
    expect(page).toBe(f.popup)
    expect(f.checked()).toBe(false)
    expect(
      f.calls.filter((call) => ['route', 'click', 'uncheck', 'continue'].includes(call)),
    ).toEqual(['route', 'click', 'uncheck', 'continue'])
    expect(f.initial.counts()).toEqual({ continued: 1, aborted: 0 })
  } finally {
    gate?.beginCleanup()
    await gate?.dispose()
  }
})

// 未取得metadata前不得操作政策或放行；dispose須取消而非晚到後重試。
it('cancels an owned gate before metadata without reviving it on late events', async () => {
  const f = policyFixture()
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  const ready = gate.prepare()
  const failure = expect(ready).rejects.toThrow(/^receiver_unavailable$/)
  await gate.dispose()
  f.open()
  await f.initial.dispatch()
  await failure
  expect(f.checked()).toBe(true)
  expect(f.initial.counts()).toEqual({ continued: 0, aborted: 0 })
  expect(f.context.listenerCount('page')).toBe(0)
  expect(f.routed()).toBe(false)
})

// 使用公開UI失敗／仍checked／transport失敗，任何一種都不能放行後宣稱已準備。
it.each(['ui', 'checked', 'transport'] as const)('fails closed for %s failure', async (kind) => {
  const f = policyFixture()
  if (kind === 'ui') f.uiFailure()
  if (kind === 'checked') f.stuckChecked()
  if (kind === 'transport') f.continueFailure()
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.open()
  const request = f.initial.dispatch()
  await expect(gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
  await gate.dispose()
  await request
  expect(f.initial.counts().continued).toBe(0)
  expect(f.routed()).toBe(false)
})

// 錯origin／target／method／page都必須由真handler拒絕，不可交給原請求繼續。
it.each(['origin', 'target', 'query', 'method', 'page'] as const)(
  'rejects a metadata request with the wrong %s',
  async (kind) => {
    const f = policyFixture()
    const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
    f.open()
    const request = f.request({
      ...(kind === 'origin' ? { url: f.metadataUrl.replace('127.0.0.1', 'localhost') } : {}),
      ...(kind === 'target' ? { url: f.metadataUrl.replace(/1$/, '2') } : {}),
      ...(kind === 'query' ? { url: f.metadataUrl + '?other=1' } : {}),
      ...(kind === 'method' ? { method: 'POST' } : {}),
      ...(kind === 'page' ? { page: f.source } : {}),
    })
    const dispatched = request.dispatch()
    await expect(gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
    await gate.dispose()
    await dispatched
    expect(request.counts()).toEqual({ continued: 0, aborted: 1 })
  },
)

// 政策準備前即有任何native資源表示漏過了第一個metadata邊界，不能繼續。
it.each(['worker', 'socket'] as const)('rejects an early %s', async (kind) => {
  const f = policyFixture()
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.open()
  const request = f.initial.dispatch()
  f[kind]()
  await expect(gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
  await gate.dispose()
  await request
  expect(f.initial.counts().continued).toBe(0)
})

// 第二個metadata不能以同target／舊Worker已關閉或準備成功逃過單次約束。
it.each(['metadata', 'worker', 'socket'] as const)(
  'rejects a second %s after preparation',
  async (kind) => {
    const f = policyFixture()
    const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
    f.open()
    const first = f.initial.dispatch()
    await gate.prepare()
    await first
    f.worker()
    f.socket()
    gate.assertSingleAttempt()
    if (kind === 'metadata') {
      const duplicate = f.request()
      await duplicate.dispatch()
      expect(duplicate.counts()).toEqual({ continued: 0, aborted: 1 })
    } else {
      f.workersGone()
      f[kind]()
    }
    expect(() => gate.assertSingleAttempt()).toThrow(/^receiver_unavailable$/)
    expect(await gate.dispose()).toBe(true)
    expect(gate.valid()).toBe(false)
  },
)

// 共用15秒setup從安裝起計，不因popup／UI進展補時；到期後晚metadata不放行。
it('expires the setup at the original fifteen-second bound', async () => {
  vi.useFakeTimers()
  const f = policyFixture()
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.open()
  const failure = expect(gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
  await vi.advanceTimersByTimeAsync(15000)
  await failure
  const late = f.initial.dispatch()
  await gate.dispose()
  await late
  expect(f.initial.counts().continued).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

// UI等待被取消後即使晚完成，也不能執行decision(true)放行舊請求。
it('does not continue a held request after a late UI completion', async () => {
  const f = policyFixture()
  let finish!: () => void, entered!: () => void
  const ui = new Promise<void>(
    /* 公開可控UI等待。 */ (resolve) => {
      finish = resolve
    },
  )
  const started = new Promise<void>(
    /* 證明真gate已進正常UI操作。 */ (resolve) => {
      entered = resolve
    },
  )
  Object.assign(f.popup, {
    getByTestId: /* 只替換正常UI等待邊界。 */ () => ({
      uncheck: /* UI稍後完成，取消不能復活本輪。 */ () => {
        entered()
        return ui
      },
      isChecked: /* 完成後的公開unchecked狀態。 */ async () => false,
    }),
  })
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.open()
  const request = f.initial.dispatch()
  const failure = expect(gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
  await started
  await gate.dispose()
  finish()
  await failure
  await request
  expect(f.initial.counts()).toEqual({ continued: 0, aborted: 1 })
})

// 原生close若未回覆也不得令新gate收尾無界；2秒到期只能回cleanup不足。
it('bounds cleanup when the owned popup close never confirms', async () => {
  vi.useFakeTimers()
  const f = policyFixture()
  Object.assign(f.popup, {
    close: /* 永不確認的公開native邊界。 */ () => new Promise<void>(() => {}),
  })
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.open()
  const request = f.initial.dispatch()
  const failure = expect(gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
  let result: boolean | undefined
  void gate.dispose().then(
    /* 只觀察是否有界返回，不替gate填成功。 */ (value) => {
      result = value
    },
  )
  await vi.advanceTimersByTimeAsync(2000)
  await failure
  expect(result).toBe(false)
  expect(f.routed()).toBe(false)
  await request
  expect(vi.getTimerCount()).toBe(0)
})

// route安裝在setup期限後才完成時，不能留下已返回失敗的攔截器或再點連線。
it('removes a route whose installation completes after setup cancellation', async () => {
  vi.useFakeTimers()
  const f = policyFixture()
  const original = (f.context as unknown as { route: (...args: unknown[]) => Promise<void> }).route
  let complete!: () => void
  const stalled = new Promise<void>(
    /* 公開RPC安裝等待。 */ (resolve) => {
      complete = resolve
    },
  )
  Object.assign(f.context, {
    route: /* 晚到後才由原transport安裝真handler。 */ async (...args: unknown[]) => {
      await stalled
      await original(...args)
    },
  })
  const failure = expect(installReceiverPolicyGate(f.source, f.consoleUrl, '')).rejects.toThrow(
    /^receiver_unavailable$/,
  )
  await vi.advanceTimersByTimeAsync(17000)
  await failure
  complete()
  await vi.advanceTimersByTimeAsync(0)
  expect(f.routed()).toBe(false)
  expect(f.context.listenerCount('page')).toBe(0)
  expect(f.calls).not.toContain('click')
})

// beginCleanup之後的工作共用原2秒，dispose不能因自己的native呼叫很快而重新補時。
it('does not reset an expired shared cleanup budget', async () => {
  vi.useFakeTimers()
  const f = policyFixture()
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.open()
  const request = f.initial.dispatch()
  await gate.prepare()
  await request
  gate.beginCleanup()
  await vi.advanceTimersByTimeAsync(2000)
  expect(await gate.dispose()).toBe(false)
  expect(f.routed()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

// 關頁是取消，不可等到晚metadata才恢復政策準備。
it('cancels a held request when the owned popup closes', async () => {
  const f = policyFixture()
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.open()
  const request = f.initial.dispatch()
  await f.popup.close()
  await expect(gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
  await gate.dispose()
  await request
  expect(f.initial.counts().continued).toBe(0)
})

// 未由本輪source發出popup事件的頁面不是本案資源，拒絕也不能順便關閉。
it('does not close a page without the bound source popup event', async () => {
  const f = policyFixture()
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.context.emit('page', f.popup)
  const request = f.initial.dispatch()
  await expect(gate.prepare()).rejects.toThrow(/^receiver_unavailable$/)
  await gate.dispose()
  await request
  expect(f.popup.isClosed()).toBe(false)
  expect(f.initial.counts()).toEqual({ continued: 0, aborted: 1 })
})

// Targets link使用noopener；綁定依Playwright source popup事件，不依頁面window.opener。
it('accepts the bound popup without requiring a script-visible opener', async () => {
  const f = policyFixture()
  Object.assign(f.popup, { opener: /* 公開noopener模型。 */ async () => null })
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '')
  f.open()
  const request = f.initial.dispatch()
  try {
    await gate.prepare()
    await request
    expect(f.initial.counts()).toEqual({ continued: 1, aborted: 0 })
  } finally {
    gate.beginCleanup()
    await gate.dispose()
  }
})

// 精確base必須保留，既有合法subpath不可被測試端拼接成根路徑。
it('continues the original subpath request once and removes only its own resources', async () => {
  const f = policyFixture('/rdweb')
  const gate = await installReceiverPolicyGate(f.source, f.consoleUrl, '/rdweb')
  f.open()
  const request = f.initial.dispatch()
  await gate.prepare()
  await request
  gate.assertSingleAttempt()
  expect(f.initial.counts()).toEqual({ continued: 1, aborted: 0 })
  gate.beginCleanup()
  await f.popup.close()
  expect(await gate.dispose()).toBe(true)
  expect(gate.valid()).toBe(true)
  expect(f.context.listenerCount('page')).toBe(0)
  expect(f.routed()).toBe(false)
})

// 不可信連線link要在安裝route／點連線前拒絕，不能將URL變成任意攔截入口。
it.each([
  'https://example.invalid/console/00000000-0000-4000-8000-000000000001',
  '/console/invalid',
  '/console/00000000-0000-4000-8000-000000000001?retry=1',
])('rejects an unbound console link before side effects: %s', async (href) => {
  const f = policyFixture()
  await expect(installReceiverPolicyGate(f.source, href, '')).rejects.toThrow(
    /^receiver_unavailable$/,
  )
  expect(f.calls).toEqual([])
})
