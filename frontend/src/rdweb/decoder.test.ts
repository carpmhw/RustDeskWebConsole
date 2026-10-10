import { expect, it, vi } from 'vitest'
import { DecodeQueue, type DecoderPort } from './decoder'
// Native满載時第17筆pending不能累積，且clear後budget歸零。
it('bounds pending chunks while the native decoder is full', () => {
  const port: DecoderPort = {
    decodeQueueSize: 8,
    configure: vi.fn(),
    decode: vi.fn(),
    close: vi.fn(),
  }
  const queue = new DecodeQueue(port)
  const input = { codec: 'vp9' as const, data: new Uint8Array([1]), key: true, pts: '0' }
  queue.enqueue(Array.from({ length: 16 }, () => input))
  queue.pump()
  expect(port.decode).not.toHaveBeenCalled()
  expect(queue.count).toBe(16)
  expect(() => queue.enqueue([input])).toThrow('video_backpressure')
  queue.clear()
  expect(queue.bytes).toBe(0)
})
// Plaintext finally清除不影響有限copy，交付或clear立即清owned資料。
it('owns bounded input copies and wipes them after submission', () => {
  let copy!: Uint8Array
  const values: number[] = []
  const port: DecoderPort = {
    decodeQueueSize: 0,
    configure: vi.fn(),
    close: vi.fn(),
    // 只讀公開byte以證明copy與釋放，不輸出真正payload。
    decode: (input) => {
      values.push(input.data[0]!)
      copy = input.data
    },
  }
  const queue = new DecodeQueue(port)
  const bytes = new Uint8Array([7])
  queue.enqueue([{ codec: 'vp9', data: bytes, key: true, pts: '0' }])
  bytes.fill(0)
  queue.pump()
  expect(values).toEqual([7])
  expect(copy[0]).toBe(0)
  expect(queue.count).toBe(0)
  expect(() =>
    queue.enqueue([{ codec: 'vp9', data: new Uint8Array(16777217), key: true, pts: '0' }]),
  ).toThrow('video_backpressure')
})
