import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

// 根路徑 URL 在 HTTP 呼叫與 WebSocket／URL 建構式中都必須被 CI 拒絕。
const result = spawnSync(
  'node_modules/.bin/eslint',
  ['--stdin', '--stdin-filename', 'src/url-probe.ts', '--format', 'json'],
  {
    cwd: 'frontend',
    input:
      "fetch('/api/v1/health'); new WebSocket('/ws'); new URL('/assets/logo.svg', location.origin);",
    encoding: 'utf8',
  },
)
assert.ifError(result.error)
const report = JSON.parse(result.stdout)
assert.equal(result.status, 1)
assert.equal(
  report[0].messages.filter(
    // 只計算 URL 防護規則，避免其他 lint 診斷造成誤判。
    (message) => message.ruleId === 'no-restricted-syntax',
  ).length,
  3,
)
console.log('HTTP／WebSocket／URL 根路徑字面量限制：PASS')
