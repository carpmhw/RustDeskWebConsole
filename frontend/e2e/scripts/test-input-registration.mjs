import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

// 子程序只繼承一般工具路徑與公開fixture；list不能連任何遠端或載操作者秘密。
function list(overrides = {}, config = 'playwright.input.config.ts') {
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
      'e2e/config/' + config,
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
// 真list須恰兩案且不需owner；非法scope不能用預設Linux偷跑。
test('ingress registers exactly two fixed scenarios', () => {
  const scope = {
    RDWEB_INPUT_PLATFORMS: 'linux',
    RDWEB_INPUT_CHANNELS: 'chromium',
    RDWEB_B3_BASES: '/rdweb',
    RDWEB_B3_MODES: 'preserve',
  }
  const good = list(scope, 'playwright.reconnect-ingress.config.ts')
  assert.equal(good.status, 0)
  assert.equal(good.stdout.includes('Total: 2 tests'), true)
  for (const transport of ['tcp', 'ws'])
    assert.equal(
      good.stdout.includes('official reconnect after owned ingress crash over linux/' + transport),
      true,
    )
  for (const change of [
    { RDWEB_B3_BASES: '/' },
    { RDWEB_INPUT_PLATFORMS: 'windows' },
    { RDWEB_INPUT_CHANNELS: 'chrome' },
  ])
    assert.notEqual(
      list({ ...scope, ...change }, 'playwright.reconnect-ingress.config.ts').status,
      0,
    )
})
// 直接CLI沒有本輪能力必須先於reset拒絕；Docker只有公開替身，不接daemon。
test('ingress runtime refuses absent capability before reset', () => {
  const directory = mkdtempSync('/tmp/opencode/ingress-entry-'),
    calls = join(directory, 'calls')
  writeFileSync(calls, '')
  writeFileSync(
    join(directory, 'docker'),
    '#!/usr/bin/env bash\nprintf called >> "$PUBLIC_INGRESS_CALLS"\nexit 99\n',
    { mode: 0o700 },
  )
  try {
    const value = spawnSync(
      'corepack',
      [
        'pnpm',
        '--dir',
        'frontend',
        'exec',
        'playwright',
        'test',
        '--config',
        'e2e/config/playwright.reconnect-ingress.config.ts',
        '--grep',
        'linux/tcp',
      ],
      {
        env: {
          PATH: directory + ':' + process.env.PATH,
          HOME: process.env.HOME,
          PUBLIC_INGRESS_CALLS: calls,
          RDWEB_INPUT_PLATFORMS: 'linux',
          RDWEB_INPUT_CHANNELS: 'chromium',
          RDWEB_B3_BASES: '/rdweb',
          RDWEB_B3_MODES: 'preserve',
        },
        encoding: 'utf8',
        timeout: 30000,
      },
    )
    assert.notEqual(value.status, 0)
    assert.equal((value.stdout + value.stderr).includes('ingress_owner_unavailable'), true)
    assert.equal(readFileSync(calls, 'utf8'), '')
  } finally {
    rmSync(directory, { recursive: true })
  }
})
const probe = {
  ...runtime,
  RDWEB_WINDOWS_TEXT_PROBE: '1',
  RDWEB_INPUT_PLATFORMS: 'windows',
  RDWEB_B3_BASES: '/',
  RDWEB_B3_MODES: 'preserve',
}
const textReturnProbe = {
  ...runtime,
  RDWEB_INPUT_PLATFORMS: 'windows',
  RDWEB_INPUT_CHANNELS: 'chromium',
  RDWEB_B3_BASES: '/',
  RDWEB_B3_MODES: 'preserve',
  RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1',
}
const textProbeCurrent = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../.cache/windows-text-probe/current',
)

// 新長觀察只list，不啟proxy／Docker或native fixture。
test('longrun registers exactly four fixed Linux scenarios', () => {
  const scope = {
    RDWEB_INPUT_PLATFORMS: 'linux',
    RDWEB_INPUT_CHANNELS: 'chromium',
    RDWEB_B3_BASES: '/rdweb',
    RDWEB_B3_MODES: 'preserve',
  }
  const good = list(scope, 'playwright.reconnect-longrun.config.ts')
  assert.equal(good.status, 0)
  assert.equal(good.stdout.includes('Total: 4 tests'), true)
  for (const transport of ['tcp', 'ws'])
    for (const name of ['stable sixty seconds', 'original cycle timeout'])
      assert.equal(good.stdout.includes(`official reconnect ${name} over linux/${transport}`), true)
  for (const value of [
    { RDWEB_B3_BASES: '/' },
    { RDWEB_B3_MODES: 'strip' },
    { RDWEB_INPUT_PLATFORMS: 'windows' },
    { RDWEB_INPUT_CHANNELS: 'chromium,chrome' },
  ]) {
    assert.notEqual(
      list({ ...scope, ...value }, 'playwright.reconnect-longrun.config.ts').status,
      0,
    )
  }
})
// 可靠性50次run只列單一平台一案；任何混合scope或診斷旗標必須在註冊前拒絕。
test('reliability registers exactly one fixed platform scenario', () => {
  const scope = {
    RDWEB_RELIABILITY_PLATFORM: 'linux',
    RDWEB_INPUT_PLATFORMS: 'linux',
    RDWEB_INPUT_CHANNELS: 'chromium',
    RDWEB_B3_BASES: '/rdweb',
    RDWEB_B3_MODES: 'preserve',
  }
  const linux = list(scope, 'playwright.reliability.config.ts')
  assert.equal(linux.status, 0)
  assert.equal(linux.stdout.includes('Total: 1 test'), true)
  assert.equal(linux.stdout.includes('fifty original attempts on linux'), true)
  const windows = list(
    {
      ...runtime,
      ...scope,
      RDWEB_RELIABILITY_PLATFORM: 'windows',
      RDWEB_INPUT_PLATFORMS: 'windows',
    },
    'playwright.reliability.config.ts',
  )
  assert.equal(windows.status, 0)
  assert.equal(windows.stdout.includes('fifty original attempts on windows'), true)
  assert.equal(windows.stdout.includes('fifty original attempts on linux'), false)
  for (const value of [
    { RDWEB_RELIABILITY_PLATFORM: undefined },
    { RDWEB_RELIABILITY_PLATFORM: 'windows' },
    { RDWEB_INPUT_PLATFORMS: 'linux,windows' },
    { RDWEB_INPUT_CHANNELS: 'chromium,msedge' },
    { RDWEB_B3_BASES: '/' },
    { RDWEB_B3_MODES: 'strip' },
    { RDWEB_WINDOWS_TEXT_PROBE: '1' },
  ]) {
    assert.notEqual(list({ ...scope, ...value }, 'playwright.reliability.config.ts').status, 0)
  }
})
// 安全五案分開註冊，不能混入基本四案或以Linux冒充Windows。
test('reconnect security registers five Linux-only scenarios', () => {
  const value = list({ RDWEB_INPUT_PLATFORMS: 'linux' }, 'playwright.reconnect-security.config.ts')
  assert.equal(value.status, 0)
  assert.equal(value.stdout.includes('Total: 5 tests'), true)
  const wrong = list(
    { ...runtime, RDWEB_INPUT_PLATFORMS: 'windows' },
    'playwright.reconnect-security.config.ts',
  )
  assert.notEqual(wrong.status, 0)
})

// Linux重連只註冊TCP／WS各恢復與耗盡兩案，不混入功能、Windows或可靠性case。
test('reconnect registers exactly four Linux scenarios', () => {
  const result = list({ RDWEB_INPUT_PLATFORMS: 'linux' }, 'playwright.reconnect.config.ts')
  assert.equal(result.status, 0)
  assert.equal(result.stdout.includes('Total: 4 tests'), true)
  assert.equal(result.stdout.includes('linux/tcp'), true)
  assert.equal(result.stdout.includes('linux/ws'), true)
  assert.equal(result.stdout.includes('windows/'), false)
})
// Requested Windows必須先有同終端runtime，不能因只列案就忽略安全邊界。
test('reconnect rejects requested Windows without runtime', () => {
  const result = list({ RDWEB_INPUT_PLATFORMS: 'windows' }, 'playwright.reconnect.config.ts')
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout.includes('Total: 4 tests'), false)
})
// 合成runtime僅用--list；平台分列且不可把Linux四案當Windows成功。
test('reconnect supports separate platform and channel registration', () => {
  const result = list(
    { ...runtime, RDWEB_INPUT_PLATFORMS: 'linux,windows' },
    'playwright.reconnect.config.ts',
  )
  assert.equal(result.status, 0)
  assert.equal(result.stdout.includes('Total: 8 tests'), true)
  const channels = list(
    { RDWEB_INPUT_PLATFORMS: 'linux', RDWEB_INPUT_CHANNELS: 'chromium,msedge' },
    'playwright.reconnect.config.ts',
  )
  assert.equal(channels.status, 0)
  assert.equal(channels.stdout.includes('Total: 8 tests'), true)
  assert.equal(channels.stdout.includes('[chromium]'), true)
  assert.equal(channels.stdout.includes('[msedge]'), true)
})
// 未安裝channel不由agent下載；未知／空／重複輸入則在註冊前拒絕。
for (const channels of ['', 'unknown', 'chromium,chromium']) {
  test('reconnect rejects invalid channels: ' + JSON.stringify(channels), () => {
    const result = list(
      { RDWEB_INPUT_PLATFORMS: 'linux', RDWEB_INPUT_CHANNELS: channels },
      'playwright.reconnect.config.ts',
    )
    assert.notEqual(result.status, 0)
  })
}
// 真Playwright只列一個TCP回傳case，不擴到WS或原完整雙向矩陣。
test('text return probe registers exactly one opted-in TCP case', () => {
  const result = list(textReturnProbe, 'playwright.text-return-probe.config.ts')
  assert.equal(result.status, 0)
  assert.equal(result.stdout.includes('Total: 1 test'), true)
  assert.equal(result.stdout.includes('Windows remote input clipboard return over tcp'), true)
  assert.equal(result.stdout.includes('over ws'), false)
  assert.equal(result.stdout.includes('public Windows text and clipboard oracle'), false)
})
// 缺少logger opt-in、CI或固定scope時不得列出native text case。
for (const override of [
  { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: undefined },
  { CI: 'true' },
  { GITHUB_ACTIONS: 'true' },
  { RDWEB_WINDOWS_PASSWORD: undefined },
  { RDWEB_INPUT_PLATFORMS: 'linux' },
  { RDWEB_INPUT_CHANNELS: 'chromium,msedge' },
  { RDWEB_B3_BASES: '/rdweb' },
  { RDWEB_B3_MODES: 'preserve strip' },
]) {
  // 標題只指出公開gate，不包含fixture值。
  test('text return probe rejects unsafe registration: ' + Object.keys(override)[0], () => {
    const result = list(
      { ...textReturnProbe, ...override },
      'playwright.text-return-probe.config.ts',
    )
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout.includes('Total: 1 test'), false)
  })
}
// 有舊current時只接受fail-closed；不讀內容或刪檔以滿足registration測試。
test('text probe registers fresh scope or rejects the preserved stale current', () => {
  const result = list(probe, 'playwright.text-probe.config.ts')
  if (existsSync(textProbeCurrent)) {
    assert.notEqual(result.status, 0)
    assert.equal((result.stdout + result.stderr).includes('text_probe_control_unavailable'), true)
  } else {
    assert.equal(result.status, 0)
    assert.equal(result.stdout.includes('Total: 1 test'), true)
    assert.equal(result.stdout.includes('diagnostic Windows text-only'), true)
    assert.equal(result.stdout.includes('clipboard oracle'), false)
  }
})
// 漏flag／CI／缺正式runtime或scope不符應在registration前拒絕。
for (const override of [
  { RDWEB_WINDOWS_TEXT_PROBE: undefined },
  { CI: '1' },
  { RDWEB_WINDOWS_PASSWORD: undefined },
  { RDWEB_INPUT_PLATFORMS: 'linux' },
  { RDWEB_INPUT_CHANNELS: 'msedge' },
  { RDWEB_B3_BASES: '/rdweb' },
]) {
  // 報告只含固定ordinal，不放runtime值。
  test('text probe rejects unsafe registration: ' + Object.keys(override)[0], () => {
    const result = list({ ...probe, ...override }, 'playwright.text-probe.config.ts')
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout.includes('Total: 1 test'), false)
  })
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
