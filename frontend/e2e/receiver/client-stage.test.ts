import { afterEach, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { binding } from './test-fixtures'

const state = vi.hoisted(() => ({
  phase: 'login',
  saved: [] as unknown[],
  failure: null as string | null,
  cleanupFailure: false,
  closed: false,
  calls: [] as string[],
  policyFailure: false,
  policySetupFailure: false,
  policyDisposed: false,
  extraDuringCleanup: false,
  extraAttempt: false,
}))

// UI matcher是外部瀏覽器等待邊界；新stage仍必須由真正ready程式設定，fake不呼onStage。
vi.mock('@playwright/test', () => ({
  // 固定locator名稱控制外部等待失敗，不依被測stage反推測試oracle。
  expect(locator: { id: string }) {
    return {
      not: {
        // 模擬原政策檢查，不讀瀏覽器或改auto-reconnect值。
        async toBeChecked() {
          state.calls.push('policy')
          if (state.failure === 'policy') throw new Error('public-sensitive-error-marker')
        },
      },
      // 僅替換兩個可見性等待，原adapter的呼叫順序與stage設定保持真實。
      async toBeVisible() {
        state.calls.push(locator.id)
        if (state.failure === locator.id) throw new Error('public-sensitive-error-marker')
      },
    }
  },
}))

// 保留真正階段編碼及report分類，只替換會讀私有檔／導航／開Console的外部邊界。
vi.mock('../real/test-receiver-control', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../real/test-receiver-control')>()
  return {
    ...actual,
    // 本案僅測catch／收尾／白名單輸出，不讀env或真target。
    readReceiverCaseEnvironment: () => ({}),
    // 公開fake control保留同輪binding形狀，finish只收真executor產的安全report。
    createReceiverCaseClient: () => ({
      binding: binding(),
      start() {},
      finish(report: unknown) {
        state.saved.push(report)
      },
    }),
    // 模擬UI外部失敗，不能讓exception原文通過真正executor到終端。
    openSavedReceiverConsole: async (
      _page: unknown,
      _env: unknown,
      _binding: unknown,
      onStage: (stage: string) => void,
      onPolicy?: (gate: unknown) => void,
    ) => {
      if (state.failure !== null)
        onPolicy?.({
          page: _page,
          // 模擬外部gate違規，真正adapter必須在操作前主動檢查。
          assertSingleAttempt() {
            if (state.policyFailure) throw new Error('public-sensitive-policy')
          },
          valid: /* 固定安全布林，不回傳request資料。 */ () => !state.policyFailure,
          beginCleanup: /* 不替executor關頁或填報成功。 */ () => {},
          dispose: /* 收尾必須由executor呼叫而非fake自動完成。 */ async () => {
            state.policyDisposed = true
            return true
          },
        })
      if (state.policySetupFailure) throw new Error('public-sensitive-policy-setup')
      if (state.failure !== null) return _page
      onStage(state.phase)
      throw new Error('public-sensitive-error-marker')
    },
  }
})
vi.mock('../real/fixtures', () => ({
  // 只提供公開fixture的資源計數，不建立Worker／socket或讀取真畫面。
  observeConsole: () => ({
    // 累計全程建立數，與現在還活著幾個Worker不同。
    get opened() {
      return state.extraAttempt ? 2 : state.failure === null ? 0 : 1
    },
    // 公開cleanup完成數不得掩蓋額外attempt。
    get closed() {
      return state.extraAttempt ? 2 : state.failure === null ? 0 : 1
    },
    // 只回WS建立次數，不提供message或票證。
    get sockets() {
      return state.extraAttempt ? 2 : state.failure === null ? 0 : 1
    },
    wrongPrefix: 0,
  }),
}))
vi.mock('../real/input-fixtures', () => ({
  // cleanup失敗也是外部邊界；executor仍須保留原ready故障，不改成cleanup階段。
  async assertCanvasEmptyAndWorkersClosed() {
    if (state.extraDuringCleanup) state.extraAttempt = true
    if (state.cleanupFailure) throw new Error('public-sensitive-cleanup-marker')
  },
}))
vi.mock('../real/encoded-input-diagnostics', () => ({
  // 本案只有外部UI失敗，沒有真Worker或診斷scope。
  async attachEncodedInputDiagnostics() {},
  async prepareEncodedInputWorker() {
    state.calls.push('worker')
    if (state.failure === 'worker') throw new Error('public-sensitive-error-marker')
  },
}))

// 每案只還原自己的stdout spy與RAM report，不清其他測試資源。
afterEach(() => {
  vi.restoreAllMocks()
  state.saved.length = 0
  state.failure = null
  state.cleanupFailure = false
  state.closed = false
  state.calls.length = 0
  state.policyFailure = false
  state.policySetupFailure = false
  state.policyDisposed = false
  state.extraDuringCleanup = false
  state.extraAttempt = false
  vi.useRealTimers()
})

// 公開Page只替換DOM／等待邊界，真正executor／ready／report分類完全保留。
function readyPage(): Page {
  return {
    // initScript不執行，因本案禁止真Worker或頁面腳本。
    context: () => ({ addInitScript: async () => {} }),
    // locator只需提供既有檢查與cleanup；不提供任何input方法。
    getByTestId: (id: string) => ({
      id,
      click: async () => {},
      evaluate: /* 公開surface座標邊界。 */ async () => ({ x: 20, y: 30 }),
    }),
    keyboard: {
      press: /* 公開鍵盤送出邊界，不產生真輸入。 */ async () => {},
      insertText: /* 只接受本輪RAM fixture。 */ async () => {},
    },
    // 模擬Canvas等待失敗，不取真pixel或hash。
    async waitForFunction() {
      state.calls.push('canvas')
      if (state.failure === 'canvas') throw new Error('public-sensitive-error-marker')
    },
    // refresh回固定安全布林；第二次evaluate是診斷scope初始化，而非另一輪觀測。
    async evaluate(_callback: unknown, argument: unknown) {
      if (argument === 'rdweb-test-receiver/0.1.0') {
        state.calls.push('snapshot')
        const safe = state.failure !== 'snapshot'
        return {
          streaming: safe,
          inputReady: safe,
          identityVerified: safe,
          scopeIntact: safe,
          overflow: false,
          unavailable: !safe,
        }
      }
      if (argument === undefined)
        return {
          main: {
            prefixSubmitted: true,
            prefixAccepted: true,
            postTextInput: false,
            clipboardObserved: false,
            scopeInterrupted: false,
            overflow: false,
          },
          encoded: {
            observed: true,
            textExact: true,
            textSingle: true,
            initialSelectComplete: true,
            sequenceComplete: true,
            sequenceInvalid: false,
            overflow: false,
            unavailable: false,
          },
        }
      state.calls.push('scope')
      if (state.failure === 'scope') throw new Error('public-sensitive-error-marker')
    },
    // 本案只關自己的公開替身，不建立或操作真context。
    isClosed: () => state.closed,
    close: async () => {
      state.closed = true
    },
  } as unknown as Page
}

// 每個外部失敗點必須由真ready adapter定位，且仍保留原全false／unavailable報告語意。
it.each([
  ['policy', 'ready_policy', ['policy']],
  ['console-streaming', 'ready_streaming', ['policy', 'console-streaming']],
  ['console-verified', 'ready_peer', ['policy', 'console-streaming', 'console-verified']],
  ['canvas', 'ready_canvas', ['policy', 'console-streaming', 'console-verified', 'canvas']],
  [
    'snapshot',
    'ready_snapshot',
    ['policy', 'console-streaming', 'console-verified', 'canvas', 'snapshot'],
  ],
  [
    'worker',
    'ready_diagnostics',
    ['policy', 'console-streaming', 'console-verified', 'canvas', 'snapshot', 'worker'],
  ],
  [
    'scope',
    'ready_diagnostics',
    ['policy', 'console-streaming', 'console-verified', 'canvas', 'snapshot', 'worker', 'scope'],
  ],
] as const)(
  'reports the actual %s ready failure without promoting partial booleans',
  async (failure, expected, calls) => {
    state.failure = failure
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { executeReceiverCase } = await import('../real/test-receiver-scenario')
    await expect(executeReceiverCase(readyPage())).rejects.toThrow(/^receiver_client_unavailable$/)
    expect(state.calls).toEqual(calls)
    expect(output.mock.calls.flat()).toEqual([
      '[[rdweb_receiver_stage:' + expected + ']]',
      'receiver_client_unavailable',
    ])
    const b = binding()
    expect(state.saved).toEqual([
      {
        schemaVersion: 1,
        purpose: b.purpose,
        runId: b.runId,
        requestId: b.requestId,
        identityVerified: false,
        videoPresented: false,
        submitted: false,
        observationComplete: false,
        scopeIntact: false,
        resourcesClosed: true,
        unavailable: true,
      },
    ])
  },
)

// cleanup可失敗，但不能覆寫真正ready故障或讓資源關閉證據變成成功。
it('preserves the ready substage when cleanup also fails', async () => {
  state.failure = 'console-verified'
  state.cleanupFailure = true
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const { executeReceiverCase } = await import('../real/test-receiver-scenario')
  await expect(executeReceiverCase(readyPage())).rejects.toThrow(/^receiver_client_unavailable$/)
  expect(output.mock.calls.flat()).toEqual([
    '[[rdweb_receiver_stage:ready_peer]]',
    'receiver_client_unavailable',
  ])
  expect(state.saved[0]).toMatchObject({ unavailable: true, resourcesClosed: false })
})

// 即使外部UI會回成功，真正adapter也必須先擋住已違反單attempt的owner。
it('refuses input preparation when the policy owner is already poisoned', async () => {
  state.failure = 'console-streaming'
  state.policyFailure = true
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const { executeReceiverCase } = await import('../real/test-receiver-scenario')
  await expect(executeReceiverCase(readyPage())).rejects.toThrow(/^receiver_client_unavailable$/)
  expect(state.calls).toEqual([])
  expect(output.mock.calls.flat()[0]).toBe('[[rdweb_receiver_stage:ready_policy]]')
  expect(state.policyDisposed).toBe(true)
})

// opener在準備中丟錯時，先前交給executor的自有popup仍須被收回。
it('cleans the acquired popup and gate after policy setup throws', async () => {
  state.failure = 'policy'
  state.policySetupFailure = true
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const { executeReceiverCase } = await import('../real/test-receiver-scenario')
  await expect(executeReceiverCase(readyPage())).rejects.toThrow(/^receiver_client_unavailable$/)
  expect(state.closed).toBe(true)
  expect(state.policyDisposed).toBe(true)
  expect(state.saved[0]).toMatchObject({ unavailable: true, resourcesClosed: true })
})

// 真scenario完成所有被動等待與提交守衛後，無額外attempt才可完成；fake不直接回成功result。
it('keeps the complete scenario successful with exactly one owned attempt', async () => {
  vi.useFakeTimers()
  state.failure = 'success'
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const { executeReceiverCase } = await import('../real/test-receiver-scenario')
  const run = executeReceiverCase(readyPage())
  await vi.runAllTimersAsync()
  await run
  expect(output.mock.calls.flat()).toEqual([
    '[[rdweb_receiver_stage:complete]]',
    'receiver_client_completed',
  ])
  expect(state.saved[0]).toMatchObject({
    scopeIntact: true,
    resourcesClosed: true,
    unavailable: false,
  })
})

// 即使gate移除listener與關頁交錯，原observer的全程累計也不能被opened===closed冒充單次。
it('rejects an extra attempt observed during cleanup even if every resource closes', async () => {
  vi.useFakeTimers()
  state.failure = 'success'
  state.extraDuringCleanup = true
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const { executeReceiverCase } = await import('../real/test-receiver-scenario')
  const outcome = executeReceiverCase(readyPage()).then(
    /* RED時正常完成亦先收成資料，避免測試斷言本身成unhandled rejection。 */ () => undefined,
    /* 只有安全錯誤分類進後續斷言。 */ (error: unknown) => error,
  )
  await vi.runAllTimersAsync()
  expect(await outcome).toEqual(new Error('receiver_client_unavailable'))
  expect(state.saved[0]).toMatchObject({
    scopeIntact: false,
    resourcesClosed: true,
    unavailable: true,
  })
})

// 真executor必須在吞掉外部exception時留下安全階段，不只印一個無法定位的unavailable。
it.each(['login', 'target_selection'])(
  'reports the failed %s stage without exposing exception content',
  async (phase) => {
    state.phase = phase
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { executeReceiverCase } = await import('../real/test-receiver-scenario')
    const page = { context: () => ({ addInitScript: async () => {} }) } as unknown as Page
    await expect(executeReceiverCase(page)).rejects.toThrow(/^receiver_client_unavailable$/)
    const lines = output.mock.calls.flat().join('\n')
    expect(lines).toContain('[[rdweb_receiver_stage:' + phase + ']]')
    expect(lines).not.toContain('public-sensitive-error-marker')
    expect(state.saved).toHaveLength(1)
    expect(state.saved[0]).toMatchObject({ resourcesClosed: false, unavailable: true })
  },
)
