import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createClipboardTextLogger } from '../frontend/e2e-real/clipboard-text-log.ts'
const roots = []
const enabled = { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' }
// 只建立本測試擁有的臨時目錄，不接觸使用者log。
function directory() {
  const root = mkdtempSync('/tmp/opencode/rdweb-text-log-test-')
  roots.push(root)
  return join(root, 'private')
}
// 公開literal保留換行／空白／UUID，用以檢查不得normalize或截斷。
function record() {
  return {
    transport: 'tcp',
    stage: 'remote_input',
    expected: 'Public 中文 RdWeb 00000000-0000-4000-8000-000000000000',
    nativeWrite: '00000000-0000-4000-8000-000000000000 Public 中文 RdWeb\r\n',
    readback: '00000000-0000-4000-8000-000000000000 Public 中文 RdWeb\r\n',
    source: 'native',
  }
}
// 只刪本測試剛建立的精確臨時目錄。
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
// 未啟用不得建立目錄或保存任何文字。
test('default and explicit off create no diagnostic files', () => {
  const path = directory()
  assert.equal(createClipboardTextLogger({}, path), null)
  assert.equal(createClipboardTextLogger({ RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '0' }, path), null)
  assert.equal(readdirSync(roots[0]).length, 0)
})
// 真filesystem檢查檔案私有、UTC及文字原樣保存；不以mock writer冒充。
test('writes exact public input and reordered readback privately as UTC JSON', () => {
  const path = directory()
  const logger = createClipboardTextLogger(enabled, path)
  assert.notEqual(logger, null)
  logger.write(record())
  const names = readdirSync(path)
  assert.equal(names.length, 1)
  const file = join(path, names[0])
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(statSync(path).mode & 0o777, 0o700)
  const value = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(value).sort(), ['utc', ...Object.keys(record())].sort())
  assert.match(value.utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.equal(value.expected, record().expected)
  assert.equal(value.nativeWrite, record().nativeWrite)
  assert.equal(value.readback, record().readback)
})
// CI與模糊啟用值在任何檔案副作用前固定錯誤。
test('rejects CI and invalid enablement without creating files', () => {
  for (const env of [
    { ...enabled, CI: 'true' },
    { ...enabled, GITHUB_ACTIONS: 'true' },
    { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: 'yes' },
  ]) {
    const path = directory()
    assert.throws(
      () => createClipboardTextLogger(env, path),
      /^Error: clipboard_text_log_unavailable$/,
    )
    assert.equal(readdirSync(roots.at(-1)).length, 0)
  }
})
// UTF-8上限不因中文多bytes而放寬；超額不截斷或保存半份。
test('rejects oversized UTF-8 content before writing', () => {
  const path = directory()
  const logger = createClipboardTextLogger(enabled, path)
  assert.notEqual(logger, null)
  assert.throws(
    () => logger.write({ ...record(), readback: '中'.repeat(10923) }),
    /^Error: clipboard_text_log_unavailable$/,
  )
  assert.equal(readdirSync(path).length, 0)
})
// 不接受非public expected、任意欄位、未知stage或路徑型transport。
test('rejects unexpected fields and invalid public metadata without reflecting values', () => {
  const path = directory()
  const logger = createClipboardTextLogger(enabled, path)
  assert.notEqual(logger, null)
  for (const value of [
    { ...record(), expected: 'not-public' },
    { ...record(), password: 'public-test-denied' },
    { ...record(), transport: '../tcp' },
    { ...record(), stage: 'other' },
    { ...record(), source: 'other' },
  ]) {
    assert.throws(() => logger.write(value), /^Error: clipboard_text_log_unavailable$/)
  }
  assert.equal(readdirSync(path).length, 0)
})
// 已存在檔案絕不覆寫，各階段可獨立檢視。
test('keeps each stage in a distinct private file', () => {
  const path = directory()
  const logger = createClipboardTextLogger(enabled, path)
  assert.notEqual(logger, null)
  logger.write(record())
  logger.write({
    ...record(),
    transport: 'ws',
    stage: 'outbound_roundtrip',
    nativeWrite: null,
    readback: null,
    source: 'unavailable',
  })
  assert.equal(readdirSync(path).length, 2)
})
// 私有目錄不可透過symlink轉寫到其他位置。
test('refuses a symlinked log directory without writing through it', () => {
  const path = directory()
  symlinkSync(roots[0], path)
  assert.throws(
    () => createClipboardTextLogger(enabled, path),
    /^Error: clipboard_text_log_unavailable$/,
  )
  assert.equal(readdirSync(roots[0]).length, 1)
})
