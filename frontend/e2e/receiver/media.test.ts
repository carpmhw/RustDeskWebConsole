import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { receiverApi } from './test-fixtures'

const VP8_SHA256 = '503cd8dfafcba01760afc0794752803aa36143a14b9ad49b62c28b43de795c02'
const VP8_BYTES = 12230
const KEY_OFFSET = 522
const KEY_BYTES = 4826
const VERSION = 'rdweb-test-receiver/0.1.0'

// 讀取既有公開WPT快取並先驗完整原始hash，避免把損壞素材當成新fixture。
async function publicVp8(): Promise<Uint8Array> {
  const source = new Uint8Array(
    await readFile(new URL('../../.cache/codec-fixtures/vp8.webm', import.meta.url)),
  )
  expect(source).toHaveLength(VP8_BYTES)
  expect(createHash('sha256').update(source).digest('hex')).toBe(VP8_SHA256)
  return source
}

// media模組必須只依固定offset／size切出VP8 keyframe，不重新編碼或讀桌面。
it('extracts the pinned VP8 keyframe from the raw WPT source', async () => {
  const media = (await receiverApi('media')) as typeof import('./media')
  const source = await publicVp8()
  const keyframe = media.verifyReceiverVp8(source)
  expect(keyframe).toHaveLength(KEY_BYTES)
  expect(keyframe).toEqual(source.slice(KEY_OFFSET, KEY_OFFSET + KEY_BYTES))
})

// 任一byte、長度或型別偏差都只能回固定unavailable，不能回部分切片。
it.each([
  [
    'flipped source byte',
    (source: Uint8Array) => {
      const copy = source.slice()
      copy[0] = copy[0]! ^ 1
      return copy
    },
  ],
  ['short source', (source: Uint8Array) => source.slice(0, -1)],
  ['long source', (source: Uint8Array) => new Uint8Array([...source, 0])],
  ['empty source', () => new Uint8Array()],
])('rejects %s', async (_name, mutate) => {
  const media = (await receiverApi('media')) as typeof import('./media')
  const source = await publicVp8()
  expect(() => media.verifyReceiverVp8(mutate(source))).toThrow(/^receiver_unavailable$/)
})

// PeerInfo只宣告本工具的精確Windows／320×240能力，不冒充官方1.5.0。
it('reports the fixed Windows peer geometry and VP8 capability', async () => {
  const media = (await receiverApi('media')) as typeof import('./media')
  const info = media.receiverPeerInfo()
  expect(info).toMatchObject({
    platform: 'Windows',
    version: VERSION,
    currentDisplay: 0,
    sasEnabled: false,
    encoding: { vp8: true },
    features: { privacyMode: false, terminal: false },
  })
  expect(info.displays).toHaveLength(1)
  expect(info.displays?.[0]).toMatchObject({ x: 0, y: 0, width: 320, height: 240 })
})
