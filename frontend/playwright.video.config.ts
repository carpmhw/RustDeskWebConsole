import { defineConfig } from '@playwright/test'
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
const channel = process.env.RDWEB_VIDEO_CHANNEL ?? 'chromium'
if (!['chromium', 'msedge', 'chrome'].includes(channel))
  throw new Error('Unsupported video channel')
// 正式影像suite與登入基礎suite分開，不混算案例數或保存敏感影像。
export default defineConfig({
  testDir: './e2e-real',
  testMatch: 'console-video.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 120000,
  use: {
    channel: channel === 'chromium' ? undefined : channel,
    baseURL: 'http://127.0.0.1:18080',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
})
