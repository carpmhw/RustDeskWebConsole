import type { Page } from '@playwright/test'
import { resetStack } from '../management/helpers/fixtures'
import { openOfficialConsole, observeConsole } from './fixtures'
import {
  clickRemote,
  prepareInputTarget,
  waitForInputVideo,
  assertCanvasEmptyAndWorkersClosed,
  type InputFixture,
} from './input-fixtures'
import { installInputDiagnostics, type TextOnlyEvidence } from './input-diagnostics'
import {
  attachEncodedInputDiagnostics,
  prepareEncodedInputWorker,
} from './encoded-input-diagnostics'
import {
  createHostInputOnlyObservation,
  readHostInputOnlyObservation,
  type HostInputOnlyController,
} from './host-observation-control'
import { waitHostObservationReady } from './host-observation-setup'
import { inputOnlyClientCode } from './host-input-only'
import type { InputOnlyClientReport, InputOnlyObservation } from './host-observation-schema'

// 固定5秒被動期只讀Main布林；不等待ACK／host exact，也不重設clock。
export async function waitInputOnlyObservation(
  read: () => Promise<TextOnlyEvidence>,
  now: () => number = /* 同一Node monotonic clock。 */ () => performance.now(),
  sleep: (ms: number) => Promise<void> = /* 只排程被動取樣。 */ (ms) =>
    new Promise(/* 自有timer。 */ (resolve) => setTimeout(resolve, ms)),
): Promise<{ main: TextOnlyEvidence; observation: InputOnlyObservation }> {
  try {
    const start = now()
    let last = start
    if (!Number.isFinite(start)) throw new Error()
    // 每個await前後檢查原clock，不用UTC或host時間補值。
    function elapsed(): number {
      const value = now()
      if (!Number.isFinite(value) || value < last || value - start > 180000) throw new Error()
      last = value
      return value - start
    }
    for (;;) {
      elapsed()
      const value = await read()
      const fields = [
        'prefixSubmitted',
        'prefixAccepted',
        'postTextInput',
        'clipboardObserved',
        'scopeInterrupted',
        'overflow',
      ] as const
      if (
        !value ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
        Reflect.ownKeys(value).length !== fields.length ||
        fields.some(
          /* 不執行getter或把truthy當boolean。 */ (key) => {
            const descriptor = Object.getOwnPropertyDescriptor(value, key)
            return (
              !descriptor ||
              !Object.hasOwn(descriptor, 'value') ||
              typeof descriptor.value !== 'boolean'
            )
          },
        )
      )
        throw new Error()
      const main = { ...value },
        duration = elapsed()
      if (main.postTextInput || main.clipboardObserved || main.scopeInterrupted || main.overflow)
        throw new Error()
      if (duration >= 5000)
        return {
          main,
          observation: { budgetMs: 5000, elapsedMs: Math.floor(duration), completed: true },
        }
      await sleep(Math.min(100, 5000 - duration))
    }
  } catch {
    throw new Error('input_only_observation_unavailable')
  }
}

// 只有原三動作；insertText返回即起被動窗，不再送遠端輸入或clipboard操作。
export async function runHostInputOnlyScenario(
  page: Page,
  fixture: InputFixture,
  expected: string,
): Promise<{ main: TextOnlyEvidence; observation: InputOnlyObservation }> {
  await clickRemote(page, fixture.editor.x + 20, fixture.editor.y + 30)
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(expected)
  return waitInputOnlyObservation(
    /* 只取既有六布林與streaming存在性。 */ () =>
      page.evaluate(
        /* 不讀DOM文字或clipboard。 */ () => {
          const port = window.__rdwebInputDiagnostics
          if (!port) throw new Error('input_only_observation_unavailable')
          const value = port.textOnlySnapshot()
          if (!document.querySelector('[data-testid="console-streaming"]'))
            value.scopeInterrupted = true
          return value
        },
      ),
  )
}

// 單案生命週期集中於此；所有失敗遮罩、安全結果於自有資源收尾後才保存。
export async function executeHostInputOnlyCase(page: Page): Promise<void> {
  let host: HostInputOnlyController | undefined,
    fixture: InputFixture | undefined,
    consolePage: Page | undefined
  let started = false,
    endAttempted = false,
    cleanupSucceeded = true,
    phase: 'setup' | 'input' | 'observation' | 'cleanup' = 'setup'
  const resources = observeConsole(page.context())
  const report: InputOnlyClientReport = {
    code: 'input_only_setup_failed',
    main: {
      prefixSubmitted: false,
      prefixAccepted: false,
      postTextInput: false,
      clipboardObserved: false,
      scopeInterrupted: false,
      overflow: false,
    },
    encoded: {
      observed: false,
      textExact: false,
      textSingle: false,
      initialSelectComplete: false,
      sequenceComplete: false,
      sequenceInvalid: false,
      overflow: false,
      unavailable: true,
    },
    timeline: { clockDomain: 'browser_main', events: [], overflow: false, unavailable: true },
    observation: { budgetMs: 5000, elapsedMs: null, completed: false },
    resourcesClosed: false,
  }
  try {
    if (!readHostInputOnlyObservation()) throw new Error()
    host = createHostInputOnlyObservation()
    resetStack()
    fixture = await prepareInputTarget('windows', 'tcp')
    await page.context().addInitScript(installInputDiagnostics)
    await attachEncodedInputDiagnostics(page.context())
    consolePage = await openOfficialConsole(page, fixture)
    await waitForInputVideo(consolePage, fixture)
    await prepareEncodedInputWorker(consolePage)
    await consolePage.getByTestId('console-auto-reconnect').uncheck()
    host.start()
    started = true
    console.log('host_input_only_start_requested')
    await waitHostObservationReady(host)
    if (consolePage.isClosed()) throw new Error()
    phase = 'input'
    report.code = 'input_only_input_failed'
    await consolePage.evaluate(
      /* 三個begin只設定被動scope，不等診斷或產品ACK。 */ (expected) => {
        const main = window.__rdwebInputDiagnostics,
          encoded = window.__rdwebEncodedInputDiagnostics
        if (!main || !encoded) throw new Error('input_only_input_failed')
        main.beginTextOnly(expected)
        main.beginTimeline()
        encoded.beginInputOnly(expected)
      },
      host.expected,
    )
    try {
      const result = await runHostInputOnlyScenario(consolePage, fixture, host.expected)
      report.main = result.main
      report.observation = result.observation
    } catch (error) {
      if (error instanceof Error && error.message === 'input_only_observation_unavailable')
        phase = 'observation'
      throw error
    }
    phase = 'observation'
    report.code = 'input_only_observation_unavailable'
    const capture = await consolePage.evaluate(
      /* 一次take，永不取文字。 */ async () => {
        const encoded = window.__rdwebEncodedInputDiagnostics,
          main = window.__rdwebInputDiagnostics
        if (!encoded || !main) throw new Error('input_only_observation_unavailable')
        return { encoded: await encoded.takeInputOnly(), timeline: main.takeTimeline() }
      },
    )
    report.encoded = capture.encoded
    report.timeline = capture.timeline
    report.code = 'input_only_completed'
    phase = 'cleanup'
    endAttempted = true
    await consolePage.getByTestId('console-end').click({ timeout: 2000 })
    await assertCanvasEmptyAndWorkersClosed(consolePage)
  } catch {
    report.code =
      phase === 'setup'
        ? 'input_only_setup_failed'
        : phase === 'input'
          ? 'input_only_input_failed'
          : phase === 'observation'
            ? 'input_only_observation_unavailable'
            : 'input_only_cleanup_failed'
    if (phase === 'cleanup') cleanupSucceeded = false
  } finally {
    if (consolePage && !consolePage.isClosed()) {
      try {
        await consolePage.evaluate(
          /* 只取消自有診斷，舊promise不得恢復本輪結果。 */ () =>
            window.__rdwebEncodedInputDiagnostics?.cancel(),
        )
      } catch {
        cleanupSucceeded = false
      }
      if (!endAttempted) {
        endAttempted = true
        try {
          await consolePage.getByTestId('console-end').click({ timeout: 2000 })
        } catch {
          cleanupSucceeded = false
        }
      }
      try {
        await consolePage.close()
      } catch {
        cleanupSucceeded = false
      }
    }
    try {
      await fixture?.context.dispose()
    } catch {
      cleanupSucceeded = false
    }
    report.resourcesClosed =
      cleanupSucceeded && resources.closed === resources.opened && resources.wrongPrefix === 0
    report.code = inputOnlyClientCode(report)
    if (host && started) {
      try {
        host.finish(report)
      } catch {
        throw new Error('input_only_observation_unavailable')
      }
    }
  }
  console.log(report.code)
  if (report.code !== 'input_only_completed') throw new Error(report.code)
}
