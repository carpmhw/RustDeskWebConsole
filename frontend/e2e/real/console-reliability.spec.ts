import { expect, test, type Page, type Request } from '@playwright/test'
import { loginUi, resetStack } from '../management/helpers/fixtures'
import {
  assertCanvasEmptyAndWorkersClosed,
  assertPublicClipboard,
  clickRemote,
  openConsoleLink,
  prepareReliabilityTargets,
  startReceiving,
  waitForInputVideo,
  type InputFixture,
} from './input-fixtures'
import {
  safeFailureCode,
  writeSafeReliabilityResults,
  type ConnectionResult,
} from './reliability-results'
import { inputPlatforms } from './windows-runtime'

// 輸入oracle失敗與連線失敗必須分開：前者代表連線已建立但native輸入／剪貼簿未成立。
class InputOracleFailure extends Error {
  constructor() {
    super('input_oracle_failed')
  }
}

// 測試端只產生固定長度公開文字；內容不進報告，也不與本機sentinel相同。
function reliabilitySample(ordinal: number): string {
  return 'R' + String(ordinal).padStart(3, '0')
}

// 本機sentinel確保遠端回讀不能以既有local clipboard冒充成功。
const LOCAL_SENTINEL = 'Reliability local sentinel'

// 60秒deadline由本次專用popup關閉實現，讓仍await的browser action與WS一起停止。
async function boundedOfficialAttempt(
  page: Page,
  fixture: InputFixture,
  sample: string,
  timeout: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const operation = (async () => {
    await waitForInputVideo(page, fixture)
    // 第一個attempt只允許單一Worker；任何重連state都代表不是原始連線。
    if (page.workers().length !== 1) throw new Error('Original worker count invalid')
    await expect(page.getByTestId('console-auto-reconnect')).not.toBeChecked()
    await clickRemote(page, fixture.editor.x + 20, fixture.editor.y + 30)
    await expect(page.getByTestId('console-input-active')).toBeVisible()
    try {
      await page.keyboard.press('Control+a')
      // Xaw不會以insert取代選取；Linux沿用既有已文件化的Ctrl+W清除。
      if (fixture.platform === 'linux') await page.keyboard.press('Control+w')
      await page.keyboard.insertText(sample)
      await page.evaluate(
        /* sentinel只在本機RAM，比對結果仍是boolean。 */ (sentinel) =>
          navigator.clipboard.writeText(sentinel),
        LOCAL_SENTINEL,
      )
      await startReceiving(page)
      await clickRemote(page, fixture.editor.x + 20, fixture.editor.y + 30)
      await page.keyboard.press('Control+a')
      await page.keyboard.press('Control+c')
      await assertPublicClipboard(page, sample, LOCAL_SENTINEL, 'remote_input')
      await expect(page.getByTestId('console-clipboard-waiting')).toHaveCount(0)
    } catch {
      // 原始例外文字（可能含native內容）不向外傳，只保留固定test-only分類。
      throw new InputOracleFailure()
    }
    if (
      page.workers().length !== 1 ||
      (await page.getByTestId('console-auto-reconnect').isChecked()) ||
      (await page.getByTestId('console-reconnect').count()) !== 0
    )
      throw new Error('Original attempt changed')
  })()
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // page.close同時取消所有仍等待的locator／keyboard／WS工作，不留背景attempt。
      void page.close().then(
        () => reject(new Error('connection_timeout')),
        () => reject(new Error('connection_timeout')),
      )
    }, timeout)
  })
  try {
    await Promise.race([operation, expired])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// 同平台必須只有一個項目；混合scope或缺少明確platform一律不執行。
const platform = process.env.RDWEB_RELIABILITY_PLATFORM
if (platform !== 'linux' && platform !== 'windows') throw new Error('reliability_scope_unavailable')
const platforms = inputPlatforms()
if (platforms.length !== 1 || platforms[0] !== platform)
  throw new Error('reliability_scope_unavailable')

// 每平台一份50次序列run；只算第一attempt，失敗不重跑、不覆寫同一筆。
test('fifty original attempts on ' + platform, async ({ page, context, browser }) => {
  resetStack()
  const setup = await prepareReliabilityTargets(platform)
  const results: ConnectionResult[] = []
  let nextAssistAt = 0
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:18080',
    })
    // 同一個正式user登入一次；後續只由targets link開新console session。
    await loginUi(page, setup.username)
    // 巨大suite timeout只用於50次總預算，單一UI動作仍以60秒上限fail closed。
    page.setDefaultTimeout(60000)
    for (let ordinal = 1; ordinal <= 50; ordinal++) {
      const transport = ordinal % 2 ? 'tcp' : 'ws',
        fixture = setup.targets[transport]
      // 相鄰assist實際開始至少13秒；沒取得assist時仍以attempt開始時間節流。
      const wait = Math.max(0, nextAssistAt - Date.now())
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      const started = Date.now(),
        sample = reliabilitySample(ordinal)
      let consolePage: Page | undefined,
        success = false,
        code = 'connection_failed',
        assistAt: number | null = null
      // 在popup建立前掛context listener，避免漏掉最早的一次login-assist。
      const recordAssist = (request: Request): void => {
        if (request.method() !== 'POST') return
        if (new URL(request.url()).pathname.endsWith('/login-assist')) assistAt = Date.now()
      }
      context.on('request', recordAssist)
      try {
        consolePage = await openConsoleLink(page, fixture)
        consolePage.setDefaultTimeout(60000)
        // 以正常UI開關停用本次自動重連，不用測試旗標或mock auth。
        await consolePage.getByTestId('console-auto-reconnect').uncheck()
        await boundedOfficialAttempt(consolePage, fixture, sample, 60000)
        success = true
        code = 'ok'
      } catch (error) {
        if (consolePage)
          code =
            error instanceof InputOracleFailure
              ? 'input_oracle_failed'
              : await safeFailureCode(consolePage)
      } finally {
        context.off('request', recordAssist)
        nextAssistAt = (assistAt ?? started) + 13000
        if (consolePage && !consolePage.isClosed()) {
          try {
            await consolePage.getByTestId('console-end').click()
            await assertCanvasEmptyAndWorkersClosed(consolePage)
          } catch {
            // 正常關閉失敗不得以成功或原連線碼掩蓋；仍嘗試釋放本次popup。
            success = false
            code = 'cleanup_failed'
          }
          await consolePage.close().catch(() => {})
        }
      }
      const elapsed = Date.now() - started
      results.push({
        platform,
        transport,
        ordinal,
        elapsed_ms: elapsed,
        first_attempt: success,
        code,
      })
      // 只輸出固定scalar，方便長run觀察且不夾帶任何文字或例外內容。
      console.log(
        'reliability attempt ' + ordinal + '/50 ' + transport + ' ' + elapsed + 'ms ' + code,
      )
    }
    await writeSafeReliabilityResults(platform, results, browser.version())
    expect(results.length).toBe(50)
    expect(results.filter((value) => value.first_attempt).length).toBeGreaterThanOrEqual(49)
    // 報告碼必須是固定格式；原始exception文字或自由欄位不得通過。
    expect(results.every((value) => /^[a-z_]{1,64}$/.test(value.code))).toBe(true)
  } finally {
    await setup.context.dispose()
  }
})
