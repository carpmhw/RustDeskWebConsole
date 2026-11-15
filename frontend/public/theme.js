// 在 Vue 與 stylesheet 呈現前套用主題，避免首屏錯色與 CSP inline script。
;(function initializeTheme() {
  let mode = 'system'
  try {
    const value = localStorage.getItem('rdweb.colorMode')
    if (value === 'light' || value === 'dark') mode = value
  } catch {
    /* 儲存被封鎖時跟隨系統。 */
  }
  const theme =
    mode === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode
  document.documentElement.dataset.theme = theme
  // 樣式表到達前由 meta 決定畫布與原生控制項配色，需與解析後主題一致。
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme)
})()
