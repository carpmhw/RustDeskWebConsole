import { defineConfig } from '@playwright/test'
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
const channels = (process.env.RDWEB_CODEC_CHANNELS ?? 'chromium').split(',')
if (channels.some((value) => !['chromium', 'msedge', 'chrome'].includes(value)))
  throw new Error('Invalid codec test channel')
// 公開native tests也關閉所有影像artifact，指定缺channel必須明確失敗。
export default defineConfig({
  testDir: './e2e-codecs',
  testMatch: 'codecs.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: { trace: 'off', screenshot: 'off', video: 'off', acceptDownloads: false },
  // 固定channel白名單，不以UA或mock支持替代native結果。
  projects: channels.map((value) => ({
    name: value,
    use: { browserName: 'chromium' as const, ...(value === 'chromium' ? {} : { channel: value }) },
  })),
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js build --config vite.codecs.config.ts && node ../tools/serve-codec-harness.mjs',
    url: 'http://127.0.0.1:18081/e2e-codecs/index.html',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
