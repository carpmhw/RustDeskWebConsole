export const DEFAULT_TIME_ZONE = 'Asia/Taipei'
const PREFERENCE_KEY = 'rdweb.displayTimeZone'

// 加入目前的合法時區別名，避免 Intl 可用但未列舉的偏好在下拉選單中消失。
export function displayTimeZones(current: string): string[] {
  const selected = isValidTimeZone(current) ? current : DEFAULT_TIME_ZONE
  return [...new Set([selected, 'UTC', DEFAULT_TIME_ZONE, ...Intl.supportedValuesOf('timeZone')])]
}

// 驗證瀏覽器具有該 IANA 時區資料，不以宿主時區猜測不合法的值。
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('zh-TW', { timeZone: zone }).format(0)
    return true
  } catch {
    return false
  }
}

// API 字串必須明確帶 UTC／offset，統一以選定時區及二十四小時制顯示。
export function formatTimestamp(value: string | null, zone = DEFAULT_TIME_ZONE): string {
  if (!value || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .replace(/\s+/g, ' ')
}

// 讀取個人偏好；隱私模式禁用儲存或偏好損壞時仍可使用頁面。
export function readTimeZone(
  storage: Pick<Storage, 'getItem'>,
  fallback = DEFAULT_TIME_ZONE,
): string {
  const validFallback = isValidTimeZone(fallback) ? fallback : DEFAULT_TIME_ZONE
  try {
    const selected = storage.getItem(PREFERENCE_KEY)
    return selected && isValidTimeZone(selected) ? selected : validFallback
  } catch {
    return validFallback
  }
}

// 只保存非敏感時區偏好；儲存不可用時本次頁面仍保留選擇。
export function saveTimeZone(storage: Pick<Storage, 'setItem'>, zone: string): void {
  if (!isValidTimeZone(zone)) throw new Error('時區不合法')
  try {
    storage.setItem(PREFERENCE_KEY, zone)
  } catch {
    // 不因瀏覽器拒絕 localStorage 而中斷頁面。
  }
}
