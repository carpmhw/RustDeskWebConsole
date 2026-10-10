import { VIDEO_LIMITS } from './video-limits'
export interface WireField {
  number: number
  wire: number
  bytes?: Uint8Array
  scalar?: bigint
}
interface ScanBudget {
  fields: number
}
// 有界讀取protobuf wire，length不越界、不先配置repeated物件。
export function visitWire(
  bytes: Uint8Array,
  budget: ScanBudget,
  visit: (field: WireField) => void,
): void {
  let offset = 0
  // uint64逐byte精確讀取；tag／length不用有符號bitwise累加。
  const integer = (): bigint => {
    let value = 0n
    for (let index = 0; index < 10; index++) {
      if (offset >= bytes.length) throw new Error('protocol_error')
      const octet = bytes[offset++]!
      if (index === 9 && octet > 1) throw new Error('protocol_error')
      value |= BigInt(octet & 127) << BigInt(index * 7)
      if (!(octet & 128)) return value
    }
    throw new Error('protocol_error')
  }
  while (offset < bytes.length) {
    if (++budget.fields > 1024) throw new Error('protocol_error')
    const tag = integer()
    if (tag > 0xffffffffn || tag < 8n) throw new Error('protocol_error')
    const number = Number(tag >> 3n)
    const wire = Number(tag & 7n)
    if (wire === 0) visit({ number, wire, scalar: integer() })
    else {
      const length = wire === 1 ? 8 : wire === 5 ? 4 : wire === 2 ? Number(integer()) : -1
      if (!Number.isSafeInteger(length) || length < 0 || length > bytes.length - offset)
        throw new Error('protocol_error')
      const value = bytes.subarray(offset, offset + length)
      offset += length
      visit({ number, wire, bytes: value })
    }
  }
}
// 影像一個oneof、至多16個非空frame；typed內容仍交generated codec。
function admitVideo(bytes: Uint8Array, budget: ScanBudget): void {
  let payload: WireField | null = null
  let displaySeen = false
  // Metadata不是codec oneof，但不能重複或超出受限display索引。
  visitWire(bytes, budget, (field) => {
    if (field.number === 14) {
      if (displaySeen || field.wire !== 0 || field.scalar! > 31n) throw new Error('protocol_error')
      displaySeen = true
      return
    }
    if (payload || ![6, 7, 8, 10, 11, 12, 13].includes(field.number) || field.wire !== 2)
      throw new Error('protocol_error')
    payload = field
  })
  if (!payload) throw new Error('protocol_error')
  const union = payload as WireField
  if (![6, 10, 12, 13].includes(union.number)) throw new Error('codec_unsupported')
  let count = 0
  // 每個repeated entry在generated decode配置之前檢查。
  visitWire(union.bytes!, budget, (entry) => {
    if (entry.number !== 1 || entry.wire !== 2 || ++count > VIDEO_LIMITS.chunks)
      throw new Error('protocol_error')
    const seen = new Set<number>()
    let hasData = false
    // Frame的key與pts允許省略為proto default，但不接受矛盾或負int64。
    visitWire(entry.bytes!, budget, (field) => {
      if (seen.has(field.number) || ![1, 2, 3].includes(field.number))
        throw new Error('protocol_error')
      seen.add(field.number)
      if (field.number === 1) {
        if (field.wire !== 2 || !field.bytes?.length) throw new Error('protocol_error')
        hasData = true
      } else if (
        field.wire !== 0 ||
        (field.number === 2 && field.scalar! > 1n) ||
        (field.number === 3 && field.scalar! > 0x7fffffffffffffffn)
      )
        throw new Error('protocol_error')
    })
    if (!hasData) throw new Error('protocol_error')
  })
  if (!count) throw new Error('protocol_error')
}
// Misc scalar／string／message種類按pinned schema，不接受decoder的oneof覆蓋。
function admitMisc(bytes: Uint8Array, budget: ScanBudget): void {
  const numbers = [
    4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36, 37, 38,
  ]
  const scalars = [10, 12, 14, 15, 16, 17, 20, 27, 28, 29, 31, 35, 38]
  let count = 0
  // 一個Misc只能包含一個已知member。
  visitWire(bytes, budget, (field) => {
    if (
      ++count > 1 ||
      !numbers.includes(field.number) ||
      field.wire !== (scalars.includes(field.number) ? 0 : 2)
    )
      throw new Error('protocol_error')
  })
  if (!count) throw new Error('protocol_error')
}
// LoginResponse不能在error與PeerInfo中選最後一個，trusted-device flag不是oneof。
function admitLoginResponse(bytes: Uint8Array, budget: ScanBudget): void {
  let count = 0
  let trustedSeen = false
  // 原始wire直接計oneof，避免生成decode覆蓋另一個member。
  visitWire(bytes, budget, (field) => {
    if (field.number === 3) {
      if (trustedSeen || field.wire !== 0 || field.scalar! > 1n) throw new Error('protocol_error')
      trustedSeen = true
    } else if (![1, 2].includes(field.number) || field.wire !== 2 || ++count > 1)
      throw new Error('protocol_error')
  })
  if (count !== 1) throw new Error('protocol_error')
}
// 每個envelope先作額度／oneof admission，影像不放寬control limit。
export function admitEnvelope(bytes: Uint8Array): 'video' | 'control' {
  if (!bytes.length || bytes.length > VIDEO_LIMITS.envelope) throw new Error('protocol_error')
  const budget = { fields: 0 }
  let root: WireField | null = null
  // Message只有一個已知oneof，cursor_id例外為uint64。
  visitWire(bytes, budget, (field) => {
    if (
      root ||
      field.number < 3 ||
      field.number > 32 ||
      field.wire !== (field.number === 14 ? 0 : 2)
    )
      throw new Error('protocol_error')
    root = field
  })
  if (!root) throw new Error('protocol_error')
  const field = root as WireField
  if (field.number === 6) {
    admitVideo(field.bytes!, budget)
    return 'video'
  }
  if (bytes.length > VIDEO_LIMITS.control) throw new Error('protocol_error')
  if (field.number === 19) admitMisc(field.bytes!, budget)
  if (field.number === 8) admitLoginResponse(field.bytes!, budget)
  return 'control'
}
