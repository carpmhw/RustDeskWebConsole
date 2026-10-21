import { expect, test } from '@playwright/test'

// 公開fixture只驗正式列印CSS：螢幕dialog的高度限制不可裁掉放大文字後的備援碼。
test('recovery printing keeps all public codes in normal page flow', async ({ page }) => {
  await page.goto('/e2e/ui/index.html')
  await page.emulateMedia({ media: 'print' })
  // 固定公開文字與原Teleport相同的body直接子層，沒有真secret或系統列印操作。
  const printed = await page.evaluate(() => {
    const dialog = document.createElement('dialog')
    dialog.className = 'recovery-dialog'
    dialog.open = true
    const title = document.createElement('h2')
    title.textContent = '公開列印fixture'
    const codes = document.createElement('ol')
    codes.className = 'recovery-list'
    codes.style.fontSize = '28px'
    for (let index = 0; index < 10; index++) {
      const code = document.createElement('li')
      code.textContent = 'PUBLIC-BACKUP-NOT-A-REAL-CODE'
      codes.append(code)
    }
    dialog.append(title, codes)
    document.body.append(dialog)
    document.body.dataset.printing = 'recovery'
    const style = getComputedStyle(dialog)
    return {
      maxHeight: style.maxHeight,
      overflow: style.overflowY,
      clipped: dialog.scrollHeight > dialog.clientHeight + 1,
      position: style.position,
    }
  })
  expect(printed.clipped).toBe(false)
  expect(printed.maxHeight).toBe('none')
  expect(printed.overflow).toBe('visible')
  expect(printed.position).toBe('static')
})
