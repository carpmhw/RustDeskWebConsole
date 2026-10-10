import { PeerCrypto } from './crypto'
import { encodeMessage, decodeMessage, hbb } from './codec'
import { base64Bytes, type Callbacks, type Ready, type Phase } from './types'
import type { CodecCapabilities, DisplayGeometry, PeerVideo, VideoPacket } from './video-types'
import { supportedDecoding } from './capabilities'
import { checkDisplay } from './video-limits'
export class LoginProtocol {
  #crypto = new PeerCrypto()
  #state: Phase = 'verifying_identity'
  #closed = false
  #peer: PeerVideo | null = null
  #timer: ReturnType<typeof setTimeout> | null = null
  // 握手只信任server驗證過的ready peer key，不從SignedId自行取trust root。
  constructor(
    private readonly ready: Ready,
    private readonly callbacks: Callbacks,
    private readonly capabilities: CodecCapabilities,
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
          message.loginResponse.union === 'error' &&
          /desktop|display|screen|x11|wayland/i.test(message.loginResponse.error ?? '')
        )
          throw new Error('remote_desktop_unavailable')
        if (
          message.loginResponse.union !== 'peerInfo' ||
          !info ||
          !info.platform ||
          !info.version ||
          (info.displays?.length ?? 0) > 32
        )
          throw new Error('remote_login_failed')
        const peer = this.peer(info)
        this.#peer = peer
        this.phase('awaiting_video')
        this.callbacks.verified(peer)
        return
      }
      if (this.#state === 'awaiting_video' || this.#state === 'streaming') {
        if (message.videoFrame) {
          const video = message.videoFrame
          const families = { vp9s: 'vp9', vp8s: 'vp8', av1s: 'av1', h264s: 'h264' } as const
          const member = video.union as keyof typeof families
          const codec = families[member]
          const frames = video[member]?.frames
          if (!codec || !frames?.length) throw new Error('protocol_error')
          // Media回呼同步作ownedcopy，receive finally才清原始plaintext。
          const packet: VideoPacket = {
            display: video.display ?? 0,
            codec,
            frames: frames.map((value) => ({
              codec,
              data: value.data ?? new Uint8Array(),
              key: value.key ?? false,
              pts: value.pts?.toString() ?? '0',
            })),
          }
          this.callbacks.video(packet)
          return
        }
        if (message.peerInfo) {
          if (!this.#peer) throw new Error('protocol_error')
          // Pinned display_service僅傳displays；相容current_display=0不是新選擇。
          this.#peer = this.peer({
            ...message.peerInfo,
            platform: message.peerInfo.platform || this.#peer.platform,
            version: message.peerInfo.version || this.#peer.version,
            currentDisplay: this.#peer.display,
          })
          this.callbacks.verified(this.#peer)
          return
        }
        const misc = message.misc
        if (misc?.switchDisplay) {
          const value = misc.switchDisplay
          const geometry: DisplayGeometry = {
            display: value.display ?? 0,
            width: value.width ?? 0,
            height: value.height ?? 0,
          }
          checkDisplay(geometry)
          if (!this.#peer || geometry.display >= this.#peer.displayCount)
            throw new Error('protocol_error')
          this.#peer = { ...this.#peer, ...geometry }
          this.callbacks.display(geometry)
          return
        }
        if (
          misc &&
          [
            'supportedEncoding',
            'backNotification',
            'portableServiceRunning',
            'uac',
            'foregroundWindowElevated',
            'audioFormat',
          ].includes(misc.union ?? '')
        )
          return
        if (misc && ['closeReason', 'stopService'].includes(misc.union ?? '')) {
          this.fail('connection_failed')
          return
        }
        if (
          [
            'cursorData',
            'cursorPosition',
            'cursorId',
            'audioFrame',
            'clipboard',
            'multiClipboards',
            'cliprdr',
            'fileAction',
            'fileResponse',
            'voiceCallRequest',
            'voiceCallResponse',
            'messageBox',
            'terminalAction',
            'terminalResponse',
          ].includes(message.union ?? '')
        )
          return
      }
      throw new Error('protocol_error')
    } catch (error) {
      this.fail(
        error instanceof Error &&
          [
            'crypto_failed',
            'remote_login_failed',
            'remote_desktop_unavailable',
            'peer_display_invalid',
            'codec_unsupported',
          ].includes(error.message)
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
          videoAckRequired: true,
          option: {
            disableAudio: hbb.OptionMessage.BoolOption.Yes,
            disableClipboard: hbb.OptionMessage.BoolOption.Yes,
            disableKeyboard: hbb.OptionMessage.BoolOption.Yes,
            disableCamera: hbb.OptionMessage.BoolOption.Yes,
            imageQuality: hbb.ImageQuality.Balanced,
            customFps: 30,
            supportedDecoding: supportedDecoding(this.capabilities),
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
  // 安全peer幾何供Worker使用，不回hostname/username或rawprotobuf至UI。
  private peer(info: hbb.IPeerInfo): PeerVideo {
    const displays = info.displays ?? []
    const index = info.currentDisplay ?? 0
    const display = displays[index]
    if (!display) throw new Error('peer_display_invalid')
    if (!info.platform || !info.version || displays.length > 32)
      throw new Error('remote_login_failed')
    const geometry = { display: index, width: display.width ?? 0, height: display.height ?? 0 }
    checkDisplay(geometry)
    return {
      ...geometry,
      platform: info.platform.slice(0, 64),
      version: info.version.slice(0, 64),
      displayCount: displays.length,
    }
  }
  // ACK／畫質／refresh皆走同一secretbox TX排序。
  sendControl(message: hbb.IMessage): void {
    if (!this.#closed) this.send(message)
  }
  // 首張真Main presented後才streaming；media重新配置可回awaiting_video。
  videoPhase(value: 'awaiting_video' | 'streaming'): void {
    if (!this.#closed) this.phase(value)
  }
  // 每個等待phase使用固定15秒deadline，不因heartbeat延長。
  private phase(value: Phase): void {
    this.#state = value
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer =
      value === 'awaiting_video' || value === 'streaming'
        ? null
        : setTimeout(() => this.fail('connection_timeout'), 15000)
    this.callbacks.phase(value)
  }
  // 失敗只送固定分類，先銷毀key才通知host關閉WS。
  private fail(code: string): void {
    if (!this.#closed) {
      this.dispose()
      this.callbacks.failure(code)
    }
  }
  // 取消或終止時清除對稱key、counter與timer，不再接收舊訊息。
  dispose(): void {
    this.#closed = true
    this.#peer = null
    this.#crypto.dispose()
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
  }
}
