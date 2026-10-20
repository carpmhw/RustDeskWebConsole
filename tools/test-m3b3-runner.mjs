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
if [[ "\${STUB_LOG_DOCKER:-0}" == 1 ]]; then printf '%s\n' 'docker-invoked' >> "$STUB_CALLS"; fi
if [[ "\${STUB_VERIFY_RECONNECT:-0}" == 1 && "$scope" == console ]]; then
  [[ "$*" == *browser-login-test.yml* && "$*" == *reconnect-test.yml* ]] || exit 23
fi
if [[ "\${STUB_VERIFY_INGRESS:-0}" == 1 ]]; then
  if [[ "$scope" == console ]]; then [[ "$*" == *'--project-name rdweb-m0'* ]] || exit 23
  else [[ "$*" == *'--project-name rdweb-rustdesk-test'* ]] || exit 23; fi
fi
if [[ "$*" == *' ps '* ]]; then
  if [[ "$scope" == console && "$*" == *--all* && "\${STUB_DISCOVERY_FAIL:-0}" == 1 ]]; then exit 37; fi
  if [[ "$scope" == console && "$*" == *--all* && "\${STUB_CONSOLE_STOPPED:-0}" == 1 ]]; then echo public-stopped-container; fi
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
if [[ "\${1:-}" == -p ]]; then
  if [[ "\${2:-}" == *toString*hex* ]]; then printf '%064d\n' 0; else echo public-random-fixture; fi
  exit 0
fi
if [[ "\${1:-}" == tools/run-reconnect-playwright.mjs ]]; then
  if [[ "$2" == playwright.reconnect-ingress.config.ts ]]; then
    [[ "\${RDWEB_B3_SUITE_CONFIG:-}" == "$2" && "\${RDWEB_RECONNECT_INGRESS_OWNER:-}" =~ ^[a-f0-9]{64}$ ]] || exit 23
    printf '%s\n' ingress-owned >> "$STUB_CALLS"
  else [[ -z "\${RDWEB_RECONNECT_INGRESS_OWNER+x}" ]] || exit 23; fi
  exec corepack pnpm --dir frontend exec playwright test --config "$2" --max-failures=1
fi
if [[ "\${1:-}" == tools/reconnect-preflight.mjs ]]; then
  [[ "\${STUB_PORTS_BUSY:-0}" != 1 ]] || exit 2
  exec "$STUB_REAL_NODE" --input-type=module -e 'import { assertReconnectEnvironment } from "./tools/reconnect-preflight.mjs"; try { assertReconnectEnvironment(process.env) } catch { process.exitCode = 2 }'
fi
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
if [[ "\${STUB_VERIFY_RECONNECT:-0}" == 1 ]]; then
  [[ "$RDWEB_DEV_PORT" == 18081 && "$RDWEB_E2E_COMPOSE_OVERRIDE" == deploy/dev/docker-compose.reconnect-test.yml && "$*" == *--max-failures=1* ]] || exit 23
fi
if [[ "\${STUB_TERMINATE_OWNER:-0}" == 1 ]]; then
  trap 'exit 130' TERM INT
  kill -TERM "$PPID"
  sleep 0.1
  exit 130
fi
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

const longrunScope = {
  RDWEB_INPUT_PLATFORMS: 'linux',
  RDWEB_INPUT_CHANNELS: 'chromium',
  RDWEB_B3_BASES: '/rdweb',
  RDWEB_B3_MODES: 'preserve',
}
// 真runner只啟一個固定ingress suite，私有能力不寫入trace。
test('ingress runner private capability and first failure gate', () => {
  const script = 'deploy/dev/test-m3b3-reconnect-ingress.sh'
  const good = run(
    { ...longrunScope, STUB_VERIFY_RECONNECT: '1', STUB_VERIFY_INGRESS: '1', STUB_LOG_DOCKER: '1' },
    script,
  )
  assert.equal(good.status, 0)
  assert.equal(good.calls.split('ingress-owned').length - 1, 1)
  assert.equal(good.calls.includes('0'.repeat(64)), false)
  for (const change of [
    { RDWEB_INPUT_PLATFORMS: 'windows' },
    { RDWEB_B3_BASES: '/' },
    { RDWEB_INPUT_CHANNELS: 'chrome' },
    { RDWEB_RECONNECT_INGRESS_OWNER: '' },
    { COMPOSE_PROJECT_NAME: 'external' },
    { RDWEB_WINDOWS_HOST_OBSERVE: '1' },
  ]) {
    const blocked = run({ ...longrunScope, ...change, STUB_LOG_DOCKER: '1' }, script)
    assert.equal(blocked.status, 2)
    assert.equal(blocked.calls, '')
  }
  const stopped = run({ ...longrunScope, STUB_CONSOLE_STOPPED: '1' }, script)
  assert.equal(stopped.status, 2)
  assert.equal(stopped.calls.includes(' action:'), false)
  const unknown = run({ ...longrunScope, STUB_DISCOVERY_FAIL: '1' }, script)
  assert.equal(unknown.status, 2)
  assert.equal(unknown.calls.includes(' action:'), false)
  const failure = run({ ...longrunScope, STUB_SUITE_EXIT: '7' }, script)
  assert.equal(failure.status, 7)
  assert.equal(failure.calls.split('playwright:').length - 1, 1)
  assert.equal(failure.calls.includes(' -v'), false)
  assert.notEqual(run({ ...longrunScope, STUB_CONSOLE_DOWN_FAIL: '1' }, script).status, 0)
  const interrupted = run({ ...longrunScope, STUB_TERMINATE_OWNER: '1' }, script)
  assert.equal(interrupted.status, 130)
  assert.equal(interrupted.calls.includes('console action:'), true)
  assert.equal(interrupted.calls.includes(' down'), true)
})
// 長觀察只啟一次固定組合並沿原proxy／owned安全收尾。
test('longrun runner uses proxy wiring and fails closed', () => {
  const script = 'deploy/dev/test-m3b3-reconnect-longrun.sh'
  const good = run({ ...longrunScope, STUB_VERIFY_RECONNECT: '1' }, script)
  assert.equal(good.status, 0)
  assert.equal(good.calls.split('playwright:/rdweb/preserve').length - 1, 1)
  for (const value of [
    { RDWEB_B3_BASES: '/' },
    { RDWEB_B3_MODES: 'strip' },
    { RDWEB_INPUT_PLATFORMS: 'windows' },
    { RDWEB_INPUT_CHANNELS: 'chrome' },
  ]) {
    const blocked = run({ ...longrunScope, ...value, STUB_LOG_DOCKER: '1' }, script)
    assert.equal(blocked.status, 2)
    assert.equal(blocked.calls, '')
  }
  const failed = run({ ...longrunScope, STUB_SUITE_EXIT: '7' }, script)
  assert.equal(failed.status, 7)
  assert.equal(failed.calls.split('playwright:').length - 1, 1)
  assert.equal(failed.calls.includes('console action:'), true)
  assert.equal(failed.calls.includes(' down'), true)
  assert.notEqual(run({ ...longrunScope, STUB_CONSOLE_DOWN_FAIL: '1' }, script).status, 0)
  const external = run({ ...longrunScope, STUB_OFFICIAL: 'full' }, script)
  assert.equal(external.status, 0)
  assert.equal(
    external.calls
      .split('\n')
      .some(
        /* 不關重用的official stack。 */ (line) =>
          line.startsWith('official action:') && line.endsWith(' down'),
      ),
    false,
  )
})
// 真shell必須同時接三檔、80／81分離及首FAIL停止，不只檢查字串存在。
test('reconnect runner applies proxy compose wiring and fail-fast', () => {
  const value = run(
    { RDWEB_INPUT_PLATFORMS: 'linux', STUB_VERIFY_RECONNECT: '1' },
    'deploy/dev/test-m3b3-reconnect.sh',
  )
  assert.equal(value.status, 0)
  assert.equal(value.calls.includes('reconnect-test.yml'), true)
})
// 占用與外來診斷scope必須在任何Docker副作用前拒絕。
for (const overrides of [
  { STUB_PORTS_BUSY: '1' },
  { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' },
  { RDWEB_E2E_COMPOSE_OVERRIDE: 'unknown.yml' },
]) {
  test('reconnect runner rejects proxy preflight: ' + Object.keys(overrides)[0], () => {
    const value = run(
      { RDWEB_INPUT_PLATFORMS: 'linux', ...overrides },
      'deploy/dev/test-m3b3-reconnect.sh',
    )
    assert.equal(value.status, 2)
    assert.equal(value.calls, '')
  })
}

// 真shell控制流程在替身環境中保留六組，不把安全stub的拒絕當runner已接線。
test('reconnect runner schedules the full six prefix combinations and cleans owned stacks', () => {
  const result = run(
    {
      RDWEB_INPUT_PLATFORMS: 'linux',
      RDWEB_B3_BASES: '/ /rdweb /a/b/c',
      RDWEB_B3_MODES: 'preserve strip',
    },
    'deploy/dev/test-m3b3-reconnect.sh',
  )
  assert.equal(result.status, 0)
  assert.deepEqual(
    result.calls.split('\n').filter((line) => line.startsWith('playwright:')),
    [
      'playwright://preserve',
      'playwright://strip',
      'playwright:/rdweb/preserve',
      'playwright:/rdweb/strip',
      'playwright:/a/b/c/preserve',
      'playwright:/a/b/c/strip',
    ],
  )
  for (const scope of ['console', 'official']) {
    assert.equal(
      result.calls
        .split('\n')
        .filter((line) => line.startsWith(scope + ' action:') && line.endsWith(' down')).length,
      1,
    )
  }
  assert.equal(result.calls.includes(' -v'), false)
})
// 錯誤suite只執行第一組，仍清本輪owner，不由第二組成功蓋掉FAIL。
test('reconnect runner stops the matrix on the first suite failure', () => {
  const result = run(
    {
      RDWEB_INPUT_PLATFORMS: 'linux',
      RDWEB_B3_BASES: '/ /rdweb /a/b/c',
      RDWEB_B3_MODES: 'preserve strip',
      STUB_SUITE_EXIT: '1',
    },
    'deploy/dev/test-m3b3-reconnect.sh',
  )
  assert.equal(result.status, 1)
  assert.equal(result.calls.split('\n').filter((line) => line.startsWith('playwright:')).length, 1)
  assert.equal(result.calls.includes('console action:'), true)
  assert.equal(result.calls.includes('official action:'), true)
})
// 不得取得既有手動Console的ownership，reuse官方stack也不擅自down它。
test('reconnect runner preserves pre-existing resources', () => {
  const blocked = run(
    { RDWEB_INPUT_PLATFORMS: 'linux', STUB_CONSOLE_RUNNING: '1' },
    'deploy/dev/test-m3b3-reconnect.sh',
  )
  assert.equal(blocked.status, 2)
  assert.equal(blocked.calls, '')
  const reused = run(
    { RDWEB_INPUT_PLATFORMS: 'linux', STUB_OFFICIAL: 'full' },
    'deploy/dev/test-m3b3-reconnect.sh',
  )
  assert.equal(reused.status, 0)
  assert.equal(reused.calls.includes('official action:'), false)
})
// Requested Windows runtime缺失時，必須在任何Docker或認證建立之前停止。
test('reconnect runner rejects missing Windows runtime before Docker', () => {
  const result = run({ RDWEB_INPUT_PLATFORMS: 'windows' }, 'deploy/dev/test-m3b3-reconnect.sh')
  assert.equal(result.status, 2)
  assert.equal(result.calls, '')
})
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
