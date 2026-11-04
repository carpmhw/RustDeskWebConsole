import type { BrowserContext, Page, Worker } from '@playwright/test'

// E2E 專用：產品 Worker 的 __rdwebSocketCloseObserver 只回原生整數 close code。
// Worker 關閉後可能立即被 Main 終止而無法再 evaluate，故以同源 BroadcastChannel 回送頁面。
const CHANNEL = 'rdweb-e2e-close-code'
const LIMIT = 32

declare global {
  interface Window {
    __rdwebCloseCodes?: number[]
  }
}

// 在 Worker 內安裝 observer；只送 { code }，不含 reason、URL 或其他欄位。
async function installWorkerObserver(worker: Worker): Promise<void> {
  try {
    await worker.evaluate((name) => {
      const scope = self as unknown as {
        __rdwebSocketCloseObserver?: { record(code: number): void }
      }
      const channel = new BroadcastChannel(name)
      scope.__rdwebSocketCloseObserver = {
        // 只轉送整數 code；收集器上限由頁面端控制。
        record(code: number) {
          channel.postMessage({ code })
        },
      }
    }, CHANNEL)
  } catch {
    /* Worker 已結束時無法安裝，交由斷言以缺紀錄失敗，不猜測數值。 */
  }
}

// 為 context 內所有現有與之後的頁面掛上頁面端接收器，並在每個新 Worker 安裝 observer。
export async function installCloseCodeDiagnostics(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ name, limit }) => {
      if (window.__rdwebCloseCodes) return
      const codes: number[] = []
      Object.defineProperty(window, '__rdwebCloseCodes', { value: codes })
      const channel = new BroadcastChannel(name)
      // 只接受有界整數 code，其他形狀一律忽略。
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const code = (event.data as { code?: unknown } | null)?.code
        if (typeof code === 'number' && Number.isInteger(code) && codes.length < limit)
          codes.push(code)
      }
    },
    { name: CHANNEL, limit: LIMIT },
  )
  // 每個頁面的新 Worker 都安裝 observer；重連會建立新 Worker。
  const watch = (page: Page) => page.on('worker', (worker) => void installWorkerObserver(worker))
  for (const page of context.pages()) watch(page)
  context.on('page', watch)
}

// 讀取 console 頁目前收到的 close code 副本。
export async function closeCodes(page: Page): Promise<number[]> {
  return page.evaluate(() => [...(window.__rdwebCloseCodes ?? [])])
}
