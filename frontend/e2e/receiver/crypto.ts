import nacl from 'tweetnacl'
import { encodeIdentity, encodeMessage } from '../../src/rdweb/codec.ts'
import { decodeReceiverPeerMessage } from './wire.ts'
import { receiverUnavailable, validateReceiverBinding, type ReceiverBinding } from './contract.ts'

export interface ReceiverCrypto {
  readonly signingPublicKey: Uint8Array
  signedId(): Uint8Array
  acceptPublicKey(bytes: Uint8Array): void
  encrypt(plain: Uint8Array): Uint8Array
  decrypt(cipher: Uint8Array): Uint8Array
  dispose(): void
}

// 純u64轉換不暴露session counter；所有呼叫都拒絕0及溢位。
export function receiverNonce(counter: bigint): Uint8Array {
  if (counter < 1n || counter >= 1n << 64n) return receiverUnavailable()
  const nonce = new Uint8Array(24)
  new DataView(nonce.buffer).setBigUint64(0, counter, true)
  return nonce
}

// 每輪自有Ed25519與box key；同實例公鑰先註冊，再提供SignedId。
export function createReceiverCrypto(binding: ReceiverBinding): ReceiverCrypto {
  const b = validateReceiverBinding(binding),
    signing = nacl.sign.keyPair(),
    box = nacl.box.keyPair()
  let key: Uint8Array | null = null,
    tx = 0n,
    rx = 0n,
    closed = false,
    signed = false
  // 終態清可變key與counter，所有後續操作不可恢復。
  function dispose(): void {
    signing.secretKey.fill(0)
    box.secretKey.fill(0)
    key?.fill(0)
    key = null
    tx = 0n
    rx = 0n
    closed = true
  }
  return {
    // 回copy避免呼叫者修改真正註冊身份。
    get signingPublicKey() {
      return new Uint8Array(signing.publicKey)
    },
    // 身份只可送一次，不重新開始握手或換key。
    signedId(): Uint8Array {
      try {
        if (closed || signed || key) return receiverUnavailable()
        signed = true
        const identity = encodeIdentity({ id: b.peerId, pk: box.publicKey })
        try {
          const payload = nacl.sign(identity, signing.secretKey)
          try {
            return encodeMessage({ signedId: { id: payload } })
          } finally {
            payload.fill(0)
          }
        } finally {
          identity.fill(0)
        }
      } catch {
        dispose()
        return receiverUnavailable()
      }
    },
    // 接受正常PublicKey，空key／錯誤box與明文fallback一律終止。
    acceptPublicKey(bytes: Uint8Array): void {
      try {
        if (closed || !signed || key || bytes.length > 65536) return receiverUnavailable()
        const message = decodeReceiverPeerMessage(bytes),
          pk = message.publicKey
        if (
          message.union !== 'publicKey' ||
          !pk ||
          pk.asymmetricValue?.length !== 32 ||
          pk.symmetricValue?.length !== 48
        )
          return receiverUnavailable()
        key = nacl.box.open(
          pk.symmetricValue,
          new Uint8Array(24),
          pk.asymmetricValue,
          box.secretKey,
        )
        if (key?.length !== 32) return receiverUnavailable()
        box.secretKey.fill(0)
        signing.secretKey.fill(0)
      } catch {
        dispose()
        receiverUnavailable()
      }
    },
    // 所有控制／影像與輸入共用單一TX序列，任何錯誤即停止。
    encrypt(plain: Uint8Array): Uint8Array {
      try {
        if (closed || !key || plain.length > 65536) return receiverUnavailable()
        return nacl.secretbox(plain, receiverNonce(++tx), key)
      } catch {
        dispose()
        return receiverUnavailable()
      }
    },
    // heartbeat不遞增RX；非heartbeat只嘗試精確下一個nonce。
    decrypt(cipher: Uint8Array): Uint8Array {
      try {
        if (closed || !key || cipher.length > 65552) return receiverUnavailable()
        if (cipher.length <= 1) return new Uint8Array(cipher)
        const plain = nacl.secretbox.open(cipher, receiverNonce(++rx), key)
        if (!plain) return receiverUnavailable()
        return plain
      } catch {
        dispose()
        return receiverUnavailable()
      }
    },
    dispose,
  }
}
