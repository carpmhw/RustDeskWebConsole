// 正規化掛載路徑，拒絕可造成跳脫或重複前綴的歧義字元。
export function normalizeBase(base: string): string {
  const value = base.trim().replace(/\/$/, '')
  if (value !== '' && !/^\/(?:[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+)*$/.test(value)) {
    throw new Error('掛載路徑不合法')
  }
  return value
}

// 讀取執行期設定，單元測試或非瀏覽器環境使用根路徑。
export function runtimeBase(): string {
  return normalizeBase(typeof window === 'undefined' ? '/' : (window.RDWEB_CONFIG?.basePath ?? '/'))
}

// 所有 HTTP 網址經由統一工具組合。
export function withBase(path: string, base = runtimeBase()): string {
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) {
    throw new Error('URL 必須是站台內相對路徑')
  }
  return `${normalizeBase(base)}/${path}`
}

// WebSocket 網址必須與頁面來源及掛載路徑相符。
export function buildWsUrl(
  path: string,
  origin = window.location.origin,
  base = runtimeBase(),
): string {
  const url = new URL(withBase(path, base), origin)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('來源必須使用 HTTP(S)')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
