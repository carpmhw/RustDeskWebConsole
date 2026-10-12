import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

// 跨程序工具替身只用於owner／early failure測試，不連Docker或Windows，也不假裝native成功。
function run(overrides = {}) {
  const dir = mkdtempSync('/tmp/opencode/rdweb-b3-runner-')
  const calls = join(dir, 'calls')
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
    const result = spawnSync('bash', ['deploy/dev/test-m3b3-input.sh'], {
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
