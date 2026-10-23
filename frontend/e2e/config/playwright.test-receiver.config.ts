import { defineConfig } from '@playwright/test'
import { readReceiverCaseEnvironment } from '../real/test-receiver-control'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
// 只驗既有saved target與本輪private root；缺任何runtime即在開頁前拒絕。
readReceiverCaseEnvironment()

// 單案不啟stack／不建target；所有安全artifact保持off。
export default defineConfig({
  testDir: '../real',
  outputDir: '../../test-results',
  testMatch: 'console-test-receiver.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180000,
  use: {
    baseURL: 'http://127.0.0.1:18080',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
