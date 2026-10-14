import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyTextProbeTools } from './text-probe-test-fixture.mjs'

// 跨程序工具替身只用於owner／early failure測試，不連Docker或Windows，也不假裝native成功。
function run(overrides = {}, script = 'deploy/dev/test-m3b3-input.sh', stale = false) {
  const dir = mkdtempSync('/tmp/opencode/rdweb-b3-runner-')
  const calls = join(dir, 'calls')
  const probeSuite = script === 'deploy/dev/test-m3b3-text-probe.sh'
  const textReturnSuite = script === 'deploy/dev/test-m3b3-text-return-probe.sh'
  if (probeSuite || textReturnSuite) {
    const current = copyTextProbeTools(dir)
    if (probeSuite && stale) mkdirSync(current, { recursive: true, mode: 0o700 })
  }
  writeFileSync(calls, '')
  writeFileSync(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *spikes.yml* ]]; then scope=console; else scope=official; fi
if [[ "$*" == *' ps '* ]]; then
  if [[ "$scope" == console && "\${STUB_CONSOLE_RUNNING:-0}" == 1 ]]; then echo backend; fi
  if [[ "$scope" == official ]]; then
    case "\${STUB_OFFICIAL:-empty}" in full) printf 'hbbs\\nhbbr\\ntarget\\n';; partial) echo hbbs;; esac
  fi
  exit 0
fi
if [[ "$*" == *' exec '* ]]; then echo public-fixture; exit 0; fi
printf '%s\\n' "$scope action:$*" >> "$STUB_CALLS"
if [[ "\${STUB_CONSOLE_DOWN_FAIL:-0}" == 1 && "$scope" == console && "$*" == *' down' ]]; then exit 1; fi
if [[ "\${STUB_BUILD_FAIL:-0}" == 1 && "$*" == *' build'* ]]; then exit 1; fi
`,
    { mode: 0o700 },
  )
  writeFileSync(
    join(dir, 'node'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == -p ]]; then echo public-random-fixture; exit 0; fi
if [[ "\${1:-}" == tools/wait-rustdesk-online.mjs || "\${1:-}" == tools/test-rustdesk-clock.mjs || "\${1:-}" == tools/verify-input-fixture.mjs ]]; then exit 0; fi
exec "$STUB_REAL_NODE" "$@"
`,
    { mode: 0o700 },
  )
  writeFileSync(
    join(dir, 'corepack'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'playwright:%s/%s\\n' "$APP_BASE_PATH" "$PREFIX_MODE" >> "$STUB_CALLS"
if [[ "\${STUB_REQUIRE_SAFE_ENV:-0}" == 1 && ( -n "\${DEBUG+x}" || -n "\${PWDEBUG+x}" ) ]]; then exit 23; fi
exit "\${STUB_SUITE_EXIT:-0}"
`,
    { mode: 0o700 },
  )
  // 環境從公開fixture白名單起建，不繼承操作者真runtime秘密。
  const env = {
    PATH: dir + ':' + process.env.PATH,
    HOME: process.env.HOME,
    STUB_REAL_NODE: process.execPath,
    STUB_CALLS: calls,
    RDWEB_B3_BASES: '/',
    RDWEB_B3_MODES: 'preserve',
    ...overrides,
  }
  try {
    const result = spawnSync('bash', [script], {
      cwd: probeSuite || textReturnSuite ? dir : undefined,
      env,
      encoding: 'utf8',
      timeout: 10000,
    })
    return {
      status: result.status,
      calls: readFileSync(calls, 'utf8'),
      output: result.stdout + result.stderr,
    }
  } finally {
    // 僅刪除此測試以mkdtemp建立的狹窄目錄，不清理工作樹或任何Docker資源。
    rmSync(dir, { recursive: true, force: true })
  }
}
const textReturnProbe = {
  RDWEB_INPUT_PLATFORMS: 'windows',
  RDWEB_INPUT_CHANNELS: 'chromium',
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
  RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1',
  RDWEB_B3_BASES: '/',
  RDWEB_B3_MODES: 'preserve',
}
// 未開log或scope不合法須在取得任何Docker owner前fail closed。
for (const override of [
  { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: undefined },
  { CI: '1' },
  { GITHUB_ACTIONS: '1' },
  { RDWEB_INPUT_PLATFORMS: 'linux,windows' },
  { RDWEB_INPUT_CHANNELS: 'msedge' },
  { RDWEB_B3_BASES: '/ /rdweb' },
  { RDWEB_B3_MODES: 'preserve strip' },
]) {
  // 子程序使用自有Docker替身，不連線Windows或真daemon。
  test('text return runner rejects unsafe preflight: ' + Object.keys(override)[0], () => {
    const result = run(
      { ...textReturnProbe, ...override },
      'deploy/dev/test-m3b3-text-return-probe.sh',
    )
    assert.equal(result.status, 2)
    assert.equal(result.calls, '')
  })
}
// 合法scope只排程一次，reuse official stack不被誤down。
test('text return runner schedules one suite and preserves reused official resources', () => {
  const result = run(
    { ...textReturnProbe, STUB_OFFICIAL: 'full', STUB_SUITE_EXIT: '1' },
    'deploy/dev/test-m3b3-text-return-probe.sh',
  )
  assert.equal(result.status, 1)
  assert.equal(
    result.calls
      .split('\n')
      .filter(/* 單一固定TCP suite。 */ (line) => line.startsWith('playwright:')).length,
    1,
  )
  assert.equal(result.calls.includes('official action:'), false)
  assert.equal(result.calls.includes(' -v'), false)
})
// host缺manifest／非法flag或非HR不得走Docker；真reader只讀自有tmp。
for (const override of [
  { RDWEB_WINDOWS_HOST_OBSERVE: '1' },
  { RDWEB_WINDOWS_HOST_OBSERVE: 'yes' },
  { RDWEB_WINDOWS_HOST_OBSERVE: '1', CI: 'true' },
]) {
  test(
    'host runner rejects unsafe setup before Docker: ' + JSON.stringify(Object.keys(override)),
    () => {
      const value = run(
        { ...textReturnProbe, ...override },
        'deploy/dev/test-m3b3-text-return-probe.sh',
      )
      assert.equal(value.status, 2)
      assert.equal(value.calls, '')
      assert.equal(value.output.includes('public-fixture-password'), false)
    },
  )
}
// 未啟用host與明確0都沿舊suite無新manifest；不因新功能擴成完整矩陣。
test('host flag zero keeps original runner scheduling without new files', () => {
  const value = run(
    { ...textReturnProbe, RDWEB_WINDOWS_HOST_OBSERVE: '0', STUB_OFFICIAL: 'full' },
    'deploy/dev/test-m3b3-text-return-probe.sh',
  )
  assert.equal(value.status, 0)
  assert.equal(value.calls.includes('playwright://preserve'), true)
})
// 新建owner遇cleanup失敗時仍只清一次，不刪volumes或外部stack。
test('text return runner cleanup failure attempts each owned stack once', () => {
  const result = run(
    { ...textReturnProbe, STUB_CONSOLE_DOWN_FAIL: '1' },
    'deploy/dev/test-m3b3-text-return-probe.sh',
  )
  assert.equal(result.status, 1)
  for (const scope of ['official', 'console']) {
    assert.equal(
      result.calls
        .split('\n')
        .filter(
          /* 每個新owned scope僅down一次。 */ (line) =>
            line.startsWith(scope + ' action:') && line.endsWith(' down'),
        ).length,
      1,
    )
  }
  assert.equal(result.calls.includes(' -v'), false)
})
const probe = {
  RDWEB_WINDOWS_TEXT_PROBE: '1',
  RDWEB_INPUT_PLATFORMS: 'windows',
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
// Probe任何非法scope均需在Docker action之前拒絕，沒有fallback舊suite。
for (const override of [
  { RDWEB_WINDOWS_TEXT_PROBE: '0' },
  { CI: '1' },
  { GITHUB_ACTIONS: '1' },
  { RDWEB_INPUT_PLATFORMS: 'linux,windows' },
  { RDWEB_INPUT_CHANNELS: 'msedge' },
  { RDWEB_B3_BASES: '/ /rdweb' },
  { RDWEB_B3_MODES: 'preserve strip' },
  { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' },
]) {
  // 子程序工具替身，測真preflight但不接觸Windows或Dockerdaemon。
  test('text probe fails before any owned action: ' + Object.keys(override)[0], () => {
    const result = run({ ...probe, ...override }, 'deploy/dev/test-m3b3-text-probe.sh')
    assert.equal(result.status, 2)
    assert.equal(result.calls, '')
  })
}
// 正常scope只排程一次，suite與cleanup失敗仍保留volumes並清自己的stack。
test('single text probe preserves reused official stack and cleans only its console on failure', () => {
  const result = run(
    { ...probe, STUB_OFFICIAL: 'full', STUB_SUITE_EXIT: '1' },
    'deploy/dev/test-m3b3-text-probe.sh',
  )
  assert.equal(result.status, 1)
  assert.equal(result.calls.includes('official action:'), false)
  assert.equal(
    result.calls
      .split('\n')
      .filter(/* 只驗一次固定scope。 */ (line) => line.startsWith('playwright:')).length,
    1,
  )
  assert.equal(result.calls.includes(' -v'), false)
})
// 殘留current或預先存在stack不可自動down／覆寫，保護操作者工作。
test('text probe stale control and pre-existing console fail before owned actions', () => {
  for (const [overrides, stale] of [
    [{}, true],
    [{ STUB_CONSOLE_RUNNING: '1' }, false],
    [{ STUB_OFFICIAL: 'partial' }, false],
  ]) {
    const result = run({ ...probe, ...overrides }, 'deploy/dev/test-m3b3-text-probe.sh', stale)
    assert.equal(result.status, 2)
    assert.equal(result.calls, '')
  }
})
// down失敗仍清每個owned scope一次，不動volumes。
test('text probe cleanup failure still releases both newly owned stacks once', () => {
  const result = run(
    { ...probe, STUB_CONSOLE_DOWN_FAIL: '1' },
    'deploy/dev/test-m3b3-text-probe.sh',
  )
  assert.equal(result.status, 1)
  for (const scope of ['official', 'console'])
    assert.equal(
      result.calls
        .split('\n')
        .filter(
          /* 每個owner只down一次。 */ (line) =>
            line.startsWith(scope + ' action:') && line.endsWith(' down'),
        ).length,
      1,
    )
  assert.equal(result.calls.includes(' -v'), false)
})

// 每個early gate都須在Docker action前停止，包括prefix、channel與requested Windows缺憑證。
for (const overrides of [
  { RDWEB_INPUT_PLATFORMS: 'windows' },
  { RDWEB_INPUT_PLATFORMS: 'linux,windows' },
  { RDWEB_INPUT_PLATFORMS: 'linux,linux' },
  { RDWEB_B3_BASES: '/unknown' },
  { RDWEB_B3_BASES: '' },
  { RDWEB_B3_BASES: ' ' },
  { RDWEB_B3_MODES: 'unknown' },
  { RDWEB_B3_MODES: ' ' },
  { RDWEB_INPUT_CHANNELS: 'chromium,unknown' },
]) {
  // 只輸出公開env欄位名稱，不把任何runtime value加入test title。
  test('preflight has no side effects: ' + Object.keys(overrides)[0], () => {
    const result = run(overrides)
    assert.equal(result.status, 2)
    assert.equal(result.calls, '')
  })
}
// reuse的三服務不屬於runner，suite失敗也只能down新建console。
test('a failed suite preserves a reused official stack', () => {
  const result = run({ STUB_OFFICIAL: 'full', STUB_SUITE_EXIT: '1' })
  assert.equal(result.status, 1)
  assert.equal(result.calls.includes('official action:'), false)
  assert.equal(result.calls.includes('console action:'), true)
  assert.equal(
    result.calls
      .split('\n')
      .filter(
        /* 只計數固定scope及down操作。 */ (line) =>
          line.startsWith('console action:') && line.endsWith(' down'),
      ).length,
    1,
  )
})

// 禁止繼承會展開API request或開debug模式的環境，不以可信任密碼來源當作允許記錄理由。
test('runtime debugging is disabled before the browser runner sees credentials', () => {
  const result = run({ DEBUG: 'pw:*', PWDEBUG: '1', STUB_REQUIRE_SAFE_ENV: '1' })
  assert.equal(result.status, 0)
})

// Console down失敗也須嘗試清official，且不能因EXIT重入再清同一owned stack。
test('cleanup failure still attempts both owned stacks exactly once', () => {
  const result = run({ STUB_CONSOLE_DOWN_FAIL: '1' })
  assert.equal(result.status, 1)
  for (const scope of ['console', 'official'])
    assert.equal(
      result.calls.split('\n').filter(
        // 每scope即使down失敗也只送一次，再清另一scope。
        (line) => line.startsWith(scope + ' action:') && line.endsWith(' down'),
      ).length,
      1,
    )
})
// 部分或已有console均不得取得owner或做build／down。
test('partial official and pre-existing console stacks are left untouched', () => {
  for (const overrides of [{ STUB_OFFICIAL: 'partial' }, { STUB_CONSOLE_RUNNING: '1' }]) {
    const result = run(overrides)
    assert.equal(result.status, 2)
    assert.equal(result.calls, '')
  }
})
// 新建資源正常結束須各清一次；prefix／mode交叉乘積不能漏組或重跑。
test('six-prefix runs clean up exactly the two owned stacks', () => {
  const result = run({ RDWEB_B3_BASES: '/ /rdweb /a/b/c', RDWEB_B3_MODES: 'preserve strip' })
  assert.equal(result.status, 0)
  const lines = result.calls.split('\n')
  assert.deepEqual(
    lines.filter(/* 僅驗公開prefix／mode排程。 */ (line) => line.startsWith('playwright:')),
    [
      'playwright://preserve',
      'playwright://strip',
      'playwright:/rdweb/preserve',
      'playwright:/rdweb/strip',
      'playwright:/a/b/c/preserve',
      'playwright:/a/b/c/strip',
    ],
  )
  for (const scope of ['console', 'official'])
    assert.equal(
      lines.filter(
        /* 每個owned stack恰好down一次。 */ (line) =>
          line.startsWith(scope + ' action:') && line.endsWith(' down'),
      ).length,
      1,
    )
})
// build失敗時仍清自己建立的資源，不能誤down尚未擁有的console。
test('build failure only cleans up the stack whose ownership was acquired', () => {
  const result = run({ STUB_BUILD_FAIL: '1' })
  assert.equal(result.status, 1)
  assert.equal(result.calls.includes('console action:'), false)
  assert.equal(
    result.calls
      .split('\n')
      .filter(
        /* official已取得owner，必須收尾。 */ (line) =>
          line.startsWith('official action:') && line.endsWith(' down'),
      ).length,
    1,
  )
})

// 真runtime reader接到公開替身後，requested Windows必須排程，而非沿舊runner拒絕所有Windows。
test('a complete Windows runtime reaches the requested suite without logging values', () => {
  const result = run({
    RDWEB_INPUT_PLATFORMS: 'windows',
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
  })
  assert.equal(result.status, 0)
  assert.equal(result.calls.includes('playwright://preserve'), true)
  for (const value of [
    'public-fixture-key',
    '123456789',
    'public-fixture-password',
    'fixture.example',
  ])
    assert.equal(result.output.includes(value) || result.calls.includes(value), false)
})
