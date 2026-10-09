import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n, readLocale, type Locale } from '../i18n'
import { readColorMode, resolveTheme, saveColorMode, type ColorMode } from '../utils/theme'
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
  // 實際主題與手動／系統選擇分開，系統事件不覆寫手動偏好。
  function applyTheme(): void {
    document.documentElement.dataset.theme = resolveTheme(colorMode.value, media.matches)
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
  applyTheme()
  setLocale(locale.value)
  return { colorMode, locale, timeZone, setColorMode, setLocale, setTimeZone }
})
