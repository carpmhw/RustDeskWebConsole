import type { CodecCapabilities } from './video-types'
import { hbb } from './codec'
const CANDIDATES = [
  ['vp8', 'vp8'],
  ['vp9', 'vp09.00.10.08'],
  ['av1', 'av01.0.00M.08'],
  ['h264', 'avc1.42e01f'],
  ['h264', 'avc1.4d001f'],
  ['h264', 'avc1.64001f'],
] as const
// 僅廣告native probe真支持的profile，operation deadline由host／worker控制。
export async function probeCodecs(
  query: (config: VideoDecoderConfig) => Promise<VideoDecoderSupport>,
): Promise<CodecCapabilities> {
  const profiles: CodecCapabilities['profiles'] = {}
  // 六個固定query並行，不建立由remote內容延伸的promise列表。
  await Promise.all(
    CANDIDATES.map(async ([family, codec]) => {
      try {
        const result = await query({
          codec,
          codedWidth: 128,
          codedHeight: 128,
          hardwareAcceleration: 'no-preference',
          optimizeForLatency: true,
        })
        if (result.supported) (profiles[family] ??= []).push(codec)
      } catch {
        /* Query故障只當不支援，不回傳native例外文字。 */
      }
    }),
  )
  if (!Object.values(profiles).some((values) => values?.length))
    throw new Error('video_unsupported')
  return { profiles }
}
// Pinned family能力僅來自native probe，H265/I444維持關閉。
export function supportedDecoding(caps: CodecCapabilities): hbb.ISupportedDecoding {
  // 每family只在至少一個profile通過時宣告。
  const has = (family: keyof CodecCapabilities['profiles']): number =>
    caps.profiles[family]?.length ? 1 : 0
  const family = (['vp9', 'vp8', 'av1', 'h264'] as const).find((value) => has(value))
  if (!family) throw new Error('video_unsupported')
  return {
    abilityVp9: has('vp9'),
    abilityVp8: has('vp8'),
    abilityAv1: has('av1'),
    abilityH264: has('h264'),
    abilityH265: 0,
    prefer: { vp9: 1, vp8: 4, av1: 5, h264: 2 }[family],
    preferChroma: 0,
    i444: {},
  }
}
