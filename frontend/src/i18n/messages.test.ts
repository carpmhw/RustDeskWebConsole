import { expect, it } from 'vitest'
import { messages } from './messages'
import { readLocale } from './index'
import { formatTimestamp } from '../utils/dateTime'

// 匿名外觀入口與收合導覽必須在兩語系可辨識，不能留下未翻譯的key。
it('provides appearance and navigation controls in both locales', () => {
  expect(messages['zh-TW']).toMatchObject({ appearance: '外觀與語言', navigation: '導覽' })
  expect(messages.en).toMatchObject({
    appearance: 'Appearance and language',
    navigation: 'Navigation',
  })
})

// 工作入口須有一致的兩語系區段名稱，不能把未翻譯key當總覽標題。
it('provides workspace navigation labels in both locales', () => {
  expect(messages['zh-TW']).toMatchObject({ workspace: '工作區' })
  expect(messages.en).toMatchObject({ workspace: 'Workspace' })
})

// 專注模式必須同時提供可辨識的退出文案，不混用全螢幕或連線成功。
it('provides console focus entry and exit labels in both locales', () => {
  expect(messages['zh-TW'].consoleUI).toMatchObject({
    focusMode: '專注模式',
    exitFocusMode: '離開專注',
    displayControls: '顯示',
    textControls: '文字交換',
    connectionControls: '連線操作',
  })
  expect(messages.en.consoleUI).toMatchObject({
    focusMode: 'Focus mode',
    exitFocusMode: 'Exit focus mode',
    displayControls: 'Display',
    textControls: 'Text exchange',
    connectionControls: 'Connection',
  })
})

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
