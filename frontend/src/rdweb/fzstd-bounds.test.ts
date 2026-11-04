import { expect, it } from 'vitest'
import { Decompress, decompress } from 'fzstd'
import { hbb } from './codec'
import { decodeTextClipboard } from './clipboard-codec'
import corpus from './__fixtures__/fzstd-bounds.json'

// 測試只解公開 base64，不引入 Node globals 至 browser TypeScript。
function bytes(sample: (typeof corpus)[number]): Uint8Array {
  return Uint8Array.from(
    atob(sample.compressed),
    /* 公開 fixture 轉成 byte。 */ (c) => c.charCodeAt(0),
  )
}
// 原生 Web Crypto 計公開測試資料的 digest，並清掉本輪 owned copy。
async function digest(value: Uint8Array): Promise<string> {
  const owned = new Uint8Array(value)
  try {
    const hash = await crypto.subtle.digest('SHA-256', owned)
    return Array.from(
      new Uint8Array(hash),
      /* 每個公有 byte 轉成固定 hex。 */ (b) => b.toString(16).padStart(2, '0'),
    ).join('')
  } finally {
    owned.fill(0)
  }
}
// browser 使用的 ESM 必須精確解出 native 正案，包括無 FCS／跨 block／32KiB。
it('preserves native content in ESM one-shot, custom-buffer and streamed paths', async () => {
  for (const sample of corpus.filter(/* 正案由 native engine 驗明。 */ (s) => s.native_valid)) {
    const data = bytes(sample),
      value = decompress(data)
    try {
      expect(value.length).toBe(sample.bytes)
      expect(await digest(value)).toBe(sample.plain_sha256)
    } finally {
      value.fill(0)
    }
    const output = new Uint8Array(sample.bytes!)
    try {
      expect(await digest(decompress(data, output))).toBe(sample.plain_sha256)
    } finally {
      output.fill(0)
    }
    for (const chunkSize of [1, 7, data.length]) {
      const result = new Uint8Array(sample.bytes!)
      let used = 0,
        finished = 0
      try {
        // 有界測試 collector，不使用 caller buffer 限制 decoder 本身。
        const decoder = new Decompress((chunk, final) => {
          expect(used + chunk.length).toBeLessThanOrEqual(result.length)
          result.set(chunk, used)
          used += chunk.length
          if (final) finished++
        })
        for (let offset = 0; offset < data.length; offset += chunkSize)
          decoder.push(data.subarray(offset, offset + chunkSize), offset + chunkSize >= data.length)
        expect(used).toBe(sample.bytes)
        expect(finished).toBe(1)
        expect(await digest(result)).toBe(sample.plain_sha256)
      } finally {
        result.fill(0)
      }
    }
  }
})
// native 負案不能被 browser ESM 靜默截斷成成功資料。
it('refuses native-rejected bounds and FCS mutations in the ESM entry point', () => {
  for (const sample of corpus.filter(/* 負案不是由待測 decoder 定義。 */ (s) => !s.native_valid)) {
    const data = bytes(sample)
    // one-shot 必須明確拒絕。
    expect(() => decompress(data)).toThrow()
    for (const chunkSize of [1, data.length]) {
      // 不保存任何結果，只驗拒絕語意。
      const decoder = new Decompress(() => {})
      // 分 chunk 的 streaming 亦不得冒稱成功。
      expect(() => {
        for (let offset = 0; offset < data.length; offset += chunkSize)
          decoder.push(data.subarray(offset, offset + chunkSize), offset + chunkSize >= data.length)
      }).toThrow()
    }
  }
})
// caller output 的 RLE fill 亦不能因空間不足靜默截斷。
it('rejects undersized caller buffers for native-valid content', () => {
  for (const sample of corpus.filter(
    /* 非空正案可建立不足容量。 */ (s) => s.native_valid && s.bytes! > 0,
  )) {
    const output = new Uint8Array(sample.bytes! - 1)
    try {
      // 拒絕來源是 caller 容量不足，而非原資料非法。
      expect(() => decompress(bytes(sample), output)).toThrow()
    } finally {
      output.fill(0)
    }
  }
})
// wrapper 自己保留 UTF-8／32KiB，不能因 vendor 支援較大輸出而放寬。
it('keeps clipboard admission and actual output caps independent of the patch', async () => {
  for (const sample of corpus) {
    const message = hbb.Message.create({ clipboard: { compress: true, content: bytes(sample) } })
    if (sample.operation_code) {
      // 無 FCS 超額由真正 callback bytes 觸發，FCS 矛盾保持固定 invalid。
      expect(() => decodeTextClipboard(message)).toThrow(sample.operation_code)
    } else {
      const value = decodeTextClipboard(message)!
      try {
        expect(await digest(value)).toBe(sample.plain_sha256)
      } finally {
        value.fill(0)
      }
    }
  }
})
