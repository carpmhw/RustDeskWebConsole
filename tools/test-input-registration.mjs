import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

// 子程序只繼承一般工具路徑與公開fixture；list不能連任何遠端或載操作者秘密。
function list(overrides = {}) {
  return spawnSync(
    'corepack',
    [
      'pnpm',
      '--dir',
      'frontend',
      'exec',
      'playwright',
      'test',
      '--config',
      'playwright.input.config.ts',
      '--list',
    ],
    {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...overrides },
      encoding: 'utf8',
      timeout: 30000,
    },
  )
}
const runtime = {
  RDWEB_WINDOWS_ID_TCP: 'fixture.example:21116',
  RDWEB_WINDOWS_RELAY_TCP: 'fixture.example:21117',
  RDWEB_WINDOWS_ID_WS: 'fixture.example:21118',
  RDWEB_WINDOWS_RELAY_WS: 'fixture.example:21119',
  RDWEB_WINDOWS_PUBLIC_KEY: 'public-fixture-key',
  RDWEB_WINDOWS_TARGET_ID: '123456789',
  RDWEB_WINDOWS_PASSWORD: 'public-fixture-password',
  RDWEB_WINDOWS_EDITOR_X: '0',
  RDWEB_WINDOWS_EDITOR_Y: '61',
  RDWEB_WINDOWS_EDITOR_WIDTH: '1398',
  RDWEB_WINDOWS_EDITOR_HEIGHT: '894',
}
// Requested Windows缺runtime須在tests registration階段fail，不列Linux假通過。
test('requested Windows without credentials fails before test registration', () => {
  const result = list({ RDWEB_INPUT_PLATFORMS: 'windows' })
  assert.equal(result.status !== 0, true)
  assert.equal(
    (result.stdout + result.stderr).includes('Windows runtime fixture unavailable'),
    true,
  )
  assert.equal(result.stdout.includes('public Linux'), false)
})
// Windows-only不能出現Linux tests，TCP／WS須各有一個初始nativeoracle。
test('Windows-only registers the two native clipboard oracles, not Linux', () => {
  const result = list({ ...runtime, RDWEB_INPUT_PLATFORMS: 'windows' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout.includes('public Linux'), false)
  assert.equal(result.stdout.includes('public Windows text and clipboard oracle over tcp'), true)
  assert.equal(result.stdout.includes('public Windows text and clipboard oracle over ws'), true)
  assert.equal(result.stdout.includes('Total: 2 tests'), true)
})
// 雙平台保留既有16案，追加一個formal API contract與Windows兩案，不能覆寫原Linux驗收。
test('both platforms retain the existing sixteen Linux cases', () => {
  const result = list({ ...runtime, RDWEB_INPUT_PLATFORMS: 'linux,windows' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout.includes('Total: 19 tests'), true)
})
// Chromium不冒充Chrome；兩個channel以獨立project註冊，缺安裝於launch時明確失敗。
test('explicit channels produce separate projects and preserve legacy channel selection', () => {
  const result = list({
    ...runtime,
    RDWEB_INPUT_PLATFORMS: 'windows',
    RDWEB_INPUT_CHANNELS: 'chromium,msedge',
  })
  assert.equal(result.status, 0)
  assert.equal(result.stdout.includes('[chromium]'), true)
  assert.equal(result.stdout.includes('[msedge]'), true)
  assert.equal(result.stdout.includes('Total: 4 tests'), true)
  const legacy = list({
    ...runtime,
    RDWEB_INPUT_PLATFORMS: 'windows',
    RDWEB_INPUT_CHANNEL: 'msedge',
  })
  assert.equal(legacy.status, 0)
  assert.equal(legacy.stdout.includes('[msedge]'), true)
})
// 重複／空／未知channel與未知platform均fail closed，不產生無測試成功。
for (const overrides of [
  { RDWEB_INPUT_CHANNELS: '' },
  { RDWEB_INPUT_CHANNELS: 'chromium,chromium' },
  { RDWEB_INPUT_CHANNELS: 'unknown' },
  { RDWEB_INPUT_PLATFORMS: 'other' },
]) {
  // test title只放公開欄位名稱。
  test('invalid registration is rejected: ' + Object.keys(overrides)[0], () => {
    assert.equal(list(overrides).status !== 0, true)
  })
}
