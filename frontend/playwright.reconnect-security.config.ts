import { defineConfig } from '@playwright/test'
import { inputPlatforms } from './e2e-real/windows-runtime'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
const platforms = inputPlatforms()
if (platforms.length !== 1 || platforms[0] !== 'linux')
  throw new Error('Invalid reconnect security platform')
const channels = (
  process.env.RDWEB_INPUT_CHANNELS ??
  process.env.RDWEB_INPUT_CHANNEL ??
  'chromium'
).split(',')
if (
  new Set(channels).size !== channels.length ||
  channels.some(
    /* 不用別的browser冒充requested channel。 */ (value) =>
      !['chromium', 'msedge', 'chrome'].includes(value),
  )
)
  throw new Error('Invalid reconnect channel')

// 安全五案獨立，不與功能／24或48基本重連案混算。
export default defineConfig({
  testDir: './e2e-real',
  testMatch: 'console-reconnect-security.spec.ts',
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
  projects: channels.map(
    /* requested channel沒有安裝就launch失敗。 */ (channel) => ({
      name: channel,
      use: { browserName: 'chromium' as const, ...(channel === 'chromium' ? {} : { channel }) },
    }),
  ),
})
