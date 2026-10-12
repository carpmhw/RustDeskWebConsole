import { expect, it, vi } from 'vitest'
import { utf8, int32, textFromBytes, interactionClock } from './interaction-limits'

// UTF-8 限額以 bytes 而非字元數計，禁止無效 scalar 與 NUL。
it('bounds exact UTF8 bytes without replacing malformed scalars', () => {
  expect(utf8('中文', 6, 'clipboard_too_large')).toHaveLength(6)
  expect(() => utf8('中文', 5, 'clipboard_too_large')).toThrow('clipboard_too_large')
  for (const text of ['\ud800', '\udc00', '\0'])
    expect(() => utf8(text, 4096, 'input_text_too_large')).toThrow('input_unsupported')
  expect(utf8('😀', 4, 'input_text_too_large')).toHaveLength(4)
})
// signed 邊界與非整數在使用遠端原點前必須驗明。
it('accepts only exact int32 values', () => {
  expect(int32(-2147483648)).toBe(-2147483648)
  expect(int32(2147483647)).toBe(2147483647)
  for (const n of [2147483648, -2147483649, 0.5, NaN, Infinity])
    expect(() => int32(n)).toThrow('protocol_error')
})
// 空字串有效、BOM 保留，無效 UTF-8 與 NUL 不得被替換。
it('strictly decodes clipboard bytes and preserves BOM and empty values', () => {
  expect(textFromBytes(new Uint8Array())).toBe('')
  expect(textFromBytes(new Uint8Array([239, 187, 191, 65]))).toBe('\ufeffA')
  for (const b of [[192, 128], [237, 160, 128], [0]])
    expect(() => textFromBytes(new Uint8Array(b))).toThrow('clipboard_invalid')
  expect(textFromBytes(new Uint8Array(32768).fill(65))).toHaveLength(32768)
  expect(() => textFromBytes(new Uint8Array(32769))).toThrow('clipboard_too_large')
})
// 單調 clock 包含睡眠時間，wallclock 倒退不能延長期限。
it('never rewinds elapsed time and includes wallclock sleep', () => {
  const p = vi.spyOn(performance, 'now').mockReturnValue(100)
  const d = vi.spyOn(Date, 'now').mockReturnValue(1000)
  try {
    const now = interactionClock()
    p.mockReturnValue(120)
    d.mockReturnValue(900)
    expect(now()).toBe(20)
    p.mockReturnValue(110)
    d.mockReturnValue(5000)
    expect(now()).toBe(4000)
    d.mockReturnValue(1000)
    expect(now()).toBe(4000)
  } finally {
    p.mockRestore()
    d.mockRestore()
  }
})
