import {
  classifyReceiverEvidence,
  receiverUnavailable,
  validateReceiverBinding,
  validateReceiverEndpoints,
  type ReceiverBinding,
  type ReceiverEndpoints,
  type ReceiverEvidence,
  type ReceiverResult,
} from './contract.ts'
import { createReceiverCrypto, type ReceiverCrypto } from './crypto.ts'
import { verifyReceiverVp8 } from './media.ts'
import {
  connectReceiverRelay,
  readReceiverFailureReason,
  type ReceiverNetwork,
  type ReceiverRelay,
} from './rendezvous.ts'
import { createReceiverSession, type ReceiverSession } from './session.ts'
import type { ReceiverDiagnosticRecorder } from './diagnostic.ts'

const MAX_PASSWORD_BYTES = 4096
const MAX_FRAME_BYTES = 65552
const MAX_ENVELOPES = 2048
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024
const MAX_TX_BYTES = 262144
const RUN_BUDGET_MS = 180000
const CLOSE_BUDGET_MS = 2000
const WATCH_INTERVAL_MS = 250

// runtime只透過注入的network開連線；單調clock與排程由network唯一持有。
export interface ReceiverRuntimePorts {
  network: ReceiverNetwork
  publicVp8: Uint8Array
  diagnostic?: ReceiverDiagnosticRecorder
  writeResult(result: ReceiverResult): Promise<void>
}

// protocol envelope與payload共用一個budget，超限立即失敗而非截斷成功。
export interface ReceiverRuntimeBudget {
  readonly envelopes: number
  readonly payloadBytes: number
  envelope(bytes: number): void
}

// TX queue只允許一個active send；其餘frame必須在262144bytes內等待。
export interface ReceiverRuntimeSender {
  send(frame: Uint8Array): Promise<void>
  close(): void
  pendingBytes(): number
}

interface RuntimeTimer {
  active: boolean
  cancel: () => void
}

interface QueuedSend {
  frame: Uint8Array
  resolve: () => void
  reject: (reason: Error) => void
}

interface EmptyEvidence {
  identityBound: false
  authenticated: false
  received: false
  macVerified: false
  parsed: false
  textSingle: false
  textExact: false
  sequenceComplete: false
  sequenceValid: false
  windowComplete: false
  overflow: false
  unavailable: false
  resourcesClosed: false
}

const EMPTY_EVIDENCE: EmptyEvidence = {
  identityBound: false,
  authenticated: false,
  received: false,
  macVerified: false,
  parsed: false,
  textSingle: false,
  textExact: false,
  sequenceComplete: false,
  sequenceValid: false,
  windowComplete: false,
  overflow: false,
  unavailable: false,
  resourcesClosed: false,
}

// 固定錯誤只回安全分類，不把原生例外或資料帶到呼叫端。
function unavailableError(): Error {
  return new Error('receiver_unavailable')
}

// 建立單輪protocol budget；2048 envelopes與8MiB payload都含目前這一筆。
export function createRuntimeBudget(): ReceiverRuntimeBudget {
  let envelopes = 0,
    payloadBytes = 0
  return {
    get envelopes() {
      return envelopes
    },
    get payloadBytes() {
      return payloadBytes
    },
    // 先驗單筆frame上限再累計，任何非整數或超限都立即停止。
    envelope(bytes: number): void {
      if (!Number.isInteger(bytes) || bytes < 0 || bytes > MAX_FRAME_BYTES)
        return receiverUnavailable()
      if (envelopes >= MAX_ENVELOPES) return receiverUnavailable()
      if (payloadBytes + bytes > MAX_PAYLOAD_BYTES) return receiverUnavailable()
      envelopes++
      payloadBytes += bytes
    },
  }
}

// 建立有界TX sender；send promise完成後才處理下一個frame，不堆無界promise。
export function createRuntimeSender(
  send: (frame: Uint8Array) => Promise<void>,
  onOverflow?: () => void,
): ReceiverRuntimeSender {
  if (typeof send !== 'function') return receiverUnavailable()
  const queue: QueuedSend[] = []
  let pendingBytes = 0,
    active = false,
    closed = false

  // 終態只拒絕尚未開始的frame；active promise由原send自行收斂。
  function fail(): void {
    if (closed) return
    closed = true
    for (const item of queue.splice(0)) {
      pendingBytes -= item.frame.length
      item.reject(unavailableError())
    }
  }

  // 序列化寫入；單一active send完成後才前進，避免並行write與無界緩衝。
  function pump(): void {
    if (active || closed || queue.length === 0) return
    const item = queue.shift()!
    active = true
    Promise.resolve()
      .then(() => send(item.frame))
      .then(() => {
        active = false
        pendingBytes -= item.frame.length
        item.frame.fill(0)
        item.resolve()
        pump()
      })
      .catch(() => {
        active = false
        pendingBytes -= item.frame.length
        item.frame.fill(0)
        item.reject(unavailableError())
        onOverflow?.()
        fail()
      })
  }

  return {
    // 先驗frame與queue上限；超限立即回固定錯誤並關閉整輪sender。
    send(frame: Uint8Array): Promise<void> {
      if (closed) return Promise.reject(unavailableError())
      if (!(frame instanceof Uint8Array) || frame.length > MAX_FRAME_BYTES) {
        fail()
        onOverflow?.()
        return Promise.reject(unavailableError())
      }
      const owned = frame.slice()
      if (pendingBytes + owned.length > MAX_TX_BYTES) {
        owned.fill(0)
        onOverflow?.()
        fail()
        return Promise.reject(unavailableError())
      }
      pendingBytes += owned.length
      return new Promise<void>((resolve, reject) => {
        queue.push({ frame: owned, resolve, reject })
        pump()
      })
    },
    // 關閉只拒絕尚未開始的frame；已寫出的資料由relay close另行收尾。
    close(): void {
      fail()
    },
    // 回目前尚未完成的TX bytes，供有界性測試與runtime判斷。
    pendingBytes(): number {
      return pendingBytes
    },
  }
}

// 建立單輪runtime；所有失敗都收斂成安全ReceiverResult，只有非法binding直接拒絕。
export async function runReceiver(
  binding: ReceiverBinding,
  endpoints: ReceiverEndpoints,
  password: Uint8Array,
  ports: ReceiverRuntimePorts,
  signal: AbortSignal,
): Promise<ReceiverResult> {
  let trusted: ReceiverBinding
  try {
    trusted = validateReceiverBinding(binding)
  } catch {
    throw unavailableError()
  }
  const header = {
    schemaVersion: 1 as const,
    purpose: trusted.purpose,
    runId: trusted.runId,
    requestId: trusted.requestId,
  }

  // 以固定header與證據建立結果；code必須由同一classifier產生。
  function makeResult(evidence: ReceiverEvidence): ReceiverResult {
    const result = { ...header, ...evidence }
    return { ...result, code: classifyReceiverEvidence(result) }
  }

  // 無資源可關的設定錯誤只寫一次固定unavailable。
  async function persistStandalone(evidence: Partial<ReceiverEvidence>): Promise<ReceiverResult> {
    ports.diagnostic?.fail('setup', 'invalid_setup')
    const result = makeResult({
      ...EMPTY_EVIDENCE,
      resourcesClosed: true,
      unavailable: true,
      ...evidence,
    })
    try {
      if (typeof ports.writeResult !== 'function') return { ...result, unavailable: true }
      await ports.writeResult(result)
      return result
    } catch {
      return { ...result, unavailable: true, code: 'receiver_unavailable' }
    }
  }

  let trustedEndpoints: ReceiverEndpoints
  try {
    trustedEndpoints = validateReceiverEndpoints(endpoints)
  } catch {
    return persistStandalone({})
  }
  if (
    !(password instanceof Uint8Array) ||
    password.length < 1 ||
    password.length > MAX_PASSWORD_BYTES
  )
    return persistStandalone({})
  if (
    !ports ||
    typeof ports.writeResult !== 'function' ||
    !ports.network ||
    typeof ports.network.openUdp !== 'function' ||
    typeof ports.network.openTcp !== 'function' ||
    typeof ports.network.now !== 'function' ||
    typeof ports.network.schedule !== 'function'
  )
    return persistStandalone({})
  if (!(ports.publicVp8 instanceof Uint8Array)) return persistStandalone({})
  try {
    verifyReceiverVp8(ports.publicVp8)
  } catch {
    return persistStandalone({})
  }
  if (
    !signal ||
    typeof signal.aborted !== 'boolean' ||
    typeof signal.addEventListener !== 'function'
  )
    return persistStandalone({})
  if (signal.aborted) return persistStandalone({})

  const network = ports.network
  const diagnostic = ports.diagnostic
  const secret = new Uint8Array(password)
  const internal = new AbortController()
  const budget = createRuntimeBudget()
  const timers = new Set<RuntimeTimer>()
  let sender: ReceiverRuntimeSender | null = null
  let crypto: ReceiverCrypto | null = null
  let relay: ReceiverRelay | null = null
  let session: ReceiverSession | null = null
  let finished = false,
    failed = false,
    abortAttached = false,
    runtimeResourcesClosed = true,
    lastClock = -Infinity,
    startedClock = 0,
    deadlineTimer: RuntimeTimer | null = null,
    finalizePromise: Promise<ReceiverResult> | null = null
  let resolveCompletion: ((result: ReceiverResult) => void) | null = null
  const completion = new Promise<ReceiverResult>((resolve) => {
    resolveCompletion = resolve
  })

  // 讀取唯一單調clock；非有限或回退都立即停止整輪。
  function readClock(): number | null {
    try {
      const value = network.now()
      if (typeof value !== 'number' || !Number.isFinite(value) || value < lastClock) {
        diagnostic?.fail('unknown', 'clock_invalid')
        fail()
        return null
      }
      lastClock = value
      return value
    } catch {
      diagnostic?.fail('unknown', 'clock_invalid')
      fail()
      return null
    }
  }

  // 只登記可取消timer；登記失敗代表資源不可信，直接終止。
  function schedule(delayMs: number, callback: () => void): RuntimeTimer | null {
    let timer: RuntimeTimer | null = null
    try {
      const cancel = network.schedule(delayMs, () => {
        if (!timer || !timer.active || finished) return
        timer.active = false
        timers.delete(timer)
        try {
          callback()
        } catch {
          fail()
        }
      })
      if (typeof cancel !== 'function') throw new Error('receiver_unavailable')
      timer = { active: true, cancel }
      diagnostic?.acquire('timers')
      timers.add(timer)
      return timer
    } catch {
      runtimeResourcesClosed = false
      fail()
      return null
    }
  }

  // 取消timer失敗保留resourcesClosed=false，不讓清理假成功。
  function clearTimer(timer: RuntimeTimer | null): void {
    if (!timer) return
    if (timer.active) {
      timer.active = false
      try {
        timer.cancel()
      } catch {
        runtimeResourcesClosed = false
      }
    }
    timers.delete(timer)
  }

  // 終態先取消全部自有timer；晚到callback不得再推進狀態。
  function clearTimers(): void {
    for (const timer of [...timers]) clearTimer(timer)
    diagnostic?.close('timers', runtimeResourcesClosed)
  }

  // 只移除本輪註冊的abort listener，不影響呼叫端其他監聽。
  function detachAbort(): void {
    if (!abortAttached) return
    abortAttached = false
    try {
      signal.removeEventListener('abort', onAbort)
    } catch {
      runtimeResourcesClosed = false
    }
  }

  // 取消時同時中止仍在等待的rendezvous連線。
  function onAbort(): void {
    diagnostic?.fail('unknown', 'aborted')
    fail()
  }

  // 失敗只保留既有證據，强制unavailable並停止所有晚到工作。
  function fail(): void {
    if (finished) return
    diagnostic?.fail('unknown', 'unknown')
    failed = true
    try {
      internal.abort()
    } catch {
      /* 已在固定錯誤路徑，abort失敗不改變安全分類。 */
    }
    finish()
  }

  // 成功只在完整五鍵與5000ms窗都成立後呼叫。
  function succeed(): void {
    if (finished) return
    finish()
  }

  // 終態只進入finalize一次；先停timer／abort listener，再關資源與落盤。
  function finish(): void {
    if (finished) return
    finished = true
    clearTimers()
    detachAbort()
    void finalize().then((result) => resolveCompletion?.(result))
  }

  // 關閉session／relay／sender；單一2000ms界包含全部自有資源。
  async function closeAll(): Promise<boolean> {
    let ok = true
    try {
      sender?.close()
    } catch {
      ok = false
    }
    const jobs: Promise<boolean>[] = []
    if (session) {
      jobs.push(
        Promise.resolve()
          .then(() => session!.close())
          .then((closed) => {
            diagnostic?.close('session', closed)
            return closed
          })
          .catch(() => false),
      )
    } else if (crypto) {
      jobs.push(
        Promise.resolve()
          .then(() => {
            crypto!.dispose()
            diagnostic?.close('session', true)
            return true
          })
          .catch(() => false),
      )
    }
    if (relay) {
      jobs.push(
        Promise.resolve()
          .then(() => relay!.close())
          .catch(() => false),
      )
    }
    if (network.close) {
      jobs.push(
        Promise.resolve()
          .then(() => network.close!())
          .catch(() => false),
      )
    }
    const results = await Promise.all(jobs)
    return ok && results.every(Boolean)
  }

  // close budget是獨立於finished的timer；逾時即resourcesClosed=false。
  function closeWithinBudget(work: Promise<boolean>): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false,
        timer: RuntimeTimer | null = null
      const settle = (value: boolean): void => {
        if (settled) return
        settled = true
        if (timer) {
          timer.active = false
          try {
            timer.cancel()
          } catch {
            runtimeResourcesClosed = false
            diagnostic?.close('timers', false)
          }
        }
        resolve(value)
      }
      try {
        const left = Math.max(
          0,
          Math.min(CLOSE_BUDGET_MS, startedClock + RUN_BUDGET_MS - network.now()),
        )
        const cancel = network.schedule(left, () => {
          diagnostic?.cleanupTimedOut()
          settle(false)
        })
        if (typeof cancel !== 'function') throw new Error('receiver_unavailable')
        timer = { active: true, cancel }
      } catch {
        settle(false)
        return
      }
      work.then(settle).catch(() => settle(false))
    })
  }

  // 先取快照再收尾；resourcesClosed只依實際close結果宣告。
  function finalize(): Promise<ReceiverResult> {
    if (finalizePromise) return finalizePromise
    finalizePromise = (async () => {
      let snapshot: ReceiverEvidence = { ...EMPTY_EVIDENCE }
      if (session) {
        try {
          snapshot = session.snapshot()
        } catch {
          failed = true
        }
      }
      const closed = await closeWithinBudget(closeAll())
      const resourcesClosed = closed && runtimeResourcesClosed
      const result = makeResult({
        ...snapshot,
        unavailable: failed || snapshot.unavailable,
        resourcesClosed,
      })
      if (!failed && resourcesClosed) diagnostic?.complete()
      else if (!resourcesClosed) diagnostic?.fail('unknown', 'unknown')
      try {
        await ports.writeResult(result)
      } catch {
        diagnostic?.fail('result_write', 'result_write_failed')
        secret.fill(0)
        return { ...result, unavailable: true, code: 'receiver_unavailable' as const }
      }
      secret.fill(0)
      return result
    })()
    return finalizePromise
  }

  // session送出的每個frame都先計入同一個budget，再進有界TX queue。
  function sessionSend(frame: Uint8Array): Promise<void> {
    try {
      budget.envelope(frame.length)
    } catch {
      diagnostic?.fail('unknown', 'budget_exceeded')
      fail()
      return Promise.reject(unavailableError())
    }
    if (!sender) return Promise.reject(unavailableError())
    return sender.send(frame)
  }

  // 週期檢查clock、整體期限與輸入窗；不因尚未收到輸入而延長。
  function armWatch(): void {
    if (finished) return
    schedule(WATCH_INTERVAL_MS, () => {
      if (finished) return
      const value = readClock()
      if (value === null) return
      if (value - startedClock >= RUN_BUDGET_MS - CLOSE_BUDGET_MS) {
        fail()
        return
      }
      if (session) {
        let evidence: ReceiverEvidence
        try {
          // session.failed()區分登入前的預設unavailable與真正不可恢復失敗。
          if (session.failed()) {
            fail()
            return
          }
          evidence = session.snapshot()
        } catch {
          fail()
          return
        }
        if (evidence.overflow || (evidence.authenticated && evidence.unavailable)) {
          fail()
          return
        }
        if (evidence.windowComplete) {
          succeed()
          return
        }
      }
      armWatch()
    })
  }

  // 只讀relay完整frame並交給session；任何null／錯誤都停止，不留背景reader。
  async function pump(): Promise<void> {
    while (!finished && relay) {
      let frame: Uint8Array | null
      try {
        frame = await relay.receive()
      } catch {
        if (finished) return
        diagnostic?.fail('unknown', 'io_failed')
        fail()
        return
      }
      if (finished) return
      if (frame === null) {
        const reason = readReceiverFailureReason(relay)
        if (finished) return
        diagnostic?.fail('unknown', reason)
        fail()
        return
      }
      try {
        budget.envelope(frame.length)
      } catch {
        diagnostic?.fail('unknown', 'budget_exceeded')
        fail()
        return
      }
      try {
        await session!.receive(frame)
      } catch {
        fail()
        return
      }
      if (finished) return
      const value = readClock()
      if (value === null) return
      let evidence: ReceiverEvidence
      try {
        // session.failed()區分登入前的預設unavailable與真正不可恢復失敗。
        if (session!.failed()) {
          fail()
          return
        }
        evidence = session!.snapshot()
      } catch {
        fail()
        return
      }
      if (evidence.overflow || (evidence.authenticated && evidence.unavailable)) {
        fail()
        return
      }
      if (evidence.windowComplete) {
        succeed()
        return
      }
    }
  }

  // 依序建crypto、relay與session；每一步都在socket前驗證或受同一signal約束。
  async function start(): Promise<void> {
    try {
      signal.addEventListener('abort', onAbort, { once: true })
      abortAttached = true
    } catch {
      fail()
      return
    }
    if (signal.aborted) {
      fail()
      return
    }
    const now = readClock()
    if (now === null) return
    startedClock = now
    deadlineTimer = schedule(RUN_BUDGET_MS - CLOSE_BUDGET_MS, () => {
      deadlineTimer = null
      diagnostic?.fail('unknown', 'deadline')
      fail()
    })
    if (!deadlineTimer) return
    try {
      crypto = createReceiverCrypto(trusted)
      diagnostic?.acquire('session')
    } catch {
      fail()
      return
    }
    let keyframe: Uint8Array
    try {
      keyframe = verifyReceiverVp8(ports.publicVp8)
    } catch {
      fail()
      return
    }
    try {
      relay = await connectReceiverRelay(
        trusted,
        trustedEndpoints,
        crypto.signingPublicKey,
        network,
        internal.signal,
        diagnostic,
      )
    } catch {
      fail()
      return
    }
    if (finished) {
      try {
        await relay.close()
      } catch {
        runtimeResourcesClosed = false
      }
      return
    }
    try {
      session = createReceiverSession(trusted, secret, {
        crypto,
        send: (frame) => sessionSend(frame),
        now: () => network.now(),
        schedule: (delayMs, callback) => network.schedule(delayMs, callback),
        publicVp8: keyframe,
        diagnostic,
      })
      sender = createRuntimeSender(
        // relay不存在時以固定錯誤終止sender，不得當成發送成功。
        async (frame) => {
          if (!relay) throw unavailableError()
          await relay.send(frame)
        },
        () => fail(),
      )
    } catch {
      fail()
      return
    }
    if (finished) return
    try {
      await session.start()
    } catch {
      fail()
      return
    }
    if (finished) return
    armWatch()
    void pump()
  }

  void start().catch(() => fail())
  return completion
}
