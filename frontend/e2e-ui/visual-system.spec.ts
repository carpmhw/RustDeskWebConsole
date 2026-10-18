import { expect, test } from '@playwright/test'
import { contrastRatio, pageOverflows, readContrastSamples } from './helpers'

const colors = {
  light: {
    page: '#f1ede5',
    surface: '#fffdfa',
    raised: '#f7f1e6',
    input: '#fcf8f0',
    ink: '#32291b',
    muted: '#655640',
    line: '#92816a',
    'soft-line': '#c1b39b',
    primary: '#805414',
    'on-primary': '#ffffff',
    subtle: '#faedcf',
    accent: '#006d65',
    success: '#08744f',
    'success-bg': '#e0f4e9',
    warning: '#943900',
    'warning-bg': '#ffedda',
    danger: '#a52a32',
    'danger-bg': '#ffebeb',
  },
  dark: {
    page: '#191816',
    surface: '#2a2925',
    raised: '#39372f',
    input: '#201f1b',
    ink: '#faf6ed',
    muted: '#d2c8b4',
    line: '#948973',
    'soft-line': '#665f50',
    primary: '#f3c56b',
    'on-primary': '#352403',
    subtle: '#49391e',
    accent: '#8ddcd3',
    success: '#5ee9aa',
    'success-bg': '#183f3a',
    warning: '#ffb57a',
    'warning-bg': '#442a17',
    danger: '#ffb4ab',
    'danger-bg': '#462727',
  },
} as const

// 手算的黑白對比與同色對比校準helper，避免量測工具本身永遠給出通過。
test('contrast measurement uses linear sRGB and alpha compositing', () => {
  expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe(21)
  expect(contrastRatio('rgb(100, 100, 100)', 'rgb(100, 100, 100)')).toBe(1)
  expect(contrastRatio('rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)')).toBe(1)
  expect(contrastRatio('rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)')).toBeCloseTo(3.98, 2)
})

for (const theme of ['light', 'dark'] as const) {
  // 改錯正式色票或狀態class會失敗，非重複草圖宣告或測試自有CSS。
  test(`graphite amber colors and semantic states: ${theme}`, async ({ page }) => {
    await page.goto('/e2e-ui/index.html')
    // 主題切換只設定既有的公開data attribute，不載入任何認證狀態。
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    // 色票表來自核准spec的獨立literal，實際值只從正式CSS讀取。
    const actual = await page.evaluate((keys) => {
      const style = getComputedStyle(document.documentElement)
      // 壓縮器可把#ffffff寫成#fff，先正規化等價色碼，不把格式當視覺結果。
      return Object.fromEntries(
        keys.map((key) => [
          key,
          style
            .getPropertyValue('--' + key)
            .trim()
            .replace(/^#([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3'),
        ]),
      )
    }, Object.keys(colors[theme]))
    expect(actual).toEqual(colors[theme])
    for (const [id, key] of [
      ['success', 'success'],
      ['warning', 'warning'],
      ['error', 'danger'],
      ['danger', 'danger'],
      ['badge-success', 'success'],
      ['badge-warning', 'warning'],
      ['badge-danger', 'danger'],
    ] as const) {
      // 將獨立色值交瀏覽器解析，避免直接用正式token作預期。
      const expected = await page.evaluate((value) => {
        const node = document.createElement('span')
        node.style.color = value
        document.body.append(node)
        const result = getComputedStyle(node).color
        node.remove()
        return result
      }, colors[theme][key])
      await expect(page.locator('#' + id)).toHaveCSS('color', expected)
    }
    for (const sample of await readContrastSamples(page)) {
      expect(sample.ratio, sample.id).toBeGreaterThanOrEqual(sample.minimum)
    }
  })

  for (const width of [375, 768, 1024, 1440]) {
    // 長英文／端點與200%文字放大只應造成局部表格捲動，不可撐寬頁面。
    test(`readable layout at ${width}px: ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/e2e-ui/index.html')
      // 固定公開fixture可放大文字驗可讀性，不變更正式app的字級工具。
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)
      expect(await pageOverflows(page)).toBe(false)
      for (const sample of await readContrastSamples(page))
        expect(sample.ratio, sample.id).toBeGreaterThanOrEqual(sample.minimum)
      await page.evaluate(() => {
        // 先取全部原始字級，避免逐層放大時把繼承值重複乘二。
        const sizes = Array.from(
          document.querySelectorAll<HTMLElement>('body, body *'),
          (element) => ({ element, size: parseFloat(getComputedStyle(element).fontSize) }),
        )
        for (const { element, size } of sizes) {
          element.style.fontSize = size * 2 + 'px'
        }
      })
      expect(await pageOverflows(page)).toBe(false)
      const table = page.locator('.table-scroll')
      // 表格確實可以在自己的容器捲動，避免以切掉內容取得假通過。
      await expect(table).toHaveCSS('overflow-x', 'auto')
      const needsScroll = await table.evaluate((node) => node.scrollWidth > node.clientWidth)
      if (width === 375) expect(needsScroll).toBe(true)
      if (needsScroll) {
        await table.evaluate((node) => {
          node.scrollLeft = node.scrollWidth
        })
        expect(await table.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
      }
    })
  }

  // hover／active／focus都讀正式互動樣式，並以原生Escape關閉公開dialog。
  test(`keyboard, dialog and interactive contrast: ${theme}`, async ({ page }) => {
    await page.goto('/e2e-ui/index.html')
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    await page.keyboard.press('Tab')
    await expect(page.locator('#public-name')).toBeFocused()
    await expect(page.locator('#public-name')).toHaveCSS('outline-style', 'solid')
    for (const sample of await readContrastSamples(page))
      expect(sample.ratio, sample.id).toBeGreaterThanOrEqual(sample.minimum)
    await page.locator('#primary').hover()
    // 等到正式過渡結束後量測可見顏色，而非動畫中間採樣。
    await page.waitForTimeout(220)
    for (const sample of await readContrastSamples(page))
      expect(sample.ratio, sample.id).toBeGreaterThanOrEqual(sample.minimum)
    await page.mouse.down()
    for (const sample of await readContrastSamples(page))
      expect(sample.ratio, sample.id).toBeGreaterThanOrEqual(sample.minimum)
    await page.mouse.up()
    await page.locator('#open-dialog').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    for (const sample of await readContrastSamples(page))
      expect(sample.ratio, sample.id).toBeGreaterThanOrEqual(sample.minimum)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.locator('#open-dialog')).toBeFocused()
  })
}

// 減少動態偏好下，不得留下循環動畫或按鈕過渡。
test('reduced motion removes transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/e2e-ui/index.html')
  await expect(page.locator('#primary')).toHaveCSS('transition-duration', '0s')
  await expect(page.locator('#primary')).toHaveCSS('animation-name', 'none')
})

// 主題切換時不可讓文字、placeholder及控制邊界落在低對比的插值色。
test('theme changes keep controls readable during transitions', async ({ page }) => {
  await page.goto('/e2e-ui/index.html')
  for (const theme of ['dark', 'light']) {
    // 測真正data-theme切換，不關閉動畫來掩蓋中間狀態。
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    for (const delay of [0, 40, 80, 160, 220]) {
      if (delay) await page.waitForTimeout(delay)
      for (const sample of await readContrastSamples(page))
        expect(sample.ratio, `${theme}:${sample.id}`).toBeGreaterThanOrEqual(sample.minimum)
    }
  }
})

// 公開fixture不可暗中呼叫API、WS、外站或系統clipboard。
test('public visual fixture has no remote or clipboard side effects', async ({ page }) => {
  const unexpected: string[] = []
  let errors = 0
  // 僅記安全分類，未知請求直接攔截，不輸出URL或內容。
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== 'http://127.0.0.1:18083' || url.pathname.includes('/api/')) {
      unexpected.push('request')
      await route.abort()
    } else await route.continue()
  })
  // 只收runtime錯誤計數，不回顯例外字串。
  page.on('pageerror', () => {
    errors++
  })
  // fixture沒有WS需求，任何嘗試都應失敗並被計數。
  page.on('websocket', () => {
    unexpected.push('websocket')
  })
  // 在載入前封鎖真系統clipboard，只保留安全呼叫計數。
  await page.addInitScript(() => {
    const state = window as Window & { publicClipboardCalls?: number }
    state.publicClipboardCalls = 0
    // 每個入口均拒絕且計數，測試不讀寫宿主的真實內容。
    const denied = () => {
      state.publicClipboardCalls = (state.publicClipboardCalls ?? 0) + 1
      return Promise.reject(new Error('Disabled in public fixture'))
    }
    Object.defineProperty(navigator, 'clipboard', {
      value: { read: denied, write: denied, readText: denied, writeText: denied },
    })
  })
  await page.goto('/e2e-ui/index.html')
  await page.locator('#open-dialog').click()
  await page.keyboard.press('Escape')
  expect(unexpected).toEqual([])
  expect(errors).toBe(0)
  expect(
    await page.evaluate(
      () => (window as Window & { publicClipboardCalls?: number }).publicClipboardCalls,
    ),
  ).toBe(0)
})
