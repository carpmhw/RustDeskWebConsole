import { randomUUID } from 'node:crypto'
import { test, type Page } from '@playwright/test'
import { resetStack } from '../e2e/helpers/fixtures'
import { openOfficialConsole, observeConsole } from './fixtures'
import {
  clickRemote,
  prepareInputTarget,
  waitForInputVideo,
  type InputFixture,
} from './input-fixtures'
import { installInputDiagnostics, type TextOnlyEvidence } from './input-diagnostics'
import {
  createTextProbeControl,
  textProbeCleanupCode,
  type TextProbeCode,
} from './text-probe-control'
import { readTextProbeRuntime } from './text-probe-runtime'
const runtime = readTextProbeRuntime()
// 僅固定boolean，不因page／native例外回傳原exception或文字。
function emptyEvidence(): TextOnlyEvidence {
  return {
    prefixSubmitted: false,
    prefixAccepted: false,
    postTextInput: false,
    clipboardObserved: false,
    scopeInterrupted: false,
    overflow: false,
  }
}
// 每次取最新Main摘要與目前streaming，失效scope不能算安靜觀察。
async function currentEvidence(page: Page): Promise<TextOnlyEvidence> {
  return page.evaluate(
    /* 不讀pixel或文字，終態／權限由安全state及目前UI共同檢查。 */ () => {
      const port = window.__rdwebInputDiagnostics
      if (!port) throw new Error('text_probe_submission_unavailable')
      const value = port.textOnlySnapshot()
      if (!document.querySelector('[data-testid="console-streaming"]'))
        value.scopeInterrupted = true
      return value
    },
  )
}
// 人工窗口poll僅讀控制檔與summary，不等OS編輯完成、不新增遠端操作。
async function pollTick(): Promise<void> {
  await new Promise<void>(
    /* 排程控制檔poll，非注入／複製前插sleep求PASS。 */ (resolve) => setTimeout(resolve, 100),
  )
}
// 此PASS只代表診斷流程取得分類，nativeTextVerified與clipboardVerified永遠false。
test('diagnostic Windows text-only observation over tcp (not native verification)', async ({
  page,
}) => {
  const control = createTextProbeControl()
  let fixture: InputFixture | undefined, consolePage: Page | undefined
  let evidence = emptyEvidence(),
    code: TextProbeCode = 'text_probe_submission_unavailable'
  let armed = false
  const resources = observeConsole(page.context())
  try {
    resetStack()
    fixture = await prepareInputTarget('windows', runtime.transport)
    await page.context().addInitScript(installInputDiagnostics)
    consolePage = await openOfficialConsole(page, fixture)
    await waitForInputVideo(consolePage, fixture)
    await consolePage.getByTestId('console-auto-reconnect').uncheck()
    const sample = 'Public 中文 RdWeb ' + randomUUID()
    await consolePage.evaluate(
      /* begin不送input或clipboard指令。 */ (value) => {
        if (!window.__rdwebInputDiagnostics) throw new Error('text_probe_submission_unavailable')
        window.__rdwebInputDiagnostics.beginTextOnly(value)
      },
      sample,
    )
    await clickRemote(consolePage, fixture.editor.x + 20, fixture.editor.y + 30)
    await consolePage.keyboard.press('Control+a')
    await consolePage.keyboard.insertText(sample)
    await consolePage.waitForFunction(
      /* 全prefix已matching ACK才開始人工窗口，不是OS ACK。 */ () => {
        const value = window.__rdwebInputDiagnostics?.textOnlySnapshot()
        return (
          value?.prefixAccepted ||
          value?.postTextInput ||
          value?.clipboardObserved ||
          value?.scopeInterrupted ||
          value?.overflow
        )
      },
      undefined,
      { timeout: 2000 },
    )
    evidence = await currentEvidence(consolePage)
    if (
      !evidence.prefixAccepted ||
      evidence.postTextInput ||
      evidence.clipboardObserved ||
      evidence.scopeInterrupted ||
      evidence.overflow
    )
      throw new Error('text_probe_submission_unavailable')
    control.arm(sample)
    armed = true
    console.log('text_probe_ready')
    for (;;) {
      evidence = await currentEvidence(consolePage)
      if (
        evidence.postTextInput ||
        evidence.clipboardObserved ||
        evidence.scopeInterrupted ||
        evidence.overflow
      ) {
        code = 'text_probe_interrupted'
        break
      }
      const classification = control.poll()
      if (classification) {
        evidence = await currentEvidence(consolePage)
        code = ('text_probe_' + classification) as TextProbeCode
        break
      }
      await pollTick()
    }
  } catch (error) {
    if (
      error instanceof Error &&
      ['text_probe_observation_timeout', 'text_probe_control_unavailable'].includes(error.message)
    )
      code = error.message as TextProbeCode
    else code = armed ? 'text_probe_interrupted' : 'text_probe_submission_unavailable'
    if (consolePage) {
      try {
        evidence = await currentEvidence(consolePage)
      } catch {
        evidence.scopeInterrupted = true
      }
    }
  } finally {
    try {
      code = control.finish(code, evidence)
    } catch {
      code = 'text_probe_control_unavailable'
    }
    control.dispose()
    try {
      await page.context().close()
    } catch {
      code = 'text_probe_interrupted'
    }
    try {
      await fixture?.context.dispose()
    } catch {
      code = 'text_probe_interrupted'
    }
  }
  const resourcesClosed = resources.closed === resources.opened
  code = textProbeCleanupCode(code, resourcesClosed)
  console.log(
    JSON.stringify({
      code,
      evidence,
      resourcesClosed,
      nativeTextVerified: false,
      clipboardVerified: false,
    }),
  )
  if (
    !resourcesClosed ||
    ![
      'text_probe_looks_intact',
      'text_probe_reordered_or_partial',
      'text_probe_uncertain',
    ].includes(code)
  )
    throw new Error(code)
})
