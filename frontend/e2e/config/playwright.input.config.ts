import { defineConfig } from '@playwright/test'
import { inputPlatforms, readWindowsRuntime } from '../real/windows-runtime'
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
const platforms = inputPlatforms()
if (platforms.includes('windows')) readWindowsRuntime()
const channels = (
  process.env.RDWEB_INPUT_CHANNELS ??
  process.env.RDWEB_INPUT_CHANNEL ??
  'chromium'
).split(',')
if (
  new Set(channels).size !== channels.length ||
  channels.some(
    /* 白名單channel，requested缺安裝時launch失敗、不自行下載。 */ (value) =>
      !['chromium', 'msedge', 'chrome'].includes(value),
  )
)
  throw new Error('Invalid input channel')
// 明確platform／channel註冊真機測試，不保存文字／影像或自動snapshot。
export default defineConfig({
  testDir: '../real',
  outputDir: '../../test-results',
  testMatch: 'console-input.spec.ts',
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
  projects: channels.map(
    // Chromium與Edge／Chrome分列，不用Chromium冒充安裝版browser。
    (channel) => ({
      name: channel,
      use: { browserName: 'chromium' as const, ...(channel === 'chromium' ? {} : { channel }) },
    }),
  ),
})
