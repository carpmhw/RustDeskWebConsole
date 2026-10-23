import { defineConfig } from '@playwright/test'
import { readHostInputOnlyObservation } from '../real/host-observation-control'
import { readWindowsRuntime } from '../real/windows-runtime'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
if (!readHostInputOnlyObservation()) throw new Error('host_input_only_unavailable')
readWindowsRuntime()

// 只排獨立診斷單案；安全artifact保持全關，不恢復舊HR或重連。
export default defineConfig({
  testDir: '../real',
  outputDir: '../../test-results',
  testMatch: 'console-host-input-only.spec.ts',
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
