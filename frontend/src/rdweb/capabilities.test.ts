import { expect, it, vi } from 'vitest'
import { probeCodecs } from './capabilities'
// Native結果而非UA字串決定廣告能力，H264各profile分別確認。
it('advertises only profiles proven by native queries', async () => {
  const query = vi.fn(async (config: VideoDecoderConfig) => ({
    supported: config.codec === 'vp8' || config.codec === 'avc1.64001f',
    config,
  }))
  expect(await probeCodecs(query)).toEqual({ profiles: { vp8: ['vp8'], h264: ['avc1.64001f'] } })
  expect(query).toHaveBeenCalledTimes(6)
})
// 沒有任何支援時固定拒絕，不能建立假VP9能力。
it('rejects entirely unsupported environments', async () => {
  await expect(probeCodecs(async (config) => ({ supported: false, config }))).rejects.toThrow(
    'video_unsupported',
  )
})
