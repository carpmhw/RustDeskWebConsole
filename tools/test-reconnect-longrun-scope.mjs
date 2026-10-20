import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertLongrunScope } from './reconnect-longrun-scope.mjs'
const scope = {
  RDWEB_INPUT_PLATFORMS: 'linux',
  RDWEB_INPUT_CHANNELS: 'chromium',
  RDWEB_B3_BASES: '/rdweb',
  RDWEB_B3_MODES: 'preserve',
}
// 完整固定scope必須可用，不沿其他suite的root或Windows預設。
test('longrun accepts the exact explicit scope', () => {
  assert.doesNotThrow(() => assertLongrunScope(scope))
  assert.doesNotThrow(() =>
    assertLongrunScope({
      ...scope,
      RDWEB_INPUT_CHANNEL: 'chromium',
      APP_BASE_PATH: '/rdweb',
      PREFIX_MODE: 'preserve',
    }),
  )
})
// 缺少、衝突或擴大範圍皆在任何runtime副作用前拒絕。
test('longrun rejects missing mixed and widened scope', () => {
  const bad = [
    {},
    ...Object.keys(scope).map(
      /* 每個必填環境值獨立缺少。 */ (key) => ({ ...scope, [key]: undefined }),
    ),
    ...[
      { RDWEB_INPUT_PLATFORMS: 'windows' },
      { RDWEB_INPUT_PLATFORMS: 'linux,linux' },
      { RDWEB_INPUT_CHANNELS: '' },
      { RDWEB_INPUT_CHANNELS: 'chromium,msedge' },
      { RDWEB_INPUT_CHANNEL: 'chrome' },
      { RDWEB_B3_BASES: '/' },
      { RDWEB_B3_MODES: 'strip' },
      { APP_BASE_PATH: '/' },
      { PREFIX_MODE: 'strip' },
    ].map(/* 合成公開負向scope。 */ (value) => ({ ...scope, ...value })),
  ]
  for (const env of bad)
    assert.throws(() => assertLongrunScope(env), { message: 'longrun_scope_unavailable' })
})
// 真wrapper只跑複製到隔離目錄的公開CLI替身，絕不執行正式longrun。
test('longrun wrapper accepts one exact config and preserves fail-fast arguments', () => {
  const dir = mkdtempSync('/tmp/opencode/longrun-wrapper-')
  try {
    mkdirSync(join(dir, 'tools'))
    mkdirSync(join(dir, 'frontend/node_modules/@playwright/test'), { recursive: true })
    copyFileSync(
      'tools/run-reconnect-playwright.mjs',
      join(dir, 'tools/run-reconnect-playwright.mjs'),
    )
    writeFileSync(
      join(dir, 'frontend/node_modules/@playwright/test/cli.js'),
      'process.stdout.write(JSON.stringify(process.argv.slice(2)))',
    )
    const good = spawnSync(
      process.execPath,
      [join(dir, 'tools/run-reconnect-playwright.mjs'), 'playwright.reconnect-longrun.config.ts'],
      { env: {}, encoding: 'utf8', timeout: 5000 },
    )
    assert.equal(good.status, 0)
    assert.deepEqual(JSON.parse(good.stdout), [
      'test',
      '--config',
      join(dir, 'frontend/playwright.reconnect-longrun.config.ts'),
      '--max-failures=1',
    ])
    const bad = spawnSync(
      process.execPath,
      [join(dir, 'tools/run-reconnect-playwright.mjs'), 'unknown.config.ts'],
      { env: {}, encoding: 'utf8', timeout: 5000 },
    )
    assert.equal(bad.status, 2)
    assert.equal(bad.stdout, '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
