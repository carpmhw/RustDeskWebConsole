import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { URL } from 'node:url'
// 只驗公開 fixture 的 compressed hash 與精確 UTF-8 bytes，不輸出 payload。
function verify(sample) {
  const data = Buffer.from(sample.compressed, 'base64')
  assert.equal(createHash('sha256').update(data).digest('hex'), sample.sha256)
  assert.equal(Buffer.byteLength(sample.plain, 'utf8'), sample.bytes)
  assert.ok(sample.bytes > 0 && sample.bytes <= 32768 && data.length <= 65536)
}
const samples = JSON.parse(
  await readFile(
    new URL('../frontend/src/rdweb/__fixtures__/clipboard-samples.json', import.meta.url),
    'utf8',
  ),
)
assert.equal(samples.length, 2)
for (const sample of samples) {
  verify(sample)
  const changed = Buffer.from(sample.compressed, 'base64')
  changed[changed.length - 1] ^= 1
  // 用改 byte 的 copy 驗證 hash 負案，不覆寫 fixture。
  assert.throws(() => verify({ ...sample, compressed: changed.toString('base64') }))
  // 不信任 fixture 宣告的文字長度。
  assert.throws(() => verify({ ...sample, bytes: sample.bytes + 1 }))
}
console.log('公開 clipboard fixture integrity：PASS')

const bounds = JSON.parse(
  await readFile(
    new URL('../frontend/src/rdweb/__fixtures__/fzstd-bounds.json', import.meta.url),
    'utf8',
  ),
)
assert.equal(bounds.length, 25)
assert.equal(new Set(bounds.map(/* 公開案例名稱必須唯一。 */ (s) => s.name)).size, bounds.length)
for (const sample of bounds) {
  const bytes = Buffer.from(sample.compressed, 'base64')
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256)
  assert.ok(bytes.length > 0 && bytes.length <= 65536)
  assert.equal(sample.engine, 'libzstd')
  assert.equal(typeof sample.native_valid, 'boolean')
  if (sample.native_valid) {
    assert.ok(Number.isInteger(sample.bytes) && sample.bytes >= 0 && sample.bytes <= 32769)
    assert.match(sample.plain_sha256, /^[a-f0-9]{64}$/)
  } else {
    assert.equal(sample.bytes, null)
    assert.equal(sample.plain_sha256, null)
  }
  assert.ok([null, 'clipboard_invalid', 'clipboard_too_large'].includes(sample.operation_code))
}
console.log('公開 fzstd bounds corpus integrity：PASS')
