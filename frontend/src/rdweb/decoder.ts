import type { EncodedInput, FrameResource } from './video-types'
import { ptsMicros, VIDEO_LIMITS } from './video-limits'
export interface DecoderPort {
  readonly decodeQueueSize: number
  // 配置已核對的native參數。
  configure(config: VideoDecoderConfig): void
  // 同步交付已驗額度的owned輸入。
  decode(input: EncodedInput): void
  // 移除listener並釋放native資源。
  close(): void
}
export interface DecoderCallbacks {
  // 接收native output ownership。
  output(frame: FrameResource): void
  // Native排程下降只供有界pump。
  dequeue(): void
  // 錯誤只送固定分類。
  error(): void
}
export type DecoderFactory = (callbacks: DecoderCallbacks) => DecoderPort
export class DecodeQueue {
  #inputs: EncodedInput[] = []
  #bytes = 0
  // Port只有native動作，不持有HTTP或JWT。
  constructor(private port: DecoderPort) {}
  // 有限pending數量供排程與ACK低水位檢查。
  get count(): number {
    return this.#inputs.length
  }
  // Ownedbytes總額，不把原始plaintext另保存一次。
  get bytes(): number {
    return this.#bytes
  }
  // 配置完成替換唯一port，保留原有限owned輸入容器。
  setPort(port: DecoderPort): void {
    this.port = port
  }
  // Batch先驗count/bytes/pts，再複製，避免途中部分配置導致超额。
  enqueue(values: EncodedInput[]): void {
    const incoming = values.reduce((sum, input) => sum + input.data.length, 0)
    if (
      !values.length ||
      values.some((input) => !input.data.length) ||
      this.count + values.length > VIDEO_LIMITS.chunks ||
      this.#bytes + incoming > VIDEO_LIMITS.pendingBytes
    )
      throw new Error('video_backpressure')
    for (const value of values) ptsMicros(value.pts)
    for (const value of values) this.#inputs.push({ ...value, data: new Uint8Array(value.data) })
    this.#bytes += incoming
  }
  // Native cap以外只留有限pending，不在每packet後flush。
  pump(): void {
    while (this.#inputs.length && this.port.decodeQueueSize < VIDEO_LIMITS.decodeQueue) {
      const input = this.#inputs.shift()!
      this.#bytes -= input.data.length
      try {
        this.port.decode(input)
      } catch {
        this.clear()
        throw new Error('video_decode_failed')
      } finally {
        input.data.fill(0)
      }
    }
  }
  // 終止或generation更新時清所有未交付的ownedbytes。
  clear(): void {
    for (const input of this.#inputs) input.data.fill(0)
    this.#inputs = []
    this.#bytes = 0
  }
}
// Native adapter只收受限data，exception內容永不回報。
export function createNativeDecoder(callbacks: DecoderCallbacks): DecoderPort {
  const decoder = new VideoDecoder({
    // Ownership轉給gate；late generation由caller close。
    output: (frame) => callbacks.output(frame),
    // 固定錯誤交由caller清理，不回原生exception。
    error: () => callbacks.error(),
  })
  // Queue進展不是已繪製影像成功。
  const dequeue = (): void => callbacks.dequeue()
  decoder.addEventListener('dequeue', dequeue)
  return {
    // 只讀原生queue長度供硬cap控制。
    get decodeQueueSize() {
      return decoder.decodeQueueSize
    },
    // Config已經header／profile／native probe驗證。
    configure: (config) => decoder.configure(config),
    // Chunk建構器同步複製後caller可清ownedbytes。
    decode: (input) =>
      decoder.decode(
        new EncodedVideoChunk({
          type: input.key ? 'key' : 'delta',
          timestamp: ptsMicros(input.pts),
          data: input.data,
        }),
      ),
    // Close冪等，先移除listener再關decoder。
    close: () => {
      decoder.removeEventListener('dequeue', dequeue)
      if (decoder.state !== 'closed') decoder.close()
    },
  }
}
