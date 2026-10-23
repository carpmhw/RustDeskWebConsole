import { test } from '@playwright/test'
import { executeReceiverCase } from './test-receiver-scenario'

// 單案只驗正式Console到既有saved target的receiver client證據，不宣稱Windows host結果。
test('receiver client scenario over saved target (not host verification)', async ({ page }) => {
  await executeReceiverCase(page)
})
