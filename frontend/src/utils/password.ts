// 自動產生初始密碼使用的字元集：英數加少量不易混淆的符號。
export const PASSWORD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!@#%'

// 以 crypto.getRandomValues 產生密碼，拒絕取樣避免取模偏差；長度不得低於系統最小 12 字元。
export function generatePassword(length = 20): string {
  if (!Number.isInteger(length) || length < 12 || length > 1024) throw new RangeError('length')
  const limit = 256 - (256 % PASSWORD_ALPHABET.length)
  let result = ''
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const byte of bytes) {
      if (byte < limit && result.length < length)
        result += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
    }
  }
  return result
}
