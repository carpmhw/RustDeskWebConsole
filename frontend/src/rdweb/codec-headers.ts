import type { CodecFamily, DisplayGeometry } from './video-types'
import { BitReader } from './bit-reader'
import { checkDisplay, VIDEO_LIMITS } from './video-limits'
export interface CodecHeader {
  width: number
  height: number
  codedWidth: number
  codedHeight: number
  codec: string
}
// VP8 key frame驗sync／version／partition與14-bit尺寸，不使用metadata假造header。
export function readVp8Key(bytes: Uint8Array): CodecHeader {
  if (
    bytes.length < 10 ||
    bytes[0]! & 1 ||
    ((bytes[0]! >> 1) & 7) > 3 ||
    bytes[3] !== 0x9d ||
    bytes[4] !== 1 ||
    bytes[5] !== 0x2a
  )
    throw new Error('protocol_error')
  const partition = (bytes[0]! + bytes[1]! * 256 + bytes[2]! * 65536) >>> 5
  if (partition > bytes.length - 10) throw new Error('protocol_error')
  const width = bytes[6]! + bytes[7]! * 256,
    height = bytes[8]! + bytes[9]! * 256
  if (width & 0xc000 || height & 0xc000) throw new Error('codec_unsupported')
  return header(width & 0x3fff, height & 0x3fff, 'vp8')
}
const VP9_LEVELS = [
  ['10', 829440, 36864, 512],
  ['11', 2764800, 73728, 768],
  ['20', 4608000, 122880, 960],
  ['21', 9216000, 245760, 1344],
  ['30', 20736000, 552960, 2048],
  ['31', 36864000, 983040, 2752],
  ['40', 83558400, 2228224, 4160],
  ['41', 160432128, 2228224, 4160],
  ['50', 311951360, 8912896, 8384],
  ['51', 588251136, 8912896, 8384],
  ['52', 1176502272, 8912896, 8384],
  ['60', 1176502272, 35651584, 16832],
] as const
// 標準level事實依WebM規範，包含codec邊界extension及30FPS樣本率。
export function vp9Codec(width: number, height: number): string {
  const pixels = (width + 32) * (height + 32)
  const row = VP9_LEVELS.find(
    ([, rate, picture, side]) =>
      Math.max(width + 32, height + 32) <= side && pixels <= picture && pixels * 30 <= rate,
  )
  if (!row) throw new Error('codec_unsupported')
  return 'vp09.00.' + row[0] + '.08'
}
// 每個header的coded／visible尺寸都要有界。
function header(
  width: number,
  height: number,
  codec: string,
  codedWidth = width,
  codedHeight = height,
): CodecHeader {
  checkDisplay({ display: 0, width, height })
  checkDisplay({ display: 0, width: codedWidth, height: codedHeight })
  return { width, height, codedWidth, codedHeight, codec }
}
// 驗VP9 profile0 keyframe uncompressed header，其他chroma／depth不冒稱支持。
export function readVp9Key(bytes: Uint8Array): CodecHeader {
  const bits = new BitReader(bytes.subarray(0, VIDEO_LIMITS.control))
  if (bits.read(2) !== 2) throw new Error('protocol_error')
  const profile = bits.read(1) + bits.read(1) * 2
  if (profile !== 0) throw new Error('codec_unsupported')
  if (bits.read(1) || bits.read(1)) throw new Error('protocol_error')
  bits.skip(2)
  if (bits.read(24) !== 0x498342) throw new Error('protocol_error')
  if (bits.read(3) === 7) throw new Error('codec_unsupported')
  bits.skip(1)
  const width = bits.read(16) + 1,
    height = bits.read(16) + 1
  return header(width, height, vp9Codec(width, height))
}
// Scan AV1 OBU的length而非容器，sequence body至多64KiB。
export function readAv1Sequence(bytes: Uint8Array): CodecHeader {
  let offset = 0,
    count = 0
  while (offset < bytes.length) {
    if (++count > 64) throw new Error('protocol_error')
    const tag = bytes[offset++]!
    if (tag & 0x81 || !(tag & 2)) throw new Error('protocol_error')
    if (tag & 4) {
      if (offset >= bytes.length || bytes[offset++]! & 7) throw new Error('protocol_error')
    }
    let length = 0,
      terminated = false
    for (let index = 0; index < 8; index++) {
      if (offset >= bytes.length) throw new Error('protocol_error')
      const value = bytes[offset++]!
      length += (value & 127) * 2 ** (index * 7)
      if (!Number.isSafeInteger(length) || length > VIDEO_LIMITS.envelope)
        throw new Error('protocol_error')
      if (!(value & 128)) {
        terminated = true
        break
      }
    }
    if (!terminated || length > bytes.length - offset) throw new Error('protocol_error')
    const payload = bytes.subarray(offset, offset + length)
    offset += length
    if (((tag >> 3) & 15) === 1) {
      if (payload.length > VIDEO_LIMITS.control) throw new Error('protocol_error')
      return av1Sequence(payload)
    }
  }
  throw new Error('protocol_error')
}
// AV1標準sequence fields依序讀，operating point／model／color條件不能錯位。
function av1Sequence(bytes: Uint8Array): CodecHeader {
  const bits = new BitReader(bytes)
  if (bits.read(3) !== 0) throw new Error('codec_unsupported')
  bits.skip(1)
  const reduced = bits.read(1)
  let level = 0,
    tier = 0,
    model = false,
    initial = false,
    delayBits = 0
  if (reduced) level = bits.read(5)
  else {
    if (bits.read(1)) {
      bits.skip(64)
      if (bits.read(1)) bits.ue()
      model = Boolean(bits.read(1))
      if (model) {
        delayBits = bits.read(5) + 1
        bits.skip(42)
      }
    }
    initial = Boolean(bits.read(1))
    const points = bits.read(5) + 1
    for (let index = 0; index < points; index++) {
      bits.skip(12)
      const pointLevel = bits.read(5),
        pointTier = pointLevel > 7 ? bits.read(1) : 0
      if (!index) {
        level = pointLevel
        tier = pointTier
      }
      if (model && bits.read(1)) {
        bits.skip(delayBits * 2)
        bits.skip(1)
      }
      if (initial && bits.read(1)) bits.skip(4)
    }
  }
  const widthBits = bits.read(4) + 1,
    heightBits = bits.read(4) + 1
  const width = bits.read(widthBits) + 1,
    height = bits.read(heightBits) + 1
  if (!reduced && bits.read(1)) bits.skip(7)
  bits.skip(3)
  if (!reduced) {
    bits.skip(4)
    const order = bits.read(1)
    if (order) bits.skip(2)
    const screen = bits.read(1) ? 2 : bits.read(1)
    if (screen > 0 && !bits.read(1)) bits.skip(1)
    if (order) bits.skip(3)
  }
  bits.skip(3)
  if (bits.read(1) || bits.read(1)) throw new Error('codec_unsupported')
  let primaries = 2,
    transfer = 2,
    matrix = 2
  if (bits.read(1)) {
    primaries = bits.read(8)
    transfer = bits.read(8)
    matrix = bits.read(8)
  }
  if (primaries === 1 && transfer === 13 && matrix === 0) throw new Error('codec_unsupported')
  bits.skip(1)
  bits.skip(2)
  bits.skip(2)
  return header(width, height, `av01.0.${String(level).padStart(2, '0')}${tier ? 'H' : 'M'}.08`)
}
// SPS移除合法emulation-prevention，禁止越界或非法escape。
function rbsp(bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.length)
  let length = 0,
    zeros = 0
  for (let index = 0; index < bytes.length; index++) {
    const value = bytes[index]!
    if (zeros >= 2 && value === 3) {
      if (index + 1 >= bytes.length || bytes[index + 1]! > 3) throw new Error('protocol_error')
      zeros = 0
      continue
    }
    output[length++] = value
    zeros = value === 0 ? zeros + 1 : 0
  }
  return output.subarray(0, length)
}
// AnnexB最多64個NAL，key access unit必須同時有SPS／PPS／IDR。
export function readH264Key(bytes: Uint8Array): CodecHeader {
  const starts: { offset: number; payload: number }[] = []
  for (let index = 0; index < bytes.length - 2; index++) {
    if (bytes[index] || bytes[index + 1]) continue
    const size =
      bytes[index + 2] === 1 ? 3 : bytes[index + 2] === 0 && bytes[index + 3] === 1 ? 4 : 0
    if (size) {
      starts.push({ offset: index, payload: index + size })
      if (starts.length > 64) throw new Error('protocol_error')
      index += size - 1
    }
  }
  let sps: Uint8Array | null = null,
    pps = false,
    idr = false
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index]!,
      end = starts[index + 1]?.offset ?? bytes.length
    if (start.payload >= end || bytes[start.payload]! & 128) throw new Error('protocol_error')
    const type = bytes[start.payload]! & 31
    if (type === 7 || type === 8) {
      if (end - start.payload > VIDEO_LIMITS.control) throw new Error('protocol_error')
      if (type === 7) sps = rbsp(bytes.subarray(start.payload + 1, end))
      else pps = true
    }
    if (type === 5) idr = true
  }
  if (!sps || !pps || !idr) throw new Error('protocol_error')
  const bits = new BitReader(sps)
  const profile = bits.read(8),
    compatibility = bits.read(8),
    level = bits.read(8)
  if (![66, 77, 100].includes(profile)) throw new Error('codec_unsupported')
  if (bits.ue() > 31) throw new Error('protocol_error')
  if (profile === 100) {
    if (bits.ue() !== 1 || bits.ue() !== 0 || bits.ue() !== 0) throw new Error('codec_unsupported')
    bits.skip(1)
    if (bits.read(1)) {
      for (let index = 0; index < 8; index++)
        if (bits.read(1)) {
          let last = 8,
            next = 8
          for (let item = 0; item < (index < 6 ? 16 : 64); item++) {
            if (next) next = (((last + bits.se()) % 256) + 256) % 256
            last = next || last
          }
        }
    }
  }
  if (bits.ue() > 12) throw new Error('protocol_error')
  const order = bits.ue()
  if (order === 0) {
    if (bits.ue() > 12) throw new Error('protocol_error')
  } else if (order === 1) {
    bits.skip(1)
    bits.se()
    bits.se()
    const count = bits.ue()
    if (count > 256) throw new Error('protocol_error')
    for (let index = 0; index < count; index++) bits.se()
  } else if (order !== 2) throw new Error('protocol_error')
  if (bits.ue() > 16) throw new Error('protocol_error')
  bits.skip(1)
  const codedWidth = (bits.ue() + 1) * 16,
    mapHeight = bits.ue() + 1
  const progressive = bits.read(1)
  if (!progressive) bits.skip(1)
  bits.skip(1)
  let left = 0,
    right = 0,
    top = 0,
    bottom = 0
  if (bits.read(1)) {
    left = bits.ue()
    right = bits.ue()
    top = bits.ue()
    bottom = bits.ue()
  }
  const codedHeight = mapHeight * 16 * (2 - progressive)
  // 三個實際SPS bytes生成codec suffix，不以初始probe常數代替。
  const suffix = [profile, compatibility, level]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  return header(
    codedWidth - (left + right) * 2,
    codedHeight - (top + bottom) * 2 * (2 - progressive),
    'avc1.' + suffix,
    codedWidth,
    codedHeight,
  )
}
// Actual config的coded尺寸與裁切display分開；不支援組合不得借probe假成功。
export function buildVideoConfig(
  family: CodecFamily,
  value: CodecHeader,
  display: DisplayGeometry,
): VideoDecoderConfig {
  checkDisplay(display)
  checkDisplay({ ...display, width: value.codedWidth, height: value.codedHeight })
  if (
    value.width !== display.width ||
    value.height !== display.height ||
    !(family === 'vp8'
      ? value.codec === 'vp8'
      : value.codec.startsWith({ vp9: 'vp09.00.', av1: 'av01.0.', h264: 'avc1.' }[family]))
  )
    throw new Error('protocol_error')
  return {
    codec: value.codec,
    codedWidth: value.codedWidth,
    codedHeight: value.codedHeight,
    displayAspectWidth: value.width,
    displayAspectHeight: value.height,
    hardwareAcceleration: 'no-preference',
    optimizeForLatency: true,
  }
}
