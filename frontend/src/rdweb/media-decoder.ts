import type {
  CodecCapabilities,
  FrameResource,
  FrameTag,
  DisplayGeometry,
  Presented,
  VideoPacket,
  VideoStats,
} from './video-types'
import type { DecoderFactory } from './decoder'
import { DecodeQueue, type DecoderPort } from './decoder'
import { PresentationGate } from './presentation'
import {
  readVp8Key,
  readVp9Key,
  readAv1Sequence,
  readH264Key,
  buildVideoConfig,
} from './codec-headers'
import { checkDisplay, ptsMicros, VIDEO_LIMITS } from './video-limits'
export interface MediaHooks {
  revision: number
  // 正式影格只transfer給Main，不另存reference。
  frame(frame: FrameResource, tag: FrameTag): void
  // Main清舊generation並更新安全幾何。
  format(generation: number, display: DisplayGeometry): void
  // 只有presented才能進streaming。
  phase(value: 'awaiting_video' | 'streaming'): void
  // 有界等待keyframe只送一次刷新。
  refresh(display: number): void
  // 加密boolean ACK，不帶影格序號。
  ack(): void
  // 終止只送固定分類。
  failure(code: string): void
  // Worker只回安全codec及幾何，不計draw FPS。
  stats(value: VideoStats): void
}
export class MediaDecoder {
  #closed = false
  #epoch = 0
  #generation = 0
  #display: DisplayGeometry | null = null
  #codec: VideoPacket['codec'] | null = null
  #config: VideoDecoderConfig | null = null
  #port: DecoderPort | null = null
  #queue: DecodeQueue
  #gate: PresentationGate
  #waitingKey = true
  #requestedRefresh = false
  #firstDeadline: number | null = null
  #lastProgress = 0
  #statsAt = -Infinity
  #pendingAck = false
  #querying = false
  #desired: { config: VideoDecoderConfig; epoch: number; generation: number } | null = null
  // 每operation唯一pipeline與gate，query／native adapter／clock可獨立測試。
  constructor(
    private readonly caps: CodecCapabilities,
    private readonly hooks: MediaHooks,
    private readonly query: (config: VideoDecoderConfig) => Promise<VideoDecoderSupport>,
    private readonly factory: DecoderFactory,
    private readonly now: () => number,
  ) {
    this.#queue = new DecodeQueue(this.holdingPort())
    this.#gate = new PresentationGate(hooks.revision, now, hooks.frame, (code) => this.fail(code))
  }
  // 配置等待只使用同一個有限queue，holding port不能宣稱已decode。
  private holdingPort(): DecoderPort {
    return {
      decodeQueueSize: 8,
      // 等待配置期間禁止native動作。
      configure: () => {
        throw new Error('protocol_error')
      },
      // queue滿載不會呼叫此方法。
      decode: () => {
        throw new Error('protocol_error')
      },
      // 沒有native資源可釋放。
      close: () => {},
    }
  }
  // 真幾何更新清舊資料，但不能重設在途credit。
  updateDisplay(value: DisplayGeometry): void {
    this.tick()
    if (this.#closed) return
    try {
      checkDisplay(value)
      if (
        this.#display &&
        this.#display.display === value.display &&
        this.#display.width === value.width &&
        this.#display.height === value.height
      )
        return
      this.#display = { ...value }
      this.reset()
    } catch {
      this.fail('protocol_error')
    }
  }
  // 重新配置作廢舊native callback／ownedbytes及期限，保持單query。
  private reset(): void {
    this.#epoch++
    this.#generation++
    this.#port?.close()
    this.#port = null
    this.#queue.clear()
    this.#queue.setPort(this.holdingPort())
    this.#config = null
    this.#desired = null
    this.#waitingKey = true
    this.#requestedRefresh = false
    this.#pendingAck = false
    this.#gate.reset(this.#generation)
    this.#firstDeadline = this.now() + VIDEO_LIMITS.firstMs
    this.#lastProgress = this.now()
    this.hooks.format(this.#generation, this.#display!)
    this.hooks.phase('awaiting_video')
  }
  // MAC及wire已驗，這裡再驗display／能力並於plaintext清前有界copy。
  receive(value: VideoPacket): void {
    this.tick()
    if (this.#closed) return
    try {
      if (
        !this.#display ||
        value.display !== this.#display.display ||
        !value.frames.length ||
        value.frames.length > VIDEO_LIMITS.chunks
      )
        throw new Error('protocol_error')
      if (!this.caps.profiles[value.codec]?.length) throw new Error('codec_unsupported')
      if (
        value.frames.some((input) => input.codec !== value.codec || !input.data.length) ||
        value.frames.reduce((sum, input) => sum + input.data.length, 0) > VIDEO_LIMITS.envelope
      )
        throw new Error('protocol_error')
      for (const input of value.frames) ptsMicros(input.pts)
      if (this.#codec !== value.codec) {
        this.#codec = value.codec
        this.reset()
      }
      let inputs = value.frames
      const keyIndex = inputs.findIndex((input) => input.key)
      if (this.#waitingKey && keyIndex < 0) {
        if (!this.#requestedRefresh) {
          this.#requestedRefresh = true
          this.hooks.refresh(value.display)
        }
        this.#pendingAck = true
        this.tryAck()
        return
      }
      if (this.#waitingKey || inputs[0]!.key) {
        if (this.#waitingKey) inputs = inputs.slice(keyIndex)
        const first = inputs[0]!
        const readers = {
          vp8: readVp8Key,
          vp9: readVp9Key,
          av1: readAv1Sequence,
          h264: readH264Key,
        }
        const config = buildVideoConfig(
          value.codec,
          readers[value.codec](first.data),
          this.#display,
        )
        if (
          value.codec === 'h264' &&
          !this.caps.profiles.h264!.some(
            (profile) => profile.slice(5, 7) === config.codec.slice(5, 7),
          )
        )
          throw new Error('codec_unsupported')
        if (
          !this.#config ||
          config.codec !== this.#config.codec ||
          config.codedWidth !== this.#config.codedWidth ||
          config.codedHeight !== this.#config.codedHeight
        ) {
          if (!this.#waitingKey) this.reset()
          this.#config = config
          this.#waitingKey = false
          this.#desired = { config, epoch: this.#epoch, generation: this.#generation }
        }
      }
      this.#queue.enqueue(inputs)
      this.#pendingAck = true
      this.configure()
      this.#queue.pump()
      this.tryAck()
      this.reportStats()
    } catch (error) {
      this.fail(
        error instanceof Error &&
          ['codec_unsupported', 'video_backpressure', 'video_decode_failed'].includes(error.message)
          ? error.message
          : 'protocol_error',
      )
    }
  }
  // 同時只有一個實際config查詢；舊completion不能清新generation queue。
  private configure(): void {
    if (this.#closed || this.#querying || !this.#desired) return
    const desired = this.#desired
    this.#desired = null
    this.#querying = true
    void this.query(desired.config)
      .then((support) => {
        this.tick()
        if (this.#closed || desired.epoch !== this.#epoch) return
        if (!support.supported || !support.config) {
          this.fail('codec_unsupported')
          return
        }
        this.#port = this.factory({
          // Late output必須先close，不能以stale generation更新影像。
          output: (frame) => {
            this.tick()
            if (this.#closed || desired.epoch !== this.#epoch) {
              frame.close()
              return
            }
            try {
              checkDisplay({
                display: this.#display!.display,
                width: frame.codedWidth,
                height: frame.codedHeight,
              })
              checkDisplay({
                display: this.#display!.display,
                width: frame.displayWidth,
                height: frame.displayHeight,
              })
              if (
                frame.displayWidth !== this.#display!.width ||
                frame.displayHeight !== this.#display!.height
              )
                throw new Error()
              this.#lastProgress = this.now()
              this.#gate.offer(frame, desired.generation)
            } catch {
              frame.close()
              this.fail('video_decode_failed')
            }
          },
          // 只跟隨當前native排程，不把dequeue當成功。
          dequeue: () => {
            this.tick()
            if (this.#closed || desired.epoch !== this.#epoch) return
            try {
              this.#lastProgress = this.now()
              this.#queue.pump()
              this.tryAck()
            } catch {
              this.fail('video_decode_failed')
            }
          },
          // Native error不能降級或繼續不完整delta链。
          error: () => {
            if (!this.#closed && desired.epoch === this.#epoch) this.fail('video_decode_failed')
          },
        })
        this.#port.configure(support.config)
        this.#queue.setPort(this.#port)
        this.#lastProgress = this.now()
        this.#queue.pump()
        this.tryAck()
      })
      .catch(() => {
        if (!this.#closed && desired.epoch === this.#epoch) this.fail('video_decode_failed')
      })
      .finally(() => {
        this.#querying = false
        this.configure()
      })
  }
  // ACK只有旗標，不累積帶序號的清單，兩種credit分開管理。
  private tryAck(): void {
    if (
      this.#pendingAck &&
      this.#gate.hasCredit &&
      (this.#port || this.#waitingKey) &&
      (this.#port?.decodeQueueSize ?? 0) <= 4 &&
      this.#queue.count <= 8 &&
      this.#queue.bytes <= 8388608
    ) {
      this.#pendingAck = false
      this.hooks.ack()
    }
  }
  // 精確還Main credit後先ACK再drain，舊generation回覆不標記成功。
  presented(value: Presented): void {
    this.tick()
    if (this.#closed || !this.#gate.presented(value)) return
    if (value.drawn && value.generation === this.#generation) {
      this.#firstDeadline = null
      this.#lastProgress = this.now()
      this.hooks.phase('streaming')
    }
    try {
      this.tryAck()
      this.#gate.drain()
    } catch {
      this.fail('connection_failed')
    }
  }
  // 安全統計至多每秒一次，FPS由Main實際draw計算。
  private reportStats(): void {
    if (!this.#codec || !this.#display || this.now() - this.#statsAt < 1000) return
    this.#statsAt = this.now()
    this.hooks.stats({
      codec: this.#codec,
      width: this.#display.width,
      height: this.#display.height,
    })
  }
  // 首畫面15秒、實際pending無進展30秒；static沒有pending不失敗。
  tick(): void {
    if (this.#closed) return
    if (this.#firstDeadline !== null && this.now() >= this.#firstDeadline) {
      this.fail('video_timeout')
      return
    }
    if (
      (this.#queue.count || (this.#port?.decodeQueueSize ?? 0)) &&
      this.now() - this.#lastProgress >= VIDEO_LIMITS.stallMs
    ) {
      this.fail('video_timeout')
      return
    }
    this.#gate.tick()
  }
  // 清所有資源後才通知固定分類，避免reentrancy重複failure。
  private fail(code: string): void {
    if (!this.#closed) {
      this.dispose()
      this.hooks.failure(code)
    }
  }
  // 作廢查詢與native callback；Main自行清已移交frame。
  dispose(): void {
    if (this.#closed) return
    this.#closed = true
    this.#epoch++
    this.#desired = null
    this.#port?.close()
    this.#port = null
    this.#queue.clear()
    this.#gate.dispose()
    this.#config = null
    this.#pendingAck = false
    this.#firstDeadline = null
  }
}
