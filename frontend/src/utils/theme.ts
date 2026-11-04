export type ColorMode = 'light' | 'dark' | 'system'

// 手動主題優先，系統模式只依瀏覽器偏好解析。
export function resolveTheme(mode: ColorMode, prefersDark: boolean): 'light' | 'dark' {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
}

// 損壞或未知值不能成為任意 HTML 樣式屬性。
export function parseColorMode(value: string | null): ColorMode {
  return value === 'light' || value === 'dark' ? value : 'system'
}

// 隱私模式封鎖儲存時仍可使用系統主題。
export function readColorMode(storage: Pick<Storage, 'getItem'>): ColorMode {
  try {
    return parseColorMode(storage.getItem('rdweb.colorMode'))
  } catch {
    return 'system'
  }
}

// 只儲存非敏感偏好，失敗時保留當次記憶體狀態。
export function saveColorMode(storage: Pick<Storage, 'setItem'>, value: ColorMode): void {
  try {
    storage.setItem('rdweb.colorMode', value)
  } catch {
    /* 儲存不可用不影響頁面。 */
  }
}
