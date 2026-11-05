import { defineConfig } from '@playwright/test'
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
// M4 正式部署驗收只由 test-m4-deploy.sh 執行；經外層 HTTPS nginx（runtime 自簽憑證）存取。
export default defineConfig({
  testDir: '../real',
  outputDir: '../../test-results',
  testMatch: 'deploy.spec.ts',
  use: {
    baseURL: process.env.RDWEB_E2E_ORIGIN ?? 'https://127.0.0.1:18443',
    ignoreHTTPSErrors: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
  workers: 1,
  retries: 0,
  timeout: 240000,
})
