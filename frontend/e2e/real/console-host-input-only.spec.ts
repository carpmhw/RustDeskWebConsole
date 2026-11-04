import { test } from '@playwright/test'
import { executeHostInputOnlyCase } from './host-input-only-scenario'

// 單案僅驗診斷生命週期，host分類獨立匯入且不表示原HR PASS。
test('diagnostic Windows host input-only over tcp (not HR verification)', async ({ page }) => {
  await executeHostInputOnlyCase(page)
})
