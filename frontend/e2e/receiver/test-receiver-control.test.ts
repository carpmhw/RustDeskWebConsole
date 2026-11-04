import { describe, expect, it, vi } from 'vitest'
import {
  createReceiverCaseClient,
  readReceiverCaseEnvironment,
  receiverClientCode,
  openSavedReceiverConsole,
  receiverClientStageMarker,
  parseReceiverClientStage,
} from '../real/test-receiver-control'
import { binding, clientReport, endpoints } from './test-fixtures'
import type { Page } from '@playwright/test'
import type { ReceiverPolicyGate } from '../real/test-receiver-policy'
import { policyFixture } from './policy-fixture'

// 認證／真HTTP是外部邊界；本案仍執行真正saved-target選擇及連線防護。
vi.mock('../management/helpers/fixtures', () => ({
  base: '',
  // 測試既有登入後的公開table，不開HTTP或取得真憑證。
  async loginUi() {},
}))

const key = endpoints().serverPublicKey
const root = '/tmp/opencode/receiver-case-root'

// 新白名單若缺項／誤改拼字會失敗；預期由已核准literal獨立列出。
it.each([
  'ready_policy',
  'ready_streaming',
  'ready_peer',
  'ready_canvas',
  'ready_snapshot',
  'ready_diagnostics',
] as const)('round trips the approved client substage %s', (stage) => {
  const marker = '[[rdweb_receiver_stage:' + stage + ']]'
  expect(receiverClientStageMarker(stage)).toBe(marker)
  expect(parseReceiverClientStage('noise\n' + marker + '\n')).toBe(stage)
})

// 未核准的ready前綴不能藉由細分階段的改動變成任意診斷通道。
it('does not accept an arbitrary ready-prefixed stage', () => {
  expect(parseReceiverClientStage('[[rdweb_receiver_stage:ready_public_secret_sentinel]]')).toBe(
    'unknown',
  )
})

// 診斷只回固定階段，不回任意child文字；ANSI／reporter雜訊不能要求DOM快照。
it('keeps client-stage diagnostics on a fixed safe allowlist', () => {
  expect(typeof receiverClientStageMarker).toBe('function')
  expect(typeof parseReceiverClientStage).toBe('function')
  expect(receiverClientStageMarker('target_selection')).toBe(
    '[[rdweb_receiver_stage:target_selection]]',
  )
  expect(
    parseReceiverClientStage(
      '\u001b[2Knoise\n[[rdweb_receiver_stage:login]]\n[[rdweb_receiver_stage:console_ready]]\n',
    ),
  ).toBe('console_ready')
  expect(parseReceiverClientStage('untrusted public-secret-sentinel')).toBe('unknown')
  expect(parseReceiverClientStage('[[rdweb_receiver_stage:public_secret_sentinel]]')).toBe(
    'unknown',
  )
  expect(parseReceiverClientStage('x'.repeat(8 * 1024 * 1024 + 1))).toBe('unknown')
  expect(receiverClientStageMarker('public-secret-sentinel' as never)).toBe(
    '[[rdweb_receiver_stage:unknown]]',
  )
})

// 只建立本次假env；不讀真實target、server或private root。
function env(patch: Record<string, string | undefined> = {}) {
  return {
    RDWEB_TEST_RECEIVER_LIVE: '1',
    RDWEB_TEST_RECEIVER_MODE: 'existing-target',
    RDWEB_TEST_RECEIVER_ROOT: root,
    RDWEB_TEST_RECEIVER_TARGET_NAME: 'receiver-test-target-0123456789abcdef',
    RDWEB_TEST_RECEIVER_USERNAME: 'e2e-' + 'a'.repeat(32),
    RDWEB_E2E_PASSWORD: 'Public-Test-Password',
    RDWEB_TEST_RECEIVER_HBBS_UDP: 'hbbs.invalid:21116',
    RDWEB_TEST_RECEIVER_HBBS_TCP: 'hbbs.invalid:21116',
    RDWEB_TEST_RECEIVER_HBBR_TCP: 'hbbr.invalid:21117',
    RDWEB_TEST_RECEIVER_SERVER_PUBLIC_KEY: key,
    ...patch,
  }
}

// 只有完整既有target env可形成case runtime，且不回傳密碼或endpoint秘密。
describe('receiver case environment', () => {
  it('accepts an existing-target scope and keeps secrets out of the result', () => {
    const runtime = readReceiverCaseEnvironment(env())
    expect(runtime).toEqual({
      root,
      targetName: 'receiver-test-target-0123456789abcdef',
      username: 'e2e-' + 'a'.repeat(32),
      resultSource: undefined,
    })
    expect(JSON.stringify(runtime)).not.toContain('Public-Test-Password')
    expect(JSON.stringify(runtime)).not.toContain('hbbs.invalid')
  })

  it('accepts an optional absolute private result source', () => {
    expect(
      readReceiverCaseEnvironment(env({ RDWEB_TEST_RECEIVER_RESULT: '/tmp/opencode/result.json' }))
        .resultSource,
    ).toBe('/tmp/opencode/result.json')
  })

  // 非opt-in、CI、舊用途及錯誤模式都必須在任何private root I/O前拒絕。
  it.each([
    { RDWEB_TEST_RECEIVER_LIVE: undefined },
    { RDWEB_TEST_RECEIVER_LIVE: '0' },
    { CI: '1' },
    { GITHUB_ACTIONS: 'true' },
    { RDWEB_TEST_RECEIVER_MODE: 'provision' },
    { RDWEB_TEST_RECEIVER_MODE: undefined },
    { RDWEB_WINDOWS_HOST_OBSERVE: '1' },
    { RDWEB_WINDOWS_HOST_INPUT_ONLY: '1' },
    { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' },
    { APP_BASE_PATH: '/rdweb' },
    { RDWEB_B3_BASES: '/rdweb' },
    { RDWEB_B3_MODES: 'strip' },
  ])('rejects unsupported scope: %j', (patch) => {
    expect(() => readReceiverCaseEnvironment(env(patch))).toThrow(/^receiver_unavailable$/)
  })

  // 名稱、路徑與密碼格式先驗，避免猜測或從環境補值。
  it.each([
    { RDWEB_TEST_RECEIVER_ROOT: 'relative/root' },
    { RDWEB_TEST_RECEIVER_ROOT: root + '/' },
    { RDWEB_TEST_RECEIVER_ROOT: '/' },
    { RDWEB_TEST_RECEIVER_ROOT: '/tmp/windows-host-input-only/current' },
    { RDWEB_TEST_RECEIVER_TARGET_NAME: 'official-windows-input-tcp' },
    { RDWEB_TEST_RECEIVER_USERNAME: 'admin' },
    { RDWEB_E2E_PASSWORD: 'short' },
    { RDWEB_TEST_RECEIVER_RESULT: 'relative/result.json' },
    { RDWEB_TEST_RECEIVER_HBBS_UDP: 'hbbs.invalid' },
    { RDWEB_TEST_RECEIVER_SERVER_PUBLIC_KEY: 'not-a-key' },
  ])('rejects malformed or unsafe input: %j', (patch) => {
    expect(() => readReceiverCaseEnvironment(env(patch))).toThrow(/^receiver_unavailable$/)
  })

  // 建立client前先驗opt-in；未啟用不得讀取不存在的root。
  it('does not read a root before the live opt-in', () => {
    expect(() =>
      createReceiverCaseClient(readReceiverCaseEnvironment(env()), {
        RDWEB_TEST_RECEIVER_LIVE: undefined,
      }),
    ).toThrow(/^receiver_unavailable$/)
  })
})

// Client完成分類要求每一項本輪證據；任一false都只能是unavailable。
describe('receiver client classification', () => {
  it('requires every evidence flag and closed resources', () => {
    expect(receiverClientCode(clientReport())).toBe('receiver_client_completed')
    for (const name of [
      'identityVerified',
      'videoPresented',
      'submitted',
      'observationComplete',
      'scopeIntact',
      'resourcesClosed',
      'unavailable',
    ] as const) {
      expect(receiverClientCode({ ...clientReport(), [name]: name === 'unavailable' })).toBe(
        'receiver_client_unavailable',
      )
    }
  })
})

// 名稱符合也不能連錯裝置；表格中的peerId須與本輪binding相同才可點連線。
it.each([
  ['123456789', false],
  ['987654321', true],
] as const)(
  'checks the saved target peer binding before opening the console: %s',
  async (peerId, allowed) => {
    let clicks = 0,
      loaded = false
    const fixture = policyFixture()
    const popup = fixture.popup
    let policy: ReceiverPolicyGate | undefined
    const row = {
      // 真Targets頁先回導航，再由非同步API填表；只替換瀏覽器等待的外部邊界。
      first() {
        return {
          // 不重試連線，只等待本輪表格呈現，模擬Playwright的既有locator等待。
          async waitFor(options: { state: string; timeout: number }) {
            expect(options).toEqual({ state: 'visible', timeout: 15000 })
            await Promise.resolve()
            loaded = true
          },
        }
      },
      // 表格必須只選到一列，不讓同名資料含混通過。
      async count() {
        return loaded ? 1 : 0
      },
      // 只用公開metadata決定結果，錯誤連線的side effect由真正helper控制。
      getByRole(role: string, options: { name: string }) {
        return role === 'cell'
          ? { count: async () => (options.name === peerId ? 1 : 0) }
          : {
              // 公開saved link必須交給真policy gate驗target／origin。
              getAttribute: async () => fixture.consoleUrl,
              click: async () => {
                clicks++
                fixture.open()
                void fixture.initial.dispatch()
              },
            }
      },
    }
    const page = Object.assign(fixture.source, {
      locator: () => ({ filter: () => row }),
    }) as unknown as Page
    const runtime = readReceiverCaseEnvironment(env())
    if (allowed) {
      expect(
        await openSavedReceiverConsole(
          page,
          runtime,
          binding(),
          undefined,
          /* 只收自己的policy owner，驗證結束必須收回route／listener。 */ (owner) => {
            policy = owner
          },
        ),
      ).toBe(popup)
      policy?.beginCleanup()
      await policy?.dispose()
    } else
      await expect(openSavedReceiverConsole(page, runtime, binding())).rejects.toThrow(
        /^receiver_unavailable$/,
      )
    expect(clicks).toBe(allowed ? 1 : 0)
  },
)
