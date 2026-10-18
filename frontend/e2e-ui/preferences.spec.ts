import { expect, test } from '@playwright/test'
import { pageOverflows } from './helpers'

const fixture = '/e2e-ui/index.html?scene=preferences'

// 新表單若不提供真主題控制，或setter不再處理儲存失敗，當次操作必須失敗。
test('preferences survive blocked storage and system changes', async ({ page }) => {
  // 模擬隱私環境封鎖Storage，測試不建立第二份偏好或假store。
  await page.addInitScript(() => {
    // 讀寫都拒絕，正式偏好工具必須自行安全回退。
    const denied = () => {
      throw new Error('Storage blocked in public fixture')
    }
    Object.defineProperty(Storage.prototype, 'getItem', { value: denied })
    Object.defineProperty(Storage.prototype, 'setItem', { value: denied })
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(fixture)
  const controls = page.locator('.display-preferences')
  expect(await controls.locator('[data-theme-choice]').count()).toBe(3)
  await controls.locator('[data-theme-choice="dark"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(controls.locator('[data-theme-choice="dark"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await controls.getByLabel('頁面時區').selectOption('UTC')
  await expect(controls.getByLabel('頁面時區')).toHaveValue('UTC')
  await controls.getByLabel('語言').selectOption('en')
  await expect(controls.getByLabel('Language')).toHaveValue('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(controls.getByLabel('Display time zone')).toHaveValue('UTC')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

// storage物件本身不可取時，也不能讓偏好元件無法掛載。
test('preferences remain usable when localStorage getter throws', async ({ page }) => {
  // 與方法拋錯分開，覆蓋window getter先失敗的瀏覽器情境。
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      // 不查詢宿主儲存，只模擬瀏覽器拒絕存取。
      get: () => {
        throw new Error('Storage access denied in public fixture')
      },
    })
  })
  await page.goto(fixture)
  expect(await page.locator('[data-theme-choice]').count()).toBe(3)
  await page.locator('[data-theme-choice="light"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

// 刪掉合法別名選項或改由Intl列表覆寫目前偏好，都會讓原值消失。
test('saved alias remains selectable', async ({ page }) => {
  // 固定公開非敏感設定，不讀寫任何帳號或票證。
  await page.addInitScript(() => localStorage.setItem('rdweb.displayTimeZone', 'Etc/UTC'))
  await page.goto(fixture)
  expect(await page.locator('[data-theme-choice]').count()).toBe(3)
  await expect(page.getByLabel('頁面時區')).toHaveValue('Etc/UTC')
  await expect(
    page.getByLabel('頁面時區').getByRole('option', { name: 'Etc/UTC', exact: true }),
  ).toHaveCount(1)
})

// 手動模式不能被matchMedia變更覆寫，system模式則應即時跟隨。
test('manual mode ignores system changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(fixture)
  expect(await page.locator('[data-theme-choice]').count()).toBe(3)
  await page.locator('[data-theme-choice="dark"]').click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.locator('[data-theme-choice="system"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

// 真元件必須沿原三個storage keys儲存並於reload恢復，不另造偏好資料來源。
test('saved display preferences restore after reload', async ({ page }) => {
  await page.goto(fixture)
  expect(await page.locator('[data-theme-choice]').count()).toBe(3)
  await page.locator('[data-theme-choice="dark"]').click()
  await page.getByLabel('頁面時區').selectOption('UTC')
  await page.getByLabel('語言').selectOption('en')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByLabel('Language')).toHaveValue('en')
  await expect(page.getByLabel('Display time zone')).toHaveValue('UTC')
  // 僅在公開fixture核對非敏感keys，不對真認證頁做storage dump。
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([
    'rdweb.colorMode',
    'rdweb.displayTimeZone',
    'rdweb.locale',
  ])
})

// 不合法的DOM事件不得把未知locale或時區寫進既有store。
test('unknown preference choices leave the current values intact', async ({ page }) => {
  await page.goto(fixture)
  expect(await page.locator('[data-theme-choice]').count()).toBe(3)
  // 直接派發空值change，覆蓋程式化事件而不引入假的認證操作。
  await page.getByLabel('語言').evaluate((node: HTMLSelectElement) => {
    node.value = 'not-a-locale'
    node.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(page.getByLabel('語言')).toHaveValue('zh-TW')
  await page.getByLabel('頁面時區').evaluate((node: HTMLSelectElement) => {
    node.value = 'not-a-zone'
    node.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.getByLabel('頁面時區')).toHaveValue('Asia/Taipei')
  // reload檢查儲存沒有被非法輸入污染，當次store值仍由下一次合法選擇處理。
  await page.reload()
  await expect(page.getByLabel('語言')).toHaveValue('zh-TW')
  await expect(page.getByLabel('頁面時區')).toHaveValue('Asia/Taipei')
})

for (const width of [375, 768, 1024, 1440]) {
  // 同一正式表單在兩語系與四寬度可鍵盤操作，不因時區選項撐寬頁面。
  test(`display controls remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(fixture)
    expect(await page.locator('[data-theme-choice]').count()).toBe(3)
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-theme-choice="light"]')).toBeFocused()
    await expect(page.locator('[data-theme-choice="light"]')).toHaveCSS('outline-style', 'solid')
    expect(await pageOverflows(page)).toBe(false)
    await page.getByLabel('語言').selectOption('en')
    expect(await pageOverflows(page)).toBe(false)
    await page.getByLabel('Display time zone').selectOption('UTC')
    await expect(page.getByLabel('Display time zone')).toHaveValue('UTC')
  })
}
