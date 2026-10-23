import { readFileSync, writeFileSync, lstatSync } from 'node:fs'
import { createSocket, type Socket as DgramSocket } from 'node:dgram'
import { createConnection, type Socket as NetSocket } from 'node:net'
import { lookup } from 'node:dns/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  receiverFields,
  receiverUnavailable,
  validateReceiverBinding,
  validateReceiverEndpoints,
  validateReceiverResult,
  RECEIVER_FLAGS,
  type ReceiverBinding,
  type ReceiverEndpoint,
  type ReceiverEndpoints,
  type ReceiverResult,
} from './contract.ts'
import { claimReceiverRun, readReceiverJson, writeReceiverResult } from './private-io.ts'
import { runReceiver } from './runtime.ts'
import type { ReceiverDuplex, ReceiverNetwork } from './rendezvous.ts'
import {
  createReceiverDiagnostic,
  formatReceiverDiagnostic,
  unknownReceiverDiagnostic,
  type ReceiverDiagnostic,
  type ReceiverDiagnosticRecorder,
  type ReceiverDiagnosticResource,
} from './diagnostic.ts'

const ENV_KEY = 'RDWEB_TEST_RECEIVER_PASSWORD'
const WINDOWS_ENTRY_ENV = 'RDWEB_RECEIVER_PRIVATE_ENTRY'
const MAX_PASSWORD_BYTES = 4096
const MAX_RAW_BYTES = 262144
const MAX_RESULT_BYTES = 8192
const CLOSE_TIMEOUT_MS = 2000
const HELP = 'receiver_usage,run --directory <root>|--help'

// 可信TTY只提供固定操作，不提供任意logger或可讀回密碼的介面。
export interface ReceiverTty {
  isTTY: boolean
  setRawMode(value: boolean): void
  read(): AsyncIterable<Uint8Array>
  prompt(code: 'receiver_password_required'): void
}

// 隱藏輸入失敗不帶原文；ttyRestored=false表示raw mode未能還原。
export class ReceiverSecretError extends Error {
  readonly ttyRestored: boolean

  // 只保存固定安全分類與terminal是否已還原。
  constructor(ttyRestored: boolean) {
    super('receiver_unavailable')
    this.name = 'ReceiverSecretError'
    this.ttyRestored = ttyRestored
  }
}

// runtime port只暴露單次run，native adapter由真正entry建立。
export interface ReceiverEntryRuntime {
  diagnostic?(): Readonly<ReceiverDiagnostic>
  run(
    binding: ReceiverBinding,
    endpoints: ReceiverEndpoints,
    password: Uint8Array,
    signal: AbortSignal,
  ): Promise<ReceiverResult>
}

// 所有副作用都由entry注入，測試不讀真檔或開socket。
export interface ReceiverEntryPorts {
  env: Record<string, string | undefined>
  tty: ReceiverTty
  runtime: ReceiverEntryRuntime
  signal: AbortSignal
  preflight(root: string): Promise<{ binding: ReceiverBinding; endpoints: ReceiverEndpoints }>
  claim(root: string): Promise<void>
}

// 只接受精確 `run --directory <root>` 或單獨 `--help`，不從多餘參數猜路徑。
function parseArguments(
  args: readonly string[],
): { kind: 'help' } | { kind: 'run'; root: string } | null {
  try {
    if (!Array.isArray(args)) return null
    if (args.length === 1 && args[0] === '--help') return { kind: 'help' }
    if (
      args.length !== 3 ||
      args[0] !== 'run' ||
      args[1] !== '--directory' ||
      typeof args[2] !== 'string' ||
      args[2].length < 1 ||
      args[2].length > 4096 ||
      args[2].includes('\0')
    )
      return null
    return { kind: 'run', root: args[2] }
  } catch {
    return null
  }
}

// 密碼只允許程序環境或可信TTY；環境引用在讀取後立即移除，不用argv／檔案fallback。
export async function readReceiverSecret(
  tty: ReceiverTty,
  env: Record<string, string | undefined>,
): Promise<Uint8Array> {
  let environmentValue: string | undefined
  let cleared = false
  try {
    try {
      environmentValue = env[ENV_KEY]
    } catch {
      environmentValue = undefined
    }
    try {
      delete env[ENV_KEY]
      cleared = env[ENV_KEY] === undefined
    } catch {
      try {
        env[ENV_KEY] = undefined
        cleared = env[ENV_KEY] === undefined
      } catch {
        cleared = false
      }
    }
    if (environmentValue !== undefined) {
      if (!cleared || typeof environmentValue !== 'string' || environmentValue.length < 1)
        throw new ReceiverSecretError(true)
      const bytes = new TextEncoder().encode(environmentValue)
      environmentValue = undefined
      if (bytes.length < 1 || bytes.length > MAX_PASSWORD_BYTES) {
        bytes.fill(0)
        throw new ReceiverSecretError(true)
      }
      return bytes
    }
    if (!cleared) throw new ReceiverSecretError(true)
  } finally {
    environmentValue = undefined
  }
  if (!tty || tty.isTTY !== true) throw new ReceiverSecretError(true)

  let raw = false,
    restored = true,
    failed = false
  const buffer = new Uint8Array(MAX_PASSWORD_BYTES + 1)
  let length = 0,
    result: Uint8Array | null = null
  let iterator: AsyncIterator<Uint8Array> | null = null
  try {
    tty.setRawMode(true)
    raw = true
    tty.prompt('receiver_password_required')
    iterator = tty.read()[Symbol.asyncIterator]()
    while (true) {
      const next = await iterator.next()
      if (next.done) {
        failed = true
        break
      }
      const chunk = next.value
      if (!(chunk instanceof Uint8Array)) {
        failed = true
        break
      }
      let stopped = false
      for (const byte of chunk) {
        if (byte === 0x03) {
          failed = true
          stopped = true
          break
        }
        if (byte === 0x0a || byte === 0x0d) {
          if (length < 1) failed = true
          else result = buffer.slice(0, length)
          stopped = true
          break
        }
        if (length >= MAX_PASSWORD_BYTES) {
          failed = true
          stopped = true
          break
        }
        buffer[length++] = byte
      }
      if (stopped) break
    }
  } catch {
    failed = true
  } finally {
    try {
      await iterator?.return?.()
    } catch {
      failed = true
    }
    if (raw) {
      try {
        tty.setRawMode(false)
      } catch {
        restored = false
      }
    }
    buffer.fill(0)
  }
  if (!restored) throw new ReceiverSecretError(false)
  if (failed || !result) throw new ReceiverSecretError(true)
  return result
}

// 終端只印固定code與13個安全布林，不含runId、endpoint、密碼或例外。
function printResult(result: ReceiverResult): void {
  const flags = RECEIVER_FLAGS.map((name) => `${name}=${result[name] ? 'true' : 'false'}`)
  console.log(`receiver_result,code=${result.code},${flags.join(',')}`)
}

// 唯一CLI入口；preflight→隱藏輸入→claim→runtime，失敗只回固定exit code。
export async function receiverMain(
  args: readonly string[],
  ports: ReceiverEntryPorts,
): Promise<0 | 1 | 2> {
  const parsed = parseArguments(args)
  if (!parsed) {
    console.error('receiver_unavailable')
    return 2
  }
  if (parsed.kind === 'help') {
    console.log(HELP)
    return 0
  }
  let password: Uint8Array | null = null
  try {
    const loaded = await ports.preflight(parsed.root)
    const binding = validateReceiverBinding(loaded.binding)
    const endpoints = validateReceiverEndpoints(loaded.endpoints)
    password = await readReceiverSecret(ports.tty, ports.env)
    await ports.claim(parsed.root)
    const result = validateReceiverResult(
      await ports.runtime.run(binding, endpoints, password, ports.signal),
    )
    printResult(result)
    // 診斷不參與exit或result；輸出／collector出錯只當缺資料，不回顯例外。
    try {
      if (typeof ports.runtime.diagnostic === 'function')
        console.log(formatReceiverDiagnostic(ports.runtime.diagnostic()))
    } catch {
      /* 原判定已完成，診斷失敗不改分類。 */
    }
    return result.code === 'receiver_match' ? 0 : result.code === 'receiver_mismatch' ? 1 : 2
  } catch (error) {
    if (error instanceof ReceiverSecretError && !error.ttyRestored)
      console.error('receiver_unavailable,resourcesClosed=false')
    else console.error('receiver_unavailable')
    return 2
  } finally {
    password?.fill(0)
  }
}

// 只接受新receiver用途；舊windows-host子樹不得被誤用。
function receiverRoot(root: string): string {
  const path = resolve(root)
  if (
    path.split(/[\\/]/).some((part) => /^windows-host-(observer|input-only|handoff.*)$/.test(part))
  )
    return receiverUnavailable()
  return path
}

// Windows private entry必須由PS guard先設定marker，Node不自行假設DACL已驗。
function windowsEntryEnabled(): void {
  if (process.env[WINDOWS_ENTRY_ENV] !== '1') return receiverUnavailable()
}

// 只讀取小型普通JSON檔；symlink／junction／hardlink／超額都拒絕。
function windowsReadJson(root: string, name: string): unknown {
  try {
    const path = join(receiverRoot(root), name)
    const before = lstatSync(path)
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size > MAX_RESULT_BYTES
    )
      return receiverUnavailable()
    const bytes = readFileSync(path)
    if (bytes.length !== before.size || bytes.length > MAX_RESULT_BYTES)
      return receiverUnavailable()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const value: unknown = JSON.parse(text)
    bytes.fill(0)
    return value
  } catch {
    return receiverUnavailable()
  }
}

// 有效期以UTC判定；Windows檔案時間不作為跨主機順序證據。
function receiverFresh(binding: ReceiverBinding): void {
  const now = Date.now()
  if (
    !Number.isFinite(now) ||
    now < Date.parse(binding.createdUtc) ||
    now >= Date.parse(binding.expiresUtc)
  )
    return receiverUnavailable()
}

// Windows claim只CreateNew；目錄DACL與路徑由PS guard在啟動前完成。
function windowsClaim(root: string): void {
  try {
    windowsEntryEnabled()
    const path = receiverRoot(root)
    const binding = validateReceiverBinding(windowsReadJson(path, 'binding.json'))
    validateReceiverEndpoints(windowsReadJson(path, 'connection.json'))
    receiverFresh(binding)
    const bytes = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        purpose: binding.purpose,
        runId: binding.runId,
        requestId: binding.requestId,
      }) + '\n',
    )
    try {
      if (bytes.length > MAX_RESULT_BYTES) return receiverUnavailable()
      writeFileSync(join(path, 'claim.json'), bytes, { flag: 'wx', mode: 0o600 })
    } finally {
      bytes.fill(0)
    }
  } catch {
    return receiverUnavailable()
  }
}

// Windows result只在同輪claim與有效期內CreateNew，不覆寫舊檔或縮舊ACL。
function windowsWriteResult(root: string, value: ReceiverResult): void {
  try {
    windowsEntryEnabled()
    const path = receiverRoot(root)
    const binding = validateReceiverBinding(windowsReadJson(path, 'binding.json'))
    const result = validateReceiverResult(value)
    receiverFresh(binding)
    const claim = receiverFields(windowsReadJson(path, 'claim.json'), [
      'schemaVersion',
      'purpose',
      'runId',
      'requestId',
    ])
    if (
      claim.schemaVersion !== 1 ||
      claim.purpose !== binding.purpose ||
      claim.runId !== binding.runId ||
      claim.requestId !== binding.requestId ||
      result.runId !== binding.runId ||
      result.requestId !== binding.requestId
    )
      return receiverUnavailable()
    const bytes = Buffer.from(JSON.stringify(result) + '\n')
    try {
      if (bytes.length > MAX_RESULT_BYTES) return receiverUnavailable()
      writeFileSync(join(path, 'result.json'), bytes, { flag: 'wx', mode: 0o600 })
    } finally {
      bytes.fill(0)
    }
  } catch {
    return receiverUnavailable()
  }
}

// 依平台選正式私有IO；Windows只接受PS marker與DACL guard已驗的新樹。
function nativePreflight(root: string): {
  binding: ReceiverBinding
  endpoints: ReceiverEndpoints
} {
  if (process.platform === 'linux') {
    return {
      binding: validateReceiverBinding(readReceiverJson(root, 'binding.json')),
      endpoints: validateReceiverEndpoints(readReceiverJson(root, 'connection.json')),
    }
  }
  if (process.platform === 'win32') {
    windowsEntryEnabled()
    const path = receiverRoot(root)
    return {
      binding: validateReceiverBinding(windowsReadJson(path, 'binding.json')),
      endpoints: validateReceiverEndpoints(windowsReadJson(path, 'connection.json')),
    }
  }
  return receiverUnavailable()
}

// 正式claim沿用Linux 0700／0600；Windows以PS guard建立的DACL為邊界。
function nativeClaim(root: string): void {
  if (process.platform === 'linux') {
    claimReceiverRun(root)
    return
  }
  if (process.platform === 'win32') {
    windowsClaim(root)
    return
  }
  return receiverUnavailable()
}

// 正式結果寫入沿用Linux strict IO；Windows只CreateNew同輪result。
function nativeWriteResult(root: string, result: ReceiverResult): void {
  if (process.platform === 'linux') {
    writeReceiverResult(root, result)
    return
  }
  if (process.platform === 'win32') {
    windowsWriteResult(root, result)
    return
  }
  return receiverUnavailable()
}

// 從可攜包同目錄優先讀公開VP8；開發環境才回退既有已驗cache。
async function loadPublicVp8(): Promise<Uint8Array> {
  const candidates = [
    new URL('./vp8.webm', import.meta.url),
    new URL('../../.cache/codec-fixtures/vp8.webm', import.meta.url),
  ]
  for (const candidate of candidates) {
    try {
      const bytes = readFileSync(candidate)
      if (bytes.length > 0) return new Uint8Array(bytes)
    } catch {
      /* 只嘗試下一個已固定來源，不掃描其他目錄。 */
    }
  }
  return receiverUnavailable()
}

interface PinnedEndpoint {
  endpoint: ReceiverEndpoint
  address: string
  family: 4 | 6
}

// 保存本輪三個endpoint；每次open前重驗值，不跟隨來訊host或重新解析DNS。
class PinnedEndpoints {
  private readonly saved: ReceiverEndpoint[]
  private readonly pins = new Map<string, Promise<PinnedEndpoint>>()

  // 只保存已驗證的三個endpoint副本。
  constructor(endpoints: ReceiverEndpoints) {
    const trusted = validateReceiverEndpoints(endpoints)
    this.saved = [trusted.hbbsUdp, trusted.hbbsTcp, trusted.hbbrTcp]
  }

  // 比對host／port值；未保存的目的地一律拒絕。
  private matches(endpoint: ReceiverEndpoint): boolean {
    return this.saved.some((saved) => saved.host === endpoint.host && saved.port === endpoint.port)
  }

  // DNS只在第一次open時解析一次，之後只連同一組已保存結果。
  async pin(endpoint: ReceiverEndpoint, signal: AbortSignal): Promise<PinnedEndpoint> {
    if (!endpoint || !this.matches(endpoint)) return receiverUnavailable()
    if (signal.aborted) return receiverUnavailable()
    const key = `${endpoint.host}:${endpoint.port}`
    let pending = this.pins.get(key)
    if (!pending) {
      pending = (async () => {
        const addresses = await lookup(endpoint.host, { all: true, verbatim: true })
        const usable = addresses.filter(
          (item) => (item.family === 4 || item.family === 6) && typeof item.address === 'string',
        )
        if (usable.length < 1) return receiverUnavailable()
        const first = usable[0]!
        return {
          endpoint: { host: endpoint.host, port: endpoint.port },
          address: first.address,
          family: first.family as 4 | 6,
        }
      })()
      this.pins.set(key, pending)
    }
    try {
      return await pending
    } catch {
      return receiverUnavailable()
    }
  }
}

interface SocketDuplexOptions {
  kind: 'udp' | 'tcp'
  udp?: DgramSocket
  tcp?: NetSocket
  signal: AbortSignal
  diagnostic?: ReceiverDiagnosticRecorder
  resource?: ReceiverDiagnosticResource
}

// 將Node socket收斂成有界chunk duplex；queue超過262144即終止。
function createSocketDuplex(options: SocketDuplexOptions): ReceiverDuplex {
  const { kind, udp, tcp, signal, diagnostic, resource } = options
  if (resource) diagnostic?.acquire(resource)
  const queue: Uint8Array[] = []
  const waiters: ((value: Uint8Array | null) => void)[] = []
  const closeWaiters: ((value: boolean) => void)[] = []
  let queuedBytes = 0,
    closed = false,
    nativeClosed = false,
    closeFailed = false,
    closing = false,
    closeRequested = false,
    drainReject: ((reason: Error) => void) | null = null

  // 終態清除所有等待者；晚到資料不得恢復duplex。
  function terminate(): void {
    if (!closed) {
      closed = true
      for (const bytes of queue.splice(0)) bytes.fill(0)
      queuedBytes = 0
      for (const waiter of waiters.splice(0)) waiter(null)
      drainReject?.(new Error('receiver_unavailable'))
      drainReject = null
    }
    try {
      if (!nativeClosed && (kind === 'tcp' || !closeRequested)) {
        closeRequested = true
        if (kind === 'tcp') tcp?.destroy()
        else if (udp) udp.close()
      }
    } catch {
      /* 已終態，底層close例外不改變固定分類。 */
    }
  }

  // 只有原生close事件是關閉證據；error／abort／destroy要求都不能代替它。
  function acknowledgeClose(): void {
    nativeClosed = true
    terminate()
    for (const waiter of closeWaiters.splice(0)) waiter(!closeFailed)
    if (resource) diagnostic?.close(resource, !closeFailed)
  }

  // 原始chunk queue上限262144；超限直接終止，不截斷成成功。
  function push(chunk: Uint8Array): void {
    if (closed) return
    if (!(chunk instanceof Uint8Array) || queuedBytes + chunk.length > MAX_RAW_BYTES) {
      terminate()
      return
    }
    const owned = chunk.slice()
    const waiter = waiters.shift()
    if (waiter) {
      waiter(owned)
      return
    }
    queue.push(owned)
    queuedBytes += owned.length
  }

  // 讀取一個完整資料chunk；關閉後回null。
  function receive(): Promise<Uint8Array | null> {
    const chunk = queue.shift()
    if (chunk) {
      queuedBytes -= chunk.length
      return Promise.resolve(chunk)
    }
    if (closed) return Promise.resolve(null)
    return new Promise((resolve) => waiters.push(resolve))
  }

  // 依transport等待write完成；TCP write=false時等drain，不並行累積。
  async function send(bytes: Uint8Array): Promise<void> {
    if (closed) return receiverUnavailable()
    if (!(bytes instanceof Uint8Array) || bytes.length > (kind === 'udp' ? 65536 : 65556))
      return receiverUnavailable()
    if (kind === 'udp') {
      await new Promise<void>((resolve, reject) => {
        try {
          udp!.send(bytes, (error) =>
            error ? reject(new Error('receiver_unavailable')) : resolve(),
          )
        } catch {
          reject(new Error('receiver_unavailable'))
        }
      })
      return
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        tcp?.removeListener('drain', onDrain)
        tcp?.removeListener('close', onClose)
        tcp?.removeListener('error', onError)
        if (drainReject === failDrain) drainReject = null
        if (error) reject(error)
        else resolve()
      }
      const onDrain = (): void => finish()
      const onClose = (): void => finish(new Error('receiver_unavailable'))
      const onError = (): void => finish(new Error('receiver_unavailable'))
      const failDrain = (error: Error): void => finish(error)
      drainReject = failDrain
      tcp!.once('drain', onDrain)
      tcp!.once('close', onClose)
      tcp!.once('error', onError)
      try {
        if (tcp!.write(bytes)) finish()
      } catch {
        finish(new Error('receiver_unavailable'))
      }
    })
  }

  // 關閉最多等2000ms；逾時destroy並回false，不假稱正常收尾。
  function close(): Promise<boolean> {
    if (nativeClosed) return Promise.resolve(!closeFailed)
    if (closeFailed) return Promise.resolve(false)
    if (closing) return new Promise((resolve) => closeWaiters.push(resolve))
    closing = true
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (value: boolean): void => {
        if (settled) return
        settled = true
        if (!value) closeFailed = true
        if (resource) diagnostic?.close(resource, value)
        clearTimeout(timeout)
        for (const waiter of closeWaiters.splice(0)) waiter(value)
        resolve(value)
      }
      const timeout = setTimeout(() => {
        try {
          if (kind === 'tcp') tcp?.destroy()
          else if (udp) udp.close()
        } catch {
          /* 已嘗試destroy，仍回false。 */
        }
        finish(false)
      }, CLOSE_TIMEOUT_MS)
      timeout.unref?.()
      const onClose = (): void => finish(true)
      if (kind === 'tcp') tcp?.once('close', onClose)
      else udp?.once('close', onClose)
      try {
        if (!closeRequested) {
          closeRequested = true
          if (kind === 'tcp') tcp?.end()
          else udp?.close()
        }
      } catch {
        finish(false)
      }
    })
  }

  // abort只終止本duplex，不影響其他socket。
  const onAbort = (): void => terminate()
  signal.addEventListener('abort', onAbort, { once: true })
  if (kind === 'tcp') {
    tcp!.on('data', (chunk: Buffer) => push(new Uint8Array(chunk)))
    tcp!.on('error', terminate)
    tcp!.on('close', acknowledgeClose)
  } else {
    udp!.on('message', (chunk: Buffer) => push(new Uint8Array(chunk)))
    udp!.on('error', terminate)
    udp!.on('close', acknowledgeClose)
  }
  return {
    send,
    receive,
    // 關閉時移除本duplex的abort listener，避免晚到abort恢復已關資源。
    async close(): Promise<boolean> {
      signal.removeEventListener('abort', onAbort)
      return close()
    },
  }
}

// 建立production Node network；DNS結果、endpoint與queue都由本輪唯一持有。
export function createNodeReceiverNetwork(
  endpoints: ReceiverEndpoints,
  diagnostic?: ReceiverDiagnosticRecorder,
): ReceiverNetwork & { close(): Promise<boolean> } {
  const pins = new PinnedEndpoints(endpoints)
  const owned = new Set<ReceiverDuplex>()

  // TCP只連已保存的解析結果；連線前重驗endpoint值。
  async function openTcp(endpoint: ReceiverEndpoint, signal: AbortSignal): Promise<ReceiverDuplex> {
    const pin = await pins.pin(endpoint, signal)
    if (signal.aborted) return receiverUnavailable()
    const socket = createConnection({ host: pin.address, port: pin.endpoint.port })
    const isHbbr =
      endpoint.host === endpoints.hbbrTcp.host && endpoint.port === endpoints.hbbrTcp.port
    const isHbbs =
      endpoint.host === endpoints.hbbsTcp.host && endpoint.port === endpoints.hbbsTcp.port
    // 保存值相同時不猜角色；保持兩者未確認，交由protocol owner的實際duplex證據補充。
    const resource = isHbbs && isHbbr ? undefined : isHbbr ? 'hbbr' : 'hbbs'
    if (!resource) {
      diagnostic?.acquire('hbbs')
      diagnostic?.acquire('hbbr')
    }
    const duplex = createSocketDuplex({ kind: 'tcp', tcp: socket, signal, diagnostic, resource })
    owned.add(duplex)
    await new Promise<void>((resolve, reject) => {
      const onConnect = (): void => {
        cleanup()
        resolve()
      }
      const onError = (): void => {
        cleanup()
        socket.destroy()
        reject(new Error('receiver_unavailable'))
      }
      const onAbort = (): void => {
        cleanup()
        socket.destroy()
        reject(new Error('receiver_unavailable'))
      }
      const cleanup = (): void => {
        socket.removeListener('connect', onConnect)
        socket.removeListener('error', onError)
        signal.removeEventListener('abort', onAbort)
      }
      socket.once('connect', onConnect)
      socket.once('error', onError)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    socket.setNoDelay(true)
    return duplex
  }

  // UDP只connect已保存的hbbs位址，不由來訊資料改寫目的地。
  async function openUdp(endpoint: ReceiverEndpoint, signal: AbortSignal): Promise<ReceiverDuplex> {
    const pin = await pins.pin(endpoint, signal)
    if (signal.aborted) return receiverUnavailable()
    const socket = createSocket(pin.family === 6 ? 'udp6' : 'udp4')
    const duplex = createSocketDuplex({
      kind: 'udp',
      udp: socket,
      signal,
      diagnostic,
      resource: 'udp',
    })
    owned.add(duplex)
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        cleanup()
        try {
          socket.close()
        } catch {
          /* 尚未bind的socket可能無法close。 */
        }
        reject(new Error('receiver_unavailable'))
      }
      const cleanup = (): void => {
        socket.removeListener('error', onError)
        signal.removeEventListener('abort', onAbort)
      }
      const onError = (): void => {
        cleanup()
        try {
          socket.close()
        } catch {
          /* 仍由owned duplex保留未確認收尾。 */
        }
        reject(new Error('receiver_unavailable'))
      }
      socket.once('error', onError)
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        socket.connect(pin.endpoint.port, pin.address, () => {
          cleanup()
          resolve()
        })
      } catch {
        cleanup()
        reject(new Error('receiver_unavailable'))
      }
    })
    return duplex
  }

  return {
    openUdp,
    openTcp,
    // 即使connect失敗尚未回傳duplex，owner仍會收所有本輪socket。
    async close(): Promise<boolean> {
      return (await Promise.all(Array.from(owned, (duplex) => duplex.close()))).every(Boolean)
    },
    now: () => performance.now(),
    schedule: (delayMs, callback) => {
      const timer = setTimeout(callback, delayMs)
      timer.unref?.()
      return () => clearTimeout(timer)
    },
  }
}

// 建立真正entry ports；native adapter只在main且preflight／secret／claim後使用。
export function createNativeEntryPorts(signal: AbortSignal): ReceiverEntryPorts {
  let activeRoot: string | null = null
  let diagnostic: ReceiverDiagnosticRecorder | null = null
  return {
    env: process.env,
    signal,
    tty: {
      get isTTY() {
        return process.stdin.isTTY === true
      },
      setRawMode(value: boolean) {
        if (typeof process.stdin.setRawMode !== 'function') return receiverUnavailable()
        process.stdin.setRawMode(value)
      },
      read() {
        return process.stdin as unknown as AsyncIterable<Uint8Array>
      },
      prompt(code: 'receiver_password_required') {
        process.stdout.write(code + ': ')
      },
    },
    async preflight(root: string) {
      activeRoot = root
      return nativePreflight(root)
    },
    async claim(root: string) {
      activeRoot = root
      nativeClaim(root)
    },
    runtime: {
      // 唯一native runtime的本輪快照；未啟動不預設任何成功。
      diagnostic: () => diagnostic?.snapshot() ?? unknownReceiverDiagnostic(),
      // 真正runtime只在設定與hidden input完成後讀公開VP8並建立network。
      async run(binding, endpoints, password, actualSignal) {
        const root = activeRoot
        if (!root) return receiverUnavailable()
        diagnostic = createReceiverDiagnostic()
        const network = createNodeReceiverNetwork(endpoints, diagnostic)
        const publicVp8 = await loadPublicVp8()
        return runReceiver(
          binding,
          endpoints,
          password,
          {
            network,
            publicVp8,
            diagnostic,
            writeResult: async (result) => nativeWriteResult(root, result),
          },
          actualSignal,
        )
      },
    },
  }
}

// 真正main只在此檔直接執行時建立signal listener與native ports。
export async function nativeMain(): Promise<void> {
  const controller = new AbortController()
  const onSignal = (): void => controller.abort()
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    const code = await receiverMain(
      process.argv.slice(2),
      createNativeEntryPorts(controller.signal),
    )
    process.exitCode = code
  } finally {
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }
}

// 被測試import時不得執行main；只有bundle或直接 `node cli.ts` 才啟動。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void nativeMain()
