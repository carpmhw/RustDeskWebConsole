import { createHmac } from 'node:crypto'
import { Buffer } from 'node:buffer'

// 測試oracle解碼RFC4648 Base32，不用在正式瀏覽器認證邏輯。
function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let buffer = 0
  const bytes: number[] = []
  for (const character of value.replace(/=+$/, '').toUpperCase()) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) throw new Error('Invalid test oracle input')
    buffer = (buffer << 5) | digit
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 255)
    }
  }
  return Buffer.from(bytes)
}
// RFC6238 SHA-1六位測試oracle，輸出僅留測試RAM而不記錄。
export function totpCode(secret: string, time = Date.now(), windowOffset = 0): string {
  const key = decodeBase32(secret)
  try {
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000) + windowOffset))
    const hash = createHmac('sha1', key).update(counter).digest()
    const offset = hash[hash.length - 1]! & 15
    return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
  } finally {
    key.fill(0)
  }
}
