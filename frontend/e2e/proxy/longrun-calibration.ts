import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import type { Terminal } from '../../src/rdweb/interaction-types'

interface CalibrationWindow extends Window {
  publicLongrunCalibration?: {
    // 固定失敗布林，不回原始例外。
    failed(): boolean
    // 只回固定code曾出現布林。
    sawConnectionFailure(): boolean
    // 固定邊界計數，不含資料值。
    summary(): Record<string, number>
    // 只派送公開typed cause。
    fail(cause: Terminal['cause']): void
    // 只派送固定fatal rate_limited。
    limited(): void
    // 只派送公開activity。
    active(): void
    // 卸載本輪元件。
    close(): void
  }
}
let bundle: Promise<string> | undefined

// 僅編譯記憶體bundle，不啟Vite server、不寫dist、不載正式登入／Worker。
async function compile(): Promise<string> {
  const ports = fileURLToPath(new URL('./longrun-calibration-ports.ts', import.meta.url))
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [
      {
        name: 'public-longrun-calibration',
        enforce: 'pre',
        // 僅Console.vue的四個注入入口可替換，其餘正式Host／Session模組不改寫。
        resolveId(source, importer) {
          const file = importer?.split('?', 1)[0]
          if (source === 'vue-i18n' && file?.endsWith('/src/components/ConsoleWorkspace.vue'))
            return ports
          if (
            file?.endsWith('/src/views/Console.vue') &&
            ['../stores/auth', '../rdweb/host', 'vue-router', 'vue-i18n'].includes(source)
          )
            return ports
        },
      },
      vue(),
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('./longrun-calibration-entry.ts', import.meta.url)),
        name: 'PublicLongrunCalibration',
        formats: ['iife'],
      },
    },
  })
  if (Array.isArray(output)) {
    const chunk = output[0]?.output.find(
      /* 只交付記憶體entry，不載附帶worker資產。 */ (item) => item.type === 'chunk' && item.isEntry,
    )
    if (chunk?.type === 'chunk') return chunk.code
  }
  throw new Error('public_calibration_build_failed')
}
// 只在隔離空頁面加公開bundle；fake browser clock不得傳入真runner。
export async function mountCalibration(page: Page): Promise<void> {
  bundle ??= compile()
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.evaluate(
    /* 公開空頁不得觸碰任何OS剪貼簿。 */ () => {
      Object.defineProperty(navigator, 'clipboard', {
        get: /* 公開校準嚴禁任何OS clipboard入口。 */ () => {
          throw new Error('public_clipboard_forbidden')
        },
      })
    },
  )
  await page.clock.install()
  await page.addScriptTag({ content: await bundle })
  await page.clock.runFor(1)
  const ready = await page.evaluate(
    /* 只讀固定fixture健康布林。 */ () => {
      const control = (window as CalibrationWindow).publicLongrunCalibration
      return !!control && !control.failed() && window.isSecureContext
    },
  )
  if (!ready) throw new Error('public_calibration_not_mounted')
}
// 獨立DOM oracle只提供安全布林，不回節點、文字或錯誤值。
export function calibrationSawError(page: Page): Promise<boolean> {
  return page.evaluate(
    /* 控制物件僅存在隔離公開頁面。 */ () =>
      (window as CalibrationWindow).publicLongrunCalibration?.sawConnectionFailure() === true,
  )
}
// 所有控制函數僅屬此公開fixture，不操作真頁面或外部服務。
export async function calibrationStep(
  page: Page,
  action: 'network' | 'fatal' | 'temporary' | 'rate-limited' | 'active' | 'close',
): Promise<void> {
  await page.evaluate(
    /* 所有分支僅限本公開bundle的固定控制。 */ (value) => {
      const control = (window as CalibrationWindow).publicLongrunCalibration
      if (!control && value === 'close') return
      if (!control) throw new Error('public_calibration_not_mounted')
      if (value === 'active') control.active()
      else if (value === 'close') control.close()
      else if (value === 'rate-limited') control.limited()
      else control.fail(value)
    },
    action,
  )
}
