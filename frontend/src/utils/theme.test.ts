import { describe, expect, it } from 'vitest'
import { parseColorMode, readColorMode, resolveTheme, saveColorMode } from './theme'

describe('display theme', () => {
  // 系統模式跟隨裝置，手動模式不能被系統偏好覆寫。
  it('resolves system and manual modes independently', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  // 儲存損壞或封鎖不影響當次外觀使用。
  it('falls back safely when storage is invalid or blocked', () => {
    expect(parseColorMode('unexpected')).toBe('system')
    expect(parseColorMode(null)).toBe('system')
    expect(
      readColorMode({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('system')
    expect(() =>
      saveColorMode(
        {
          setItem: () => {
            throw new Error('blocked')
          },
        },
        'dark',
      ),
    ).not.toThrow()
  })
})
