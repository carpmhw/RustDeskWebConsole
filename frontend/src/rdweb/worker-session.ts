import type { VideoMainEvent, VideoWorkerEvent, FrameResource } from './video-types'
import type { DecoderFactory } from './decoder'
import { buildWsUrl } from '../utils/basePath'
import { frame, WireFramer } from './framing'
import { LoginProtocol } from './protocol'
import { MediaDecoder } from './media-decoder'
import { probeCodecs } from './capabilities'
import { parseReady, failureCode } from './types'
import { hbb } from './codec'
import { VIDEO_LIMITS } from './video-limits'
import type { CodecCapabilities } from './video-types'
export interface SocketPort {
  readonly readyState: number
  readonly bufferedAmount: number
  binaryType: BinaryType
  onmessage: ((event: MessageEvent) => void) | null
  onerror: (() => void) | null
  onclose: (() => void) | null
  // 只送當次加密或握手binary。
  send(bytes: Uint8Array): void
  // 取消或失敗關閉同一WS。
  close(): void
}
export interface WorkerDependencies {
  query: (config: VideoDecoderConfig) => Promise<VideoDecoderSupport>
  factory: DecoderFactory
  socket: (url: string, protocols: string[]) => SocketPort
  now: () => number
  isFrame: (value: FrameResource) => value is VideoFrame
}
export class ProtocolWorkerSession {
  #revision = 0
  #closed = true
  #caps: CodecCapabilities | null = null
  #probe: VideoFrame | null = null
  #socket: SocketPort | null = null
  #protocol: LoginProtocol | null = null
  #media: MediaDecoder | null = null
  #framer: WireFramer | null = null
  #transport: 'tcp' | 'ws' = 'tcp'
  #timer: ReturnType<typeof setTimeout> | null = null
  #ticker: ReturnType<typeof setInterval> | null = null
  #resolve: ((proof: Uint8Array) => void) | null = null
  #reject: (() => void) | null = null
  // Worker內私有生命週期；依賴注入只供單元，不存在production testmode。
  constructor(
    private readonly post: (value: VideoWorkerEvent, transfer?: Transferable[]) => void,
    private readonly dependencies: WorkerDependencies,
  ) {}
  // 原始訊息按operation匹配，proof/frame晚到先清除不能復活。
  handle(value: VideoMainEvent): void {
    if (value.type === 'probe') {
      this.probe(value)
      return
    }
    if (value.type === 'start' && (!this.#caps || this.#closed)) {
      this.post({ type: 'failure', revision: value.revision, code: 'video_unsupported' })
      return
    }
    if (value.revision !== this.#revision || this.#closed) {
      if (value.type === 'assist-result') value.proof.fill(0)
      return
    }
    try {
      if (value.type === 'start') this.start(value)
      else if (value.type === 'dispose') this.dispose()
      else if (value.type === 'assist-failed') this.fail('login_assist_failed')
      else if (value.type === 'assist-result') {
        if (!this.#resolve) {
          value.proof.fill(0)
          return
        }
        const resolve = this.#resolve
        this.#resolve = null
        this.#reject = null
        resolve(value.proof)
      } else if (value.type === 'presented') this.#media?.presented(value)
      else if (value.type === 'quality') {
        const quality = {
          low: hbb.ImageQuality.Low,
          balanced: hbb.ImageQuality.Balanced,
          high: hbb.ImageQuality.Best,
        }[value.quality]
        if (!quality) throw new Error()
        this.#protocol?.sendControl({ misc: { option: { imageQuality: quality } } })
      }
    } catch {
      this.fail('protocol_error')
    }
  }
  // Native能力及公開frame往返必須先於ticket／WS，兩端都有5秒期限。
  private probe(value: Extract<VideoMainEvent, { type: 'probe' }>): void {
    if (value.revision <= this.#revision) {
      value.frame.close()
      return
    }
    this.dispose()
    this.#revision = value.revision
    this.#closed = false
    this.#probe = value.frame
    if (!this.dependencies.isFrame(value.frame)) {
      this.#probe?.close()
      this.#probe = null
      this.fail('video_unsupported')
      return
    }
    this.#timer = setTimeout(() => this.fail('video_unsupported'), VIDEO_LIMITS.probeMs)
    const revision = value.revision
    void probeCodecs(this.dependencies.query)
      .then((caps) => {
        if (this.#closed || revision !== this.#revision) return
        if (this.#timer) clearTimeout(this.#timer)
        this.#timer = null
        this.#caps = caps
        this.post({ type: 'capabilities', revision, capabilities: caps, frame: value.frame }, [
          value.frame,
        ])
        this.#probe = null
      })
      .catch(() => {
        if (revision === this.#revision) this.fail('video_unsupported')
      })
  }
  // 同一已probe Worker以short-ticket開WS，保存的transport只從ready取得。
  private start(value: Extract<VideoMainEvent, { type: 'start' }>): void {
    if (this.#socket || !this.#caps) throw new Error()
    this.#socket = this.dependencies.socket(
      buildWsUrl(`api/v1/targets/${value.target}/connect`, value.origin, value.base),
      ['rdweb.v1', 'rdweb.ticket.' + value.ticket],
    )
    value.ticket = ''
    this.#socket.binaryType = 'arraybuffer'
    this.#timer = setTimeout(() => this.fail('connection_timeout'), 30000)
    // 原生消息同步MAC排序，不建立等待native/HTTP的無界接收queue。
    this.#socket.onmessage = (event): void => {
      if (this.#closed) return
      try {
        if (typeof event.data === 'string') {
          if (event.data.length > 4096) throw new Error()
          const raw: unknown = JSON.parse(event.data)
          if (this.#protocol) {
            const error = raw as { type?: string }
            if (error.type === 'rdweb.error') {
              this.fail('connection_failed')
              return
            }
            throw new Error()
          }
          const ready = parseReady(raw, value.target, value.peer)
          this.#transport = ready.transport
          this.#framer = new WireFramer(ready.transport, VIDEO_LIMITS.wire)
          if (this.#timer) clearTimeout(this.#timer)
          this.#timer = null
          this.#protocol = new LoginProtocol(
            ready,
            {
              // Phase只由可信協定傳給host。
              phase: (phase) => this.post({ type: 'phase', revision: this.#revision, phase }),
              // TX加密由protocol排序，browserbuffer硬上限不能省略。
              send: (bytes) => {
                if (
                  !this.#socket ||
                  this.#socket.readyState !== 1 ||
                  this.#socket.bufferedAmount > 1048576
                )
                  throw new Error()
                this.#socket.send(frame(bytes, this.#transport))
              },
              // Worker只請main代呼assist，不取得JWT。
              assist: (connection, salt, challenge) =>
                new Promise((resolve, reject) => {
                  if (this.#resolve) {
                    reject(new Error())
                    return
                  }
                  this.#resolve = resolve
                  this.#reject = () => reject(new Error())
                  this.post({
                    type: 'assist',
                    revision: this.#revision,
                    connection,
                    salt,
                    challenge,
                  })
                }),
              // PeerInfo不關閉連線，開始有界media等待。
              verified: (peer) => {
                this.post({ type: 'peer', revision: this.#revision, peer })
                if (!this.#media) this.createMedia()
                this.#media!.updateDisplay(peer)
              },
              // Media同步ownedcopy後protocol才清plaintext。
              video: (packet) => this.#media?.receive(packet),
              // 同螢幕幾何更新重配generation。
              display: (display) => this.#media?.updateDisplay(display),
              // 協定失敗立刻銷毀session。
              failure: (code) => this.fail(code),
            },
            this.#caps!,
          )
        } else {
          if (!this.#protocol || !this.#framer || !(event.data instanceof ArrayBuffer))
            throw new Error()
          for (const bytes of this.#framer.push(new Uint8Array(event.data))) {
            if (this.#closed) break
            this.#protocol.receive(bytes)
          }
        }
      } catch {
        this.fail('protocol_error')
      }
    }
    // 不暴露原生URL／header或exception。
    this.#socket.onerror = () => this.fail('connection_failed')
    // 未由使用者結束而断線一律固定失敗。
    this.#socket.onclose = () => this.fail('connection_failed')
    this.post({ type: 'phase', revision: this.#revision, phase: 'awaiting_ready' })
  }
  // 所有media控制都回同一crypto channel，不另建WS或降級。
  private createMedia(): void {
    this.#media = new MediaDecoder(
      this.#caps!,
      {
        revision: this.#revision,
        // Native frame真正transfer，ownership不能複製到Vue。
        frame: (value, tag) => {
          if (!this.dependencies.isFrame(value)) throw new Error()
          this.post({ type: 'frame', ...tag, frame: value }, [value])
        },
        // Main作廢舊generation並清Canvas。
        format: (generation, display) =>
          this.post({ type: 'format', revision: this.#revision, generation, display }),
        // Main呈現確認後才進streaming，非收到bytes就成功。
        phase: (phase) => this.#protocol?.videoPhase(phase),
        // 一次refresh不等同自動重連。
        refresh: (display) =>
          this.#protocol?.sendControl({ misc: { refreshVideoDisplay: display } }),
        // RustDesk沒有frame序號的ACK只表示處理容量。
        ack: () => this.#protocol?.sendControl({ misc: { videoReceived: true } }),
        // Media錯誤統一清所有資源。
        failure: (code) => this.fail(code),
        // 僅安全codec與幾何，FPS由Main算。
        stats: (stats) => this.post({ type: 'stats', revision: this.#revision, stats }),
      },
      this.dependencies.query,
      this.dependencies.factory,
      this.dependencies.now,
    )
    // 真時間deadline不靠新增影像或heartbeat延長。
    this.#ticker = setInterval(() => this.#media?.tick(), 250)
  }
  // 固定failure先通報，隨即停止所有接收與native資源。
  private fail(code: string): void {
    if (this.#closed) return
    this.post({ type: 'failure', revision: this.#revision, code: failureCode(code) })
    this.dispose()
  }
  // 清私有key／native/frame／timer/listeners，Main再有限fallback terminate。
  dispose(): void {
    if (this.#closed) return
    this.#closed = true
    this.#probe?.close()
    this.#probe = null
    this.#caps = null
    this.#protocol?.dispose()
    this.#protocol = null
    this.#media?.dispose()
    this.#media = null
    this.#framer?.clear()
    this.#framer = null
    if (this.#timer) clearTimeout(this.#timer)
    if (this.#ticker) clearInterval(this.#ticker)
    this.#timer = null
    this.#ticker = null
    this.#reject?.()
    this.#reject = null
    this.#resolve = null
    if (this.#socket) {
      this.#socket.onmessage = null
      this.#socket.onerror = null
      this.#socket.onclose = null
      try {
        this.#socket.close()
      } catch {
        /* 避免原生WS exception內容進入診斷。 */
      }
      this.#socket = null
    }
    this.post({ type: 'disposed', revision: this.#revision })
  }
}
