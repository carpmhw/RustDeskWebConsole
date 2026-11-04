export type Transport = 'tcp' | 'ws'
const LIMIT = 64 * 1024 * 1024
// TCP才加固定BytesCodec header，WS保持一則message的payload。
export function frame(bytes: Uint8Array, transport: Transport): Uint8Array {
  if (bytes.length > LIMIT) throw new Error('protocol_error')
  if (transport === 'ws') return bytes
  const size = bytes.length <= 63 ? 1 : bytes.length <= 16383 ? 2 : bytes.length <= 4194303 ? 3 : 4
  const header = (bytes.length * 4 + size - 1) >>> 0
  const output = new Uint8Array(bytes.length + size)
  for (let i = 0; i < size; i++) output[i] = header >>> (i * 8)
  output.set(bytes, size)
  return output
}
export class WireFramer {
  #header = new Uint8Array(4)
  #head = 0
  #payload: Uint8Array | null = null
  #offset = 0
  // 建立固定transport的增量reader。
  constructor(
    private readonly transport: Transport,
    private readonly maxFrame = LIMIT,
  ) {}
  // TCP逐片複製至受限frame，WS直接交付；單一event至多16個message。
  push(bytes: Uint8Array): Uint8Array[] {
    if (bytes.length > LIMIT) throw new Error('protocol_error')
    if (this.transport === 'ws') {
      if (bytes.length > this.maxFrame) throw new Error('protocol_error')
      return [bytes]
    }
    const values: Uint8Array[] = []
    let buffered = this.#payload?.length ?? 0
    let index = 0
    while (index < bytes.length) {
      if (!this.#payload) {
        this.#header[this.#head++] = bytes[index++]!
        if (this.#head < (this.#header[0]! & 3) + 1) continue
        let length = 0
        for (let i = 0; i < this.#head; i++) length += this.#header[i]! * 2 ** (8 * i)
        length = Math.floor(length / 4)
        if (length > this.maxFrame || length + buffered > LIMIT) {
          this.clear()
          throw new Error('protocol_error')
        }
        this.#head = 0
        this.#offset = 0
        buffered += length
        this.#payload = new Uint8Array(length)
      }
      const count = Math.min(this.#payload.length - this.#offset, bytes.length - index)
      this.#payload.set(bytes.subarray(index, index + count), this.#offset)
      index += count
      this.#offset += count
      if (this.#offset === this.#payload.length) {
        values.push(this.#payload)
        this.#payload = null
        if (values.length > 16) {
          this.clear()
          throw new Error('protocol_error')
        }
      }
    }
    return values
  }
  // 結束時清除未交付的ciphertext buffer與header。
  clear(): void {
    this.#header.fill(0)
    this.#payload?.fill(0)
    this.#payload = null
    this.#head = 0
    this.#offset = 0
  }
}
