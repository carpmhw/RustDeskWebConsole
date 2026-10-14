import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { resetStack } from '../e2e/helpers/fixtures'
import { openOfficialConsole, observeConsole, clockChanges } from './fixtures'
import {
  clickRemote,
  assertCanvasEmptyAndWorkersClosed,
  clipboardMatches,
  assertPublicClipboard,
  prepareLinuxInputTarget,
  prepareLinuxInputTargets,
  prepareInputTarget,
  openConsoleLink,
  startReceiving,
  waitForInputVideo,
} from './input-fixtures'
import { inputPlatforms } from './windows-runtime'
import { prepareWindowsTargets } from './windows-fixtures'
import { installInputDiagnostics } from './input-diagnostics'
import { createClipboardTextLogger, type ClipboardTextRecord } from './clipboard-text-log'
import type { ClipboardOracleStage } from './clipboard-oracle'
const platforms = inputPlatforms()
const textLogger = platforms.includes('windows') ? createClipboardTextLogger(process.env) : null

// 原oracle結束後只取短命診斷；檔案延至整案finally，避免在兩階段中間插入disk等待。
async function assertWindowsClipboard(
  page: Page,
  expected: string,
  sentinel: string,
  stage: ClipboardOracleStage,
  transport: 'tcp' | 'ws',
  records: ClipboardTextRecord[],
): Promise<void> {
  try {
    await assertPublicClipboard(page, expected, sentinel, stage)
  } finally {
    if (textLogger) {
      try {
        const snapshot = await page.evaluate(
          // 只有顯式opt-in測試可傳回短命文字，取出後清除browser端引用。
          () => {
            const port = window.__rdwebInputDiagnostics
            if (!port) throw new Error('clipboard_text_log_unavailable')
            const readback = port.takeReadback()
            return {
              nativeWrite: port.takeText(),
              readback: readback.value,
              source: readback.source,
            }
          },
        )
        records.push({ transport, stage, expected, ...snapshot })
      } catch {
        console.warn('clipboard_text_log_unavailable')
      }
    }
  }
}

// 真auth／Redis配額保持正式設定，每case只隔離自己的測試stack。
test.beforeEach(() => resetStack())
// 公開observer只回傳事件數量，原始按鍵與座標不離開owned target。
function publicEventCounts(): { keyPress: number; keyRelease: number; mousePress: number } {
  try {
    const counts = execFileSync(
      'docker',
      [
        'compose',
        '-f',
        'deploy/dev/docker-compose.rustdesk-test.yml',
        'exec',
        '-T',
        'target',
        'sh',
        '-c',
        'awk \'/^KeyPress / { kp++ } /^KeyRelease / { kr++ } /^ButtonPress / { mp++ } END { printf "%d %d %d\\n", kp, kr, mp }\' /test-state/public-input-events',
      ],
      {
        cwd: '..',
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
      .trim()
      .split(' ')
      .map(Number)
    if (
      counts.length !== 3 ||
      counts.some(/* 計數只接受有界非負整數。 */ (n) => !Number.isSafeInteger(n) || n < 0)
    )
      throw new Error()
    return { keyPress: counts[0]!, keyRelease: counts[1]!, mousePress: counts[2]! }
  } catch {
    throw new Error('Public input event counts unavailable')
  }
}
if (platforms.includes('linux')) {
  // 使用真formal admin API但只存public synthetic Windows資料，不登入／控制任何Windows。
  test('public saved input fixture API contract', async () => {
    const pairs = [await prepareLinuxInputTargets()]
    try {
      pairs.push(
        await prepareWindowsTargets({
          RDWEB_WINDOWS_ID_TCP: 'fixture.example:21116',
          RDWEB_WINDOWS_RELAY_TCP: 'fixture.example:21117',
          RDWEB_WINDOWS_ID_WS: 'fixture.example:21118',
          RDWEB_WINDOWS_RELAY_WS: 'fixture.example:21119',
          RDWEB_WINDOWS_PUBLIC_KEY: 'cHVibGljLWZpeHR1cmUta2V5LTEyMzQ1Njc4OTAxMjM=',
          RDWEB_WINDOWS_TARGET_ID: '123456789',
          RDWEB_WINDOWS_PASSWORD: 'public-fixture-password',
          RDWEB_WINDOWS_EDITOR_X: '0',
          RDWEB_WINDOWS_EDITOR_Y: '61',
          RDWEB_WINDOWS_EDITOR_WIDTH: '1398',
          RDWEB_WINDOWS_EDITOR_HEIGHT: '894',
        }),
      )
      for (const [index, pair] of pairs.entries()) {
        expect(pair.length).toBe(2)
        expect(
          pair[0]!.username === pair[1]!.username && pair[0]!.context === pair[1]!.context,
        ).toBe(true)
        expect(pair[0]!.targetId !== pair[1]!.targetId).toBe(true)
        expect(pair[0]!.name !== pair[1]!.name).toBe(true)
        for (const fixture of pair) {
          expect(fixture.platform).toBe(index === 0 ? 'linux' : 'windows')
          expect(Object.keys(fixture).sort()).toEqual(
            index === 0
              ? ['context', 'editor', 'name', 'observer', 'platform', 'targetId', 'username']
              : ['context', 'editor', 'name', 'platform', 'targetId', 'username'],
          )
          expect(/^[0-9a-f-]{36}$/.test(fixture.targetId)).toBe(true)
        }
        if (index === 1) expect(pair[0]!.editor).toEqual({ x: 0, y: 61, width: 1398, height: 894 })
      }
    } finally {
      for (const pair of pairs) await pair[0]!.context.dispose()
    }
  })
}
for (const transport of platforms.includes('linux') ? (['tcp', 'ws'] as const) : []) {
  // 捕捉UI有焦點但native鍵鼠未送達的真邊界回歸，功能鍵不含文字。
  test('public Linux native event delivery over ' + transport, async ({ page }) => {
    const fixture = await prepareLinuxInputTarget(transport)
    try {
      const consolePage = await openOfficialConsole(page, fixture)
      await waitForInputVideo(consolePage, fixture)
      const before = publicEventCounts()
      await clickRemote(consolePage, fixture.observer!.x + 120, fixture.observer!.y + 120)
      await expect(consolePage.getByTestId('console-input-active')).toBeVisible()
      await consolePage.keyboard.press('F8')
      await expect
        .poll(
          /* 只輸出公開事件計數差。 */ () => {
            const after = publicEventCounts()
            return {
              keyPress: after.keyPress - before.keyPress,
              keyRelease: after.keyRelease - before.keyRelease,
              mousePress: after.mousePress - before.mousePress,
            }
          },
          { timeout: 10000 },
        )
        .toEqual({ keyPress: 1, keyRelease: 1, mousePress: 1 })
      await consolePage.getByTestId('console-end').click()
      await consolePage.close()
    } finally {
      await fixture.context.dispose()
    }
  })
  // 點擊文字child後普通文字必須改變native文字區，避免鍵盤仍落在filename欄位。
  test('public Linux native editor text effect over ' + transport, async ({ page }) => {
    const fixture = await prepareLinuxInputTarget(transport)
    try {
      const consolePage = await openOfficialConsole(page, fixture)
      await waitForInputVideo(consolePage, fixture)
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      const changed = consolePage.evaluate(
        /* 影像只在browser closure比較，回布林且不把像素或hash放全域。 */ async (r) => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            '[data-testid="console-canvas"]',
          )!
          const ctx = canvas.getContext('2d')!
          const before = ctx.getImageData(r.x + 20, r.y + 2, r.width - 40, 20).data
          for (let i = 0; i < 50; i++) {
            await new Promise(
              /* 有界取樣不替代native文字回讀。 */ (resolve) => setTimeout(resolve, 100),
            )
            const after = ctx.getImageData(r.x + 20, r.y + 2, r.width - 40, 20).data
            let difference = 0
            for (let p = 0; p < before.length; p += 4)
              if (Math.abs(before[p]! - after[p]!) > 50) difference++
            if (difference > 100) return true
          }
          return false
        },
        fixture.editor,
      )
      await consolePage.keyboard.insertText('Public native editor effect')
      expect(await changed).toBe(true)
      await consolePage.getByTestId('console-end').click()
      await consolePage.close()
    } finally {
      await fixture.context.dispose()
    }
  })
  // native editor回讀才算輸入有效，wire已送或UI streaming都不能代替。
  test('public Linux text and clipboard oracle over ' + transport, async ({ page, browser }) => {
    const fixture = await prepareLinuxInputTarget(transport)
    const resources = observeConsole(page.context())
    const sample = 'Public RustDesk input oracle ' + randomUUID()
    const outboundSample = 'Public local RustDesk '.repeat(32) + randomUUID()
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
      const consolePage = await openOfficialConsole(page, fixture)
      await waitForInputVideo(consolePage, fixture)
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await expect(consolePage.getByTestId('console-input-active')).toBeVisible()
      await consolePage.keyboard.press('Control+a')
      // Xaw不像一般editor自動以insert取代selection；Ctrl+W為其已文件化刪除選取。
      await consolePage.keyboard.press('Control+w')
      await consolePage.keyboard.insertText(sample)
      // 本機sentinel確保不能以舊localclipboard冒充remote讀取。
      await consolePage.evaluate(
        /* 公開sentinel，內容不進report。 */ () =>
          navigator.clipboard.writeText('Public local sentinel'),
      )
      await startReceiving(consolePage)
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+c')
      await assertPublicClipboard(consolePage, sample, 'Public local sentinel', 'remote_input')
      await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
      await consolePage.evaluate(
        /* 本機公開文字僅於顯式send動作交給原Main port。 */ (publicSample) =>
          navigator.clipboard.writeText(publicSample),
        outboundSample,
      )
      await consolePage.getByTestId('console-clipboard-send').click()
      await expect(consolePage.getByTestId('console-clipboard-send')).toBeEnabled()
      await expect(consolePage.getByTestId('console-operation-error')).toHaveCount(0)
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+w')
      await consolePage.keyboard.press('Control+v')
      await consolePage.evaluate(
        /* sent本機內容先清成另一sentinel，不能以本機同字冒充nativepaste。 */ () =>
          navigator.clipboard.writeText('Public local sentinel after send'),
      )
      await startReceiving(consolePage)
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+c')
      await assertPublicClipboard(
        consolePage,
        outboundSample,
        'Public local sentinel after send',
        'outbound_roundtrip',
      )
      await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
      expect(resources.wrongPrefix).toBe(0)
      await consolePage.getByTestId('console-end').click()
      await assertCanvasEmptyAndWorkersClosed(consolePage)
      await expect
        .poll(/* Worker cleanup不能以handle promise代替。 */ () => resources.closed)
        .toBe(resources.opened)
      await consolePage.close()
      const reopened = await openConsoleLink(page, fixture)
      await waitForInputVideo(reopened, fixture)
      await reopened.getByTestId('console-end').click()
      await assertCanvasEmptyAndWorkersClosed(reopened)
      await expect
        .poll(/* 同family新console也必須釋放本次Worker。 */ () => resources.closed)
        .toBe(resources.opened)
      await reopened.close()
      console.log('Public Linux input oracle: ' + browser.version() + '/' + transport + '/PASS')
    } finally {
      await fixture.context.dispose()
    }
  })
  // 已核准限制：只有既有clipboard無新事件時安全逾時，不擅取舊內容或中斷影像。
  test('public Linux settled clipboard times out safely over ' + transport, async ({ page }) => {
    const fixture = await prepareLinuxInputTarget(transport)
    const resources = observeConsole(page.context())
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
      const consolePage = await openOfficialConsole(page, fixture)
      await waitForInputVideo(consolePage, fixture)
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+w')
      await consolePage.keyboard.insertText('Public settled clipboard oracle')
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+c')
      expect(await clockChanges(consolePage)).toBe(true)
      await consolePage.evaluate(
        /* 公開sentinel不能冒充遠端既有clipboard。 */ () =>
          navigator.clipboard.writeText('Public local sentinel'),
      )
      await startReceiving(consolePage)
      await expect(consolePage.getByTestId('console-operation-error')).toHaveAttribute(
        'data-operation-code',
        'clipboard_timeout',
        { timeout: 7000 },
      )
      await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
      expect(await clipboardMatches(consolePage, 'Public local sentinel')).toBe(true)
      await expect(consolePage.getByTestId('console-streaming')).toBeVisible()
      expect(await clockChanges(consolePage)).toBe(true)
      await consolePage.getByTestId('console-end').click()
      await expect
        .poll(/* 真Worker收尾與正常operation相同。 */ () => resources.closed)
        .toBe(resources.opened)
      await consolePage.close()
    } finally {
      await fixture.context.dispose()
    }
  })
  // live事件必須取得本次文字，不能以settled預期逾時降低成功門檻。
  test('public Linux live clipboard event over ' + transport, async ({ page, browser }) => {
    const fixture = await prepareLinuxInputTarget(transport)
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
      const consolePage = await openOfficialConsole(page, fixture)
      await waitForInputVideo(consolePage, fixture)
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await expect(consolePage.getByTestId('console-input-active')).toBeVisible()
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+w')
      await consolePage.keyboard.insertText('Public live clipboard oracle')
      await consolePage.evaluate(
        /* 公開sentinel防本機假成功。 */ () =>
          navigator.clipboard.writeText('Public local sentinel'),
      )
      await startReceiving(consolePage)
      // 再點同一pixel也是IME透明surface的真回歸，不得force繞過遮擋。
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await expect(consolePage.getByTestId('console-input-active')).toBeVisible()
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+c')
      await expect
        .poll(
          /* remote文字只在RAM比較。 */ () =>
            clipboardMatches(consolePage, 'Public live clipboard oracle'),
          { timeout: 10000 },
        )
        .toBe(true)
      await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
      console.log('Public live clipboard: ' + browser.version() + '/' + transport + '/PASS')
      await consolePage.getByTestId('console-end').click()
      await consolePage.close()
    } finally {
      await fixture.context.dispose()
    }
  })
  // 英文locale同樣呈現可操作的先接收流程，而非僅比對message字串。
  test('public Linux English receive UI over ' + transport, async ({ page }) => {
    const fixture = await prepareLinuxInputTarget(transport)
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
      const consolePage = await openOfficialConsole(page, fixture)
      await waitForInputVideo(consolePage, fixture)
      await consolePage.evaluate(
        /* 只設定既有公開語言偏好。 */ () => localStorage.setItem('rdweb.locale', 'en'),
      )
      await consolePage.reload()
      await waitForInputVideo(consolePage, fixture)
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+w')
      await consolePage.keyboard.insertText('Public English receive oracle')
      await consolePage.evaluate(
        /* 已有local內容不能冒充新remote結果。 */ () =>
          navigator.clipboard.writeText('Public local sentinel'),
      )
      await startReceiving(consolePage, 'en')
      await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
      await consolePage.keyboard.press('Control+a')
      await consolePage.keyboard.press('Control+c')
      await expect
        .poll(
          /* 真native內容只回布林。 */ () =>
            clipboardMatches(consolePage, 'Public English receive oracle'),
          { timeout: 10000 },
        )
        .toBe(true)
      await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
      await consolePage.getByTestId('console-end').click()
      await consolePage.close()
    } finally {
      await fixture.context.dispose()
    }
  })
  for (const locale of ['zh-TW', 'en'] as const) {
    // 只有本機native port拒絕被替換；remote事件、加密wire及私有fallback仍走真production。
    test(
      'public Linux receive fallback label over ' + transport + '/' + locale,
      async ({ page }) => {
        const fixture = await prepareLinuxInputTarget(transport)
        try {
          await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
          const consolePage = await openOfficialConsole(page, fixture)
          await waitForInputVideo(consolePage, fixture)
          if (locale === 'en') {
            await consolePage.evaluate(
              /* 沿正式公開偏好載入英文，不直接改Vue內部state。 */ () =>
                localStorage.setItem('rdweb.locale', 'en'),
            )
            await consolePage.reload()
            await waitForInputVideo(consolePage, fixture)
          }
          await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
          await consolePage.keyboard.press('Control+a')
          await consolePage.keyboard.press('Control+w')
          await consolePage.keyboard.insertText('Public receive fallback oracle ' + locale)
          await consolePage.evaluate(
            /* native拒絕測試不mockremote clipboard或成功結果。 */ async () => {
              await navigator.clipboard.writeText('Public local sentinel')
              Object.defineProperty(navigator.clipboard, 'writeText', {
                configurable: true,
                // 模擬瀏覽器拒絕單次native寫入，不讀或保存參數。
                value: async () => {
                  throw new DOMException('public denial', 'NotAllowedError')
                },
              })
            },
          )
          await startReceiving(consolePage, locale)
          await clickRemote(consolePage, fixture.editor.x + 80, fixture.editor.y + 30)
          await consolePage.keyboard.press('Control+a')
          await consolePage.keyboard.press('Control+c')
          await expect(consolePage.getByTestId('console-clipboard-dialog')).toBeVisible()
          await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
          await expect(consolePage.getByTestId('console-operation-error')).toHaveAttribute(
            'data-operation-code',
            'clipboard_permission_denied',
          )
          expect(
            await clipboardMatches(consolePage, 'Public receive fallback oracle ' + locale),
          ).toBe(true)
          await expect(
            consolePage.getByTestId('console-clipboard-retry-copy'),
          ).toHaveAccessibleName(locale === 'zh-TW' ? '複製遠端文字' : 'Copy remote text')
          await consolePage.getByTestId('console-clipboard-retry-copy').click()
          await expect(consolePage.getByTestId('console-clipboard-retry-copy')).toBeEnabled()
          await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
          expect(
            await clipboardMatches(consolePage, 'Public receive fallback oracle ' + locale),
          ).toBe(true)
          await consolePage.getByTestId('console-clipboard-close').click()
          await expect(consolePage.getByTestId('console-clipboard-dialog')).not.toBeVisible()
          await consolePage.getByTestId('console-end').click()
          await consolePage.close()
        } finally {
          await fixture.context.dispose()
        }
      },
    )
  }
}
if (platforms.includes('windows')) {
  for (const transport of ['tcp', 'ws'] as const) {
    // 真Windows文字與雙向manual clipboard先receive才copy，不能用wire送出或本機sentinel冒充。
    test(
      'public Windows text and clipboard oracle over ' + transport,
      async ({ page, browser }) => {
        const fixture = await prepareInputTarget('windows', transport)
        const resources = observeConsole(page.context())
        const sample = 'Public 中文 RdWeb ' + randomUUID()
        const outboundSample = 'Public local 中文 '.repeat(32) + randomUUID()
        const textRecords: ClipboardTextRecord[] = []
        try {
          await page.context().addInitScript(installInputDiagnostics)
          await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
            origin: 'http://127.0.0.1:18080',
          })
          const consolePage = await openOfficialConsole(page, fixture)
          await waitForInputVideo(consolePage, fixture)
          await consolePage.evaluate(
            /* 首次驗Main→Worker全文／完整chord；顯式本機log才捕捉文字，操作順序不變。 */ ({
              publicExpected,
              capture,
            }) => {
              if (!window.__rdwebInputDiagnostics)
                throw new Error('input_clipboard_diagnostics_unavailable')
              window.__rdwebInputDiagnostics.begin(publicExpected, capture, true)
            },
            { publicExpected: sample, capture: textLogger !== null },
          )
          await clickRemote(consolePage, fixture.editor.x + 20, fixture.editor.y + 30)
          await expect(consolePage.getByTestId('console-input-active')).toBeVisible()
          await consolePage.keyboard.press('Control+a')
          await consolePage.keyboard.insertText(sample)
          await consolePage.evaluate(
            // 本機公開sentinel避免舊localclipboard冒充native輸入結果。
            () => navigator.clipboard.writeText('Public local sentinel'),
          )
          await startReceiving(consolePage)
          await clickRemote(consolePage, fixture.editor.x + 20, fixture.editor.y + 30)
          await consolePage.keyboard.press('Control+a')
          await consolePage.keyboard.press('Control+c')
          await assertWindowsClipboard(
            consolePage,
            sample,
            'Public local sentinel',
            'remote_input',
            transport,
            textRecords,
          )
          await expect(consolePage.getByTestId('console-clipboard-waiting')).toHaveCount(0)
          await consolePage.evaluate(
            /* outbound獨立public expected，不沿用首次複製證據。 */ ({
              publicExpected,
              capture,
            }) => {
              if (!window.__rdwebInputDiagnostics)
                throw new Error('input_clipboard_diagnostics_unavailable')
              window.__rdwebInputDiagnostics.begin(publicExpected, capture)
            },
            { publicExpected: outboundSample, capture: textLogger !== null },
          )
          await consolePage.evaluate(
            // 本機public文字僅由使用者顯式send動作交到遠端，不自動Ctrl+V。
            (publicSample) => navigator.clipboard.writeText(publicSample),
            outboundSample,
          )
          await consolePage.getByTestId('console-clipboard-send').click()
          await expect(consolePage.getByTestId('console-clipboard-send')).toBeEnabled()
          await expect(consolePage.getByTestId('console-operation-error')).toHaveCount(0)
          await clickRemote(consolePage, fixture.editor.x + 20, fixture.editor.y + 30)
          await consolePage.keyboard.press('Control+a')
          await consolePage.keyboard.press('Control+v')
          await consolePage.evaluate(
            // 先清本機已送文字，確保回讀真的來自Windows貼上結果。
            () => navigator.clipboard.writeText('Public local sentinel after send'),
          )
          await startReceiving(consolePage)
          await clickRemote(consolePage, fixture.editor.x + 20, fixture.editor.y + 30)
          await consolePage.keyboard.press('Control+a')
          await consolePage.keyboard.press('Control+c')
          await assertWindowsClipboard(
            consolePage,
            outboundSample,
            'Public local sentinel after send',
            'outbound_roundtrip',
            transport,
            textRecords,
          )
          expect(resources.wrongPrefix).toBe(0)
          await consolePage.getByTestId('console-end').click()
          await expect(consolePage.getByTestId('console-phase')).toHaveText('連線已取消／關閉')
          await assertCanvasEmptyAndWorkersClosed(consolePage)
          await expect
            .poll(/* 真Worker事件closed數須追上opened。 */ () => resources.closed)
            .toBe(resources.opened)
          console.log(
            'Public Windows input oracle: ' + browser.version() + '/' + transport + '/PASS',
          )
          await consolePage.close()
        } finally {
          // 整案結束才寫有限兩筆本機檔；清除Node引用，不讓保存失敗覆寫原oracle。
          for (const record of textRecords.splice(0)) {
            try {
              textLogger?.write(record)
            } catch {
              console.warn('clipboard_text_log_unavailable')
            }
          }
          await fixture.context.dispose()
        }
      },
    )
  }
}
