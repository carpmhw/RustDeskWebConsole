import { expect, it } from 'vitest'
import { admitZstd } from './zstd-admission'
const raw = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x20, 3, 0x19, 0, 0, 65, 66, 67])
// 獨立 RFC raw block ABC，不透過待測 decoder 自我往返。
it('admits one bounded frame and refuses concatenation or uint64 FCS overflow', () => {
  expect(admitZstd(raw)).toEqual({ size: 3, window: 3, blocks: 1 })
  expect(() => admitZstd(new Uint8Array([...raw, ...raw]))).toThrow('clipboard_unsupported')
  expect(() =>
    admitZstd(
      new Uint8Array([
        0x28, 0xb5, 0x2f, 0xfd, 0xe0, 3, 0, 0, 0, 1, 0, 0, 0, 0x19, 0, 0, 65, 66, 67,
      ]),
    ),
  ).toThrow('clipboard_too_large')
})
// 每個拒絕在配置第三方 window 之前完成。
it('refuses reserved flags, dictionaries, checksum, skippable and truncation', () => {
  for (const flag of [0x21, 0x22, 0x23, 0x24]) {
    const data = raw.slice()
    data[4] = flag
    expect(() => admitZstd(data)).toThrow('clipboard_unsupported')
  }
  for (const flag of [0x28, 0x30]) {
    const data = raw.slice()
    data[4] = flag
    expect(() => admitZstd(data)).toThrow('clipboard_invalid')
  }
  const skip = raw.slice()
  skip[0] = 0x50
  expect(() => admitZstd(skip)).toThrow('clipboard_unsupported')
  for (let size = 0; size < raw.length; size++)
    expect(() => admitZstd(raw.slice(0, size))).toThrow('clipboard_invalid')
})
// 無 FCS frame 可接受有限 window；RLE 小 payload 不能掩飾巨大輸出。
it('bounds window, RLE expansion and blocks while allowing empty and no-FCS frames', () => {
  const noSize = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0, 0, 0x19, 0, 0, 65, 66, 67])
  expect(admitZstd(noSize)).toEqual({ size: null, window: 1024, blocks: 1 })
  const bigWindow = noSize.slice()
  bigWindow[5] = 72
  expect(() => admitZstd(bigWindow)).toThrow('clipboard_too_large')
  expect(() =>
    admitZstd(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0, 64, 0xfb, 0xff, 0xff, 65])),
  ).toThrow('clipboard_too_large')
  expect(admitZstd(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 0x20, 0, 1, 0, 0]))).toEqual({
    size: 0,
    window: 0,
    blocks: 1,
  })
  for (const count of [64, 65]) {
    const data = new Uint8Array(6 + count * 3)
    data.set([0x28, 0xb5, 0x2f, 0xfd, 0, 0])
    data[data.length - 3] = 1
    if (count === 64) expect(admitZstd(data).blocks).toBe(64)
    else expect(() => admitZstd(data)).toThrow('clipboard_invalid')
  }
})
