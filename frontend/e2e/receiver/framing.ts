import { receiverUnavailable } from './contract.ts'

// 依pinned BytesCodec產生最短little-endian header，最大只接受receiver自己的限額。
export function frameReceiverBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 65552) return receiverUnavailable()
  const size = bytes.length <= 63 ? 1 : bytes.length <= 16383 ? 2 : 3
  let encoded = bytes.length * 4 + size - 1
  const result = new Uint8Array(size + bytes.length)
  for (let i = 0; i < size; i++) {
    result[i] = encoded % 256
    encoded = Math.floor(encoded / 256)
  }
  result.set(bytes, size)
  return result
}

// 有界增量framer在header完整時先驗payload長度，不從來訊配置大buffer。
export function createReceiverFramer(maxFrame: number) {
  if (!Number.isInteger(maxFrame) || maxFrame < 1 || maxFrame > 65552) return receiverUnavailable()
  let pending = new Uint8Array(),
    closed = false
  return {
    // 每次呼叫回owned frames，原始暫存使用完立即清除。
    push(chunk: Uint8Array): Uint8Array[] {
      try {
        if (closed || pending.length + chunk.length > 262144) return receiverUnavailable()
        const all = new Uint8Array(pending.length + chunk.length)
        all.set(pending)
        all.set(chunk, pending.length)
        pending.fill(0)
        pending = all
        const frames: Uint8Array[] = []
        let offset = 0
        while (offset < pending.length) {
          const count = (pending[offset]! & 3) + 1
          if (pending.length - offset < count) break
          let value = 0
          for (let i = 0; i < count; i++) value += pending[offset + i]! * 256 ** i
          const length = Math.floor(value / 4)
          if (length > maxFrame) return receiverUnavailable()
          if (pending.length - offset - count < length) break
          frames.push(pending.slice(offset + count, offset + count + length))
          offset += count + length
        }
        const rest = pending.slice(offset)
        pending.fill(0)
        pending = rest
        return frames
      } catch {
        pending.fill(0)
        pending = new Uint8Array()
        closed = true
        return receiverUnavailable()
      }
    },
    // 終態永久毒化，不重用半包或晚到資料。
    dispose(): void {
      pending.fill(0)
      pending = new Uint8Array()
      closed = true
    },
  }
}
