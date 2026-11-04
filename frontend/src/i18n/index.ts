import { createI18n } from 'vue-i18n'
import { messages } from './messages'

export type Locale = 'zh-TW' | 'en'
// 語言偏好只接受兩個已提供完整訊息的 locale。
export function readLocale(storage: Pick<Storage, 'getItem'>): Locale {
  try {
    return storage.getItem('rdweb.locale') === 'en' ? 'en' : 'zh-TW'
  } catch {
    return 'zh-TW'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-TW',
  fallbackLocale: 'zh-TW',
  messages,
})
