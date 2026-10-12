import { expect, it } from 'vitest'
import { hbb } from './codec'
import { decodeTextClipboard, encodeTextClipboard } from './clipboard-codec'
import samples from './__fixtures__/clipboard-samples.json'
// 獨立 native fixtures 必須解回公開文字，owned result 不被原 buffer 清除。
it('decodes independent native compressed fixtures into owned bytes', () => {
  for (const sample of samples) {
    const data = Uint8Array.from(atob(sample.compressed), (c) => c.charCodeAt(0))
    const result = decodeTextClipboard(
      hbb.Message.create({ clipboard: { compress: true, content: data } }),
    )!
    data.fill(0)
    expect(new TextDecoder().decode(result)).toBe(sample.plain)
    expect(result.length).toBe(sample.bytes)
    result.fill(0)
  }
})
// 恰好一筆 Text；非 Text 只忽略，不嘗試解壓任意圖片或 HTML。
it('admits one text entry and refuses ambiguous or malformed clipboard fields', () => {
  const message = hbb.Message.create({
    multiClipboards: {
      clipboards: [
        { format: 1, compress: true, content: new Uint8Array([255]) },
        { content: new Uint8Array([65]) },
      ],
    },
  })
  expect(decodeTextClipboard(message)).toEqual(new Uint8Array([65]))
  expect(
    decodeTextClipboard(hbb.Message.create({ multiClipboards: { clipboards: [{ format: 1 }] } })),
  ).toBeNull()
  expect(() =>
    decodeTextClipboard(hbb.Message.create({ multiClipboards: { clipboards: [{}, {}] } })),
  ).toThrow('clipboard_invalid')
  expect(() =>
    decodeTextClipboard(
      hbb.Message.create({
        multiClipboards: { clipboards: Array.from({ length: 9 }, () => ({})) },
      }),
    ),
  ).toThrow('protocol_error')
  for (const clip of [
    { width: 1 },
    { height: 1 },
    { specialName: 'public' },
    { content: new Uint8Array([0]) },
    { content: new Uint8Array([192, 128]) },
  ])
    expect(() => decodeTextClipboard(hbb.Message.create({ clipboard: clip }))).toThrow(
      'clipboard_invalid',
    )
})
// 滿額、empty、BOM 保留；超額與不支援壓縮只屬操作錯誤。
it('preserves empty and BOM text and bounds actual bytes', () => {
  expect(decodeTextClipboard(hbb.Message.create({ clipboard: {} }))).toEqual(new Uint8Array())
  expect(
    decodeTextClipboard(
      hbb.Message.create({ clipboard: { content: new Uint8Array([239, 187, 191, 65]) } }),
    ),
  ).toEqual(new Uint8Array([239, 187, 191, 65]))
  expect(
    decodeTextClipboard(
      hbb.Message.create({ clipboard: { content: new Uint8Array(32768).fill(65) } }),
    ),
  ).toHaveLength(32768)
  expect(() =>
    decodeTextClipboard(
      hbb.Message.create({ clipboard: { content: new Uint8Array(32769).fill(65) } }),
    ),
  ).toThrow('clipboard_too_large')
  expect(() =>
    decodeTextClipboard(
      hbb.Message.create({
        clipboard: { compress: true, content: new Uint8Array([0, 0, 0, 0, 0, 0]) },
      }),
    ),
  ).toThrow('clipboard_unsupported')
})
// outbound 明確不壓縮，只組成一筆 Text，不附 client 訂閱 option。
it('encodes only strict uncompressed outbound text', () => {
  const bytes = new Uint8Array([65])
  expect(encodeTextClipboard(bytes)).toEqual({
    multiClipboards: { clipboards: [{ compress: false, format: 0, content: bytes }] },
  })
  expect(() => encodeTextClipboard(new Uint8Array([0]))).toThrow('clipboard_invalid')
})
// 宣告 FCS 與真輸出必須相同；不因 library 配置較小 window 默默接受截斷。
it('refuses a native frame whose declared FCS contradicts its actual content', () => {
  const data = Uint8Array.from(
    atob(samples[0]!.compressed),
    /* 公開 base64 只轉 bytes。 */ (c) => c.charCodeAt(0),
  )
  data[5] = 0
  data[6] = 0
  expect(() =>
    decodeTextClipboard(hbb.Message.create({ clipboard: { compress: true, content: data } })),
  ).toThrow('clipboard_invalid')
})
