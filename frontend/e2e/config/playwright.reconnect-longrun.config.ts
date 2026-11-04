import { defineConfig } from '@playwright/test'
import { assertLongrunScope } from '../scripts/reconnect-longrun-scope.mjs'
assertLongrunScope(process.env)
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
// 固定四長觀察案獨立註冊，不混基本矩陣／安全案例。
export default defineConfig({
  testDir: '../real',
  outputDir: '../../test-results',
  testMatch: 'console-reconnect-longrun.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 240000,
  use: {
    baseURL: 'http://127.0.0.1:18080',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
