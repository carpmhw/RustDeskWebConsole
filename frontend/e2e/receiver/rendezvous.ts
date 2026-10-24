import { randomBytes, randomUUID } from 'node:crypto'
import {
  receiverUnavailable,
  validateReceiverBinding,
  validateReceiverEndpoints,
  type ReceiverBinding,
  type ReceiverEndpoint,
  type ReceiverEndpoints,
} from './contract.ts'
import { createReceiverFramer, frameReceiverBytes } from './framing.ts'
import { decodeReceiverControl, encodeReceiverControl, type ReceiverControl } from './wire.ts'
import type {
  ReceiverDiagnosticRecorder,
  ReceiverDiagnosticPhase,
  ReceiverDiagnosticReason,
} from './diagnostic.ts'

// 只有新用途receiver會宣告此版本，不冒充官方RustDesk client版本。
export const RECEIVER_VERSION = 'rdweb-test-receiver/0.1.0'

const UDP_RESPONSE_TIMEOUT_MS = 15000
const TCP_CONNECT_TIMEOUT_MS = 15000
const PEER_READY_TIMEOUT_MS = 60000
const REGISTER_PEER_INTERVAL_MS = 10000
const MAX_FRAME_BYTES = 65552
const MAX_RELAY_QUEUE_BYTES = 262144

const READ_FAILURE_REASONS = [
  'unknown',
  'io_failed',
  'eof',
  'decode_rejected',
  'budget_exceeded',
  'aborted',
] as const
export type ReceiverReadFailureReason = (typeof READ_FAILURE_REASONS)[number]

// 僅讀可信port的固定原因能力；缺失、非法值或拋錯均不猜測／不讀例外內容。
export function readReceiverFailureReason(
  source: { failureReason?: () => unknown } | null | undefined,
): ReceiverReadFailureReason {
  try {
    const read = source?.failureReason
    if (typeof read !== 'function') return 'unknown'
    const reason: unknown = read.call(source)
    return typeof reason === 'string' &&
      READ_FAILURE_REASONS.includes(reason as ReceiverReadFailureReason)
      ? (reason as ReceiverReadFailureReason)
      : 'unknown'
  } catch {
    return 'unknown'
  }
}

export interface ReceiverDuplex {
  send(bytes: Uint8Array): Promise<void>
  receive(): Promise<Uint8Array | null>
  close(): Promise<boolean>
  // 只回本輪首次讀取失敗來源；null代表尚無失敗或主動收尾。
  failureReason?(): ReceiverReadFailureReason | null
}

// 由Task29提供真Node adapter；本層只要求保存endpoint與單調clock，不自行撥號。
export interface ReceiverNetwork {
  openUdp(endpoint: ReceiverEndpoint, signal: AbortSignal): Promise<ReceiverDuplex>
  openTcp(endpoint: ReceiverEndpoint, signal: AbortSignal): Promise<ReceiverDuplex>
  now(): number
  schedule(delayMs: number, callback: () => void): () => void
  // 原生adapter另持有尚未完成connect的socket，失敗時也必須有收尾證據。
  close?(): Promise<boolean>
}

// relay語意只暴露完整frame，不讓呼叫端看到UUID、socket或保存的endpoint。
export interface ReceiverRelay {
  send(frame: Uint8Array): Promise<void>
  receive(): Promise<Uint8Array | null>
  close(): Promise<boolean>
  // 不直接改整輪診斷；runtime確實消費異常讀取時才投影。
  failureReason?(): ReceiverReadFailureReason | null
}

interface TimerHandle {
  cancel: () => void
}

interface InternalRelay extends ReceiverRelay {
  terminate: () => void
}

// 控制訊息只接受目前階段預期的union，任何其他值都回固定失敗碼。
function failClosed(): never {
  return receiverUnavailable()
}

// 以固定錯誤碼包裝非同步失敗，避免原生例外或目的地資料外洩。
function rejectUnavailable(): Promise<never> {
  return Promise.reject(new Error('receiver_unavailable'))
}

// 依pinned framing把控制訊息轉成TCP frame；UDP則直接送完整protobuf。
function encodeControlFrame(value: ReceiverControl): Uint8Array {
  return frameReceiverBytes(encodeReceiverControl(value))
}

// 建立單次註冊／forced-relay狀態機；所有I/O只透過注入的network與signal。
export function connectReceiverRelay(
  binding: ReceiverBinding,
  endpoints: ReceiverEndpoints,
  signingPublicKey: Uint8Array,
  io: ReceiverNetwork,
  signal: AbortSignal,
  diagnostic?: ReceiverDiagnosticRecorder,
): Promise<ReceiverRelay> {
  try {
    const trustedBinding = validateReceiverBinding(binding)
    const trustedEndpoints = validateReceiverEndpoints(endpoints)
    if (!(signingPublicKey instanceof Uint8Array) || signingPublicKey.length !== 32)
      return failClosed()
    if (signal.aborted) return failClosed()
    return createAttempt(
      trustedBinding,
      trustedEndpoints,
      signingPublicKey.slice(),
      io,
      signal,
      diagnostic,
    ).run()
  } catch {
    return rejectUnavailable()
  }
}

// 每次連線各自持有duplex、timer與relay，不與其他run共享可變狀態。
function createAttempt(
  binding: ReceiverBinding,
  endpoints: ReceiverEndpoints,
  signingPublicKey: Uint8Array,
  io: ReceiverNetwork,
  signal: AbortSignal,
  diagnostic?: ReceiverDiagnosticRecorder,
) {
  let udp: ReceiverDuplex | null = null
  let hbbs: ReceiverDuplex | null = null
  let hbbr: ReceiverDuplex | null = null
  let relay: InternalRelay | null = null
  let phase: 'pk' | 'peer' | 'relay' = 'pk'
  let relayResponseSent = false
  let serial = 1
  let finished = false
  let settled = false
  let shutdownPromise: Promise<boolean> | null = null
  let abortListener: (() => void) | null = null
  let resolveConnect: (value: ReceiverRelay) => void = () => {}
  let rejectConnect: (reason: Error) => void = () => {}
  const timers = new Set<TimerHandle>()
  let pkTimer: TimerHandle | null = null
  let hbbsTimer: TimerHandle | null = null
  let hbbrTimer: TimerHandle | null = null
  let peerTimer: TimerHandle | null = null
  let deadlineTimer: TimerHandle | null = null

  // 登記一次性timer並保留取消函式；到期後自動從集合移除。
  function arm(delayMs: number, callback: () => void): TimerHandle {
    const handle: TimerHandle = { cancel: () => {} }
    handle.cancel = io.schedule(delayMs, () => {
      timers.delete(handle)
      callback()
    })
    timers.add(handle)
    return handle
  }

  // 取消單一timer；重複取消或已到期都不產生副作用。
  function clearTimer(handle: TimerHandle | null): void {
    if (!handle) return
    handle.cancel()
    timers.delete(handle)
  }

  // 終態一次清除所有本attempt排定的timer，避免殘留背景工作。
  function clearTimers(): void {
    for (const handle of timers) handle.cancel()
    timers.clear()
    pkTimer = null
    hbbsTimer = null
    hbbrTimer = null
    peerTimer = null
    deadlineTimer = null
  }

  // 只移除本attempt註冊的abort listener，不影響呼叫端其他監聽。
  function detachAbort(): void {
    if (!abortListener) return
    signal.removeEventListener('abort', abortListener)
    abortListener = null
  }

  // 取消時統一走fail，確保已開啟的port與timer都被收尾。
  function attachAbort(): void {
    if (signal.aborted) {
      fail('setup', 'aborted')
      return
    }
    abortListener = () => fail('unknown', 'aborted')
    signal.addEventListener('abort', abortListener, { once: true })
  }

  // 關閉單一duplex並把原生錯誤收斂成布林，避免例外中斷其他收尾。
  async function closeSafely(duplex: ReceiverDuplex | null): Promise<boolean> {
    if (!duplex) return true
    try {
      return await duplex.close()
    } catch {
      return false
    }
  }

  // 每個連線只收尾一次；重複呼叫回相同結果且不再變更資源狀態。
  function shutdown(): Promise<boolean> {
    if (shutdownPromise) return shutdownPromise
    finished = true
    detachAbort()
    clearTimers()
    relay?.terminate()
    const owned = [udp, hbbs, hbbr]
    shutdownPromise = Promise.all(
      owned.map(async (duplex, index) => {
        const closed = await closeSafely(duplex)
        if (duplex) diagnostic?.close((['udp', 'hbbs', 'hbbr'] as const)[index]!, closed)
        return closed
      }),
    ).then((results) => results.every(Boolean))
    return shutdownPromise
  }

  // 失敗一律回固定receiver_unavailable，且先收尾才讓promise reject。
  function fail(
    at: ReceiverDiagnosticPhase = 'unknown',
    reason: ReceiverDiagnosticReason = 'unknown',
  ): void {
    if (finished) return
    diagnostic?.fail(at, reason)
    void shutdown().then(() => {
      if (settled) return
      settled = true
      rejectConnect(new Error('receiver_unavailable'))
    })
  }

  // 建立公開relay並啟動有界frame reader；不把底層duplex或UUID外露。
  function makeRelay(duplex: ReceiverDuplex): InternalRelay {
    const framer = createReceiverFramer(MAX_FRAME_BYTES)
    const queue: Uint8Array[] = []
    const waiters: ((value: Uint8Array | null) => void)[] = []
    let queuedBytes = 0
    let closed = false
    let readFailure: ReceiverReadFailureReason | null = null

    // 終態清除半包、佇列與等待者，晚到資料不得恢復relay。
    const terminate = (reason: ReceiverReadFailureReason | null = null): void => {
      if (closed) return
      readFailure = reason
      closed = true
      framer.dispose()
      queuedBytes = 0
      queue.length = 0
      for (const waiter of waiters.splice(0)) waiter(null)
    }

    // 背景只讀完整frame；半包、超限或底層關閉都結束relay。
    const read = async (): Promise<void> => {
      for (;;) {
        let chunk: Uint8Array | null
        try {
          chunk = await duplex.receive()
        } catch {
          if (!closed) terminate('io_failed')
          return
        }
        if (closed) return
        if (chunk === null) {
          let reason = readReceiverFailureReason(duplex)
          if (reason === 'eof') {
            try {
              framer.finish()
            } catch {
              reason = 'decode_rejected'
            }
          }
          terminate(reason)
          return
        }
        let frames: Uint8Array[]
        try {
          frames = framer.push(chunk)
        } catch {
          terminate('decode_rejected')
          return
        }
        for (const frame of frames) {
          const waiter = waiters.shift()
          if (waiter) {
            waiter(frame)
            continue
          }
          if (queuedBytes + frame.length > MAX_RELAY_QUEUE_BYTES) {
            terminate('budget_exceeded')
            return
          }
          queue.push(frame)
          queuedBytes += frame.length
        }
      }
    }

    // 先回佇列既有frame；沒有資料時只允許一個有序等待者。
    const receive = (): Promise<Uint8Array | null> => {
      const frame = queue.shift()
      if (frame) {
        queuedBytes -= frame.length
        return Promise.resolve(frame)
      }
      if (closed) return Promise.resolve(null)
      return new Promise((resolve) => waiters.push(resolve))
    }

    // 送出前依Task25上限重新framing，關閉後不得再寫入。
    const send = async (frame: Uint8Array): Promise<void> => {
      if (closed) return failClosed()
      try {
        await duplex.send(frameReceiverBytes(frame))
      } catch {
        return failClosed()
      }
    }

    void read()
    return {
      send,
      receive,
      close: shutdown,
      terminate,
      // primitive副本不受後續close或底層來源變更影響。
      failureReason: () => readFailure,
    }
  }

  // 建立hbbr後才解析frame；只有完整、有效的控制才進入公開relay。
  async function establishRelay(socketAddr: Uint8Array): Promise<void> {
    if (finished || hbbr) return
    if (!hbbs) return failClosed()
    // 正式Coordinator只接受Guid D格式；兩側配對始終使用同一個canonical UUID。
    const uuid = randomUUID()
    let responseFrame: Uint8Array
    try {
      responseFrame = encodeControlFrame({
        relayResponse: {
          id: binding.peerId,
          socketAddr: socketAddr.slice(),
          relayServer: `${endpoints.hbbrTcp.host}:${endpoints.hbbrTcp.port}`,
          uuid,
          version: RECEIVER_VERSION,
        },
      })
    } catch {
      fail('relay_response', 'unknown')
      return
    }
    try {
      await hbbs.send(responseFrame)
    } catch {
      fail('relay_response', 'io_failed')
      return
    }
    if (finished) return
    relayResponseSent = true
    hbbrTimer = arm(TCP_CONNECT_TIMEOUT_MS, () => fail('hbbr_open', 'deadline'))
    diagnostic?.acquire('hbbr')
    let duplex: ReceiverDuplex
    try {
      duplex = await io.openTcp(endpoints.hbbrTcp, signal)
    } catch {
      fail('hbbr_open', 'io_failed')
      return
    }
    if (finished) {
      await closeSafely(duplex)
      return
    }
    clearTimer(hbbrTimer)
    hbbrTimer = null
    hbbr = duplex
    try {
      await duplex.send(
        encodeControlFrame({
          requestRelay: {
            id: binding.peerId,
            uuid,
            licenceKey: endpoints.serverPublicKey,
          },
        }),
      )
    } catch {
      fail('relay_request', 'io_failed')
      return
    }
    clearTimer(peerTimer)
    peerTimer = null
    clearTimer(deadlineTimer)
    deadlineTimer = null
    relay = makeRelay(duplex)
    settled = true
    resolveConnect(relay)
  }

  // PunchHole與FetchLocalAddr都只觸發同一forced relay，不採用來訊relay_server。
  function beginRelay(request: { socketAddr?: Uint8Array | null }): void {
    phase = 'relay'
    const socketAddr =
      request.socketAddr instanceof Uint8Array ? request.socketAddr : new Uint8Array()
    void establishRelay(socketAddr).catch(() => fail())
  }

  // 送出目前序號的RegisterPeer；維持訊息走UDP，不是TCP控制。
  async function sendPeer(): Promise<void> {
    if (!udp) return failClosed()
    await udp.send(encodeReceiverControl({ registerPeer: { id: binding.peerId, serial } }))
  }

  // UDP每10000ms維持peer序號；缺回應不重送RegisterPk也不另開連線。
  function maintainPeer(): void {
    peerTimer = arm(REGISTER_PEER_INTERVAL_MS, () => {
      serial += 1
      void sendPeer().catch(() => fail('register_peer', 'io_failed'))
    })
  }

  // hbbs TCP讀取完整frame；PunchHole／FetchLocalAddr之外只接受非請求key回覆。
  async function readHbbs(duplex: ReceiverDuplex): Promise<void> {
    const framer = createReceiverFramer(MAX_FRAME_BYTES)
    try {
      for (;;) {
        let chunk: Uint8Array | null
        try {
          chunk = await duplex.receive()
        } catch {
          return fail('await_peer', 'io_failed')
        }
        if (finished) return
        if (chunk === null) {
          if (!relayResponseSent) return fail('await_peer', 'eof')
          // 固定hbbs轉送RelayResponse即正常關閉；只允許無殘包EOF，不代表配對成功。
          framer.finish()
          return
        }
        for (const frame of framer.push(chunk)) {
          const control = decodeReceiverControl(frame)
          if (control.registerPeerResponse) {
            if (control.registerPeerResponse.requestPk)
              return fail('await_peer', 'registration_rejected')
            continue
          }
          const request = control.punchHole ?? control.fetchLocalAddr
          if (request) {
            if (phase === 'relay') continue
            beginRelay(request)
            continue
          }
          return fail('await_peer', 'unexpected_control')
        }
      }
    } catch {
      return fail('await_peer', 'decode_rejected')
    } finally {
      // 正常結束或失敗都清除可能殘留的半包，不留下未owned buffer。
      framer.dispose()
    }
  }

  // 建立hbbs TCP並開始維持序號；連線本身也受15000ms與60000ms界限制。
  async function openHbbs(): Promise<void> {
    hbbsTimer = arm(TCP_CONNECT_TIMEOUT_MS, () => fail('hbbs_open', 'deadline'))
    diagnostic?.acquire('hbbs')
    let duplex: ReceiverDuplex
    try {
      duplex = await io.openTcp(endpoints.hbbsTcp, signal)
    } catch {
      fail('hbbs_open', 'io_failed')
      return
    }
    if (finished) {
      await closeSafely(duplex)
      return
    }
    clearTimer(hbbsTimer)
    hbbsTimer = null
    hbbs = duplex
    try {
      await sendPeer()
    } catch {
      fail('register_peer', 'io_failed')
      return
    }
    maintainPeer()
    void readHbbs(duplex)
  }

  // UDP只接受本階段控制；RegisterPk失敗立即停止，不進TCP或重送key。
  async function readUdp(duplex: ReceiverDuplex): Promise<void> {
    try {
      for (;;) {
        const bytes = await duplex.receive()
        if (finished) return
        if (bytes === null) return fail(phase === 'pk' ? 'register_pk' : 'await_peer', 'eof')
        let control: ReturnType<typeof decodeReceiverControl>
        try {
          control = decodeReceiverControl(bytes)
        } catch {
          return fail(phase === 'pk' ? 'register_pk' : 'await_peer', 'decode_rejected')
        }
        if (phase === 'pk') {
          if (!control.registerPkResponse) return fail('register_pk', 'unexpected_control')
          clearTimer(pkTimer)
          pkTimer = null
          if (control.registerPkResponse.result !== 0)
            return fail('register_pk', 'registration_rejected')
          phase = 'peer'
          void openHbbs().catch(() => fail())
          continue
        }
        if (control.registerPeerResponse) {
          if (control.registerPeerResponse.requestPk)
            return fail('await_peer', 'registration_rejected')
          continue
        }
        // 固定1.1.14的Data::Msg透過UDP通知peer；仍只轉保存的forced relay。
        const request = control.punchHole ?? control.fetchLocalAddr
        if (request) {
          if (phase !== 'relay') beginRelay(request)
          continue
        }
        return fail('await_peer', 'unexpected_control')
      }
    } catch {
      return fail(phase === 'pk' ? 'register_pk' : 'await_peer', 'io_failed')
    }
  }

  // 主流程只建立一個UDP與必要TCP；所有失敗交由fail統一收尾。
  async function main(): Promise<void> {
    attachAbort()
    if (finished) return
    deadlineTimer = arm(PEER_READY_TIMEOUT_MS, () => fail('await_peer', 'deadline'))
    diagnostic?.acquire('udp')
    try {
      udp = await io.openUdp(endpoints.hbbsUdp, signal)
    } catch {
      fail('udp_open', 'io_failed')
      return
    }
    if (finished) {
      await closeSafely(udp)
      return
    }
    try {
      await udp.send(
        encodeReceiverControl({
          registerPk: {
            id: binding.peerId,
            uuid: randomBytes(16),
            pk: signingPublicKey.slice(),
          },
        }),
      )
    } catch {
      fail('register_pk', 'io_failed')
      return
    }
    pkTimer = arm(UDP_RESPONSE_TIMEOUT_MS, () => fail('register_pk', 'deadline'))
    void readUdp(udp)
  }

  // 以deferred回傳connect結果，讓abort與背景reader共用同一終態。
  function run(): Promise<ReceiverRelay> {
    return new Promise<ReceiverRelay>((resolve, reject) => {
      resolveConnect = resolve
      rejectConnect = reject
      void main().catch(() => fail())
    })
  }

  return { run }
}
