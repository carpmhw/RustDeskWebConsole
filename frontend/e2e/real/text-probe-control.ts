import type { TextOnlyEvidence } from './input-diagnostics'
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { interactionClock, utf8 } from '../../src/rdweb/interaction-limits.ts'
import type { Environment } from './text-probe-runtime'
const defaultDirectory = fileURLToPath(
  new URL('../../.cache/windows-text-probe/current/', import.meta.url),
)
const evidenceFields = [
  'prefixSubmitted',
  'prefixAccepted',
  'postTextInput',
  'clipboardObserved',
  'scopeInterrupted',
  'overflow',
] as const
const classifications = ['looks_intact', 'reordered_or_partial', 'uncertain'] as const
const codes = [
  ...classifications.map(/* 三分類固定對應結果。 */ (value) => 'text_probe_' + value),
  'text_probe_observation_timeout',
  'text_probe_interrupted',
  'text_probe_submission_unavailable',
  'text_probe_control_unavailable',
]
export type TextProbeObservation = 'looks_intact' | 'reordered_or_partial' | 'uncertain'
export type TextProbeCode =
  | 'text_probe_looks_intact'
  | 'text_probe_reordered_or_partial'
  | 'text_probe_uncertain'
  | 'text_probe_observation_timeout'
  | 'text_probe_interrupted'
  | 'text_probe_submission_unavailable'
  | 'text_probe_control_unavailable'
export interface TextProbeControl {
  // 只在完整prefix被接受後開始一次窗口。
  arm(expected: string): void
  // 有界讀取人工分類，不延長期限。
  poll(): TextProbeObservation | null
  // 落固定安全結果且傳回最終code，不能以逾時的分類補成功。
  finish(code: TextProbeCode, evidence: TextOnlyEvidence): TextProbeCode
  // 清本機短命scope，不刪診斷檔。
  dispose(): void
}
// 最終資源未收回須回干擾code，不以較早人工分類冒充收尾成功。
export function textProbeCleanupCode(code: TextProbeCode, resourcesClosed: boolean): TextProbeCode {
  return resourcesClosed ? code : 'text_probe_interrupted'
}
// 所有檔案錯誤遮罩為固定code，不傳原值或原生exception。
function unavailable(): never {
  throw new Error('text_probe_control_unavailable')
}
// 控制CLI不需要Windowsruntime秘密，只驗本機opt-in與CI隔離。
function enabled(env: Environment): void {
  if (
    process.platform !== 'linux' ||
    env.RDWEB_WINDOWS_TEXT_PROBE !== '1' ||
    env.CI ||
    env.GITHUB_ACTIONS
  )
    unavailable()
}
// 僅容許普通祖先目錄，不跟隨symlink；不宣稱抵抗惡意同帳號競態。
function ancestors(path: string): void {
  for (let parent = path; ; parent = dirname(parent)) {
    try {
      if (!lstatSync(parent).isDirectory()) unavailable()
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') unavailable()
    }
    if (dirname(parent) === parent) break
  }
}
// missing只接受ENOENT，權限錯誤或symlink都不能偽裝成不存在。
function missing(path: string): boolean {
  try {
    lstatSync(path)
    return false
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return true
    unavailable()
  }
}
// 檢查scope同帳號與0700，回inode讓owner每次操作再核對。
function privateDirectory(path: string): string {
  ancestors(path)
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.uid !== process.getuid!() || (stat.mode & 0o777) !== 0o700)
    unavailable()
  return `${stat.dev}:${stat.ino}`
}
// 只讀preflight不mkdir；舊current一律拒絕，不刪或覆寫。
export function assertTextProbeAvailable(
  env: Environment = process.env,
  directory = defaultDirectory,
): void {
  try {
    enabled(env)
    const path = resolve(directory)
    ancestors(dirname(path))
    if (!missing(dirname(path))) privateDirectory(dirname(path))
    if (!missing(path)) unavailable()
  } catch {
    unavailable()
  }
}
// 有界nofollow讀普通0600且同owner／單link檔，不讀超額內容或外部symlink。
function readJson(path: string): Record<string, unknown> {
  let fd: number | undefined
  try {
    const before = lstatSync(path)
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid!() ||
      (before.mode & 0o777) !== 0o600 ||
      before.size > 32768
    )
      unavailable()
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = fstatSync(fd)
    if (stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size)
      unavailable()
    const bytes = Buffer.alloc(32769)
    const size = readSync(fd, bytes, 0, bytes.length, 0)
    if (size !== stat.size || size > 32768) unavailable()
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)),
    )
    bytes.fill(0)
    if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable()
    return value as Record<string, unknown>
  } catch {
    return unavailable()
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
// 固定schema以白名單檢查，禁止任意metadata落檔。
function fields(value: Record<string, unknown>, names: readonly string[]): void {
  if (
    Object.keys(value).length !== names.length ||
    Object.keys(value).some(/* 不允許未核准欄位。 */ (key) => !names.includes(key))
  )
    unavailable()
}
// 只收Public及產品有效scalar／4096byte，清編碼暫存不宣稱清JS字串。
function publicText(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.startsWith('Public ')) unavailable()
  utf8(value, 4096, 'text_probe_control_unavailable').fill(0)
}
// 以exclusive0600新檔寫固定schema，從不覆寫既有檔案。
function writeJson(path: string, value: unknown): void {
  let fd: number | undefined
  try {
    fd = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
    if ((fstatSync(fd).mode & 0o777) !== 0o600) unavailable()
    writeFileSync(fd, JSON.stringify(value) + '\n', 'utf8')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
// ready timestamps具UTC且間隔固定120秒，expected不回終端或summary。
function readyFile(path: string): { utc: string; deadlineUtc: string; expected: string } {
  const value = readJson(join(path, 'ready.json'))
  fields(value, ['phase', 'utc', 'deadlineUtc', 'expected'])
  publicText(value.expected)
  if (
    value.phase !== 'ready' ||
    typeof value.utc !== 'string' ||
    typeof value.deadlineUtc !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.utc) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.deadlineUtc) ||
    Date.parse(value.deadlineUtc) - Date.parse(value.utc) !== 120000
  )
    unavailable()
  return value as { utc: string; deadlineUtc: string; expected: string }
}
// 人工分類必須綁本輪ready與deadline，舊檔或任意值無法補本輪。
function observation(path: string, utc: string, deadlineUtc: string): TextProbeObservation | null {
  const file = join(path, 'observation.json')
  if (missing(file)) return null
  const value = readJson(file)
  fields(value, ['classification', 'readyUtc', 'deadlineUtc'])
  if (
    value.readyUtc !== utc ||
    value.deadlineUtc !== deadlineUtc ||
    !classifications.includes(value.classification as TextProbeObservation)
  )
    unavailable()
  return value.classification as TextProbeObservation
}
// exclusive擁有fresh私有scope；deadline使用原單調＋wallclock最大經過時間，不受mtime延長。
export function createTextProbeControl(
  env: Environment = process.env,
  directory = defaultDirectory,
  now: () => number = interactionClock(),
): TextProbeControl {
  const path = resolve(directory)
  let identity: string
  try {
    assertTextProbeAvailable(env, path)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    privateDirectory(dirname(path))
    mkdirSync(path, { mode: 0o700 })
    identity = privateDirectory(path)
  } catch {
    unavailable()
  }
  let disposed = false,
    finished = false,
    deadline: number | null = null,
    utc = '',
    deadlineUtc = '',
    observed: TextProbeObservation | null = null,
    lastTime = -Infinity
  // 每次再驗owner identity與closed狀態，防替換scope或重複終結。
  function active(): void {
    if (disposed || finished || privateDirectory(path) !== identity) unavailable()
  }
  // 注入clock仍單調不倒退；非法clock亦不得延長窗口。
  function time(): number {
    const value = now()
    if (!Number.isFinite(value)) unavailable()
    lastTime = Math.max(lastTime, value)
    return lastTime
  }
  return {
    // 只arm一次；未取得prefix時不建立ready供人工完成。
    arm(expected): void {
      try {
        active()
        if (deadline !== null) unavailable()
        publicText(expected)
        const start = time(),
          wall = Date.now()
        utc = new Date(wall).toISOString()
        deadlineUtc = new Date(wall + 120000).toISOString()
        writeJson(join(path, 'ready.json'), { phase: 'ready', utc, deadlineUtc, expected })
        deadline = start + 120000
      } catch {
        unavailable()
      }
    },
    // 先驗literal期限才讀分類，更新檔案或晚回覆不延期。
    poll(): TextProbeObservation | null {
      try {
        active()
        if (deadline === null) unavailable()
        if (time() >= deadline) throw new Error('text_probe_observation_timeout')
        observed = observation(path, utc, deadlineUtc)
        return observed
      } catch (error) {
        if (error instanceof Error && error.message === 'text_probe_observation_timeout')
          throw error
        unavailable()
      }
    },
    // 再驗deadline與最新摘要，干擾或逾時不能落looks_intact，永不算native驗收。
    finish(code, evidence): TextProbeCode {
      try {
        active()
        if (!codes.includes(code) || !evidence || typeof evidence !== 'object') unavailable()
        fields(evidence as unknown as Record<string, unknown>, evidenceFields)
        if (
          !evidenceFields.every(
            /* 摘要只接受固定boolean。 */ (key) => typeof evidence[key] === 'boolean',
          )
        )
          unavailable()
        const classified = classifications.some(
          /* 固定分類code，不接受任意字串前綴。 */ (value) => code === 'text_probe_' + value,
        )
        if (classified) {
          if (deadline === null) unavailable()
          if (time() >= deadline) code = 'text_probe_observation_timeout'
          else if (
            evidence.postTextInput ||
            evidence.clipboardObserved ||
            evidence.scopeInterrupted ||
            evidence.overflow
          )
            code = 'text_probe_interrupted'
          else if (!evidence.prefixSubmitted || !evidence.prefixAccepted)
            code = 'text_probe_submission_unavailable'
          else if (
            !observed ||
            code !== 'text_probe_' + observed ||
            observation(path, utc, deadlineUtc) !== observed
          )
            unavailable()
        }
        writeJson(join(path, 'result.json'), {
          utc: new Date().toISOString(),
          code,
          evidence: { ...evidence },
          nativeTextVerified: false,
          clipboardVerified: false,
        })
        finished = true
        observed = null
        utc = deadlineUtc = ''
        return code
      } catch {
        unavailable()
      }
    },
    // 所有結果檔保留本機檢視；關閉RAM scope，不偷偷刪current使舊回覆重用。
    dispose(): void {
      disposed = true
      observed = null
      utc = deadlineUtc = ''
      deadline = null
    },
  }
}
// 第二終端只傳固定分類，atomic exclusive提交不覆寫舊回覆；runner仍以自身clock驗期限。
export function completeTextProbe(classification: unknown, directory = defaultDirectory): void {
  let temp: string | undefined
  try {
    enabled(process.env)
    if (!classifications.includes(classification as TextProbeObservation)) unavailable()
    const path = resolve(directory)
    privateDirectory(dirname(path))
    privateDirectory(path)
    if (!missing(join(path, 'result.json')) || !missing(join(path, 'observation.json')))
      unavailable()
    const ready = readyFile(path),
      wall = Date.now()
    if (wall < Date.parse(ready.utc) || wall >= Date.parse(ready.deadlineUtc)) unavailable()
    // exclusive claim防同時兩個CLI互覆；殘留claim亦fail closed，不自動重用。
    writeJson(join(path, 'completion.json'), { phase: 'completing' })
    const candidate: string = join(path, '.observation-' + randomUUID())
    temp = candidate
    writeJson(candidate, { classification, readyUtc: ready.utc, deadlineUtc: ready.deadlineUtc })
    if (
      !missing(join(path, 'result.json')) ||
      !missing(join(path, 'observation.json')) ||
      Date.now() >= Date.parse(ready.deadlineUtc)
    )
      unavailable()
    renameSync(candidate, join(path, 'observation.json'))
  } catch {
    unavailable()
  } finally {
    try {
      if (temp && !missing(temp)) unlinkSync(temp)
    } catch {
      unavailable()
    }
  }
}
