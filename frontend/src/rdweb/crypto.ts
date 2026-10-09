import nacl from 'tweetnacl'
import { decodeIdentity, encodeMessage } from './codec'
// Nonce前8 bytes為精確u64 little-endian，其餘為0。
export function nonce(counter: bigint): Uint8Array {
  if (counter < 1n || counter >= 1n << 64n) throw new Error('crypto_failed')
  const bytes = new Uint8Array(24)
  new DataView(bytes.buffer).setBigUint64(0, counter, true)
  return bytes
}
export class PeerCrypto {
  #key: Uint8Array | null = null
  #tx = 0n
  #rx = 0n
  #closed = false
  // 驗SignedId身份後封入新的對稱key，ephemeral private key立即清除。
  handshake(signed: Uint8Array, id: string, key: Uint8Array): Uint8Array {
    try {
      if (this.#closed || this.#key || key.length !== 32) throw new Error()
      const payload = nacl.sign.open(signed, key)
      if (!payload) throw new Error()
      const identity = decodeIdentity(payload)
      if (identity.id !== id) throw new Error()
      const pair = nacl.box.keyPair()
      this.#key = nacl.randomBytes(32)
      try {
        return encodeMessage({
          publicKey: {
            asymmetricValue: pair.publicKey,
            symmetricValue: nacl.box(this.#key, new Uint8Array(24), identity.pk, pair.secretKey),
          },
        })
      } finally {
        pair.secretKey.fill(0)
      }
    } catch {
      this.dispose()
      throw new Error('crypto_failed')
    }
  }
  // 每則加密送出使用新TX counter，任何故障即清key停止。
  encrypt(bytes: Uint8Array): Uint8Array {
    try {
      if (!this.#key) throw new Error()
      return nacl.secretbox(bytes, nonce(++this.#tx), this.#key)
    } catch {
      this.dispose()
      throw new Error('crypto_failed')
    }
  }
  // 原生heartbeat不消耗RX counter；protocol資料必須MAC驗證成功。
  decrypt(bytes: Uint8Array): Uint8Array {
    try {
      if (!this.#key) throw new Error()
      if (bytes.length <= 1) return bytes
      const value = nacl.secretbox.open(bytes, nonce(++this.#rx), this.#key)
      if (!value) throw new Error()
      return value
    } catch {
      this.dispose()
      throw new Error('crypto_failed')
    }
  }
  // 銷毀Worker RAM key/counters，不重用已關閉的session。
  dispose(): void {
    this.#key?.fill(0)
    this.#key = null
    this.#tx = 0n
    this.#rx = 0n
    this.#closed = true
  }
}
