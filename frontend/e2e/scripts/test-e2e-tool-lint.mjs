import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { test } from 'node:test'

const frontend = fileURLToPath(new URL('../../', import.meta.url))

// 直接執行 CI 使用的 ESLint 與 frontend 設定，不建立或修改待檢查的來源檔。
function lint(input) {
  const result = spawnSync(
    process.execPath,
    [
      frontend + 'node_modules/eslint/bin/eslint.js',
      '--stdin',
      '--stdin-filename',
      'e2e/scripts/public-lint-probe.mjs',
      '--format',
      'json',
    ],
    { cwd: frontend, input, encoding: 'utf8', timeout: 30000 },
  )
  assert.ifError(result.error)
  return { status: result.status, messages: JSON.parse(result.stdout)[0].messages }
}

// 搬移工具仍必須拒絕未宣告名稱、寬鬆比較及未使用變數，不能僅依賴前端 TypeScript 規則。
test('E2E Node tools retain the original undefined equality and unused checks', () => {
  const result = lint(
    "undeclaredE2eTool(); if (process.platform == 'linux') console.log('public'); const unusedE2eTool = 1;",
  )
  assert.equal(result.status, 1)
  for (const rule of ['no-undef', 'eqeqeq', 'no-unused-vars']) {
    assert.equal(
      result.messages.filter(
        /* 每條舊工具規則都必須實際產生診斷。 */ (entry) => entry.ruleId === rule,
      ).length,
      1,
      rule,
    )
  }
})

// Node 工具既有的唯讀 globals 必須保持可用，不能因補回 no-undef 誤擋合法程式。
test('E2E Node tools accept the existing readonly runtime globals', () => {
  const result = lint("console.log(Buffer.byteLength('public'), process.platform, typeof fetch);")
  assert.equal(result.status, 0)
  assert.deepEqual(result.messages, [])
})
