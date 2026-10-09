import { expect, it } from 'vitest'
import { encodeMessage, decodeMessage, encodeIdentity } from './codec'

// Google.Protobuf生成的pinned Message.Hash欄位9需與browser codec完全一致。
it('matches the pinned public Hash wire fixture', () => {
  const expected = new Uint8Array([0x4a, 6, 0x0a, 1, 115, 0x12, 1, 99])
  expect(encodeMessage({ hash: { salt: 's', challenge: 'c' } })).toEqual(expected)
  expect(decodeMessage(expected)).toMatchObject({ hash: { salt: 's', challenge: 'c' } })
})
// Pinned IdPk的ID及key欄位不允許手寫schema漂移。
it('matches the public IdPk field fixture', () => {
  expect(encodeIdentity({ id: '123456789', pk: new Uint8Array(32) })).toEqual(
    new Uint8Array([10, 9, 49, 50, 51, 52, 53, 54, 55, 56, 57, 18, 32, ...new Uint8Array(32)]),
  )
})
// 不允許同一envelope同時有兩個oneof，避免接受矛盾的握手訊息。
it('rejects contradictory oneof messages', () => {
  expect(() => encodeMessage({ hash: { salt: 's' }, signedId: { id: new Uint8Array() } })).toThrow(
    'protocol_error',
  )
})
