import { defineConfig } from '@playwright/test'
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
// 官方登入suite分開執行，普通認證矩陣不能假報此測試已完成。
export default defineConfig({
  testDir: './e2e-real',
  testMatch: 'console-login.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:18080',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
  workers: 1,
  retries: 0,
  timeout: 120000,
})
