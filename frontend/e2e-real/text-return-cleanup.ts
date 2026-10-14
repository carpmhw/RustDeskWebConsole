export type TextReturnCleanupCode = 'text_return_cleanup_unavailable'
// 有任何自有資源未收尾都固定回錯誤，不把strict回讀成功冒充整案成功。
export function textReturnCleanupCode(cleanupSucceeded: boolean): TextReturnCleanupCode | null {
  return cleanupSucceeded ? null : 'text_return_cleanup_unavailable'
}
// 嚴格回讀成功但requested log沒保存時固定失敗，不回報診斷PASS。
export function textReturnLogCode(logSaved: boolean): 'clipboard_text_log_unavailable' | null {
  return logSaved ? null : 'clipboard_text_log_unavailable'
}
