import { randomUUID } from 'node:crypto'
import { createHostObservation, readHostObservation } from './host-observation-control'
import { waitHostObservationReady, hostClientCode } from './host-observation-setup'
import type { HostMainTimeline } from './host-observation-schema'
import { expect, test, type Page } from '@playwright/test'
import { resetStack } from '../e2e/helpers/fixtures'
import { openOfficialConsole, observeConsole } from './fixtures'
import {
  assertCanvasEmptyAndWorkersClosed,
  assertPublicClipboard,
  clickRemote,
  prepareInputTarget,
  startReceiving,
  waitForInputVideo,
  type InputFixture,
} from './input-fixtures'
import { createClipboardTextLogger, type ClipboardTextRecord } from './clipboard-text-log'
import { installInputDiagnostics, installKeyboardEmissionDiagnostics } from './input-diagnostics'
import { textReturnCleanupCode, textReturnLogCode } from './text-return-cleanup'
import {
  attachEncodedInputDiagnostics,
  prepareEncodedInputWorker,
} from './encoded-input-diagnostics'
import {
  prepareClipboardTransferWorker,
  type ClipboardTransferDiagnostics,
} from './clipboard-transfer-diagnostics'
const textLogger = createClipboardTextLogger(process.env)
if (!textLogger) throw new Error('clipboard_text_log_unavailable')
// 只重建本runner擁有的Console fixture，保留正式API／Vault與quota。
test.beforeEach(/* 每次case由既有安全helper重建隔離Console。 */ () => resetStack())
// 一案只跑Windows TCP的remote_input回傳，不延伸outbound send／paste。
test('Windows remote input clipboard return over tcp', async ({ page, browser }) => {
  let fixture: InputFixture | undefined, consolePage: Page | undefined
  const resources = observeConsole(page.context())
  const host = readHostObservation() ? createHostObservation() : null
  const expected = host?.expected ?? 'Public 中文 RdWeb ' + randomUUID()
  let hostCode = 'host_client_failed'
  let hostTimeline: HostMainTimeline = {
    clockDomain: 'browser_main',
    events: [],
    overflow: false,
    unavailable: true,
  }
  const records: ClipboardTextRecord[] = []
  let sessionEnded = false,
    cleanupSucceeded = true,
    logSaved = false
  let encodedEvidenceAvailable = false
  let clipboardTransfer: ClipboardTransferDiagnostics | undefined
  try {
    fixture = await prepareInputTarget('windows', 'tcp')
    await page.context().addInitScript(installInputDiagnostics)
    await page.context().addInitScript(installKeyboardEmissionDiagnostics)
    await attachEncodedInputDiagnostics(page.context())
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:18080',
    })
    consolePage = await openOfficialConsole(page, fixture)
    await waitForInputVideo(consolePage, fixture)
    await prepareEncodedInputWorker(consolePage)
    clipboardTransfer = await prepareClipboardTransferWorker(consolePage, expected, true)
    await consolePage.getByTestId('console-auto-reconnect').uncheck()
    if (host) {
      hostCode = 'host_setup_failed'
      host.start()
      console.log('host_observer_start_requested')
      await waitHostObservationReady(host)
      if (consolePage.isClosed()) throw new Error('host_observation_unavailable')
      hostCode = 'host_client_failed'
    }
    try {
      await consolePage.evaluate(
        /* 首click前setup已完成；只設定被動observer，不等host文本相等。 */ ({
          value,
          captureHost,
        }) => {
          if (!window.__rdwebInputDiagnostics)
            throw new Error('input_clipboard_diagnostics_unavailable')
          window.__rdwebInputDiagnostics.begin(value, true, true, true)
          if (!window.__rdwebKeyboardEmissionObserver)
            throw new Error('keyboard_emission_diagnostics_unavailable')
          window.__rdwebKeyboardEmissionObserver.begin(value)
          if (!window.__rdwebEncodedInputDiagnostics)
            throw new Error('encoded_input_diagnostics_unavailable')
          window.__rdwebEncodedInputDiagnostics.begin(value, true)
          if (captureHost) window.__rdwebInputDiagnostics.beginTimeline()
        },
        { value: expected, captureHost: !!host },
      )
      await clickRemote(consolePage, fixture.editor.x + 20, fixture.editor.y + 30)
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.insertText(expected)
    } catch {
      throw new Error('text_return_probe_input_unavailable')
    }
    await consolePage.evaluate(
      /* 公開sentinel讓舊本機clipboard不能冒充遠端copy結果。 */ () =>
        navigator.clipboard.writeText('Public local sentinel'),
    )
    await startReceiving(consolePage)
    await clickRemote(consolePage, fixture.editor.x + 20, fixture.editor.y + 30)
    await consolePage.keyboard.press('Control+a')
    await consolePage.keyboard.press('Control+c')
    try {
      try {
        await assertPublicClipboard(consolePage, expected, 'Public local sentinel', 'remote_input')
        hostCode = 'host_client_pass'
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        const code = message.match(
          /^input_clipboard_remote_input_(?:mismatch|clipboard_timeout|local_unavailable|no_local_result)\b/,
        )?.[0]
        hostCode = code ?? 'host_client_failed'
        throw error
      }
    } finally {
      try {
        const snapshot = await consolePage.evaluate(
          /* 原oracle已結束；取前後摘要及既有readback，不再讀OS clipboard。 */ async (
            captureHost,
          ) => {
            const port = window.__rdwebInputDiagnostics
            if (!port) throw new Error('clipboard_text_log_unavailable')
            const readback = port.takeReadback()
            const nativeWrite = port.takeText()
            const keyboard = window.__rdwebKeyboardEmissionObserver
            if (!keyboard) throw new Error('keyboard_emission_diagnostics_unavailable')
            const keyboardEmission = await keyboard.take()
            const encoded = window.__rdwebEncodedInputDiagnostics
            if (!encoded) throw new Error('encoded_input_diagnostics_unavailable')
            const encodedCapture = await encoded.takeWithText()
            return {
              nativeWrite,
              readback: readback.value,
              source: readback.source,
              keyboardEmission,
              ...encodedCapture,
              ...(captureHost ? { hostTimeline: port.takeTimeline() } : {}),
            }
          },
          !!host,
        )
        const clipboardEvidence = await clipboardTransfer.takeWithText()
        if (snapshot.hostTimeline) hostTimeline = snapshot.hostTimeline
        records.push({
          transport: 'tcp',
          stage: 'remote_input',
          expected,
          ...snapshot,
          ...clipboardEvidence,
        })
        encodedEvidenceAvailable =
          snapshot.preEncryptInput.observed &&
          !snapshot.preEncryptInput.unavailable &&
          !snapshot.preEncryptInput.overflow
      } catch {
        console.warn('clipboard_text_log_unavailable')
      }
    }
    await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
    expect(resources.wrongPrefix).toBe(0)
    await consolePage.getByTestId('console-end').click()
    sessionEnded = true
    await expect(consolePage.getByTestId('console-phase')).toHaveText('連線已取消／關閉')
    await assertCanvasEmptyAndWorkersClosed(consolePage)
    await expect
      .poll(/* 驗證真Worker生命週期事件已收尾。 */ () => resources.closed)
      .toBe(resources.opened)
  } catch (error) {
    if (hostCode === 'host_client_pass') hostCode = 'host_client_failed'
    throw error
  } finally {
    // 只清本輪test-only Worker包裝；原strict mismatch／timeout不能被cleanup覆寫。
    try {
      await clipboardTransfer?.cancel()
    } catch {
      /* Worker已關閉亦不重開診斷。 */
    }
    // 先關閉自有Console session，再落唯一log；logger error不改寫strict oracle。
    if (consolePage && !consolePage.isClosed()) {
      if (!sessionEnded) {
        try {
          await consolePage.getByTestId('console-end').click({ timeout: 2000 })
        } catch {
          cleanupSucceeded = false
          console.warn('text_return_cleanup_unavailable')
        }
      }
      try {
        await consolePage.close()
      } catch {
        cleanupSucceeded = false
        console.warn('text_return_cleanup_unavailable')
      }
    }
    try {
      await fixture?.context.dispose()
    } catch {
      cleanupSucceeded = false
      console.warn('text_return_cleanup_unavailable')
    }
    // 整案只寫remote_input一筆，unique JSON不覆寫歷史log。
    for (const record of records.splice(0)) {
      try {
        textLogger.write(record)
        logSaved = true
      } catch {
        console.warn('clipboard_text_log_unavailable')
      }
    }
    if (host) {
      try {
        host.finish(
          hostTimeline,
          hostClientCode(hostCode, cleanupSucceeded && logSaved && encodedEvidenceAvailable),
        )
      } catch {
        console.warn('host_observation_unavailable')
      }
    }
  }
  const cleanupCode = textReturnCleanupCode(cleanupSucceeded)
  if (cleanupCode) throw new Error(cleanupCode)
  const logCode = textReturnLogCode(logSaved)
  if (logCode) throw new Error(logCode)
  if (!encodedEvidenceAvailable) throw new Error('encoded_input_diagnostics_unavailable')
  console.log('Public Windows text return probe: ' + browser.version() + '/tcp/PASS')
})
