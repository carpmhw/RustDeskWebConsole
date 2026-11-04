import { expect, test } from '@playwright/test'
import { totpCode } from './helpers/totp'

// 公開RFC6238 SHA-1測試向量，不含測試私鑰或live code。
test('TOTP oracle matches RFC6238 public vector', () => {
  expect(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000)).toBe('287082')
})
