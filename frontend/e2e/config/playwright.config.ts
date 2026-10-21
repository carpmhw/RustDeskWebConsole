import { defineConfig } from '@playwright/test'

// Playwright新版的AI錯誤頁面快照即使trace關閉也會擷取DOM；禁止保存認證畫面。
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

// 測試由 Docker Compose 提供的真實 nginx 與 API，不以 mock 替代代理行為。
export default defineConfig({
  testDir: '../management',
  outputDir: '../../test-results',
  use: {
    baseURL: 'http://127.0.0.1:18080',
    timezoneId: 'Pacific/Honolulu',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
  workers: 1,
  retries: 0,
  timeout: 120000,
})
