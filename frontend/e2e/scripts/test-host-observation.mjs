import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  chmodSync,
  statSync,
  symlinkSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import {
  readHostObservation,
  prepareHostObservation,
  createHostObservation,
  importHostObservation,
} from '../real/host-observation-control.ts'
import {
  validateHostManifest,
  validateHostReady,
  validateHostResult,
  validateHostTimeline,
} from '../real/host-observation-schema.ts'
const roots = [],
  expected = 'Public 中文 RdWeb 00000000-0000-4000-8000-000000000000'
const env = {
  RDWEB_WINDOWS_HOST_OBSERVE: '1',
  RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1',
  RDWEB_INPUT_PLATFORMS: 'windows',
  RDWEB_INPUT_CHANNELS: 'chromium',
  RDWEB_B3_BASES: '/',
  RDWEB_B3_MODES: 'preserve',
  RDWEB_WINDOWS_EDITOR_X: '0',
  RDWEB_WINDOWS_EDITOR_Y: '61',
  RDWEB_WINDOWS_EDITOR_WIDTH: '1398',
  RDWEB_WINDOWS_EDITOR_HEIGHT: '894',
}
// 只建立本案私有tmp，不觸及操作者current或Windows。
function directory() {
  const root = mkdtempSync('/tmp/opencode/rdweb-host-test-')
  roots.push(root)
  return join(root, 'observer', 'current')
}
// 真測試只清本次自行建立的精確tmp。
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
// 只控制原controller單調clock；測後還原descriptor，不接觸Windows或真case。
function setupClock(action) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance')
  const time = { now: 1000, calls: 0 }
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: {
      now: /* 計數確保診斷沒有新增clock取樣。 */ () => {
        time.calls++
        return time.now
      },
    },
  })
  try {
    action(time)
  } finally {
    Object.defineProperty(globalThis, 'performance', original)
  }
}
// 新export缺失必為真RED，不以module載入失敗掩蓋行為斷言。
async function diagnosticReader() {
  const { readHostSetupDiagnostic } = await import('../real/host-observation-control.ts')
  assert.equal(typeof readHostSetupDiagnostic, 'function', 'setup diagnostics unavailable')
  return readHostSetupDiagnostic
}

// 新用途factory缺失須以斷言呈現RED，避免匯入錯誤掩蓋真正缺少的能力。
async function handoffFactory() {
  const { createHostHandoffObservation } = await import('../real/host-observation-control.ts')
  assert.equal(typeof createHostHandoffObservation, 'function', 'handoff controller unavailable')
  return createHostHandoffObservation
}
// 手寫同輪ready metadata；只讀本測試剛建立的公開manifest／request，不接觸操作者資料。
function installReady(path) {
  const m = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8'))
  const r = JSON.parse(readFileSync(join(path, 'start-request.json'), 'utf8'))
  writeFileSync(
    join(path, 'ready.json'),
    JSON.stringify({
      schemaVersion: 1,
      runId: m.runId,
      requestId: r.requestId,
      utc: r.createdUtc,
      policyAccepted: true,
      scopeVerified: true,
      observerReady: true,
      clockDomain: 'windows_host',
      frequency: 10000000,
      origin: 0,
    }),
    { mode: 0o600 },
  )
}

// 同時存在兩用途controller時，正式60秒與獨立90秒不能互相延長或被未知env覆寫。
test('handoff 90s budget never changes the formal 60s boundary or revives consumed claims', async () => {
  const handoff = await handoffFactory(),
    inspect = await diagnosticReader()
  for (const elapsed of [59999, 60000, 89999, 90000])
    setupClock((time) => {
      const controllers = []
      const config = { ...env, RDWEB_HOST_SETUP_BUDGET_MS: '180000' }
      for (const [factory, budget] of [
        [createHostObservation, 60000],
        [handoff, 90000],
      ]) {
        const path = directory()
        prepareHostObservation(env, path)
        const controller = factory(config, path)
        assert.deepEqual(Object.keys(controller), ['expected', 'start', 'pollReady', 'finish'])
        controller.start()
        const request = readFileSync(join(path, 'start-request.json'))
        controllers.push({ controller, path, budget, request })
      }
      time.now = 1000 + elapsed
      for (const { controller, path, budget, request } of controllers) {
        installReady(path)
        if (elapsed < budget) assert.equal(controller.pollReady(), true)
        else {
          assert.throws(() => controller.pollReady(), /^Error: host_observation_unavailable$/)
          assert.deepEqual(inspect(controller), { reason: 'deadline_exceeded', elapsedMs: elapsed })
          time.now = 1001
          assert.throws(() => controller.pollReady(), /^Error: host_observation_unavailable$/)
          assert.deepEqual(inspect(controller), { reason: 'deadline_exceeded', elapsedMs: elapsed })
          time.now = 1000 + elapsed
        }
        assert.throws(() => handoff(env, path), /^Error: host_observation_unavailable$/)
        assert.throws(
          () => createHostObservation(env, path),
          /^Error: host_observation_unavailable$/,
        )
        assert.deepEqual(readFileSync(join(path, 'start-request.json')), request)
      }
    })
})

// 新90秒入口仍須完整opt-in與scope，不能把CI／off或其他平台變成校準成功。
test('handoff factory rejects disabled and unsupported scopes before claiming', async () => {
  const handoff = await handoffFactory()
  for (const bad of [
    { ...env, CI: '1' },
    { ...env, GITHUB_ACTIONS: '1' },
    { ...env, RDWEB_WINDOWS_HOST_OBSERVE: '0' },
    { ...env, RDWEB_INPUT_PLATFORMS: 'linux' },
    { ...env, RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '0' },
    { ...env, RDWEB_B3_BASES: '/rdweb' },
  ]) {
    const path = directory()
    prepareHostObservation(env, path)
    assert.throws(() => handoff(bad, path), /^Error: host_observation_unavailable$/)
    assert.deepEqual(readdirSync(path), ['manifest.json'])
  }
})

// 超過原60秒仍要驗ACL／manifest，不能因獨立放寬期限而略過安全守衛。
test('handoff factory retains identity and manifest guards during the extra 30 seconds', async () => {
  const handoff = await handoffFactory(),
    inspect = await diagnosticReader()
  for (const reason of ['identity_rejected', 'manifest_rejected'])
    setupClock((time) => {
      const path = directory()
      prepareHostObservation(env, path)
      const controller = handoff(env, path)
      controller.start()
      time.now = 61000
      if (reason === 'identity_rejected') chmodSync(path, 0o755)
      else chmodSync(join(path, 'manifest.json'), 0o644)
      assert.throws(() => controller.pollReady(), /^Error: host_observation_unavailable$/)
      assert.deepEqual(inspect(controller), { reason, elapsedMs: 60000 })
    })
})

// 缺路徑／正式default拒絕只在複製模組的scratch中驗證，絕不探測真正正式current。
test('handoff factory requires explicit calibration directory and preserves the formal default', async () => {
  await handoffFactory()
  const cwd = directory()
  mkdirSync(cwd, { recursive: true, mode: 0o700 })
  for (const name of [
    'frontend/e2e/real/host-observation-control.ts',
    'frontend/e2e/real/host-observation-schema.ts',
  ]) {
    const target = join(cwd, name)
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    copyFileSync(name, target)
  }
  const script = `
    import assert from 'node:assert/strict';
    import { readdirSync } from 'node:fs';
    import { resolve } from 'node:path';
    import { prepareHostObservation, createHostHandoffObservation } from './frontend/e2e/real/host-observation-control.ts';
    const env = ${JSON.stringify(env)};
    prepareHostObservation(env);
    const path = resolve('frontend/.cache/windows-host-observer/current');
    for (const value of [undefined, null, '', 90000, path]) {
      // 只驗固定錯誤與無claim副作用，不回顯任何參數或資料。
      assert.throws(() => createHostHandoffObservation(env, value), /^Error: host_observation_unavailable$/);
    }
    assert.deepEqual(readdirSync(path), ['manifest.json']);
    console.log('host_handoff_scope_rejected,formalClaimPreserved=True');
  `
  const checked = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd,
    env: {},
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.equal(checked.status, 0)
  assert.equal(checked.stderr, '')
  assert.equal(checked.stdout, 'host_handoff_scope_rejected,formalClaimPreserved=True\n')
})

// 外部偽造物件／Proxy／getter不能替controller的私有來源分類或執行未知程式。
test('setup diagnostics ignore forged metadata and return immutable unknown snapshots', async () => {
  const inspect = await diagnosticReader()
  let calls = 0
  const denied = new Proxy(
    {},
    {
      get: /* 任何未知屬性讀取都會使本案失敗。 */ () => {
        calls++
        throw new Error('Public denied getter')
      },
    },
  )
  for (const value of [
    null,
    undefined,
    1,
    'Public denied',
    denied,
    { reason: 'deadline_exceeded', elapsedMs: 60000 },
  ]) {
    const snapshot = inspect(value)
    assert.deepEqual(snapshot, { reason: 'unknown', elapsedMs: null })
    assert.equal(Object.isFrozen(snapshot), true)
    assert.throws(
      /* 不可把回傳snapshot變成額外公開狀態。 */ () => {
        snapshot.reason = 'Public denied'
      },
      TypeError,
    )
  }
  assert.equal(calls, 0)
})

// 真檔案guard決定分類，原short-circuit順序／固定錯誤及poison後首證據均不得改變。
test('setup diagnostics identify actual guards without replacing codes or reviving poisoned setup', async () => {
  const inspect = await diagnosticReader()
  for (const [kind, now, reason, elapsedMs] of [
    ['deadline', 61000, 'deadline_exceeded', 60000],
    ['nonfinite', NaN, 'clock_invalid', null],
    ['regressed', 999, 'clock_regressed', null],
    ['overflow', 2147484648, 'deadline_exceeded', null],
    ['identity_mode', 61000, 'identity_rejected', 60000],
    ['identity_inode', 1012, 'identity_rejected', 12],
    ['manifest_changed', 1012, 'manifest_rejected', 12],
    ['manifest_permissions', 1012, 'manifest_rejected', 12],
    ['manifest_extra', 1012, 'manifest_rejected', 12],
    ['manifest_expired', 1012, 'manifest_rejected', 12],
    ['ready', 1012, 'ready_rejected', 12],
  ])
    setupClock(
      /* 全部資料僅此測試自建public fixture。 */ (time) => {
        const path = directory()
        prepareHostObservation(env, path)
        const controller = createHostObservation(env, path)
        assert.deepEqual(Object.keys(controller), ['expected', 'start', 'pollReady', 'finish'])
        controller.start()
        if (kind === 'identity_mode') chmodSync(path, 0o755)
        if (kind === 'identity_inode') {
          renameSync(path, path + '-old')
          mkdirSync(path, { mode: 0o700 })
          copyFileSync(join(path + '-old', 'manifest.json'), join(path, 'manifest.json'))
        }
        const file = join(path, 'manifest.json')
        if (kind.startsWith('manifest_')) {
          const m = JSON.parse(readFileSync(file, 'utf8'))
          if (kind === 'manifest_changed') m.runId = '00000000-0000-4000-8000-000000000009'
          if (kind === 'manifest_extra') m.text = 'Public denied metadata'
          if (kind === 'manifest_expired') {
            m.createdUtc = new Date(Date.now() - 3600000).toISOString()
            m.expiresUtc = new Date(Date.now() - 1800000).toISOString()
          }
          writeFileSync(file, JSON.stringify(m))
          if (kind === 'manifest_permissions') chmodSync(file, 0o644)
        }
        if (kind === 'ready')
          writeFileSync(join(path, 'ready.json'), '{"text":"Public denied metadata"}', {
            mode: 0o600,
          })
        time.now = now
        assert.throws(
          /* 沿原正式拒絕路徑取得來源分類。 */ () => controller.pollReady(),
          /^Error: host_observation_unavailable$/,
        )
        const snapshot = inspect(controller)
        assert.deepEqual(snapshot, { reason, elapsedMs })
        assert.equal(Object.isFrozen(snapshot), true)
        assert.equal(JSON.stringify(snapshot).includes('Public denied'), false)
        if (kind !== 'ready') {
          time.now = 1001
          assert.throws(
            /* poison後不重建clock或覆寫第一次拒絕。 */ () => controller.pollReady(),
            /^Error: host_observation_unavailable$/,
          )
          assert.deepEqual(inspect(controller), snapshot)
        }
      },
    )
})

// 未start／已finish仍拒絕，診斷不加clockread，不改原可用介面或建立額外檔案。
test('setup diagnostics preserve request and closed guards without additional clock reads', async () => {
  const inspect = await diagnosticReader()
  setupClock(
    /* 原guard與本測試同一clock。 */ (time) => {
      const path = directory()
      prepareHostObservation(env, path)
      const controller = createHostObservation(env, path)
      assert.throws(
        /* start前的拒絕仍是原固定code。 */ () => controller.pollReady(),
        /^Error: host_observation_unavailable$/,
      )
      assert.deepEqual(inspect(controller), { reason: 'request_rejected', elapsedMs: null })
      const before = time.calls
      controller.start()
      assert.equal(time.calls, before + 2)
      assert.deepEqual(inspect(controller), { reason: 'unknown', elapsedMs: 0 })
      assert.equal(time.calls, before + 2)
      time.now = 1005
      assert.equal(controller.pollReady(), false)
      assert.deepEqual(inspect(controller), { reason: 'unknown', elapsedMs: 5 })
      assert.equal(time.calls, before + 3)
      assert.deepEqual(readdirSync(path).sort(), [
        'claim.json',
        'manifest.json',
        'start-request.json',
      ])
      controller.finish(
        { clockDomain: 'browser_main', events: [], overflow: false, unavailable: false },
        'host_setup_failed',
      )
      assert.throws(
        /* 已close不能因診斷getter回來而放行。 */ () => controller.pollReady(),
        /^Error: host_observation_unavailable$/,
      )
      assert.deepEqual(inspect(controller), { reason: 'closed', elapsedMs: 5 })
    },
  )
})
// 公開固定schema可校準驗證器，不重用被測builder生成兩側oracle。
function manifest() {
  const createdUtc = new Date().toISOString()
  return {
    schemaVersion: 1,
    runId: '00000000-0000-4000-8000-000000000001',
    expected,
    editor: { x: 0, y: 61, width: 1398, height: 894 },
    createdUtc,
    expiresUtc: new Date(Date.parse(createdUtc) + 1800000).toISOString(),
  }
}
// 合法metadata row，沒有未知文字／hash。
function row() {
  return {
    ordinal: 1,
    kind: 'clipboard',
    tStartUs: 100,
    tEndUs: 110,
    clipboardOrdinal: 1,
    notificationUs: 90,
    scopeVerified: true,
    editorReadable: true,
    editorExact: false,
    editorStable: true,
    clipboardReadable: true,
    clipboardExact: false,
    clipboardStable: true,
    clipboardOwnerMatchesEditor: true,
    clipboardMatchesEditor: false,
    code: 'host_observed',
  }
}
// 只模擬檔案交接，資料仍由真schema／filesystem讀寫。
function result(m, r) {
  return {
    schemaVersion: 1,
    runId: m.runId,
    requestId: r.requestId,
    startedUtc: r.createdUtc,
    endedUtc: new Date(Date.parse(r.createdUtc) + 120000).toISOString(),
    clockDomain: 'windows_host',
    observations: [row()],
    clipboardNotifications: 1,
    sampleAttempts: 1,
    overflow: false,
    unavailable: false,
    resourcesClosed: true,
    code: 'host_observed',
  }
}
// 明確off不得讀不存在檔或mkdir，非法opt-in不得fallback。
test('off performs no filesystem work and invalid scopes fail closed', () => {
  const path = directory()
  assert.equal(readHostObservation({}, path), null)
  assert.equal(readdirSync(roots[0]).length, 0)
  for (const bad of [
    { ...env, CI: 'true' },
    { ...env, RDWEB_WINDOWS_HOST_OBSERVE: 'yes' },
    { ...env, RDWEB_INPUT_PLATFORMS: 'linux' },
    { ...env, RDWEB_B3_BASES: '/rdweb' },
  ])
    assert.throws(() => readHostObservation(bad, path), /^Error: host_observation_unavailable$/)
})
// 如果只印expected或跳過exclusive claim／ready關聯，本案真檔案結果會失敗。
test('owns one private manifest/request/ready/result join without changing strict failure', () => {
  const path = directory()
  prepareHostObservation(env, path)
  const m = readHostObservation(env, path)
  assert.equal(m.expected.startsWith('Public 中文 RdWeb '), true)
  assert.equal(statSync(path).mode & 0o777, 0o700)
  assert.equal(statSync(join(path, 'manifest.json')).mode & 0o777, 0o600)
  assert.throws(() => prepareHostObservation(env, path), /^Error: host_observation_unavailable$/)
  const c = createHostObservation(env, path)
  assert.equal(c.expected, m.expected)
  assert.throws(() => createHostObservation(env, path), /^Error: host_observation_unavailable$/)
  c.start()
  const r = JSON.parse(readFileSync(join(path, 'start-request.json'), 'utf8'))
  assert.equal(c.pollReady(), false)
  const source = join(roots[0], 'ready.json')
  writeFileSync(
    source,
    JSON.stringify({
      schemaVersion: 1,
      runId: m.runId,
      requestId: r.requestId,
      utc: r.createdUtc,
      policyAccepted: true,
      scopeVerified: true,
      observerReady: true,
      clockDomain: 'windows_host',
      frequency: 10000000,
      origin: 0,
    }),
    { mode: 0o600 },
  )
  importHostObservation('ready', source, env, path)
  assert.equal(c.pollReady(), true)
  c.finish(
    { clockDomain: 'browser_main', events: [], overflow: false, unavailable: false },
    'input_clipboard_remote_input_mismatch',
  )
  const host = result(m, r)
  writeFileSync(source, JSON.stringify(host))
  importHostObservation('result', source, env, path)
  const joined = JSON.parse(readFileSync(join(path, 'joined.json'), 'utf8'))
  assert.equal(joined.crossClockOrder, 'unknown')
  assert.equal(joined.client.code, 'input_clipboard_remote_input_mismatch')
  assert.equal(joined.host.observations[0].clipboardMatchesEditor, false)
  assert.throws(
    () => importHostObservation('result', source, env, path),
    /^Error: host_observation_unavailable$/,
  )
})
// 真geometry／permission／symlink防護，不以mock fs通過。
test('rejects public geometry mismatch and non-private or linked files', () => {
  const path = directory()
  prepareHostObservation(env, path)
  assert.throws(
    () => readHostObservation({ ...env, RDWEB_WINDOWS_EDITOR_X: '1' }, path),
    /^Error: host_observation_unavailable$/,
  )
  chmodSync(join(path, 'manifest.json'), 0o644)
  assert.throws(() => readHostObservation(env, path), /^Error: host_observation_unavailable$/)
  const second = directory()
  mkdirSync(join(roots.at(-1), 'observer'), { mode: 0o700 })
  symlinkSync(path, second)
  assert.throws(() => readHostObservation(env, second), /^Error: host_observation_unavailable$/)
})
// manifest不能容納秘密metadata／不合法Unicode／超額或過期。
test('validates bounded manifest and refuses expiry, extra fields and unsafe expected', () => {
  const m = manifest()
  assert.deepEqual(validateHostManifest(m), m)
  for (const bad of [
    { ...m, password: 'public_denied' },
    { ...m, expected: 'Private' },
    { ...m, expected: 'Public 中文 RdWeb \0bad' },
    { ...m, expected: 'Public 中文 RdWeb \uD800bad' },
    { ...m, expected: 'Public 中文 RdWeb ' + '中'.repeat(1400) },
    { ...m, expiresUtc: m.createdUtc },
  ])
    assert.throws(() => validateHostManifest(bad), /^Error: host_observation_unavailable$/)
  assert.throws(
    () => validateHostManifest(m, Date.parse(m.expiresUtc)),
    /^Error: host_observation_unavailable$/,
  )
})
// two exact=false不能被驗證器改成兩内容相等，unknown與clock越界不得接收。
test('validates host boolean evidence with clocks and matching request', () => {
  const m = manifest(),
    r = {
      schemaVersion: 1,
      runId: m.runId,
      requestId: '00000000-0000-4000-8000-000000000002',
      createdUtc: m.createdUtc,
    },
    host = result(m, r)
  assert.deepEqual(validateHostResult(host, m, r), host)
  for (const bad of [
    { ...host, requestId: m.runId },
    { ...host, raw: 'public_denied' },
    { ...host, observations: [{ ...row(), tEndUs: 99 }] },
    { ...host, observations: [{ ...row(), notificationUs: 111 }] },
    { ...host, observations: [{ ...row(), hash: 'public_denied' }] },
    { ...host, observations: [{ ...row(), editorReadable: false, clipboardMatchesEditor: true }] },
    { ...host, observations: Array(129).fill(row()) },
  ])
    assert.throws(() => validateHostResult(bad, m, r), /^Error: host_observation_unavailable$/)
  const ready = {
    schemaVersion: 1,
    runId: m.runId,
    requestId: r.requestId,
    utc: r.createdUtc,
    policyAccepted: true,
    scopeVerified: true,
    observerReady: true,
    clockDomain: 'windows_host',
    frequency: 10000000,
    origin: 0,
  }
  assert.deepEqual(validateHostReady(ready, m, r), ready)
  assert.throws(
    () => validateHostReady({ ...ready, requestId: m.runId }, m, r),
    /^Error: host_observation_unavailable$/,
  )
  assert.deepEqual(
    validateHostTimeline({
      clockDomain: 'browser_main',
      events: [],
      overflow: false,
      unavailable: false,
    }),
    { clockDomain: 'browser_main', events: [], overflow: false, unavailable: false },
  )
  assert.throws(
    () =>
      validateHostTimeline({
        clockDomain: 'browser_main',
        events: [],
        overflow: false,
        unavailable: false,
        hash: 'public_denied',
      }),
    /^Error: host_observation_unavailable$/,
  )
})
// 若validator把物件coerce成enum再serialize，toJSON就能帶出未知文字；必須完全拒絕且不呼方法。
test('never coerces or serializes object-valued enums', () => {
  let calls = 0
  const forged = {
    // 不得因白名單比較觸發使用者自訂轉字串。
    toString() {
      calls++
      return 'clipboard'
    },
    // 不得進任何落盤序列化路徑。
    toJSON() {
      calls++
      return 'Public denied metadata'
    },
  }
  const m = manifest(),
    r = {
      schemaVersion: 1,
      runId: m.runId,
      requestId: '00000000-0000-4000-8000-000000000002',
      createdUtc: m.createdUtc,
    }
  assert.throws(
    () => validateHostResult({ ...result(m, r), observations: [{ ...row(), kind: forged }] }, m, r),
    /^Error: host_observation_unavailable$/,
  )
  assert.equal(calls, 0)
  assert.throws(
    () =>
      validateHostTimeline({
        clockDomain: 'browser_main',
        events: [
          {
            ordinal: 1,
            kind: 'batch_submit',
            tUs: 1,
            revision: 1,
            generation: 1,
            batchId: 1,
            requestId: null,
            code: {
              toString: /* 禁止enum轉型。 */ () => 'observed',
              toJSON: /* 禁止任意資料序列化。 */ () => 'Public denied',
            },
          },
        ],
        overflow: false,
        unavailable: false,
      }),
    /^Error: host_observation_unavailable$/,
  )
})
// 陣列上的getter／自訂iterator不是schema；不得以檢查length後遍歷執行任意程式。
test('rejects accessor arrays without reading their contents', () => {
  let calls = 0
  const entries = []
  Object.defineProperty(entries, '0', {
    enumerable: true,
    configurable: true,
    get: /* 不得取得未知資料。 */ () => {
      calls++
      return {}
    },
  })
  assert.throws(
    () =>
      validateHostTimeline({
        clockDomain: 'browser_main',
        events: entries,
        overflow: false,
        unavailable: false,
      }),
    /^Error: host_observation_unavailable$/,
  )
  assert.equal(calls, 0)
})
// 相等布林互相矛盾／版本ordinal重用／讀取區間重疊都不是完整單query證據。
test('rejects contradictory evidence and duplicate notification versions', () => {
  const m = manifest(),
    r = {
      schemaVersion: 1,
      runId: m.runId,
      requestId: '00000000-0000-4000-8000-000000000002',
      createdUtc: m.createdUtc,
    },
    host = result(m, r)
  for (const rows of [
    [{ ...row(), editorExact: true, clipboardExact: true, clipboardMatchesEditor: false }],
    [row(), { ...row(), ordinal: 2, tStartUs: 120, tEndUs: 130 }],
    [row(), { ...row(), ordinal: 2, tStartUs: 105, tEndUs: 130, clipboardOrdinal: 2 }],
  ])
    assert.throws(
      () =>
        validateHostResult(
          { ...host, clipboardNotifications: 2, sampleAttempts: 2, observations: rows },
          m,
          r,
        ),
      /^Error: host_observation_unavailable$/,
    )
  assert.throws(
    () => validateHostResult({ ...host, resourcesClosed: false }, m, r),
    /^Error: host_observation_unavailable$/,
  )
})
// 曾到期後倒序clock不能重新放行；已finish及manifest遭置換亦不能取得ready。
test('poisons expired setup and refuses replaced manifests', () => {
  const path = directory()
  prepareHostObservation(env, path)
  const c = createHostObservation(env, path)
  let time = 0
  const original = globalThis.performance
  try {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { now: /* 私有可控單調clock。 */ () => time },
    })
    c.start()
    time = 60000
    assert.throws(() => c.pollReady(), /^Error: host_observation_unavailable$/)
    time = 1
    assert.throws(() => c.pollReady(), /^Error: host_observation_unavailable$/)
  } finally {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: original })
  }
  const next = directory()
  prepareHostObservation(env, next)
  const second = createHostObservation(env, next)
  second.start()
  const changed = JSON.parse(readFileSync(join(next, 'manifest.json'), 'utf8'))
  changed.runId = '00000000-0000-4000-8000-000000000003'
  writeFileSync(join(next, 'manifest.json'), JSON.stringify(changed))
  assert.throws(() => second.pollReady(), /^Error: host_observation_unavailable$/)
})
// source的symlink祖先不可藉nofollow最後一層迴避；只留固定錯誤不回原文。
test('rejects linked import parents and preserves existing output files', () => {
  const path = directory()
  prepareHostObservation(env, path)
  const c = createHostObservation(env, path)
  c.start()
  const m = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')),
    r = JSON.parse(readFileSync(join(path, 'start-request.json'), 'utf8'))
  const ready = {
    schemaVersion: 1,
    runId: m.runId,
    requestId: r.requestId,
    utc: r.createdUtc,
    policyAccepted: true,
    scopeVerified: true,
    observerReady: true,
    clockDomain: 'windows_host',
    frequency: 10000000,
    origin: 0,
  }
  const folder = join(roots[0], 'incoming')
  mkdirSync(folder, { mode: 0o700 })
  writeFileSync(join(folder, 'ready.json'), JSON.stringify(ready), { mode: 0o600 })
  symlinkSync(folder, join(roots[0], 'linked'))
  assert.throws(
    () => importHostObservation('ready', join(roots[0], 'linked', 'ready.json'), env, path),
    /^Error: host_observation_unavailable$/,
  )
  assert.equal(readdirSync(path).includes('ready.json'), false)
})
// 已有任一終態檔就完全拒絕安裝，不先寫joined再發現result存在；公開oracle檔不得被動修改。
test('preexisting result prevents any partial joined installation', () => {
  const path = directory()
  prepareHostObservation(env, path)
  const c = createHostObservation(env, path)
  c.start()
  const m = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')),
    r = JSON.parse(readFileSync(join(path, 'start-request.json'), 'utf8'))
  const source = join(roots[0], 'incoming.json')
  writeFileSync(
    source,
    JSON.stringify({
      schemaVersion: 1,
      runId: m.runId,
      requestId: r.requestId,
      utc: r.createdUtc,
      policyAccepted: true,
      scopeVerified: true,
      observerReady: true,
      clockDomain: 'windows_host',
      frequency: 10000000,
      origin: 0,
    }),
    { mode: 0o600 },
  )
  importHostObservation('ready', source, env, path)
  c.pollReady()
  c.finish(
    { clockDomain: 'browser_main', events: [], overflow: false, unavailable: false },
    'input_clipboard_remote_input_mismatch',
  )
  writeFileSync(join(path, 'result.json'), 'public_existing_result', { mode: 0o600 })
  writeFileSync(source, JSON.stringify(result(m, r)))
  assert.throws(
    () => importHostObservation('result', source, env, path),
    /^Error: host_observation_unavailable$/,
  )
  assert.equal(existsSync(join(path, 'joined.json')), false)
  assert.equal(readFileSync(join(path, 'result.json'), 'utf8'), 'public_existing_result')
})
// 真CLI在自有tmp安裝來源與環境白名單；不接觸操作者current或私有文字JSON。
test('CLI prepares exclusively and never echoes invalid arguments', () => {
  const path = directory(),
    root = roots[0]
  for (const name of [
    'frontend/e2e/real/host-observation-control.ts',
    'frontend/e2e/real/host-observation-schema.ts',
    'frontend/e2e/scripts/prepare-windows-host-observation.mjs',
    'frontend/e2e/scripts/import-windows-host-observation.mjs',
  ]) {
    const destination = join(root, name)
    mkdirSync(join(destination, '..'), { recursive: true, mode: 0o700 })
    copyFileSync(name, destination)
  }
  const safe = { PATH: process.env.PATH, ...env }
  const prepared = spawnSync(
    process.execPath,
    ['frontend/e2e/scripts/prepare-windows-host-observation.mjs'],
    {
      cwd: root,
      env: safe,
      encoding: 'utf8',
    },
  )
  assert.equal(prepared.status, 0)
  assert.equal(prepared.stdout, 'host_observer_prepared\n')
  assert.equal(prepared.stderr, '')
  const rejected = spawnSync(
    process.execPath,
    ['frontend/e2e/scripts/import-windows-host-observation.mjs', 'Public denied'],
    { cwd: root, env: safe, encoding: 'utf8' },
  )
  assert.equal(rejected.status, 2)
  assert.equal(rejected.stderr, 'host_observation_unavailable\n')
  assert.equal(rejected.stdout, '')
  assert.equal(readdirSync(join(root, 'frontend/.cache/windows-host-observer/current')).length, 1)
  assert.equal(existsSync(path), false)
})
