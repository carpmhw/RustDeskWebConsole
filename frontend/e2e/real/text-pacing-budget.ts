import { INTERACTION_LIMITS } from '../../src/rdweb/interaction-limits'

// Windows控速逐code point送出時，E2E等待「文字段已完整提交」的上限：基礎2秒＋每字（間隔＋50ms往返餘裕）。
export function pacedTextBudgetMs(text: string): number {
  return 2000 + Array.from(text).length * (INTERACTION_LIMITS.textGapMs + 50)
}
