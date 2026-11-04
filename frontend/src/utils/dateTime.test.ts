import { expect, test } from 'vitest'
import { displayTimeZones, formatTimestamp, readTimeZone, saveTimeZone } from './dateTime'

// 相同 UTC 瞬間能依使用者選擇顯示台北跨日或 UTC，不受本機時區影響。
test('Taipei is default but UTC is selectable', () => {
  expect(formatTimestamp('2026-10-07T16:00:00Z')).toBe('2026/10/08 00:00:00')
  expect(formatTimestamp('2026-10-07T16:00:00Z', 'UTC')).toBe('2026/10/07 16:00:00')
})

// 紐約冬夏時間遵循 IANA 夏令時間規則。
test('selected zone applies daylight saving', () => {
  expect(formatTimestamp('2026-01-01T12:00:00Z', 'America/New_York')).toBe('2026/01/01 07:00:00')
  expect(formatTimestamp('2026-07-01T12:00:00Z', 'America/New_York')).toBe('2026/07/01 08:00:00')
})

// Intl 認可但未列入 supportedValuesOf 的合法別名也必須出現在下拉選單。
test.each(['Asia/Kolkata', 'Etc/UTC', 'US/Eastern'])(
  'selected alias remains selectable %s',
  (zone) => {
    expect(displayTimeZones(zone)).toContain(zone)
  },
)

// 缺值、非法時間與沒有 offset 的字串不能依本機時區猜測。
test.each([null, '', 'invalid', '2026-10-07T16:00:00'])('invalid timestamp %s', (value) => {
  expect(formatTimestamp(value)).toBe('—')
})

// 個人選擇保存到非敏感偏好，非法偏好則回到台北預設。
test('preference persists and invalid values fall back', () => {
  const entries = new Map<string, string>()
  // 使用真實 Map 保持保存與讀取的連動，不只斷言 mock 呼叫。
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }
  saveTimeZone(storage, 'UTC')
  expect(readTimeZone(storage)).toBe('UTC')
  entries.set('rdweb.displayTimeZone', 'Invalid/Zone')
  expect(readTimeZone(storage)).toBe('Asia/Taipei')
})
