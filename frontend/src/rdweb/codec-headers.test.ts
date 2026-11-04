import { expect, it } from 'vitest'
import samples from './__fixtures__/codec-samples.json'
import {
  readVp8Key,
  readVp9Key,
  readAv1Sequence,
  readH264Key,
  buildVideoConfig,
} from './codec-headers'
// 獨立固定WPT資料切出原始keyframe，不用待測encoder產生oracle。
function key(codec: string): Uint8Array {
  return Uint8Array.from(
    atob(samples.find((sample) => sample.codec === codec)!.frames[0]!.data),
    (c) => c.charCodeAt(0),
  )
}
// 解析真的bitstream profile/level及coded／visible幾何，不硬寫成probe預設值。
it.each([
  ['vp8', readVp8Key, 'vp8'],
  ['vp9', readVp9Key, 'vp09.00.20.08'],
  ['av1', readAv1Sequence, 'av01.0.00M.08'],
  ['h264', readH264Key, 'avc1.64000b'],
] as const)(
  'derives actual %s configuration from an independent public keyframe',
  (codec, read, expected) => {
    const shape = { width: 320, height: 240, codedWidth: 320, codedHeight: 240 }
    expect(read(key(codec))).toEqual({ ...shape, codec: expected })
  },
)
// 缺少完整header不能借用metadata當作可解碼的keyframe。
it('rejects truncated headers and mismatched display geometry', () => {
  expect(() => readVp9Key(key('vp9').subarray(0, 2))).toThrow('protocol_error')
  expect(() => readAv1Sequence(key('av1').subarray(0, 2))).toThrow('protocol_error')
  expect(() => readH264Key(key('h264').subarray(0, 3))).toThrow('protocol_error')
  const header = {
    width: 320,
    height: 240,
    codedWidth: 320,
    codedHeight: 240,
    codec: 'avc1.64000b',
  }
  expect(() => buildVideoConfig('h264', header, { display: 0, width: 640, height: 480 })).toThrow(
    'protocol_error',
  )
})

// Profile驗證在native配置之前完成，不能因probe支持同家族而接受I444。
it('rejects unsupported profiles in VP9 and AV1 keyframes', () => {
  const vp9 = key('vp9')
  vp9[0] |= 0x20
  expect(() => readVp9Key(vp9)).toThrow('codec_unsupported')
  const av1 = key('av1')
  av1[2] |= 0x20
  expect(() => readAv1Sequence(av1)).toThrow('codec_unsupported')
})
// H264裁切高度不等於coded高度，probe與renderer不能混用。
it('keeps cropped AVC display dimensions separate from coded dimensions', () => {
  const config = buildVideoConfig(
    'h264',
    { width: 1920, height: 1080, codedWidth: 1920, codedHeight: 1088, codec: 'avc1.640028' },
    { display: 0, width: 1920, height: 1080 },
  )
  expect(config.codedHeight).toBe(1088)
  expect(config.displayAspectHeight).toBe(1080)
  expect(config.description).toBeUndefined()
})
