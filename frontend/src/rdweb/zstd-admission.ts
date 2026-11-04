import { INTERACTION_LIMITS as L } from './interaction-limits'
// decoder 配置前驗精確 uint64 FCS／window／blocks，只接受一個普通 frame。
export function admitZstd(data: Uint8Array): {
  size: number | null
  window: number
  blocks: number
} {
  if (data.length < 6 || data.length > L.clipboardWire) throw new Error('clipboard_invalid')
  if (
    !data
      .subarray(0, 4)
      .every(/* 固定普通 Zstd magic。 */ (b, i) => b === [0x28, 0xb5, 0x2f, 0xfd][i])
  )
    throw new Error('clipboard_unsupported')
  let p = 5
  const flag = data[4]!
  if (flag & 0x18) throw new Error('clipboard_invalid')
  if (flag & 7) throw new Error('clipboard_unsupported')
  const single = (flag & 0x20) !== 0,
    fcf = flag >>> 6
  let window = 0
  if (!single) {
    if (p >= data.length) throw new Error('clipboard_invalid')
    const wd = data[p++]!,
      base = 2 ** (10 + (wd >>> 3))
    window = base + (base / 8) * (wd & 7)
    if (window > L.zstdWindow) throw new Error('clipboard_too_large')
  }
  const count = fcf ? 2 ** fcf : single ? 1 : 0
  let size: number | null = null
  if (count) {
    if (p + count > data.length) throw new Error('clipboard_invalid')
    let n = 0n
    for (let i = 0; i < count; i++) n += BigInt(data[p++]!) * 2n ** BigInt(i * 8)
    if (count === 2) n += 256n
    if (n > BigInt(L.clipboard)) throw new Error('clipboard_too_large')
    size = Number(n)
  }
  if (single) window = size!
  let blocks = 0,
    known = 0,
    last = false
  while (!last) {
    if (++blocks > L.zstdBlocks || p + 3 > data.length) throw new Error('clipboard_invalid')
    const head = data[p]! + data[p + 1]! * 256 + data[p + 2]! * 65536
    p += 3
    last = (head & 1) !== 0
    const type = (head >>> 1) & 3,
      length = head >>> 3
    if (type === 3) throw new Error('clipboard_invalid')
    if (length > Math.min(131072, window)) throw new Error('clipboard_too_large')
    const payload = type === 1 ? 1 : length
    if (p + payload > data.length) throw new Error('clipboard_invalid')
    if (type < 2) known += length
    if (known > L.clipboard) throw new Error('clipboard_too_large')
    p += payload
  }
  if (p !== data.length) throw new Error('clipboard_unsupported')
  return { size, window, blocks }
}
