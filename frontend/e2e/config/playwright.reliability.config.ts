import { defineConfig } from '@playwright/test'
import { assertReliabilityScope } from '../scripts/reconnect-reliability-scope.mjs'
import { inputPlatforms, readWindowsRuntime } from '../real/windows-runtime'

assertReliabilityScope(process.env)
const platforms = inputPlatforms()
const platform = process.env.RDWEB_RELIABILITY_PLATFORM
// scope已限定單一平台；再驗alias與明確runtime，避免Windows在缺憑證時假裝可列案。
if (platform === undefined || platforms.length !== 1 || platforms[0] !== platform)
  throw new Error('reliability_scope_unavailable')
if (platform === 'windows') readWindowsRuntime()
const channels = (
  process.env.RDWEB_INPUT_CHANNELS ??
  process.env.RDWEB_INPUT_CHANNEL ??
  'chromium'
).split(',')
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
// 單一平台固定50次序列run；timeout只涵蓋50個60秒attempt與整合收尾。
export default defineConfig({
  testDir: '../real',
  outputDir: '../../test-results',
  testMatch: 'console-reliability.spec.ts',
  workers: 1,
  retries: 0,
  maxFailures: 1,
  timeout: 50 * 73000 + 120000,
  use: {
    baseURL: 'http://127.0.0.1:18080',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
  },
  projects: channels.map(
    // 只跑本輪已驗channel；未安裝的requested channel由Playwright明確失敗，不自動下載。
    (channel) => ({
      name: channel,
      use: { browserName: 'chromium' as const, ...(channel === 'chromium' ? {} : { channel }) },
    }),
  ),
})
