import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { URL } from 'node:url'

const corpus = JSON.parse(
  await readFile(
    new URL('../frontend/src/rdweb/__fixtures__/fzstd-bounds.json', import.meta.url),
    'utf8',
  ),
)
const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const cjs = require('fzstd')
const esm = await import(new URL('../frontend/node_modules/fzstd/esm/index.mjs', import.meta.url))
// Node direct export 與 browser bundled ESM 分開驗，避免只靠 Vitest loader。
function verify(name, api) {
  let valid = 0,
    rejected = 0
  for (const sample of corpus) {
    const data = new Uint8Array(Buffer.from(sample.compressed, 'base64'))
    assert.equal(createHash('sha256').update(data).digest('hex'), sample.sha256)
    if (sample.native_valid) {
      const result = api.decompress(data)
      try {
        assert.equal(result.length, sample.bytes)
        assert.equal(createHash('sha256').update(result).digest('hex'), sample.plain_sha256)
      } finally {
        result.fill(0)
      }
      for (const chunkSize of [1, 7, data.length]) {
        let used = 0,
          finished = 0
        const digest = createHash('sha256')
        // 每個 output chunk 立即雜湊，不存無界資料歷史。
        const decoder = new api.Decompress((chunk, final) => {
          digest.update(chunk)
          used += chunk.length
          if (final) finished++
        })
        for (let offset = 0; offset < data.length; offset += chunkSize)
          decoder.push(data.subarray(offset, offset + chunkSize), offset + chunkSize >= data.length)
        assert.equal(used, sample.bytes)
        assert.equal(finished, 1)
        assert.equal(digest.digest('hex'), sample.plain_sha256)
      }
      if (sample.bytes > 0) {
        const output = new Uint8Array(sample.bytes - 1)
        try {
          // 尤其驗 RLE caller buffer，不以 fill 的截斷當作成功。
          assert.throws(() => api.decompress(data, output))
        } finally {
          output.fill(0)
        }
      }
      valid++
    } else {
      // native 已否定的資料，所有 entry point 都必須拒絕。
      assert.throws(() => api.decompress(data))
      for (const chunkSize of [1, data.length]) {
        // 空 callback 僅測拒絕，不輸出 native error 或 plaintext。
        const decoder = new api.Decompress(() => {})
        // 分 chunk 與完整 push 各自重建 decoder。
        assert.throws(() => {
          for (let offset = 0; offset < data.length; offset += chunkSize)
            decoder.push(
              data.subarray(offset, offset + chunkSize),
              offset + chunkSize >= data.length,
            )
        })
      }
      rejected++
    }
  }
  console.log(`fzstd ${name} native oracle：PASS（${valid} valid／${rejected} rejected）`)
}
verify('ESM', esm)
verify('CJS', cjs)
