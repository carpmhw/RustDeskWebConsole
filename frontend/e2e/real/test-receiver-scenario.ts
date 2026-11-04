import { expect, type Page } from '@playwright/test'
import {
  createReceiverCaseClient,
  openSavedReceiverConsole,
  readReceiverCaseEnvironment,
  receiverClientCode,
  receiverClientStageMarker,
  type ReceiverClientStage,
  type ReceiverCaseEnvironment,
} from './test-receiver-control'
import { observeConsole } from './fixtures'
import { assertCanvasEmptyAndWorkersClosed } from './input-fixtures'
import {
  runReceiverScenario,
  confirmReceiverSubmission,
  type ReceiverScenarioSnapshot,
} from '../receiver/scenario'
import { RECEIVER_VERSION } from '../receiver/rendezvous'
import { installInputDiagnostics } from './input-diagnostics'
import {
  attachEncodedInputDiagnostics,
  prepareEncodedInputWorker,
} from './encoded-input-diagnostics'
import { publicReceiverText, type ReceiverClientReport } from '../receiver/contract'
import type { ReceiverClientControl } from '../receiver/client-control'
import type { ReceiverPolicyGate } from './test-receiver-policy'

// 固定三動作的遠端座標；不沿用記事本幾何或官方client版本。
const CLICK = { x: 20, y: 30 } as const

// 真實頁面port只快取白名單布林；snapshot維持同步，等待期間再刷新。
class PlaywrightReceiverPort {
  #current: ReceiverScenarioSnapshot = {
    streaming: false,
    inputReady: false,
    identityVerified: false,
    scopeIntact: false,
    overflow: false,
    unavailable: true,
  }
  // 預期文字只存本輪adapter RAM，傳診斷scope後不讀回原文。
  constructor(
    private readonly page: Page,
    private readonly expected: string,
    private readonly onStage: (stage: ReceiverClientStage) => void,
    private readonly assertPolicy: () => void,
  ) {}

  // 使用Node單調時鐘，與瀏覽器內clock分開。
  now(): number {
    return performance.now()
  }

  // 真影像ready及peer summary存在後才允許固定輸入。
  async ready(): Promise<void> {
    this.onStage('console_ready')
    this.onStage('ready_policy')
    this.assertPolicy()
    await expect(this.page.getByTestId('console-auto-reconnect')).not.toBeChecked()
    this.onStage('ready_streaming')
    await expect(this.page.getByTestId('console-streaming')).toBeVisible({ timeout: 45000 })
    this.onStage('ready_peer')
    await expect(this.page.getByTestId('console-verified')).toBeVisible({ timeout: 45000 })
    this.onStage('ready_canvas')
    await this.page.waitForFunction(
      /* 只掃自有Canvas的alpha／RGB，不輸出pixels或hash。 */ () => {
        try {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="console-canvas"]')
          if (!canvas || canvas.width < 1 || canvas.height < 1) return false
          const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
          return !!data && data.some((value) => value !== 0)
        } catch {
          return false
        }
      },
      undefined,
      { timeout: 45000 },
    )
    this.onStage('ready_snapshot')
    await this.refresh()
    if (!this.#current.streaming || !this.#current.identityVerified)
      throw new Error('receiver_unavailable')
    this.onStage('ready_diagnostics')
    await prepareEncodedInputWorker(this.page)
    await this.page.evaluate(
      /* 只有既有text-only／五鍵profile，不載原文字logger或clipboard觀察。 */ (text) => {
        const main = window.__rdwebInputDiagnostics,
          encoded = window.__rdwebEncodedInputDiagnostics
        if (!main || !encoded) throw new Error('receiver_unavailable')
        main.beginTextOnly(text)
        encoded.beginInputOnly(text)
      },
      this.expected,
    )
  }

  // 真Canvas點擊也證明本輪鍵盤scope可聚焦；固定座標不讀遠端文字或pixel。
  async clickRemote(): Promise<void> {
    this.onStage('input')
    this.assertPolicy()
    const surface = this.page.getByTestId('console-canvas')
    await expect(surface).toBeVisible()
    const position = await surface.evaluate(
      /* 遠端320×240座標只轉為本機CSS位置，不取畫面內容。 */ (element, point) => {
        const canvas = element as HTMLCanvasElement
        const rect = canvas.getBoundingClientRect()
        if (
          point.x < 0 ||
          point.y < 0 ||
          point.x >= canvas.width ||
          point.y >= canvas.height ||
          rect.width <= 0 ||
          rect.height <= 0
        )
          throw new Error('receiver_unavailable')
        return {
          x: ((point.x + 0.5) * rect.width) / canvas.width,
          y: ((point.y + 0.5) * rect.height) / canvas.height,
        }
      },
      CLICK,
    )
    this.assertPolicy()
    await surface.click({ position })
    await expect(this.page.getByTestId('console-input-active')).toBeVisible({ timeout: 5000 })
    await this.refresh()
  }

  // 只送一次全選，不追加第二個Ctrl+A。
  async selectAll(): Promise<void> {
    this.assertPolicy()
    await this.page.keyboard.press('Control+a')
    await this.refresh()
  }

  // 只注入本輪RAM產生的公開文字，不從剪貼簿或檔案讀取。
  async insertText(text: string): Promise<void> {
    this.assertPolicy()
    await this.page.keyboard.insertText(text)
    await this.refresh()
  }

  // 被動等待後刷新一次；每次最多100ms，不重送輸入。
  async wait(ms: number): Promise<void> {
    this.onStage('observation')
    await new Promise(/* 自有短timer，只作被動取樣。 */ (resolve) => setTimeout(resolve, ms))
    await this.refresh()
  }

  // 本地窗結束後只等receiver自行斷線；不送額外操作，也不重設整案deadline。
  async waitForPeerEnd(deadline: number): Promise<void> {
    this.onStage('peer_end')
    this.assertPolicy()
    const left = deadline - this.now()
    if (!Number.isFinite(left) || left <= 0) throw new Error('receiver_unavailable')
    await this.page.waitForFunction(
      /* 只等自有Console退出streaming，正常peer-close證據仍需receiver result關聯。 */ () =>
        !document.querySelector('[data-testid="console-streaming"]'),
      undefined,
      { timeout: left },
    )
    this.assertPolicy()
  }

  // 觀察窗結束先取安全摘要，再等receiver收尾；不取文字／hash／timeline。
  async submissionEvidence(): Promise<boolean> {
    this.assertPolicy()
    const capture = await this.page.evaluate(
      /* 診斷scope只回既有布林，不回Worker encoded payload。 */ async () => {
        const main = window.__rdwebInputDiagnostics,
          encoded = window.__rdwebEncodedInputDiagnostics
        if (!main || !encoded) throw new Error('receiver_unavailable')
        return { main: main.textOnlySnapshot(), encoded: await encoded.takeInputOnly() }
      },
    )
    this.assertPolicy()
    return confirmReceiverSubmission(capture.main, capture.encoded)
  }

  // 回傳最近一次白名單快照，呼叫端不能取得DOM或原始事件。
  snapshot(): ReceiverScenarioSnapshot {
    return { ...this.#current }
  }

  // 只讀五鍵安全布林及畫面存在性；不取原文、peer值或exception。
  private async refresh(): Promise<void> {
    try {
      this.assertPolicy()
      this.#current = await this.page.evaluate((toolVersion) => {
        const streaming = !!document.querySelector('[data-testid="console-streaming"]')
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="console-canvas"]')
        const summary = document
          .querySelector('[data-testid="console-verified"]')
          ?.textContent?.trim()
        const separator = summary?.indexOf(' · ') ?? -1
        const platform = separator > 0 ? summary!.slice(0, separator) : ''
        const version = separator > 0 ? summary!.slice(separator + 3) : ''
        const identityVerified = platform === 'Windows' && version === toolVersion
        const alert = !!document.querySelector('[role="alert"]')
        const operation = !!document.querySelector('[data-testid="console-operation-error"]')
        let canvasReady = false,
          painted = false
        try {
          if (canvas && canvas.width > 0 && canvas.height > 0) {
            canvasReady = true
            const data = canvas
              .getContext('2d')
              ?.getImageData(0, 0, canvas.width, canvas.height).data
            painted = !!data && data.some((value) => value !== 0)
          }
        } catch {
          canvasReady = false
        }
        const streamingPresented = streaming && painted
        return {
          streaming: streamingPresented,
          inputReady: streamingPresented && canvasReady && identityVerified,
          identityVerified,
          scopeIntact:
            streamingPresented &&
            canvasReady &&
            identityVerified &&
            !alert &&
            !operation &&
            document.visibilityState === 'visible',
          overflow: false,
          unavailable: !streamingPresented || !identityVerified || alert || operation,
        }
      }, RECEIVER_VERSION)
      this.assertPolicy()
    } catch {
      this.#current = {
        streaming: false,
        inputReady: false,
        identityVerified: false,
        scopeIntact: false,
        overflow: false,
        unavailable: true,
      }
    }
  }
}

// 空報告在setup失敗時仍可安全收尾，不把任何未驗項目預設成功。
function initialReport(runtime: ReceiverClientControl['binding']): ReceiverClientReport {
  return {
    schemaVersion: 1,
    purpose: runtime.purpose,
    runId: runtime.runId,
    requestId: runtime.requestId,
    identityVerified: false,
    videoPresented: false,
    submitted: false,
    observationComplete: false,
    scopeIntact: false,
    resourcesClosed: false,
    unavailable: true,
  }
}

// 單案只擁有Browser context內自己的console；不啟stack、不建target、不重連。
export async function executeReceiverCase(page: Page): Promise<void> {
  const env: ReceiverCaseEnvironment = readReceiverCaseEnvironment()
  const resources = observeConsole(page.context())
  let client: ReceiverClientControl | undefined,
    consolePage: Page | undefined,
    started = false,
    cleanupSucceeded = true
  let report: ReceiverClientReport | undefined
  let policy: ReceiverPolicyGate | undefined
  let stage: ReceiverClientStage = 'setup',
    failureStage: ReceiverClientStage | undefined
  // 階段只留本案RAM，最後才輸出一次白名單marker，不記載每次wait或頁面內容。
  const onStage = (value: ReceiverClientStage): void => {
    stage = value
  }
  try {
    client = createReceiverCaseClient(env)
    report = initialReport(client.binding)
    client.start()
    started = true
    await page.context().addInitScript(installInputDiagnostics)
    await attachEncodedInputDiagnostics(page.context())
    consolePage = await openSavedReceiverConsole(
      page,
      env,
      client.binding,
      onStage,
      /* 在點連線前取得owner，準備失敗也不會遺失自有popup。 */ (gate) => {
        policy = gate
      },
    )
    const result = await runReceiverScenario(
      new PlaywrightReceiverPort(
        consolePage,
        publicReceiverText(client.binding),
        onStage,
        /* 缺owner或晚到違規都不得繼續送輸入。 */ () => {
          if (!policy) throw new Error('receiver_unavailable')
          policy.assertSingleAttempt()
        },
      ),
      publicReceiverText(client.binding),
    )
    policy?.assertSingleAttempt()
    report = {
      ...report,
      identityVerified: result.identityVerified,
      videoPresented: result.videoPresented,
      submitted: result.submitted,
      observationComplete: result.observationComplete,
      scopeIntact: result.scopeIntact,
      unavailable: result.unavailable,
    }
    if (result.unavailable) failureStage = stage
  } catch {
    failureStage = stage
    if (report) report.unavailable = true
  } finally {
    onStage('cleanup')
    policy?.beginCleanup()
    consolePage ??= policy?.page
    if (consolePage && !consolePage.isClosed()) {
      try {
        await consolePage.getByTestId('console-end').click({ timeout: 2000 })
        await assertCanvasEmptyAndWorkersClosed(consolePage)
      } catch {
        cleanupSucceeded = false
      }
      try {
        await consolePage.close()
      } catch {
        cleanupSucceeded = false
      }
    } else if (!consolePage) cleanupSucceeded = false
    if (policy) {
      try {
        if (!(await policy.dispose())) cleanupSucceeded = false
      } catch {
        cleanupSucceeded = false
      }
      if (report && !policy.valid()) {
        report.scopeIntact = false
        report.unavailable = true
      }
    }
    if (report) {
      // 全程observer包含gate解除與關頁交錯，正常收尾不能掩蓋額外attempt。
      if (resources.opened > 1 || resources.sockets > 1) {
        report.scopeIntact = false
        report.unavailable = true
      }
      report.resourcesClosed =
        cleanupSucceeded && resources.opened === resources.closed && resources.wrongPrefix === 0
      report.unavailable = report.unavailable || !report.resourcesClosed
      if (client && started) {
        try {
          client.finish(report)
        } catch {
          console.log(receiverClientStageMarker(failureStage ?? 'cleanup'))
          throw new Error('receiver_unavailable')
        }
      }
    }
  }
  if (!report || !client) {
    console.log(receiverClientStageMarker(failureStage ?? stage))
    throw new Error('receiver_unavailable')
  }
  const code = receiverClientCode(report)
  console.log(
    receiverClientStageMarker(
      code === 'receiver_client_completed' ? 'complete' : (failureStage ?? stage),
    ),
  )
  console.log(code)
  if (code !== 'receiver_client_completed') throw new Error(code)
}
