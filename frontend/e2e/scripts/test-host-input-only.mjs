import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  chmodSync,
  symlinkSync,
  linkSync,
  renameSync,
  rmSync,
  copyFileSync,
  existsSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as control from '../real/host-observation-control.ts'
import * as schema from '../real/host-observation-schema.ts'

const roots = []
const env = {
  RDWEB_WINDOWS_HOST_INPUT_ONLY: '1',
  RDWEB_WINDOWS_HOST_OBSERVE: '1',
  RDWEB_INPUT_PLATFORMS: 'windows',
  RDWEB_INPUT_CHANNELS: 'chromium',
  RDWEB_B3_BASES: '/',
  RDWEB_B3_MODES: 'preserve',
  RDWEB_WINDOWS_EDITOR_X: '0',
  RDWEB_WINDOWS_EDITOR_Y: '152',
  RDWEB_WINDOWS_EDITOR_WIDTH: '1075',
  RDWEB_WINDOWS_EDITOR_HEIGHT: '508',
}
const oldEnv = { ...env, RDWEB_WINDOWS_HOST_INPUT_ONLY: '0', RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' }
// 新能力以存在性斷言作RED，不以靜態匯入錯誤充數。
function api() {
  for (const name of [
    'prepareHostInputOnlyObservation',
    'readHostInputOnlyObservation',
    'createHostInputOnlyObservation',
    'importHostInputOnlyObservation',
  ])
    assert.equal(typeof control[name], 'function', name)
  return control
}
// 僅在本測試新建的精確私有tmp內使用固定公開fixture。
function directory() {
  const root = mkdtempSync('/tmp/opencode/rdweb-input-only-test-')
  roots.push(root)
  return join(root, 'observer', 'current')
}
// 每案只清本次擁有的tmp，不碰repo cache或Windows。
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
// 私有測試資料由手寫安全物件產生，不取得真實文字。
function save(path, value) {
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 })
}
// 只讀本測試剛產生的公開資料。
function load(path, name) {
  return JSON.parse(readFileSync(join(path, name), 'utf8'))
}
// 完整client report的期望獨立手寫，不以被測函數計算。
function report() {
  return {
    code: 'input_only_completed',
    main: {
      prefixSubmitted: true,
      prefixAccepted: true,
      postTextInput: false,
      clipboardObserved: false,
      scopeInterrupted: false,
      overflow: false,
    },
    encoded: {
      observed: true,
      textExact: true,
      textSingle: true,
      initialSelectComplete: true,
      sequenceComplete: true,
      sequenceInvalid: false,
      overflow: false,
      unavailable: false,
    },
    timeline: { clockDomain: 'browser_main', events: [], overflow: false, unavailable: false },
    observation: { budgetMs: 5000, elapsedMs: 5000, completed: true },
    resourcesClosed: true,
  }
}
// 原生v1 row保留全部欄位，不以部分mock掩蓋契約。
function row(overrides = {}) {
  return {
    ordinal: 1,
    kind: 'editor',
    tStartUs: 100,
    tEndUs: 200,
    clipboardOrdinal: null,
    notificationUs: null,
    scopeVerified: true,
    editorReadable: true,
    editorExact: false,
    editorStable: true,
    clipboardReadable: false,
    clipboardExact: false,
    clipboardStable: false,
    clipboardOwnerMatchesEditor: null,
    clipboardMatchesEditor: null,
    code: 'host_observed',
    ...overrides,
  }
}
// 沿v1完整host契約產生公開資料，不冒充Windows執行。
function host(manifest, request, observations = [row()]) {
  return {
    schemaVersion: 1,
    runId: manifest.runId,
    requestId: request.requestId,
    startedUtc: request.createdUtc,
    endedUtc: new Date(Date.parse(request.createdUtc) + 120000).toISOString(),
    clockDomain: 'windows_host',
    observations,
    clipboardNotifications: 0,
    sampleAttempts: 10,
    overflow: false,
    unavailable: false,
    resourcesClosed: true,
    code: 'host_observed',
  }
}
// ready與host共用同一UTC；不把UTC當跨機因果。
function ready(manifest, request) {
  return {
    schemaVersion: 1,
    runId: manifest.runId,
    requestId: request.requestId,
    utc: request.createdUtc,
    policyAccepted: true,
    scopeVerified: true,
    observerReady: true,
    clockDomain: 'windows_host',
    frequency: 10000000,
    origin: 0,
  }
}
// 建立同輪claim與公開request，尚不輸入或連線。
function started() {
  const a = api(),
    path = directory()
  a.prepareHostInputOnlyObservation(env, path)
  const controller = a.createHostInputOnlyObservation(env, path)
  controller.start()
  return {
    path,
    controller,
    manifest: load(path, 'manifest.json'),
    request: load(path, 'start-request.json'),
  }
}
// 使用原readonly／import真路徑安裝安全ready。
function acceptReady(f) {
  const source = join(dirname(f.path), 'incoming-ready.json')
  save(source, ready(f.manifest, f.request))
  control.importHostInputOnlyObservation('ready', source, env, f.path)
  assert.equal(f.controller.pollReady(), true)
  return source
}
// 純函數module缺失同樣以能力斷言呈現。
async function classifiers() {
  assert.ok(
    existsSync('frontend/e2e/real/host-input-only.ts'),
    'input-only classification unavailable',
  )
  return import('../real/host-input-only.ts')
}
// 證明新用途真實檔案生命週期、權限、獨立分類與不覆寫。
test('input_only_private_lifecycle_and_purpose_isolation', async () => {
  const f = started(),
    a = api()
  assert.deepEqual(load(f.path, 'purpose.json'), {
    schemaVersion: 1,
    purpose: 'input_only',
    runId: f.manifest.runId,
  })
  assert.throws(() => control.createHostObservation(oldEnv, f.path))
  assert.throws(() => control.createHostHandoffObservation(oldEnv, f.path))
  const source = acceptReady(f)
  f.controller.finish(report())
  assert.throws(() => a.importHostInputOnlyObservation('ready', source, env, f.path))
  const original = readFileSync(join(f.path, 'client.json'))
  save(source, host(f.manifest, f.request))
  a.importHostInputOnlyObservation('result', source, env, f.path)
  const joined = load(f.path, 'joined.json')
  assert.equal(joined.classification, 'stable_mismatch_observed')
  assert.equal(joined.crossClockOrder, 'unknown')
  assert.equal(joined.purpose, 'input_only')
  assert.equal(joined.client.code, 'input_only_completed')
  assert.equal(JSON.stringify(joined).includes(f.manifest.expected), false)
  assert.deepEqual(readFileSync(join(f.path, 'client.json')), original)
  for (const name of readdirSync(f.path)) {
    const stat = lstatSync(join(f.path, name))
    assert.equal(stat.mode & 0o777, 0o600)
    assert.equal(stat.nlink, 1)
    assert.equal(stat.uid, process.getuid())
  }
  assert.throws(() => a.importHostInputOnlyObservation('result', source, env, f.path))
  assert.throws(() => f.controller.finish(report()))
  await classifiers()
})
// 新旗標與不支援scope不能觸發mkdir／claim或原HR退回。
test('input-only scope rejects unsafe flags before filesystem side effects', () => {
  const a = api()
  for (const patch of [
    { CI: '1' },
    { GITHUB_ACTIONS: '1' },
    { RDWEB_WINDOWS_HOST_OBSERVE: '0' },
    { RDWEB_WINDOWS_HOST_INPUT_ONLY: 'bad' },
    { RDWEB_INPUT_PLATFORMS: 'linux' },
    { RDWEB_INPUT_CHANNELS: 'msedge' },
    { RDWEB_B3_BASES: '/rdweb' },
    { RDWEB_B3_MODES: 'strip' },
    { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' },
    { RDWEB_WINDOWS_TEXT_PROBE: '1' },
  ]) {
    const path = directory()
    assert.throws(() => a.prepareHostInputOnlyObservation({ ...env, ...patch }, path))
    assert.equal(existsSync(path), false)
  }
  const absent = directory()
  assert.equal(a.readHostInputOnlyObservation({}, absent), null)
  assert.equal(existsSync(absent), false)
  assert.throws(() =>
    control.prepareHostObservation({ ...oldEnv, RDWEB_WINDOWS_HOST_INPUT_ONLY: '1' }, absent),
  )
})
// 更動用途內容或換inode即永久作廢，不能回填後恢復gate。
test('input-only purpose mutation poisons the controller and finish', () => {
  for (const mutation of [
    'missing',
    'extra',
    'purpose',
    'run',
    'mode',
    'inode',
    'symlink',
    'hardlink',
  ]) {
    const f = started(),
      marker = join(f.path, 'purpose.json'),
      value = load(f.path, 'purpose.json')
    if (mutation === 'missing') renameSync(marker, marker + '.old')
    if (mutation === 'extra') save(marker, { ...value, text: 'Public rejected' })
    if (mutation === 'purpose') save(marker, { ...value, purpose: 'hr' })
    if (mutation === 'run')
      save(marker, { ...value, runId: '00000000-0000-4000-8000-000000000000' })
    if (mutation === 'mode') chmodSync(marker, 0o644)
    if (mutation === 'inode') {
      renameSync(marker, marker + '.old')
      save(marker, value)
    }
    if (mutation === 'symlink') {
      renameSync(marker, marker + '.old')
      symlinkSync(marker + '.old', marker)
    }
    if (mutation === 'hardlink') linkSync(marker, marker + '.link')
    assert.throws(() => f.controller.pollReady(), mutation)
    assert.throws(() => f.controller.finish(report()), mutation)
    assert.equal(existsSync(join(f.path, 'client.json')), false)
  }
})
// 真monotonic clock邊界不被其他用途90秒或外部env覆寫。
test('input_only_60s_gate_never_uses_handoff_90s', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance')
  try {
    let time = 1000
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { now: /* 單一測試clock。 */ () => time },
    })
    for (const elapsed of [59999, 60000]) {
      time = 1000
      const f = started()
      save(join(f.path, 'ready.json'), ready(f.manifest, f.request))
      time += elapsed
      if (elapsed === 59999) assert.equal(f.controller.pollReady(), true)
      else {
        assert.throws(() => f.controller.pollReady())
        time = 1001
        assert.throws(() => f.controller.pollReady())
      }
    }
    time = 1000
    const f = started()
    time = 999
    assert.throws(() => f.controller.pollReady())
    time = 1001
    assert.throws(() => f.controller.pollReady())
  } finally {
    Object.defineProperty(globalThis, 'performance', original)
  }
})
// 分類不以absence、baseline或不可讀false冒充輸入後mismatch。
test('input_only_classification_requires_valid_nonbaseline_editor_rows', async () => {
  const { classifyHostInputOnly } = await classifiers(),
    f = started()
  const client = {
    schemaVersion: 1,
    purpose: 'input_only',
    runId: f.manifest.runId,
    requestId: f.request.requestId,
    ...report(),
  }
  for (const [rows, want] of [
    [[row()], 'stable_mismatch_observed'],
    [[row({ editorExact: true })], 'stable_exact_observed'],
    [
      [row(), row({ ordinal: 2, tStartUs: 300, tEndUs: 400, editorExact: true })],
      'stable_exact_observed',
    ],
    [[], 'inconclusive'],
    [[row({ kind: 'baseline' })], 'inconclusive'],
    [[row({ kind: 'terminal' })], 'inconclusive'],
    [[row({ kind: 'clipboard', clipboardOrdinal: 1, notificationUs: 50 })], 'inconclusive'],
    [[row({ editorStable: false })], 'inconclusive'],
    [[row({ editorReadable: false })], 'inconclusive'],
    [[row({ scopeVerified: false })], 'inconclusive'],
  ])
    assert.equal(classifyHostInputOnly(client, host(f.manifest, f.request, rows)), want)
  for (const patch of [
    { overflow: true },
    { unavailable: true },
    { resourcesClosed: false },
    { code: 'host_query_timeout' },
  ])
    assert.equal(
      classifyHostInputOnly(client, { ...host(f.manifest, f.request), ...patch }),
      'inconclusive',
    )
  assert.equal(
    classifyHostInputOnly(
      { ...client, code: 'input_only_input_failed' },
      host(f.manifest, f.request),
    ),
    'inconclusive',
  )
})
// 完成狀態必須有每一項必要證據；getter與extra不得繞白名單。
test('input_only_client_rejects_forged_completion', async () => {
  const f = started(),
    { inputOnlyClientCode } = await classifiers()
  assert.equal(typeof schema.validateInputOnlyClient, 'function')
  const good = {
    schemaVersion: 1,
    purpose: 'input_only',
    runId: f.manifest.runId,
    requestId: f.request.requestId,
    ...report(),
  }
  assert.deepEqual(schema.validateInputOnlyClient(good, f.manifest, f.request), good)
  const bad = [
    { ...good, code: 'host_client_pass' },
    { ...good, purpose: 'hr' },
    { ...good, extra: true },
    { ...good, resourcesClosed: false },
    ...[4999, null, 180001].map(
      /* 固定不合法觀察時間。 */ (elapsedMs) => ({
        ...good,
        observation: { ...good.observation, elapsedMs },
      }),
    ),
    { ...good, observation: { ...good.observation, budgetMs: 6000 } },
    { ...good, observation: { ...good.observation, completed: false } },
    { ...good, timeline: { ...good.timeline, unavailable: true } },
    ...['pull_submit', 'clipboard_data', 'native_write'].map(
      /* 剪貼簿事件不能混入安靜完成。 */ (kind) => ({
        ...good,
        timeline: {
          ...good.timeline,
          events: [
            {
              ordinal: 1,
              kind,
              tUs: 1,
              revision: null,
              generation: null,
              batchId: null,
              requestId: null,
              code: 'observed',
            },
          ],
        },
      }),
    ),
  ]
  for (const key of Object.keys(good.main))
    bad.push({ ...good, main: { ...good.main, [key]: !good.main[key] } })
  for (const key of Object.keys(good.encoded))
    bad.push({ ...good, encoded: { ...good.encoded, [key]: !good.encoded[key] } })
  let getterCalls = 0
  const withGetter = { ...good }
  Object.defineProperty(withGetter, 'resourcesClosed', {
    get: /* 不可執行外部getter。 */ () => {
      getterCalls++
      return true
    },
  })
  bad.push(withGetter)
  for (const value of bad)
    assert.throws(() => schema.validateInputOnlyClient(value, f.manifest, f.request))
  assert.equal(getterCalls, 0)
  assert.equal(
    inputOnlyClientCode({ ...report(), resourcesClosed: false }),
    'input_only_cleanup_failed',
  )
  assert.equal(
    inputOnlyClientCode({ ...report(), code: 'input_only_input_failed', resourcesClosed: false }),
    'input_only_input_failed',
  )
})
// finish入口不可在驗證前展開getter，也不能未通過ready卻保存completed。
test('input-only finish rejects report accessors and cannot complete before ready', () => {
  const f = started()
  let calls = 0
  const value = report()
  Object.defineProperty(value, 'main', {
    get: /* 外部getter不得執行。 */ () => {
      calls++
      return report().main
    },
  })
  assert.throws(() => f.controller.finish(value))
  assert.equal(calls, 0)
  assert.equal(existsSync(join(f.path, 'client.json')), false)
  const second = started()
  second.controller.finish(report())
  assert.equal(load(second.path, 'client.json').code, 'input_only_setup_failed')
})
// 跨輪、重複、超額與非私有輸入不得覆寫當前證據。
test('input-only import and manifest guards reject unsafe data', () => {
  const a = api()
  for (const mutation of ['geometry', 'expired', 'manifest-mode', 'no-purpose', 'claimed']) {
    const path = directory()
    a.prepareHostInputOnlyObservation(env, path)
    const manifest = load(path, 'manifest.json')
    if (mutation === 'geometry')
      save(join(path, 'manifest.json'), { ...manifest, editor: { ...manifest.editor, x: 1 } })
    if (mutation === 'expired') {
      manifest.createdUtc = '2020-01-01T00:00:00.000Z'
      manifest.expiresUtc = '2020-01-01T00:30:00.000Z'
      save(join(path, 'manifest.json'), manifest)
    }
    if (mutation === 'manifest-mode') chmodSync(join(path, 'manifest.json'), 0o644)
    if (mutation === 'no-purpose') renameSync(join(path, 'purpose.json'), join(path, 'purpose.old'))
    if (mutation === 'claimed') a.createHostInputOnlyObservation(env, path)
    assert.throws(() => a.readHostInputOnlyObservation(env, path))
    assert.throws(() => a.prepareHostInputOnlyObservation(env, path))
  }
  for (const mutation of ['run', 'request', 'extra', 'oversize', 'mode', 'link']) {
    const f = started(),
      source = join(dirname(f.path), 'incoming.json'),
      value = ready(f.manifest, f.request)
    if (mutation === 'run') value.runId = '00000000-0000-4000-8000-000000000000'
    if (mutation === 'request') value.requestId = '00000000-0000-4000-8000-000000000000'
    if (mutation === 'extra') value.text = 'Public denied'
    save(source, value)
    if (mutation === 'oversize') writeFileSync(source, ' '.repeat(8193))
    if (mutation === 'mode') chmodSync(source, 0o644)
    if (mutation === 'link') {
      renameSync(source, source + '.old')
      symlinkSync(source + '.old', source)
    }
    assert.throws(() => a.importHostInputOnlyObservation('ready', source, env, f.path))
    assert.equal(existsSync(join(f.path, 'ready.json')), false)
  }
})
// 兩個固定CLI必須在新私有工具副本真執行，不能碰live root或顯示原值。
test('input-only CLI runs only in a private tool copy and masks failures', () => {
  api()
  const root = dirname(dirname(directory()))
  for (const file of [
    'frontend/e2e/real/host-observation-control.ts',
    'frontend/e2e/real/host-observation-schema.ts',
    'frontend/e2e/real/host-input-only.ts',
    'frontend/e2e/scripts/prepare-windows-host-input-only.mjs',
    'frontend/e2e/scripts/import-windows-host-input-only.mjs',
  ]) {
    assert.ok(existsSync(file), file)
    const target = join(root, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(file, target)
  }
  const args = ['frontend/e2e/scripts/prepare-windows-host-input-only.mjs']
  const first = spawnSync(process.execPath, args, {
    cwd: root,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  })
  assert.equal(first.status, 0, first.stderr)
  assert.equal(first.stdout.trim(), 'host_input_only_prepared')
  const current = join(root, 'frontend/.cache/windows-host-input-only/current')
  const controller = control.createHostInputOnlyObservation(env, current)
  controller.start()
  const manifest = load(current, 'manifest.json'),
    request = load(current, 'start-request.json')
  const incoming = join(root, 'incoming.json')
  save(incoming, ready(manifest, request))
  const importedReady = spawnSync(
    process.execPath,
    ['frontend/e2e/scripts/import-windows-host-input-only.mjs', 'ready', incoming],
    { cwd: root, env: { ...env }, encoding: 'utf8' },
  )
  assert.equal(importedReady.status, 0, importedReady.stderr)
  assert.equal(importedReady.stdout.trim(), 'host_input_only_imported')
  assert.equal(controller.pollReady(), true)
  controller.finish(report())
  save(incoming, host(manifest, request))
  const importedResult = spawnSync(
    process.execPath,
    ['frontend/e2e/scripts/import-windows-host-input-only.mjs', 'result', incoming],
    { cwd: root, env: { ...env }, encoding: 'utf8' },
  )
  assert.equal(importedResult.status, 0, importedResult.stderr)
  assert.equal(importedResult.stdout.trim(), 'host_input_only_imported')
  assert.equal(load(current, 'joined.json').classification, 'stable_mismatch_observed')
  const second = spawnSync(process.execPath, args, { cwd: root, env: { ...env }, encoding: 'utf8' })
  assert.equal(second.status, 2)
  assert.equal(second.stderr.trim(), 'host_input_only_unavailable')
  const invalid = spawnSync(
    process.execPath,
    ['frontend/e2e/scripts/import-windows-host-input-only.mjs', 'bad'],
    { cwd: root, env: { ...env }, encoding: 'utf8' },
  )
  assert.equal(invalid.status, 2)
  assert.equal(invalid.stderr.trim(), 'host_input_only_unavailable')
})
