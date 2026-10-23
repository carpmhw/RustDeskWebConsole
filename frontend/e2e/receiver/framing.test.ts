import { expect, it } from 'vitest'
import { receiverApi } from './test-fixtures'

// 手寫長度header，不以被測encoder計算解碼期望。
it.each([
  [63, [252]],
  [64, [1, 1]],
  [16383, [253, 255]],
  [16384, [2, 0, 1]],
  [65536, [2, 0, 4]],
  [65552, [66, 0, 4]],
])('decodes fragmented frame length %i', async (length, header) => {
  const c = (await receiverApi('framing')) as typeof import('./framing')
  const f = c.createReceiverFramer(65552)
  const h = Uint8Array.from(header as number[]),
    size = length as number
  for (const byte of h) expect(f.push(Uint8Array.of(byte))).toHaveLength(0)
  const result = f.push(new Uint8Array(size))
  expect(result).toHaveLength(1)
  expect(result[0]?.length).toBe(size)
  f.dispose()
  expect(() => f.push(new Uint8Array())).toThrow(/^receiver_unavailable$/)
})

// 超額在payload配置前拒絕，後續不得恢復讀取。
it('rejects oversized headers and buffers and preserves glued frames', async () => {
  const c = (await receiverApi('framing')) as typeof import('./framing')
  const f = c.createReceiverFramer(65552)
  expect(f.push(Uint8Array.of(4, 9, 8, 10, 11))).toEqual([Uint8Array.of(9), Uint8Array.of(10, 11)])
  expect(() => f.push(Uint8Array.of(70, 0, 4))).toThrow(/^receiver_unavailable$/)
  expect(() => f.push(Uint8Array.of(0))).toThrow(/^receiver_unavailable$/)
  const g = c.createReceiverFramer(65552)
  expect(() => g.push(new Uint8Array(262145))).toThrow(/^receiver_unavailable$/)
})

// 編碼必須維持固定little-endian header，不拿TCP header當UDP資料。
it('encodes canonical control and relay frame headers', async () => {
  const c = (await receiverApi('framing')) as typeof import('./framing')
  expect(Array.from(c.frameReceiverBytes(Uint8Array.of(7, 8)))).toEqual([8, 7, 8])
  expect(() => c.frameReceiverBytes(new Uint8Array(65553))).toThrow(/^receiver_unavailable$/)
})
