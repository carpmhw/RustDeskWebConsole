import { test, expect, type Page } from '@playwright/test'
import { reconnectPreparation, prepareReconnectCut } from '../real/reconnect-preparation'

// 只用公開DOM producer控制徽章延遲，不冒充真Console.vue／Worker／RustDesk或OS剪貼簿。
async function publicPreparation(
  page: Page,
  options: { focus?: boolean; badge?: number; stopReceiving?: number; clearDraft?: boolean } = {},
): Promise<void> {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'))
  await page.setContent(
    '<!doctype html><textarea data-testid="console-ime"></textarea><p data-testid="console-clipboard-waiting">Public receiving</p>',
  )
  await page.evaluate((settings) => {
    const ime = document.querySelector<HTMLTextAreaElement>('[data-testid="console-ime"]')!
    if (settings.focus !== false) ime.focus()
    if (settings.clearDraft)
      ime.addEventListener(
        'beforeinput',
        /* 模擬未接受composition的DOM邊界，不能假造draft成功。 */ () => {
          ime.value = ''
        },
      )
    if (settings.badge !== undefined)
      setTimeout(
        /* 只延後公開徽章，不延後真focus或自動點畫面。 */ () => {
          const badge = document.createElement('p')
          badge.dataset.testid = 'console-input-active'
          document.body.append(badge)
        },
        settings.badge,
      )
    if (settings.stopReceiving !== undefined)
      setTimeout(
        /* 原receive一旦結束不得由helper重新啟動。 */ () =>
          document.querySelector('[data-testid="console-clipboard-waiting"]')?.remove(),
        settings.stopReceiving,
      )
  }, options)
}

// 相同原合取會把只有徽章尚未render的合法準備誤判失敗；必須先等徽章才建立草稿。
test('preparation waits for the rendered focus badge before composing', async ({ page }) => {
  await publicPreparation(page, { badge: 100 })
  expect(await reconnectPreparation(page)).toEqual({
    focused: true,
    draftPresent: false,
    inputActive: false,
    receiving: true,
  })
  const pending = prepareReconnectCut(page)
  // 確保舊即時實作已執行，才能以100ms時序反例捕捉而不是工具排程僥倖通過。
  await page.evaluate(/* 公開DOM task barrier沒有產品或OS副作用。 */ () => {})
  expect((await reconnectPreparation(page)).draftPresent).toBe(false)
  await page.clock.runFor(100)
  expect(await pending).toEqual({
    focused: true,
    draftPresent: true,
    inputActive: true,
    receiving: true,
  })
})

// 舊徽章不能代替真正focus，helper不得偷偷focus來讓測試通過。
test('preparation refuses missing focus even with a stale badge', async ({ page }) => {
  await publicPreparation(page, { focus: false, badge: 0 })
  await page.clock.runFor(1)
  await expect(prepareReconnectCut(page)).rejects.toThrow('reconnect_precondition_failed')
  expect((await reconnectPreparation(page)).focused).toBe(false)
})

// 等徽章時receive中止即失敗，不能重啟五秒窗或等待之後新徽章冒充原操作。
test('preparation refuses a receive that ends before the badge arrives', async ({ page }) => {
  await publicPreparation(page, { badge: 100, stopReceiving: 50 })
  const pending = prepareReconnectCut(page)
  const observed = pending.then(
    /* 只回成功與否，不回草稿。 */ () => false,
    /* 固定分類辨認真正拒絕。 */ (error: Error) =>
      error.message.startsWith('reconnect_precondition_failed'),
  )
  await page.evaluate(/* 不假造frame／Worker成功的task barrier。 */ () => {})
  await page.clock.runFor(100)
  expect(await observed).toBe(true)
  expect((await reconnectPreparation(page)).receiving).toBe(false)
})

// 非空草稿是必要前置，controller清掉後不得只比焦點／徽章當成功。
test('preparation refuses a cleared draft and reports only safe booleans', async ({ page }) => {
  await publicPreparation(page, { badge: 0, clearDraft: true })
  await page.clock.runFor(1)
  let message = ''
  try {
    await prepareReconnectCut(page)
  } catch (error) {
    message = error instanceof Error ? error.message : 'unexpected'
  }
  expect(message.startsWith('reconnect_precondition_failed ')).toBe(true)
  expect(message.includes('Public unfinished composition')).toBe(false)
  expect(JSON.parse(message.slice('reconnect_precondition_failed '.length))).toEqual({
    focused: true,
    draftPresent: false,
    inputActive: true,
    receiving: true,
  })
})

// 徽章永不出現時只有有界失敗，不能sleep五秒直到原receive期限或假報prepared。
test('preparation has a one-second budget and never rearms receiving', async ({ page }) => {
  await publicPreparation(page)
  const at = performance.now()
  await expect(prepareReconnectCut(page)).rejects.toThrow('reconnect_precondition_failed')
  expect(performance.now() - at < 1500).toBe(true)
  expect((await reconnectPreparation(page)).draftPresent).toBe(false)
  expect((await reconnectPreparation(page)).receiving).toBe(true)
})

// 專用工具的成功也不得讀寫OS clipboard或建立Worker／WS／HTTP請求。
test('preparation uses only DOM and leaves native ports untouched', async ({ page }) => {
  let requests = 0,
    workers = 0,
    sockets = 0
  page.on('request', /* 任意網路請求都是越界。 */ () => requests++)
  page.on('worker', /* 無worker lifecycle可被當成功。 */ () => workers++)
  page.on('websocket', /* 不建立真或fake遠端tunnel。 */ () => sockets++)
  await publicPreparation(page, { badge: 0 })
  await page.clock.runFor(1)
  await page.evaluate(
    /* native API是禁止入口，測試端不應碰到getter。 */ () => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        get: /* 防任何未預期OS讀寫。 */ () => {
          throw new Error('public_native_clipboard_forbidden')
        },
      })
    },
  )
  expect(await prepareReconnectCut(page)).toEqual({
    focused: true,
    draftPresent: true,
    inputActive: true,
    receiving: true,
  })
  expect({ requests, workers, sockets }).toEqual({ requests: 0, workers: 0, sockets: 0 })
})
