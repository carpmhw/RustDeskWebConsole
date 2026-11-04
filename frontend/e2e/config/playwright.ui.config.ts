import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

// 僅提供本輪自有的loopback公開fixture，與真API／認證測試環境分開。
export default defineConfig({
  testDir: '../ui',
  outputDir: '../../test-results',
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:18083',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
  webServer: {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    command:
      'node node_modules/vite/bin/vite.js preview --config e2e/config/vite.ui.config.ts --host 127.0.0.1 --port 18083 --strictPort',
    url: 'http://127.0.0.1:18083/e2e/ui/index.html',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
