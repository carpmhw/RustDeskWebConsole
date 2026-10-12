import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'
import { base } from '../e2e/helpers/fixtures'
import {
  prepareOfficialTarget,
  prepareOfficialTargets,
  waitForClock,
  type OfficialFixture,
} from './fixtures'
import { prepareWindowsTarget } from './windows-fixtures'
import { assertInputPeer } from './input-peer'
import { OPERATION_CODES, type OperationCode } from '../src/rdweb/interaction-types'
import { clipboardOracleCode, type ClipboardOracleStage } from './clipboard-oracle'
import { INPUT_DIAGNOSTIC_FIELDS } from './input-diagnostics'

export interface PublicRect {
  x: number
  y: number
  width: number
  height: number
}
export interface InputFixture extends OfficialFixture {
  platform: 'linux' | 'windows'
  editor: PublicRect
  observer?: PublicRect
}
// 每case重建本輪owned observer及公開事件檔，不截斷仍開啟的descriptor造成稀疏資料。
export function resetLinuxObserver(): void {
  try {
    execFileSync(
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
        'pkill -x xev; LANG=C.UTF-8 xev -geometry 240x220+1000+410 -event mouse -event keyboard > /test-state/public-input-events 2>/dev/null < /dev/null & for attempt in $(seq 1 30); do xwininfo -name "Event Tester" > /dev/null 2>&1 && exit 0; sleep 0.1; done; exit 1',
      ],
      { cwd: fileURLToPath(new URL('../..', import.meta.url)), timeout: 10000, stdio: 'ignore' },
    )
  } catch {
    throw new Error('Public Linux observer unavailable')
  }
}
// 幾何只讀本輪owned Linux target的公開X11 app，不輸出tree或window title。
export function linuxRects(): { editor: PublicRect; observer: PublicRect } {
  try {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL('../../tools/verify-input-fixture.mjs', import.meta.url)), '--json'],
        { encoding: 'utf8', timeout: 25000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    ) as { editor: PublicRect; observer: PublicRect }
    for (const r of [result.editor, result.observer]) {
      if (
        !r ||
        ![r.x, r.y, r.width, r.height].every(
          /* 只接受精確rect scalar。 */ (n) => Number.isSafeInteger(n),
        ) ||
        r.x < 0 ||
        r.y < 0 ||
        r.width < 1 ||
        r.height < 1 ||
        r.x + r.width > 1280 ||
        r.y + r.height > 720
      )
        throw new Error()
    }
    return result
  } catch {
    throw new Error('Public Linux input geometry unavailable')
  }
}
// 沿用正式API建立Linux target，不新增auth或crypto測試入口。
export async function prepareLinuxInputTarget(transport: 'tcp' | 'ws'): Promise<InputFixture> {
  resetLinuxObserver()
  const rectangles = linuxRects()
  return { ...(await prepareOfficialTarget(transport)), platform: 'linux', ...rectangles }
}
// 同userLinux雙target供後續50次相同quota條件，僅重建公开observer而不重建auth。
export async function prepareLinuxInputTargets(): Promise<InputFixture[]> {
  resetLinuxObserver()
  const rectangles = linuxRects()
  const targets = await prepareOfficialTargets()
  return targets.map(
    // helper回傳只含opaque backend UUID、context與公開幾何，不回password／key／endpoints。
    (target) => ({ ...target, platform: 'linux', ...rectangles }),
  )
}
// 平台只接受固定白名單，不以unknown平台沿用Linuxfixture。
export async function prepareInputTarget(
  platform: 'linux' | 'windows',
  transport: 'tcp' | 'ws',
): Promise<InputFixture> {
  if (platform === 'linux') return prepareLinuxInputTarget(transport)
  if (platform === 'windows') return prepareWindowsTarget(transport)
  throw new Error('Invalid input platform')
}
// 正常end直接驗Canvas清空與Worker已回收，不只比對狀態文字。
export async function assertCanvasEmptyAndWorkersClosed(page: Page): Promise<void> {
  const empty = await page.getByTestId('console-canvas').evaluate(
    // 像素只留browserclosure，回布林且不輸出影像或hash。
    (element) => {
      const canvas = element as HTMLCanvasElement
      return canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.every(
          // 僅透明黑畫面才算清空。
          (byte) => byte === 0,
        )
    },
  )
  expect(empty).toBe(true)
  await expect
    .poll(/* 等待真Worker生命週期，不以close文字代替。 */ () => page.workers().length)
    .toBe(0)
}
// 已登入父tab透過正式targets link開新console，不重新login或把ticket放URL。
export async function openConsoleLink(page: Page, fixture: InputFixture): Promise<Page> {
  await page.goto(base + '/targets')
  const popup = page.context().waitForEvent('page')
  await page
    .locator('tbody tr')
    .filter({ hasText: fixture.name })
    .getByRole('link', { name: '連線', exact: true })
    .click()
  const result = await popup
  await result.bringToFront()
  return result
}
// safe PeerInfo與真Canvas內容共同驗首影像；Linux另需B2公開clock。
export async function waitForInputVideo(page: Page, fixture: InputFixture): Promise<void> {
  await expect(page.getByTestId('console-streaming')).toBeVisible({ timeout: 45000 })
  const metadata = await page.getByTestId('console-verified').textContent()
  assertInputPeer(metadata, fixture.platform)
  if (fixture.platform === 'linux') await waitForClock(page)
  try {
    await page.waitForFunction(
      /* pixels只在browser RAM，回傳boolean而非畫面或hash。 */ (r) => {
        const c = document.querySelector<HTMLCanvasElement>('[data-testid="console-canvas"]')
        if (!c || r.x + r.width > c.width || r.y + r.height > c.height) return false
        const p = c.getContext('2d')?.getImageData(r.x, r.y, r.width, r.height).data
        return p?.some(/* 透明alpha不冒充非空畫面。 */ (v, i) => i % 4 !== 3 && v !== 0) ?? false
      },
      fixture.editor,
      { timeout: 45000 },
    )
  } catch {
    throw new Error('Public input surface unavailable')
  }
}
// client rect包含縮放與scroll；座標來源只有公开fixture幾何。
export async function clickRemote(page: Page, x: number, y: number): Promise<void> {
  const surface = page.getByTestId('console-canvas')
  const point = await surface.evaluate(
    /* 遠端point只轉為本機mouse座標，不取pixel或remote origin。 */ (element, p) => {
      const c = element as HTMLCanvasElement,
        r = c.getBoundingClientRect()
      if (
        ![p.x, p.y].every(Number.isInteger) ||
        p.x < 0 ||
        p.y < 0 ||
        p.x >= c.width ||
        p.y >= c.height ||
        r.width <= 0 ||
        r.height <= 0
      )
        throw new Error('Public input surface unavailable')
      return {
        x: ((p.x + 0.5) * r.width) / c.width,
        y: ((p.y + 0.5) * r.height) / c.height,
      }
    },
    { x, y },
  )
  // locator處理整頁與viewport滾動後才點擊；原page.mouse不會捲動畫面外point。
  await surface.click({ position: point })
}
// 真UI先明示手動接收順序，不以testid繞過缺少或誤導的操作名稱。
export async function startReceiving(page: Page, locale: 'zh-TW' | 'en' = 'zh-TW'): Promise<void> {
  const label = locale === 'zh-TW' ? '接收遠端複製' : 'Receive remote copy'
  const waiting =
    locale === 'zh-TW'
      ? '等待遠端複製：請在 5 秒內點回遠端畫面，重新選取文字並按 Ctrl+C。'
      : 'Waiting for a remote copy: within 5 seconds, return to the remote screen, select the text again, and press Ctrl+C.'
  const help =
    locale === 'zh-TW'
      ? '先開始接收，再於遠端複製文字。不讀取先前的剪貼簿；點回畫面後可能需要重新選取。'
      : 'Start receiving before copying text remotely. Previously copied text is not read; returning to the screen may require selecting the text again.'
  await expect(page.getByTestId('console-clipboard-copy')).toHaveAccessibleName(label)
  await expect(page.getByTestId('console-clipboard-help')).toHaveText(help)
  await expect(page.getByTestId('console-clipboard-copy')).toHaveAttribute(
    'aria-describedby',
    'console-clipboard-help',
  )
  await page.getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByTestId('console-clipboard-waiting')).toHaveText(waiting)
  await expect(page.getByTestId('console-clipboard-dialog')).not.toBeVisible()
}
// 真remote內容只在browser短命RAM比對，assertion只得到布林。
export async function clipboardMatches(page: Page, expected: string): Promise<boolean> {
  try {
    return await page.evaluate(
      /* fallback優先讀本次dialog，否則由test端native API讀本機結果。 */ async (publicExpected) => {
        const dialog = document.querySelector<HTMLDialogElement>(
          '[data-testid="console-clipboard-dialog"]',
        )
        const text = document.querySelector<HTMLTextAreaElement>(
          '[data-testid="console-clipboard-text"]',
        )
        const value = dialog?.open && text ? text.value : await navigator.clipboard.readText()
        try {
          // 顯式核准的E2E診斷沿原讀取保存，不新增OS讀取、等待或成功門檻。
          window.__rdwebInputDiagnostics?.observeReadback(
            value,
            dialog?.open && text ? 'fallback' : 'native',
          )
        } catch {
          /* 診斷例外不得改變原oracle結果。 */
        }
        return value === publicExpected
      },
      expected,
    )
  } catch {
    return false
  }
}
// 成功仍只認完整native文字相等；失敗只回固定stage code與safe boolean，不輸出內容。
export async function assertPublicClipboard(
  page: Page,
  expected: string,
  sentinel: string,
  stage: ClipboardOracleStage,
): Promise<void> {
  try {
    await expect
      .poll(/* 公開expected只在browser RAM比較。 */ () => clipboardMatches(page, expected), {
        timeout: 10000,
      })
      .toBe(true)
    return
  } catch {
    /* 不回原始assertion或native error；下方僅收允許的分層證據。 */
  }
  let evidence
  try {
    evidence = await page.evaluate(
      // 原文字只留closure，OS讀取拒絕也只回布林，不讓內容進Playwright report。
      async ({ publicExpected, publicSentinel, codes }) => {
        const dialog = document.querySelector<HTMLDialogElement>(
          '[data-testid="console-clipboard-dialog"]',
        )
        const text = document.querySelector<HTMLTextAreaElement>(
          '[data-testid="console-clipboard-text"]',
        )
        const fallback = !!dialog?.open
        let value = '',
          readable = false,
          matched = false,
          sentinelUnchanged = false
        try {
          value = fallback && text ? text.value : await navigator.clipboard.readText()
          readable = true
          matched = value === publicExpected
          sentinelUnchanged = value === publicSentinel
          try {
            // 失敗摘要的既有最後讀取也可保存，文字不進入error／report。
            window.__rdwebInputDiagnostics?.observeReadback(
              value,
              fallback && text ? 'fallback' : 'native',
            )
          } catch {
            /* 維持原錯誤分類與strict結果。 */
          }
        } catch {
          /* 不保存或回傳native exception。 */
          try {
            // 最後讀取失敗不可沿用前一次poll資料冒充回讀。
            window.__rdwebInputDiagnostics?.observeReadback(null, 'unavailable')
          } catch {
            /* 診斷失敗仍不替換原oracle分類。 */
          }
        } finally {
          value = ''
        }
        const rawCode = document
          .querySelector('[data-testid="console-operation-error"]')
          ?.getAttribute('data-operation-code')
        const operationCode = !rawCode
          ? 'none'
          : codes.includes(rawCode as OperationCode)
            ? rawCode
            : 'unavailable'
        return {
          matched,
          readable,
          sentinelUnchanged,
          fallback,
          receiving: !!document.querySelector('[data-testid="console-clipboard-waiting"]'),
          inputActive: !!document.querySelector('[data-testid="console-input-active"]'),
          streaming: !!document.querySelector('[data-testid="console-streaming"]'),
          operationCode: operationCode as OperationCode | 'none',
        }
      },
      { publicExpected: expected, publicSentinel: sentinel, codes: [...OPERATION_CODES] },
    )
  } catch {
    throw new Error('input_clipboard_evidence_unavailable')
  }
  // deadline後才偶然相等不能把已失敗的poll改成成功；報告也只選固定bool欄位。
  const code = clipboardOracleCode(stage, evidence) ?? 'input_clipboard_' + stage + '_mismatch'
  let input = null
  try {
    input = await page.evaluate(
      // 僅Windows E2E observer存在時回固定boolean，不接受額外欄位或非boolean。
      (fields) => {
        const value = window.__rdwebInputDiagnostics?.snapshot()
        if (
          !value ||
          fields.some(
            /* 診斷不完整不可偽造成false證據。 */ (field) => typeof value[field] !== 'boolean',
          )
        )
          return null
        return Object.fromEntries(
          fields.map(/* 明確白名單，tag與payload永不回傳。 */ (field) => [field, value[field]]),
        )
      },
      [...INPUT_DIAGNOSTIC_FIELDS],
    )
  } catch {
    /* 診斷失敗不替換原oracle錯誤，也不印native exception。 */
  }
  throw new Error(
    code +
      ' ' +
      JSON.stringify({
        matched: evidence.matched === true,
        readable: evidence.readable === true,
        sentinelUnchanged: evidence.sentinelUnchanged === true,
        receiving: evidence.receiving === true,
        fallback: evidence.fallback === true,
        inputActive: evidence.inputActive === true,
        streaming: evidence.streaming === true,
        ...(input ? { input } : {}),
      }),
  )
}
