import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  mkdirSync,
  existsSync,
  linkSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  assertTextProbeAvailable,
  createTextProbeControl,
  completeTextProbe,
  textProbeCleanupCode,
} from '../frontend/e2e-real/text-probe-control.ts'
import { copyTextProbeTools } from './text-probe-test-fixture.mjs'
const roots = []
const savedFlag = process.env.RDWEB_WINDOWS_TEXT_PROBE
const enabled = { RDWEB_WINDOWS_TEXT_PROBE: '1' }
const expected = 'Public 中文 RdWeb 00000000-0000-4000-8000-000000000000'
const good = {
  prefixSubmitted: true,
  prefixAccepted: true,
  postTextInput: false,
  clipboardObserved: false,
  scopeInterrupted: false,
  overflow: false,
}
// 每案專用真filesystem，不接觸操作者current或文字log。
function fixture() {
  const root = mkdtempSync('/tmp/opencode/rdweb-text-probe-test-')
  roots.push(root)
  const directory = join(root, 'private', 'current')
  let time = 1000
  const control = createTextProbeControl(
    enabled,
    directory,
    /* literal clock獨立於wallclock。 */ () => time,
  )
  return {
    root,
    directory,
    control,
    setTime: /* 只測deadline邊界，不在Windows等待。 */ (value) => {
      time = value
    },
  }
}
// 精確刪本測試建立的tmp目錄，不動本機操作者檔案。
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  if (savedFlag === undefined) delete process.env.RDWEB_WINDOWS_TEXT_PROBE
  else process.env.RDWEB_WINDOWS_TEXT_PROBE = savedFlag
})
// omission私有權限或放寬schema會使此真filesystem案失敗。
test('exclusive private ready and result preserve only public expected and fixed safety schema', () => {
  const { directory, control } = fixture()
  assert.equal(statSync(directory).mode & 0o777, 0o700)
  control.arm(expected)
  const ready = JSON.parse(readFileSync(join(directory, 'ready.json'), 'utf8'))
  assert.deepEqual(Object.keys(ready).sort(), ['phase', 'utc', 'deadlineUtc', 'expected'].sort())
  assert.equal(ready.phase, 'ready')
  assert.equal(ready.expected, expected)
  assert.equal(Date.parse(ready.deadlineUtc) - Date.parse(ready.utc), 120000)
  assert.equal(statSync(join(directory, 'ready.json')).mode & 0o777, 0o600)
  process.env.RDWEB_WINDOWS_TEXT_PROBE = '1'
  completeTextProbe('looks_intact', directory)
  assert.equal(control.poll(), 'looks_intact')
  assert.equal(control.finish('text_probe_looks_intact', good), 'text_probe_looks_intact')
  const result = JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'))
  assert.deepEqual(
    Object.keys(result).sort(),
    ['utc', 'code', 'evidence', 'nativeTextVerified', 'clipboardVerified'].sort(),
  )
  assert.equal(result.nativeTextVerified, false)
  assert.equal(result.clipboardVerified, false)
  assert.equal(JSON.stringify(result).includes(expected), false)
  for (const file of readdirSync(directory))
    assert.equal(statSync(join(directory, file)).mode & 0o777, 0o600)
})
// fresh preflight是只讀；create不可覆寫殘留或其他runner的scope。
test('preflight creates nothing and refuses every existing current', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-text-probe-test-')
  roots.push(root)
  const directory = join(root, 'current')
  assertTextProbeAvailable(enabled, directory)
  assert.deepEqual(readdirSync(root), [])
  const control = createTextProbeControl(enabled, directory)
  assert.throws(
    () => assertTextProbeAvailable(enabled, directory),
    /^Error: text_probe_control_unavailable$/,
  )
  assert.throws(
    () => createTextProbeControl(enabled, directory),
    /^Error: text_probe_control_unavailable$/,
  )
  control.dispose()
  assert.equal(existsSync(directory), true)
})
// 已存在但非private的父目錄必須在Docker前被拒絕，不能到create才發現。
test('preflight refuses an existing non-private control parent without creating current', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-text-probe-test-')
  roots.push(root)
  const parent = join(root, 'private')
  mkdirSync(parent, { mode: 0o755 })
  assert.throws(
    () => assertTextProbeAvailable(enabled, join(parent, 'current')),
    /^Error: text_probe_control_unavailable$/,
  )
  assert.deepEqual(readdirSync(parent), [])
})
// 未opt-in／CI拒絕在mkdir前，值不得回顯。
test('disabled and CI controls have no filesystem side effects', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-text-probe-test-')
  roots.push(root)
  for (const env of [
    {},
    { ...enabled, CI: 'true' },
    { ...enabled, GITHUB_ACTIONS: '1' },
    { RDWEB_WINDOWS_TEXT_PROBE: 'yes' },
  ]) {
    assert.throws(
      () => createTextProbeControl(env, join(root, 'current')),
      /^Error: text_probe_control_unavailable$/,
    )
  }
  assert.deepEqual(readdirSync(root), [])
})
// boundary不延長且終結再驗一次，晚回覆不能算looks_intact。
test('deadline is exactly 120 seconds and late finish cannot promote a polled classification', () => {
  const { control, directory, setTime } = fixture()
  control.arm(expected)
  setTime(120999)
  assert.equal(control.poll(), null)
  process.env.RDWEB_WINDOWS_TEXT_PROBE = '1'
  completeTextProbe('looks_intact', directory)
  assert.equal(control.poll(), 'looks_intact')
  setTime(121000)
  assert.throws(() => control.poll(), /^Error: text_probe_observation_timeout$/)
  assert.equal(control.finish('text_probe_looks_intact', good), 'text_probe_observation_timeout')
})
// 多次arm／提早完成／舊分類及完成後寫入皆拒絕。
test('requires ready and permits only one completion in the owned scope', () => {
  const { control, directory } = fixture()
  process.env.RDWEB_WINDOWS_TEXT_PROBE = '1'
  assert.throws(
    () => completeTextProbe('uncertain', directory),
    /^Error: text_probe_control_unavailable$/,
  )
  control.arm(expected)
  assert.throws(() => control.arm(expected), /^Error: text_probe_control_unavailable$/)
  completeTextProbe('uncertain', directory)
  assert.throws(
    () => completeTextProbe('looks_intact', directory),
    /^Error: text_probe_control_unavailable$/,
  )
  assert.equal(control.poll(), 'uncertain')
  control.finish('text_probe_uncertain', good)
  assert.throws(
    () => completeTextProbe('uncertain', directory),
    /^Error: text_probe_control_unavailable$/,
  )
})
// 非enum不得寫入；finish不能持任意code／metadata落檔或假造完整驗收。
test('rejects arbitrary classifications, result metadata and mismatched outcomes', () => {
  const { control, directory } = fixture()
  control.arm(expected)
  process.env.RDWEB_WINDOWS_TEXT_PROBE = '1'
  for (const value of ['../looks_intact', 'other', {}, 1])
    assert.throws(
      () => completeTextProbe(value, directory),
      /^Error: text_probe_control_unavailable$/,
    )
  assert.equal(existsSync(join(directory, 'observation.json')), false)
  assert.throws(() => control.finish('arbitrary', good), /^Error: text_probe_control_unavailable$/)
  assert.throws(
    () => control.finish('text_probe_looks_intact', { ...good, password: 'public-test' }),
    /^Error: text_probe_control_unavailable$/,
  )
  assert.throws(
    () => control.finish('text_probe_looks_intact', good),
    /^Error: text_probe_control_unavailable$/,
  )
})
// 干擾即使人工已看似完整也不能回正常分類。
test('scope interference takes precedence over a submitted human classification', () => {
  const { control, directory } = fixture()
  control.arm(expected)
  process.env.RDWEB_WINDOWS_TEXT_PROBE = '1'
  completeTextProbe('looks_intact', directory)
  control.poll()
  assert.equal(
    control.finish('text_probe_looks_intact', { ...good, postTextInput: true }),
    'text_probe_interrupted',
  )
})
// 私有檔案／symlink／超額／schema不合全部拒絕，不讀外部内容。
for (const mutation of ['symlink', 'permission', 'oversize', 'fields', 'stale', 'late']) {
  // 改任一防護都應讓控制檔consumer拒絕能力失效。
  test('rejects unsafe observation: ' + mutation, () => {
    const { control, directory, root } = fixture()
    control.arm(expected)
    const ready = JSON.parse(readFileSync(join(directory, 'ready.json'), 'utf8'))
    const path = join(directory, 'observation.json')
    const data = {
      classification: 'uncertain',
      readyUtc: ready.utc,
      deadlineUtc: ready.deadlineUtc,
    }
    if (mutation === 'fields') data.password = 'public-test'
    if (mutation === 'stale') data.readyUtc = '2000-01-01T00:00:00.000Z'
    if (mutation === 'late') data.deadlineUtc = '2000-01-01T00:00:00.000Z'
    if (mutation === 'symlink') {
      writeFileSync(join(root, 'external'), JSON.stringify(data), { mode: 0o600 })
      symlinkSync(join(root, 'external'), path)
    } else
      writeFileSync(path, mutation === 'oversize' ? 'x'.repeat(32769) : JSON.stringify(data), {
        mode: mutation === 'permission' ? 0o644 : 0o600,
      })
    assert.throws(() => control.poll(), /^Error: text_probe_control_unavailable$/)
  })
}
// private parent或current變成symlink不能讓writer轉寫別處。
test('refuses symlinked parents and replaced ownership', () => {
  const { root, directory, control } = fixture()
  chmodSync(directory, 0o755)
  assert.throws(() => control.arm(expected), /^Error: text_probe_control_unavailable$/)
  const external = join(root, 'external')
  mkdirSync(external, { mode: 0o700 })
  symlinkSync(external, join(root, 'link'))
  assert.throws(
    () => createTextProbeControl(enabled, join(root, 'link', 'current')),
    /^Error: text_probe_control_unavailable$/,
  )
  assert.deepEqual(readdirSync(external), [])
})
// 預期Text同產品scalar／4096byte限制，不normalize、不允許私人任意內容。
test('invalid public expected never creates ready', () => {
  const { control, directory } = fixture()
  for (const value of ['private', 'Public \0', 'Public \ud800', 'Public ' + '中'.repeat(1364)])
    assert.throws(() => control.arm(value), /^Error: text_probe_control_unavailable$/)
  assert.deepEqual(readdirSync(directory), [])
})
// CLI用真子程序只驗固定code與無路徑argv，不使用操作者runtime。
test('CLI rejects invalid argv and disabled mode without echoing values', () => {
  for (const args of [[], ['not-public-classification'], ['uncertain', 'not-public-path']]) {
    const result = spawnSync(process.execPath, ['tools/finish-windows-text-probe.mjs', ...args], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      encoding: 'utf8',
    })
    assert.equal(result.status, 2)
    assert.equal(result.stderr.trim(), 'text_probe_control_unavailable')
    assert.equal(result.stdout, '')
  }
})
// 真CLI成功且第二次拒絕，用自有shadow檔案樹，不接受任意路徑argv。
test('CLI submits one fixed classification in a private ready scope', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-text-probe-test-')
  roots.push(root)
  const directory = copyTextProbeTools(root)
  const control = createTextProbeControl(enabled, directory)
  control.arm(expected)
  const options = {
    cwd: root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, RDWEB_WINDOWS_TEXT_PROBE: '1' },
    encoding: 'utf8',
  }
  const result = spawnSync(
    process.execPath,
    ['tools/finish-windows-text-probe.mjs', 'reordered_or_partial'],
    options,
  )
  assert.equal(result.status, 0)
  assert.equal(result.stdout.trim(), 'text_probe_observation_submitted')
  assert.equal(result.stderr, '')
  assert.equal(control.poll(), 'reordered_or_partial')
  const duplicate = spawnSync(
    process.execPath,
    ['tools/finish-windows-text-probe.mjs', 'looks_intact'],
    options,
  )
  assert.equal(duplicate.status, 2)
  assert.equal(duplicate.stderr.trim(), 'text_probe_control_unavailable')
})
// ready被改為逾時／非固定schema／不private則CLI不能提交。
test('CLI refuses expired or unsafe ready files without writing observation', () => {
  for (const mutation of ['expired', 'extra', 'permission']) {
    const { directory, control } = fixture()
    control.arm(expected)
    const file = join(directory, 'ready.json'),
      ready = JSON.parse(readFileSync(file, 'utf8'))
    if (mutation === 'expired') {
      ready.utc = '2000-01-01T00:00:00.000Z'
      ready.deadlineUtc = '2000-01-01T00:02:00.000Z'
    }
    if (mutation === 'extra') ready.password = 'public-test'
    writeFileSync(file, JSON.stringify(ready))
    if (mutation === 'permission') chmodSync(file, 0o644)
    process.env.RDWEB_WINDOWS_TEXT_PROBE = '1'
    assert.throws(
      () => completeTextProbe('uncertain', directory),
      /^Error: text_probe_control_unavailable$/,
    )
    assert.equal(existsSync(join(directory, 'observation.json')), false)
  }
})
// 普通檔也不得藉hardlink引用scope外部檔，或在dispose後繼續寫。
test('refuses hardlinked observations and closed controls', () => {
  const { directory, root, control } = fixture()
  control.arm(expected)
  const ready = JSON.parse(readFileSync(join(directory, 'ready.json'), 'utf8'))
  writeFileSync(
    join(root, 'external'),
    JSON.stringify({
      classification: 'uncertain',
      readyUtc: ready.utc,
      deadlineUtc: ready.deadlineUtc,
    }),
    { mode: 0o600 },
  )
  linkSync(join(root, 'external'), join(directory, 'observation.json'))
  assert.throws(() => control.poll(), /^Error: text_probe_control_unavailable$/)
  control.dispose()
  assert.throws(
    () => control.finish('text_probe_interrupted', good),
    /^Error: text_probe_control_unavailable$/,
  )
})
// 即使clock往回走，已觀測的deadline邊界不得恢復pending。
test('clock rollback cannot reopen a timed out observation window', () => {
  const { control, setTime } = fixture()
  control.arm(expected)
  setTime(121000)
  assert.throws(() => control.poll(), /^Error: text_probe_observation_timeout$/)
  setTime(1000)
  assert.throws(() => control.poll(), /^Error: text_probe_observation_timeout$/)
})
// 模擬identity邊界而非切換OS帳號；真檔owner不等於caller即拒絕，沒有修改檔案UID。
test('rejects a filesystem scope whose owner differs from caller identity', () => {
  const { control } = fixture()
  const getuid = process.getuid
  try {
    process.getuid = /* 只校準owner比對，非權限提升或chown。 */ () => getuid() + 1
    assert.throws(() => control.arm(expected), /^Error: text_probe_control_unavailable$/)
  } finally {
    process.getuid = getuid
  }
})
// Worker資源未收回不能回正常分類code，避免終端FAIL卻標looks_intact。
test('final terminal code reports failed cleanup instead of a normal classification', () => {
  for (const code of [
    'text_probe_looks_intact',
    'text_probe_reordered_or_partial',
    'text_probe_uncertain',
  ]) {
    assert.equal(textProbeCleanupCode(code, false), 'text_probe_interrupted')
    assert.equal(textProbeCleanupCode(code, true), code)
  }
})
