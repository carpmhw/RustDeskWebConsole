import { defineConfig } from '@playwright/test'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

// 公開loopback探針不啟Vite／Docker、不載操作者runtime或認證。
export default defineConfig({
  testDir: '../proxy',
  outputDir: '../../test-results',
  testMatch: [
    'worker.spec.ts',
    'owner.spec.ts',
    'preparation.spec.ts',
    'longrun.spec.ts',
    'ingress.spec.ts',
  ],
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
})
