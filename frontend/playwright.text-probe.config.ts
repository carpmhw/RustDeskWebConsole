import { defineConfig } from '@playwright/test'
import { readTextProbeRuntime } from './e2e-real/text-probe-runtime'
import { readWindowsRuntime } from './e2e-real/windows-runtime'
import { assertTextProbeAvailable } from './e2e-real/text-probe-control'
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
readTextProbeRuntime()
readWindowsRuntime()
assertTextProbeAvailable()
// 單次TCPdiagnostic不列原完整oracle，不保存敏感artifact或重試。
export default defineConfig({
  testDir: './e2e-real',
  testMatch: 'console-text-probe.spec.ts',
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
