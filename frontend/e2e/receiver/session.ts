import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { encodeMessage, hbb } from '../../src/rdweb/codec.ts'
import {
  receiverUnavailable,
  validateReceiverBinding,
  type ReceiverBinding,
  type ReceiverEvidence,
} from './contract.ts'
import type { ReceiverCrypto } from './crypto.ts'
import { createReceiverInput } from './input.ts'
import { receiverPeerInfo } from './media.ts'
import { decodeReceiverPeerMessage } from './wire.ts'
import type { ReceiverDiagnosticRecorder, ReceiverDiagnosticReason } from './diagnostic.ts'

const HANDSHAKE_TIMEOUT_MS = 15000
const VIDEO_INTERVAL_MS = 1000
const MAX_PASSWORD_BYTES = 4096
const MAX_VIDEO_BYTES = 65536
const MAX_FRAME_BYTES = 65552

// session只要求Task29提供已保存的peer port；不在本層開socket或決定目的地。
export interface ReceiverSessionPorts {
  crypto: ReceiverCrypto
  send(frame: Uint8Array): Promise<void>
  now(): number
  schedule(delayMs: number, callback: () => void): () => void
  publicVp8: Uint8Array
  diagnostic?: ReceiverDiagnosticRecorder
}

export interface ReceiverSession {
  start(): Promise<void>
  receive(frame: Uint8Array): Promise<void>
  snapshot(): ReceiverEvidence
  // 只供runtime判斷session是否已進入不可恢復終態；初始未認證不算失敗。
  failed(): boolean
  close(): Promise<boolean>
}

interface OwnedTimer {
  active: boolean
  cancel: () => void
}

// 建立單輪peer session；任何初始化錯誤都只回固定分類，不帶密碼或fixture值。
export function createReceiverSession(
  binding: ReceiverBinding,
  password: Uint8Array,
  ports: ReceiverSessionPorts,
): ReceiverSession {
  const b = validateReceiverBinding(binding)
  try {
    if (
      !(password instanceof Uint8Array) ||
      password.length < 1 ||
      password.length > MAX_PASSWORD_BYTES
    )
      return receiverUnavailable()
    if (
      !(ports.publicVp8 instanceof Uint8Array) ||
      ports.publicVp8.length < 1 ||
      ports.publicVp8.length > MAX_VIDEO_BYTES
    )
      return receiverUnavailable()
    if (
      typeof ports.send !== 'function' ||
      typeof ports.now !== 'function' ||
      typeof ports.schedule !== 'function' ||
      !ports.crypto ||
      typeof ports.crypto.signedId !== 'function' ||
      typeof ports.crypto.acceptPublicKey !== 'function' ||
      typeof ports.crypto.encrypt !== 'function' ||
      typeof ports.crypto.decrypt !== 'function' ||
      typeof ports.crypto.dispose !== 'function'
    )
      return receiverUnavailable()
  } catch {
    return receiverUnavailable()
  }
  const crypto = ports.crypto
  const vp8 = new Uint8Array(ports.publicVp8)
  const secret = new Uint8Array(password)
  const input = createReceiverInput(b, () => ports.now())
  let phase: 'idle' | 'awaiting_public_key' | 'awaiting_login' | 'ready' | 'closed' = 'idle'
  let started = false,
    closed = false,
    failed = false,
    unavailable = true,
    authenticated = false,
    identityBound = false,
    macVerified = false,
    parsed = false,
    salt = '',
    challenge = '',
    handshakeTimer: OwnedTimer | null = null,
    videoTimer: OwnedTimer | null = null,
    videoSending = false,
    lastPts = -1

  // 取消本層擁有的timer，呼叫端不再保留可重複觸發的回呼。
  function cancelTimer(timer: OwnedTimer | null): null {
    if (timer) {
      timer.active = false
      try {
        timer.cancel()
      } catch {
        ports.diagnostic?.close('timers', false)
        /* 取消失敗仍以active=false阻止晚到回呼。 */
      }
    }
    return null
  }

  // 只登記一次性timer；schedule失敗立即作廢整輪，不留下背景工作。
  function scheduleTimer(delayMs: number, callback: () => void): OwnedTimer | null {
    let timer: OwnedTimer | null = null
    try {
      const cancel = ports.schedule(delayMs, () => {
        if (!timer || !timer.active) return
        timer.active = false
        callback()
      })
      timer = {
        active: true,
        cancel: typeof cancel === 'function' ? cancel : () => undefined,
      }
      return timer
    } catch {
      fail()
      return null
    }
  }

  // 清除所有握手與影像timer；任何終態都不可再送Hash、PeerInfo或影像。
  function clearTimers(): void {
    handshakeTimer = cancelTimer(handshakeTimer)
    videoTimer = cancelTimer(videoTimer)
  }

  // 清除本輪密碼副本與salt／challenge字串引用，成功或失敗都只嘗試一次。
  function clearSecret(): void {
    secret.fill(0)
    salt = ''
    challenge = ''
  }

  // 錯誤不可恢復：停止timer／影像、釋放crypto與密碼，但不由本層宣告resourcesClosed。
  function fail(reason: ReceiverDiagnosticReason = 'unknown'): void {
    if (failed) return
    ports.diagnostic?.fail(
      phase === 'awaiting_public_key'
        ? 'public_key'
        : phase === 'awaiting_login'
          ? 'login'
          : phase === 'ready'
            ? 'input_window'
            : 'setup',
      reason,
    )
    failed = true
    closed = true
    unavailable = true
    phase = 'closed'
    clearTimers()
    input.dispose()
    clearSecret()
    try {
      crypto.dispose()
    } catch {
      ports.diagnostic?.close('session', false)
      /* 已是固定錯誤路徑，不讓原生例外外洩。 */
    }
  }

  // 以固定順序加密送出；任何編碼或send失敗都停止後續控制與影像。
  async function sendMessage(message: hbb.IMessage): Promise<boolean> {
    let plain: Uint8Array | null = null
    try {
      plain = encodeMessage(message)
      let frame: Uint8Array
      try {
        frame = crypto.encrypt(plain)
      } catch {
        fail('crypto_rejected')
        return false
      }
      try {
        await ports.send(frame)
      } catch {
        fail('io_failed')
        return false
      }
      return true
    } catch {
      fail()
      return false
    } finally {
      plain?.fill(0)
    }
  }

  // 影像PTS只取本機單調clock；無法取得有限值時直接停止，不送重複或倒退PTS。
  function nextPts(): number | null {
    try {
      const value = ports.now()
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        fail()
        return null
      }
      const pts = Math.max(lastPts + 1, Math.floor(value))
      lastPts = pts
      return pts
    } catch {
      fail()
      return null
    }
  }

  // 影像frame只使用已驗slice；每次送完才允許再排下一個，維持單一pending。
  async function sendVideo(pts: number): Promise<boolean> {
    return sendMessage({
      videoFrame: {
        vp8s: {
          frames: [{ data: vp8, key: true, pts }],
        },
        display: 0,
      },
    })
  }

  // 每秒最多一張keyframe；send未完成時不排timer，refresh也不得堆出queue。
  async function pumpVideo(): Promise<void> {
    if (closed || failed || videoSending) return
    videoSending = true
    try {
      const pts = nextPts()
      if (pts === null) return
      if (!(await sendVideo(pts))) return
    } finally {
      videoSending = false
    }
    scheduleVideo()
  }

  // 只有目前沒有timer且沒有pending send時才排下一張，避免重複排程。
  function scheduleVideo(): void {
    if (closed || failed || videoSending || videoTimer) return
    videoTimer = scheduleTimer(VIDEO_INTERVAL_MS, () => {
      videoTimer = null
      void pumpVideo()
    })
  }

  // 認證前固定15秒；PublicKey與LoginRequest各自重啟，不以人工交接延長。
  function armHandshake(): void {
    handshakeTimer = cancelTimer(handshakeTimer)
    handshakeTimer = scheduleTimer(HANDSHAKE_TIMEOUT_MS, () => {
      handshakeTimer = null
      fail('deadline')
    })
  }

  // 以pinned proof演算法及固定時間比較驗本輪32-byte proof。
  function proofMatches(proof: Uint8Array): boolean {
    if (!(proof instanceof Uint8Array) || proof.length !== 32 || !salt || !challenge) return false
    let intermediate: Uint8Array | null = null,
      expected: Uint8Array | null = null
    try {
      intermediate = createHash('sha256').update(secret).update(salt, 'utf8').digest()
      expected = createHash('sha256').update(intermediate).update(challenge, 'utf8').digest()
      return expected.length === proof.length && timingSafeEqual(expected, proof)
    } catch {
      return false
    } finally {
      intermediate?.fill(0)
      expected?.fill(0)
    }
  }

  // 只接受本輪ID、正常遠控union、精確選項及有效proof；不提供免密或重試。
  function validLogin(request: hbb.ILoginRequest): boolean {
    try {
      if (request.union !== undefined) return false
      if (request.username !== b.peerId) return false
      if (request.videoAckRequired !== true) return false
      const option = request.option
      if (
        !option ||
        option.disableAudio !== hbb.OptionMessage.BoolOption.Yes ||
        option.disableClipboard !== hbb.OptionMessage.BoolOption.Yes ||
        option.disableKeyboard !== hbb.OptionMessage.BoolOption.No ||
        option.disableCamera !== hbb.OptionMessage.BoolOption.Yes ||
        option.imageQuality !== hbb.ImageQuality.Balanced ||
        option.customFps !== 30 ||
        option.supportedDecoding?.abilityVp8 !== 1
      )
        return false
      return proofMatches(request.password ?? new Uint8Array())
    } catch {
      return false
    }
  }

  // 認證成功後依固定順序送PeerInfo、鍵盤可用／剪貼簿停用及第一張公開keyframe。
  async function sendLoginSequence(): Promise<boolean> {
    if (
      !(await sendMessage({
        loginResponse: { peerInfo: receiverPeerInfo() },
      }))
    )
      return false
    if (
      !(await sendMessage({
        misc: {
          permissionInfo: {
            permission: hbb.PermissionInfo.Permission.Keyboard,
            enabled: true,
          },
        },
      }))
    )
      return false
    if (
      !(await sendMessage({
        misc: {
          permissionInfo: {
            permission: hbb.PermissionInfo.Permission.Clipboard,
            enabled: false,
          },
        },
      }))
    )
      return false
    return sendVideo(0)
  }

  // 完成認證後只切ready；resourcesClosed仍留Task29依實際收尾彙總。
  async function acceptLogin(frame: Uint8Array): Promise<void> {
    let plain: Uint8Array | null = null
    try {
      try {
        plain = crypto.decrypt(frame)
      } catch {
        macVerified = false
        fail('crypto_rejected')
        return
      }
      macVerified = true
      let message: hbb.Message
      try {
        message = decodeReceiverPeerMessage(plain)
      } catch {
        parsed = false
        fail('decode_rejected')
        return
      }
      parsed = true
      if (message.union !== 'loginRequest' || !message.loginRequest) {
        fail('unexpected_control')
        return
      }
      const request = message.loginRequest
      if (!validLogin(request)) {
        fail('authentication_rejected')
        return
      }
      cancelTimer(handshakeTimer)
      handshakeTimer = null
      clearSecret()
      phase = 'ready'
      authenticated = true
      identityBound = true
      unavailable = false
      lastPts = -1
      if (!(await sendLoginSequence())) return
      scheduleVideo()
    } finally {
      plain?.fill(0)
    }
  }

  // PublicKey只可來一次；失敗不重送SignedId或改ID重試。
  async function acceptPublicKey(frame: Uint8Array): Promise<void> {
    try {
      crypto.acceptPublicKey(frame)
      salt = randomBytes(16).toString('hex')
      challenge = randomBytes(16).toString('hex')
    } catch {
      fail('crypto_rejected')
      return
    }
    if (!salt || !challenge) {
      fail()
      return
    }
    if (!(await sendMessage({ hash: { salt, challenge } }))) return
    phase = 'awaiting_login'
    armHandshake()
  }

  // generated class的預設值在prototype上；轉成plain own data後才交給Task26的嚴格own檢查。
  function readyInput(message: hbb.Message): unknown {
    if (message.union === 'mouseEvent') {
      const event = message.mouseEvent
      return {
        union: 'mouseEvent',
        mouseEvent: {
          mask: event?.mask,
          x: event?.x,
          y: event?.y,
          modifiers: event?.modifiers,
        },
      }
    }
    if (message.union === 'keyEvent') {
      const event = message.keyEvent
      return {
        union: 'keyEvent',
        keyEvent: {
          down: event?.down,
          press: event?.press,
          mode: event?.mode,
          modifiers: event?.modifiers,
          controlKey: event?.controlKey ?? null,
          chr: event?.chr ?? null,
          unicode: event?.unicode ?? null,
          seq: event?.seq ?? null,
          win2winHotkey: event?.win2winHotkey ?? null,
        },
      }
    }
    return message
  }

  // TestDelay的time可能是number或pinned int64 Long；只接受非負整數語意後原值echo。
  function validDelayTime(value: unknown): boolean {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0
    if (typeof value === 'bigint') return value >= 0n
    if (!value || typeof value !== 'object') return false
    const candidate = value as { low?: unknown; high?: unknown; unsigned?: unknown }
    return (
      typeof candidate.low === 'number' &&
      Number.isInteger(candidate.low) &&
      typeof candidate.high === 'number' &&
      Number.isInteger(candidate.high) &&
      typeof candidate.unsigned === 'boolean'
    )
  }

  // ready後只接受TestDelay echo、video ACK／refresh、已核對畫質與權限控制及輸入事件。
  async function acceptReady(frame: Uint8Array): Promise<void> {
    let plain: Uint8Array | null = null
    try {
      try {
        plain = crypto.decrypt(frame)
      } catch {
        macVerified = false
        fail('crypto_rejected')
        return
      }
      macVerified = true
      let message: hbb.Message
      try {
        message = decodeReceiverPeerMessage(plain)
      } catch {
        parsed = false
        fail('decode_rejected')
        return
      }
      parsed = true
      switch (message.union) {
        case 'testDelay': {
          const delay = message.testDelay
          if (!delay || !validDelayTime(delay.time)) {
            fail()
            return
          }
          if (!(await sendMessage({ testDelay: { time: delay.time, fromClient: false } }))) return
          return
        }
        case 'misc': {
          const misc = message.misc
          if (!misc) {
            fail()
            return
          }
          switch (misc.union) {
            case 'videoReceived':
              if (typeof misc.videoReceived !== 'boolean') {
                fail()
                return
              }
              return
            case 'refreshVideo':
              if (typeof misc.refreshVideo !== 'boolean') {
                fail()
                return
              }
              scheduleVideo()
              return
            case 'permissionInfo': {
              const info = misc.permissionInfo
              if (
                !info ||
                typeof info.enabled !== 'boolean' ||
                (info.permission !== hbb.PermissionInfo.Permission.Keyboard &&
                  info.permission !== hbb.PermissionInfo.Permission.Clipboard)
              ) {
                fail()
                return
              }
              return
            }
            case 'option':
              if (misc.option?.imageQuality !== hbb.ImageQuality.Balanced) {
                fail()
                return
              }
              return
            default:
              fail()
              return
          }
        }
        case 'mouseEvent':
        case 'keyEvent':
          try {
            input.record(readyInput(message))
          } catch {
            fail()
          }
          return
        default:
          fail()
      }
    } finally {
      plain?.fill(0)
    }
  }

  // start只一次；先送SignedId再等待真NaCl PublicKey，不建立其他peer。
  async function start(): Promise<void> {
    if (started || closed) return receiverUnavailable()
    started = true
    phase = 'awaiting_public_key'
    armHandshake()
    let frame: Uint8Array
    try {
      frame = crypto.signedId()
    } catch {
      fail()
      return receiverUnavailable()
    }
    try {
      await ports.send(frame)
    } catch {
      fail()
      return receiverUnavailable()
    }
  }

  // 依階段只處理一種輸入；所有錯誤都收斂成unavailable，不把原生例外交給呼叫端。
  async function receive(frame: Uint8Array): Promise<void> {
    if (closed) return
    try {
      if (!(frame instanceof Uint8Array)) {
        fail()
        return
      }
      if (frame.length > MAX_FRAME_BYTES) {
        fail()
        return
      }
      // 原生heartbeat長度≤1，不消耗secretbox RX counter也不推進狀態。
      if (frame.length <= 1) return
      if (!started || phase === 'idle') {
        fail()
        return
      }
      if (phase === 'awaiting_public_key') {
        await acceptPublicKey(frame)
        return
      }
      if (phase === 'awaiting_login') {
        await acceptLogin(frame)
        return
      }
      if (phase === 'ready') await acceptReady(frame)
    } catch {
      fail()
    }
  }

  // 只回固定13個安全布林；原文、proof、password與endpoint都不離開閉包。
  function snapshot(): ReceiverEvidence {
    const observed = input.snapshot()
    return {
      identityBound,
      authenticated,
      received: observed.received,
      macVerified,
      parsed,
      textSingle: observed.textSingle,
      textExact: observed.textExact,
      sequenceComplete: observed.sequenceComplete,
      sequenceValid: observed.sequenceValid,
      windowComplete: observed.windowComplete,
      overflow: observed.overflow,
      unavailable: unavailable || observed.unavailable,
      resourcesClosed: false,
    }
  }

  // close只收本層自有timer／crypto／輸入；不得搶先宣告runtime資源已全部關閉。
  async function close(): Promise<boolean> {
    if (closed) return true
    closed = true
    phase = 'closed'
    clearTimers()
    input.dispose()
    clearSecret()
    try {
      crypto.dispose()
    } catch {
      ports.diagnostic?.close('session', false)
      /* 關閉路徑仍回固定結果，不讓原生例外改變already-owned cleanup。 */
    }
    return true
  }

  return { start, receive, snapshot, failed: () => failed, close }
}
