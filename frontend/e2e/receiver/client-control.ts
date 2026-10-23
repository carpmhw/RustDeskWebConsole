import {
  joinReceiverResults,
  receiverFields,
  receiverUnavailable,
  validateReceiverBinding,
  validateReceiverClient,
  validateReceiverEndpoints,
  validateReceiverResult,
  type ReceiverBinding,
  type ReceiverClientReport,
  type ReceiverEndpoints,
  type ReceiverResult,
} from './contract.ts'
import {
  claimReceiverRun,
  createReceiverRun,
  readReceiverClaim,
  readReceiverJson,
  readReceiverSource,
  writeReceiverClient,
  writeReceiverJoined,
  writeReceiverResult,
  writeReceiverStart,
} from './private-io.ts'

// Client控制只暴露同輪binding與兩個一次性動作，不提供任意檔案或網路入口。
export interface ReceiverClientControl {
  binding: ReceiverBinding
  start(): void
  finish(report: ReceiverClientReport): void
}

// endpoint只從程序環境讀取固定host:last-port；不從argv、檔案或網路訊息補值。
export function readReceiverEndpoints(env: Record<string, string | undefined>): ReceiverEndpoints {
  try {
    // 只接受唯一分隔符前後皆非空的字串，IPv6不在本測試用途範圍。
    const endpoint = (name: string): { host: string; port: number } => {
      const value = env[name]
      if (typeof value !== 'string') return receiverUnavailable()
      const split = value.lastIndexOf(':')
      if (split <= 0 || split === value.length - 1) return receiverUnavailable()
      const host = value.slice(0, split),
        port = Number(value.slice(split + 1))
      return { host, port }
    }
    return validateReceiverEndpoints({
      hbbsUdp: endpoint('RDWEB_TEST_RECEIVER_HBBS_UDP'),
      hbbsTcp: endpoint('RDWEB_TEST_RECEIVER_HBBS_TCP'),
      hbbrTcp: endpoint('RDWEB_TEST_RECEIVER_HBBR_TCP'),
      serverPublicKey: env.RDWEB_TEST_RECEIVER_SERVER_PUBLIC_KEY,
    })
  } catch {
    return receiverUnavailable()
  }
}

// 新用途必須明確opt-in；CI、非Linux及舊host／文字logger flags混用都在I/O前拒絕。
export function receiverClientEnabled(env: Record<string, string | undefined>): boolean {
  if (process.platform !== 'linux') return false
  if (env.RDWEB_TEST_RECEIVER_LIVE !== '1') return false
  if (env.CI || env.GITHUB_ACTIONS) return false
  return ![
    'RDWEB_WINDOWS_HOST_OBSERVE',
    'RDWEB_WINDOWS_HOST_INPUT_ONLY',
    'RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG',
    'RDWEB_WINDOWS_TEXT_PROBE',
  ].some(
    /* 任一舊用途開啟即不可混用同輪。 */ (name) => env[name] !== undefined && env[name] !== '0',
  )
}

// root自身有效期仍以UTC為準；不因晚到檔案或mtime恢復。
function fresh(binding: ReceiverBinding): void {
  const now = Date.now()
  if (
    !Number.isFinite(now) ||
    now < Date.parse(binding.createdUtc) ||
    now >= Date.parse(binding.expiresUtc)
  )
    receiverUnavailable()
}

// start／claim只接受固定四欄同輪header，不從額外欄位猜測身份。
function sameRun(value: unknown, binding: ReceiverBinding): boolean {
  try {
    const v = receiverFields(value, ['schemaVersion', 'purpose', 'runId', 'requestId'])
    return (
      v.schemaVersion === 1 &&
      v.purpose === binding.purpose &&
      v.runId === binding.runId &&
      v.requestId === binding.requestId
    )
  } catch {
    return false
  }
}

// 已驗client／receiver結果只需比對型別化header。
function sameHeader(
  value: {
    schemaVersion: 1
    purpose: ReceiverBinding['purpose']
    runId: string
    requestId: string
  },
  binding: ReceiverBinding,
): boolean {
  return (
    value.schemaVersion === 1 &&
    value.purpose === binding.purpose &&
    value.runId === binding.runId &&
    value.requestId === binding.requestId
  )
}

// 準備只建立新私有root並claim一次；不開網路、不讀舊host用途。
export function prepareReceiverClient(
  root: string,
  binding: ReceiverBinding,
  endpoints: ReceiverEndpoints,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!receiverClientEnabled(env)) return receiverUnavailable()
  try {
    createReceiverRun(root, validateReceiverBinding(binding), validateReceiverEndpoints(endpoints))
    claimReceiverRun(root)
  } catch {
    receiverUnavailable()
  }
}

// Client在準備後讀同輪binding；start與finish各自只能成功一次。
export function createReceiverClient(
  root: string,
  now: () => number = () => performance.now(),
  env: Record<string, string | undefined> = process.env,
): ReceiverClientControl {
  if (!receiverClientEnabled(env)) return receiverUnavailable()
  try {
    const binding = validateReceiverBinding(readReceiverJson(root, 'binding.json'))
    fresh(binding)
    if (!sameRun(readReceiverClaim(root), binding)) return receiverUnavailable()
    let started = false,
      closed = false,
      startedAt = 0
    return {
      binding: Object.freeze({ ...binding }),
      // 先在記憶體驗時鐘，再以exclusive寫start-request；寫入失敗不得留下已啟動狀態。
      start(): void {
        try {
          if (started || closed) return receiverUnavailable()
          const value = now()
          if (!Number.isFinite(value) || value < 0) return receiverUnavailable()
          writeReceiverStart(root, binding)
          startedAt = value
          started = true
        } catch {
          receiverUnavailable()
        }
      },
      // 整案180秒由同一注入時鐘計算；倒退或超界都不保存client證據。
      finish(report: ReceiverClientReport): void {
        try {
          if (!started || closed) return receiverUnavailable()
          const value = now()
          if (!Number.isFinite(value) || value < startedAt || value - startedAt > 180000)
            return receiverUnavailable()
          const client = validateReceiverClient(report)
          if (!sameHeader(client, binding)) return receiverUnavailable()
          writeReceiverClient(root, client)
          closed = true
        } catch {
          receiverUnavailable()
        }
      },
    }
  } catch {
    return receiverUnavailable()
  }
}

// 匯入只接受同輪私有result；兩端安全證據join後才形成最終分類。
export function importReceiverResult(
  root: string,
  source: string,
  now: () => number = () => performance.now(),
  env: Record<string, string | undefined> = process.env,
): ReceiverResult {
  if (!receiverClientEnabled(env)) return receiverUnavailable()
  try {
    const value = now()
    if (!Number.isFinite(value) || value < 0) return receiverUnavailable()
    const binding = validateReceiverBinding(readReceiverJson(root, 'binding.json'))
    fresh(binding)
    if (!sameRun(readReceiverClaim(root), binding)) return receiverUnavailable()
    if (!sameRun(readReceiverJson(root, 'start-request.json'), binding))
      return receiverUnavailable()
    const client = validateReceiverClient(readReceiverJson(root, 'client.json'))
    if (!sameHeader(client, binding)) return receiverUnavailable()
    const receiver = validateReceiverResult(readReceiverSource(source))
    if (!sameHeader(receiver, binding)) return receiverUnavailable()
    const joined = joinReceiverResults(binding, receiver, client)
    writeReceiverResult(root, receiver)
    writeReceiverJoined(root, {
      schemaVersion: 1,
      purpose: binding.purpose,
      runId: binding.runId,
      requestId: binding.requestId,
      crossClockOrder: 'unknown',
      client,
      receiver,
      joined,
    })
    return joined
  } catch {
    return receiverUnavailable()
  }
}
