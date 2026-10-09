import nacl from 'tweetnacl'
import { expect, it, vi } from 'vitest'
import { PeerCrypto, nonce } from './crypto'
import { encodeIdentity, decodeMessage } from './codec'

// 使用NaCl peer box獨立打開封裝key，再验证兩方向secretbox nonce從1開始。
it('verifies peer identity and wraps a key for the real NaCl peer', () => {
  const signing = nacl.sign.keyPair()
  const peer = nacl.box.keyPair()
  const signed = nacl.sign(
    encodeIdentity({ id: '123456789', pk: peer.publicKey }),
    signing.secretKey,
  )
  const crypto = new PeerCrypto()
  const publicKey = decodeMessage(
    crypto.handshake(signed, '123456789', signing.publicKey),
  ).publicKey!
  const key = nacl.box.open(
    publicKey.symmetricValue!,
    new Uint8Array(24),
    publicKey.asymmetricValue!,
    peer.secretKey,
  )!
  expect(key.length).toBe(32)
  const plaintext = new Uint8Array([1, 2, 3])
  expect(nacl.secretbox.open(crypto.encrypt(plaintext), nonce(1n), key)).toEqual(plaintext)
  expect(crypto.decrypt(nacl.secretbox(plaintext, nonce(1n), key))).toEqual(plaintext)
  expect(nacl.secretbox.open(crypto.encrypt(plaintext), nonce(2n), key)).toEqual(plaintext)
  expect(() => crypto.decrypt(nacl.secretbox(plaintext, nonce(3n), key))).toThrow('crypto_failed')
  expect(() => crypto.encrypt(plaintext)).toThrow('crypto_failed')
})
// ID不符或signature損壞時不得輸出PublicKey。
it('fails closed on wrong target or tampered signature', () => {
  const signing = nacl.sign.keyPair()
  const peer = nacl.box.keyPair()
  const signed = nacl.sign(
    encodeIdentity({ id: '123456789', pk: peer.publicKey }),
    signing.secretKey,
  )
  expect(() => new PeerCrypto().handshake(signed, 'other', signing.publicKey)).toThrow(
    'crypto_failed',
  )
  signed[0] ^= 1
  expect(() => new PeerCrypto().handshake(signed, '123456789', signing.publicKey)).toThrow(
    'crypto_failed',
  )
})
// JS安全整數範圍以外nonce仍精確，u64溢位絕不可重用nonce。
it('uses exact little-endian uint64 nonce counters', () => {
  expect([...nonce(9007199254740993n).slice(0, 8)]).toEqual([1, 0, 0, 0, 0, 0, 32, 0])
  expect(() => nonce(1n << 64n)).toThrow('crypto_failed')
})

// 以系統libsodium獨立產生的公開向量驗證counter=1，不以本模組往返當唯一oracle。
it('matches an independent libsodium secretbox vector and wipes its key', () => {
  const signing = nacl.sign.keyPair()
  const peer = nacl.box.keyPair()
  const publicKey = Uint8Array.from({ length: 32 }, (_, index) => index)
  const random = vi.spyOn(nacl, 'randomBytes').mockReturnValue(publicKey)
  const crypto = new PeerCrypto()
  try {
    crypto.handshake(
      nacl.sign(encodeIdentity({ id: '123456789', pk: peer.publicKey }), signing.secretKey),
      '123456789',
      signing.publicKey,
    )
    const plain = new Uint8Array([0x4a, 6, 0x0a, 1, 115, 0x12, 1, 99])
    const expected = new Uint8Array([
      0xca, 0x47, 0x91, 0x1c, 0xc8, 0x34, 0xe9, 0x70, 0xe1, 0xb1, 0xd4, 0x9c, 0x83, 0x12, 0x2f,
      0xf5, 0x88, 0x3d, 0x80, 0x21, 0x81, 0x0d, 0xf9, 0xad,
    ])
    expect(crypto.encrypt(plain)).toEqual(expected)
    expect(crypto.decrypt(new Uint8Array())).toHaveLength(0)
    expect(crypto.decrypt(new Uint8Array([0]))).toEqual(new Uint8Array([0]))
    expect(crypto.decrypt(expected)).toEqual(plain)
    crypto.dispose()
    expect(publicKey.every((byte) => byte === 0)).toBe(true)
    expect(() => crypto.encrypt(plain)).toThrow('crypto_failed')
  } finally {
    crypto.dispose()
    random.mockRestore()
  }
})
