import { afterEach, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import { binding } from './test-fixtures'

const state = vi.hoisted(() => ({ phase: 'login', saved: [] as unknown[] }))

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
    ) => {
      onStage(state.phase)
      throw new Error('public-sensitive-error-marker')
    },
  }
})
vi.mock('../real/fixtures', () => ({
  // 尚未開Console的case沒有Worker／socket，不讀網路或畫面。
  observeConsole: () => ({ opened: 0, closed: 0, wrongPrefix: 0 }),
}))
vi.mock('../real/encoded-input-diagnostics', () => ({
  // 本案只有外部UI失敗，沒有真Worker或診斷scope。
  async attachEncodedInputDiagnostics() {},
  async prepareEncodedInputWorker() {},
}))

// 每案只還原自己的stdout spy與RAM report，不清其他測試資源。
afterEach(() => {
  vi.restoreAllMocks()
  state.saved.length = 0
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
