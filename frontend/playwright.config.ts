import { defineConfig } from '@playwright/test'

// 測試由 Docker Compose 提供的真實 nginx 與 API，不以 mock 替代代理行為。
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:18080', timezoneId: 'Pacific/Honolulu' },
  workers: 1,
  retries: 0,
})
