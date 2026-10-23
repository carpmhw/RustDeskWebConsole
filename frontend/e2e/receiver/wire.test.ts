import { expect, it } from 'vitest'
import { receiverApi } from './test-fixtures'

// 四份獨立手算公開wire，同時交由Google.Protobuf fixture測試交叉核對。
it.each([
  [
    { registerPeer: { id: '123456789', serial: 1 } },
    [50, 13, 10, 9, 49, 50, 51, 52, 53, 54, 55, 56, 57, 16, 1],
  ],
  [
    { registerPk: { id: '123456789', uuid: Uint8Array.of(1), pk: Uint8Array.of(2) } },
    [122, 17, 10, 9, 49, 50, 51, 52, 53, 54, 55, 56, 57, 18, 1, 1, 26, 1, 2],
  ],
  [{ requestRelay: { uuid: 'u', licenceKey: 'k' } }, [146, 1, 6, 18, 1, 117, 50, 1, 107]],
  [
    { relayResponse: { uuid: 'u', id: '123456789', version: 'v' } },
    [154, 1, 17, 18, 1, 117, 34, 9, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 1, 118],
  ],
])('matches independent rendezvous bytes %#', async (value, bytes) => {
  const c = (await receiverApi('wire')) as typeof import('./wire')
  expect(Array.from(c.encodeReceiverControl(value))).toEqual(bytes)
  expect(c.decodeReceiverControl(Uint8Array.from(bytes as number[]))).toBeDefined()
})

// protobuf的最後值覆蓋與UTF8替字不符合接收器嚴格入場要求。
it.each(
  [
    [],
    [50, 0, 50, 0],
    [50, 2, 10, 0, 58, 0],
    [50, 5, 10, 1, 65, 10, 0],
    [50, 4, 10, 2, 195, 40],
    [8, 0],
    [50, 127],
    [210, 1, 0],
  ].map(/* 保留每組bytes為單一測試參數，不讓each展開成多個argument。 */ (bytes) => ({ bytes })),
)('rejects ambiguous, unknown or malformed control bytes %#', async ({ bytes }) => {
  const c = (await receiverApi('wire')) as typeof import('./wire')
  expect(() => c.decodeReceiverControl(Uint8Array.from(bytes))).toThrow(/^receiver_unavailable$/)
})
