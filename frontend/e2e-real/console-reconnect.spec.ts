import { randomUUID } from 'node:crypto'
import type { Browser, Page, Response } from '@playwright/test'
import { test, expect } from './reconnect-fixtures'
import { resetStack, base } from '../e2e/helpers/fixtures'
import { openOfficialConsole, observeConsole } from './fixtures'
import {
  prepareInputTarget,
  clickRemote,
  startReceiving,
  assertPublicClipboard,
  assertCanvasEmptyAndWorkersClosed,
  waitForInputVideo,
  type InputFixture,
} from './input-fixtures'
import { inputPlatforms } from './windows-runtime'
import type { ReconnectLease, TunnelHandle } from './reconnect-proxy-types'
import { prepareReconnectCut } from './reconnect-preparation'

type CaseControl = { begin(target: string): ReconnectLease }
type Resources = ReturnType<typeof observeConsole>
let invocationCuts = 0

// 每案只重建console stack，不重置同案中的actor／quota或原生target來掩蓋失敗。
test.beforeEach(() => resetStack())

// 最後只輸出固定分類、計數與單調時間；不輸出URL、target、grant、frame或文字。
function record(
  stage: string,
  label: string,
  transport: string,
  lease?: ReconnectLease,
  resources?: Resources,
  cuts = 0,
): void {
  console.info(
    JSON.stringify({
      event: 'reconnect_native',
      utc: new Date().toISOString(),
      stage,
      case: label,
      platform: 'linux',
      transport,
      base,
      mode: process.env.PREFIX_MODE,
      cuts,
      ...(lease ? { summary: lease.summary() } : {}),
      ...(resources ? { resources: { ...resources } } : {}),
    }),
  )
}

// Pending accepted不許留下unhandled rejection；取消只在finally，不把拒絕當成功。
function next(lease: ReconnectLease, signal: AbortSignal): Promise<TunnelHandle> {
  const pending = lease.nextAccepted(signal)
  void pending.catch(/* 原promise仍由呼叫端await處理。 */ () => {})
  return pending
}

// 只切已接受且屬此case的pair，硬性限制每invocation最多12次，非控制API。
function cut(
  lease: ReconnectLease,
  handle: TunnelHandle,
  label: string,
  transport: string,
  count: number,
): void {
  if (invocationCuts >= 12 || count > (label === 'A' ? 2 : 4))
    throw new Error('reconnect_cut_budget')
  lease.interrupt(handle)
  invocationCuts++
  record('cut', label, transport, lease, undefined, count)
}

// 公開樣本文字只在短命browser RAM與完整相等oracle使用，不進report。
async function readRemote(page: Page, fixture: InputFixture, expected: string): Promise<void> {
  await page.evaluate(
    /* 公開sentinel防本機舊值冒充remote結果。 */ () =>
      navigator.clipboard.writeText('Public reconnect sentinel'),
  )
  await startReceiving(page)
  await clickRemote(page, fixture.editor.x + 80, fixture.editor.y + 30)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+c')
  await assertPublicClipboard(page, expected, 'Public reconnect sentinel', 'remote_input')
  await expect(page.getByTestId('console-clipboard-waiting')).toHaveCount(0)
}

// Linux Xaw用Ctrl+W刪選取；Windows尚未另獲操作許可，不以此helper冒充其oracle。
async function replaceAndRead(page: Page, fixture: InputFixture, expected: string): Promise<void> {
  if (fixture.platform !== 'linux') throw new Error('reconnect_native_platform_pending')
  await clickRemote(page, fixture.editor.x + 80, fixture.editor.y + 30)
  await expect(page.getByTestId('console-input-active')).toBeVisible()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+w')
  await page.keyboard.insertText(expected)
  await readRemote(page, fixture, expected)
}

// 10500ms內持續檢查，不能只看最末snapshot掩蓋期間多出attempt後又close。
async function noNewAttempt(
  page: Page,
  lease: ReconnectLease,
  resources: Resources,
): Promise<void> {
  const original = {
    accepted: lease.summary().accepted,
    tickets: lease.summary().routes.ticket.requested,
    metadata: lease.summary().routes.target.requested,
    opened: resources.opened,
  }
  const deadline = performance.now() + 10500
  do {
    const current = lease.summary()
    expect({
      accepted: current.accepted,
      tickets: current.routes.ticket.requested,
      metadata: current.routes.target.requested,
      opened: resources.opened,
    }).toEqual(original)
    await page.waitForTimeout(Math.min(100, Math.max(1, deadline - performance.now())))
  } while (performance.now() < deadline)
}

// 真metadata／me／ticket的首次時間與accepted逐列對應；只斷言scalar。
function freshAttempts(lease: ReconnectLease, count: number): void {
  const state = lease.summary()
  expect(state.accepted).toBe(count)
  expect(state.routes.ticket.requested).toBe(count)
  expect(state.attempts).toHaveLength(count)
  for (const row of state.attempts) {
    expect(
      row.meAt !== null &&
        row.ticketAt !== null &&
        row.acceptedAt !== null &&
        row.metadataAt <= row.meAt &&
        row.meAt <= row.ticketAt &&
        row.ticketAt <= row.acceptedAt,
    ).toBe(true)
  }
}

// 每案準備formal target後才begin lease；429一出現就作廢pending與關console，停止本輪。
async function nativeCase(
  page: Page,
  browser: Browser,
  control: CaseControl,
  platform: 'linux' | 'windows',
  transport: 'tcp' | 'ws',
  label: 'A' | 'B',
  body: (port: {
    page: Page
    fixture: InputFixture
    lease: ReconnectLease
    resources: Resources
    signal: AbortSignal
    first: TunnelHandle
  }) => Promise<number>,
): Promise<void> {
  if (platform !== 'linux') throw new Error('reconnect_native_platform_pending')
  let fixture: InputFixture | undefined,
    consolePage: Page | undefined,
    lease: ReconnectLease | undefined
  const resources = observeConsole(page.context())
  const controller = new AbortController()
  let rejectLimited!: (error: Error) => void
  const limited = new Promise<never>(
    /* 真HTTP429不是fake response或配額調整。 */ (_resolve, reject) => {
      rejectLimited = reject
    },
  )
  // 先裝原生response觀測，只保存status；不查response URL或body。
  const response = (value: Response): void => {
    if (value.status() === 429) {
      controller.abort()
      rejectLimited(new Error('reconnect_rate_limited'))
    }
  }
  page.context().on('response', response)
  let cuts = 0
  record('begin', label, transport)
  console.info('Reconnect browser: ' + browser.version())
  try {
    await Promise.race([
      limited,
      (async () => {
        fixture = await prepareInputTarget(platform, transport)
        lease = control.begin(fixture.targetId)
        const accepted = next(lease, controller.signal)
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
        consolePage = await openOfficialConsole(page, fixture)
        const first = await accepted
        await waitForInputVideo(consolePage, fixture)
        await expect(consolePage.getByTestId('console-auto-reconnect')).toBeChecked()
        record('initial_streaming', label, transport, lease, resources)
        cuts = await body({
          page: consolePage,
          fixture,
          lease,
          resources,
          signal: controller.signal,
          first,
        })
        expect(resources.wrongPrefix).toBe(0)
        await consolePage.getByTestId('console-end').click()
        await assertCanvasEmptyAndWorkersClosed(consolePage)
        await expect
          .poll(/* 真close而不是函數回傳。 */ () => resources.closed)
          .toBe(resources.opened)
        record('PASS', label, transport, lease, resources, cuts)
      })(),
    ])
  } finally {
    controller.abort()
    page.context().off('response', response)
    // 失敗同樣只能收此案自有page；不重建target或清理OS剪貼簿。
    try {
      if (consolePage && !consolePage.isClosed()) await consolePage.close()
    } finally {
      try {
        if (fixture) await fixture.context.dispose()
      } finally {
        if (lease) {
          await lease.close()
          expect(lease.summary()).toMatchObject({
            active: 0,
            sockets: 0,
            http: 0,
            upgrades: 0,
            waiters: 0,
            timers: 0,
            closed: true,
          })
        }
        const performed =
          lease
            ?.summary()
            .attempts.filter(/* 只計已由真interrupt標記的首次cut。 */ (row) => row.cutAt !== null)
            .length ?? 0
        record('finally', label, transport, lease, resources, performed)
      }
    }
  }
}

for (const platform of inputPlatforms()) {
  for (const transport of ['tcp', 'ws'] as const) {
    // A完整驗清理、真恢復、未接管不輸入、明確重新接管及waiting取消。
    test(`official reconnect restores and cancels over ${platform}/${transport}`, async ({
      page,
      browser,
      reconnectCase,
    }) => {
      await nativeCase(page, browser, reconnectCase, platform, transport, 'A', async (port) => {
        const { page: remote, fixture, lease, resources, signal, first } = port
        const sample = 'Public reconnect original ' + randomUUID()
        await replaceAndRead(remote, fixture, sample)
        const oldWorker = remote.workers()[0]
        expect(!!oldWorker).toBe(true)
        await startReceiving(remote)
        await clickRemote(remote, fixture.editor.x + 80, fixture.editor.y + 30)
        const prepared = await prepareReconnectCut(remote)
        expect(prepared).toEqual({
          focused: true,
          draftPresent: true,
          inputActive: true,
          receiving: true,
        })
        console.info(
          JSON.stringify({
            event: 'reconnect_precondition',
            case: 'A',
            platform,
            transport,
            state: prepared,
          }),
        )
        const recovered = next(lease, signal)
        const at = performance.now()
        cut(lease, first, 'A', transport, 1)
        // 所有清理必須同時在1秒內、首2秒retry前觀測，不能等receive自然5秒到期。
        await expect
          .poll(
            /* 只回安全布林，不輸出草稿。 */ () =>
              remote.evaluate(() => {
                const ime = document.querySelector<HTMLTextAreaElement>(
                  '[data-testid="console-ime"]',
                )
                return (
                  !!document.querySelector('[data-testid="console-reconnect"]') &&
                  !!ime &&
                  ime.value === '' &&
                  !document.querySelector('[data-testid="console-input-active"]') &&
                  !document.querySelector('[data-testid="console-clipboard-waiting"]')
                )
              }),
            { timeout: 1000, intervals: [10, 25, 50, 100] },
          )
          .toBe(true)
        expect(performance.now() - at < 1000).toBe(true)
        const second = await recovered
        await waitForInputVideo(remote, fixture)
        expect(remote.workers().includes(oldWorker!)).toBe(false)
        expect(resources.opened).toBe(2)
        await expect
          .poll(/* 舊Worker真正關閉才算fresh lifecycle。 */ () => resources.closed)
          .toBe(1)
        freshAttempts(lease, 2)
        await expect(remote.getByTestId('console-input-active')).toHaveCount(0)
        expect(
          await remote
            .getByTestId('console-ime')
            .evaluate(/* 不回原文。 */ (node) => (node as HTMLTextAreaElement).value === ''),
        ).toBe(true)
        await remote.keyboard.press('z')
        // 未重新接管的字母不得改遠端原sample，之後才手動點回／複製驗完整相等。
        await readRemote(remote, fixture, sample)
        await replaceAndRead(remote, fixture, 'Public reconnect fresh input ' + randomUUID())
        await remote.evaluate(
          /* 只拒絕下一次native read引出真fallback，不讀OS內容、不mock遠端。 */ () => {
            const original = navigator.clipboard.readText.bind(navigator.clipboard)
            Object.defineProperty(navigator.clipboard, 'readText', {
              configurable: true,
              value: /* 一次性拒絕後恢復原生入口。 */ () => {
                Object.defineProperty(navigator.clipboard, 'readText', {
                  configurable: true,
                  value: original,
                })
                return Promise.reject(new DOMException('Public denied fixture', 'NotAllowedError'))
              },
            })
          },
        )
        await remote.getByTestId('console-clipboard-send').click()
        await expect(remote.getByTestId('console-clipboard-dialog')).toBeVisible()
        await remote.getByTestId('console-clipboard-text').fill('Public unsent reconnect draft')
        expect(
          await remote
            .getByTestId('console-clipboard-text')
            .evaluate(
              /* 不回草稿文字。 */ (node) => (node as HTMLTextAreaElement).value.length > 0,
            ),
        ).toBe(true)
        cut(lease, second, 'A', transport, 2)
        await expect(remote.getByTestId('console-reconnect')).toBeVisible({ timeout: 1000 })
        await expect(remote.getByTestId('console-clipboard-dialog')).not.toBeVisible({
          timeout: 1000,
        })
        await remote.getByTestId('console-end').click()
        expect(
          await remote
            .getByTestId('console-clipboard-text')
            .evaluate(
              /* 原dialog可留DOM但文字必須清掉。 */ (node) =>
                (node as HTMLTextAreaElement).value === '',
            ),
        ).toBe(true)
        await assertCanvasEmptyAndWorkersClosed(remote)
        await noNewAttempt(remote, lease, resources)
        freshAttempts(lease, 2)
        return 2
      })
    })
    // B初始cut＋三個自動attempt各cut，耗盡後同actor手動retry，不重置auth／KV。
    test(`official reconnect exhausts and retries manually over ${platform}/${transport}`, async ({
      page,
      browser,
      reconnectCase,
    }) => {
      await nativeCase(
        page,
        browser,
        reconnectCase,
        platform,
        transport,
        'B',
        async ({ page: remote, fixture, lease, resources, signal, first }) => {
          let handle = first
          for (let retry = 1; retry <= 3; retry++) {
            const pending = next(lease, signal)
            cut(lease, handle, 'B', transport, retry)
            handle = await pending
            await expect(remote.getByTestId('console-reconnect')).toHaveText(
              '重新連線第 ' + retry + '／3 次',
            )
          }
          cut(lease, handle, 'B', transport, 4)
          await expect(remote.locator('[data-error-code="reconnect_exhausted"]')).toBeVisible({
            timeout: 10000,
          })
          freshAttempts(lease, 4)
          const rows = lease.summary().attempts
          for (let i = 0; i < 3; i++)
            expect(
              rows[i].cutAt !== null &&
                rows[i + 1].metadataAt - rows[i].cutAt! >= [2000, 5000, 10000][i]!,
            ).toBe(true)
          await noNewAttempt(remote, lease, resources)
          const manual = next(lease, signal)
          await remote.getByTestId('console-retry').click()
          await manual
          await waitForInputVideo(remote, fixture)
          freshAttempts(lease, 5)
          expect(resources.opened).toBe(5)
          await expect.poll(/* 四個原Worker都須已關。 */ () => resources.closed).toBe(4)
          await replaceAndRead(remote, fixture, 'Public reconnect manual input ' + randomUUID())
          return 4
        },
      )
    })
  }
}
