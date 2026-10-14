import {
  hostUnavailable,
  validateHostManifest,
  validateHostRequest,
  validateHostReady,
  validateHostResult,
  validateHostTimeline,
  type HostManifest,
  type HostMainTimeline,
} from './host-observation-schema.ts'
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
const defaultDirectory = fileURLToPath(
  new URL('../.cache/windows-host-observer/current/', import.meta.url),
)
// 不opt-in完全不I/O；非法值／CI／平台／prefix在副作用前拒絕。
function enabled(env: Environment): boolean {
  const flag = env.RDWEB_WINDOWS_HOST_OBSERVE
  if (flag === undefined || flag === '0') return false
  if (
    flag !== '1' ||
    process.platform !== 'linux' ||
    env.CI ||
    env.GITHUB_ACTIONS ||
    env.RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG !== '1' ||
    env.RDWEB_INPUT_PLATFORMS !== 'windows' ||
    (env.RDWEB_INPUT_CHANNELS ?? env.RDWEB_INPUT_CHANNEL ?? 'chromium') !== 'chromium' ||
    env.RDWEB_B3_BASES !== '/' ||
    env.RDWEB_B3_MODES !== 'preserve'
  )
    hostUnavailable()
  return true
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
// readonly preflight不建立／claim，geometry與runtime必一致。
export function readHostObservation(
  env: Environment = process.env,
  directory = defaultDirectory,
): HostManifest | null {
  if (!enabled(env)) return null
  try {
    const path = resolve(directory)
    identity(path)
    const m = validateHostManifest(read(join(path, 'manifest.json')))
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
  try {
    if (!enabled(env)) hostUnavailable()
    const path = resolve(directory)
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
  } catch {
    hostUnavailable()
  }
}
// claim只允許一案；start／poll固定60秒，finish不等待host或覆寫oracle。
export function createHostObservation(
  env: Environment = process.env,
  directory = defaultDirectory,
): {
  expected: string
  start(): void
  pollReady(): boolean
  finish(timeline: HostMainTimeline, code: string): void
} {
  try {
    const m = readHostObservation(env, directory)
    if (!m) hostUnavailable()
    const path = resolve(directory),
      owner = identity(path)
    write(join(path, 'claim.json'), { schemaVersion: 1, runId: m.runId })
    let closed = false,
      invalid = false,
      deadline = 0,
      last = 0
    let request: ReturnType<typeof validateHostRequest> | undefined
    // 重驗identity／manifest及單調期限，失效即永久停用setup，clock回退不能恢復。
    function active(): void {
      const now = performance.now()
      try {
        if (
          closed ||
          invalid ||
          !Number.isFinite(now) ||
          identity(path) !== owner ||
          now < last ||
          (deadline && now >= deadline) ||
          JSON.stringify(validateHostManifest(read(join(path, 'manifest.json')))) !==
            JSON.stringify(m)
        )
          hostUnavailable()
      } catch {
        invalid = true
        hostUnavailable()
      }
      last = now
    }
    return {
      expected: m.expected,
      // 首click前一次setup，不發任何產品控制消息。
      start(): void {
        try {
          active()
          if (request) hostUnavailable()
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
          deadline = performance.now() + 60000
        } catch {
          hostUnavailable()
        }
      },
      // 檔案有界poll，不讀Windows或剪貼簿；ready後停止setup期限。
      pollReady(): boolean {
        try {
          active()
          if (!request) hostUnavailable()
          if (missing(join(path, 'ready.json'))) return false
          validateHostReady(read(join(path, 'ready.json')), m, request)
          deadline = 0
          return true
        } catch {
          hostUnavailable()
        }
      },
      // 原case終態只存安全timeline及固定code，不改原strict結果。
      finish(timeline: HostMainTimeline, code: string): void {
        try {
          if (
            closed ||
            identity(path) !== owner ||
            !request ||
            typeof code !== 'string' ||
            !/^(?:host_client_failed|host_client_pass|host_setup_failed|input_clipboard_remote_input_(?:mismatch|clipboard_timeout|local_unavailable|no_local_result))$/.test(
              code,
            )
          )
            hostUnavailable()
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
  try {
    if (!enabled(env)) hostUnavailable()
    const path = resolve(directory)
    identity(path)
    const m = validateHostManifest(read(join(path, 'manifest.json')))
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
