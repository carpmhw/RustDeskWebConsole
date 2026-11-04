import assert from 'node:assert/strict'
import { extractFixture } from '../frontend/scripts/prepare-codec-fixtures.mjs'

const bytes = Buffer.from([1, 2, 3])
const asset = {
  codec: 'vp8',
  name: 'public-fixture',
  bytes: 3,
  sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  chunks: [
    [0, 2],
    [2, 1],
  ],
}
const result = extractFixture(bytes, asset)
assert.equal(result.frames?.[0]?.data, 'AQI=')
assert.equal(result.frames?.[1]?.key, false)
assert.equal(result.frames?.[1]?.pts, '33')
// 變更一個byte也不能切片並默默接受。
assert.throws(() => extractFixture(Buffer.from([1, 2, 4]), asset), /integrity failed/)
// 即使完整hash正確，offset超出cache也必須拒絕。
assert.throws(() => extractFixture(bytes, { ...asset, chunks: [[2, 2]] }), /bounds failed/)
console.log('公開codec fixture完整性與切片邊界：PASS')
