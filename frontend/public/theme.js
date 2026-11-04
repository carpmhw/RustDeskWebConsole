// 在 Vue 與 stylesheet 呈現前套用主題，避免首屏錯色與 CSP inline script。
;(function initializeTheme() {
  let mode = 'system'
  try {
    const value = localStorage.getItem('rdweb.colorMode')
    if (value === 'light' || value === 'dark') mode = value
  } catch {
    /* 儲存被封鎖時跟隨系統。 */
  }
  document.documentElement.dataset.theme =
    mode === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode
})()
