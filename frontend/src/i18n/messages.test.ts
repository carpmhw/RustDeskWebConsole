import { expect, it } from 'vitest'
import { messages } from './messages'
import { readLocale } from './index'
import { formatTimestamp } from '../utils/dateTime'

// 已取得文字的fallback只重試本機寫入，不能誤稱再次接收或變更既有操作名稱。
it('keeps fallback copy labels distinct from receiving labels in both locales', () => {
  expect(messages['zh-TW'].consoleUI).toMatchObject({
    clipboardCopy: '接收遠端複製',
    clipboardFallbackCopy: '複製遠端文字',
  })
  expect(messages.en.consoleUI).toMatchObject({
    clipboardCopy: 'Receive remote copy',
    clipboardFallbackCopy: 'Copy remote text',
  })
})

// 兩種語言提供相同訊息鍵，避免切換後出現未翻譯的資安錯誤碼。
it('has matching message keys and safe locale preferences', () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages['zh-TW']).sort())
  expect(Object.keys(messages.en.errors).sort()).toEqual(
    Object.keys(messages['zh-TW'].errors).sort(),
  )
  expect(readLocale({ getItem: () => 'en' })).toBe('en')
  expect(readLocale({ getItem: () => 'invalid' })).toBe('zh-TW')
  expect(
    readLocale({
      getItem: () => {
        throw new Error('blocked')
      },
    }),
  ).toBe('zh-TW')
  expect(formatTimestamp('2026-10-07T16:00:00Z', 'Asia/Taipei', 'en')).toContain('00:00:00')
})
