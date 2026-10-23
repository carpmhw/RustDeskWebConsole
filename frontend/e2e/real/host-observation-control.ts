import {
  hostUnavailable,
  validateHostManifest,
  validateHostRequest,
  validateHostReady,
  validateHostResult,
  validateHostTimeline,
  validateInputOnlyClient,
  type HostManifest,
  type HostMainTimeline,
  type InputOnlyClientReport,
} from './host-observation-schema.ts'
import { classifyHostInputOnly } from './host-input-only.ts'
import {
  constants,
  lstatSync,
  fstatSync,
  openSync,
  closeSync,
  readSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
type Environment = Readonly<Record<string, string | undefined>>
type HostSetupFailureReason =
  | 'unknown'
  | 'closed'
  | 'clock_invalid'
  | 'clock_regressed'
  | 'identity_rejected'
  | 'deadline_exceeded'
  | 'manifest_rejected'
  | 'request_rejected'
  | 'ready_rejected'
type HostSetupDiagnostic = { reason: HostSetupFailureReason; elapsedMs: number | null }
type HostObservationController = {
  expected: string
  start(): void
  pollReady(): boolean
  finish(timeline: HostMainTimeline, code: string): void
}
type Purpose = 'hr' | 'input_only'
export type HostInputOnlyController = {
  expected: string
  // 首click前只建立一次同輪request。
  start(): void
  // 固定正式60秒ready gate。
  pollReady(): boolean
  // 收尾後只保存獨立安全report。
  finish(report: InputOnlyClientReport): void
}
const setupDiagnostics = new WeakMap<object, HostSetupDiagnostic>()

// 只認真正controller的私有來源，不讀未知物件或例外屬性；快照不能反向修改guard。
export function readHostSetupDiagnostic(controller: unknown): Readonly<HostSetupDiagnostic> {
  const value =
    typeof controller === 'object' && controller !== null
      ? setupDiagnostics.get(controller)
      : undefined
  return Object.freeze({ reason: value?.reason ?? 'unknown', elapsedMs: value?.elapsedMs ?? null })
}

const defaultDirectory = fileURLToPath(
  new URL('../../.cache/windows-host-observer/current/', import.meta.url),
)
const inputOnlyDirectory = fileURLToPath(
  new URL('../../.cache/windows-host-input-only/current/', import.meta.url),
)
// 不opt-in完全不I/O；非法值／CI／平台／prefix在副作用前拒絕。
function enabled(env: Environment, purpose: Purpose = 'hr'): boolean {
  const inputFlag = env.RDWEB_WINDOWS_HOST_INPUT_ONLY
  if (purpose === 'hr' && inputFlag !== undefined && inputFlag !== '0') hostUnavailable()
  if (purpose === 'input_only') {
    if (inputFlag === undefined || inputFlag === '0') return false
    if (
      inputFlag !== '1' ||
      [env.RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG, env.RDWEB_WINDOWS_TEXT_PROBE].some(
        /* 此用途不能保存clipboard原文或啟動人工文字probe。 */ (flag) =>
          flag !== undefined && flag !== '0',
      )
    )
      hostUnavailable()
  }
  const flag = env.RDWEB_WINDOWS_HOST_OBSERVE
  if (flag === undefined || flag === '0') return false
  if (
    flag !== '1' ||
    process.platform !== 'linux' ||
    env.CI ||
    env.GITHUB_ACTIONS ||
    (purpose === 'hr' && env.RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG !== '1') ||
    env.RDWEB_INPUT_PLATFORMS !== 'windows' ||
    (env.RDWEB_INPUT_CHANNELS ?? env.RDWEB_INPUT_CHANNEL ?? 'chromium') !== 'chromium' ||
    env.RDWEB_B3_BASES !== '/' ||
    env.RDWEB_B3_MODES !== 'preserve'
  )
    hostUnavailable()
  return true
}
// 在讀檔前拒絕另一用途的固定樹；自訂私有tmp仍須通過purpose守衛。
function directoryPurpose(path: string, purpose: Purpose): void {
  const parts = resolve(path).split('/')
  if (
    purpose === 'input_only'
      ? parts.some(
          /* 不碰原HR／handoff資料。 */ (part) =>
            /^windows-host-(?:observer|handoff(?:-.*)?)$/.test(part),
        )
      : parts.includes('windows-host-input-only')
  )
    hostUnavailable()
}
// 只接公開整數幾何，不複製任何runtime憑證。
function editor(env: Environment): HostManifest['editor'] {
  const names = ['X', 'Y', 'WIDTH', 'HEIGHT']
  const n = names.map(
    /* 使用既有授權矩形，非法值拒絕。 */ (key) => {
      const v = env['RDWEB_WINDOWS_EDITOR_' + key]
      if (!v || !/^\d+$/.test(v)) hostUnavailable()
      return Number(v)
    },
  )
  return { x: n[0]!, y: n[1]!, width: n[2]!, height: n[3]! }
}
// 祖先不跟symlink，current需同owner／0700；不宣稱抗同帳號競態。
function directoryChain(path: string): void {
  for (let p = resolve(path); ; p = dirname(p)) {
    const stat = lstatSync(p)
    if (!stat.isDirectory() || stat.isSymbolicLink()) hostUnavailable()
    if (p === dirname(p)) break
  }
}
// 專用current必須同owner與0700，回傳identity供case重驗。
function identity(path: string): string {
  directoryChain(path)
  const s = lstatSync(path)
  if (s.uid !== process.getuid!() || (s.mode & 0o777) !== 0o700) hostUnavailable()
  return `${s.dev}:${s.ino}`
}
// missing只接受ENOENT，其他錯誤不偽裝成缺檔。
function missing(path: string): boolean {
  try {
    lstatSync(path)
    return false
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return true
    return hostUnavailable()
  }
}
// 有界nofollow／普通0600單link讀取，暫存byte在finally清。
function read(path: string, limit = 8192): unknown {
  let fd: number | undefined
  const bytes = Buffer.alloc(limit + 1)
  try {
    directoryChain(dirname(path))
    const before = lstatSync(path)
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid!() ||
      (before.mode & 0o777) !== 0o600 ||
      before.size > limit
    )
      hostUnavailable()
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const s = fstatSync(fd)
    if (s.dev !== before.dev || s.ino !== before.ino || s.size !== before.size) hostUnavailable()
    const n = readSync(fd, bytes, 0, bytes.length, 0)
    if (n !== s.size || n > limit) hostUnavailable()
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, n)))
  } finally {
    bytes.fill(0)
    if (fd !== undefined) closeSync(fd)
  }
}
// exclusive寫新私有檔，從不覆寫舊檔；超額在open前拒絕。
function write(path: string, value: unknown, limit = 8192): void {
  const text = JSON.stringify(value) + '\n'
  if (Buffer.byteLength(text) > limit) hostUnavailable()
  let fd: number | undefined
  try {
    fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    )
    const s = fstatSync(fd)
    if ((s.mode & 0o777) !== 0o600 || s.uid !== process.getuid!() || s.nlink !== 1)
      hostUnavailable()
    writeFileSync(fd, text, 'utf8')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
// 用途不傳Windows；讀寫均沿同一nofollow核心，回identity供setup／finish防換檔。
function purposeIdentity(path: string, manifest: HostManifest, purpose: Purpose): string | null {
  const file = join(path, 'purpose.json')
  if (purpose === 'hr') {
    if (!missing(file)) hostUnavailable()
    return null
  }
  const before = lstatSync(file)
  const value = read(file) as { schemaVersion?: unknown; purpose?: unknown; runId?: unknown }
  const after = lstatSync(file)
  if (
    !value ||
    Object.keys(value).length !== 3 ||
    value.schemaVersion !== 1 ||
    value.purpose !== 'input_only' ||
    value.runId !== manifest.runId ||
    before.dev !== after.dev ||
    before.ino !== after.ino
  )
    hostUnavailable()
  return `${after.dev}:${after.ino}`
}
// readonly preflight不建立／claim，geometry與runtime必一致。
export function readHostObservation(
  env: Environment = process.env,
  directory = defaultDirectory,
): HostManifest | null {
  return readObservation(env, directory, 'hr')
}
// 新用途readonly preflight不讀原HR current；off不I/O。
export function readHostInputOnlyObservation(
  env: Environment = process.env,
  directory = inputOnlyDirectory,
): HostManifest | null {
  return readObservation(env, directory, 'input_only')
}
// 兩用途共用schema／private／scope／claim檢查，不靠改process.env轉用舊入口。
function readObservation(
  env: Environment,
  directory: string,
  purpose: Purpose,
): HostManifest | null {
  if (!enabled(env, purpose)) return null
  try {
    const path = resolve(directory)
    directoryPurpose(path, purpose)
    identity(path)
    const m = validateHostManifest(read(join(path, 'manifest.json')))
    purposeIdentity(path, m, purpose)
    if (JSON.stringify(m.editor) !== JSON.stringify(editor(env))) hostUnavailable()
    if (!missing(join(path, 'claim.json'))) hostUnavailable()
    return m
  } catch {
    return hostUnavailable()
  }
}
// 同輪準備只生成公開fixture，existing current拒絕且保留。
export function prepareHostObservation(
  env: Environment = process.env,
  directory = defaultDirectory,
): void {
  prepareObservation(env, directory, 'hr')
}
// 固定新root準備，只建立公開manifest及用途標記。
export function prepareHostInputOnlyObservation(
  env: Environment = process.env,
  directory = inputOnlyDirectory,
): void {
  prepareObservation(env, directory, 'input_only')
}
// 共用exclusive準備；任一步失敗保留已產資料，從不自動清理或重試。
function prepareObservation(env: Environment, directory: string, purpose: Purpose): void {
  try {
    if (!enabled(env, purpose)) hostUnavailable()
    const path = resolve(directory)
    directoryPurpose(path, purpose)
    if (!missing(path)) hostUnavailable()
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    identity(dirname(path))
    mkdirSync(path, { mode: 0o700 })
    identity(path)
    const createdUtc = new Date().toISOString()
    const m = validateHostManifest({
      schemaVersion: 1,
      runId: randomUUID(),
      expected: 'Public 中文 RdWeb ' + randomUUID(),
      editor: editor(env),
      createdUtc,
      expiresUtc: new Date(Date.parse(createdUtc) + 1800000).toISOString(),
    })
    write(join(path, 'manifest.json'), m)
    if (purpose === 'input_only')
      write(join(path, 'purpose.json'), { schemaVersion: 1, purpose: 'input_only', runId: m.runId })
  } catch {
    hostUnavailable()
  }
}
// claim只允許一案；start／poll固定60秒，finish不等待host或覆寫oracle。
export function createHostObservation(
  env: Environment = process.env,
  directory = defaultDirectory,
): HostObservationController {
  return createObservationController(env, directory, 60000)
}
// 新用途固定60秒，僅finish接受獨立Report，不授權原HR成功code。
export function createHostInputOnlyObservation(
  env: Environment = process.env,
  directory = inputOnlyDirectory,
): HostInputOnlyController {
  return createObservationController(env, directory, 60000, 'input_only')
}
// 獨立SFTP校準才用固定90秒；必須明確私有目錄，不能漏參數誤用正式current。
export function createHostHandoffObservation(
  env: Environment,
  directory: string,
): HostObservationController {
  if (
    !env ||
    typeof directory !== 'string' ||
    directory.length === 0 ||
    resolve(directory) === resolve(defaultDirectory)
  )
    return hostUnavailable()
  return createObservationController(env, directory, 90000)
}
// 兩個固定用途共用原guard／clock／poison，不提供外部可調deadline或重試入口。
function createObservationController(
  env: Environment,
  directory: string,
  setupBudgetMs: 60000 | 90000,
): HostObservationController
// 新用途沿相同狀態機，型別上與原timeline／code入口分離。
function createObservationController(
  env: Environment,
  directory: string,
  setupBudgetMs: 60000,
  purpose: 'input_only',
): HostInputOnlyController
// 私有固定用途核心不提供任意timeout或重試入口。
function createObservationController(
  env: Environment,
  directory: string,
  setupBudgetMs: 60000 | 90000,
  purpose: Purpose = 'hr',
): HostObservationController | HostInputOnlyController {
  try {
    const m = readObservation(env, directory, purpose) ?? hostUnavailable()
    const path = resolve(directory),
      owner = identity(path),
      marker = purposeIdentity(path, m, purpose)
    write(join(path, 'claim.json'), { schemaVersion: 1, runId: m.runId })
    let closed = false,
      invalid = false,
      deadline = 0,
      last = 0
    let startedAt: number | null = null
    let readyAccepted = false
    const diagnostic: HostSetupDiagnostic = { reason: 'unknown', elapsedMs: null }
    let request: ReturnType<typeof validateHostRequest> | undefined
    // 沿原clock樣本計算，未開始／倒退／非有限或超額皆unknown，不新增clockread。
    function sample(now: number): void {
      diagnostic.elapsedMs = null
      if (
        startedAt === null ||
        !Number.isFinite(startedAt) ||
        !Number.isFinite(now) ||
        now < last ||
        now < startedAt
      )
        return
      const elapsed = Math.floor(now - startedAt)
      if (Number.isSafeInteger(elapsed) && elapsed <= 2147483647) diagnostic.elapsedMs = elapsed
    }
    // 僅實際命中的既有拒絕分支可記白名單；原固定錯誤與poison行為不變。
    function reject(reason: HostSetupFailureReason): never {
      if (diagnostic.reason === 'unknown') diagnostic.reason = reason
      return hostUnavailable()
    }
    // 重驗identity／manifest及單調期限，失效即永久停用setup，clock回退不能恢復。
    function active(): void {
      if (!invalid) {
        diagnostic.reason = 'unknown'
        diagnostic.elapsedMs = null
      }
      const now = performance.now()
      if (!invalid) sample(now)
      try {
        if (closed) reject('closed')
        if (invalid) hostUnavailable()
        if (!Number.isFinite(now)) reject('clock_invalid')
        let sameIdentity = false
        try {
          sameIdentity = identity(path) === owner && purposeIdentity(path, m, purpose) === marker
        } catch {
          reject('identity_rejected')
        }
        if (!sameIdentity) reject('identity_rejected')
        if (now < last) reject('clock_regressed')
        if (deadline && now >= deadline) reject('deadline_exceeded')
        let sameManifest = false
        try {
          sameManifest =
            JSON.stringify(validateHostManifest(read(join(path, 'manifest.json')))) ===
            JSON.stringify(m)
        } catch {
          reject('manifest_rejected')
        }
        if (!sameManifest) reject('manifest_rejected')
      } catch {
        invalid = true
        hostUnavailable()
      }
      last = now
    }
    const controller = {
      expected: m.expected,
      // 首click前一次setup，不發任何產品控制消息。
      start(): void {
        try {
          active()
          if (request) reject('request_rejected')
          try {
            request = validateHostRequest(
              {
                schemaVersion: 1,
                runId: m.runId,
                requestId: randomUUID(),
                createdUtc: new Date().toISOString(),
              },
              m,
            )
            write(join(path, 'start-request.json'), request)
          } catch {
            reject('request_rejected')
          }
          startedAt = performance.now()
          deadline = startedAt + setupBudgetMs
          sample(startedAt)
        } catch {
          hostUnavailable()
        }
      },
      // 檔案有界poll，不讀Windows或剪貼簿；ready後停止setup期限。
      pollReady(): boolean {
        try {
          active()
          if (!request) reject('request_rejected')
          try {
            if (missing(join(path, 'ready.json'))) return false
            validateHostReady(read(join(path, 'ready.json')), m, request)
          } catch {
            reject('ready_rejected')
          }
          deadline = 0
          readyAccepted = true
          return true
        } catch {
          hostUnavailable()
        }
      },
      // 終態只存本用途安全摘要與固定code，不改原HR strict結果。
      finish(timeline: HostMainTimeline | InputOnlyClientReport, code?: string): void {
        try {
          if (
            closed ||
            identity(path) !== owner ||
            purposeIdentity(path, m, purpose) !== marker ||
            !request ||
            (purpose === 'hr' &&
              (typeof code !== 'string' ||
                !/^(?:host_client_failed|host_client_pass|host_setup_failed|input_clipboard_remote_input_(?:mismatch|clipboard_timeout|local_unavailable|no_local_result))$/.test(
                  code,
                )))
          )
            hostUnavailable()
          if (purpose === 'input_only') {
            const report = timeline as InputOnlyClientReport
            const names = ['code', 'main', 'encoded', 'timeline', 'observation', 'resourcesClosed']
            if (
              !report ||
              ![Object.prototype, null].includes(Object.getPrototypeOf(report)) ||
              Reflect.ownKeys(report).length !== names.length ||
              names.some(
                /* 展開前拒絕getter／額外欄位，不執行不可信程式。 */ (name) => {
                  const descriptor = Object.getOwnPropertyDescriptor(report, name)
                  return !descriptor || !Object.hasOwn(descriptor, 'value')
                },
              )
            )
              hostUnavailable()
            const client = validateInputOnlyClient(
              {
                ...report,
                schemaVersion: 1,
                purpose: 'input_only',
                runId: m.runId,
                requestId: request.requestId,
                code: invalid || !readyAccepted ? 'input_only_setup_failed' : report.code,
              },
              m,
              request,
            )
            write(join(path, 'client.json'), client, 65536)
            closed = true
            return
          }
          const t = validateHostTimeline(timeline)
          write(
            join(path, 'client.json'),
            {
              schemaVersion: 1,
              runId: m.runId,
              requestId: request.requestId,
              code: invalid ? 'host_setup_failed' : code,
              timeline: t,
            },
            65536,
          )
          closed = true
        } catch {
          hostUnavailable()
        }
      },
    }
    setupDiagnostics.set(controller, diagnostic)
    return controller
  } catch {
    return hostUnavailable()
  }
}
// 只匯入matching固定schema，joined是兩個時鐘來源，不改client FAIL。
export function importHostObservation(
  kind: string,
  source: string,
  env: Environment = process.env,
  directory = defaultDirectory,
): void {
  importObservation(kind, source, env, directory, 'hr')
}
// 新用途import只產生獨立joined，不改原HR資料與code。
export function importHostInputOnlyObservation(
  kind: string,
  source: string,
  env: Environment = process.env,
  directory = inputOnlyDirectory,
): void {
  importObservation(kind, source, env, directory, 'input_only')
}
// 同一安全I/O／同輪／exclusive匯入核心，各用途用各自client validator。
function importObservation(
  kind: string,
  source: string,
  env: Environment,
  directory: string,
  purpose: Purpose,
): void {
  try {
    if (!enabled(env, purpose)) hostUnavailable()
    const path = resolve(directory)
    directoryPurpose(path, purpose)
    identity(path)
    const m = validateHostManifest(read(join(path, 'manifest.json')))
    purposeIdentity(path, m, purpose)
    const request = validateHostRequest(read(join(path, 'start-request.json')), m)
    const claim = read(join(path, 'claim.json')) as { schemaVersion?: unknown; runId?: unknown }
    if (
      !claim ||
      Object.keys(claim).length !== 2 ||
      claim.schemaVersion !== 1 ||
      claim.runId !== m.runId
    )
      hostUnavailable()
    if (kind === 'ready') {
      if (!missing(join(path, 'client.json'))) hostUnavailable()
      const ready = validateHostReady(read(resolve(source)), m, request)
      write(join(path, 'ready.json'), ready)
    } else if (kind === 'result') {
      if (!missing(join(path, 'joined.json')) || !missing(join(path, 'result.json')))
        hostUnavailable()
      const ready = validateHostReady(read(join(path, 'ready.json')), m, request)
      const result = validateHostResult(read(resolve(source), 65536), m, request)
      if (result.startedUtc !== ready.utc) hostUnavailable()
      if (purpose === 'input_only') {
        const client = validateInputOnlyClient(read(join(path, 'client.json'), 65536), m, request)
        write(
          join(path, 'joined.json'),
          {
            schemaVersion: 1,
            purpose: 'input_only',
            runId: m.runId,
            requestId: request.requestId,
            crossClockOrder: 'unknown',
            client,
            host: result,
            classification: classifyHostInputOnly(client, result),
          },
          131072,
        )
        write(join(path, 'result.json'), result, 65536)
        return
      }
      const client = read(join(path, 'client.json'), 65536) as {
        schemaVersion?: unknown
        runId?: unknown
        requestId?: unknown
        code?: unknown
        timeline?: unknown
      }
      if (
        !client ||
        Object.keys(client).length !== 5 ||
        client.schemaVersion !== 1 ||
        client.runId !== m.runId ||
        client.requestId !== request.requestId ||
        typeof client.code !== 'string' ||
        !/^(?:host_client_failed|host_client_pass|host_setup_failed|input_clipboard_remote_input_(?:mismatch|clipboard_timeout|local_unavailable|no_local_result))$/.test(
          client.code,
        )
      )
        hostUnavailable()
      validateHostTimeline(client.timeline)
      write(
        join(path, 'joined.json'),
        {
          schemaVersion: 1,
          runId: m.runId,
          requestId: request.requestId,
          crossClockOrder: 'unknown',
          client,
          host: result,
        },
        131072,
      )
      write(join(path, 'result.json'), result, 65536)
    } else hostUnavailable()
  } catch {
    hostUnavailable()
  }
}
