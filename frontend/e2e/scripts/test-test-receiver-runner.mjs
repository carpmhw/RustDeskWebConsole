import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const roots = []
const key = Buffer.alloc(32).toString('base64')

// 只清本測試建立的tmp，不碰repo cache、private run或任何外部stack。
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// 固定既有target env；密碼只在程序env，不出現在命令列或報告。
function baseEnv(root) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    RDWEB_TEST_RECEIVER_LIVE: '1',
    RDWEB_TEST_RECEIVER_MODE: 'existing-target',
    RDWEB_TEST_RECEIVER_ROOT: root,
    RDWEB_TEST_RECEIVER_TARGET_NAME: 'receiver-test-target-0123456789abcdef',
    RDWEB_TEST_RECEIVER_USERNAME: 'e2e-' + 'a'.repeat(32),
    RDWEB_E2E_PASSWORD: 'Public-Test-Password',
    RDWEB_TEST_RECEIVER_PASSWORD: 'Public-Receiver-Password',
    RDWEB_TEST_RECEIVER_HBBS_UDP: 'hbbs.invalid:21116',
    RDWEB_TEST_RECEIVER_HBBS_TCP: 'hbbs.invalid:21116',
    RDWEB_TEST_RECEIVER_HBBR_TCP: 'hbbr.invalid:21117',
    RDWEB_TEST_RECEIVER_SERVER_PUBLIC_KEY: key,
  }
}

// PATH替身只記錄外部入口；node仍轉給本機runtime，不假造prepare或TS行為。
function run(overrides = {}) {
  const dir = mkdtempSync('/tmp/opencode/rdweb-test-receiver-runner-')
  roots.push(dir)
  const bin = join(dir, 'bin'),
    calls = join(dir, 'calls'),
    root = join(dir, 'current')
  mkdirSync(bin, { mode: 0o700 })
  writeFileSync(calls, '')
  writeFileSync(
    join(bin, 'node'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == frontend/e2e/scripts/import-test-receiver.mjs ]]; then
  printf 'import:%s\\n' "$*" >> "$STUB_CALLS"
  exit "\${STUB_IMPORT_EXIT:-0}"
fi
exec "$STUB_REAL_NODE" "$@"
`,
    { mode: 0o700 },
  )
  writeFileSync(
    join(bin, 'corepack'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ -n "\${DEBUG+x}" || -n "\${PWDEBUG+x}" ]]; then exit 23; fi
printf 'playwright:%s|%s\\n' "$PWD" "$*" >> "$STUB_CALLS"
exit "\${STUB_SUITE_EXIT:-0}"
`,
    { mode: 0o700 },
  )
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
printf 'docker\\n' >> "$STUB_CALLS"
exit 99
`,
    { mode: 0o700 },
  )
  const env = {
    ...baseEnv(root),
    PATH: bin + ':' + process.env.PATH,
    STUB_REAL_NODE: process.execPath,
    STUB_CALLS: calls,
    ...overrides,
  }
  for (const name of Object.keys(env)) if (env[name] === undefined) delete env[name]
  const result = spawnSync('bash', ['frontend/e2e/scripts/test-m3b3-test-receiver.sh'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 20000,
  })
  return { ...result, root, calls: readFileSync(calls, 'utf8'), dir }
}

// 正常路徑只prepare一次並呼叫固定receiver config；Node本體不啟任何stack。
test('runner prepares one private root and invokes only the receiver suite', () => {
  const r = run()
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'receiver_prepared\nreceiver_client_ready\n')
  assert.equal(r.stderr, '')
  assert.equal(lstatSync(r.root).mode & 0o777, 0o700)
  for (const name of ['binding.json', 'connection.json', 'claim.json'])
    assert.equal(lstatSync(join(r.root, name)).mode & 0o777, 0o600)
  assert.equal(existsSync(join(r.root, 'joined.json')), false)
  assert.equal(r.calls.includes('docker'), false)
  assert.equal(r.calls.split('\n').filter(Boolean).length, 1)
  assert.match(
    r.calls,
    /^playwright:.*frontend\|pnpm exec playwright test --config e2e\/config\/playwright\.test-receiver\.config\.ts --max-failures=1$/m,
  )
  for (const value of [
    'Public-Test-Password',
    'Public-Receiver-Password',
    key,
    'hbbs.invalid',
    'hbbr.invalid',
    'receiver-test-target-0123456789abcdef',
  ])
    assert.equal(r.stdout.includes(value) || r.stderr.includes(value), false)
})

// 任何缺runtime、CI、舊用途或provision模式都必須在root或Playwright前拒絕。
test('runner rejects incomplete or unsupported authorization before side effects', () => {
  for (const patch of [
    { RDWEB_TEST_RECEIVER_LIVE: undefined },
    { RDWEB_TEST_RECEIVER_ROOT: undefined },
    { RDWEB_TEST_RECEIVER_MODE: 'provision' },
    { RDWEB_TEST_RECEIVER_MODE: undefined },
    { CI: '1' },
    { GITHUB_ACTIONS: 'true' },
    { RDWEB_WINDOWS_HOST_OBSERVE: '1' },
    { RDWEB_WINDOWS_HOST_INPUT_ONLY: '1' },
    { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' },
    { RDWEB_WINDOWS_TEXT_PROBE: '1' },
    { RDWEB_TEST_RECEIVER_PASSWORD: undefined },
    { RDWEB_TEST_RECEIVER_TARGET_NAME: 'official-windows-input-tcp' },
    { RDWEB_TEST_RECEIVER_USERNAME: 'admin' },
    { RDWEB_E2E_PASSWORD: 'short' },
    { RDWEB_TEST_RECEIVER_HBBS_UDP: 'hbbs.invalid' },
    { RDWEB_TEST_RECEIVER_SERVER_PUBLIC_KEY: 'not-a-key' },
    { RDWEB_TEST_RECEIVER_ROOT: 'relative/root' },
    { RDWEB_TEST_RECEIVER_ROOT: '/tmp/windows-host-input-only/current' },
  ]) {
    const r = run(patch)
    assert.equal(r.status, 2, JSON.stringify(patch))
    assert.match(r.stderr, /^receiver_unavailable$/m, JSON.stringify(patch))
    assert.equal(r.calls, '', JSON.stringify(patch))
    assert.equal(existsSync(r.root), false, JSON.stringify(patch))
  }
})

// 已存在root不得被claim、覆寫或清理；失敗後保留原內容。
test('runner refuses an existing root without touching it', () => {
  const r = run()
  assert.equal(r.status, 0)
  const before = readFileSync(join(r.root, 'binding.json'))
  const again = run({ RDWEB_TEST_RECEIVER_ROOT: r.root, HOME: process.env.HOME })
  assert.equal(again.status, 2)
  assert.equal(again.calls, '')
  assert(readFileSync(join(r.root, 'binding.json')).equals(before))
  assert.equal(existsSync(join(r.root, 'joined.json')), false)
})

// 只有明確提供結果來源才呼叫import；沒有結果不得輪詢或延後claim。
test('runner invokes import only for an explicit result source', () => {
  const absent = run()
  assert.equal(absent.status, 0)
  assert.equal(absent.calls.includes('import:'), false)
  assert.match(absent.stdout, /^receiver_client_ready$/m)

  const supplied = run({ RDWEB_TEST_RECEIVER_RESULT: '/tmp/opencode/result.json' })
  assert.equal(supplied.status, 0, supplied.stderr)
  assert.match(
    supplied.calls,
    /^import:frontend\/e2e\/scripts\/import-test-receiver\.mjs --directory .* --source \/tmp\/opencode\/result\.json$/m,
  )
  assert.equal(supplied.stdout.includes('receiver_client_ready'), false)
})

// 子程序不得取得DEBUG／PWDEBUG；shell在preflight與Playwright前已清除。
test('runner removes debug environment before external actions', () => {
  const r = run({ DEBUG: '1', PWDEBUG: '1' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.calls.includes('playwright:'), true)
})
