import { expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { binding, receiverApi } from './test-fixtures'
import { PeerCrypto } from '../../src/rdweb/crypto'
import { decodeMessage, encodeMessage } from '../../src/rdweb/codec'

// 正式sender只作獨立互通端；所有key只留本測試RAM，assert只看布林。
it('exchanges signed identity and a fresh session key with the production sender', async () => {
  const c = (await receiverApi('crypto')) as typeof import('./crypto')
  const peer = c.createReceiverCrypto(binding()),
    sender = new PeerCrypto()
  try {
    const signed = decodeMessage(peer.signedId()).signedId!.id!
    const publicKey = sender.handshake(signed, binding().peerId, peer.signingPublicKey)
    peer.acceptPublicKey(publicKey)
    const plain = Uint8Array.of(1, 2, 3)
    const received = peer.decrypt(sender.encrypt(plain))
    expect(received.every((v, i) => v === plain[i])).toBe(true)
    received.fill(0)
    expect(peer.decrypt(Uint8Array.of(0)).length).toBe(1)
    expect(peer.decrypt(sender.encrypt(plain)).every((v, i) => v === plain[i])).toBe(true)
    expect(sender.decrypt(peer.encrypt(plain)).every((v, i) => v === plain[i])).toBe(true)
    expect(sender.decrypt(peer.encrypt(plain)).every((v, i) => v === plain[i])).toBe(true)
  } finally {
    peer.dispose()
    sender.dispose()
  }
  expect(() => peer.signedId()).toThrow(/^receiver_unavailable$/)
  expect(() => peer.encrypt(Uint8Array.of(1))).toThrow(/^receiver_unavailable$/)
})

// 訊息重複／跳號／竄改必須毒化整個session，不猜另一個nonce。
it.each(['tamper', 'replay', 'skip'])('rejects %s and closes crypto state', async (kind) => {
  const c = (await receiverApi('crypto')) as typeof import('./crypto')
  const peer = c.createReceiverCrypto(binding()),
    sender = new PeerCrypto()
  try {
    peer.acceptPublicKey(
      sender.handshake(
        decodeMessage(peer.signedId()).signedId!.id!,
        binding().peerId,
        peer.signingPublicKey,
      ),
    )
    const first = sender.encrypt(Uint8Array.of(9))
    if (kind === 'replay') peer.decrypt(first)
    if (kind === 'skip') first.set(sender.encrypt(Uint8Array.of(9)))
    if (kind === 'tamper') first[0]! ^= 1
    expect(() => peer.decrypt(first)).toThrow(/^receiver_unavailable$/)
    expect(() => peer.decrypt(sender.encrypt(Uint8Array.of(9)))).toThrow(/^receiver_unavailable$/)
  } finally {
    peer.dispose()
    sender.dispose()
  }
})

// 非本peer公鑰封裝、空key及畸形握手不能退回明文。
it.each(['empty', 'wrong-box', 'bad-size', 'duplicate'])(
  'rejects invalid handshake %s',
  async (kind) => {
    const c = (await receiverApi('crypto')) as typeof import('./crypto')
    const peer = c.createReceiverCrypto(binding())
    peer.signedId()
    const key = nacl.box.keyPair(),
      other = nacl.box.keyPair(),
      session = nacl.randomBytes(32)
    try {
      let bytes = encodeMessage({
        publicKey: {
          asymmetricValue: kind === 'bad-size' ? new Uint8Array(31) : key.publicKey,
          symmetricValue:
            kind === 'empty'
              ? new Uint8Array()
              : nacl.box(session, new Uint8Array(24), other.publicKey, key.secretKey),
        },
      })
      if (kind === 'duplicate') bytes = new Uint8Array([...bytes, ...bytes])
      expect(() => peer.acceptPublicKey(bytes)).toThrow(/^receiver_unavailable$/)
      expect(() => peer.signedId()).toThrow(/^receiver_unavailable$/)
    } finally {
      key.secretKey.fill(0)
      other.secretKey.fill(0)
      session.fill(0)
      peer.dispose()
    }
  },
)

// 相同新ID仍必須產生新簽章key，錯ID／公鑰不能通過正式sender驗證。
it('keeps signing keys fresh and rejects wrong identity or signer', async () => {
  const c = (await receiverApi('crypto')) as typeof import('./crypto')
  const a = c.createReceiverCrypto(binding()),
    b = c.createReceiverCrypto(binding())
  try {
    expect(a.signingPublicKey.some((v, i) => v !== b.signingPublicKey[i])).toBe(true)
    const signed = decodeMessage(a.signedId()).signedId!.id!
    for (const [id, key] of [
      ['123456789', a.signingPublicKey],
      [binding().peerId, b.signingPublicKey],
    ] as const) {
      const sender = new PeerCrypto()
      expect(() => sender.handshake(signed, id, key)).toThrow(/^crypto_failed$/)
      sender.dispose()
    }
  } finally {
    a.dispose()
    b.dispose()
  }
})

// u64邊界純函數不需發布test-only counter setter或保存session key。
it('uses exact u64 little endian nonce boundaries', async () => {
  const c = (await receiverApi('crypto')) as typeof import('./crypto')
  expect(Array.from(c.receiverNonce(1n))).toEqual([1, ...new Array(23).fill(0)])
  expect(Array.from(c.receiverNonce((1n << 64n) - 1n))).toEqual([
    ...new Array(8).fill(255),
    ...new Array(16).fill(0),
  ])
  expect(() => c.receiverNonce(0n)).toThrow(/^receiver_unavailable$/)
  expect(() => c.receiverNonce(1n << 64n)).toThrow(/^receiver_unavailable$/)
})
