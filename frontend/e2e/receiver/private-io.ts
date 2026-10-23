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
import { dirname, join, resolve } from 'node:path'
import {
  receiverUnavailable,
  validateReceiverBinding,
  validateReceiverEndpoints,
  validateReceiverResult,
  validateReceiverClient,
  receiverFields,
  type ReceiverBinding,
  type ReceiverClientReport,
  type ReceiverEndpoints,
  type ReceiverResult,
} from './contract.ts'

type Name =
  | 'binding.json'
  | 'connection.json'
  | 'claim.json'
  | 'result.json'
  | 'client.json'
  | 'start-request.json'
  | 'joined.json'
const NAMES: Name[] = [
  'binding.json',
  'connection.json',
  'claim.json',
  'result.json',
  'client.json',
  'start-request.json',
  'joined.json',
]

// 先排除舊用途與非Linux，避免跨流程資料讀取或把POSIX mode當NTFS DACL。
function purpose(root: string): string {
  const path = resolve(root)
  if (
    process.platform !== 'linux' ||
    path
      .split('/')
      .some(
        /* 所有舊host子用途都不屬新receiver。 */ (part) =>
          /^windows-host-(observer|input-only|handoff.*)$/.test(part),
      )
  )
    return receiverUnavailable()
  return path
}

// 所有祖先不跟symlink，最末新樹必須同owner／0700。
function directory(root: string): string {
  const path = purpose(root)
  for (let p = path; ; p = dirname(p)) {
    const s = lstatSync(p)
    if (!s.isDirectory() || s.isSymbolicLink()) return receiverUnavailable()
    if (p === path && (s.uid !== process.getuid!() || (s.mode & 0o777) !== 0o700))
      return receiverUnavailable()
    if (p === dirname(p)) break
  }
  return path
}

// JSON.parse之後額外掃描重複key（含轉義等價字串）；8KiB內不執行不可信getter。
function parse(bytes: Uint8Array): unknown {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const value: unknown = JSON.parse(text)
  const stack: Array<Set<string> | null> = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') {
      if (stack.length >= 8) return receiverUnavailable()
      stack.push(text[i] === '{' ? new Set() : null)
    } else if (text[i] === '}' || text[i] === ']') stack.pop()
    else if (text[i] === '"') {
      const start = i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++
        i++
      }
      let next = i + 1
      while (/\s/.test(text[next] ?? '') && next < text.length) next++
      const keys = stack.at(-1)
      if (text[next] === ':' && keys) {
        const key = JSON.parse(text.slice(start, i + 1)) as string
        if (keys.has(key)) return receiverUnavailable()
        keys.add(key)
      }
    }
  }
  return value
}

// 以同一descriptor驗身份／owner／mode／singlelink，讀後再驗size／mtime。
function readPath(path: string): unknown {
  const before = lstatSync(path)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.uid !== process.getuid!() ||
    (before.mode & 0o777) !== 0o600 ||
    before.size > 8192
  )
    return receiverUnavailable()
  const bytes = Buffer.alloc(8193)
  let fd: number | undefined
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const s = fstatSync(fd)
    if (
      s.dev !== before.dev ||
      s.ino !== before.ino ||
      s.size !== before.size ||
      s.nlink !== 1 ||
      s.uid !== process.getuid!() ||
      (s.mode & 0o777) !== 0o600
    )
      return receiverUnavailable()
    const n = readSync(fd, bytes, 0, bytes.length, 0),
      after = fstatSync(fd)
    if (
      n !== s.size ||
      n > 8192 ||
      after.size !== s.size ||
      after.mtimeMs !== s.mtimeMs ||
      after.ctimeMs !== s.ctimeMs
    )
      return receiverUnavailable()
    return parse(bytes.subarray(0, n))
  } finally {
    bytes.fill(0)
    if (fd !== undefined) closeSync(fd)
  }
}

// root內只允許固定檔名；路徑先經directory守衛，來源檔另用readPath驗自身。
function read(root: string, name: Name): unknown {
  if (!NAMES.includes(name)) return receiverUnavailable()
  return readPath(join(directory(root), name))
}

// 大小先驗再exclusive建立，絕不縮權或覆寫操作者已存在的檔案。
function write(root: string, name: Name, value: unknown): void {
  const bytes = Buffer.from(JSON.stringify(value) + '\n')
  try {
    if (bytes.length > 8192) return receiverUnavailable()
    writeFileSync(join(directory(root), name), bytes, { flag: 'wx', mode: 0o600 })
  } finally {
    bytes.fill(0)
  }
}

// 真正claim／結果保存必須仍在有效期，UTC不是跨主機順序證據。
function fresh(binding: ReceiverBinding): void {
  const now = Date.now()
  if (
    !Number.isFinite(now) ||
    now < Date.parse(binding.createdUtc) ||
    now >= Date.parse(binding.expiresUtc)
  )
    receiverUnavailable()
}

// 新樹已存在或祖先不安全就停，不自動archive／清理失敗產物。
export function createReceiverRun(
  root: string,
  binding: ReceiverBinding,
  endpoints: ReceiverEndpoints,
): void {
  try {
    const b = validateReceiverBinding(binding),
      e = validateReceiverEndpoints(endpoints),
      path = purpose(root)
    directory(dirname(path))
    mkdirSync(path, { mode: 0o700 })
    write(path, 'binding.json', b)
    write(path, 'connection.json', e)
  } catch {
    receiverUnavailable()
  }
}

// 所有公開reader失敗遮罩，不回傳路徑或原生exception。
export function readReceiverJson(root: string, name: Exclude<Name, 'claim.json'>): unknown {
  try {
    return read(root, name)
  } catch {
    return receiverUnavailable()
  }
}

// 只接受固定四欄同輪header；任何額外欄位或accessor都拒絕。
function headerMatches(
  value: { schemaVersion?: unknown; purpose?: unknown; runId?: unknown; requestId?: unknown },
  binding: ReceiverBinding,
): boolean {
  return (
    value.schemaVersion === 1 &&
    value.purpose === binding.purpose &&
    value.runId === binding.runId &&
    value.requestId === binding.requestId
  )
}

// claim／start等內部檔先用descriptor複本，再比對同輪header。
function matchesRun(value: unknown, binding: ReceiverBinding): boolean {
  try {
    return headerMatches(
      receiverFields(value, ['schemaVersion', 'purpose', 'runId', 'requestId']),
      binding,
    )
  } catch {
    return false
  }
}

// claim只由同輪client／import重驗，不提供任意檔名。
export function readReceiverClaim(root: string): unknown {
  try {
    return read(root, 'claim.json')
  } catch {
    return receiverUnavailable()
  }
}

// 操作者帶回的result仍是同owner／0600／singlelink／nofollow私有檔。
export function readReceiverSource(source: string): unknown {
  try {
    return readPath(resolve(source))
  } catch {
    return receiverUnavailable()
  }
}

// start-request只在新claim且有效期內建立一次，不扮演receiver執行授權。
export function writeReceiverStart(root: string, binding: ReceiverBinding): void {
  try {
    const b = validateReceiverBinding(binding)
    fresh(b)
    if (!matchesRun(read(root, 'claim.json'), b)) return receiverUnavailable()
    write(root, 'start-request.json', {
      schemaVersion: 1,
      purpose: b.purpose,
      runId: b.runId,
      requestId: b.requestId,
    })
  } catch {
    receiverUnavailable()
  }
}

// client report必須在start後落盤，且只接受同輪已驗schema。
export function writeReceiverClient(root: string, client: ReceiverClientReport): void {
  try {
    const b = validateReceiverBinding(read(root, 'binding.json')),
      c = validateReceiverClient(client)
    if (!headerMatches(c, b) || !matchesRun(read(root, 'start-request.json'), b))
      return receiverUnavailable()
    write(root, 'client.json', c)
  } catch {
    receiverUnavailable()
  }
}

// joined是client與receiver的關聯摘要；仍以同輪claim及CreateNew保存。
export function writeReceiverJoined(root: string, value: unknown): void {
  try {
    const b = validateReceiverBinding(read(root, 'binding.json')),
      v = receiverFields(value, [
        'schemaVersion',
        'purpose',
        'runId',
        'requestId',
        'crossClockOrder',
        'client',
        'receiver',
        'joined',
      ])
    if (
      !headerMatches(v, b) ||
      v.crossClockOrder !== 'unknown' ||
      !matchesRun(read(root, 'claim.json'), b)
    )
      return receiverUnavailable()
    write(root, 'joined.json', v)
  } catch {
    receiverUnavailable()
  }
}

// claim只做一次，失敗不退回可重用狀態或換run重試。
export function claimReceiverRun(root: string): ReceiverBinding {
  try {
    const b = validateReceiverBinding(read(root, 'binding.json'))
    fresh(b)
    validateReceiverEndpoints(read(root, 'connection.json'))
    write(root, 'claim.json', {
      schemaVersion: 1,
      purpose: b.purpose,
      runId: b.runId,
      requestId: b.requestId,
    })
    return b
  } catch {
    return receiverUnavailable()
  }
}

// 實際claim及同輪header先驗；只有新安全結果可CreateNew落盤。
export function writeReceiverResult(root: string, result: ReceiverResult): void {
  try {
    const b = validateReceiverBinding(read(root, 'binding.json')),
      r = validateReceiverResult(result)
    fresh(b)
    const claim = receiverFields(read(root, 'claim.json'), [
      'schemaVersion',
      'purpose',
      'runId',
      'requestId',
    ])
    if (
      claim.schemaVersion !== 1 ||
      claim.purpose !== b.purpose ||
      claim.runId !== b.runId ||
      claim.requestId !== b.requestId ||
      r.runId !== b.runId ||
      r.requestId !== b.requestId
    )
      return receiverUnavailable()
    write(root, 'result.json', r)
  } catch {
    receiverUnavailable()
  }
}
