import { defineConfig } from '@playwright/test'
import { inputPlatforms, readWindowsRuntime } from './e2e-real/windows-runtime'

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
    // 與功能suite同一白名單；requested channel缺安裝不得以別的browser替代。
    (channel) => !['chromium', 'msedge', 'chrome'].includes(channel),
  )
)
  throw new Error('Invalid reconnect channel')

// 真重連獨立註冊，不與功能／50次混算；敏感artifact保持關閉。
export default defineConfig({
  testDir: './e2e-real',
  testMatch: 'console-reconnect.spec.ts',
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
    // channel分列結果，不以Chromium冒充安裝版Chrome或Edge。
    (channel) => ({
      name: channel,
      use: { browserName: 'chromium' as const, ...(channel === 'chromium' ? {} : { channel }) },
    }),
  ),
})
