import { expect, it } from 'vitest'
import { WireFramer, frame } from './framing'
// TCP payload可以被外層WS切在任何header byte，兩包黏連也不能掉資料。
it('incrementally frames fragmented and coalesced TCP packets', () => {
  const input = new WireFramer('tcp')
  const payload = new Uint8Array(70).fill(7)
  const packet = frame(payload, 'tcp')
  expect(input.push(packet.slice(0, 1))).toEqual([])
  expect(input.push(packet.slice(1, 30))).toEqual([])
  expect(input.push(new Uint8Array([...packet.slice(30), 4, 9]))).toEqual([
    payload,
    new Uint8Array([9]),
  ])
})
// WS模式不添加BytesCodec prefix，超大TCP長度在配置前拒絕。
it('preserves WS messages and rejects oversized TCP frames', () => {
  const data = new Uint8Array([1, 2])
  expect(frame(data, 'ws')).toEqual(data)
  expect(new WireFramer('ws').push(data)).toEqual([data])
  expect(() => new WireFramer('tcp').push(new Uint8Array([7, 0, 0, 16]))).toThrow('protocol_error')
})

// 已完成包尚待交付時，新frame宣告長度也要計入同一event的64MiB總額。
it('caps completed packets and the next partial frame together', () => {
  const input = new WireFramer('tcp')
  const bytes = new Uint8Array([...frame(new Uint8Array(32), 'tcp'), 3, 0, 0, 16])
  expect(() => input.push(bytes)).toThrow('protocol_error')
})

// B2較小的單包額度在配置前拒絕，但TCP event仍可合法黏連。
it('applies an independent per-payload limit to TCP and WS', () => {
  expect(() => new WireFramer('tcp', 3).push(frame(new Uint8Array(4), 'tcp'))).toThrow(
    'protocol_error',
  )
  expect(() => new WireFramer('ws', 3).push(new Uint8Array(4))).toThrow('protocol_error')
  const packet = frame(new Uint8Array(3), 'tcp')
  expect(new WireFramer('tcp', 3).push(new Uint8Array([...packet, ...packet]))).toHaveLength(2)
})
