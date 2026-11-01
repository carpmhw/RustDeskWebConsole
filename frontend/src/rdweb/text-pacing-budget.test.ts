import { expect, it } from 'vitest'
import { pacedTextBudgetMs } from '../../e2e/real/text-pacing-budget'
import { INTERACTION_LIMITS } from './interaction-limits'

// E2E等待上限依code point數與控速間隔計算；代理對算一字。
it('computes the paced text wait budget from code points and the text gap', () => {
  expect(pacedTextBudgetMs('Public 中文 RdWeb 00000000-0000-4000-8000-000000000000')).toBe(
    2000 + 52 * (INTERACTION_LIMITS.textGapMs + 50),
  )
  expect(pacedTextBudgetMs('😀')).toBe(2000 + 1 * (INTERACTION_LIMITS.textGapMs + 50))
})
