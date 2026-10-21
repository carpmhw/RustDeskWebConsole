import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createClipboardTextLogger } from '../real/clipboard-text-log.ts'
const roots = []
const enabled = { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' }
// metadata時間線不能帶payload／hash，原文字schema不變。
test('stores only bounded host timeline metadata and refuses raw extras', () => {
  const path = directory(),
    logger = createClipboardTextLogger(enabled, path)
  const timeline = {
    clockDomain: 'browser_main',
    events: [
      {
        ordinal: 1,
        kind: 'batch_ack',
        tUs: 123,
        revision: 1,
        generation: 1,
        batchId: 2,
        requestId: null,
        code: 'sent',
      },
    ],
    overflow: false,
    unavailable: false,
  }
  logger.write({ ...record(), hostTimeline: timeline })
  const value = JSON.parse(readFileSync(join(path, readdirSync(path)[0]), 'utf8'))
  assert.deepEqual(value.hostTimeline, timeline)
  for (const bad of [
    { ...timeline, hash: 'public_denied' },
    { ...timeline, events: [{ ...timeline.events[0], text: 'Public unknown' }] },
    { ...timeline, events: Array(129).fill(timeline.events[0]) },
  ])
    assert.throws(
      /* 白名單失敗不得新增檔案。 */ () => logger.write({ ...record(), hostTimeline: bad }),
      /^Error: clipboard_text_log_unavailable$/,
    )
  assert.equal(readdirSync(path).length, 1)
})
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
// 新wire摘要只能為精確boolean，不能暗帶原文／hash或security資料。
test('stores pre-encryption booleans privately and refuses unsafe fields', () => {
  const path = directory(),
    logger = createClipboardTextLogger(enabled, path)
  const evidence = {
    observed: true,
    textExact: true,
    textSingle: true,
    initialSelectComplete: true,
    receiveSelectComplete: true,
    receiveCopyComplete: true,
    sequenceComplete: true,
    sequenceInvalid: false,
    overflow: false,
    unavailable: false,
  }
  logger.write({ ...record(), preEncryptInput: evidence })
  const file = join(path, readdirSync(path)[0])
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).preEncryptInput, evidence)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  for (const invalid of [
    { ...evidence, bytes: [65] },
    { ...evidence, seq: 'Public raw' },
    { ...evidence, sha256: 'a'.repeat(64) },
    { ...evidence, scope: 1 },
    { ...evidence, observed: 1 },
    { ...evidence, textExact: null },
  ]) {
    assert.throws(
      () => logger.write({ ...record(), preEncryptInput: invalid }),
      /^Error: clipboard_text_log_unavailable$/,
    )
  }
  assert.equal(readdirSync(path).length, 1)
})
// 原logger只在有實際observed／exact佐證時保存公開seq，null仍須明確落檔。
test('stores the verified public pre-encryption text or explicit null privately', () => {
  const path = directory(),
    logger = createClipboardTextLogger(enabled, path)
  const preEncryptInput = {
    observed: true,
    textExact: true,
    textSingle: true,
    initialSelectComplete: true,
    receiveSelectComplete: true,
    receiveCopyComplete: true,
    sequenceComplete: true,
    sequenceInvalid: false,
    overflow: false,
    unavailable: false,
  }
  const expected = 'Public 中文 RdWeb\r\n trailing '
  logger.write({ ...record(), expected, preEncryptInput, preEncryptText: expected })
  logger.write({
    ...record(),
    preEncryptInput: { ...preEncryptInput, textExact: false },
    preEncryptText: null,
  })
  const files = readdirSync(path)
  assert.equal(files.length, 2)
  const rows = files.map(
    /* 只讀本案自建公開fixture log。 */ (file) => {
      assert.equal(statSync(join(path, file)).mode & 0o777, 0o600)
      return JSON.parse(readFileSync(join(path, file), 'utf8'))
    },
  )
  assert.equal(statSync(path).mode & 0o777, 0o700)
  assert.equal(
    rows.find(/* 公開正向expected不可normalize。 */ (row) => row.expected === expected)
      .preEncryptText,
    expected,
  )
  assert.equal(
    rows.find(/* null不可被optional欄位省略。 */ (row) => row.preEncryptText === null)
      .preEncryptText,
    null,
  )
  for (const invalid of [
    { ...record(), preEncryptInput, preEncryptText: 'Public unknown' },
    { ...record(), preEncryptText: record().expected },
    {
      ...record(),
      preEncryptInput: { ...preEncryptInput, observed: false },
      preEncryptText: record().expected,
    },
    {
      ...record(),
      preEncryptInput: { ...preEncryptInput, textSingle: false },
      preEncryptText: record().expected,
    },
    {
      ...record(),
      preEncryptInput: { ...preEncryptInput, overflow: true },
      preEncryptText: record().expected,
    },
    {
      ...record(),
      preEncryptInput: { ...preEncryptInput, unavailable: true },
      preEncryptText: record().expected,
    },
    { ...record(), expected: 'Public \0bad', preEncryptInput, preEncryptText: 'Public \0bad' },
    {
      ...record(),
      expected: 'Public \uD800bad',
      preEncryptInput,
      preEncryptText: 'Public \uD800bad',
    },
    {
      ...record(),
      expected: 'Public ' + '中'.repeat(1400),
      preEncryptInput,
      preEncryptText: 'Public ' + '中'.repeat(1400),
    },
    { ...record(), preEncryptInput, preEncryptText: undefined },
    { ...record(), preEncryptInput, preEncryptText: { text: record().expected } },
  ])
    assert.throws(
      /* 錯schema不得留下文字檔或原生例外。 */ () => logger.write(invalid),
      /^Error: clipboard_text_log_unavailable$/,
    )
  assert.equal(readdirSync(path).length, 2)
})
// 驗證後只能寫相同primitive，不能再次讀getter而落下未知內容。
test('never rereads pre-encryption text after admitting the public string', () => {
  const path = directory(),
    logger = createClipboardTextLogger(enabled, path)
  const preEncryptInput = {
    observed: true,
    textExact: true,
    textSingle: true,
    initialSelectComplete: true,
    receiveSelectComplete: true,
    receiveCopyComplete: true,
    sequenceComplete: true,
    sequenceInvalid: false,
    overflow: false,
    unavailable: false,
  }
  let reads = 0
  const row = {
    ...record(),
    preEncryptInput,
    // 只在本公開fixture提供惡意變值getter，不能保存第二份值。
    get preEncryptText() {
      return ++reads === 1 ? record().expected : 'Public unknown_after_admission'
    },
  }
  logger.write(row)
  const value = JSON.parse(readFileSync(join(path, readdirSync(path)[0]), 'utf8'))
  assert.equal(value.preEncryptText, record().expected)
  assert.equal(reads, 1)
})
// 接收原文需raw exact及同輪transfer可用佐證，null仍要明確落私有檔。
test('stores only verified uncompressed pre-decode public text or null privately', () => {
  const path = directory(),
    logger = createClipboardTextLogger(enabled, path)
  const preDecodeClipboard = {
    observed: true,
    compressed: false,
    uncompressedCompared: true,
    uncompressedExact: true,
    overflow: false,
    unavailable: false,
  }
  const preTransferClipboard = { compared: true, exact: true, overflow: false, unavailable: false }
  logger.write({
    ...record(),
    preDecodeClipboard,
    preTransferClipboard,
    preDecodeText: record().expected,
  })
  logger.write({
    ...record(),
    preDecodeClipboard: { ...preDecodeClipboard, observed: false, unavailable: true },
    preTransferClipboard,
    preDecodeText: null,
  })
  const rows = readdirSync(path).map(
    /* 只讀本案自建public log，不讀使用者檔案。 */ (file) => {
      assert.equal(statSync(join(path, file)).mode & 0o777, 0o600)
      return JSON.parse(readFileSync(join(path, file), 'utf8'))
    },
  )
  assert.equal(rows.length, 2)
  assert.equal(
    rows.filter(/* 原文只出精確公開字串。 */ (row) => row.preDecodeText === record().expected)
      .length,
    1,
  )
  assert.equal(
    rows.filter(
      /* 缺觀察仍明確有null欄位。 */ (row) =>
        Object.hasOwn(row, 'preDecodeText') && row.preDecodeText === null,
    ).length,
    1,
  )
  for (const invalid of [
    { ...record(), preDecodeText: record().expected },
    { ...record(), preDecodeClipboard, preTransferClipboard, preDecodeText: 'Public unknown' },
    {
      ...record(),
      preDecodeClipboard: { ...preDecodeClipboard, compressed: true },
      preTransferClipboard,
      preDecodeText: record().expected,
    },
    {
      ...record(),
      preDecodeClipboard: { ...preDecodeClipboard, uncompressedExact: false },
      preTransferClipboard,
      preDecodeText: record().expected,
    },
    {
      ...record(),
      preDecodeClipboard: { ...preDecodeClipboard, unavailable: true },
      preTransferClipboard,
      preDecodeText: record().expected,
    },
    {
      ...record(),
      preDecodeClipboard,
      preTransferClipboard: { ...preTransferClipboard, unavailable: true },
      preDecodeText: record().expected,
    },
    {
      ...record(),
      preDecodeClipboard,
      preTransferClipboard: { ...preTransferClipboard, exact: false },
      preDecodeText: record().expected,
    },
    {
      ...record(),
      expected: 'Public \0bad',
      preDecodeClipboard,
      preTransferClipboard,
      preDecodeText: 'Public \0bad',
    },
    {
      ...record(),
      expected: 'Public \uD800bad',
      preDecodeClipboard,
      preTransferClipboard,
      preDecodeText: 'Public \uD800bad',
    },
    {
      ...record(),
      expected: 'Public ' + '中'.repeat(1400),
      preDecodeClipboard,
      preTransferClipboard,
      preDecodeText: 'Public ' + '中'.repeat(1400),
    },
    { ...record(), preDecodeClipboard, preTransferClipboard, preDecodeText: undefined },
  ])
    assert.throws(
      /* validation失敗不得寫原文或額外檔案。 */ () => logger.write(invalid),
      /^Error: clipboard_text_log_unavailable$/,
    )
  assert.equal(readdirSync(path).length, 2)
})
// 新接收欄位與送出欄位相同，驗證後不能重新讀變值getter保存未知文字。
test('writes the admitted pre-decode text primitive without rereading its getter', () => {
  const path = directory(),
    logger = createClipboardTextLogger(enabled, path)
  let reads = 0
  const row = {
    ...record(),
    preDecodeClipboard: {
      observed: true,
      compressed: false,
      uncompressedCompared: true,
      uncompressedExact: true,
      overflow: false,
      unavailable: false,
    },
    preTransferClipboard: { compared: true, exact: true, overflow: false, unavailable: false },
    // 僅本fixture使用變值getter，檢查新欄位保存的是驗好primitive。
    get preDecodeText() {
      return ++reads === 1 ? record().expected : 'Public unknown_after_admission'
    },
  }
  logger.write(row)
  assert.equal(
    JSON.parse(readFileSync(join(path, readdirSync(path)[0]), 'utf8')).preDecodeText,
    record().expected,
  )
  assert.equal(reads, 1)
})
// transfer前摘要只准四個own boolean，沿真filesystem私有檔驗schema。
test('stores only the four pre-transfer clipboard booleans privately', () => {
  const path = directory(),
    logger = createClipboardTextLogger(enabled, path)
  const evidence = { compared: true, exact: false, overflow: false, unavailable: false }
  logger.write({ ...record(), preTransferClipboard: evidence })
  const file = join(path, readdirSync(path)[0])
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).preTransferClipboard, evidence)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  for (const invalid of [
    { ...evidence, bytes: [65] },
    { ...evidence, text: 'Public raw' },
    { ...evidence, sha256: 'a'.repeat(64) },
    { ...evidence, scope: 1 },
    { ...evidence, exact: 1 },
    { compared: true, exact: false, overflow: false },
    Object.assign(Object.create(evidence), {
      text: 'Public raw',
      bytes: [65],
      hash: 'public_denied',
      scope: 1,
    }),
  ]) {
    // 錯schema須拒絕，且不額外建立可分享的內容檔。
    assert.throws(
      () => logger.write({ ...record(), preTransferClipboard: invalid }),
      /^Error: clipboard_text_log_unavailable$/,
    )
  }
  assert.equal(readdirSync(path).length, 1)
})
// 真filesystem檢查檔案私有、UTC及文字原樣保存；不以mock writer冒充。
test('stores exactly six own pre-decode booleans without raw fields', () => {
  const path = directory(),
    logger = createClipboardTextLogger(enabled, path)
  const evidence = {
    observed: true,
    compressed: false,
    uncompressedCompared: true,
    uncompressedExact: false,
    overflow: false,
    unavailable: false,
  }
  logger.write({ ...record(), preDecodeClipboard: evidence })
  const file = join(path, readdirSync(path)[0])
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).preDecodeClipboard, evidence)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  for (const invalid of [
    { ...evidence, text: 'Public raw' },
    { ...evidence, bytes: [65] },
    { ...evidence, hash: 'public_denied' },
    { ...evidence, compressed: 1 },
    { observed: true },
    Object.assign(Object.create(evidence), { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }),
  ]) {
    // 六個own欄位白名單，prototype不可暗帶敏感資料。
    assert.throws(
      () => logger.write({ ...record(), preDecodeClipboard: invalid }),
      /^Error: clipboard_text_log_unavailable$/,
    )
  }
  assert.equal(readdirSync(path).length, 1)
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
// 連續兩輪同一remote_input stage也須exclusive新檔且不覆寫既有內容。
test('preserves repeated same-stage records as separate private files', () => {
  const path = directory()
  const logger = createClipboardTextLogger(enabled, path)
  assert.notEqual(logger, null)
  logger.write(record())
  logger.write({ ...record(), expected: 'Public second TCP sample' })
  const files = readdirSync(path)
  assert.equal(files.length, 2)
  const records = files.map((name) => JSON.parse(readFileSync(join(path, name), 'utf8')))
  assert.deepEqual(
    records.map((value) => value.expected).sort(),
    [record().expected, 'Public second TCP sample'].sort(),
  )
  assert.notEqual(files[0], files[1])
  for (const name of files) assert.equal(statSync(join(path, name)).mode & 0o777, 0o600)
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

// 只接受有界固定摘要，私有JSON不得混入輸入原文或任意metadata。
test('stores keyboard emission summaries privately and rejects raw text fields', () => {
  const path = directory()
  const logger = createClipboardTextLogger(enabled, path)
  const emission = {
    sequence: 1,
    eventId: 1,
    phase: 'before',
    type: 'insertText',
    composing: false,
    internalComposing: false,
    confirmed: 'null',
    codePoints: 3,
    utf8Bytes: 8,
    sha256: 'a'.repeat(64),
  }
  const keyboardEmission = {
    records: [emission, { ...emission, sequence: 2, phase: 'after' }],
    overflow: false,
    hashUnavailable: false,
  }
  logger.write({ ...record(), keyboardEmission })
  const file = join(path, readdirSync(path)[0])
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).keyboardEmission, keyboardEmission)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  for (const invalid of [
    { ...keyboardEmission, password: 'public_denied' },
    {
      ...keyboardEmission,
      records: [{ ...emission, data: 'public_denied' }, keyboardEmission.records[1]],
    },
    {
      ...keyboardEmission,
      records: [{ ...emission, sha256: 'invalid' }, keyboardEmission.records[1]],
    },
    {
      ...keyboardEmission,
      records: [{ ...emission, composing: 'false' }, keyboardEmission.records[1]],
    },
    { ...keyboardEmission, records: [{ ...emission, sha256: null }, keyboardEmission.records[1]] },
    { ...keyboardEmission, records: Array(66).fill(emission) },
  ])
    assert.throws(
      () => logger.write({ ...record(), keyboardEmission: invalid }),
      /^Error: clipboard_text_log_unavailable$/,
    )
  assert.equal(readdirSync(path).length, 1)
})
