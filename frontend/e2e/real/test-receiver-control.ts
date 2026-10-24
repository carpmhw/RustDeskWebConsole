import { isAbsolute, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import type { ReceiverPolicyGate } from './test-receiver-policy'
import {
  createReceiverClient,
  readReceiverEndpoints,
  receiverClientEnabled,
  type ReceiverClientControl,
} from '../receiver/client-control.ts'
import {
  validateReceiverBinding,
  type ReceiverBinding,
  type ReceiverClientReport,
} from '../receiver/contract.ts'

// 新Console入口只接受既有saved target；預設不建立使用者、server或target。
export interface ReceiverCaseEnvironment {
  root: string
  targetName: string
  username: string
  resultSource?: string
}

// 固定模式避免同一組env被誤當成provision或舊host用途。
const MODE = 'existing-target'
const TARGET_NAME = /^receiver-test-target-[0-9a-f]{16}$/
const USERNAME = /^e2e-[0-9a-f]{32}$/
const OLD_PURPOSE = /^windows-host-(?:observer|input-only|handoff(?:-.*)?)$/

// 只有固定階段可進driver終端摘要，不包含URL、身份值或exception文字。
const CLIENT_STAGES = [
  'setup',
  'login',
  'target_selection',
  'console_ready',
  'ready_policy',
  'ready_streaming',
  'ready_peer',
  'ready_canvas',
  'ready_snapshot',
  'ready_diagnostics',
  'input',
  'observation',
  'peer_end',
  'cleanup',
  'complete',
  'unknown',
] as const
export type ReceiverClientStage = (typeof CLIENT_STAGES)[number]

// 不可信字串只降為unknown，禁止把診斷當成第二種原文輸出管道。
export function safeReceiverClientStage(value: unknown): ReceiverClientStage {
  return typeof value === 'string' && (CLIENT_STAGES as readonly string[]).includes(value)
    ? (value as ReceiverClientStage)
    : 'unknown'
}

// marker只由白名單產生；正常結果schema不因此新增欄位。
export function receiverClientStageMarker(stage: ReceiverClientStage): string {
  return '[[rdweb_receiver_stage:' + safeReceiverClientStage(stage) + ']]'
}

// 只從有界child stdout取最後固定marker；其餘內容不回傳、不落盤。
export function parseReceiverClientStage(output: unknown): ReceiverClientStage {
  if (typeof output !== 'string' || output.length > 8 * 1024 * 1024) return 'unknown'
  let stage: ReceiverClientStage = 'unknown'
  for (const match of output.matchAll(/\[\[rdweb_receiver_stage:([a-z_]+)\]\]/g))
    stage = safeReceiverClientStage(match[1])
  return stage
}

// 根目錄必須是明確絕對路徑；實際0700／owner／nofollow仍由private-io重驗。
function readRoot(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 1024 ||
    /[\0\n\r]/.test(value) ||
    !isAbsolute(value)
  )
    throw new Error('receiver_unavailable')
  const path = resolve(value)
  if (
    path !== value ||
    path === '/' ||
    path.split('/').length < 3 ||
    path.split('/').some(/* 不讀寫任何舊host用途資料夾。 */ (part) => OLD_PURPOSE.test(part))
  )
    throw new Error('receiver_unavailable')
  return path
}

// 來源只接受明確絕對路徑；是否為同owner／0600／singlelink由private-io判定。
function readSource(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 4096 ||
    /[\0\n\r]/.test(value) ||
    !isAbsolute(value) ||
    resolve(value) !== value
  )
    throw new Error('receiver_unavailable')
  return value
}

// 環境只描述既有target與本輪private root，不從名稱或路徑猜測身份。
export function readReceiverCaseEnvironment(
  env: Record<string, string | undefined> = process.env,
): ReceiverCaseEnvironment {
  try {
    if (!receiverClientEnabled(env) || env.RDWEB_TEST_RECEIVER_MODE !== MODE)
      throw new Error('receiver_unavailable')
    if (
      typeof env.RDWEB_TEST_RECEIVER_TARGET_NAME !== 'string' ||
      !TARGET_NAME.test(env.RDWEB_TEST_RECEIVER_TARGET_NAME) ||
      typeof env.RDWEB_TEST_RECEIVER_USERNAME !== 'string' ||
      !USERNAME.test(env.RDWEB_TEST_RECEIVER_USERNAME) ||
      typeof env.RDWEB_E2E_PASSWORD !== 'string' ||
      env.RDWEB_E2E_PASSWORD.length < 12
    )
      throw new Error('receiver_unavailable')
    // 只支援根路徑；subpath與舊矩陣需另立明確用途，不能沿用本入口。
    if (
      (env.APP_BASE_PATH !== undefined && env.APP_BASE_PATH !== '/') ||
      (env.RDWEB_B3_BASES !== undefined && env.RDWEB_B3_BASES !== '/') ||
      (env.RDWEB_B3_MODES !== undefined && env.RDWEB_B3_MODES !== 'preserve')
    )
      throw new Error('receiver_unavailable')
    // endpoint先驗全部格式，避免prepare在部分設定下才失敗。
    readReceiverEndpoints(env)
    return {
      root: readRoot(env.RDWEB_TEST_RECEIVER_ROOT),
      targetName: env.RDWEB_TEST_RECEIVER_TARGET_NAME,
      username: env.RDWEB_TEST_RECEIVER_USERNAME,
      resultSource: readSource(env.RDWEB_TEST_RECEIVER_RESULT),
    }
  } catch {
    throw new Error('receiver_unavailable')
  }
}

// 建立同輪client；呼叫端只能取binding及兩個一次性動作，沒有任意檔案入口。
export function createReceiverCaseClient(
  runtime: ReceiverCaseEnvironment,
  env: Record<string, string | undefined> = process.env,
): ReceiverClientControl {
  try {
    return createReceiverClient(runtime.root, () => performance.now(), env)
  } catch {
    throw new Error('receiver_unavailable')
  }
}

// Client完成要求本輪身份、影像、提交、觀察、scope與收尾全部為真。
export function receiverClientCode(
  report: ReceiverClientReport,
): 'receiver_client_completed' | 'receiver_client_unavailable' {
  return report.identityVerified &&
    report.videoPresented &&
    report.submitted &&
    report.observationComplete &&
    report.scopeIntact &&
    report.resourcesClosed &&
    !report.unavailable
    ? 'receiver_client_completed'
    : 'receiver_client_unavailable'
}

// 已登入頁透過既有targets link開console；不建立target、不呼叫host helper。
export async function openSavedReceiverConsole(
  page: Page,
  runtime: ReceiverCaseEnvironment,
  binding: ReceiverBinding,
  onStage?: (stage: ReceiverClientStage) => void,
  onPolicy?: (gate: ReceiverPolicyGate) => void,
): Promise<Page> {
  let gate: ReceiverPolicyGate | undefined
  try {
    const trusted = validateReceiverBinding(binding)
    // 只有實際開頁時才載入Playwright helper，preflight匯入保持零外部I/O。
    const { loginUi, base } = await import('../management/helpers/fixtures')
    onStage?.('login')
    await loginUi(page, runtime.username)
    onStage?.('target_selection')
    await page.goto(base + '/targets')
    const row = page.locator('tbody tr').filter({ hasText: runtime.targetName })
    // 導航完成不代表API表格已呈現；先有界等待，再驗唯一列與peerId，不重送連線。
    await row.first().waitFor({ state: 'visible', timeout: 15000 })
    if (
      (await row.count()) !== 1 ||
      (await row.getByRole('cell', { name: trusted.peerId, exact: true }).count()) !== 1
    )
      throw new Error('receiver_unavailable')
    const link = row.getByRole('link', { name: '連線', exact: true })
    const href = await link.getAttribute('href')
    if (!href) throw new Error('receiver_unavailable')
    onStage?.('ready_policy')
    // 原生Node preflight只需環境／marker，不提前載入瀏覽器gate或其轉譯相依。
    const { installReceiverPolicyGate } = await import('./test-receiver-policy')
    gate = await installReceiverPolicyGate(page, href, base)
    onPolicy?.(gate)
    return await gate.prepare(link)
  } catch {
    await gate?.dispose()
    throw new Error('receiver_unavailable')
  }
}
