import { receiverFields, receiverUnavailable } from './contract.ts'

const PHASES = [
  'unknown',
  'setup',
  'udp_open',
  'register_pk',
  'hbbs_open',
  'register_peer',
  'await_peer',
  'relay_response',
  'hbbr_open',
  'relay_request',
  'public_key',
  'login',
  'input_window',
  'result_write',
  'complete',
] as const
const REASONS = [
  'unknown',
  'none',
  'invalid_setup',
  'io_failed',
  'eof',
  'decode_rejected',
  'unexpected_control',
  'registration_rejected',
  'authentication_rejected',
  'crypto_rejected',
  'deadline',
  'aborted',
  'budget_exceeded',
  'clock_invalid',
  'result_write_failed',
] as const
const RESOURCES = ['udp', 'hbbs', 'hbbr', 'session', 'timers'] as const
const CLOSE = ['unknown', 'not_acquired', 'confirmed', 'unconfirmed'] as const
const PREFIX = 'receiver_diagnostic,'
const MAX_LINE_BYTES = 1024
export type ReceiverDiagnosticPhase = (typeof PHASES)[number]
export type ReceiverDiagnosticReason = (typeof REASONS)[number]
export type ReceiverDiagnosticResource = (typeof RESOURCES)[number]
type CloseState = (typeof CLOSE)[number]
export interface ReceiverDiagnostic {
  version: 1
  phase: ReceiverDiagnosticPhase
  reason: ReceiverDiagnosticReason
  udpClose: CloseState
  hbbsClose: CloseState
  hbbrClose: CloseState
  sessionClose: CloseState
  timersClose: CloseState
  cleanupBudgetExceeded: boolean
}
export interface ReceiverDiagnosticRecorder {
  fail(phase: ReceiverDiagnosticPhase, reason: ReceiverDiagnosticReason): void
  acquire(resource: ReceiverDiagnosticResource): void
  close(resource: ReceiverDiagnosticResource, confirmed: boolean): void
  cleanupTimedOut(): void
  complete(): void
  snapshot(): Readonly<ReceiverDiagnostic>
}
const FIELDS = [
  'version',
  'phase',
  'reason',
  ...RESOURCES.map((r) => `${r}Close`),
  'cleanupBudgetExceeded',
]

// 未取得可信診斷時只回固定unknown，不把缺資料當成尚未取得資源或已成功。
export function unknownReceiverDiagnostic(): ReceiverDiagnostic {
  return {
    version: 1,
    phase: 'unknown',
    reason: 'unknown',
    udpClose: 'unknown',
    hbbsClose: 'unknown',
    hbbrClose: 'unknown',
    sessionClose: 'unknown',
    timersClose: 'unknown',
    cleanupBudgetExceeded: false,
  }
}

// 嚴格驗證固定純資料欄位；不呼叫getter或將未知值轉字串。
export function validateReceiverDiagnostic(value: unknown): ReceiverDiagnostic {
  const v = receiverFields(value, FIELDS)
  if (
    v.version !== 1 ||
    !PHASES.includes(v.phase as ReceiverDiagnosticPhase) ||
    !REASONS.includes(v.reason as ReceiverDiagnosticReason) ||
    typeof v.cleanupBudgetExceeded !== 'boolean' ||
    (v.phase === 'complete') !== (v.reason === 'none')
  )
    return receiverUnavailable()
  for (const r of RESOURCES)
    if (!CLOSE.includes(v[`${r}Close`] as CloseState)) return receiverUnavailable()
  if (
    v.phase === 'complete' &&
    (v.cleanupBudgetExceeded ||
      RESOURCES.some((r) => !['confirmed', 'not_acquired'].includes(v[`${r}Close`] as string)))
  )
    return receiverUnavailable()
  return v as unknown as ReceiverDiagnostic
}

// 每輪固定大小collector；首失敗與已確認的收尾負向證據均不可被晚到成功恢復。
export function createReceiverDiagnostic(): ReceiverDiagnosticRecorder {
  const value = unknownReceiverDiagnostic()
  for (const r of RESOURCES) value[`${r}Close`] = 'not_acquired'
  const failedClose = new Set<ReceiverDiagnosticResource>()
  let failed = false
  return {
    // 分支只給literal，未知輸入直接降為unknown而不洩漏值。
    fail(phase, reason) {
      if (failed) return
      failed = true
      value.phase = PHASES.includes(phase) && phase !== 'complete' ? phase : 'unknown'
      value.reason = REASONS.includes(reason) && reason !== 'none' ? reason : 'unknown'
    },
    // 開始取得便保守記為未確認，包含尚未回傳的connect。
    acquire(resource) {
      if (!RESOURCES.includes(resource)) return
      value[`${resource}Close`] = 'unconfirmed'
    },
    // false保留sticky負向；true只接受本輪確實取得過的資源。
    close(resource, confirmed) {
      if (!RESOURCES.includes(resource)) return
      const key = `${resource}Close` as const
      if (value[key] === 'not_acquired') return
      if (confirmed !== true) failedClose.add(resource)
      value[key] = confirmed === true && !failedClose.has(resource) ? 'confirmed' : 'unconfirmed'
    },
    // 僅由既有共用cleanup timer真正到期時呼叫。
    cleanupTimedOut() {
      value.cleanupBudgetExceeded = true
    },
    // 完整終態也不得掩蓋已知收尾失敗。
    complete() {
      if (
        !failed &&
        !failedClose.size &&
        !value.cleanupBudgetExceeded &&
        RESOURCES.every((r) => ['confirmed', 'not_acquired'].includes(value[`${r}Close`]))
      ) {
        value.phase = 'complete'
        value.reason = 'none'
      }
    },
    // 複本凍結，晚到callback只能改collector而不能改已交付的快照。
    snapshot() {
      return Object.freeze({ ...value })
    },
  }
}

// 只序列化驗證過的精確欄位，整行上限固定1024bytes。
export function formatReceiverDiagnostic(value: unknown): string {
  const line = PREFIX + JSON.stringify(validateReceiverDiagnostic(value))
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) return receiverUnavailable()
  return line
}

// stdout只能有一個完整marker；截斷、重複、超額或未知資料均退unknown。
export function parseReceiverDiagnostic(stdout: unknown): ReceiverDiagnostic {
  try {
    if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1048576)
      return unknownReceiverDiagnostic()
    const lines = stdout.split('\n')
    const matches = lines.filter((line) => line.startsWith(PREFIX))
    if (matches.length !== 1 || lines[lines.length - 1]!.startsWith(PREFIX))
      return unknownReceiverDiagnostic()
    const line = matches[0]!
    if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) return unknownReceiverDiagnostic()
    return validateReceiverDiagnostic(JSON.parse(line.slice(PREFIX.length)))
  } catch {
    return unknownReceiverDiagnostic()
  }
}
