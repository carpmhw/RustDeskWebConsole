import { defineConfig } from '@playwright/test'
import { assertIngressScope } from '../tools/reconnect-ingress-scope.mjs'
assertIngressScope(process.env)
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
// 真ingress兩案獨立註冊，collection不建立任何資源。
export default defineConfig({
  testDir: './e2e-real',
  testMatch: 'console-reconnect-ingress.spec.ts',
  workers: 1,
  retries: 0,
  maxFailures: 1,
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
