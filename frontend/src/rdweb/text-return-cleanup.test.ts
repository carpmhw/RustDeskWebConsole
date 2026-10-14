import { expect, it } from 'vitest'
import { textReturnCleanupCode, textReturnLogCode } from '../../e2e-real/text-return-cleanup'
// 正常的remote_input結果只有在所有自有資源已收尾時才可保持成功。
it('returns a fixed cleanup error when an owned resource remains open', () => {
  expect(textReturnCleanupCode(false)).toBe('text_return_cleanup_unavailable')
})
// 收尾成功不改寫原strict oracle結果。
it('keeps the original oracle result when cleanup succeeds', () => {
  expect(textReturnCleanupCode(true)).toBe(null)
})
// 嚴格回讀成功但log未保存時也不能印出probe PASS。
it('reports a fixed log failure when the requested record was not saved', () => {
  expect(textReturnLogCode(false)).toBe('clipboard_text_log_unavailable')
  expect(textReturnLogCode(true)).toBe(null)
})
