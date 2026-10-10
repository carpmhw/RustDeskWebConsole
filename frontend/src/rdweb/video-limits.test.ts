import { expect, it } from 'vitest'
import { ptsMicros, checkDisplay } from './video-limits'
// 毫秒int64須保持精確，乘1000後超限不能截斷或近似。
it('bounds exact microsecond timestamps', () => {
  expect(ptsMicros('9007199254740')).toBe(9007199254740000)
  expect(ptsMicros('0')).toBe(0)
  for (const value of ['9007199254741', '-1', '1.5', '01', ' 1', 'x'])
    expect(() => ptsMicros(value)).toThrow('protocol_error')
})
// Display幾何必須是受限正整數，包含索引與浮點特殊值。
it('rejects invalid display geometry before allocation', () => {
  const valid = { display: 0, width: 3840, height: 2160 }
  expect(checkDisplay(valid)).toBe(true)
  for (const value of [
    { ...valid, display: 32 },
    { ...valid, display: -1 },
    { ...valid, width: 4097 },
    { ...valid, height: 0 },
    { ...valid, width: NaN },
    { ...valid, height: 1.5 },
  ])
    expect(() => checkDisplay(value)).toThrow('protocol_error')
})
