import { PeerCrypto } from './crypto'
import { encodeMessage, decodeMessage, hbb } from './codec'
import { base64Bytes, type Callbacks, type Ready, type Phase } from './types'
export class LoginProtocol {
  #crypto = new PeerCrypto()
  #state: Phase = 'verifying_identity'
  #closed = false
  #timer: ReturnType<typeof setTimeout> | null = null
  // 握手只信任server驗證過的ready peer key，不從SignedId自行取trust root。
  constructor(
    private readonly ready: Ready,
    private readonly callbacks: Callbacks,
  ) {
    this.phase('verifying_identity')
  }
  // 同步依序驗MAC／protobuf，HTTP assist另以revision-aware callback等待。
  receive(bytes: Uint8Array): void {
    if (this.#closed || bytes.length <= 1) return
    let plaintext: Uint8Array | null = null
    try {
      if (this.#state === 'verifying_identity') {
        const signed = decodeMessage(bytes)
        if (signed.union !== 'signedId' || !signed.signedId?.id) throw new Error('protocol_error')
        this.callbacks.send(
          this.#crypto.handshake(
            signed.signedId.id,
            this.ready.rustdesk_id,
            base64Bytes(this.ready.peer_signing_key),
          ),
        )
        this.phase('awaiting_hash')
        return
      }
      plaintext = this.#crypto.decrypt(bytes)
      const message = decodeMessage(plaintext)
      if (message.testDelay) {
        this.send({ testDelay: { time: message.testDelay.time, fromClient: false } })
        return
      }
      if (message.misc?.permissionInfo) return
      if (message.hash && this.#state === 'awaiting_hash') {
        if (!message.hash.salt || !message.hash.challenge) throw new Error('protocol_error')
        this.phase('assisting')
        void this.callbacks
          .assist(this.ready.connection_id, message.hash.salt, message.hash.challenge)
          .then((proof) => this.login(proof))
          .catch(() => this.fail('login_assist_failed'))
        return
      }
      if (message.loginResponse && this.#state === 'awaiting_login') {
        const info = message.loginResponse.peerInfo
        if (
          message.loginResponse.union !== 'peerInfo' ||
          !info ||
          !info.platform ||
          !info.version ||
          (info.displays?.length ?? 0) > 32
        )
          throw new Error('remote_login_failed')
        this.phase('verified')
        this.callbacks.verified({
          platform: info.platform.slice(0, 64),
          version: info.version.slice(0, 64),
          displayCount: info.displays?.length ?? 0,
        })
        this.dispose()
        return
      }
      throw new Error('protocol_error')
    } catch (error) {
      this.fail(
        error instanceof Error && ['crypto_failed', 'remote_login_failed'].includes(error.message)
          ? error.message
          : 'protocol_error',
      )
    } finally {
      plaintext?.fill(0)
    }
  }
  // Assist只可推進當前狀態，晚到proof先清除、不傳LoginRequest。
  private login(proof: Uint8Array): void {
    try {
      if (this.#closed) return
      if (this.#state !== 'assisting' || proof.length !== 32) throw new Error()
      this.phase('awaiting_login')
      this.send({
        loginRequest: {
          username: this.ready.rustdesk_id,
          password: proof,
          myId: globalThis.crypto.randomUUID(),
          myName: 'RustDesk Web Console',
          myPlatform: 'Web',
          sessionId: globalThis.crypto.getRandomValues(new Uint32Array(1))[0],
          version: '1.4.2',
          option: {
            disableAudio: hbb.OptionMessage.BoolOption.Yes,
            disableClipboard: hbb.OptionMessage.BoolOption.Yes,
          },
        },
      })
    } catch {
      this.fail('protocol_error')
    } finally {
      proof.fill(0)
    }
  }
  // 所有handshake後protocol只經secretbox傳送，encode明文立即清除。
  private send(message: hbb.IMessage): void {
    const bytes = encodeMessage(message)
    try {
      this.callbacks.send(this.#crypto.encrypt(bytes))
    } finally {
      bytes.fill(0)
    }
  }
  // 每個等待phase使用固定15秒deadline，不因heartbeat延長。
  private phase(value: Phase): void {
    this.#state = value
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer =
      value === 'verified' ? null : setTimeout(() => this.fail('connection_timeout'), 15000)
    this.callbacks.phase(value)
  }
  // 失敗只送固定分類，先銷毀key才通知host關閉WS。
  private fail(code: string): void {
    if (!this.#closed) {
      this.dispose()
      this.callbacks.failure(code)
    }
  }
  // 取消或verified結束時清除對稱key、counter與timer，不再接收舊訊息。
  dispose(): void {
    this.#closed = true
    this.#crypto.dispose()
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
  }
}
