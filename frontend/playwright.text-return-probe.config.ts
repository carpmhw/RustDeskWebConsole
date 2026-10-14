import { defineConfig } from '@playwright/test'
import { inputPlatforms, readWindowsRuntime } from './e2e-real/windows-runtime'
import { createClipboardTextLogger } from './e2e-real/clipboard-text-log'
import { readHostObservation } from './e2e-real/host-observation-control'
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
const platforms = inputPlatforms()
const channels = (
  process.env.RDWEB_INPUT_CHANNELS ??
  process.env.RDWEB_INPUT_CHANNEL ??
  'chromium'
).split(',')
if (
  platforms.length !== 1 ||
  platforms[0] !== 'windows' ||
  channels.length !== 1 ||
  channels[0] !== 'chromium' ||
  process.env.RDWEB_B3_BASES !== '/' ||
  process.env.RDWEB_B3_MODES !== 'preserve' ||
  process.env.RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG !== '1'
)
  throw new Error('Windows text return probe runtime unavailable')
readWindowsRuntime()
readHostObservation()
if (!createClipboardTextLogger(process.env))
  throw new Error('Windows text return probe logger unavailable')
// 固定單一native TCP回傳case且Artifact／AI page snapshot全關。
export default defineConfig({
  testDir: './e2e-real',
  testMatch: 'console-text-return-probe.spec.ts',
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
