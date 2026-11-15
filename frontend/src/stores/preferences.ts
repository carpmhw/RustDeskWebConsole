import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n, readLocale, type Locale } from '../i18n'
import {
  parseColorMode,
  readColorMode,
  resolveTheme,
  saveColorMode,
  type ColorMode,
} from '../utils/theme'
import { readTimeZone, saveTimeZone } from '../utils/dateTime'

// 只存非敏感偏好，封鎖 localStorage 時由工具安全回退。
export const usePreferencesStore = defineStore('preferences', () => {
  const storage = {
    // 延後讀取儲存，瀏覽器例外可由偏好工具處理。
    getItem: (key: string) => window.localStorage.getItem(key),
    // 延後保存儲存，無法保存不影響頁面操作。
    setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  }
  const colorMode = ref<ColorMode>(readColorMode(storage))
  const locale = ref<Locale>(readLocale(storage))
  const timeZone = ref(readTimeZone(storage, window.RDWEB_CONFIG?.defaultDisplayTimeZone))
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  // 目前系統偏好，供「跟隨系統」選項顯示解析結果。
  const systemDark = ref(media.matches)
  // 實際主題與手動／系統選擇分開，系統事件不覆寫手動偏好；meta 同步供原生 UI 使用。
  function applyTheme(): void {
    systemDark.value = media.matches
    const theme = resolveTheme(colorMode.value, media.matches)
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme)
  }
  // 使用已核准的三種外觀，儲存僅為非敏感設定。
  function setColorMode(value: ColorMode): void {
    colorMode.value = value
    saveColorMode(storage, value)
    applyTheme()
  }
  // 切換語言保留當次設定，儲存失敗只影響下次載入。
  function setLocale(value: Locale): void {
    locale.value = value
    i18n.global.locale.value = value
    document.documentElement.lang = value === 'en' ? 'en' : 'zh-Hant'
    try {
      storage.setItem('rdweb.locale', value)
    } catch {
      /* 不因儲存封鎖而中斷。 */
    }
  }
  // 時區不影響資料庫／API／伺服器 log。
  function setTimeZone(value: string): void {
    saveTimeZone(storage, value)
    timeZone.value = value
  }
  media.addEventListener('change', applyTheme)
  // 其他分頁變更外觀時同步；key 為 null 代表儲存被整批清除，回到跟隨系統。
  window.addEventListener('storage', (event) => {
    if (event.key !== 'rdweb.colorMode' && event.key !== null) return
    colorMode.value = parseColorMode(event.newValue)
    applyTheme()
  })
  applyTheme()
  setLocale(locale.value)
  return { colorMode, systemDark, locale, timeZone, setColorMode, setLocale, setTimeZone }
})
