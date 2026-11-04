import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { URL } from 'node:url'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const evidence = [
  'childStart',
  'childExit',
  'childPolicyRestore',
  'parentPolicyVerify',
  'resourcesClose',
]
const prefix = 'receiver_native_diagnostic,'

// 預期值獨立手寫，不由被測格式器或collector產生oracle。
function unknown() {
  return {
    version: 1,
    phase: 'unknown',
    reason: 'unknown',
    childStart: 'unknown',
    childExit: 'unknown',
    childPolicyRestore: 'unknown',
    parentPolicyVerify: 'unknown',
    resourcesClose: 'unknown',
  }
}

// 五項正向都需本輪attempt及settle，不能只呼叫finish補成功。
function confirmAll(diagnostic) {
  for (const name of evidence) {
    diagnostic.attempt(name)
    diagnostic.settle(name, true)
  }
}

// 以獨立literal建立合法終態，供嚴格傳輸契約測試使用。
function complete() {
  return {
    version: 1,
    phase: 'complete',
    reason: 'none',
    childStart: 'confirmed',
    childExit: 'confirmed',
    childPolicyRestore: 'confirmed',
    parentPolicyVerify: 'confirmed',
    resourcesClose: 'confirmed',
  }
}

// 缺能力以斷言RED呈現，不把module載入錯誤當功能失敗。
async function api() {
  assert.equal(existsSync(new URL('./receiver-native-diagnostic.mjs', import.meta.url)), true)
  const value = await import('./receiver-native-diagnostic.mjs')
  assert.equal(typeof value.createNativeProbeDiagnostic, 'function')
  return value
}

// 若清理覆寫首失敗，終態會把root拒絕誤報成資源問題。
test('locks the first observed failure instead of replacing it during cleanup', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  diagnostic.fail('root_absence', 'guard_rejected')
  diagnostic.fail('parent_cleanup', 'cleanup_unconfirmed')
  assert.deepEqual(diagnostic.finish(), {
    version: 1,
    phase: 'root_absence',
    reason: 'guard_rejected',
    childStart: 'unknown',
    childExit: 'unknown',
    childPolicyRestore: 'unknown',
    parentPolicyVerify: 'unknown',
    resourcesClose: 'unknown',
  })
})

// 缺資料與預設值不可讓child取得／退出／政策還原被假報為成功。
test('starts unknown and finishing without observations never implies success', async () => {
  const { createNativeProbeDiagnostic, unknownNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  assert.deepEqual(diagnostic.snapshot(), unknown())
  assert.deepEqual(diagnostic.finish(), unknown())
  assert.deepEqual(unknownNativeProbeDiagnostic(), unknown())
})

// 完整終態必須等五項正向與明確finish，snapshot本身不結案。
test('requires all five confirmations and explicit finish for complete', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  confirmAll(diagnostic)
  assert.equal(diagnostic.snapshot().phase, 'unknown')
  assert.deepEqual(diagnostic.finish(), complete())
})

for (const missing of evidence) {
  // 刪去任一原生證據仍須拒絕完整終態，而非多數決成功。
  test(`does not complete when ${missing} remains unknown`, async () => {
    const { createNativeProbeDiagnostic } = await api()
    const diagnostic = createNativeProbeDiagnostic()
    for (const name of evidence) {
      if (name === missing) continue
      diagnostic.attempt(name)
      diagnostic.settle(name, true)
    }
    assert.equal(diagnostic.finish().phase, 'unknown')
    assert.equal(diagnostic.snapshot()[missing], 'unknown')
  })
}

// true不是取得證據，不能在未attempt時直接確認。
test('does not confirm a resource that was never attempted', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  for (const name of evidence) diagnostic.settle(name, true)
  assert.deepEqual(diagnostic.finish(), unknown())
})

// 開始取得便是unconfirmed，不能標成確定未取得。
test('does not rewrite an attempted resource as not acquired', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  diagnostic.attempt('childStart')
  diagnostic.notAcquired('childStart')
  assert.equal(diagnostic.snapshot().childStart, 'unconfirmed')
  diagnostic.settle('childStart', true)
  assert.equal(diagnostic.snapshot().childStart, 'confirmed')
})

// not_acquired只由owner明確宣告，不等於整輪成功。
test('accepts explicit non-acquisition but never counts it as complete', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  for (const name of evidence) diagnostic.notAcquired(name)
  const value = diagnostic.finish()
  assert.equal(value.phase, 'unknown')
  for (const name of evidence) assert.equal(value[name], 'not_acquired')
})

// owner自相矛盾時要保留不足，不能從未取得恢復成確認。
test('latches contradictory acquisition after a not-acquired declaration', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  diagnostic.notAcquired('childStart')
  confirmAll(diagnostic)
  assert.equal(diagnostic.finish().childStart, 'unconfirmed')
  assert.equal(diagnostic.snapshot().phase, 'unknown')
})

// 已結案的取得被重用亦不補成功，避免第二次Start借用第一次證據。
test('does not reuse confirmation after a second acquisition attempt', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  confirmAll(diagnostic)
  diagnostic.attempt('childStart')
  diagnostic.settle('childStart', true)
  assert.equal(diagnostic.finish().childStart, 'unconfirmed')
})

for (const value of [false, undefined, 'true', 1]) {
  // 非嚴格true或明確收尾負向必須sticky，晚到true不得改判。
  test(`keeps an unconfirmed observation sticky for ${String(value)}`, async () => {
    const { createNativeProbeDiagnostic } = await api()
    const diagnostic = createNativeProbeDiagnostic()
    diagnostic.attempt('resourcesClose')
    diagnostic.settle('resourcesClose', value)
    diagnostic.settle('resourcesClose', true)
    assert.equal(diagnostic.finish().resourcesClose, 'unconfirmed')
  })
}

// fail即使晚於全部確認也不能被finish覆寫；每個collector獨立。
test('preserves failure with positive cleanup evidence and isolates sessions', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const first = createNativeProbeDiagnostic()
  confirmAll(first)
  first.fail('child_cleanup', 'cleanup_unconfirmed')
  assert.equal(first.finish().reason, 'cleanup_unconfirmed')
  assert.equal(createNativeProbeDiagnostic().finish().reason, 'unknown')
})

// 快照與封存都不可被晚到callback或呼叫者改寫。
test('freezes copies and ignores all events after finish', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  const before = diagnostic.snapshot()
  confirmAll(diagnostic)
  const ended = diagnostic.finish()
  diagnostic.fail('parent_cleanup', 'deadline')
  diagnostic.attempt('childStart')
  diagnostic.settle('resourcesClose', false)
  diagnostic.notAcquired('childExit')
  assert.deepEqual(before, unknown())
  assert.deepEqual(ended, complete())
  assert.strictEqual(diagnostic.finish(), ended)
  assert.deepEqual(diagnostic.snapshot(), complete())
  assert.equal(Object.isFrozen(before), true)
  assert.equal(Object.isFrozen(ended), true)
  assert.throws(() => {
    ended.reason = 'deadline'
  }, TypeError)
})

// 不轉字串或讀例外欄位，未知phase／reason只留下安全unknown首失敗。
test('sanitizes unknown failure values without coercion or getters', async () => {
  const { createNativeProbeDiagnostic } = await api()
  let touched = 0
  const untrusted = {
    // 任何診斷讀取或強制轉型都代表越過允許邊界。
    get message() {
      touched++
      throw new Error('PUBLIC_UNTRUSTED')
    },
    // 固定分類不得由未知物件的字串化取得。
    toString() {
      touched++
      throw new Error('PUBLIC_UNTRUSTED')
    },
  }
  const diagnostic = createNativeProbeDiagnostic()
  diagnostic.fail(untrusted, untrusted)
  confirmAll(diagnostic)
  diagnostic.fail('child_start', 'io_failed')
  assert.equal(diagnostic.finish().phase, 'unknown')
  assert.equal(diagnostic.snapshot().reason, 'unknown')
  assert.equal(touched, 0)
})

// 不能以公開complete／none作失敗分支的成功捷徑。
test('rejects complete and none as failure literals', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  diagnostic.fail('complete', 'none')
  confirmAll(diagnostic)
  assert.equal(diagnostic.finish().phase, 'unknown')
  assert.equal(diagnostic.snapshot().reason, 'unknown')
})

// 未知資源不擴大schema，也不呼叫未知toString。
test('ignores unknown evidence names without adding fields', async () => {
  const { createNativeProbeDiagnostic } = await api()
  const diagnostic = createNativeProbeDiagnostic()
  const unknownName = Object.create(null)
  for (const name of ['PUBLIC_PRIVATE_PATH', unknownName, Symbol('public')]) {
    diagnostic.attempt(name)
    diagnostic.settle(name, true)
    diagnostic.notAcquired(name)
  }
  assert.deepEqual(diagnostic.finish(), unknown())
})

// 精確canonical wire由literal定義，避免formatter與parser互相掩蓋錯誤。
test('formats and parses exactly one canonical bounded terminal line', async () => {
  const { formatNativeProbeDiagnostic, parseNativeProbeDiagnostic } = await api()
  const line =
    'receiver_native_diagnostic,{"version":1,"phase":"complete","reason":"none","childStart":"confirmed","childExit":"confirmed","childPolicyRestore":"confirmed","parentPolicyVerify":"confirmed","resourcesClose":"confirmed"}\n'
  assert.equal(formatNativeProbeDiagnostic(complete()), line)
  assert.deepEqual(parseNativeProbeDiagnostic(line), complete())
  assert.deepEqual(parseNativeProbeDiagnostic(line.replace(/\n$/, '\r\n')), complete())
  assert.equal(Object.isFrozen(parseNativeProbeDiagnostic(line)), true)
  assert.equal(Buffer.byteLength(line) <= 1024, true)
})

// 欄位順序不影響物件輸入，但輸出一律使用固定順序且不引用原物件。
test('canonicalizes valid plain data and null-prototype objects', async () => {
  const { formatNativeProbeDiagnostic, parseNativeProbeDiagnostic } = await api()
  const data = Object.assign(Object.create(null), complete())
  const formatted = formatNativeProbeDiagnostic(data)
  const parsed = parseNativeProbeDiagnostic(formatted)
  data.phase = 'PUBLIC_CHANGED'
  assert.deepEqual(parsed, complete())
  assert.deepEqual(parseNativeProbeDiagnostic(formatNativeProbeDiagnostic(unknown())), unknown())
})

// 診斷主用途是失敗證據，不能只有完整成功與unknown能通過wire。
test('preserves a failed preflight and independent cleanup evidence on the wire', async () => {
  const { formatNativeProbeDiagnostic, parseNativeProbeDiagnostic } = await api()
  const value = {
    version: 1,
    phase: 'supervisor_pin',
    reason: 'source_mismatch',
    childStart: 'not_acquired',
    childExit: 'not_acquired',
    childPolicyRestore: 'not_acquired',
    parentPolicyVerify: 'confirmed',
    resourcesClose: 'unconfirmed',
  }
  const line =
    'receiver_native_diagnostic,{"version":1,"phase":"supervisor_pin","reason":"source_mismatch","childStart":"not_acquired","childExit":"not_acquired","childPolicyRestore":"not_acquired","parentPolicyVerify":"confirmed","resourcesClose":"unconfirmed"}\n'
  assert.equal(formatNativeProbeDiagnostic(value), line)
  assert.deepEqual(parseNativeProbeDiagnostic(line), value)
})

const malformed = [
  ['null', null],
  ['array', []],
  ['primitive', 'PUBLIC_PRIVATE_VALUE'],
  ['extra', { ...complete(), path: 'PUBLIC_PRIVATE_PATH' }],
  ['missing', { ...complete(), resourcesClose: undefined }],
  ['missing properties', { version: 1 }],
  ['non-enumerable property', Object.defineProperty(complete(), 'phase', { enumerable: false })],
  ['wrong version', { ...complete(), version: 2 }],
  ['unknown phase', { ...complete(), phase: 'PUBLIC_PRIVATE_PATH' }],
  ['unknown reason', { ...complete(), reason: 'PUBLIC_EXCEPTION' }],
  ['unknown evidence', { ...complete(), childExit: 'PUBLIC_PRIVATE_VALUE' }],
  ['non-string evidence', { ...complete(), childExit: true }],
  ['none without complete', { ...complete(), phase: 'copy' }],
  ['complete with failure', { ...complete(), reason: 'deadline' }],
  ['complete with missing confirmation', { ...complete(), childPolicyRestore: 'unknown' }],
  ['complete with not acquired', { ...complete(), childStart: 'not_acquired' }],
  ['symbol key', { ...complete(), [Symbol('public')]: true }],
  ['custom prototype', Object.assign(Object.create({ public: true }), complete())],
]
for (const [label, value] of malformed) {
  // 刪去此驗證會讓未知欄位／矛盾證據或可執行物件進入輸出。
  test(`rejects unsafe object input: ${label}`, async () => {
    const { formatNativeProbeDiagnostic } = await api()
    assert.throws(() => formatNativeProbeDiagnostic(value), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  })
}

// 嚴格驗descriptor，序列化不得觸發getter或toJSON。
test('rejects getters and toJSON without executing either', async () => {
  const { formatNativeProbeDiagnostic } = await api()
  let reads = 0
  const getter = { ...complete() }
  Object.defineProperty(getter, 'phase', {
    enumerable: true,
    // 這個公開getter只用來驗證被測碼沒有讀取它。
    get() {
      reads++
      return 'complete'
    },
  })
  const custom = {
    ...complete(),
    // 如果JSON.stringify直接作用原物件，這個副作用就會被觸發。
    toJSON() {
      reads++
      return complete()
    },
  }
  for (const value of [getter, custom]) {
    assert.throws(() => formatNativeProbeDiagnostic(value), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(reads, 0)
})

// Proxy反射故障只能變成固定錯誤，不能把外部exception或cause交給呼叫者。
test('scrubs a reflection failure instead of exposing the original exception', async () => {
  const { formatNativeProbeDiagnostic } = await api()
  const value = new Proxy(
    {},
    {
      // 模擬原生邊界外的公開反射故障，不保存任何現場資料。
      getPrototypeOf() {
        throw new Error('PUBLIC_REFLECTION_FAILURE')
      },
    },
  )
  let error
  try {
    formatNativeProbeDiagnostic(value)
  } catch (caught) {
    error = caught
  }
  assert.equal(error instanceof Error, true)
  assert.equal(error.message, 'receiver_native_diagnostic_unavailable')
  assert.equal(Object.hasOwn(error, 'cause'), false)
})

const invalidWire = [
  ['empty', ''],
  ['truncated', prefix + '{"version":1}'],
  ['invalid JSON', prefix + '{\n'],
  ['unknown content', 'PUBLIC_UNKNOWN_STDOUT\n'],
  ['excess bytes', prefix + '公'.repeat(600) + '\n'],
  ['extra blank line', prefix + JSON.stringify(complete()) + '\n\n'],
  ['duplicate marker', (prefix + JSON.stringify(complete()) + '\n').repeat(2)],
  ['other stdout', 'PUBLIC_UNKNOWN\n' + prefix + JSON.stringify(complete()) + '\n'],
  [
    'duplicate JSON key',
    prefix + JSON.stringify(complete()).replace('"version":1', '"version":1,"version":1') + '\n',
  ],
  [
    'extra JSON key',
    prefix + JSON.stringify({ ...complete(), path: 'PUBLIC_PRIVATE_PATH' }) + '\n',
  ],
  ['whitespace variant', prefix + ' ' + JSON.stringify(complete()) + '\n'],
]
for (const [label, wire] of invalidWire) {
  // parser遇缺失／重複／不可信資料一律固定unknown，不回顯來源。
  test(`returns only unknown for unsafe wire: ${label}`, async () => {
    const { parseNativeProbeDiagnostic } = await api()
    assert.deepEqual(parseNativeProbeDiagnostic(wire), unknown())
  })
}

// parser也不能對未知物件轉字串，避免錯誤資料變成新的輸出管道。
test('does not coerce non-string stdout', async () => {
  const { parseNativeProbeDiagnostic } = await api()
  let reads = 0
  const value = {
    // 不允許從外部物件取得stdout或錯誤訊息。
    toString() {
      reads++
      throw new Error('PUBLIC_UNTRUSTED')
    },
  }
  assert.deepEqual(parseNativeProbeDiagnostic(value), unknown())
  assert.equal(reads, 0)
})

// 新生成器的缺能力用斷言呈現，不把import錯誤誤算為功能RED。
async function artifactApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellAdapterArtifact, 'function')
  assert.equal(typeof value.createNativeProbePowerShellSelfTestArtifact, 'function')
  return value
}

// 這只驗真正生成artifact的介面與容量，不執行或假解析PS。
test('generates distinct non-native adapter and RAM-fixture artifacts', async () => {
  const value = await artifactApi()
  const adapter = value.createNativeProbePowerShellAdapterArtifact()
  const fixture = value.createNativeProbePowerShellSelfTestArtifact()
  assert.equal(adapter.purpose, 'receiver_native_diagnostic_adapter_v1')
  assert.equal(fixture.purpose, 'receiver_native_diagnostic_fixture_v1')
  for (const artifact of [adapter, fixture]) {
    assert.equal(typeof artifact.source, 'string')
    assert.equal(artifact.source.length > 0, true)
    assert.equal(artifact.nativeVerified, false)
    assert.equal(artifact.utf16Units, artifact.source.length)
    assert.equal(artifact.utf8Bytes, Buffer.byteLength(artifact.source, 'utf8'))
    assert.equal(artifact.source.includes('\r'), false)
    assert.equal(artifact.source.includes('\0'), false)
    const encoded = Buffer.from(artifact.source, 'utf16le').toString('base64')
    const args =
      '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' + encoded
    assert.equal(artifact.argumentUtf16Units, args.length)
    assert.equal(args.length + 512 + 3 <= 32766, true)
  }
})

// hash必須對真正交接的UTF-8原碼重算，不能是過期pin或UTF-16的hash。
test('pins deterministic source bytes rather than a different representation', async () => {
  const value = await artifactApi()
  for (const build of [
    value.createNativeProbePowerShellAdapterArtifact,
    value.createNativeProbePowerShellSelfTestArtifact,
  ]) {
    const first = build()
    const second = build()
    assert.equal(typeof first.sha256, 'string')
    assert.equal(first.sha256, createHash('sha256').update(first.source, 'utf8').digest('hex'))
    assert.deepEqual(second, first)
  }
})

// 自測必須嵌入同一adapter，而不是以另一份未綁定的分類器冒充測試。
test('binds the actual embedded adapter region to its independent source pin', async () => {
  const value = await artifactApi()
  const adapter = value.createNativeProbePowerShellAdapterArtifact()
  const fixture = value.createNativeProbePowerShellSelfTestArtifact()
  assert.equal(Number.isInteger(fixture.adapterOffset), true)
  assert.equal(Number.isInteger(fixture.adapterUnits), true)
  assert.equal(fixture.adapterOffset >= 0, true)
  assert.equal(fixture.adapterUnits, adapter.source.length)
  const embedded = fixture.source.slice(
    fixture.adapterOffset,
    fixture.adapterOffset + fixture.adapterUnits,
  )
  assert.equal(embedded, adapter.source)
  assert.equal(fixture.adapterSha256, createHash('sha256').update(embedded, 'utf8').digest('hex'))
  assert.equal(fixture.adapterSha256, adapter.sha256)
})

// 候選manifest與公開fixture都不可被呼叫者改成已原生驗證或換掉oracle。
test('freezes generated artifact metadata and public wire fixtures', async () => {
  const value = await artifactApi()
  const adapter = value.createNativeProbePowerShellAdapterArtifact()
  const fixture = value.createNativeProbePowerShellSelfTestArtifact()
  assert.equal(Object.isFrozen(adapter), true)
  assert.equal(Object.isFrozen(fixture), true)
  assert.equal(Array.isArray(fixture.expectedWires), true)
  assert.equal(Object.isFrozen(fixture.expectedWires), true)
  // 這只保護artifact描述，不宣稱未執行的PS原碼已通過行為測試。
  assert.throws(() => {
    fixture.nativeVerified = true
  }, TypeError)
  assert.throws(() => {
    fixture.expectedWires[0] = 'PUBLIC_CHANGED'
  }, TypeError)
})

// 用既有真正parser驗跨語言oracle資料，但不假裝這些是PS的實際輸出。
test('provides compatible expected wires for unknown, complete and first failure', async () => {
  const value = await artifactApi()
  const fixture = value.createNativeProbePowerShellSelfTestArtifact()
  const expected = [
    unknown(),
    complete(),
    { ...unknown(), phase: 'root_absence', reason: 'guard_rejected', resourcesClose: 'confirmed' },
  ]
  assert.equal(Array.isArray(fixture.expectedWires), true)
  assert.equal(fixture.expectedWires.length, 3)
  for (let i = 0; i < expected.length; i++) {
    const wire = fixture.expectedWires[i]
    assert.deepEqual(value.parseNativeProbeDiagnostic(wire), expected[i])
    assert.equal(wire, value.formatNativeProbeDiagnostic(expected[i]))
    assert.equal(Buffer.byteLength(wire, 'utf8') <= 1024, true)
  }
})

// fixture結果用途必須獨立，不能被診斷parser接受為真child／政策證據。
test('keeps fixture stdout separate from actual native diagnostic evidence', async () => {
  const value = await artifactApi()
  const adapter = value.createNativeProbePowerShellAdapterArtifact()
  const fixture = value.createNativeProbePowerShellSelfTestArtifact()
  assert.equal(adapter.expectedStdout, '')
  assert.equal(fixture.expectedStdout, 'receiver_native_diagnostic_fixture_observed\n')
  assert.equal(fixture.failureStdout, 'receiver_native_diagnostic_fixture_unavailable\n')
  assert.deepEqual(value.parseNativeProbeDiagnostic(fixture.expectedStdout), unknown())
})

for (const name of [
  'createNativeProbePowerShellAdapterArtifact',
  'createNativeProbePowerShellSelfTestArtifact',
]) {
  // 無參數生成器不得接收外部程式片段／路徑或讀取未知物件來插入原碼。
  test(`rejects supplied content without coercion in ${name}`, async () => {
    const value = await artifactApi()
    let touched = 0
    const input = {
      // 任意外部內容不能變成原碼或診斷輸出。
      toString() {
        touched++
        return 'PUBLIC_UNTRUSTED'
      },
    }
    for (const supplied of [undefined, 'PUBLIC_PATH', input]) {
      assert.throws(() => value[name](supplied), {
        message: 'receiver_native_diagnostic_unavailable',
      })
    }
    assert.equal(touched, 0)
  })
}

// 新增能力先以斷言確認，避免用import例外冒稱生成器的行為RED。
async function diagnosticFixtureApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellDiagnosticSelfTestArtifact, 'function')
  return value
}

// 只驗可交接的非空RAM候選，尚未解析或執行PowerShell。
test('v2 generates a distinct nonempty RAM-only diagnostic fixture', async () => {
  const value = await diagnosticFixtureApi()
  const artifact = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  assert.equal(artifact.purpose, 'receiver_native_diagnostic_fixture_v2')
  assert.equal(typeof artifact.source, 'string')
  assert.equal(artifact.source.length > 0, true)
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  assert.equal(artifact.encodedCommandSupported, false)
})

// 真正輸出的原碼必須可獨立重算pin與容量，不能讓舊manifest替另一份程式背書。
test('v2 pins deterministic source bytes and reports actual command-line capacity', async () => {
  const value = await diagnosticFixtureApi()
  const artifact = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  assert.equal(artifact.utf8Bytes, Buffer.byteLength(artifact.source, 'utf8'))
  assert.equal(artifact.utf16Units, artifact.source.length)
  assert.equal(artifact.sha256, createHash('sha256').update(artifact.source, 'utf8').digest('hex'))
  assert.equal(artifact.source.endsWith('\n'), true)
  assert.equal(artifact.source.includes('\r'), false)
  assert.equal(artifact.source.includes('\0'), false)
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(artifact.source, 'utf16le').toString('base64')
  assert.equal(artifact.argumentUtf16Units, args.length)
  assert.equal(artifact.encodedCommandFits, args.length + 512 + 3 <= 32766)
  assert.deepEqual(value.createNativeProbePowerShellDiagnosticSelfTestArtifact(), artifact)
})

// 新用途不能暗中修掉v1候選；這是保留失敗基準的供應鏈回歸，不是PS行為測試。
test('v2 preserves both pinned v1 artifacts after generation', async () => {
  const value = await diagnosticFixtureApi()
  const artifact = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  const adapter = value.createNativeProbePowerShellAdapterArtifact()
  const baseline = value.createNativeProbePowerShellSelfTestArtifact()
  assert.equal(
    artifact.baselineSha256,
    'ab88c6293129b9e74aae555c67c1b89f2509df47f2ee4da0949e38085fd96fac',
  )
  assert.equal(baseline.sha256, artifact.baselineSha256)
  assert.equal(baseline.utf8Bytes, 12204)
  assert.equal(baseline.utf16Units, 11564)
  assert.equal(adapter.sha256, '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f')
  assert.equal(adapter.utf8Bytes, 6650)
  assert.equal(adapter.utf16Units, 6184)
})

// 實際交接的區段必須是同一adapter，不接受只有hash宣告相同的另一份分類器。
test('v2 binds its actual adapter region to the unchanged v1 adapter', async () => {
  const value = await diagnosticFixtureApi()
  const artifact = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  const adapter = value.createNativeProbePowerShellAdapterArtifact()
  assert.equal(Number.isInteger(artifact.adapterOffset), true)
  assert.equal(artifact.adapterOffset >= 0, true)
  assert.equal(artifact.adapterUnits, adapter.source.length)
  const embedded = artifact.source.slice(
    artifact.adapterOffset,
    artifact.adapterOffset + artifact.adapterUnits,
  )
  assert.equal(embedded, adapter.source)
  assert.equal(artifact.adapterSha256, createHash('sha256').update(embedded, 'utf8').digest('hex'))
  assert.equal(artifact.adapterSha256, adapter.sha256)
})

// 用實際來源範圍驗沒有遺漏或修改原案例；offset只描述來源，不冒充PS已走到該步。
test('v2 retains every byte of the v1 public case body in ordered diagnostic regions', async () => {
  const value = await diagnosticFixtureApi()
  const artifact = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  const baseline = value.createNativeProbePowerShellSelfTestArtifact()
  const labels = [
    'oracle_setup',
    'state_create',
    'snapshot_initial',
    'wire_unknown',
    'snapshot_readonly',
    'confirm_all',
    'finish_complete',
    'wire_complete',
    'snapshot_retained',
    'late_events',
    'finish_identity',
    'sealed_wire',
    'first_failure_wire',
    'unattempted',
    'sticky_negative',
    'not_acquired',
    'contradictory_acquisition',
    'repeated_attempt',
    'unknown_failure',
    'reject_extra',
    'reject_version',
    'reject_incomplete',
    'reject_missing',
    'reject_type',
  ]
  assert.equal(Array.isArray(artifact.caseMap), true)
  assert.deepEqual(
    artifact.caseMap.map((item) => item.label),
    labels,
  )
  const start = baseline.source.indexOf('  $expected = @(')
  const end = baseline.source.indexOf(
    "  [Console]::Write('receiver_native_diagnostic_fixture_observed'",
  )
  assert.equal(start > 0 && end > start, true)
  let baselineOffset = start
  let sourceEnd = artifact.adapterOffset + artifact.adapterUnits
  let reconstructed = ''
  for (const [index, item] of artifact.caseMap.entries()) {
    assert.equal(item.id, 'c' + String(index + 1).padStart(2, '0'))
    assert.equal(Number.isInteger(item.offset) && Number.isInteger(item.units), true)
    assert.equal(item.offset > sourceEnd && item.units > 0, true)
    assert.equal(item.baselineOffset, baselineOffset)
    const actual = artifact.source.slice(item.offset, item.offset + item.units)
    assert.equal(actual, baseline.source.slice(baselineOffset, baselineOffset + item.units))
    reconstructed += actual
    baselineOffset += item.units
    sourceEnd = item.offset + item.units
  }
  assert.equal(baselineOffset, end)
  assert.equal(reconstructed, baseline.source.slice(start, end))
})

// 描述中的oracle與輸出用途皆須隔離，不能把fixture標記匯入成真child證據。
test('v2 keeps public oracle wires and fixture output separate from native evidence', async () => {
  const value = await diagnosticFixtureApi()
  const artifact = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  assert.equal(Array.isArray(artifact.expectedWires), true)
  assert.equal(artifact.expectedWires.length, 3)
  for (const [index, expected] of [
    unknown(),
    complete(),
    { ...unknown(), phase: 'root_absence', reason: 'guard_rejected', resourcesClose: 'confirmed' },
  ].entries()) {
    assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedWires[index]), expected)
    assert.equal(artifact.expectedWires[index], value.formatNativeProbeDiagnostic(expected))
  }
  assert.equal(
    artifact.expectedStdout,
    'receiver_native_diagnostic_fixture_v2,result=observed,case=complete,kind=none\n',
  )
  assert.equal(
    artifact.failureStdout,
    'receiver_native_diagnostic_fixture_v2,result=unavailable,case=unknown,kind=unknown\n',
  )
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedStdout), unknown())
})

// 白名單是待執行候選的預期線契約，不把這份描述當成PS真實stdout。
test('v2 enumerates only bounded ASCII terminal lines with valid result-case-kind pairs', async () => {
  const value = await diagnosticFixtureApi()
  const artifact = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  assert.equal(artifact.maxStdoutUtf8Bytes, 256)
  assert.equal(Array.isArray(artifact.allowedStdout), true)
  assert.equal(artifact.allowedStdout.length, 50)
  assert.equal(new Set(artifact.allowedStdout).size, 50)
  assert.equal(artifact.allowedStdout.includes(artifact.expectedStdout), true)
  assert.equal(artifact.allowedStdout.includes(artifact.failureStdout), true)
  for (const line of artifact.allowedStdout) {
    assert.equal(Buffer.byteLength(line, 'utf8') <= 256, true)
    assert.equal(/^[\x20-\x7e]+\n$/.test(line), true)
    const match =
      /^receiver_native_diagnostic_fixture_v2,result=(observed|unavailable),case=(complete|unknown|c\d{2}),kind=(none|assertion|runtime|unknown)\n$/.exec(
        line,
      )
    assert.notEqual(match, null)
    const [, result, caseId, kind] = match
    if (result === 'observed') {
      assert.equal(caseId, 'complete')
      assert.equal(kind, 'none')
    } else if (caseId === 'unknown') {
      assert.equal(kind, 'unknown')
    } else {
      assert.equal(
        artifact.caseMap.some((item) => item.id === caseId),
        true,
      )
      assert.equal(kind === 'assertion' || kind === 'runtime', true)
    }
  }
})

// 巢狀case表與白名單也要凍結，否則操作者可能用被改寫的manifest核對來源。
test('v2 freezes artifact metadata, case regions, oracle and stdout allowlist', async () => {
  const value = await diagnosticFixtureApi()
  const artifact = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  assert.equal(Object.isFrozen(artifact), true)
  for (const collection of [artifact.caseMap, artifact.expectedWires, artifact.allowedStdout]) {
    assert.equal(Array.isArray(collection) && Object.isFrozen(collection), true)
  }
  for (const item of artifact.caseMap) assert.equal(Object.isFrozen(item), true)
  assert.throws(() => {
    artifact.nativeVerified = true
  }, TypeError)
  assert.throws(() => {
    artifact.caseMap[0].id = 'complete'
  }, TypeError)
  assert.throws(() => {
    artifact.allowedStdout.push('PUBLIC_UNTRUSTED')
  }, TypeError)
})

// 外部參數不能成為程式片段、診斷欄位或coercion副作用。
test('v2 rejects supplied content without reading or coercing it', async () => {
  const value = await diagnosticFixtureApi()
  let touched = 0
  const input = {
    // 生成器不能從未知物件取得原碼或欄位。
    toString() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
  }
  for (const supplied of [undefined, 'PUBLIC_PATH', input]) {
    assert.throws(() => value.createNativeProbePowerShellDiagnosticSelfTestArtifact(supplied), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
})

// 先以能力斷言呈現RED，不以import或PS執行錯誤冒充生成器測試。
async function c04Api() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellC04ProbeArtifact, 'function')
  return value
}

// 新用途只供公開c04的RAM候選交接，不表示PS5.1已解析或通過。
test('c04 generates a nonempty standalone RAM-only probe', async () => {
  const value = await c04Api()
  const artifact = value.createNativeProbePowerShellC04ProbeArtifact()
  assert.equal(artifact.purpose, 'receiver_native_c04_probe_v1')
  assert.equal(typeof artifact.source, 'string')
  assert.equal(artifact.source.length > 0, true)
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  assert.equal(artifact.encodedCommandSupported, false)
})

// 交接來源及容量必須可獨立重算，不把EncodedCommand容量視為執行許可。
test('c04 pins deterministic source and truthfully reports encoded capacity', async () => {
  const value = await c04Api()
  const artifact = value.createNativeProbePowerShellC04ProbeArtifact()
  assert.equal(artifact.utf8Bytes, Buffer.byteLength(artifact.source, 'utf8'))
  assert.equal(artifact.utf16Units, artifact.source.length)
  assert.equal(artifact.sha256, createHash('sha256').update(artifact.source, 'utf8').digest('hex'))
  assert.equal(artifact.source.endsWith('\n'), true)
  assert.equal(artifact.source.includes('\r'), false)
  assert.equal(artifact.source.includes('\0'), false)
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(artifact.source, 'utf16le').toString('base64')
  assert.equal(artifact.argumentUtf16Units, args.length)
  assert.equal(artifact.encodedCommandFits, args.length + 512 + 3 <= 32766)
  assert.deepEqual(value.createNativeProbePowerShellC04ProbeArtifact(), artifact)
})

// 新探針不能修改原本失敗基準或v2來源；三個artifact都重新核對實際來源pin。
test('c04 leaves all three previous artifact pins unchanged', async () => {
  const value = await c04Api()
  const artifact = value.createNativeProbePowerShellC04ProbeArtifact()
  const builds = [
    [
      value.createNativeProbePowerShellAdapterArtifact,
      6650,
      6184,
      '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f',
    ],
    [
      value.createNativeProbePowerShellSelfTestArtifact,
      12204,
      11564,
      'ab88c6293129b9e74aae555c67c1b89f2509df47f2ee4da0949e38085fd96fac',
    ],
    [
      value.createNativeProbePowerShellDiagnosticSelfTestArtifact,
      14091,
      13355,
      'f038a7310d6883c8677333eb27a3b4830dc2bd3580eac39ceb1045c3f443a85a',
    ],
  ]
  assert.equal(artifact.adapterSha256, builds[0][3])
  for (const [build, bytes, units, pin] of builds) {
    const previous = build()
    assert.equal(Buffer.byteLength(previous.source, 'utf8'), bytes)
    assert.equal(previous.source.length, units)
    assert.equal(createHash('sha256').update(previous.source, 'utf8').digest('hex'), pin)
  }
})

// 真正交接區段必須完整嵌入原adapter，不能只宣告另一份程式有同樣的hash。
test('c04 embeds the actual unchanged adapter source', async () => {
  const value = await c04Api()
  const artifact = value.createNativeProbePowerShellC04ProbeArtifact()
  const adapter = value.createNativeProbePowerShellAdapterArtifact()
  assert.equal(Number.isInteger(artifact.adapterOffset), true)
  assert.equal(artifact.adapterOffset >= 0, true)
  assert.equal(artifact.adapterUnits, adapter.source.length)
  const embedded = artifact.source.slice(
    artifact.adapterOffset,
    artifact.adapterOffset + artifact.adapterUnits,
  )
  assert.equal(embedded, adapter.source)
  assert.equal(createHash('sha256').update(embedded, 'utf8').digest('hex'), artifact.adapterSha256)
})

// 這驗來源對照未抄錯guard，不解析PS或把來源區段當成已執行證據。
test('c04 binds ordered boundary steps to every original formatter guard span', async () => {
  const value = await c04Api()
  const artifact = value.createNativeProbePowerShellC04ProbeArtifact()
  const adapter = value.createNativeProbePowerShellAdapterArtifact()
  const steps = [
    'oracle_setup',
    'state_create',
    'snapshot',
    'probe_call',
    'input_shape',
    'type_lookup',
    'type_guard',
    'schema_lookup',
    'field_count',
    'field_keys',
    'scalar_guards',
    'evidence_guards',
    'state_pair',
    'format_call',
    'wire_compare',
  ]
  assert.equal(Array.isArray(artifact.stepMap), true)
  assert.deepEqual(
    artifact.stepMap.map((item) => item.step),
    steps,
  )
  const originals = artifact.stepMap.filter((item) => item.adapterOffset !== null)
  assert.deepEqual(
    originals.map((item) => item.step),
    [
      'type_lookup',
      'type_guard',
      'schema_lookup',
      'field_count',
      'field_keys',
      'scalar_guards',
      'evidence_guards',
      'state_pair',
    ],
  )
  let originalOffset = adapter.source.indexOf('  $type = $Value.psbase.GetType()\n')
  const end = adapter.source.indexOf('  $parts = [Collections.Generic.List[string]]::new()\n')
  assert.equal(originalOffset >= 0 && end > originalOffset, true)
  for (const item of originals) {
    assert.equal(item.adapterOffset, originalOffset)
    assert.equal(Number.isInteger(item.adapterUnits) && item.adapterUnits > 0, true)
    const original = adapter.source.slice(
      item.adapterOffset,
      item.adapterOffset + item.adapterUnits,
    )
    const actual = artifact.source.slice(item.offset, item.offset + item.units)
    assert.equal(actual.replaceAll("$C04.Kind = 'guard_rejected'; ", ''), original)
    assert.equal(item.originalSha256, createHash('sha256').update(original, 'utf8').digest('hex'))
    originalOffset += item.adapterUnits
  }
  assert.equal(originalOffset, end)
  let lastEnd = artifact.adapterOffset + artifact.adapterUnits
  for (const item of [...artifact.stepMap].sort((a, b) => a.offset - b.offset)) {
    assert.equal(Number.isInteger(item.offset) && Number.isInteger(item.units), true)
    assert.equal(item.offset > lastEnd && item.units > 0, true)
    assert.equal(item.offset + item.units <= artifact.source.length, true)
    lastEnd = item.offset + item.units
  }
})

// 只有公開初始unknown oracle，探針的結果marker不得被誤認現場原生診斷。
test('c04 supplies only the initial public wire oracle and isolated outcome purpose', async () => {
  const value = await c04Api()
  const artifact = value.createNativeProbePowerShellC04ProbeArtifact()
  assert.equal(artifact.expectedWire, value.formatNativeProbeDiagnostic(unknown()))
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedWire), unknown())
  assert.equal(
    artifact.expectedStdout,
    'receiver_native_c04_probe_v1,result=observed,step=complete,kind=none\n',
  )
  assert.equal(
    artifact.failureStdout,
    'receiver_native_c04_probe_v1,result=unavailable,step=unknown,kind=unknown\n',
  )
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedStdout), unknown())
})

// 檢查的是預期白名單資料而非PS stdout；各失敗分類只能出現在適用步驟。
test('c04 enumerates bounded ASCII outcomes with only meaningful step-kind pairs', async () => {
  const value = await c04Api()
  const artifact = value.createNativeProbePowerShellC04ProbeArtifact()
  assert.equal(artifact.maxStdoutUtf8Bytes, 256)
  assert.equal(Array.isArray(artifact.allowedStdout), true)
  assert.equal(new Set(artifact.allowedStdout).size, 25)
  assert.equal(artifact.allowedStdout.length, 25)
  assert.equal(artifact.allowedStdout.includes(artifact.expectedStdout), true)
  assert.equal(artifact.allowedStdout.includes(artifact.failureStdout), true)
  const guardSteps = [
    'input_shape',
    'type_guard',
    'field_count',
    'field_keys',
    'scalar_guards',
    'evidence_guards',
    'state_pair',
  ]
  const observedPairs = new Set()
  for (const line of artifact.allowedStdout) {
    assert.equal(Buffer.byteLength(line, 'utf8') <= 256, true)
    assert.equal(/^[\x20-\x7e]+\n$/.test(line), true)
    const match =
      /^receiver_native_c04_probe_v1,result=(observed|unavailable),step=([a-z_]+),kind=([a-z_]+)\n$/.exec(
        line,
      )
    assert.notEqual(match, null)
    const [, result, step, kind] = match
    if (result === 'observed') {
      assert.equal(step, 'complete')
      assert.equal(kind, 'none')
    } else if (step === 'unknown') {
      assert.equal(kind, 'unknown')
    } else {
      assert.equal(
        artifact.stepMap.some((item) => item.step === step),
        true,
      )
      assert.equal(
        kind === 'runtime' ||
          (kind === 'guard_rejected' && guardSteps.includes(step)) ||
          (kind === 'comparison_mismatch' && step === 'wire_compare'),
        true,
      )
      observedPairs.add(step + ':' + kind)
    }
  }
  for (const item of artifact.stepMap) {
    const kinds = ['runtime']
    if (guardSteps.includes(item.step)) kinds.push('guard_rejected')
    if (item.step === 'wire_compare') kinds.push('comparison_mismatch')
    assert.deepEqual(item.kinds, kinds)
    for (const kind of kinds) assert.equal(observedPairs.has(item.step + ':' + kind), true)
  }
})

// artifact、來源表及巢狀分類都不可由呼叫端改成原生PASS或換掉交接依據。
test('c04 freezes manifest regions, nested kinds and allowed output descriptions', async () => {
  const value = await c04Api()
  const artifact = value.createNativeProbePowerShellC04ProbeArtifact()
  assert.equal(Object.isFrozen(artifact), true)
  assert.equal(Array.isArray(artifact.stepMap) && Object.isFrozen(artifact.stepMap), true)
  assert.equal(
    Array.isArray(artifact.allowedStdout) && Object.isFrozen(artifact.allowedStdout),
    true,
  )
  for (const item of artifact.stepMap) {
    assert.equal(Object.isFrozen(item), true)
    assert.equal(Object.isFrozen(item.kinds), true)
  }
  assert.throws(() => {
    artifact.nativeVerified = true
  }, TypeError)
  assert.throws(() => {
    artifact.stepMap[0].kinds.push('none')
  }, TypeError)
  assert.throws(() => {
    artifact.allowedStdout[0] = 'PUBLIC_UNTRUSTED'
  }, TypeError)
})

// 無參數介面不得讀取外部getter或轉型未知內容來生成原碼。
test('c04 rejects all supplied arguments without getters or coercion', async () => {
  const value = await c04Api()
  let touched = 0
  const input = {
    // 若讀外部來源屬性即記錄測試失敗，不把資料送進候選。
    get source() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
    // 任意外部物件不得經轉型混入PS原碼。
    toString() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
  }
  for (const supplied of [undefined, null, 'PUBLIC_PATH', input, Symbol('PUBLIC')]) {
    assert.throws(() => value.createNativeProbePowerShellC04ProbeArtifact(supplied), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
})

// 先驗新版能力，缺API以斷言RED呈現而不是import例外。
async function typeFixedApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellTypeFixedAdapterArtifact, 'function')
  assert.equal(typeof value.createNativeProbePowerShellTypeFixedSelfTestArtifact, 'function')
  return value
}

// 只驗真正生成的非空來源，不能將manifest用途當成修正已完成。
test('type-fixed adapter generates a nonempty unverified RAM candidate', async () => {
  const value = await typeFixedApi()
  const artifact = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(artifact.purpose, 'receiver_native_diagnostic_adapter_v2')
  assert.equal(typeof artifact.source, 'string')
  assert.equal(artifact.source.length > 0, true)
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  assert.equal(artifact.encodedCommandSupported, false)
})

// 新版fixture有獨立用途，生成本身不解析或執行PS。
test('type-fixed fixture generates a nonempty unverified RAM candidate', async () => {
  const value = await typeFixedApi()
  const artifact = value.createNativeProbePowerShellTypeFixedSelfTestArtifact()
  assert.equal(artifact.purpose, 'receiver_native_diagnostic_fixture_v3')
  assert.equal(typeof artifact.source, 'string')
  assert.equal(artifact.source.length > 0, true)
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  assert.equal(artifact.encodedCommandSupported, false)
})

// 差異只能是型別查詢一行；可逆重建能抓到白名單或其他guard被偷偷修改。
test('type-fixed adapter changes exactly one lookup line and reconstructs the full baseline', async () => {
  const value = await typeFixedApi()
  const baseline = value.createNativeProbePowerShellAdapterArtifact()
  const artifact = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  const oldLine = '  $type = $Value.psbase.GetType()\n'
  const newLine = "  $type = [object].GetMethod('GetType').Invoke($Value, $null)\n"
  const offset = baseline.source.indexOf(oldLine)
  assert.equal(offset >= 0, true)
  assert.equal(offset, baseline.source.lastIndexOf(oldLine))
  assert.equal(artifact.baselineSha256, baseline.sha256)
  assert.equal(artifact.typeLookupOffset, offset)
  assert.equal(artifact.originalTypeLookupUnits, oldLine.length)
  assert.equal(artifact.typeLookupUnits, newLine.length)
  assert.equal(artifact.source.slice(offset, offset + newLine.length), newLine)
  assert.equal(artifact.source.slice(0, offset), baseline.source.slice(0, offset))
  assert.equal(
    artifact.source.slice(offset + newLine.length),
    baseline.source.slice(offset + oldLine.length),
  )
  const restored =
    artifact.source.slice(0, offset) + oldLine + artifact.source.slice(offset + newLine.length)
  assert.equal(restored, baseline.source)
  assert.equal(
    createHash('sha256').update(restored, 'utf8').digest('hex'),
    '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f',
  )
})

// 新pin與容量由真正交接來源獨立重算，舊來源的hash不能替新版背書。
test('type-fixed artifacts bind deterministic source bytes and actual command-line capacity', async () => {
  const value = await typeFixedApi()
  for (const build of [
    value.createNativeProbePowerShellTypeFixedAdapterArtifact,
    value.createNativeProbePowerShellTypeFixedSelfTestArtifact,
  ]) {
    const artifact = build()
    assert.equal(artifact.utf8Bytes, Buffer.byteLength(artifact.source, 'utf8'))
    assert.equal(artifact.utf16Units, artifact.source.length)
    assert.equal(artifact.source.endsWith('\n'), true)
    assert.equal(artifact.source.includes('\r') || artifact.source.includes('\0'), false)
    const actualHash = createHash('sha256').update(artifact.source, 'utf8').digest('hex')
    assert.equal(artifact.sha256, actualHash)
    assert.notEqual(artifact.sha256, artifact.baselineSha256)
    const args =
      '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
      Buffer.from(artifact.source, 'utf16le').toString('base64')
    assert.equal(artifact.argumentUtf16Units, args.length)
    assert.equal(artifact.encodedCommandFits, args.length + 512 + 3 <= 32766)
    assert.deepEqual(build(), artifact)
  }
})

// 新候選生成後仍重算四組歷史來源，任何舊FAIL基準被改寫都會失敗。
test('type-fixed generation preserves all four historical source pins', async () => {
  const value = await typeFixedApi()
  value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  value.createNativeProbePowerShellTypeFixedSelfTestArtifact()
  const previous = [
    [
      'createNativeProbePowerShellAdapterArtifact',
      6650,
      6184,
      '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f',
    ],
    [
      'createNativeProbePowerShellSelfTestArtifact',
      12204,
      11564,
      'ab88c6293129b9e74aae555c67c1b89f2509df47f2ee4da0949e38085fd96fac',
    ],
    [
      'createNativeProbePowerShellDiagnosticSelfTestArtifact',
      14091,
      13355,
      'f038a7310d6883c8677333eb27a3b4830dc2bd3580eac39ceb1045c3f443a85a',
    ],
    [
      'createNativeProbePowerShellC04ProbeArtifact',
      11478,
      10852,
      '2d4f1c89aa010b2df57117b8e2815892cf34e123fee59c11b6b77694431bb09d',
    ],
  ]
  for (const [name, bytes, units, pin] of previous) {
    const artifact = value[name]()
    assert.equal(Buffer.byteLength(artifact.source, 'utf8'), bytes)
    assert.equal(artifact.source.length, units)
    assert.equal(createHash('sha256').update(artifact.source, 'utf8').digest('hex'), pin)
  }
})

// 逐字抽取實際嵌入來源，能抓到新manifest綁定了舊adapter的錯誤。
test('type-fixed fixture embeds the actual corrected adapter rather than the old one', async () => {
  const value = await typeFixedApi()
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  const artifact = value.createNativeProbePowerShellTypeFixedSelfTestArtifact()
  assert.equal(artifact.adapterOffset, 4)
  assert.equal(artifact.adapterUnits, adapter.source.length)
  const embedded = artifact.source.slice(
    artifact.adapterOffset,
    artifact.adapterOffset + artifact.adapterUnits,
  )
  assert.equal(embedded, adapter.source)
  assert.equal(artifact.adapterSha256, createHash('sha256').update(embedded, 'utf8').digest('hex'))
  assert.equal(artifact.adapterSha256, adapter.sha256)
})

// 比對的是生成器的來源保存契約，不能把原c04失敗改成刪案例或調整oracle。
test('type-fixed fixture retains every original case byte with rebased source spans', async () => {
  const value = await typeFixedApi()
  const baseline = value.createNativeProbePowerShellDiagnosticSelfTestArtifact()
  const artifact = value.createNativeProbePowerShellTypeFixedSelfTestArtifact()
  assert.equal(
    artifact.baselineSha256,
    'f038a7310d6883c8677333eb27a3b4830dc2bd3580eac39ceb1045c3f443a85a',
  )
  assert.equal(Array.isArray(artifact.caseMap), true)
  assert.equal(artifact.caseMap.length, 32)
  let previousEnd = artifact.adapterOffset + artifact.adapterUnits
  for (const [index, original] of baseline.caseMap.entries()) {
    const actual = artifact.caseMap[index]
    assert.equal(actual.id, original.id)
    assert.equal(actual.label, original.label)
    assert.equal(actual.baselineOffset, original.offset)
    assert.equal(actual.units, original.units)
    assert.equal(Number.isInteger(actual.offset) && actual.offset > previousEnd, true)
    assert.equal(
      artifact.source.slice(actual.offset, actual.offset + actual.units),
      baseline.source.slice(original.offset, original.offset + original.units),
    )
    previousEnd = actual.offset + actual.units
  }
  assert.deepEqual(artifact.expectedWires, baseline.expectedWires)
  assert.equal(
    artifact.source.slice(
      artifact.adapterOffset + artifact.adapterUnits,
      artifact.caseMap[0].offset,
    ),
    baseline.source.slice(
      baseline.adapterOffset + baseline.adapterUnits,
      baseline.caseMap[0].offset,
    ),
  )
  const oldIds = '@(' + baseline.caseMap.map((item) => "'" + item.id + "'").join(', ') + ')'
  const newIds = '@(' + artifact.caseMap.map((item) => "'" + item.id + "'").join(', ') + ')'
  const oldLast = baseline.caseMap.at(-1)
  const newLast = artifact.caseMap.at(-1)
  assert.equal(
    artifact.source.slice(newLast.offset + newLast.units),
    baseline.source
      .slice(oldLast.offset + oldLast.units)
      .replaceAll(
        'receiver_native_diagnostic_fixture_v2,',
        'receiver_native_diagnostic_fixture_v3,',
      )
      .replace(oldIds, newIds),
  )
})

// 手寫公開候選的預期案例來源；這只驗交接有包含真正formatter呼叫及斷言，未執行PS。
const typeFixedCases = [
  [
    't01',
    'accept_hashtable',
    `  $plain = @{}
  foreach ($name in (Get-RdwebNativeSchema).Fields) { $plain.Add($name, $before[$name]) }
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic $plain) -ceq ($expected[0] + [char]10))
`,
  ],
  [
    't02',
    'accept_ordered',
    `  $ordered = (New-RdwebNativeDiagnostic).Value
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic $ordered) -ceq ($expected[0] + [char]10))
`,
  ],
  [
    't03',
    'reject_null',
    `  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $null) }
`,
  ],
  [
    't04',
    'reject_other_dictionary',
    `  $generic = [Collections.Generic.Dictionary[string,object]]::new()
  foreach ($name in (Get-RdwebNativeSchema).Fields) { $generic.Add($name, $before[$name]) }
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $generic) }
`,
  ],
  [
    't05',
    'reject_custom_object',
    `  $custom = [pscustomobject]$plain
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $custom) }
`,
  ],
  [
    't06',
    'reject_spoof_without_access',
    `  $spoof = [pscustomobject]$plain
  Microsoft.PowerShell.Utility\\Add-Member -InputObject $spoof -MemberType NoteProperty -Name FixtureTouches -Value 0
  # 公開擴充方法只用來偵測未知GetType是否被呼叫，不輸出計數。
  Microsoft.PowerShell.Utility\\Add-Member -InputObject $spoof -MemberType ScriptMethod -Name GetType -Force -Value {
    $this.FixtureTouches++; return [hashtable]
  }
  # 公開getter只用來偵測拒絕前是否讀取未知欄位，不接觸現場資料。
  Microsoft.PowerShell.Utility\\Add-Member -InputObject $spoof -MemberType ScriptProperty -Name phase -Force -Value {
    $this.FixtureTouches++; return 'unknown'
  }
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $spoof) }
  Assert-RdwebNativeFixture ($spoof.FixtureTouches -eq 0)
`,
  ],
  [
    't07',
    'reject_nonstring_key',
    `  $bad = $plain.Clone()
  $bad.Remove('phase'); $bad.Add(7, 'unknown')
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $bad) }
`,
  ],
  [
    't08',
    'reject_member_key_collisions',
    `  foreach ($collision in @('psbase', 'GetType', 'Count', 'Keys')) {
    $bad = $plain.Clone()
    $bad.Remove('phase'); $bad.Add($collision, 'unknown')
    Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $bad) }
  }
`,
  ],
]

// 漏掉一個型別負向或漏真正斷言時，即使metadata照寫也會因實際案例區段不同而失敗。
test('type-fixed fixture ships all eight explicit type case bodies without calling PS', async () => {
  const value = await typeFixedApi()
  const artifact = value.createNativeProbePowerShellTypeFixedSelfTestArtifact()
  assert.equal(Array.isArray(artifact.caseMap), true)
  const actualCases = artifact.caseMap.slice(24)
  assert.equal(actualCases.length, 8)
  let previousEnd = artifact.caseMap[23].offset + artifact.caseMap[23].units
  for (const [index, [id, label, body]] of typeFixedCases.entries()) {
    const actual = actualCases[index]
    assert.equal(actual.id, id)
    assert.equal(actual.label, label)
    assert.equal(actual.baselineOffset, null)
    assert.equal(Number.isInteger(actual.offset) && actual.offset > previousEnd, true)
    assert.equal(actual.units, body.length)
    assert.equal(artifact.source.slice(actual.offset, actual.offset + actual.units), body)
    previousEnd = actual.offset + actual.units
  }
})

// 新增案例的失敗行必須可被白名單描述，且fixture用途不能誤入正式診斷parser。
test('type-fixed fixture bounds all 66 terminal descriptions and separates native evidence', async () => {
  const value = await typeFixedApi()
  const artifact = value.createNativeProbePowerShellTypeFixedSelfTestArtifact()
  assert.equal(
    artifact.expectedStdout,
    'receiver_native_diagnostic_fixture_v3,result=observed,case=complete,kind=none\n',
  )
  assert.equal(
    artifact.failureStdout,
    'receiver_native_diagnostic_fixture_v3,result=unavailable,case=unknown,kind=unknown\n',
  )
  assert.equal(artifact.maxStdoutUtf8Bytes, 256)
  assert.equal(artifact.allowedStdout.length, 66)
  assert.equal(new Set(artifact.allowedStdout).size, 66)
  const expectedLines = [artifact.expectedStdout, artifact.failureStdout]
  for (const item of artifact.caseMap) {
    for (const kind of ['assertion', 'runtime']) {
      expectedLines.push(
        'receiver_native_diagnostic_fixture_v3,result=unavailable,case=' +
          item.id +
          ',kind=' +
          kind +
          '\n',
      )
    }
  }
  assert.deepEqual(artifact.allowedStdout, expectedLines)
  for (const line of artifact.allowedStdout) {
    assert.equal(/^[\x20-\x7e]+\n$/.test(line), true)
    assert.equal(Buffer.byteLength(line, 'utf8') <= 256, true)
    assert.deepEqual(value.parseNativeProbeDiagnostic(line), unknown())
  }
  for (const [index, expected] of [
    unknown(),
    complete(),
    { ...unknown(), phase: 'root_absence', reason: 'guard_rejected', resourcesClose: 'confirmed' },
  ].entries()) {
    assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedWires[index]), expected)
  }
})

// 凍結實際巢狀來源表及oracle，防止交接後被改成原生已驗或替換案例。
test('type-fixed artifacts freeze provenance, case spans and expected output collections', async () => {
  const value = await typeFixedApi()
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  const artifact = value.createNativeProbePowerShellTypeFixedSelfTestArtifact()
  assert.equal(Object.isFrozen(adapter), true)
  assert.equal(Object.isFrozen(artifact), true)
  for (const collection of [artifact.caseMap, artifact.expectedWires, artifact.allowedStdout]) {
    assert.equal(Array.isArray(collection) && Object.isFrozen(collection), true)
  }
  for (const item of artifact.caseMap) assert.equal(Object.isFrozen(item), true)
  assert.throws(() => {
    adapter.nativeVerified = true
  }, TypeError)
  assert.throws(() => {
    artifact.caseMap[24].offset = 0
  }, TypeError)
  assert.throws(() => {
    artifact.expectedWires[0] = 'PUBLIC_UNTRUSTED'
  }, TypeError)
})

for (const name of [
  'createNativeProbePowerShellTypeFixedAdapterArtifact',
  'createNativeProbePowerShellTypeFixedSelfTestArtifact',
]) {
  // 所有外部參數一律先拒絕，不讀取來源getter、不轉型或執行傳入物件。
  test(`type-fixed rejects supplied arguments without access in ${name}`, async () => {
    const value = await typeFixedApi()
    let touched = 0
    const input = {
      // 讀來源屬性就表示生成器越過無參數邊界。
      get source() {
        touched++
        return 'PUBLIC_UNTRUSTED'
      },
      // 任何外來轉型均不得進入原碼生成路徑。
      toString() {
        touched++
        return 'PUBLIC_UNTRUSTED'
      },
    }
    for (const supplied of [undefined, null, 'PUBLIC_PATH', input, Symbol('PUBLIC')]) {
      assert.throws(() => value[name](supplied), {
        message: 'receiver_native_diagnostic_unavailable',
      })
    }
    assert.equal(touched, 0)
  })
}

// 缺能力用斷言RED呈現，不用模組解析例外替代受測行為。
async function loadOnlyApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellLoadOnlySupervisorArtifact, 'function')
  return value
}

// 這只驗實際生成的雙端非空候選，不執行PS或啟動child。
test('load-only generates separate nonempty parent and child sources without native verification', async () => {
  const value = await loadOnlyApi()
  const artifact = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  assert.equal(artifact.purpose, 'receiver_native_load_only_supervisor_v1')
  assert.equal(typeof artifact.source, 'string')
  assert.equal(artifact.source.length > 0, true)
  assert.equal(typeof artifact.childSource, 'string')
  assert.equal(artifact.childSource.length > 0, true)
  assert.notEqual(artifact.source, artifact.childSource)
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  assert.equal(artifact.encodedCommandSupported, false)
})

// 完整命令列容量及兩份來源hash必須由交接原碼重算，不接受過期manifest。
test('load-only pins both actual sources and bounds the child executable plus encoded arguments', async () => {
  const value = await loadOnlyApi()
  const artifact = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  for (const [source, bytes, units, pin] of [
    [artifact.source, artifact.utf8Bytes, artifact.utf16Units, artifact.sha256],
    [artifact.childSource, artifact.childUtf8Bytes, artifact.childUtf16Units, artifact.childSha256],
  ]) {
    assert.equal(bytes, Buffer.byteLength(source, 'utf8'))
    assert.equal(units, source.length)
    assert.equal(pin, createHash('sha256').update(source, 'utf8').digest('hex'))
    assert.equal(source.endsWith('\n'), true)
    assert.equal(source.includes('\r') || source.includes('\0'), false)
  }
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(artifact.childSource, 'utf16le').toString('base64')
  assert.equal(artifact.childArguments, args)
  assert.equal(artifact.maxExecutableUtf16Units, 512)
  assert.equal(artifact.commandLineLimit, 32766)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound, 512 + 3 + args.length)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.equal(
    artifact.childExecutableRelativePath,
    'System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  )
  assert.deepEqual(value.createNativeProbePowerShellLoadOnlySupervisorArtifact(), artifact)
})

// 交接真正來源必須嵌入同一修正版adapter，parent內的child literal也須逐字一致。
test('load-only binds the readable child literal and both corrected adapter regions', async () => {
  const value = await loadOnlyApi()
  const artifact = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    artifact.adapterSha256,
    'bfb93ed20519623ea1c2de54062156c71f48c47093cb77cd48ff046dae80ca7d',
  )
  assert.equal(artifact.adapterUnits, 6212)
  assert.equal(artifact.adapterOffset, 4)
  assert.equal(artifact.childAdapterOffset, 4)
  assert.equal(artifact.source.slice(4, 4 + 6212), adapter.source)
  assert.equal(artifact.childSource.slice(4, 4 + 6212), adapter.source)
  assert.equal(Number.isInteger(artifact.childSourceOffset), true)
  assert.equal(artifact.childSourceOffset > 6212, true)
  assert.equal(
    artifact.source.slice(
      artifact.childSourceOffset,
      artifact.childSourceOffset + artifact.childSource.length,
    ),
    artifact.childSource,
  )
})

// 來源限定原包三個公開程式完整性項目，不接受呼叫端替換正式入口或修改包。
test('load-only fixes source trust to the existing manifest and two pinned PowerShell files', async () => {
  const value = await loadOnlyApi()
  const artifact = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  assert.deepEqual(artifact.trustedSources, [
    {
      name: 'integrity.json',
      bytes: null,
      sha256: 'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
    },
    {
      name: 'start-windows-test-receiver.ps1',
      bytes: 7455,
      sha256: 'd84c60ed6a70751f82e71ef7c53735a52d89e0d8a94c424779e9373359324c09',
    },
    {
      name: 'windows-host-observer-supervisor.ps1',
      bytes: 9816,
      sha256: '51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2',
    },
  ])
  assert.equal(
    artifact.packageRelativePath,
    'rdweb-receiver-download-20261024-01\\unpacked-01\\rdweb-test-receiver-v24.22.1-win-x64',
  )
})

// child不能宣告parent或自己退出；以下只驗線契約描述與真正JS parser相容，未跑PS。
test('load-only supplies partial child and complete parent wires with explicit evidence ownership', async () => {
  const value = await loadOnlyApi()
  const artifact = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  assert.deepEqual(artifact.childEvidenceNames, ['childPolicyRestore', 'resourcesClose'])
  assert.deepEqual(artifact.parentEvidenceNames, ['childStart', 'childExit', 'parentPolicyVerify'])
  assert.equal(artifact.stdoutMaxBytes, 1024)
  assert.equal(artifact.stderrMaxBytes, 128)
  assert.equal(artifact.totalBudgetMs, 20000)
  assert.equal(artifact.normalBudgetMs, 18000)
  assert.equal(artifact.cleanupBudgetMs, 2000)
  assert.equal(
    artifact.expectedStdout,
    'receiver_native_diagnostic,{"version":1,"phase":"complete","reason":"none","childStart":"confirmed","childExit":"confirmed","childPolicyRestore":"confirmed","parentPolicyVerify":"confirmed","resourcesClose":"confirmed"}\n',
  )
  assert.equal(
    artifact.expectedChildStdout,
    'receiver_native_diagnostic,{"version":1,"phase":"unknown","reason":"unknown","childStart":"unknown","childExit":"unknown","childPolicyRestore":"confirmed","parentPolicyVerify":"unknown","resourcesClose":"confirmed"}\n',
  )
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedStdout), complete())
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedChildStdout), {
    ...unknown(),
    childPolicyRestore: 'confirmed',
    resourcesClose: 'confirmed',
  })
  assert.equal(Array.isArray(artifact.wireFixtures), true)
  assert.deepEqual(
    artifact.wireFixtures.map((item) => item.label),
    ['child_ready', 'child_parse_rejected', 'child_restore_unconfirmed'],
  )
  const expected = [
    { ...unknown(), childPolicyRestore: 'confirmed', resourcesClose: 'confirmed' },
    {
      ...unknown(),
      phase: 'child_parse',
      reason: 'parse_rejected',
      childPolicyRestore: 'confirmed',
      resourcesClose: 'confirmed',
    },
    {
      ...unknown(),
      phase: 'child_cleanup',
      reason: 'cleanup_unconfirmed',
      childPolicyRestore: 'unconfirmed',
      resourcesClose: 'confirmed',
    },
  ]
  for (const [index, item] of artifact.wireFixtures.entries()) {
    assert.deepEqual(value.parseNativeProbeDiagnostic(item.wire), expected[index])
    assert.equal(Buffer.byteLength(item.wire, 'utf8') <= 1024, true)
  }
})

// malformed只作獨立公開負向資料交給現有parser，不以它假裝PS decoder已執行。
test('load-only malformed wire descriptions are rejected by the real existing JS parser', async () => {
  const value = await loadOnlyApi()
  const artifact = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  assert.equal(Array.isArray(artifact.invalidWireFixtures), true)
  assert.deepEqual(
    artifact.invalidWireFixtures.map((item) => item.label),
    ['missing', 'truncated', 'duplicate', 'oversize', 'wrong_type', 'extra_field', 'unknown_value'],
  )
  for (const item of artifact.invalidWireFixtures) {
    assert.deepEqual(value.parseNativeProbeDiagnostic(item.wire), unknown())
  }
})

// 新增生成器不得改寫六個歷史來源或把舊失敗改成另一份成功基準。
test('load-only generation preserves all six existing artifact pins', async () => {
  const value = await loadOnlyApi()
  value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  for (const [name, pin] of [
    [
      'createNativeProbePowerShellAdapterArtifact',
      '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f',
    ],
    [
      'createNativeProbePowerShellSelfTestArtifact',
      'ab88c6293129b9e74aae555c67c1b89f2509df47f2ee4da0949e38085fd96fac',
    ],
    [
      'createNativeProbePowerShellDiagnosticSelfTestArtifact',
      'f038a7310d6883c8677333eb27a3b4830dc2bd3580eac39ceb1045c3f443a85a',
    ],
    [
      'createNativeProbePowerShellC04ProbeArtifact',
      '2d4f1c89aa010b2df57117b8e2815892cf34e123fee59c11b6b77694431bb09d',
    ],
    [
      'createNativeProbePowerShellTypeFixedAdapterArtifact',
      'bfb93ed20519623ea1c2de54062156c71f48c47093cb77cd48ff046dae80ca7d',
    ],
    [
      'createNativeProbePowerShellTypeFixedSelfTestArtifact',
      'bebd3ae1d3012b51ae6d2c922d5cb1ee11c06e982fc241ecfa105a164a033eca',
    ],
  ]) {
    assert.equal(createHash('sha256').update(value[name]().source, 'utf8').digest('hex'), pin)
  }
})

// 交接後來源／權責／fixture集合不可被變成原生已驗或換掉信任來源。
test('load-only freezes nested provenance, evidence ownership and wire descriptions', async () => {
  const value = await loadOnlyApi()
  const artifact = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  assert.equal(Object.isFrozen(artifact), true)
  for (const name of [
    'trustedSources',
    'childEvidenceNames',
    'parentEvidenceNames',
    'wireFixtures',
    'invalidWireFixtures',
  ]) {
    assert.equal(Array.isArray(artifact[name]) && Object.isFrozen(artifact[name]), true)
    for (const item of artifact[name])
      if (typeof item === 'object') assert.equal(Object.isFrozen(item), true)
  }
  assert.throws(() => {
    artifact.nativeVerified = true
  }, TypeError)
  assert.throws(() => {
    artifact.trustedSources[1].sha256 = 'PUBLIC_CHANGED'
  }, TypeError)
})

// 無參數能力不得讀取未知getter或轉型任何呼叫端的設定／來源。
test('load-only rejects all supplied arguments without getters or coercion', async () => {
  const value = await loadOnlyApi()
  let touched = 0
  const input = {
    // 讀取來源即越過介面邊界。
    get source() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
    // 任何外來轉型都不應執行。
    toString() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
  }
  for (const supplied of [undefined, null, 'PUBLIC_PATH', input, Symbol('PUBLIC')]) {
    assert.throws(() => value.createNativeProbePowerShellLoadOnlySupervisorArtifact(supplied), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
})

// 這只驗生成的收尾合約，真實阻塞／kill／pipe時序仍須PS5.1原生驗證。
test('load-only emits one absolute cleanup endpoint shared by all cleanup waits', async () => {
  const value = await loadOnlyApi()
  const { source } = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  const declaration =
    '    $loadCleanupEnd = [Math]::Min(20000, [int]$loadWatch.ElapsedMilliseconds + 2000)\n'
  assert.equal(source.includes(declaration), true)
  assert.equal(source.indexOf(declaration), source.lastIndexOf(declaration))
  assert.equal(source.includes('$left = [Math]::Min(2000, [Math]::Max(0, 20000 -'), false)
  assert.equal(source.includes('$loadWatch.ElapsedMilliseconds -ge $loadCleanupEnd'), true)
})

// 預設I/O失敗不能被生成成timeout；deadline只能由明確的到期分支寫入。
test('load-only emits explicit timeout branches instead of a blanket deadline reason', async () => {
  const value = await loadOnlyApi()
  const { source } = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  assert.equal(source.includes("  $loadStage = 'unknown'; $loadReason = 'io_failed'\n"), true)
  assert.equal(source.includes("  $loadStage = 'unknown'; $loadReason = 'deadline'\n"), false)
  assert.equal(
    source.includes("      Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'deadline'\n"),
    true,
  )
})

// 原生狀態不明不能被metadata或Dispose成功改成資源已全關，這只驗交接守衛存在。
test('load-only emits conservative resource and policy ownership guards', async () => {
  const value = await loadOnlyApi()
  const artifact = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  assert.equal(
    artifact.source.includes(
      "if ($loadDiagnostic.Attempted.ContainsKey('childStart') -and -not $loadExited) { $closed = $false }",
    ),
    true,
  )
  assert.equal(
    artifact.source.includes('  $loadIdentity.Dispose(); $loadIdentity = $null\n'),
    false,
  )
  assert.equal(
    artifact.childSource.includes("  $loadStage = 'child_parse'; $loadReason = 'unknown'\n"),
    true,
  )
  assert.equal(
    artifact.childSource.includes(
      "      Set-RdwebNativeFailure $loadDiagnostic 'child_parse' 'parse_rejected'\n",
    ),
    true,
  )
})

// 缺新能力以斷言RED呈現，不以import例外代替生成契約測試。
async function outputProbeApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact, 'function')
  return value
}

// 這只驗非空公開artifact，不執行PS或把候選當原生已驗。
test('output-probe generates a separate nonempty parent without native verification', async () => {
  const value = await outputProbeApi()
  const artifact = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  assert.equal(artifact.purpose, 'receiver_native_load_only_output_probe_v1')
  assert.equal(typeof artifact.source, 'string')
  assert.equal(artifact.source.length > 0, true)
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  assert.equal(artifact.encodedCommandSupported, false)
})

// 獨立手寫的交接期望只允許固定literal輸出；不是PS執行器或分類器替身。
const outputProbeEmitter = `# 僅回固定首觀察分支；未知值拒絕，不輸出管線內容或補成功。
switch -CaseSensitive ($loadOutputBranch) {
  'not_observed' { [Console]::Write('receiver_native_load_only_output_v1,firstBranch=not_observed' + [char]10); break }
  'stdout_limit' { [Console]::Write('receiver_native_load_only_output_v1,firstBranch=stdout_limit' + [char]10); break }
  'stderr_nonempty' { [Console]::Write('receiver_native_load_only_output_v1,firstBranch=stderr_nonempty' + [char]10); break }
  default { throw 'receiver_native_diagnostic_unavailable' }
}
`

// 若插入錯誤分支、改guard／期限或回顯資料，無法只移除白名單差異重建原v1。
test('output-probe reverses only approved branch inserts and once-flag renames to the original pin', async () => {
  const value = await outputProbeApi()
  const artifact = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  let restored = artifact.source
  const changes = [
    [
      "$loadOutputBranch = 'not_observed'\n$loadStage = 'parent_preflight'",
      "$loadStage = 'parent_preflight'",
    ],
    [
      "      if ($loadOutCount -gt 1024) {\n        if ($loadOutputBranch -ceq 'not_observed') { $loadOutputBranch = 'stdout_limit' }\n",
      '      if ($loadOutCount -gt 1024) {\n',
    ],
    [
      "      if ($loadErrCount -ne 0) {\n        if ($loadOutputBranch -ceq 'not_observed') { $loadOutputBranch = 'stderr_nonempty' }\n",
      '      if ($loadErrCount -ne 0) {\n',
    ],
    [
      'Get-Variable -Name RdwebReceiverLoadOnlyOutputProbe20261025Once',
      'Get-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
    ],
    [
      'New-Variable -Name RdwebReceiverLoadOnlyOutputProbe20261025Once',
      'New-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
    ],
    [
      "[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('$ProgressPreference = ''SilentlyContinue''; ' + $loadChildSource))",
      '[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loadChildSource))',
    ],
    [outputProbeEmitter, ''],
  ]
  for (const [inserted, original] of changes) {
    const offset = restored.indexOf(inserted)
    assert.equal(offset >= 0, true)
    assert.equal(restored.lastIndexOf(inserted), offset)
    restored = restored.slice(0, offset) + original + restored.slice(offset + inserted.length)
  }
  assert.equal(restored, value.createNativeProbePowerShellLoadOnlySupervisorArtifact().source)
  assert.equal(
    createHash('sha256').update(restored).digest('hex'),
    'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e',
  )
  assert.equal(artifact.source.endsWith(outputProbeEmitter + '}\n'), true)
  const emissionOffset = artifact.source.length - outputProbeEmitter.length - 2
  assert.equal(artifact.source.slice(0, emissionOffset).endsWith(' + [char]10) }\n'), true)
  assert.equal(artifact.onceFlag, 'RdwebReceiverLoadOnlyOutputProbe20261025Once')
  assert.equal(
    artifact.baselineSha256,
    'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e',
  )
})

// 新parent不能帶入另一份child／adapter或過期的實際嵌入位置與命令列metadata。
test('output-probe preserves the actual child and corrected adapter with the full command bound', async () => {
  const value = await outputProbeApi()
  const artifact = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  const baseline = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(artifact.childSource, baseline.childSource)
  assert.equal(artifact.childUtf8Bytes, 11308)
  assert.equal(artifact.childUtf16Units, 10732)
  assert.equal(
    artifact.childSha256,
    '21f0c3563ae7469fc0f842d63f00bb5fd8d9c747787f4bb131c22c4d53b3394e',
  )
  assert.equal(
    createHash('sha256').update(artifact.childSource).digest('hex'),
    artifact.childSha256,
  )
  assert.equal(
    artifact.source.slice(
      artifact.childSourceOffset,
      artifact.childSourceOffset + artifact.childUtf16Units,
    ),
    artifact.childSource,
  )
  assert.equal(
    artifact.source.slice(artifact.adapterOffset, artifact.adapterOffset + 6212),
    adapter.source,
  )
  assert.equal(
    artifact.childSource.slice(artifact.childAdapterOffset, artifact.childAdapterOffset + 6212),
    adapter.source,
  )
  assert.equal(
    artifact.adapterSha256,
    'bfb93ed20519623ea1c2de54062156c71f48c47093cb77cd48ff046dae80ca7d',
  )
  const argumentsText =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(artifact.progressPreamble + artifact.childSource, 'utf16le').toString('base64')
  assert.equal(artifact.childArguments, argumentsText)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound, 512 + 3 + argumentsText.length)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound, 29322)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.equal(artifact.expectedChildStdout, baseline.expectedChildStdout)
})

// 啟動命令必須在已pin的child前加固定progress preamble，且metadata反映實際命令列。
test('output-probe prefixes the pinned child with the fixed progress preamble', async () => {
  const value = await outputProbeApi()
  const artifact = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  const preamble = "$ProgressPreference = 'SilentlyContinue'; "
  assert.equal(artifact.progressPreamble, preamble)
  const argumentsText =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(preamble + artifact.childSource, 'utf16le').toString('base64')
  assert.equal(artifact.childArguments, argumentsText)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound, 512 + 3 + argumentsText.length)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  const line = artifact.source.split('\n').find((item) => item.includes('$arguments = '))
  assert.notEqual(line, undefined)
  assert.equal(
    line.includes("GetBytes('$ProgressPreference = ''SilentlyContinue''; ' + $loadChildSource)"),
    true,
  )
})

// 產出真新source的bytes／units／hash，而非複製v1的過期parent metadata。
test('output-probe derives deterministic metadata from its own actual parent source', async () => {
  const value = await outputProbeApi()
  const artifact = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  assert.equal(artifact.utf8Bytes, Buffer.byteLength(artifact.source, 'utf8'))
  assert.equal(artifact.utf16Units, artifact.source.length)
  assert.equal(artifact.sha256, createHash('sha256').update(artifact.source, 'utf8').digest('hex'))
  assert.notEqual(
    artifact.sha256,
    'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e',
  )
  assert.equal(artifact.source.includes('\r') || artifact.source.includes('\0'), false)
  assert.equal(artifact.source.endsWith('\n'), true)
  assert.deepEqual(value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact(), artifact)
})

// 旁路行只允許三個有界literal，且不能被當成單行canonical成功診斷。
test('output-probe describes bounded branch-only output separately from canonical evidence', async () => {
  const value = await outputProbeApi()
  const artifact = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  assert.deepEqual(artifact.branchNames, ['not_observed', 'stdout_limit', 'stderr_nonempty'])
  assert.deepEqual(artifact.allowedBranchStdout, [
    'receiver_native_load_only_output_v1,firstBranch=not_observed\n',
    'receiver_native_load_only_output_v1,firstBranch=stdout_limit\n',
    'receiver_native_load_only_output_v1,firstBranch=stderr_nonempty\n',
  ])
  assert.equal(artifact.branchStdoutMaxBytes, 128)
  assert.equal(artifact.outputPrefix, 'receiver_native_load_only_output_v1,firstBranch=')
  assert.equal(
    artifact.expectedDiagnosticStdout,
    'receiver_native_diagnostic,{"version":1,"phase":"complete","reason":"none","childStart":"confirmed","childExit":"confirmed","childPolicyRestore":"confirmed","parentPolicyVerify":"confirmed","resourcesClose":"confirmed"}\n',
  )
  assert.equal(
    artifact.expectedStdout,
    artifact.expectedDiagnosticStdout +
      'receiver_native_load_only_output_v1,firstBranch=not_observed\n',
  )
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedDiagnosticStdout), complete())
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedStdout), unknown())
  for (const line of artifact.allowedBranchStdout) {
    assert.equal(/^[\x20-\x7e]+\n$/.test(line), true)
    assert.equal(Buffer.byteLength(line, 'utf8') <= 128, true)
    assert.deepEqual(value.parseNativeProbeDiagnostic(line), unknown())
  }
})

// 新集合及繼承的來源／權責皆需凍結，避免交接後改成原生已驗或換掉來源。
test('output-probe freezes output collections and inherited provenance without mutating the baseline', async () => {
  const value = await outputProbeApi()
  const before = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  const artifact = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  assert.equal(Object.isFrozen(artifact), true)
  for (const name of [
    'branchNames',
    'allowedBranchStdout',
    'trustedSources',
    'childEvidenceNames',
    'parentEvidenceNames',
    'wireFixtures',
    'invalidWireFixtures',
  ]) {
    assert.equal(Object.isFrozen(artifact[name]), true)
    for (const item of artifact[name])
      if (typeof item === 'object') assert.equal(Object.isFrozen(item), true)
  }
  assert.throws(() => {
    artifact.allowedBranchStdout[0] = 'PUBLIC_CHANGED'
  }, TypeError)
  assert.throws(() => {
    artifact.nativeVerified = true
  }, TypeError)
  assert.deepEqual(value.createNativeProbePowerShellLoadOnlySupervisorArtifact(), before)
})

// 無參數生成器不得讀取任何呼叫端設定、getter或轉型，即使顯式undefined也拒絕。
test('output-probe rejects supplied arguments without reading or coercing unknown input', async () => {
  const value = await outputProbeApi()
  let touched = 0
  const input = {
    // 未知來源getter不能在拒絕前執行。
    get source() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
    // 不能把未知輸入轉成來源或路徑。
    toString() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
  }
  for (const supplied of [undefined, null, '', 0, false, input, Symbol('PUBLIC')]) {
    assert.throws(() => value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact(supplied), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.throws(
    () => value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact(undefined, input),
    {
      message: 'receiver_native_diagnostic_unavailable',
    },
  )
  assert.equal(touched, 0)
})

// 新生成器不能改掉六份歷史artifact或load-only v1的實際source pins。
test('output-probe leaves all seven historical artifact source pins intact', async () => {
  const value = await outputProbeApi()
  value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  for (const [name, pin] of [
    [
      'createNativeProbePowerShellAdapterArtifact',
      '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f',
    ],
    [
      'createNativeProbePowerShellSelfTestArtifact',
      'ab88c6293129b9e74aae555c67c1b89f2509df47f2ee4da0949e38085fd96fac',
    ],
    [
      'createNativeProbePowerShellDiagnosticSelfTestArtifact',
      'f038a7310d6883c8677333eb27a3b4830dc2bd3580eac39ceb1045c3f443a85a',
    ],
    [
      'createNativeProbePowerShellC04ProbeArtifact',
      '2d4f1c89aa010b2df57117b8e2815892cf34e123fee59c11b6b77694431bb09d',
    ],
    [
      'createNativeProbePowerShellTypeFixedAdapterArtifact',
      'bfb93ed20519623ea1c2de54062156c71f48c47093cb77cd48ff046dae80ca7d',
    ],
    [
      'createNativeProbePowerShellTypeFixedSelfTestArtifact',
      'bebd3ae1d3012b51ae6d2c922d5cb1ee11c06e982fc241ecfa105a164a033eca',
    ],
    [
      'createNativeProbePowerShellLoadOnlySupervisorArtifact',
      'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e',
    ],
  ]) {
    assert.equal(createHash('sha256').update(value[name]().source).digest('hex'), pin)
  }
})

// 兩段式交接必須存在才能驗證交付契約；缺能力以斷言RED呈現。
async function handoffApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellHandoffArtifact, 'function')
  return value
}

// 只切出兩個here-string；依PS語意，結束delimiter前的最後換行不屬於body。
function splitHandoffStage1(source) {
  const aMarker = "$rdwebHandoffPartA = @'\n"
  const bMarker = "$rdwebHandoffPartB = @'\n"
  const aStart = source.indexOf(aMarker)
  assert.equal(aStart >= 0, true)
  const aBodyStart = aStart + aMarker.length
  const aEnd = source.indexOf("'@\n", aBodyStart)
  assert.equal(aEnd > aBodyStart, true)
  assert.equal(source[aEnd - 1], '\n')
  const bStart = source.indexOf(bMarker)
  assert.equal(bStart > aEnd, true)
  const bBodyStart = bStart + bMarker.length
  const bEnd = source.indexOf("'@\n", bBodyStart)
  assert.equal(bEnd > bBodyStart, true)
  assert.equal(source[bEnd - 1], '\n')
  return {
    a: source.slice(aBodyStart, aEnd - 1),
    b: source.slice(bBodyStart, bEnd - 1),
    remainder: source.slice(0, aBodyStart) + source.slice(aEnd, bBodyStart) + source.slice(bEnd),
  }
}

// 第一段只能是RAM賦值與固定雜湊回報，不能自行呼叫或消耗旗標。
test('handoff v2 stage one stays inert and reports only the pinned integrity line', async () => {
  const value = await handoffApi()
  const artifact = value.createNativeProbePowerShellHandoffArtifact()
  assert.equal(artifact.purpose, 'receiver_native_load_only_output_handoff_v2')
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  const { remainder } = splitHandoffStage1(artifact.stage1Source)
  for (const forbidden of [
    'ScriptBlock]::Create',
    '.Invoke(',
    'New-Variable',
    'Set-ExecutionPolicy',
    'Start-Process',
    '[Diagnostics.Process]',
    '[IO.FileStream]',
    'Remove-Item',
    'Once',
    'exit ',
  ]) {
    assert.equal(remainder.includes(forbidden), false, forbidden)
  }
  assert.equal(remainder.split('[Console]::Write').length - 1, 2)
  assert.equal(
    artifact.stage1Source.includes(
      'Set-Variable -Name RdwebReceiverLoadOnlyOutputProbe20261025Payload -Scope Global',
    ),
    true,
  )
  assert.equal(
    artifact.integrityLine,
    'rdweb_handoff_integrity_v2,status=ok,bytes=34823,units=33483,sha256=cb1de8d3d0302dca1029fbb6d40fb15f975abb291995792be73d620c9b53a0bf',
  )
  assert.equal(artifact.stage1Source.includes(artifact.parentSha256), true)
  assert.equal(artifact.stage1Source.includes(artifact.integrityLine.slice(0, -64)), true)
})

// 第一段重組後必須逐字等於已pin的parent，分段bytes／units也要固定。
test('handoff v2 stage one reassembles the pinned parent byte for byte', async () => {
  const value = await handoffApi()
  const artifact = value.createNativeProbePowerShellHandoffArtifact()
  const parent = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  const { a, b } = splitHandoffStage1(artifact.stage1Source)
  assert.equal(a + "\n'@\n" + b, parent.source)
  assert.equal(Buffer.byteLength(a, 'utf8'), 21539)
  assert.equal(a.length, 20303)
  assert.equal(Buffer.byteLength(b, 'utf8'), 13280)
  assert.equal(b.length, 13176)
  assert.equal(artifact.parentUtf8Bytes, 34823)
  assert.equal(artifact.parentUtf16Units, 33483)
  assert.equal(
    artifact.parentSha256,
    'cb1de8d3d0302dca1029fbb6d40fb15f975abb291995792be73d620c9b53a0bf',
  )
  assert.equal(
    artifact.stage1Source.includes(
      '$rdwebHandoffPayload = $rdwebHandoffA + $rdwebHandoffLf + "\'@" + $rdwebHandoffLf + $rdwebHandoffB',
    ),
    true,
  )
  assert.equal(artifact.stage1Source.includes('$rdwebHandoffPartA.Replace('), true)
  assert.equal(artifact.stage1Source.includes('$rdwebHandoffPartB.Replace('), true)
})

// 第一段實際使用的重組literal必須是兩字元`'@`，且用它重組要逐字等於parent。
test('handoff v2 stage one uses the exact two-character here-string terminator', async () => {
  const value = await handoffApi()
  const artifact = value.createNativeProbePowerShellHandoffArtifact()
  const parent = value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  const lines = artifact.stage1Source
    .split('\n')
    .filter((line) => line.startsWith('  $rdwebHandoffPayload = '))
  assert.equal(lines.length, 1)
  const match = /\+ "([^"]*)" \+/.exec(lines[0])
  assert.notEqual(match, null)
  assert.equal(match[1], "'@")
  const { a, b } = splitHandoffStage1(artifact.stage1Source)
  assert.equal(a + '\n' + match[1] + '\n' + b, parent.source)
})

// 第一段的錯誤指引必須與核准語意一致：先回報，是否同視窗重貼由代理判斷。
test('handoff v2 stage one tells the operator to report an error before any re-paste', async () => {
  const value = await handoffApi()
  const artifact = value.createNativeProbePowerShellHandoffArtifact()
  assert.equal(
    artifact.stage1Source.split('\n')[2],
    '# 只有這行是 ok 才繼續；任何 error 都先停手回報，是否同視窗重貼由代理判斷。',
  )
})

// 第二段只重驗同一session變數並呼叫一次；缺變數、pins不符或例外都要fail closed。
test('handoff v2 stage two re-verifies the session payload before one invocation', async () => {
  const value = await handoffApi()
  const artifact = value.createNativeProbePowerShellHandoffArtifact()
  const stage2 = artifact.stage2Source
  assert.equal(stage2.split('.Invoke(').length - 1, 1)
  assert.equal(
    stage2.includes(
      'Get-Variable -Name RdwebReceiverLoadOnlyOutputProbe20261025Payload -Scope Global -ErrorAction SilentlyContinue',
    ),
    true,
  )
  assert.equal(stage2.includes('if ($null -eq $rdwebHandoffValue)'), true)
  assert.equal(stage2.includes(artifact.parentSha256), true)
  assert.equal(stage2.includes('34823'), true)
  assert.equal(stage2.includes('33483'), true)
  assert.equal(stage2.includes('IndexOf([char]13)'), true)
  assert.equal(stage2.includes('IndexOf([char]0)'), true)
  assert.equal(stage2.includes('EndsWith($rdwebHandoffLf)'), true)
  assert.equal(
    stage2.includes('receiver_windows_load_only_output_returned,receiverStarted=False'),
    true,
  )
  assert.equal(
    stage2.includes(
      'receiver_windows_load_only_output_unavailable,terminalUse=stop,receiverStarted=False',
    ),
    true,
  )
  assert.equal(stage2.indexOf('unavailable') < stage2.indexOf('.Invoke('), true)
  assert.equal(stage2.includes("@'"), false)
  assert.equal(stage2.includes('\r'), false)
  assert.equal(stage2.includes('\0'), false)
  assert.equal(stage2.endsWith('\n'), true)
  assert.equal(artifact.stage2Utf8Bytes <= 3000, true)
  assert.equal(artifact.stage2Utf8Bytes < artifact.stage1Utf8Bytes, true)
})

// 生成器不得讀取呼叫端輸入，且重複呼叫要得到相同、凍結的兩段來源。
test('handoff v2 is deterministic, frozen and rejects supplied arguments', async () => {
  const value = await handoffApi()
  const first = value.createNativeProbePowerShellHandoffArtifact()
  const second = value.createNativeProbePowerShellHandoffArtifact()
  assert.deepEqual(second, first)
  assert.equal(Object.isFrozen(first), true)
  assert.throws(() => {
    first.stage1Source = 'PUBLIC_CHANGED'
  }, TypeError)
  let touched = 0
  const input = {
    // 未知來源getter不能在拒絕前執行。
    get source() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
    // 不能把未知輸入轉成來源或路徑。
    toString() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
  }
  for (const supplied of [undefined, null, '', 0, false, input, Symbol('PUBLIC')]) {
    assert.throws(() => value.createNativeProbePowerShellHandoffArtifact(supplied), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
})

// 新交接只包裝既有parent，不得改動output-probe或任何歷史artifact的source pins。
test('handoff v2 leaves the output-probe parent and all historical pins intact', async () => {
  const value = await handoffApi()
  value.createNativeProbePowerShellHandoffArtifact()
  assert.equal(
    createHash('sha256')
      .update(value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact().source)
      .digest('hex'),
    'cb1de8d3d0302dca1029fbb6d40fb15f975abb291995792be73d620c9b53a0bf',
  )
  for (const [name, pin] of [
    [
      'createNativeProbePowerShellAdapterArtifact',
      '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f',
    ],
    [
      'createNativeProbePowerShellSelfTestArtifact',
      'ab88c6293129b9e74aae555c67c1b89f2509df47f2ee4da0949e38085fd96fac',
    ],
    [
      'createNativeProbePowerShellDiagnosticSelfTestArtifact',
      'f038a7310d6883c8677333eb27a3b4830dc2bd3580eac39ceb1045c3f443a85a',
    ],
    [
      'createNativeProbePowerShellC04ProbeArtifact',
      '2d4f1c89aa010b2df57117b8e2815892cf34e123fee59c11b6b77694431bb09d',
    ],
    [
      'createNativeProbePowerShellTypeFixedAdapterArtifact',
      'bfb93ed20519623ea1c2de54062156c71f48c47093cb77cd48ff046dae80ca7d',
    ],
    [
      'createNativeProbePowerShellTypeFixedSelfTestArtifact',
      'bebd3ae1d3012b51ae6d2c922d5cb1ee11c06e982fc241ecfa105a164a033eca',
    ],
    [
      'createNativeProbePowerShellLoadOnlySupervisorArtifact',
      'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e',
    ],
  ]) {
    assert.equal(createHash('sha256').update(value[name]().source).digest('hex'), pin)
  }
})

// 第一段失敗時必須清掉payload，第二段才會因缺變數而fail closed。
test('handoff v2 stage one clears the payload when its own check fails', async () => {
  const value = await handoffApi()
  const artifact = value.createNativeProbePowerShellHandoffArtifact()
  const stage1 = artifact.stage1Source
  const removeIndex = stage1.indexOf(
    'Remove-Variable -Name RdwebReceiverLoadOnlyOutputProbe20261025Payload -Scope Global -ErrorAction SilentlyContinue',
  )
  assert.equal(removeIndex > 0, true)
  assert.equal(stage1.indexOf('Set-Variable -Name') < removeIndex, true)
  assert.equal(stage1.indexOf(artifact.integrityErrorLine) > removeIndex, true)
  assert.equal(stage1.indexOf(artifact.integrityLine) < removeIndex, true)
})

// 缺新能力以斷言RED呈現，不以module載入錯誤代替生成契約測試。
async function ntfsGuardApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellNtfsGuardArtifact, 'function')
  return value
}

// 成功與失敗各只允許一行固定輸出；child與parent的stage分開列出。
const ntfsGuardSuccessLine =
  'receiver_windows_ntfs_guard_observed,positive=accepted,negative=rejected,package=accepted,policyBaseline=confirmed,receiverStarted=False,resourcesClosed=True,artifactsRetained=True\n'
const ntfsGuardStages = [
  'preflight',
  'package_missing',
  'package_guard',
  'root_exists',
  'root_create',
  'positive_create',
  'negative_create',
  'positive_guard',
  'negative_guard',
  'policy_baseline',
  'resources_close',
  'child_launch',
  'child_exit',
]
const ntfsGuardStageAssignments = ntfsGuardStages.slice(0, 10)

// 新artifact只供interactive RAM貼上；child以EncodedCommand啟動，仍非原生已驗。
test('ntfs-guard generates a separate nonempty interactive artifact without native verification', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  assert.equal(artifact.purpose, 'receiver_windows_ntfs_guard_v1')
  assert.equal(typeof artifact.source, 'string')
  assert.equal(artifact.source.length > 0, true)
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  assert.equal(artifact.encodedCommandSupported, true)
  assert.equal(typeof artifact.commandLine, 'string')
  assert.equal(artifact.commandLine.length > 0, true)
  assert.equal(artifact.commandLine.includes(artifact.childBase64), true)
  assert.equal(Buffer.from(artifact.childBase64, 'base64').toString('utf16le'), artifact.source)
})

// parent只負責啟動一個固定child；child成功與失敗各只有一個Console輸出點。
test('ntfs-guard emits exactly one success line and one stage-scoped unavailable line', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  assert.equal(artifact.successLine, ntfsGuardSuccessLine)
  assert.equal(artifact.expectedStdout, ntfsGuardSuccessLine)
  assert.equal(artifact.unavailablePrefix, 'receiver_windows_ntfs_guard_unavailable,stage=')
  assert.equal((artifact.source.match(/\[Console\]::Write\(/g) || []).length, 2)
  assert.equal((artifact.commandLine.match(/\[Console\]::Write\(/g) || []).length, 2)
  assert.equal(artifact.source.includes(ntfsGuardSuccessLine.slice(0, -1)), true)
  assert.equal(artifact.source.includes(artifact.unavailablePrefix), true)
  assert.equal(
    artifact.source.includes("',terminalUse=stop,receiverStarted=False' + [char]10"),
    true,
  )
  assert.equal(artifact.commandLine.includes('stage=child_launch'), true)
  assert.equal(artifact.commandLine.includes('stage=child_exit'), true)
  assert.equal(/^[\x20-\x7e]+\n$/.test(artifact.successLine), true)
  assert.equal(Buffer.byteLength(artifact.successLine, 'utf8') <= 256, true)
  assert.equal(artifact.source.includes('receiver_native_diagnostic,'), false)
  assert.equal(artifact.source.includes('receiver_native_load_only_output_v1'), false)
})

// stage只能是凍結白名單；child的失敗行不得回顯exception、路徑、SID或ACL內容。
test('ntfs-guard uses only the fixed stage whitelist and never prints raw failure data', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  assert.deepEqual(artifact.stages, ntfsGuardStages)
  const assigned = [...artifact.source.matchAll(/\$rdwebGuardStage = '([^']+)'/g)].map(
    (match) => match[1],
  )
  assert.deepEqual([...new Set(assigned)].sort(), [...ntfsGuardStageAssignments].sort())
  assert.equal(assigned.length, ntfsGuardStageAssignments.length)
  for (const stage of assigned) assert.equal(ntfsGuardStageAssignments.includes(stage), true)
  for (const stage of ntfsGuardStages) {
    assert.equal(
      artifact.stageStdout.includes(
        artifact.unavailablePrefix + stage + ',terminalUse=stop,receiverStarted=False\n',
      ),
      true,
    )
  }
  assert.equal(
    artifact.source.includes("$_.Exception.Message -ceq 'host_capability_unavailable'"),
    true,
  )
  for (const forbidden of [
    'Write-Host',
    'Write-Error',
    'Write-Warning',
    '$rdwebGuardRoot) +',
    '$rdwebGuardOwner) +',
    '$_.Exception.Message +',
    '$_.Exception +',
  ]) {
    assert.equal(artifact.source.includes(forbidden), false, forbidden)
  }
})

// 只建兩個空目錄；不得建檔、複製、junction、刪除或啟動receiver程序。
test('ntfs-guard creates only the two approved empty directories and never deletes or copies', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  const { source } = artifact
  assert.equal(source.includes("$rdwebGuardPositive = Join-Path $rdwebGuardRoot 'positive'"), true)
  assert.equal(source.includes("$rdwebGuardNegative = Join-Path $rdwebGuardRoot 'negative'"), true)
  assert.equal(source.includes('New-OwnerOnlyDirectory $rdwebGuardPositive $rdwebGuardOwner'), true)
  assert.equal(source.includes('New-OwnerOnlyDirectory $rdwebGuardNegative $rdwebGuardOwner'), true)
  for (const forbidden of [
    'New-Item',
    'Copy-Item',
    'Move-Item',
    'Remove-Item',
    'Remove-Variable',
    'Start-Process',
    'Invoke-ReceiverStart',
    'Invoke-ReceiverChild',
    'node.exe',
    'receiver.mjs',
    'Invoke-WebRequest',
    'HttpClient',
    'Unblock-File',
    '-Bypass',
    'Add-Type',
    'Junction',
    'Get-ChildItem',
    'Resolve-Path',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
  for (const forbidden of [
    'New-Item',
    'Copy-Item',
    'Move-Item',
    'Remove-Item',
    'Start-Process',
    'node.exe',
    'receiver.mjs',
    'Invoke-WebRequest',
    'HttpClient',
    'Unblock-File',
    '-Bypass',
    'Junction',
    'Get-ChildItem',
    'Resolve-Path',
    'Set-ExecutionPolicy',
  ]) {
    assert.equal(artifact.commandLine.includes(forbidden), false, forbidden)
  }
  assert.equal(source.includes('artifactsRetained=True'), true)
  assert.equal(source.includes('resourcesClosed=True'), true)
  assert.equal(source.includes('receiverStarted=False'), true)
})

// 必須用真入口載入的guard；正向接受、同owner負向以固定錯誤拒絕。
test('ntfs-guard exercises the real private-path guard with positive and negative ACLs', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  const { source } = artifact
  assert.equal(
    source.includes('Assert-HostPrivatePath $rdwebGuardPositive $true $rdwebGuardOwner'),
    true,
  )
  assert.equal(
    source.includes('Assert-HostPrivatePath $rdwebGuardNegative $true $rdwebGuardOwner'),
    true,
  )
  assert.equal(source.includes("'S-1-5-32-545'"), true)
  assert.equal((source.match(/AreAccessRulesProtected/g) || []).length >= 2, true)
  assert.equal(source.includes('AddAccessRule'), true)
  assert.equal(source.includes('Set-Acl'), false)
  assert.equal(source.includes("$_.Exception.Message -ceq 'host_capability_unavailable'"), true)
  assert.equal(source.includes('$rdwebGuardRejected'), true)
  assert.equal(
    source.indexOf('Assert-HostPrivatePath $rdwebGuardPositive') <
      source.indexOf('Assert-HostPrivatePath $rdwebGuardNegative'),
    true,
  )
  assert.equal(
    source.indexOf('New-OwnerOnlyDirectory $rdwebGuardNegative') <
      source.indexOf('Assert-HostPrivatePath $rdwebGuardNegative'),
    true,
  )
  assert.equal(source.includes('Assert-LocalNtfsPath $rdwebGuardPackage'), true)
  assert.equal(source.includes('Assert-RegularFile $rdwebGuardEntry'), true)
  assert.equal(source.includes('Assert-RegularFile $rdwebGuardSupervisor'), true)
  assert.equal(source.includes('. $rdwebGuardEntry'), true)
  assert.equal(source.includes('Invoke-ReceiverStart'), false)
  assert.equal(source.includes('Get-FileHash'), true)
  assert.equal(source.includes(artifact.entrySha256), true)
  assert.equal(source.includes(artifact.supervisorSha256), true)
  assert.equal(source.includes('7455'), true)
  assert.equal(source.includes('9816'), true)
  assert.equal(source.indexOf('Get-FileHash') < source.indexOf('. $rdwebGuardEntry'), true)
})

// 負向ACL只更新Access section，避免protected owner-only DACL上的Set-Acl完整descriptor失敗。
test('ntfs-guard persists the negative ACL with an access-only model', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  const { source } = artifact
  assert.equal(source.includes('Set-Acl'), false)
  assert.equal(
    source.includes(
      '$rdwebGuardNegativeItem.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)',
    ),
    true,
  )
  assert.equal(
    source.includes('$rdwebGuardNegativeItem.SetAccessControl($rdwebGuardNegativeAcl)'),
    true,
  )
  assert.equal(
    source.includes('$rdwebGuardNegativeItem = Get-Item -LiteralPath $rdwebGuardNegative'),
    true,
  )
  assert.equal(
    source.includes('$rdwebGuardGroupBefore = (Get-Acl -LiteralPath $rdwebGuardNegative).GetGroup'),
    true,
  )
  assert.equal(source.includes('$rdwebGuardNegativeAcl.GetAuditRules'), true)
  assert.equal(source.includes('$null -ne $rdwebGuardNegativeAcl.GetOwner'), true)
  assert.equal(source.includes('$null -ne $rdwebGuardNegativeAcl.GetGroup'), true)
  assert.equal(
    source.includes('GetOwner([Security.Principal.SecurityIdentifier]) -ne $rdwebGuardOwner'),
    true,
  )
  assert.equal(
    source.includes('GetGroup([Security.Principal.SecurityIdentifier]) -ne $rdwebGuardGroupBefore'),
    true,
  )
  assert.equal(source.includes('$rdwebGuardRule.IsInherited'), true)
  assert.equal(source.includes('$rdwebGuardOwnerAllow'), true)
  assert.equal(source.includes('$rdwebGuardUsersAllow'), true)
  assert.equal(source.includes('$rdwebGuardRules.Count -ne 2'), true)
  assert.equal(source.includes('[Security.AccessControl.FileSystemRights]::FullControl'), true)
  assert.equal(
    source.includes(
      '[Security.AccessControl.FileSystemRights]::Read -bor [Security.AccessControl.FileSystemRights]::Synchronize',
    ),
    true,
  )
  assert.equal(source.includes('EnableTokenPrivilege'), false)
  assert.equal(source.includes('SeSecurityPrivilege'), false)
  assert.equal(source.includes('SeRestorePrivilege'), false)
  assert.equal(source.includes('SetOwner'), false)
  assert.equal(source.includes('SetGroup'), false)
  assert.equal(
    source.indexOf('$rdwebGuardNegativeItem.GetAccessControl') <
      source.indexOf('$rdwebGuardNegativeAcl.AddAccessRule'),
    true,
  )
  assert.equal(
    source.indexOf('$rdwebGuardNegativeAcl.AddAccessRule') <
      source.indexOf('$rdwebGuardNegativeItem.SetAccessControl'),
    true,
  )
  assert.equal(
    source.indexOf('$rdwebGuardNegativeItem.SetAccessControl') <
      source.indexOf('$rdwebGuardNegativeAcl = Get-Acl -LiteralPath $rdwebGuardNegative'),
    true,
  )
  assert.equal(source.includes("$rdwebGuardStage = 'negative_create'"), true)
})

// 路徑固定且root已存在即fail closed；不得用萬用字元搜尋或重用舊產物。
test('ntfs-guard fixes the package and root paths and rejects a pre-existing root', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  assert.equal(artifact.rootName, 'rdweb receiver NTFS guard 公開 20261025-02')
  assert.equal(
    artifact.packageRoot,
    'rdweb-receiver-download-20261024-01\\unpacked-01\\rdweb-test-receiver-v24.22.1-win-x64',
  )
  assert.equal(artifact.source.includes(artifact.rootName), true)
  assert.equal(artifact.source.includes(artifact.packageRoot), true)
  assert.equal(
    artifact.source.includes(
      'if ([IO.Directory]::Exists($rdwebGuardRoot) -or [IO.File]::Exists($rdwebGuardRoot))',
    ),
    true,
  )
  assert.equal(artifact.source.includes("$rdwebGuardStage = 'root_exists'"), true)
  assert.equal(artifact.source.includes("'portable\\start-windows-test-receiver.ps1'"), true)
  assert.equal(artifact.source.includes("'start-windows-test-receiver.ps1'"), true)
  assert.equal(artifact.source.includes('Get-ChildItem'), false)
  assert.equal(artifact.source.includes('Resolve-Path'), false)
})

// 本artifact只新增自身來源，不能改動既有parent／handoff或七份歷史pins。
test('ntfs-guard pins its own deterministic source and leaves every historical pin intact', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  assert.equal(artifact.utf8Bytes, Buffer.byteLength(artifact.source, 'utf8'))
  assert.equal(artifact.utf16Units, artifact.source.length)
  assert.equal(artifact.sha256, createHash('sha256').update(artifact.source, 'utf8').digest('hex'))
  assert.equal(/^[0-9a-f]{64}$/.test(artifact.sha256), true)
  assert.equal(artifact.source.includes('\r') || artifact.source.includes('\0'), false)
  assert.equal(artifact.source.endsWith('\n'), true)
  assert.equal(artifact.source.length < 16000, true)
  assert.equal(artifact.entryBytes, 7455)
  assert.equal(
    artifact.entrySha256,
    'd84c60ed6a70751f82e71ef7c53735a52d89e0d8a94c424779e9373359324c09',
  )
  assert.equal(artifact.supervisorBytes, 9816)
  assert.equal(
    artifact.supervisorSha256,
    '51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2',
  )
  assert.equal(artifact.commandLineUtf16Units, artifact.commandLine.length)
  assert.equal(artifact.commandLineUtf16Units < 32766, true)
  assert.equal(artifact.argumentUtf16Units < 32766, true)
  assert.equal(
    artifact.commandLine.includes(
      '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand',
    ),
    true,
  )
  assert.equal(
    artifact.commandLine.includes(
      '"$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
    ),
    true,
  )
  assert.equal(
    createHash('sha256')
      .update(value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact().source)
      .digest('hex'),
    'cb1de8d3d0302dca1029fbb6d40fb15f975abb291995792be73d620c9b53a0bf',
  )
  const handoff = value.createNativeProbePowerShellHandoffArtifact()
  assert.equal(
    handoff.stage1Sha256,
    'ac86248ddccb37b3f9979a3e1900e9a59cdb56ba2d3b26fe5410af475ba14d5b',
  )
  assert.equal(
    handoff.stage2Sha256,
    '8b3bda5b8aa2fbe672e04bdc91794dfe0f1a46d4cdd52f73ade6a3953169e845',
  )
  for (const [name, pin] of [
    [
      'createNativeProbePowerShellAdapterArtifact',
      '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f',
    ],
    [
      'createNativeProbePowerShellSelfTestArtifact',
      'ab88c6293129b9e74aae555c67c1b89f2509df47f2ee4da0949e38085fd96fac',
    ],
    [
      'createNativeProbePowerShellDiagnosticSelfTestArtifact',
      'f038a7310d6883c8677333eb27a3b4830dc2bd3580eac39ceb1045c3f443a85a',
    ],
    [
      'createNativeProbePowerShellC04ProbeArtifact',
      '2d4f1c89aa010b2df57117b8e2815892cf34e123fee59c11b6b77694431bb09d',
    ],
    [
      'createNativeProbePowerShellTypeFixedAdapterArtifact',
      'bfb93ed20519623ea1c2de54062156c71f48c47093cb77cd48ff046dae80ca7d',
    ],
    [
      'createNativeProbePowerShellTypeFixedSelfTestArtifact',
      'bebd3ae1d3012b51ae6d2c922d5cb1ee11c06e982fc241ecfa105a164a033eca',
    ],
    [
      'createNativeProbePowerShellLoadOnlySupervisorArtifact',
      'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e',
    ],
  ]) {
    assert.equal(createHash('sha256').update(value[name]().source).digest('hex'), pin)
  }
})

// 生成器不得讀取呼叫端輸入，且重複呼叫要得到相同、凍結的來源與命令列。
test('ntfs-guard is deterministic, frozen and rejects supplied arguments', async () => {
  const value = await ntfsGuardApi()
  const first = value.createNativeProbePowerShellNtfsGuardArtifact()
  const second = value.createNativeProbePowerShellNtfsGuardArtifact()
  assert.deepEqual(second, first)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.stages), true)
  assert.equal(Object.isFrozen(first.stageStdout), true)
  assert.throws(() => {
    first.source = 'PUBLIC_CHANGED'
  }, TypeError)
  let touched = 0
  const input = {
    // 未知來源getter不能在拒絕前執行。
    get source() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
    // 不能把未知輸入轉成來源或路徑。
    toString() {
      touched++
      return 'PUBLIC_UNTRUSTED'
    },
  }
  for (const supplied of [undefined, null, '', 0, false, input, Symbol('PUBLIC')]) {
    assert.throws(() => value.createNativeProbePowerShellNtfsGuardArtifact(supplied), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
})

// child先驗自身PS5.1／x64／非管理員與五scope基線，僅改自己的Process後再還原。
test('ntfs-guard child applies and restores only its own process policy', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  const { source, commandLine } = artifact
  assert.equal(source.includes('$PSVersionTable.PSVersion.Major -ne 5'), true)
  assert.equal(source.includes('$PSVersionTable.PSVersion.Minor -ne 1'), true)
  assert.equal(source.includes("$PSVersionTable.PSEdition -cne 'Desktop'"), true)
  assert.equal(source.includes('[Environment]::Is64BitProcess'), true)
  assert.equal(source.includes("$Host.Name -cne 'ConsoleHost'"), true)
  assert.equal(source.includes('LanguageMode'), true)
  assert.equal(source.includes('GetApartmentState'), true)
  assert.equal(source.includes('WindowsPrincipal'), true)
  assert.equal(source.includes('WindowsBuiltInRole]::Administrator'), true)
  assert.equal(
    source.includes("'Process','CurrentUser','LocalMachine','UserPolicy','MachinePolicy'"),
    true,
  )
  assert.equal((source.match(/Get-ExecutionPolicy/g) || []).length >= 2, true)
  assert.equal(source.includes("Assert-RdwebGuardPolicy 'Undefined' 'Restricted'"), true)
  assert.equal(source.includes("Assert-RdwebGuardPolicy 'RemoteSigned' 'RemoteSigned'"), true)
  assert.equal(
    source.includes('Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force'),
    true,
  )
  assert.equal(
    source.includes('Set-ExecutionPolicy -Scope Process -ExecutionPolicy Undefined -Force'),
    true,
  )
  assert.equal((source.match(/Set-ExecutionPolicy/g) || []).length, 2)
  assert.equal(source.includes('$rdwebGuardPolicyChanged = $true'), true)
  assert.equal(source.includes('$rdwebGuardPolicyChanged = $false'), true)
  assert.equal(source.includes('finally {'), true)
  assert.equal(source.includes("$rdwebGuardFailure = 'policy_baseline'"), true)
  assert.equal(source.includes("$rdwebGuardFailure = 'resources_close'"), true)
  assert.equal(
    source.includes('if ($null -eq $rdwebGuardFailure) { $rdwebGuardFailure = $rdwebGuardStage }'),
    true,
  )
  assert.equal(
    source.indexOf('$rdwebGuardPolicyChanged = $true') <
      source.indexOf('Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned'),
    true,
  )
  assert.equal(
    source.indexOf('finally {') <
      source.indexOf('if ($null -eq $rdwebGuardFailure -and $rdwebGuardSuccess)'),
    true,
  )
  assert.equal(
    source.indexOf('finally {') <
      source.indexOf("',terminalUse=stop,receiverStarted=False' + [char]10"),
    true,
  )
  assert.equal(source.includes('Set-ExecutionPolicy -Scope CurrentUser'), false)
  assert.equal(source.includes('Set-ExecutionPolicy -Scope LocalMachine'), false)
  assert.equal(source.includes('Set-ExecutionPolicy -Scope UserPolicy'), false)
  assert.equal(source.includes('Set-ExecutionPolicy -Scope MachinePolicy'), false)
  assert.equal(source.includes('-ExecutionPolicy Bypass'), false)
  assert.equal(source.includes('-ExecutionPolicy Unrestricted'), false)
  assert.equal(source.includes('Set-ExecutionPolicy -ExecutionPolicy'), false)
  assert.equal(commandLine.includes('Set-ExecutionPolicy'), false)
})

// parent只啟動一個固定child，不自行載入檔案、不改政策、不啟動receiver。
test('ntfs-guard launches exactly one fixed child and never loads files in the parent', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  const { commandLine } = artifact
  assert.equal((commandLine.match(/powershell\.exe/g) || []).length, 1)
  assert.equal(
    commandLine.includes('$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'),
    true,
  )
  assert.equal(
    commandLine.includes(
      '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand',
    ),
    true,
  )
  assert.equal(commandLine.includes(artifact.childBase64), true)
  assert.equal(commandLine.includes('. $rdwebGuardEntry'), false)
  assert.equal(commandLine.includes('Get-FileHash'), false)
  assert.equal(commandLine.includes('New-OwnerOnlyDirectory'), false)
  assert.equal(commandLine.includes('Assert-HostPrivatePath'), false)
  assert.equal(commandLine.includes('receiver_native_diagnostic,'), false)
  assert.equal(commandLine.includes('child_launch'), true)
  assert.equal(commandLine.includes('child_exit'), true)
  assert.equal(commandLine.includes('$LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2'), true)
  assert.equal(commandLine.includes('[Console]::Write'), true)
})

// 輸出不得被既有canonical parser當成診斷證據，且成功行需有界ASCII。
test('ntfs-guard output is bounded ASCII and separate from the native diagnostic parser', async () => {
  const value = await ntfsGuardApi()
  const artifact = value.createNativeProbePowerShellNtfsGuardArtifact()
  assert.equal(/^[\x20-\x7e]+\n$/.test(artifact.successLine), true)
  assert.equal(Buffer.byteLength(artifact.successLine, 'utf8') <= 256, true)
  assert.equal(/^[\x20-\x7e]+$/.test(artifact.unavailablePrefix), true)
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.successLine), unknown())
  assert.equal(artifact.source.includes('receiver_native_diagnostic,'), false)
  assert.equal(artifact.successLine.includes('receiverStarted=False'), true)
  assert.equal(artifact.successLine.includes('resourcesClosed=True'), true)
  assert.equal(artifact.successLine.includes('artifactsRetained=True'), true)
  for (const line of artifact.stageStdout) {
    assert.equal(/^[\x20-\x7e]+\n$/.test(line), true)
    assert.equal(Buffer.byteLength(line, 'utf8') <= 256, true)
  }
})

// 新能力缺少時以斷言RED顯示，不以import例外或PS模擬器替代。
async function copyContractsApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellCopyContractsArtifact, 'function')
  return value
}

// 本測試只確認真生成邊界提供獨立非空雙端來源，不呼叫PS或建立fixture。
test('copy-contracts generates nonempty supervised parent and child with native verification disabled', async () => {
  const value = await copyContractsApi()
  const artifact = value.createNativeProbePowerShellCopyContractsArtifact()
  assert.equal(artifact.purpose, 'receiver_native_copy_contracts_v1')
  assert.equal(typeof artifact.source, 'string')
  assert.equal(artifact.source.length > 0, true)
  assert.equal(typeof artifact.childSource, 'string')
  assert.equal(artifact.childSource.length > 0, true)
  assert.notEqual(artifact.source, artifact.childSource)
  assert.equal(artifact.nativeVerified, false)
  assert.equal(artifact.transport, 'interactive_ram_only')
  assert.equal(artifact.encodedCommandSupported, false)
})

// 獨立公開case原碼是生成交接的oracle，不模擬PowerShell或檔案系統行為。
const copyCaseBodies = [
  `  Copy-PrivateSetting $copySource $copyDestination
  Assert-CopyFixture $copySource 8192 65
  Assert-CopyFixture $copyDestination 8192 65
`,
  `  Assert-CopyRejected { Copy-PrivateSetting $copySource $copyExisting }
  Assert-CopyFixture $copySource 8192 65
  Assert-CopyFixture $copyExisting 16 67
`,
  `  Assert-CopyRejected { Copy-PrivateSetting $copyLarge $copyOversizeDestination }
  Assert-CopyFixture $copyLarge 8193 66
  Assert-CopyAbsent $copyOversizeDestination
`,
  `  Assert-CopyAbsent $copyMissingSource
  Assert-CopyRejected { Copy-PrivateSetting $copyMissingSource $copyMissingDestination }
  Assert-CopyAbsent $copyMissingSource
  Assert-CopyAbsent $copyMissingDestination
`,
]

// metadata不能沿用舊child／舊位置或只算Base64而忽略exe與引號容量。
test('copy-contracts binds actual sources, parent adapter and the complete child command capacity', async () => {
  const value = await copyContractsApi()
  const artifact = value.createNativeProbePowerShellCopyContractsArtifact()
  for (const [source, bytes, units, pin] of [
    [artifact.source, artifact.utf8Bytes, artifact.utf16Units, artifact.sha256],
    [artifact.childSource, artifact.childUtf8Bytes, artifact.childUtf16Units, artifact.childSha256],
  ]) {
    assert.equal(typeof source, 'string')
    assert.equal(source.length > 0, true)
    assert.equal(bytes, Buffer.byteLength(source, 'utf8'))
    assert.equal(units, source.length)
    assert.equal(pin, createHash('sha256').update(source, 'utf8').digest('hex'))
    assert.equal(source.endsWith('\n'), true)
    assert.equal(source.includes('\r') || source.includes('\0'), false)
  }
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    artifact.source.slice(artifact.adapterOffset, artifact.adapterOffset + 6212),
    adapter.source,
  )
  assert.equal(artifact.childAdapterOffset, null)
  assert.equal(artifact.childAdapterUnits, 0)
  assert.equal(
    artifact.source.slice(
      artifact.childSourceOffset,
      artifact.childSourceOffset + artifact.childUtf16Units,
    ),
    artifact.childSource,
  )
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(artifact.childSource, 'utf16le').toString('base64')
  assert.equal(artifact.childArguments, args)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound, 512 + 3 + args.length)
  assert.equal(artifact.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.equal(artifact.commandLineLimit, 32766)
  assert.equal(artifact.maxExecutableUtf16Units, 512)
})

// 移除新child、pin、case stage白名單與用途旗標後，parent須完整還原原監督器。
test('copy-contracts retains every original parent policy, owned-process, deadline and cleanup guard', async () => {
  const value = await copyContractsApi()
  const artifact = value.createNativeProbePowerShellCopyContractsArtifact()
  const baseline = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  let restored = artifact.source
  for (const [generated, original] of [
    [artifact.childSource, baseline.childSource],
    [artifact.childSha256, '21f0c3563ae7469fc0f842d63f00bb5fd8d9c747787f4bb131c22c4d53b3394e'],
    [
      "@('unknown', 'child_policy', 'child_parse', 'root_absence', 'private_create', 'private_guard', 'copy', 'child_cleanup')",
      "@('unknown', 'child_policy', 'child_parse', 'child_cleanup')",
    ],
    [
      'Get-Variable -Name RdwebReceiverCopyContracts20261025Once',
      'Get-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
    ],
    [
      'New-Variable -Name RdwebReceiverCopyContracts20261025Once',
      'New-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
    ],
  ]) {
    const offset = restored.indexOf(generated)
    assert.equal(offset >= 0, true)
    assert.equal(restored.lastIndexOf(generated), offset)
    restored = restored.slice(0, offset) + original + restored.slice(offset + generated.length)
  }
  assert.equal(restored, baseline.source)
  assert.equal(
    createHash('sha256').update(restored).digest('hex'),
    'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e',
  )
  assert.equal(artifact.onceFlag, 'RdwebReceiverCopyContracts20261025Once')
  assert.equal(artifact.totalBudgetMs, 20000)
  assert.equal(artifact.normalBudgetMs, 18000)
  assert.equal(artifact.cleanupBudgetMs, 2000)
  assert.equal(artifact.stdoutMaxBytes, 1024)
  assert.equal(artifact.stderrMaxBytes, 128)
})

// 真正生成的每個case必須呼叫原複製函數並回驗來源／目的，不可只回合成成功。
test('copy-contracts emits all four exact public case bodies with immutable source spans', async () => {
  const value = await copyContractsApi()
  const artifact = value.createNativeProbePowerShellCopyContractsArtifact()
  assert.equal(Array.isArray(artifact.caseMap), true)
  assert.deepEqual(
    artifact.caseMap.map((item) => item.id),
    ['copy_8192', 'existing', 'oversize_8193', 'missing'],
  )
  for (const [index, item] of artifact.caseMap.entries()) {
    assert.equal(
      artifact.childSource.slice(item.offset, item.offset + item.units),
      copyCaseBodies[index],
    )
    assert.equal(item.units, copyCaseBodies[index].length)
    assert.equal(item.sha256, createHash('sha256').update(copyCaseBodies[index]).digest('hex'))
    assert.equal(item.stage, 'copy')
    assert.equal(artifact.childSource.indexOf(copyCaseBodies[index]), item.offset)
    assert.equal(artifact.childSource.lastIndexOf(copyCaseBodies[index]), item.offset)
  }
  assert.deepEqual(artifact.fixturePlan, [
    { name: 'source.bin', bytes: 8192, fill: 65, creation: 'fixture' },
    { name: 'existing.bin', bytes: 16, fill: 67, creation: 'fixture' },
    { name: 'large.bin', bytes: 8193, fill: 66, creation: 'fixture' },
    { name: 'copied.bin', bytes: 8192, fill: 65, creation: 'copy' },
    { name: 'oversize-destination.bin', bytes: 0, fill: null, creation: 'absent' },
    { name: 'missing-destination.bin', bytes: 0, fill: null, creation: 'absent' },
  ])
  assert.deepEqual(artifact.artifactBudget, {
    directories: 1,
    normalFiles: 4,
    normalBytes: 24593,
    maxFiles: 6,
    maxBytes: 32786,
  })
})

// 生成的I/O界線限定新root、CreateNew、普通私有路徑、有界比對與保留產物。
test('copy-contracts emits private fixture guards and bounded resource-safe helpers without cleanup deletion', async () => {
  const value = await copyContractsApi()
  const artifact = value.createNativeProbePowerShellCopyContractsArtifact()
  const source = artifact.childSource
  assert.equal(artifact.rootName, 'rdweb receiver Copy 公開 20261025-01')
  assert.equal(source.includes(artifact.rootName), true)
  for (const code of [
    "  $copyStage = 'root_absence'; $copyReason = 'guard_rejected'\n",
    '  Assert-CopyAbsent $copyRoot\n',
    '  New-OwnerOnlyDirectory $copyRoot $copyOwner\n',
    '  Assert-HostPrivatePath $copyRoot $true $copyOwner\n',
    '  if (-not $copyAcl.AreAccessRulesProtected',
    '[IO.FileMode]::CreateNew',
    '$stream.Length -ne $Size',
    'if ($read -ne 1 -or $buffer[0] -ne $Fill)',
    'if ($stream.ReadByte() -ne -1)',
    '$copyResources.Fault = $true',
    '$stream.Dispose()',
    '[Array]::Clear($buffer, 0, $buffer.Length)',
    "$_.Exception.Message -ceq 'receiver_unavailable'",
  ])
    assert.equal(source.includes(code), true)
  for (const forbidden of [
    'Remove-Item',
    '[IO.File]::Delete',
    '[IO.Directory]::Delete',
    'Set-Acl',
    'Junction',
    'Copy-Item',
    'Invoke-ReceiverStart',
    'Claim-ReceiverLaunch',
    'node.exe',
    'Get-ChildItem',
    'WriteAllBytes',
    'ReadAllBytes',
  ]) {
    assert.equal(source.includes(forbidden), false)
  }
  assert.equal(source.includes('function Copy-PrivateSetting'), false)
  assert.equal(source.includes('. (Join-Path $copyPackage'), true)
})

// child只回自身owner範圍且exit0要經四case、政策還原與資源全關；parent重驗wire。
test('copy-contracts produces schema-compatible partial child wires and complete parent expectation', async () => {
  const value = await copyContractsApi()
  const artifact = value.createNativeProbePowerShellCopyContractsArtifact()
  assert.equal(
    artifact.expectedStdout,
    'receiver_native_diagnostic,{"version":1,"phase":"complete","reason":"none","childStart":"confirmed","childExit":"confirmed","childPolicyRestore":"confirmed","parentPolicyVerify":"confirmed","resourcesClose":"confirmed"}\n',
  )
  assert.equal(
    artifact.expectedChildStdout,
    'receiver_native_diagnostic,{"version":1,"phase":"unknown","reason":"unknown","childStart":"unknown","childExit":"unknown","childPolicyRestore":"confirmed","parentPolicyVerify":"unknown","resourcesClose":"confirmed"}\n',
  )
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedStdout), complete())
  assert.deepEqual(value.parseNativeProbeDiagnostic(artifact.expectedChildStdout), {
    ...unknown(),
    childPolicyRestore: 'confirmed',
    resourcesClose: 'confirmed',
  })
  assert.deepEqual(artifact.childEvidenceNames, ['childPolicyRestore', 'resourcesClose'])
  assert.deepEqual(artifact.parentEvidenceNames, ['childStart', 'childExit', 'parentPolicyVerify'])
  const source = artifact.childSource
  assert.equal(
    source.includes(
      'if ($copyDone -and -not $copyFailed -and $copyRestored -and $copyClosed) { exit 0 }',
    ),
    true,
  )
  assert.equal((source.match(/\[Console\]::Write\(/g) || []).length, 1)
  assert.equal(
    source.includes('Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned'),
    true,
  )
  assert.equal(
    source.includes('Set-ExecutionPolicy -Scope Process -ExecutionPolicy Undefined'),
    true,
  )
  assert.equal(source.includes("Assert-RdwebLoadPolicy 'Restricted'"), true)
  assert.equal(source.includes('if (-not $copyFailed)'), true)
  assert.equal(source.includes("$copyPhase = 'child_cleanup'"), true)
  for (const fixture of artifact.wireFixtures) {
    const parsed = value.parseNativeProbeDiagnostic(fixture.wire)
    assert.notDeepEqual(parsed, complete())
    assert.equal(parsed.childStart, 'unknown')
    assert.equal(parsed.childExit, 'unknown')
    assert.equal(parsed.parentPolicyVerify, 'unknown')
  }
  assert.deepEqual(
    artifact.wireFixtures.map((item) => item.label),
    ['child_ready', 'copy_rejected', 'child_cleanup_unconfirmed'],
  )
  assert.equal(value.parseNativeProbeDiagnostic(artifact.wireFixtures[1].wire).phase, 'copy')
  assert.equal(
    value.parseNativeProbeDiagnostic(artifact.wireFixtures[2].wire).childPolicyRestore,
    'unconfirmed',
  )
})

// 交接後不得改成原生已驗、換fixture、換case span或解除既有來源信任。
test('copy-contracts freezes its nested provenance and rejects caller-controlled inputs', async () => {
  const value = await copyContractsApi()
  const artifact = value.createNativeProbePowerShellCopyContractsArtifact()
  assert.deepEqual(value.createNativeProbePowerShellCopyContractsArtifact(), artifact)
  assert.equal(Object.isFrozen(artifact), true)
  for (const name of [
    'caseMap',
    'fixturePlan',
    'wireFixtures',
    'trustedSources',
    'childEvidenceNames',
    'parentEvidenceNames',
  ]) {
    assert.equal(Object.isFrozen(artifact[name]), true)
    for (const item of artifact[name])
      if (typeof item === 'object') assert.equal(Object.isFrozen(item), true)
  }
  assert.equal(Object.isFrozen(artifact.artifactBudget), true)
  assert.throws(() => {
    artifact.fixturePlan[0].bytes = 1
  }, TypeError)
  assert.throws(() => {
    artifact.nativeVerified = true
  }, TypeError)
  let touched = 0
  const input = {
    // 未知路徑getter在拒絕前不得被讀取。
    get path() {
      touched++
      return 'PUBLIC_PATH'
    },
    // 不將任何外部輸入轉型成程式或參數。
    toString() {
      touched++
      return 'PUBLIC_PATH'
    },
  }
  for (const arg of [undefined, null, input, '', false, 0, Symbol('PUBLIC')]) {
    assert.throws(() => value.createNativeProbePowerShellCopyContractsArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
})

// 本輪只追加source，保留接手時全部原函數與原測試；亦防止意外覆寫別的既有工作。
test('copy-contracts leaves the takeover source prefixes and later artifact pins unchanged', async () => {
  const value = await copyContractsApi()
  value.createNativeProbePowerShellCopyContractsArtifact()
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      90681,
      '288e6231d970ac35315cb09d747c799b885452248b062aa3fcf3c01559538f46',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      119613,
      '9863473b573d35164b569e85bf7c730eb34e534c6db7872692add5eba6441daa',
    ],
  ]) {
    const prefixBytes = readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes)
    assert.equal(prefixBytes.length, bytes)
    assert.equal(createHash('sha256').update(prefixBytes).digest('hex'), pin)
  }
  assert.equal(
    value.createNativeProbePowerShellNtfsGuardArtifact().sha256,
    'f80bd5c790cb10179093337f036f15691bca551bb646486c0cd37ddcad73a30a',
  )
  assert.equal(
    value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact().sha256,
    'cb1de8d3d0302dca1029fbb6d40fb15f975abb291995792be73d620c9b53a0bf',
  )
  const handoff = value.createNativeProbePowerShellHandoffArtifact()
  assert.equal(
    handoff.stage1Sha256,
    'ac86248ddccb37b3f9979a3e1900e9a59cdb56ba2d3b26fe5410af475ba14d5b',
  )
  assert.equal(
    handoff.stage2Sha256,
    '8b3bda5b8aa2fbe672e04bdc91794dfe0f1a46d4cdd52f73ade6a3953169e845',
  )
})

// 只驗生成的分類分支；不得把Parser檔案I/O或dot-source例外猜成語法錯誤。
test('copy-contracts reserves parse_rejected for explicit parser errors instead of unknown runtime failures', async () => {
  const value = await copyContractsApi()
  const { childSource } = value.createNativeProbePowerShellCopyContractsArtifact()
  assert.equal(
    childSource.includes("  $copyStage = 'child_parse'; $copyReason = 'unknown'\n"),
    true,
  )
  assert.equal(
    childSource.includes(
      "    if ($errors.Count -ne 0) { $copyReason = 'parse_rejected'; throw 'receiver_copy_rejected' }\n",
    ),
    true,
  )
  assert.equal(childSource.includes("  $copyReason = 'unknown'\n  . (Join-Path $copyPackage"), true)
})

// 缺生成器／解碼器必須先以斷言失敗，不把載入錯誤當成新增能力的RED。
async function copyStepsApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellCopyStepsArtifact, 'function')
  assert.equal(typeof value.parseNativeProbeCopyStepOutput, 'function')
  return value
}

// 操作oracle獨立手寫；少做、重排或把回驗合併到複製步驟都必須失敗。
const copyStepActions = [
  'New-CopyFixture $copySource 8192 65',
  'New-CopyFixture $copyExisting 16 67',
  'New-CopyFixture $copyLarge 8193 66',
  'Assert-CopyFixture $copySource 8192 65',
  'Assert-CopyFixture $copyExisting 16 67',
  'Assert-CopyFixture $copyLarge 8193 66',
  'Assert-CopyAbsent $copyDestination',
  'Assert-CopyAbsent $copyOversizeDestination',
  'Assert-CopyAbsent $copyMissingSource',
  'Assert-CopyAbsent $copyMissingDestination',
  'Copy-PrivateSetting $copySource $copyDestination',
  'Assert-CopyFixture $copySource 8192 65',
  'Assert-CopyFixture $copyDestination 8192 65',
  'Assert-CopyRejected { Copy-PrivateSetting $copySource $copyExisting }',
  'Assert-CopyFixture $copySource 8192 65',
  'Assert-CopyFixture $copyExisting 16 67',
  'Assert-CopyRejected { Copy-PrivateSetting $copyLarge $copyOversizeDestination }',
  'Assert-CopyFixture $copyLarge 8193 66',
  'Assert-CopyAbsent $copyOversizeDestination',
  'Assert-CopyAbsent $copyMissingSource',
  'Assert-CopyRejected { Copy-PrivateSetting $copyMissingSource $copyMissingDestination }',
  'Assert-CopyAbsent $copyMissingSource',
  'Assert-CopyAbsent $copyMissingDestination',
]
const copyStepReady =
  'receiver_native_diagnostic,{"version":1,"phase":"unknown","reason":"unknown","childStart":"unknown","childExit":"unknown","childPolicyRestore":"confirmed","parentPolicyVerify":"unknown","resourcesClose":"confirmed"}\n'
const copyStepFailure =
  'receiver_native_diagnostic,{"version":1,"phase":"copy","reason":"io_failed","childStart":"unknown","childExit":"unknown","childPolicyRestore":"confirmed","parentPolicyVerify":"unknown","resourcesClose":"unconfirmed"}\n'

// 空來源、偽原生成功或沿用舊root／旗標會破壞獨立離線候選的信任界線。
test('copy-steps generates independent nonempty sources without claiming native verification', async () => {
  const value = await copyStepsApi()
  const a = value.createNativeProbePowerShellCopyStepsArtifact()
  assert.equal(a.purpose, 'receiver_native_copy_steps_v1')
  for (const name of ['source', 'childSource', 'outputDecoderSource']) {
    assert.equal(typeof a[name], 'string')
    assert.equal(a[name].length > 0, true)
  }
  assert.equal(a.nativeVerified, false)
  assert.equal(a.rootName, 'rdweb receiver Copy steps 公開 20261025-01')
  assert.equal(a.onceFlag, 'RdwebReceiverCopySteps20261025Once')
  assert.notEqual(a.sha256, '9c865eef002b046c900a2e98f81d1df53d28705afdc838af426c1d084d1838f8')
})

// 以真生成輸出的span回收每一項操作，避免metadata列了23步但child漏執行或錯置。
test('copy-steps maps every original operation and verification to its own fixed source span', async () => {
  const value = await copyStepsApi()
  const a = value.createNativeProbePowerShellCopyStepsArtifact()
  assert.equal(Array.isArray(a.stepMap), true)
  assert.equal(a.stepMap.length, 23)
  let previousEnd = 0
  for (const [index, step] of a.stepMap.entries()) {
    const id = 'c' + String(index + 1).padStart(2, '0')
    const body = `  $copyStep = '${id}'\n  ${copyStepActions[index]}\n`
    assert.equal(step.id, id)
    assert.equal(a.childSource.slice(step.offset, step.offset + step.units), body)
    assert.equal(step.sha256, createHash('sha256').update(body).digest('hex'))
    assert.equal(step.offset >= previousEnd, true)
    previousEnd = step.offset + step.units
  }
  assert.deepEqual(
    a.caseMap.map((item) => item.steps),
    [
      ['c11', 'c12', 'c13'],
      ['c14', 'c15', 'c16'],
      ['c17', 'c18', 'c19'],
      ['c20', 'c21', 'c22', 'c23'],
    ],
  )
  assert.deepEqual(
    a.fixturePlan,
    value.createNativeProbePowerShellCopyContractsArtifact().fixturePlan,
  )
  assert.deepEqual(a.artifactBudget, {
    directories: 1,
    normalFiles: 4,
    normalBytes: 24593,
    maxFiles: 6,
    maxBytes: 32786,
  })
})

// 首失敗步驟在主catch鎖定；finally不得換成最後清理步驟或把step當exit0。
test('copy-steps captures the first failing operation without weakening cleanup and success gates', async () => {
  const value = await copyStepsApi()
  const a = value.createNativeProbePowerShellCopyStepsArtifact()
  const source = a.childSource
  assert.equal(source.includes("$copyStep = 'not_started'; $copyFirstStep = $null\n"), true)
  assert.equal(source.includes('; $copyFirstStep = $copyStep }\n'), true)
  assert.equal(source.includes("  $copyStep = 'complete'\n  $copyDone = $true\n"), true)
  assert.equal(
    source.includes('if ($null -ne $copyFirstStep) { $copyOutputStep = $copyFirstStep }'),
    true,
  )
  assert.equal(
    source.includes(
      'if ($copyDone -and -not $copyFailed -and $copyRestored -and $copyClosed) { exit 0 }',
    ),
    true,
  )
  const cleanup = source.slice(source.indexOf('finally {\n  if ($copyPolicyAttempted)'))
  assert.equal(/\$copy(?:First)?Step\s*=/.test(cleanup), false)
  assert.equal(source.includes('function Copy-PrivateSetting'), false)
})

// 真JS解碼器只消費兩行公開wire；合成失敗不得因政策已還原而補成complete。
test('copy-steps decodes canonical public success and every failure step with fixed semantics', async () => {
  const value = await copyStepsApi()
  const a = value.createNativeProbePowerShellCopyStepsArtifact()
  const ready = 'receiver_native_copy_step,step=complete\n' + copyStepReady
  assert.equal(a.expectedChildStdout, ready)
  assert.equal(a.expectedChildDiagnosticStdout, copyStepReady)
  const parsed = value.parseNativeProbeCopyStepOutput(ready)
  assert.equal(parsed.step, 'complete')
  assert.equal(parsed.frame, copyStepReady)
  assert.equal(parsed.diagnostic.phase, 'unknown')
  assert.equal(parsed.diagnostic.childExit, 'unknown')
  assert.deepEqual(value.parseNativeProbeCopyStepOutput(ready.replaceAll('\n', '\r\n')), parsed)
  for (const [index] of copyStepActions.entries()) {
    const step = 'c' + String(index + 1).padStart(2, '0')
    const wire = `receiver_native_copy_step,step=${step}\n` + copyStepFailure
    const decoded = value.parseNativeProbeCopyStepOutput(wire)
    assert.equal(decoded.step, step)
    assert.equal(decoded.diagnostic.phase, 'copy')
    assert.equal(decoded.diagnostic.resourcesClose, 'unconfirmed')
    assert.equal(Object.isFrozen(decoded) && Object.isFrozen(decoded.diagnostic), true)
    assert.equal(
      a.wireFixtures.some((fixture) => fixture.wire === wire),
      true,
    )
  }
})

// 未知／截斷／重複或跨欄位矛盾皆固定拒絕，不能回顯外部內容或呼叫getter。
test('copy-steps rejects malformed, extra, oversized and contradictory child output', async () => {
  const value = await copyStepsApi()
  const ready = 'receiver_native_copy_step,step=complete\n' + copyStepReady
  const failed = 'receiver_native_copy_step,step=c11\n' + copyStepFailure
  const bad = [
    '',
    copyStepReady,
    ready.slice(0, -1),
    ready + '\n',
    ready + copyStepReady,
    ready + 'PUBLIC_EXTRA\n',
    copyStepReady + 'receiver_native_copy_step,step=complete\n',
    ready.replace('step=complete', 'step=unknown'),
    ready.replace('step=complete', 'step=c01'),
    ready.replace('step=complete', 'step=COMPLETE'),
    ready.replace('step=complete', 'step=complete '),
    failed.replace('step=c11', 'step=c00'),
    failed.replace('step=c11', 'step=c24'),
    failed.replace('step=c11', 'step=complete'),
    failed.replace('step=c11', 'step=not_started'),
    failed.replace('"reason":"io_failed"', '"reason":"unknown"'),
    failed.replace('"resourcesClose":"unconfirmed"', '"resourcesClose":"confirmed"'),
    failed.replace('"childStart":"unknown"', '"childStart":"confirmed"'),
    failed.replace('"version":1', '"version":1,"version":1'),
    ready.replace('"phase":"unknown"', '"phase":"complete"'),
    ready.replace('"childPolicyRestore":"confirmed"', '"childPolicyRestore":"unconfirmed"'),
    ready.replace('complete\n', 'complete\r'),
    '\uFEFF' + ready,
    ready + '\0',
    'receiver_native_copy_step,step=' + 'c'.repeat(1024) + '\n' + copyStepFailure,
    null,
    undefined,
    false,
    0,
    Symbol('PUBLIC'),
  ]
  let touched = 0
  bad.push({
    // 未知物件不得被轉型或讀取屬性來猜測wire。
    toString() {
      touched++
      return ready
    },
  })
  for (const wire of bad) {
    assert.throws(() => value.parseNativeProbeCopyStepOutput(wire), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
})

// 前置失敗與清理失敗各有固定配對，complete步驟本身不表示政策／資源完整。
test('copy-steps separates preflight and cleanup failures from successful operation completion', async () => {
  const value = await copyStepsApi()
  const preflight =
    'receiver_native_copy_step,step=not_started\n' +
    copyStepFailure
      .replace('"phase":"copy"', '"phase":"private_guard"')
      .replace('"reason":"io_failed"', '"reason":"guard_rejected"')
  assert.equal(value.parseNativeProbeCopyStepOutput(preflight).step, 'not_started')
  const cleanup =
    'receiver_native_copy_step,step=complete\n' +
    copyStepFailure
      .replace('"phase":"copy"', '"phase":"child_cleanup"')
      .replace('"reason":"io_failed"', '"reason":"cleanup_unconfirmed"')
  assert.equal(
    value.parseNativeProbeCopyStepOutput(cleanup).diagnostic.resourcesClose,
    'unconfirmed',
  )
  for (const wire of [
    preflight.replace('not_started', 'c01'),
    cleanup.replace('complete\n', 'not_started\n'),
    cleanup.replace('"resourcesClose":"unconfirmed"', '"resourcesClose":"confirmed"'),
  ])
    assert.throws(() => value.parseNativeProbeCopyStepOutput(wire))
})

// 核對實際嵌入與完整exe／argv容量，不能因新診斷超長而換方式或省略case。
test('copy-steps binds real decoder, child and adapter sources within unchanged bounded transport', async () => {
  const value = await copyStepsApi()
  const a = value.createNativeProbePowerShellCopyStepsArtifact()
  for (const [source, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(Buffer.byteLength(source), bytes)
    assert.equal(source.length, units)
    assert.equal(createHash('sha256').update(source).digest('hex'), pin)
    assert.equal(source.includes('\r') || source.includes('\0'), false)
  }
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childUtf16Units),
    a.childSource,
  )
  assert.equal(
    a.source.slice(a.outputDecoderOffset, a.outputDecoderOffset + a.outputDecoderSource.length),
    a.outputDecoderSource,
  )
  assert.equal(
    createHash('sha256').update(a.outputDecoderSource).digest('hex'),
    a.outputDecoderSha256,
  )
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(a.childAdapterOffset, null)
  assert.equal(a.childAdapterUnits, 0)
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(a.childSource, 'utf16le').toString('base64')
  assert.equal(a.childArguments, args)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 512 + 3 + args.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.equal(a.stdoutMaxBytes, 1024)
  assert.equal(a.stderrMaxBytes, 128)
  assert.equal(a.totalBudgetMs, 20000)
  assert.equal(a.normalBudgetMs, 18000)
  assert.equal(a.cleanupBudgetMs, 2000)
  assert.equal(Buffer.byteLength(a.expectedChildStdout) <= 1024, true)
})

// 所有新增的parent差異逆向移除後必須還原原copy監督器，不只查幾個守衛字樣。
test('copy-steps preserves the original parent supervision outside the explicit decoder extension', async () => {
  const value = await copyStepsApi()
  const a = value.createNativeProbePowerShellCopyStepsArtifact()
  const baseline = value.createNativeProbePowerShellCopyContractsArtifact()
  let restored = a.source
  const edits = [
    [a.childSource, baseline.childSource],
    [a.childSha256, baseline.childSha256],
    [a.outputDecoderSource, ''],
    ["$loadCopyStep = 'unknown'\n", ''],
    [
      'Get-Variable -Name RdwebReceiverCopySteps20261025Once',
      'Get-Variable -Name RdwebReceiverCopyContracts20261025Once',
    ],
    [
      'New-Variable -Name RdwebReceiverCopySteps20261025Once',
      'New-Variable -Name RdwebReceiverCopyContracts20261025Once',
    ],
    [
      '  $copyFrame = ConvertFrom-RdwebCopyStepOutput $frame\n  $child = $copyFrame.Diagnostic; $frame = $copyFrame.Frame\n',
      '  $child = ConvertFrom-RdwebLoadFrame $frame\n',
    ],
    ['  $loadCopyStep = $copyFrame.Step\n', ''],
    ["  if ($loadCopyStep -cne 'complete' -or\n      $frame.Replace", '  if ($frame.Replace'],
    ["[Console]::Write('receiver_native_copy_step,step=' + $loadCopyStep + [char]10)\n", ''],
  ]
  for (const [generated, original] of edits) {
    const offset = restored.indexOf(generated)
    assert.equal(offset >= 0, true)
    assert.equal(restored.lastIndexOf(generated), offset)
    restored = restored.slice(0, offset) + original + restored.slice(offset + generated.length)
  }
  assert.equal(restored, baseline.source)
  assert.equal(
    createHash('sha256').update(restored).digest('hex'),
    '9c865eef002b046c900a2e98f81d1df53d28705afdc838af426c1d084d1838f8',
  )
  assert.equal(
    a.expectedStdout,
    baseline.expectedStdout + 'receiver_native_copy_step,step=complete\n',
  )
})

// 凍結契約、拒絕override與接手prefix保存，防止診斷順便覆寫既有候選／工作。
test('copy-steps rejects overrides and leaves all takeover bytes and historical pins intact', async () => {
  const value = await copyStepsApi()
  const a = value.createNativeProbePowerShellCopyStepsArtifact()
  for (const item of [a, a.stepMap, a.caseMap, a.wireFixtures, a.stepIds])
    assert.equal(Object.isFrozen(item), true)
  for (const item of [...a.stepMap, ...a.caseMap, ...a.wireFixtures])
    assert.equal(Object.isFrozen(item), true)
  for (const arg of [undefined, null, 'PUBLIC', 0, false, {}]) {
    assert.throws(() => value.createNativeProbePowerShellCopyStepsArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      105131,
      '37b469b32d4a19d1d06036fff606b29641cb88c2187f513635f1690c2d1c744f',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      135301,
      'c126e104eee7cf1d9e49a71d01c4a1bb34f89004e45074dd71fa35a73441cd0d',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  assert.equal(
    value.createNativeProbePowerShellCopyContractsArtifact().childSha256,
    '839d5b4d3aa586024a56c97bcd9328c4b7b7283e2731693460577b580d04a9e5',
  )
  assert.equal(
    value.createNativeProbePowerShellNtfsGuardArtifact().sha256,
    'f80bd5c790cb10179093337f036f15691bca551bb646486c0cd37ddcad73a30a',
  )
  assert.equal(
    value.createNativeProbePowerShellLoadOnlyOutputProbeArtifact().sha256,
    'cb1de8d3d0302dca1029fbb6d40fb15f975abb291995792be73d620c9b53a0bf',
  )
})

// 去除純診斷標記後須完整還原child，避免為補診斷改掉guard、helper或finally。
test('copy-steps preserves every original child operation, guard and cleanup outside fixed tracing', async () => {
  const value = await copyStepsApi()
  const a = value.createNativeProbePowerShellCopyStepsArtifact()
  const baseline = value.createNativeProbePowerShellCopyContractsArtifact()
  let restored = a.childSource
  for (let index = 1; index <= 23; index++) {
    restored = restored.replace(`  $copyStep = 'c${String(index).padStart(2, '0')}'\n`, '')
  }
  const output = `$copyOutputStep = $copyStep
if ($null -ne $copyFirstStep) { $copyOutputStep = $copyFirstStep }
if (@('not_started', 'complete', 'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16', 'c17', 'c18', 'c19', 'c20', 'c21', 'c22', 'c23') -cnotcontains $copyOutputStep) { exit 2 }
[Console]::Write('receiver_native_copy_step,step=' + $copyOutputStep + [char]10)
`
  for (const [generated, original] of [
    ["$copyStep = 'not_started'; $copyFirstStep = $null\n", ''],
    ["  $copyStep = 'complete'\n", ''],
    ['; $copyFirstStep = $copyStep }\n', ' }\n'],
    [output, ''],
    ['rdweb receiver Copy steps 公開 20261025-01', 'rdweb receiver Copy 公開 20261025-01'],
  ]) {
    const offset = restored.indexOf(generated)
    assert.equal(offset >= 0, true)
    assert.equal(restored.lastIndexOf(generated), offset)
    restored = restored.slice(0, offset) + original + restored.slice(offset + generated.length)
  }
  assert.equal(restored, baseline.childSource)
  assert.equal(
    createHash('sha256').update(restored).digest('hex'),
    '839d5b4d3aa586024a56c97bcd9328c4b7b7283e2731693460577b580d04a9e5',
  )
})

// 新API缺失須以斷言RED呈現，不透過import錯誤或PS環境缺失假冒回歸。
async function copyMissingApi() {
  const value = await copyStepsApi()
  assert.equal(typeof value.createNativeProbePowerShellCopyMissingSourceArtifact, 'function')
  return value
}

// 獨立手寫c21 oracle；只驗生成邊界，實際typed catch仍須Windows原生驗證。
const copyMissingStepBody = `  $copyStep = 'c21'
  # 缺少來源在原函數try之前拒絕；只接受缺檔型別與分類，不讀取錯誤文字。
  $copyMissingRejected = $false
  try { Copy-PrivateSetting $copyMissingSource $copyMissingDestination }
  catch [Management.Automation.ItemNotFoundException] {
    if ($_.CategoryInfo.Category -ne [Management.Automation.ErrorCategory]::ObjectNotFound) { throw }
    $copyMissingRejected = $true
  }
  if (-not $copyMissingRejected) { throw 'receiver_copy_rejected' }
`

// 新候選不得改舊root續跑或把新生成誤報為原生已驗。
test('copy-missing generates distinct nonempty sources with a fresh unexecuted scope', async () => {
  const value = await copyMissingApi()
  const a = value.createNativeProbePowerShellCopyMissingSourceArtifact()
  assert.equal(a.purpose, 'receiver_native_copy_missing_source_v1')
  for (const name of ['source', 'childSource']) {
    assert.equal(typeof a[name], 'string')
    assert.equal(a[name].length > 0, true)
  }
  assert.equal(a.rootName, 'rdweb receiver Copy missing 公開 20261025-01')
  assert.equal(a.onceFlag, 'RdwebReceiverCopyMissing20261025Once')
  assert.equal(a.nativeVerified, false)
  assert.equal(a.transport, 'interactive_ram_only')
  assert.equal(a.encodedCommandSupported, false)
  assert.notEqual(a.sha256, 'fe46f33095c8f836a6f356106e340eaab1acb33703685fd339c146aff549361e')
})

// 若正常返回可過關、分類錯誤不重拋或退回catch-all，精確c21輸出契約就會失敗。
test('copy-missing emits only the typed ObjectNotFound rejection at c21 and retains all other steps', async () => {
  const value = await copyMissingApi()
  const a = value.createNativeProbePowerShellCopyMissingSourceArtifact()
  const baseline = value.createNativeProbePowerShellCopyStepsArtifact()
  assert.equal(Array.isArray(a.stepMap), true)
  assert.equal(a.stepMap.length, 23)
  for (const [index, step] of a.stepMap.entries()) {
    const original = baseline.stepMap[index]
    assert.equal(step.id, original.id)
    const actual = a.childSource.slice(step.offset, step.offset + step.units)
    const want =
      step.id === 'c21'
        ? copyMissingStepBody
        : baseline.childSource.slice(original.offset, original.offset + original.units)
    assert.equal(actual, want)
    assert.equal(step.sha256, createHash('sha256').update(want).digest('hex'))
  }
  const missing = a.caseMap.find((item) => item.id === 'missing')
  assert.deepEqual(missing.steps, ['c20', 'c21', 'c22', 'c23'])
  const body = a.childSource.slice(missing.offset, missing.offset + missing.units)
  assert.equal(
    body,
    "  $copyStep = 'c20'\n  Assert-CopyAbsent $copyMissingSource\n" +
      copyMissingStepBody +
      "  $copyStep = 'c22'\n  Assert-CopyAbsent $copyMissingSource\n" +
      "  $copyStep = 'c23'\n  Assert-CopyAbsent $copyMissingDestination\n",
  )
})

// 只還原c21與新root就須逐字重建完整舊child，避免夾帶helper／政策／finally調整。
test('copy-missing reconstructs the entire previous child outside the single rejection contract', async () => {
  const value = await copyMissingApi()
  const a = value.createNativeProbePowerShellCopyMissingSourceArtifact()
  const baseline = value.createNativeProbePowerShellCopyStepsArtifact()
  const restored = a.childSource
    .replace(
      copyMissingStepBody,
      "  $copyStep = 'c21'\n  Assert-CopyRejected { Copy-PrivateSetting $copyMissingSource $copyMissingDestination }\n",
    )
    .replace(
      'rdweb receiver Copy missing 公開 20261025-01',
      'rdweb receiver Copy steps 公開 20261025-01',
    )
  assert.equal(restored, baseline.childSource)
  assert.equal(
    createHash('sha256').update(restored).digest('hex'),
    '09096ec6b6e5bcc2abd9ab8d5316012ce4f48e5f585c51b157e8ff35f2e63efc',
  )
})

// parent只能換child／pin／once旗標；型別拒絕修正不得改wire或監督成功門檻。
test('copy-missing preserves the whole previous parent and all output and cleanup gates', async () => {
  const value = await copyMissingApi()
  const a = value.createNativeProbePowerShellCopyMissingSourceArtifact()
  const baseline = value.createNativeProbePowerShellCopyStepsArtifact()
  let restored = a.source
  for (const [generated, original] of [
    [a.childSource, baseline.childSource],
    [a.childSha256, baseline.childSha256],
    [
      'Get-Variable -Name RdwebReceiverCopyMissing20261025Once',
      'Get-Variable -Name RdwebReceiverCopySteps20261025Once',
    ],
    [
      'New-Variable -Name RdwebReceiverCopyMissing20261025Once',
      'New-Variable -Name RdwebReceiverCopySteps20261025Once',
    ],
  ]) {
    const offset = restored.indexOf(generated)
    assert.equal(offset >= 0, true)
    assert.equal(restored.lastIndexOf(generated), offset)
    restored = restored.slice(0, offset) + original + restored.slice(offset + generated.length)
  }
  assert.equal(restored, baseline.source)
  assert.equal(
    createHash('sha256').update(restored).digest('hex'),
    'fe46f33095c8f836a6f356106e340eaab1acb33703685fd339c146aff549361e',
  )
  for (const name of [
    'outputDecoderSource',
    'outputDecoderSha256',
    'adapterSha256',
    'expectedStdout',
    'expectedChildStdout',
    'expectedChildDiagnosticStdout',
    'stdoutMaxBytes',
    'stderrMaxBytes',
    'totalBudgetMs',
    'normalBudgetMs',
    'cleanupBudgetMs',
  ]) {
    assert.equal(a[name], baseline[name])
  }
  assert.deepEqual(a.artifactBudget, baseline.artifactBudget)
  assert.deepEqual(a.fixturePlan, baseline.fixturePlan)
})

// c21變長後必須重算實際span與exe／argv容量，不能省c22／c23或用過期位置。
test('copy-missing rebases actual case sources and stays within the complete command-line bound', async () => {
  const value = await copyMissingApi()
  const a = value.createNativeProbePowerShellCopyMissingSourceArtifact()
  for (const [source, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(source.endsWith('\n'), true)
    assert.equal(source.includes('\r') || source.includes('\0'), false)
    assert.equal(Buffer.byteLength(source), bytes)
    assert.equal(source.length, units)
    assert.equal(createHash('sha256').update(source).digest('hex'), pin)
  }
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childUtf16Units),
    a.childSource,
  )
  assert.equal(
    a.source.slice(a.outputDecoderOffset, a.outputDecoderOffset + a.outputDecoderSource.length),
    a.outputDecoderSource,
  )
  assert.equal(a.childAdapterOffset, null)
  assert.equal(a.childAdapterUnits, 0)
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(a.childSource, 'utf16le').toString('base64')
  assert.equal(a.childArguments, args)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 512 + 3 + args.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  for (const item of a.caseMap) {
    const first = a.stepMap.find((step) => step.id === item.steps[0])
    const last = a.stepMap.find((step) => step.id === item.steps.at(-1))
    assert.equal(item.offset, first.offset)
    assert.equal(item.units, last.offset + last.units - first.offset)
    assert.equal(
      item.sha256,
      createHash('sha256')
        .update(a.childSource.slice(item.offset, item.offset + item.units))
        .digest('hex'),
    )
  }
})

// 不得藉新候選改寫任何接手內容、原包程式或歷史artifact，亦不接受外部override。
test('copy-missing freezes provenance, rejects overrides and preserves all takeover source bytes', async () => {
  const value = await copyMissingApi()
  const a = value.createNativeProbePowerShellCopyMissingSourceArtifact()
  for (const item of [a, a.stepMap, a.caseMap, ...a.stepMap, ...a.caseMap]) {
    assert.equal(Object.isFrozen(item), true)
  }
  let touched = 0
  const input = {
    // 生成器沒有外部設定介面，拒絕時不能觸碰未知getter。
    get rootName() {
      touched++
      return 'PUBLIC'
    },
    // 不接受把物件轉為PS來源或參數。
    toString() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const arg of [undefined, null, input, '', false, 0, Symbol('PUBLIC')]) {
    assert.throws(() => value.createNativeProbePowerShellCopyMissingSourceArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      117766,
      'b4d56fabd28e2ac4e1c4ead6a3c1501becbd2c3abbdd0f213613004c412bea7d',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      152846,
      '2aa3ee864abb71ba8debb8bd78439ad9ce77060117b42ad0bcd24beedc10844d',
    ],
  ]) {
    const bytesRead = readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes)
    assert.equal(createHash('sha256').update(bytesRead).digest('hex'), pin)
  }
  assert.equal(
    value.createNativeProbePowerShellCopyContractsArtifact().sha256,
    '9c865eef002b046c900a2e98f81d1df53d28705afdc838af426c1d084d1838f8',
  )
  assert.equal(
    value.createNativeProbePowerShellCopyStepsArtifact().sha256,
    'fe46f33095c8f836a6f356106e340eaab1acb33703685fd339c146aff549361e',
  )
  // 歷史候選核對保存的04原包；工作目錄入口已由al修正，不得混用兩版來源。
  for (const [name, bytes, pin] of [
    [
      'start-windows-test-receiver.ps1',
      7455,
      'd84c60ed6a70751f82e71ef7c53735a52d89e0d8a94c424779e9373359324c09',
    ],
    [
      'windows-host-observer-supervisor.ps1',
      9816,
      '51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2',
    ],
  ]) {
    const data = readFileSync(
      new URL(
        '../../.cache/test-receiver-portable-v24.22.1-win-x64-20261024-04/portable/' + name,
        import.meta.url,
      ),
    )
    assert.equal(data.length, bytes)
    assert.equal(createHash('sha256').update(data).digest('hex'), pin)
  }
})

// 缺能力須先以API斷言RED，不依賴PS或Windows環境造成載入失敗。
async function launchClaimApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellLaunchClaimArtifact, 'function')
  return value
}

// 手寫操作oracle把首次建立、拒絕及事後回驗分開，不能只檢查catch字樣。
const launchClaimBodies = [
  "  $copyStage = 'private_create'; $copyReason = 'io_failed'\n  Claim-ReceiverLaunch $copyRoot\n",
  "  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'\n  Assert-LaunchClaimFixture\n  $claimBefore = Get-Item -LiteralPath $claimPath -Force -ErrorAction Stop\n",
  `  $copyStage = 'private_create'; $copyReason = 'io_failed'
  $claimRejected = $false
  try { Claim-ReceiverLaunch $copyRoot }
  catch [IO.IOException] {
    $claimError = $_.Exception.GetBaseException()
    if ($claimError.GetType() -ne [IO.IOException] -or
        @(-2147024816, -2147024713) -notcontains $claimError.HResult) { throw }
    $claimRejected = $true
  }
  if (-not $claimRejected) { throw 'receiver_copy_rejected' }
`,
  `  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'
  Assert-LaunchClaimFixture
  $claimAfter = Get-Item -LiteralPath $claimPath -Force -ErrorAction Stop
  if ($claimBefore.CreationTimeUtc.Ticks -ne $claimAfter.CreationTimeUtc.Ticks -or
      $claimBefore.LastWriteTimeUtc.Ticks -ne $claimAfter.LastWriteTimeUtc.Ticks -or
      $claimBefore.Attributes -ne $claimAfter.Attributes) { throw 'receiver_copy_rejected' }
`,
]

// 候選獨立且不把生成契約誤稱為原生已驗，不繼承舊copy fixture預算。
test('launch-claim generates a distinct unexecuted one-file candidate', async () => {
  const value = await launchClaimApi()
  const a = value.createNativeProbePowerShellLaunchClaimArtifact()
  assert.equal(a.purpose, 'receiver_native_launch_claim_v1')
  assert.equal(a.rootName, 'rdweb receiver Launch claim 公開 20261025-01')
  assert.equal(a.onceFlag, 'RdwebReceiverLaunchClaim20261025Once')
  assert.equal(a.nativeVerified, false)
  assert.equal(a.transport, 'interactive_ram_only')
  assert.equal(a.encodedCommandSupported, false)
  const bytes = Buffer.byteLength('{"schemaVersion":1,"purpose":"rustdesk_test_receiver_v1"}\n')
  assert.deepEqual(a.artifactBudget, {
    directories: 1,
    normalFiles: 1,
    normalBytes: bytes,
    maxFiles: 1,
    maxBytes: bytes,
  })
  assert.deepEqual(a.fixturePlan, [{ name: 'launch-claim.json', bytes, creation: 'claim' }])
})

// 真span綁住原函數兩次呼叫及前後逐byte回驗；正常返回／錯誤型別與HRESULT必須拒絕。
test('launch-claim binds ordered creation, exact duplicate rejection and unchanged-file checks', async () => {
  const value = await launchClaimApi()
  const a = value.createNativeProbePowerShellLaunchClaimArtifact()
  assert.deepEqual(
    a.caseMap.map((item) => item.id),
    ['create', 'before', 'duplicate', 'after'],
  )
  let previous = 0
  for (const [index, span] of a.caseMap.entries()) {
    const body = a.childSource.slice(span.offset, span.offset + span.units)
    assert.equal(body, launchClaimBodies[index])
    assert.equal(span.sha256, createHash('sha256').update(body).digest('hex'))
    assert.equal(span.offset >= previous, true)
    previous = span.offset + span.units
  }
  assert.equal(a.childSource.match(/Claim-ReceiverLaunch \$copyRoot/g).length, 2)
  assert.equal(a.childSource.includes('function Claim-ReceiverLaunch'), false)
  assert.equal(
    a.childSource.includes(". (Join-Path $copyPackage 'start-windows-test-receiver.ps1')"),
    true,
  )
  assert.equal(a.childSource.includes('Copy-PrivateSetting'), false)
  assert.equal(a.childSource.includes('New-CopyFixture'), false)
})

// 公開claim只能有界讀取固定ASCII加LF；EOF、私有guard及Dispose失敗均不得補成功。
test('launch-claim validates the actual public claim bytes and releases every read resource', async () => {
  const value = await launchClaimApi()
  const { childSource: s } = value.createNativeProbePowerShellLaunchClaimArtifact()
  for (const fragment of [
    'function Assert-LaunchClaimFixture()',
    'Assert-HostPrivatePath $claimPath $false $copyOwner',
    '[Text.Encoding]::ASCII.GetBytes(\'{"schemaVersion":1,"purpose":"rustdesk_test_receiver_v1"}\' + "`n")',
    '$stream.Length -ne $expected.Length',
    '$stream.Read($buffer, 0, 1)',
    '$buffer[0] -ne $expected[$i]',
    '$stream.ReadByte() -ne -1',
    '$stream.Dispose()',
    '[Array]::Clear($expected, 0, $expected.Length)',
    '[Array]::Clear($buffer, 0, $buffer.Length)',
    'Assert-CopyAbsent $claimPath\n',
  ])
    assert.equal(s.includes(fragment), true, fragment)
  const helper = s.slice(
    s.indexOf('function Assert-LaunchClaimFixture()'),
    s.indexOf('\ntry {\n  if ($PSVersionTable'),
  )
  assert.equal(helper.includes('catch { $copyResources.Fault = $true; throw }'), true)
  assert.equal(
    helper.includes('[IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read'),
    true,
  )
  assert.equal(/ReadAll|Get-Content|Write-Output|\.Message|ToString\(/.test(helper), false)
  assert.equal(
    /Remove-Item|Delete\(|Move-Item|Set-Acl|Invoke-ReceiverStart|Invoke-ReceiverChild/.test(s),
    false,
  )
})

// 完整逆向重建parent比零散守衛regex更能發現監督、來源鎖或成功門檻被更改。
test('launch-claim preserves the complete trusted parent and all cleanup acceptance gates', async () => {
  const value = await launchClaimApi()
  const a = value.createNativeProbePowerShellLaunchClaimArtifact()
  const b = value.createNativeProbePowerShellCopyContractsArtifact()
  let restored = a.source
  for (const [generated, original] of [
    [a.childSource, b.childSource],
    [a.childSha256, b.childSha256],
    ['Get-Variable -Name ' + a.onceFlag, 'Get-Variable -Name ' + b.onceFlag],
    ['New-Variable -Name ' + a.onceFlag, 'New-Variable -Name ' + b.onceFlag],
  ]) {
    const offset = restored.indexOf(generated)
    assert.equal(offset >= 0 && restored.lastIndexOf(generated) === offset, true)
    restored = restored.slice(0, offset) + original + restored.slice(offset + generated.length)
  }
  assert.equal(restored, b.source)
  for (const key of [
    'expectedStdout',
    'expectedChildStdout',
    'adapterSha256',
    'stdoutMaxBytes',
    'stderrMaxBytes',
    'normalBudgetMs',
    'cleanupBudgetMs',
    'totalBudgetMs',
  ])
    assert.equal(a[key], b[key])
  const start = b.childSource.indexOf('finally {\n  if ($copyPolicyAttempted)')
  assert.equal(a.childSource.endsWith(b.childSource.slice(start)), true)
})

// 每個metadata位置必須指向真正嵌入的來源；完整exe與argv上界不能只計base64。
test('launch-claim binds exact embedded sources and full command-line and time bounds', async () => {
  const value = await launchClaimApi()
  const a = value.createNativeProbePowerShellLaunchClaimArtifact()
  for (const [source, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(typeof source, 'string')
    assert.equal(source.length > 0 && source.endsWith('\n'), true)
    assert.equal(source.includes('\r') || source.includes('\0'), false)
    assert.equal(Buffer.byteLength(source), bytes)
    assert.equal(source.length, units)
    assert.equal(createHash('sha256').update(source).digest('hex'), pin)
  }
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childUtf16Units),
    a.childSource,
  )
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(a.childAdapterOffset, null)
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(a.childSource, 'utf16le').toString('base64')
  assert.equal(a.childArguments, args)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 515 + args.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.deepEqual([a.normalBudgetMs, a.cleanupBudgetMs, a.totalBudgetMs], [18000, 2000, 20000])
})

// 不接受呼叫端override，不讀getter；保留接手prefix與z舊pins，避免覆寫既有工作。
test('launch-claim rejects overrides and preserves takeover prefixes and prior artifacts', async () => {
  const value = await launchClaimApi()
  let touched = 0
  const input = {
    // 未知輸入不得被讀取或轉成PS來源。
    get rootName() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const arg of [undefined, null, input, '', 0, false])
    assert.throws(() => value.createNativeProbePowerShellLaunchClaimArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  assert.equal(touched, 0)
  const a = value.createNativeProbePowerShellLaunchClaimArtifact()
  for (const item of [
    a,
    a.caseMap,
    a.fixturePlan,
    a.artifactBudget,
    ...a.caseMap,
    ...a.fixturePlan,
  ])
    assert.equal(Object.isFrozen(item), true)
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      122071,
      '9a0c35954edd16675daca247912762491b2a1213e8a8597e13e07dabec2a9345',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      163342,
      'a130ccb70b3891a17da639acf2947e09cd0fd7d2faf1895880e25c079f198fa9',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  const old = value.createNativeProbePowerShellCopyMissingSourceArtifact()
  assert.equal(old.sha256, '4b927dbfcafd97e6c5da7fd0cf45248301a4e6eaf7d03bb12a9087caefe326ed')
  assert.equal(old.childSha256, '038de9c3050304e665cbd86dc0bb3ff4b71dea60aa8837cf16b7f6d707899559')
})

// 將新helper及操作替回舊copy內容須逐字還原child，確保政策／載入／NTFS／DACL未被放寬。
test('launch-claim reconstructs the original child outside the declared fixture replacement', async () => {
  const value = await launchClaimApi()
  const a = value.createNativeProbePowerShellLaunchClaimArtifact()
  const b = value.createNativeProbePowerShellCopyContractsArtifact()
  const oldHelperStart = b.childSource.indexOf('# 只在新私有root以CreateNew寫固定公開bytes')
  const oldHelperEnd = b.childSource.indexOf('\ntry {\n  if ($PSVersionTable')
  const newHelperStart = a.childSource.indexOf('# 只核對本輪公開claim固定bytes及EOF')
  const newHelperEnd = a.childSource.indexOf('\ntry {\n  if ($PSVersionTable')
  const oldOperationsStart = b.childSource.indexOf(
    "  $copySource = Join-Path $copyRoot 'source.bin'\n",
  )
  const oldOperationsEnd = b.childSource.indexOf('  $copyDone = $true\n')
  const newOperationsStart = a.childSource.indexOf(
    "  $claimPath = Join-Path $copyRoot 'launch-claim.json'\n",
  )
  const newOperationsEnd = a.childSource.indexOf('  $copyDone = $true\n')
  assert.equal(
    [
      oldHelperStart,
      oldHelperEnd,
      newHelperStart,
      newHelperEnd,
      oldOperationsStart,
      oldOperationsEnd,
      newOperationsStart,
      newOperationsEnd,
    ].every((offset) => offset >= 0),
    true,
  )
  const restored = (
    a.childSource.slice(0, newHelperStart) +
    b.childSource.slice(oldHelperStart, oldHelperEnd) +
    a.childSource.slice(newHelperEnd, newOperationsStart) +
    b.childSource.slice(oldOperationsStart, oldOperationsEnd) +
    a.childSource.slice(newOperationsEnd)
  ).replace(a.rootName, b.rootName)
  assert.equal(restored, b.childSource)
})

// 缺少新生成能力須明確RED，不以缺Windows或缺PowerShell的環境錯誤代替。
async function privateJunctionApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellPrivateJunctionArtifact, 'function')
  return value
}

// 手寫公開操作oracle，漏掉獨立回讀、錯目標拒絕或事後不變性都必須使生成契約失敗。
const privateJunctionBodies = [
  `  $copyStage = 'private_create'; $copyReason = 'io_failed'
  $privateOutput = @(New-PrivateRunDirectory $copyRoot $copyOwner)
  if ($privateOutput.Count -ne 1 -or $privateOutput[0] -isnot [string]) { throw 'receiver_copy_rejected' }
  $privateRun = $privateOutput[0]
`,
  `  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'
  $privateBefore = Get-PrivateRunSnapshot $privateRun
`,
  `  $copyStage = 'junction'; $copyReason = 'io_failed'
  $junctionPath = Join-Path $copyRoot 'public-link'
  if ($junctionPath.Length -gt 240) { throw 'receiver_copy_rejected' }
  Assert-CopyAbsent $junctionPath
  [void](Microsoft.PowerShell.Management\New-Item -ItemType Junction -Path $junctionPath -Value $privateRun -ErrorAction Stop)
`,
  `  $copyStage = 'junction'; $copyReason = 'guard_rejected'
  $junctionItem = Get-Item -LiteralPath $junctionPath -Force -ErrorAction Stop
  if ($junctionItem -isnot [IO.DirectoryInfo] -or
      ($junctionItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -or
      $junctionItem.LinkType -cne 'Junction') { throw 'receiver_copy_rejected' }
  $junctionTargets = @($junctionItem.Target)
  if ($junctionTargets.Count -ne 1 -or $junctionTargets[0] -isnot [string] -or
      -not [string]::Equals($junctionTargets[0], $privateRun, [StringComparison]::OrdinalIgnoreCase)) { throw 'receiver_copy_rejected' }
`,
  `  $junctionRejected = $false
  try { Assert-HostPrivatePath $junctionPath $true $copyOwner }
  catch [Management.Automation.RuntimeException] {
    if ($_.Exception.GetType() -ne [Management.Automation.RuntimeException] -or
        $null -ne $_.Exception.InnerException -or
        $_.Exception.Message -cne 'host_capability_unavailable') { throw }
    $junctionRejected = $true
  }
  if (-not $junctionRejected) { throw 'receiver_copy_rejected' }
`,
  `  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'
  $privateAfter = Get-PrivateRunSnapshot $privateRun
  if ($privateBefore.Creation -ne $privateAfter.Creation -or
      $privateBefore.Write -ne $privateAfter.Write -or
      $privateBefore.Attributes -ne $privateAfter.Attributes -or
      $privateBefore.Security -cne $privateAfter.Security) { throw 'receiver_copy_rejected' }
`,
]

// 不能沿用claim的root／旗標或檔案預算，更不能宣稱生成等同原生驗證。
test('private-junction generates a fresh unverified directory-only candidate', async () => {
  const value = await privateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionArtifact()
  assert.equal(a.purpose, 'receiver_native_private_junction_v1')
  assert.equal(a.rootName, 'rdweb receiver Private junction 公開 20261025-01')
  assert.equal(a.onceFlag, 'RdwebReceiverPrivateJunction20261025Once')
  assert.equal(a.nativeVerified, false)
  assert.equal(a.transport, 'interactive_ram_only')
  assert.equal(a.encodedCommandSupported, false)
  assert.deepEqual(a.artifactBudget, {
    directories: 2,
    junctions: 1,
    normalFiles: 0,
    normalBytes: 0,
    maxFiles: 0,
    maxBytes: 0,
  })
  assert.deepEqual(a.fixturePlan, [
    { name: 'receiver-<guid>', kind: 'directory', creation: 'private_run' },
    { name: 'public-link', kind: 'junction', target: 'private_run', creation: 'junction' },
  ])
})

// 真span必須覆蓋單次正式建立、junction型態／自有目標、窄拒絕及事後回驗。
test('private-junction binds every ordered real operation and exact rejection predicate', async () => {
  const value = await privateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionArtifact()
  assert.deepEqual(
    a.caseMap.map((item) => item.id),
    [
      'private_create',
      'private_before',
      'junction_create',
      'junction_verify',
      'junction_reject',
      'private_after',
    ],
  )
  let previous = 0
  for (const [index, item] of a.caseMap.entries()) {
    assert.equal(
      a.childSource.slice(item.offset, item.offset + item.units),
      privateJunctionBodies[index],
    )
    assert.equal(
      item.sha256,
      createHash('sha256').update(privateJunctionBodies[index]).digest('hex'),
    )
    assert.equal(item.offset >= previous, true)
    previous = item.offset + item.units
  }
  assert.equal(a.childSource.match(/New-PrivateRunDirectory \$copyRoot \$copyOwner/g).length, 1)
  assert.equal(a.childSource.match(/New-Item -ItemType Junction/g).length, 1)
  assert.equal(a.childSource.match(/Get-PrivateRunSnapshot \$privateRun/g).length, 2)
  assert.equal(
    a.childSource.includes(". (Join-Path $copyPackage 'start-windows-test-receiver.ps1')"),
    true,
  )
  assert.equal(
    /function (New-PrivateRunDirectory|Assert-HostPrivatePath)/.test(a.childSource),
    false,
  )
  assert.equal(
    /Claim-ReceiverLaunch|Copy-PrivateSetting|NewGuid|Remove-Item|\.Delete\(|Move-Item|Resolve-Path|Get-ChildItem|Set-Acl|Invoke-ReceiverStart|Invoke-ReceiverChild/.test(
      a.childSource,
    ),
    false,
  )
})

// 私有建立無例外不足以成功；必須回讀普通子目錄、真父路徑／GUID及受保護owner-only DACL。
test('private-junction independently reads private-directory metadata instead of trusting the return path', async () => {
  const value = await privateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionArtifact()
  const helper = a.privateVerifierSource
  assert.equal(typeof helper, 'string')
  for (const fragment of [
    'function Get-PrivateRunSnapshot([string]$Path)',
    '$full = [IO.Path]::GetFullPath($Path)',
    '$full -cne $Path',
    '[string]::Equals([IO.Path]::GetDirectoryName($full), $copyRoot, [StringComparison]::OrdinalIgnoreCase)',
    'Get-Item -LiteralPath $Path -Force -ErrorAction Stop',
    '$item -isnot [IO.DirectoryInfo]',
    '($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0',
    '[string]::Equals($item.Parent.FullName, $copyRoot, [StringComparison]::OrdinalIgnoreCase)',
    "$item.Name -cnotmatch '^receiver-[0-9a-f]{32}$'",
    'Assert-HostPrivatePath $Path $true $copyOwner',
    'Get-Acl -LiteralPath $Path -ErrorAction Stop',
    '$acl.AreAccessRulesProtected',
    '$acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $copyOwner',
    '$rules.Count -ne 1',
    '$rules[0].IdentityReference -ne $copyOwner',
    '$rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow',
    '$rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl',
    '$rules[0].IsInherited',
    '$sections = [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Access',
    '$acl.GetSecurityDescriptorSddlForm($sections)',
    'Creation = $item.CreationTimeUtc.Ticks',
    'Write = $item.LastWriteTimeUtc.Ticks',
    'Attributes = [int]$item.Attributes',
  ])
    assert.equal(helper.includes(fragment), true, fragment)
  assert.equal(
    a.childSource.slice(a.privateVerifierOffset, a.privateVerifierOffset + helper.length),
    helper,
  )
  assert.equal(a.privateVerifierSha256, createHash('sha256').update(helper).digest('hex'))
  assert.equal(
    helper.indexOf('[IO.Path]::GetDirectoryName($full)') <
      helper.indexOf('Get-Item -LiteralPath $Path'),
    true,
  )
  assert.equal(/Write-Output|Console|catch|Set-Acl|New-Item|\.Message/.test(helper), false)
})

// parent只增加junction合法phase；不可藉新候選放寬來源鎖、deadline、exit0或五項確認。
test('private-junction reconstructs the entire previous parent outside its explicit phase extension', async () => {
  const value = await privateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionArtifact()
  const b = value.createNativeProbePowerShellLaunchClaimArtifact()
  let restored = a.source
  for (const [generated, original] of [
    [a.childSource, b.childSource],
    [a.childSha256, b.childSha256],
    ['Get-Variable -Name ' + a.onceFlag, 'Get-Variable -Name ' + b.onceFlag],
    ['New-Variable -Name ' + a.onceFlag, 'New-Variable -Name ' + b.onceFlag],
    [
      "@('unknown', 'child_policy', 'child_parse', 'root_absence', 'private_create', 'private_guard', 'copy', 'junction', 'child_cleanup')",
      "@('unknown', 'child_policy', 'child_parse', 'root_absence', 'private_create', 'private_guard', 'copy', 'child_cleanup')",
    ],
  ]) {
    const at = restored.indexOf(generated)
    assert.equal(at >= 0 && restored.lastIndexOf(generated) === at, true)
    restored = restored.slice(0, at) + original + restored.slice(at + generated.length)
  }
  assert.equal(restored, b.source)
  for (const key of [
    'expectedStdout',
    'expectedChildStdout',
    'adapterSha256',
    'stdoutMaxBytes',
    'stderrMaxBytes',
    'normalBudgetMs',
    'cleanupBudgetMs',
    'totalBudgetMs',
  ])
    assert.equal(a[key], b[key])
})

// fixture替換以外的child須完整還原，避免順手省略原政策回驗、來源載入或資源finally。
test('private-junction reconstructs every previous child guard and cleanup outside fixture changes', async () => {
  const value = await privateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionArtifact()
  const b = value.createNativeProbePowerShellLaunchClaimArtifact()
  const helperStart = b.childSource.indexOf('# 只核對本輪公開claim固定bytes及EOF')
  const helperEnd = b.childSource.indexOf('\ntry {\n  if ($PSVersionTable')
  const oldStart = b.childSource.indexOf("  $claimPath = Join-Path $copyRoot 'launch-claim.json'\n")
  const oldEnd = b.childSource.indexOf('  $copyDone = $true\n')
  const start = a.caseMap[0].offset
  const last = a.caseMap.at(-1)
  const end = last.offset + last.units
  assert.equal(
    [helperStart, helperEnd, oldStart, oldEnd].every((n) => n >= 0),
    true,
  )
  let restored =
    a.childSource.slice(0, start) + b.childSource.slice(oldStart, oldEnd) + a.childSource.slice(end)
  restored = restored.replace(a.privateVerifierSource, b.childSource.slice(helperStart, helperEnd))
  restored = restored.replace(a.rootName, b.rootName)
  assert.equal(restored, b.childSource)
})

// 真child／adapter與helper位置必須正確，且完整exe＋argv仍在原上界及18＋2秒預算內。
test('private-junction reports exact source spans and bounded encoded child transport', async () => {
  const value = await privateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionArtifact()
  for (const [source, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(typeof source, 'string')
    assert.equal(source.endsWith('\n'), true)
    assert.equal(source.includes('\r') || source.includes('\0'), false)
    assert.equal(Buffer.byteLength(source), bytes)
    assert.equal(source.length, units)
    assert.equal(createHash('sha256').update(source).digest('hex'), pin)
  }
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childUtf16Units),
    a.childSource,
  )
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(a.childAdapterOffset, null)
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(a.childSource, 'utf16le').toString('base64')
  assert.equal(a.childArguments, args)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 515 + args.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.deepEqual([a.normalBudgetMs, a.cleanupBudgetMs, a.totalBudgetMs], [18000, 2000, 20000])
  assert.equal(Buffer.byteLength(a.expectedChildStdout) <= a.stdoutMaxBytes, true)
})

// synthetic wire只驗公開分類契約，junction失敗不得因政策已還原而變成成功。
test('private-junction keeps canonical failure fixtures distinct from success evidence', async () => {
  const value = await privateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionArtifact()
  const failure = a.wireFixtures.find((item) => item.label === 'junction_rejected')
  const want =
    'receiver_native_diagnostic,{"version":1,"phase":"junction","reason":"guard_rejected","childStart":"unknown","childExit":"unknown","childPolicyRestore":"confirmed","parentPolicyVerify":"unknown","resourcesClose":"unconfirmed"}\n'
  assert.equal(failure.wire, want)
  const parsed = value.parseNativeProbeDiagnostic(failure.wire)
  assert.equal(parsed.phase, 'junction')
  assert.equal(parsed.resourcesClose, 'unconfirmed')
  assert.equal(
    a.wireFixtures.some((item) => item.label === 'copy_rejected'),
    false,
  )
  assert.notEqual(failure.wire, a.expectedChildStdout)
})

// getter不得被讀取，且舊prefix／ab pins保存；避免新任務覆寫既有工作或擅改來源。
test('private-junction freezes provenance, rejects overrides and preserves all takeover bytes', async () => {
  const value = await privateJunctionApi()
  let touched = 0
  const input = {
    // 未知外部值不得被用來組PS來源或更換root。
    get rootName() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const arg of [undefined, null, input, 0, '', false])
    assert.throws(() => value.createNativeProbePowerShellPrivateJunctionArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  assert.equal(touched, 0)
  const a = value.createNativeProbePowerShellPrivateJunctionArtifact()
  for (const item of [
    a,
    a.caseMap,
    ...a.caseMap,
    a.fixturePlan,
    ...a.fixturePlan,
    a.artifactBudget,
    a.wireFixtures,
    ...a.wireFixtures,
  ])
    assert.equal(Object.isFrozen(item), true)
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      128339,
      '3ac7a0be76ff94eb6f34121fe9685f123d5c0205488dff767dc9da979d20eebd',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      175061,
      '9be4c437c1d03e6a60a44ceb168bddc81e567095779690374fde49fe2524d6e5',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  const old = value.createNativeProbePowerShellLaunchClaimArtifact()
  assert.equal(old.sha256, '54122af06e3dd23ef1375df63be53eece192170855690ef4de09e22c50346cb6')
  assert.equal(old.childSha256, '1eee6c4ee0269cab9e419d972332cd30980845f87b76c7d1c5ffb6ab8af1f857')
})

// 預期以獨立U+005C建立，不能再次讓JS一般template與生成器同時吞掉反斜線。
test('qualified-private-junction retains the literal module delimiter in the emitted command', async () => {
  const value = await qualifiedPrivateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionQualifiedArtifact()
  const line = a.childSource.split('\n').find((row) => row.includes('-ItemType Junction'))
  const command = /Microsoft\.PowerShell\.\S+/.exec(line)[0]
  const want = ['Microsoft.PowerShell.Management', 'New-Item'].join(String.fromCharCode(92))
  assert.equal(command, want)
  assert.equal(command.charCodeAt('Microsoft.PowerShell.Management'.length), 92)
  assert.equal(a.source.includes(line), true)
})

// 新能力缺失以斷言RED，不用缺PS環境或import錯誤代替生成器測試。
async function qualifiedPrivateJunctionApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellPrivateJunctionQualifiedArtifact, 'function')
  return value
}

// 除一個module分隔符與新root外須完整還原child，避免為拼字修正削弱任何guard。
test('qualified-private-junction changes only the command delimiter and rebases all six operation spans', async () => {
  const value = await qualifiedPrivateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionQualifiedArtifact()
  const b = value.createNativeProbePowerShellPrivateJunctionArtifact()
  const qualified = ['Microsoft.PowerShell.Management', 'New-Item'].join(String.fromCharCode(92))
  const malformed = 'Microsoft.PowerShell.ManagementNew-Item'
  assert.equal(a.caseMap.length, 6)
  let previous = 0
  for (const [index, span] of a.caseMap.entries()) {
    const old = b.caseMap[index]
    let want = b.childSource.slice(old.offset, old.offset + old.units)
    if (old.id === 'junction_create') {
      assert.equal(want.includes(malformed), true)
      want = want.replace(malformed, qualified)
    }
    assert.equal(span.id, old.id)
    assert.equal(a.childSource.slice(span.offset, span.offset + span.units), want)
    assert.equal(span.sha256, createHash('sha256').update(want).digest('hex'))
    assert.equal(span.offset >= previous, true)
    previous = span.offset + span.units
  }
  assert.equal(a.childSource.split(qualified).length, 2)
  const restored = a.childSource.replace(qualified, malformed).replace(a.rootName, b.rootName)
  assert.equal(restored, b.childSource)
  assert.equal(
    createHash('sha256').update(restored).digest('hex'),
    'a938907d6c9ac3fce49fc0021c15ed2cee30a194df0b71d29917587ff8dde78e',
  )
})

// parent只換child／pin／新旗標；原wire、政策、信任及收尾門檻皆不得因修正放寬。
test('qualified-private-junction preserves the full supervisor and the unexecuted operation scope', async () => {
  const value = await qualifiedPrivateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionQualifiedArtifact()
  const b = value.createNativeProbePowerShellPrivateJunctionArtifact()
  assert.equal(a.purpose, 'receiver_native_private_junction_qualified_v1')
  assert.equal(a.rootName, 'rdweb receiver Private junction qualified 公開 20261026-01')
  assert.equal(a.onceFlag, 'RdwebReceiverPrivateJunctionQualified20261026Once')
  assert.equal(a.nativeVerified, false)
  let restored = a.source
  for (const [generated, original] of [
    [a.childSource, b.childSource],
    [a.childSha256, b.childSha256],
    ['Get-Variable -Name ' + a.onceFlag, 'Get-Variable -Name ' + b.onceFlag],
    ['New-Variable -Name ' + a.onceFlag, 'New-Variable -Name ' + b.onceFlag],
  ]) {
    const at = restored.indexOf(generated)
    assert.equal(at >= 0 && restored.lastIndexOf(generated) === at, true)
    restored = restored.slice(0, at) + original + restored.slice(at + generated.length)
  }
  assert.equal(restored, b.source)
  for (const key of [
    'expectedStdout',
    'expectedChildStdout',
    'stdoutMaxBytes',
    'stderrMaxBytes',
    'totalBudgetMs',
    'normalBudgetMs',
    'cleanupBudgetMs',
    'transport',
    'encodedCommandSupported',
    'privateVerifierSource',
    'privateVerifierSha256',
    'adapterSha256',
  ])
    assert.equal(a[key], b[key])
  assert.deepEqual(a.fixturePlan, b.fixturePlan)
  assert.deepEqual(a.artifactBudget, b.artifactBudget)
  assert.deepEqual(a.wireFixtures, b.wireFixtures)
})

// 由真正的parent／child／verifier回讀位置及完整命令上界，避免沿用過期metadata。
test('qualified-private-junction binds actual source pins, helper positions and complete command capacity', async () => {
  const value = await qualifiedPrivateJunctionApi()
  const a = value.createNativeProbePowerShellPrivateJunctionQualifiedArtifact()
  for (const [source, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(source.endsWith('\n'), true)
    assert.equal(source.includes('\r') || source.includes('\0'), false)
    assert.equal(Buffer.byteLength(source), bytes)
    assert.equal(source.length, units)
    assert.equal(createHash('sha256').update(source).digest('hex'), pin)
  }
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childUtf16Units),
    a.childSource,
  )
  assert.equal(
    a.childSource.slice(
      a.privateVerifierOffset,
      a.privateVerifierOffset + a.privateVerifierSource.length,
    ),
    a.privateVerifierSource,
  )
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(a.childAdapterOffset, null)
  const args =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(a.childSource, 'utf16le').toString('base64')
  assert.equal(a.childArguments, args)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 515 + args.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
})

// 保存已知有缺陷的ac及所有既有prefix，不可靠覆寫舊oracle或吞getter來獲得綠燈。
test('qualified-private-junction rejects overrides and preserves the entire prior source history', async () => {
  const value = await qualifiedPrivateJunctionApi()
  let touched = 0
  const input = {
    // 未知輸入不參與PS來源或root組合。
    get rootName() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const arg of [undefined, null, input, false, 0, 'PUBLIC'])
    assert.throws(() => value.createNativeProbePowerShellPrivateJunctionQualifiedArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  assert.equal(touched, 0)
  const a = value.createNativeProbePowerShellPrivateJunctionQualifiedArtifact()
  for (const item of [
    a,
    a.caseMap,
    ...a.caseMap,
    a.fixturePlan,
    ...a.fixturePlan,
    a.artifactBudget,
  ])
    assert.equal(Object.isFrozen(item), true)
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      137271,
      '24cd29b910d3d6aaadc156cea85815320cd1cb5305d091224ac029e73744ca98',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      190030,
      '303fec776e3f19a7b62f9b3f9bfdbaa505b3fc632eec363069033c5f4f3ec133',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  const old = value.createNativeProbePowerShellPrivateJunctionArtifact()
  assert.equal(old.sha256, '5b7e96c9bb91a84db90243df423f2353967f039be0508b1a59f0c75fc49622e2')
  assert.equal(old.childSha256, 'a938907d6c9ac3fce49fc0021c15ed2cee30a194df0b71d29917587ff8dde78e')
  assert.equal(
    old.childSource.includes('Microsoft.PowerShell.ManagementNew-Item -ItemType Junction'),
    true,
  )
})

// 新API必須先斷言RED，不以缺Windows或缺快取假冒生成器失敗。
async function bundleHelpApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellBundleHelpArtifact, 'function')
  assert.equal(typeof value.parseNativeProbeBundleHelpOutput, 'function')
  return value
}

// 四項證據由唯一parent持有，Node不需要也不能偽造PowerShell政策還原。
const bundleHelpReady =
  'receiver_native_diagnostic,{"version":1,"phase":"unknown","reason":"unknown","childStart":"confirmed","childExit":"confirmed","childPolicyRestore":"not_acquired","parentPolicyVerify":"confirmed","resourcesClose":"confirmed"}\n'
const bundleHelpObserved = 'receiver_windows_bundle_help_observed,sessionStarted=False\n'
const bundleHelpUnavailable =
  'receiver_windows_bundle_help_unavailable,terminalUse=stop,sessionStarted=False\n'

// binary child不能繼承舊PS childSource、政策例外或假五confirmed complete。
test('bundle-help generates an unverified Node-only candidate with honest evidence ownership', async () => {
  const value = await bundleHelpApi()
  const a = value.createNativeProbePowerShellBundleHelpArtifact()
  assert.equal(a.purpose, 'receiver_native_bundle_help_v1')
  assert.equal(a.nativeVerified, false)
  assert.equal(a.onceFlag, 'RdwebReceiverBundleHelp20261026Once')
  assert.equal(a.childSource, null)
  assert.equal(a.childSourceOffset, null)
  assert.equal(a.childExecutableName, 'node.exe')
  assert.equal(a.expectedChildStdout, 'receiver_usage,run --directory <root>|--help\n')
  assert.equal(a.expectedStdout, bundleHelpReady + bundleHelpObserved)
  assert.equal(a.transport, 'interactive_ram_only')
  assert.equal(a.encodedCommandSupported, false)
  assert.equal(
    a.source.includes("Set-RdwebNativeNotAcquired $loadDiagnostic 'childPolicyRestore'"),
    true,
  )
  assert.equal(
    /(?:Start|Confirm)-RdwebNativeEvidence \$loadDiagnostic 'childPolicyRestore'/.test(a.source),
    false,
  )
  assert.equal(
    /Set-ExecutionPolicy|EncodedCommand|\$loadChildSource|\. \(Join-Path|Invoke-ReceiverStart|Invoke-ReceiverChild|New-PrivateRunDirectory|New-Item|WriteAll|Remove-Item/.test(
      a.source,
    ),
    false,
  )
  assert.equal(a.source.split('$loadProcess.Start()').length, 2)
})

// 各檔精確bytes／pin必須在真來源，不沿用PS的1MiB上限而拒絕原runtime。
test('bundle-help pins the exact manifest, runtime and original bundle with per-file bounds', async () => {
  const value = await bundleHelpApi()
  const a = value.createNativeProbePowerShellBundleHelpArtifact()
  const want = [
    {
      name: 'integrity.json',
      bytes: 1073,
      sha256: 'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
    },
    {
      name: 'node.exe',
      bytes: 93915464,
      sha256: 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5',
    },
    {
      name: 'receiver.mjs',
      bytes: 2362470,
      sha256: '03d6c730119b941e20454e3f52ad9e920a08a6ef4473ac1e61d9c341ff559947',
    },
  ]
  assert.deepEqual(a.trustedSources, want)
  for (const item of want)
    assert.equal(
      a.source.includes(
        `@{ Name = '${item.name}'; Bytes = ${item.bytes}; Pin = '${item.sha256}' }`,
      ),
      true,
    )
  for (const fragment of [
    'if ($stream.Length -ne $sourceItem.Bytes)',
    '$loadHandles.Add($stream)',
    '$sha.ComputeHash($stream)',
    '[IO.FileShare]::Read',
  ])
    assert.equal(a.source.includes(fragment), true)
  assert.equal(a.source.includes('$stream.Length -gt 1048576'), false)
})

// 先清child環境、只留四值；以實際雙引號字元傳原bundle絕對路徑加單獨help。
test('bundle-help isolates child environment and quotes only the absolute bundle path', async () => {
  const value = await bundleHelpApi()
  const a = value.createNativeProbePowerShellBundleHelpArtifact()
  const s = a.source
  assert.deepEqual(a.allowedChildEnvironment, ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'])
  assert.deepEqual(
    [...s.matchAll(/\$info\.EnvironmentVariables\['([^']+)'\]/g)].map((m) => m[1]),
    ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'],
  )
  assert.equal(
    s.indexOf('$info.EnvironmentVariables.Clear()') >= 0 &&
      s.indexOf('$info.EnvironmentVariables.Clear()') <
        s.indexOf("$info.EnvironmentVariables['SystemRoot']"),
    true,
  )
  for (const fragment of [
    '$info.WorkingDirectory = $loadPackage',
    "$exe = Join-Path $loadPackage 'node.exe'",
    "$bundle = Join-Path $loadPackage 'receiver.mjs'",
    "$arguments = [string][char]34 + $bundle + [char]34 + ' --help'",
    '$loadProcess.ExitCode -ne 0',
    "$frame.Replace(([string][char]13 + [char]10), ([string][char]10)) -cne 'receiver_usage,run --directory <root>|--help' + [char]10",
  ])
    assert.equal(s.includes(fragment), true, fragment)
  assert.equal(
    /\$env:\w+\s*=|SetEnvironmentVariable|GetEnvironmentVariables|RDWEB_RECEIVER_PRIVATE_ENTRY|NODE_OPTIONS|NODE_V8_COVERAGE/.test(
      s,
    ),
    false,
  )
})

// 整段迴圈／收尾比較，不能省略pipe界限、共用deadline、owned handle或Dispose。
test('bundle-help preserves the complete process loop and cleanup except PS-only evidence', async () => {
  const value = await bundleHelpApi()
  const a = value.createNativeProbePowerShellBundleHelpArtifact()
  const b = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  const loopStart = '$loadWatch = [Diagnostics.Stopwatch]::StartNew()\n'
  const loopEnd = '  $loadExited = $true\n'
  const loop = b.source.slice(
    b.source.indexOf(loopStart),
    b.source.indexOf(loopEnd) + loopEnd.length,
  )
  assert.equal(loop.length > 0 && a.source.includes(loop), true)
  const start = 'finally {\n  $closed = -not $loadResourceFault\n'
  const oldCleanupStart = b.source.indexOf(start)
  const oldCleanup = b.source.slice(
    oldCleanupStart,
    b.source.indexOf('\ntry { [Console]::Write', oldCleanupStart),
  )
  const want = oldCleanup
    .replace("    Confirm-RdwebNativeEvidence $loadDiagnostic 'childPolicyRestore' $false\n", '')
    .replace("@('childStart', 'childExit', 'childPolicyRestore')", "@('childStart', 'childExit')")
    .replace('    if ($loadStarted -and -not $loadChildClosed) { $closed = $false }\n', '')
  assert.equal(a.source.slice(a.source.indexOf(start), a.source.indexOf('\n# help-only結果')), want)
  assert.deepEqual(
    [a.normalBudgetMs, a.cleanupBudgetMs, a.totalBudgetMs, a.stdoutMaxBytes, a.stderrMaxBytes],
    [18000, 2000, 20000, 1024, 128],
  )
  assert.equal(a.source.includes('$loadHelpVerified -and -not $loadDiagnostic.Failed'), true)
})

// 執行真解碼器：四項全confirmed及NA政策才observed，不假complete也不省任何證據。
test('bundle-help decodes canonical observed and unavailable output with honest policy ownership', async () => {
  const value = await bundleHelpApi()
  const a = value.createNativeProbePowerShellBundleHelpArtifact()
  const ready = value.parseNativeProbeBundleHelpOutput(bundleHelpReady + bundleHelpObserved)
  assert.equal(ready.status, 'observed')
  assert.equal(ready.diagnostic.phase, 'unknown')
  assert.equal(ready.diagnostic.childPolicyRestore, 'not_acquired')
  assert.equal(Object.isFrozen(ready) && Object.isFrozen(ready.diagnostic), true)
  assert.deepEqual(
    value.parseNativeProbeBundleHelpOutput(
      (bundleHelpReady + bundleHelpObserved).replaceAll('\n', '\r\n'),
    ),
    ready,
  )
  const failure = value.parseNativeProbeBundleHelpOutput(
    a.wireFixtures.find((item) => item.label === 'source_mismatch').wire,
  )
  assert.equal(failure.status, 'unavailable')
  assert.equal(failure.diagnostic.phase, 'source_pin')
  for (const field of ['childStart', 'childExit', 'parentPolicyVerify', 'resourcesClose']) {
    const wire = bundleHelpReady.replace(`"${field}":"confirmed"`, `"${field}":"unconfirmed"`)
    assert.throws(() => value.parseNativeProbeBundleHelpOutput(wire + bundleHelpObserved))
    assert.equal(
      value.parseNativeProbeBundleHelpOutput(wire + bundleHelpUnavailable).status,
      'unavailable',
    )
  }
})

// 未知／重複／截斷／偽complete或getter均拒絕，不轉型或回顯外部內容。
test('bundle-help rejects malformed and contradictory output without coercion', async () => {
  const value = await bundleHelpApi()
  const ready = bundleHelpReady + bundleHelpObserved
  let touched = 0
  const bad = [
    null,
    undefined,
    false,
    0,
    Symbol('PUBLIC'),
    '',
    ready.slice(0, -1),
    ready + '\n',
    ready + bundleHelpObserved,
    bundleHelpReady,
    bundleHelpObserved,
    ready.replace('not_acquired', 'confirmed'),
    ready.replace('"phase":"unknown"', '"phase":"complete"'),
    ready.replace('"version":1', '"version":1,"version":1'),
    ready.replace('observed,', 'unavailable,terminalUse=stop,'),
    ready.replace('"childStart":"confirmed"', '"childStart":"not_acquired"'),
    ready + 'PUBLIC_EXTRA',
    'x'.repeat(1281),
  ]
  bad.push({
    // 不接受未知值轉型成輸出wire。
    toString() {
      touched++
      return ready
    },
  })
  for (const wire of bad)
    assert.throws(() => value.parseNativeProbeBundleHelpOutput(wire), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  assert.equal(touched, 0)
})

// 真parent／adapter位置及pins須正確，完整exe加bundle引號／help容量一起計算。
test('bundle-help binds actual source metadata and the complete command bound', async () => {
  const value = await bundleHelpApi()
  const a = value.createNativeProbePowerShellBundleHelpArtifact()
  assert.equal(a.source.length, a.utf16Units)
  assert.equal(Buffer.byteLength(a.source), a.utf8Bytes)
  assert.equal(createHash('sha256').update(a.source).digest('hex'), a.sha256)
  assert.equal(a.source.endsWith('\n'), true)
  assert.equal(a.source.includes('\r') || a.source.includes('\0'), false)
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(a.adapterSha256, adapter.sha256)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 1036)
  assert.equal(a.source.includes('$exe.Length + 3 + $arguments.Length -gt 32766'), true)
})

// 不接受override或讀getter；所有接手prefix及af等舊候選均保持。
test('bundle-help freezes provenance and preserves all previous source bytes and pins', async () => {
  const value = await bundleHelpApi()
  let touched = 0
  const input = {
    // 不允許用外部值更換runtime／bundle／環境。
    get source() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const arg of [undefined, null, input, false, 0, 'PUBLIC'])
    assert.throws(() => value.createNativeProbePowerShellBundleHelpArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  assert.equal(touched, 0)
  const a = value.createNativeProbePowerShellBundleHelpArtifact()
  for (const item of [
    a,
    a.trustedSources,
    ...a.trustedSources,
    a.allowedChildEnvironment,
    a.wireFixtures,
    ...a.wireFixtures,
  ])
    assert.equal(Object.isFrozen(item), true)
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      140419,
      'c44b0bae8db354c5aa42a2d63f7a8b6a5d0b5f2f91217db4a9f9a6008d498975',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      198001,
      '8748630933e0cef48ba505b078fe08744b4c3bd8b5cb373dd1cd4719936741aa',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  assert.equal(
    value.createNativeProbePowerShellPrivateJunctionQualifiedArtifact().sha256,
    '4ec441daf1552d44f7508e0c8fa90753a335c8a0e09b689a8e43b79a61998e79',
  )
})

// 新child角色不允許省略父端Restricted／非管理員／版本或普通NTFS來源邊界。
test('bundle-help retains the complete trusted policy, path and parent preflight guards', async () => {
  const value = await bundleHelpApi()
  const a = value.createNativeProbePowerShellBundleHelpArtifact()
  const b = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  for (const [start, end] of [
    ['function Assert-RdwebLoadPolicy(', '# 只解碼自有child的一行UTF-8診斷'],
    ['# 固定本機普通路徑與祖先檢查', '# child literal逐字保留原來源尾LF'],
    ['  $loadMayRun = $true\n', "  $loadStage = 'source_pin'\n"],
  ]) {
    const offset = b.source.indexOf(start)
    const limit = b.source.indexOf(end, offset)
    assert.equal(offset >= 0 && limit > offset, true)
    assert.equal(a.source.includes(b.source.slice(offset, limit)), true)
  }
})

// 缺新API須以明確斷言RED，不執行Windows或以import失敗冒充契約RED。
async function bundleHelpHandoffApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellBundleHelpHandoffArtifact, 'function')
  return value
}

// 獨立按PS單引號here-string語意取body；delimiter前的最後LF不屬於內容。
function bundleHelpLiteral(source) {
  const text = source.replaceAll('\r\n', '\n')
  const opening = "$rdwebHelpLiteral = @'\n"
  const start = text.indexOf(opening)
  assert.equal(start >= 0, true)
  assert.equal(text.indexOf(opening, start + 1), -1)
  const end = text.indexOf("\n'@\n", start + opening.length)
  assert.equal(end > start, true)
  return {
    body: text.slice(start + opening.length, end),
    wrapper: text.slice(0, start) + text.slice(end + 4),
  }
}

// 少一個尾LF或錯delimiter必須破壞真重建pin；不能把生成器本身當oracle。
test('bundle-help-handoff reconstructs the exact original parent with PS trailing-LF semantics', async () => {
  const value = await bundleHelpHandoffApi()
  const a = value.createNativeProbePowerShellBundleHelpHandoffArtifact()
  const parent = value.createNativeProbePowerShellBundleHelpArtifact()
  for (const stage of [a.stage1Source, a.stage1Source.replaceAll('\n', '\r\n')]) {
    const { body } = bundleHelpLiteral(stage)
    assert.equal(body, parent.source)
    assert.equal(Buffer.byteLength(body), 20473)
    assert.equal(body.length, 19819)
    assert.equal(
      createHash('sha256').update(body).digest('hex'),
      'b8cce02eb09cda8d2d165c4ed9a25c4c8d54c8a0b6dd3e0b6aaf7b87522feaf5',
    )
  }
  const broken = a.stage1Source.replace("\n\n'@\n", "\n'@\n")
  assert.notEqual(bundleHelpLiteral(broken).body, parent.source)
  assert.equal(a.parentSha256, parent.sha256)
})

// 搬運階段若意外Invoke／建flag／啟程序或讀檔便越權；只檢查literal外真正執行區。
test('bundle-help-handoff stage one remains inert and clears only its own RAM payload on failure', async () => {
  const value = await bundleHelpHandoffApi()
  const a = value.createNativeProbePowerShellBundleHelpHandoffArtifact()
  const { wrapper } = bundleHelpLiteral(a.stage1Source)
  assert.equal(
    /ScriptBlock|\.Invoke\(|\.Start\(|ProcessStartInfo|FileStream|ReadAll|WriteAll|New-Item|Set-ExecutionPolicy|RdwebReceiverBundleHelp20261026Once/.test(
      wrapper,
    ),
    false,
  )
  assert.equal(wrapper.includes("$ErrorActionPreference = 'Stop'"), true)
  assert.equal(wrapper.includes('$rdwebHelpText = $rdwebHelpLiteral.Replace('), true)
  assert.equal(wrapper.includes(`Set-Variable -Name ${a.payloadVariable} -Scope Global`), true)
  assert.equal(wrapper.includes(`Remove-Variable -Name ${a.payloadVariable} -Scope Global`), true)
  assert.equal(wrapper.includes("catch { $rdwebHelpStatus = 'error' }"), true)
  assert.equal(wrapper.includes('先停手回報，不自行重貼'), true)
  assert.equal(
    a.integrityLine,
    'rdweb_bundle_help_handoff_integrity_v1,status=ok,bytes=20473,units=19819,sha256=b8cce02eb09cda8d2d165c4ed9a25c4c8d54c8a0b6dd3e0b6aaf7b87522feaf5',
  )
  assert.equal(a.integrityErrorLine, 'rdweb_bundle_help_handoff_integrity_v1,status=error')
})

// 第二段若先轉型或先Invoke就會誤接未知payload；型別與全部pin守衛必須先於唯一Invoke。
test('bundle-help-handoff stage two checks the typed same-session payload before one invocation', async () => {
  const value = await bundleHelpHandoffApi()
  const a = value.createNativeProbePowerShellBundleHelpHandoffArtifact()
  const s = a.stage2Source
  const invoke = s.indexOf('[void]([ScriptBlock]::Create($rdwebHelpText).Invoke())')
  assert.equal(invoke > 0, true)
  assert.equal(s.split('.Invoke(').length, 2)
  assert.equal(s.includes(`Get-Variable -Name ${a.payloadVariable} -Scope Global`), true)
  for (const guard of [
    '$null -eq $rdwebHelpValue',
    '$rdwebHelpValue.Value -isnot [string]',
    '$rdwebHelpText = $rdwebHelpValue.Value',
    '$rdwebHelpText.IndexOf([char]13) -ge 0',
    '$rdwebHelpText.IndexOf([char]0) -ge 0',
    '-not $rdwebHelpText.EndsWith($rdwebHelpLf)',
    '[Text.Encoding]::UTF8.GetByteCount($rdwebHelpText) -ne 20473',
    '$rdwebHelpText.Length -ne 19819',
    "$rdwebHelpHash -cne 'b8cce02eb09cda8d2d165c4ed9a25c4c8d54c8a0b6dd3e0b6aaf7b87522feaf5'",
  ]) {
    assert.equal(s.indexOf(guard) >= 0 && s.indexOf(guard) < invoke, true, guard)
  }
  assert.equal(s.includes('[string]$rdwebHelpValue.Value'), false)
  assert.equal(/\$rdwebHelp(?:Text|Value(?:\.Value)?)\.Replace\(/.test(s), false)
  assert.equal(s.includes(".Replace('-', '').ToLowerInvariant()"), true)
  assert.equal(s.includes('finally { $rdwebHelpSha.Dispose() }'), true)
  assert.equal(s.includes(`catch { [Console]::Write('${a.unavailableLine}' + [char]10) }`), true)
})

// 第一段真輸出的常值／比較器必須綁同一parent；任何截斷／改動均不能符合該pin。
test('bundle-help-handoff binds emitted guards to the actual literal rather than accepting modified payloads', async () => {
  const value = await bundleHelpHandoffApi()
  const a = value.createNativeProbePowerShellBundleHelpHandoffArtifact()
  const { body, wrapper } = bundleHelpLiteral(a.stage1Source)
  const bytes = Number(wrapper.match(/GetByteCount\(\$rdwebHelpText\) -eq (\d+)/)?.[1])
  const units = Number(wrapper.match(/\$rdwebHelpText.Length -eq (\d+)/)?.[1])
  const pin = wrapper.match(/\$rdwebHelpHash -ceq '([a-f0-9]{64})'/)?.[1]
  assert.deepEqual([bytes, units, pin], [20473, 19819, a.parentSha256])
  for (const fragment of [
    '$rdwebHelpText.IndexOf([char]13) -lt 0',
    '$rdwebHelpText.IndexOf([char]0) -lt 0',
    '$rdwebHelpText.EndsWith($rdwebHelpLf)',
    'finally { $rdwebHelpSha.Dispose() }',
  ])
    assert.equal(wrapper.includes(fragment), true)
  for (const changed of [
    body.slice(0, -1),
    body.slice(1),
    body + '\n',
    body + '\0',
    body.replace('\n', '\r'),
    body.replace('Restricted', 'PUBLICFAIL'),
  ]) {
    assert.equal(
      Buffer.byteLength(changed) === bytes &&
        changed.length === units &&
        createHash('sha256').update(changed).digest('hex') === pin,
      false,
    )
  }
})

// 交接returned不應污染雙行接受契約；失敗marker不能被解碼成help成功。
test('bundle-help-handoff does not invent completion evidence or reuse old child markers', async () => {
  const value = await bundleHelpHandoffApi()
  const a = value.createNativeProbePowerShellBundleHelpHandoffArtifact()
  const { wrapper } = bundleHelpLiteral(a.stage1Source)
  for (const s of [wrapper, a.stage2Source]) {
    assert.equal(
      /load_only|receiverStarted|EncodedCommand|Set-ExecutionPolicy|returned|childSource/.test(s),
      false,
    )
  }
  assert.equal(
    a.unavailableLine,
    'receiver_windows_bundle_help_handoff_unavailable,terminalUse=stop,sessionStarted=False',
  )
  assert.throws(() => value.parseNativeProbeBundleHelpOutput(a.unavailableLine + '\n'))
  const tail = a.stage2Source.slice(a.stage2Source.indexOf('.Invoke())') + '.Invoke())'.length)
  assert.equal(tail.includes('observed'), false)
  assert.equal(a.nativeVerified, false)
  assert.equal(a.encodedCommandSupported, false)
  assert.equal(a.transport, 'interactive_ram_only')
})

// 兩段pins必須指向真來源；所有metadata凍結且外部override不可觸發getter。
test('bundle-help-handoff freezes actual source provenance and rejects all overrides', async () => {
  const value = await bundleHelpHandoffApi()
  const a = value.createNativeProbePowerShellBundleHelpHandoffArtifact()
  for (const stage of ['stage1', 'stage2']) {
    const source = a[stage + 'Source']
    assert.equal(a[stage + 'Utf8Bytes'], Buffer.byteLength(source))
    assert.equal(a[stage + 'Utf16Units'], source.length)
    assert.equal(a[stage + 'Sha256'], createHash('sha256').update(source).digest('hex'))
    assert.equal(source.includes('\r') || source.includes('\0'), false)
    assert.equal(source.endsWith('\n'), true)
  }
  assert.equal(Object.isFrozen(a), true)
  let touched = 0
  const input = {
    // 外部來源不可覆寫同pin parent或交接payload名稱。
    get source() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const arg of [undefined, null, input, false, 0, 'PUBLIC']) {
    assert.throws(() => value.createNativeProbePowerShellBundleHelpHandoffArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
  assert.deepEqual(a, value.createNativeProbePowerShellBundleHelpHandoffArtifact())
})

// 交接不能改任何接手prefix，尤其不得重建ag或動已接受原生候選。
test('bundle-help-handoff preserves every takeover byte and both previous handoff and parent pins', async () => {
  const value = await bundleHelpHandoffApi()
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      151042,
      'a9b14c5a6675d00b8f77f9d40f6b52b419326e4cb43bb2a55c9acda1a8198d98',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      210790,
      '3bd3141dbbe69d969e90d94364bb09c19bac16e1316682ae9cdc29d3f80e348a',
    ],
  ]) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  }
  const old = value.createNativeProbePowerShellHandoffArtifact()
  assert.equal(old.stage1Sha256, 'ac86248ddccb37b3f9979a3e1900e9a59cdb56ba2d3b26fe5410af475ba14d5b')
  assert.equal(old.stage2Sha256, '8b3bda5b8aa2fbe672e04bdc91794dfe0f1a46d4cdd52f73ade6a3953169e845')
  assert.equal(
    value.createNativeProbePowerShellBundleHelpArtifact().sha256,
    'b8cce02eb09cda8d2d165c4ed9a25c4c8d54c8a0b6dd3e0b6aaf7b87522feaf5',
  )
})

// 診斷API缺失必須先斷言RED，不呼叫PowerShell或建立原生測試替身檔。
async function stdoutExitApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellStdoutExitArtifact, 'function')
  assert.equal(typeof value.parseNativeProbeStdoutExitOutput, 'function')
  return value
}

// 固定公開cmdlet案例只驗管線：移除型別／值檢查會讓此來源契約測試失敗。
const stdoutExitCases = String.raw`  # 只在child設定公開合成exit；內建cmdlet不啟程序，這不是OS退出碼驗證。
  $loadStage = 'child_parse'; $loadReason = 'unexpected_output'
  $LASTEXITCODE = 0
  $quiet = Invoke-ReceiverChild 'Microsoft.PowerShell.Core\Out-Null' @()
  if ($quiet -isnot [int] -or $quiet -ne 0 -or (Get-ReceiverExitCode $quiet) -ne 0) { throw 'receiver_native_load_rejected' }
  $LASTEXITCODE = 0
  $mixed = Invoke-ReceiverChild 'Microsoft.PowerShell.Utility\Write-Output' @('RDWEB_PUBLIC_STDOUT')
  if ($mixed -isnot [object[]] -or $mixed.Count -ne 2 -or
      $mixed[0] -isnot [string] -or $mixed[0] -cne 'RDWEB_PUBLIC_STDOUT' -or
      $mixed[1] -isnot [int] -or $mixed[1] -ne 0 -or
      (Get-ReceiverExitCode $mixed) -ne 2) { throw 'receiver_native_load_rejected' }
`
const stdoutExitObserved =
  'receiver_windows_stdout_exit_probe_observed,stdoutExitMixed=True,sessionStarted=False\n'
const stdoutExitUnavailable =
  'receiver_windows_stdout_exit_probe_unavailable,terminalUse=stop,sessionStarted=False\n'

// 必須實際載入原PS函數而非inline修正版；觀察的2是缺陷分類，不是產品成功。
test('stdout-exit invokes the original loaded functions with silent and public-output cmdlets only', async () => {
  const value = await stdoutExitApi()
  const a = value.createNativeProbePowerShellStdoutExitArtifact()
  assert.equal(a.purpose, 'receiver_native_stdout_exit_probe_v1')
  assert.equal(a.nativeVerified, false)
  assert.equal(a.productEntryVerified, false)
  assert.equal(a.nativeExecutableVerified, false)
  assert.equal(a.childSource.includes(stdoutExitCases), true)
  assert.equal(
    a.childSource.includes(". (Join-Path $loadPackage 'start-windows-test-receiver.ps1')"),
    true,
  )
  assert.equal(
    a.childSource.indexOf(". (Join-Path $loadPackage 'start-windows-test-receiver.ps1')") <
      a.childSource.indexOf(stdoutExitCases),
    true,
  )
  assert.equal(/function (?:Invoke-ReceiverChild|Get-ReceiverExitCode)/.test(a.childSource), false)
  assert.equal(
    /ProcessStartInfo|\.Start\(|node\.exe|Invoke-ReceiverStart|WriteAll|New-Item|GetEnvironmentVariable/.test(
      a.childSource,
    ),
    false,
  )
  assert.equal(a.childSource.includes(stdoutExitCases + '  $loadLoaded = $true\n'), true)
})

// 完整反向還原child pin，抓出案例之外的政策／載入／cleanup偷改或成功捷徑。
test('stdout-exit preserves every original child byte outside the two diagnostic cases', async () => {
  const value = await stdoutExitApi()
  const a = value.createNativeProbePowerShellStdoutExitArtifact()
  const b = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  assert.equal(a.childSource.split(stdoutExitCases).length, 2)
  assert.equal(a.childSource.replace(stdoutExitCases, ''), b.childSource)
  assert.equal(
    a.childSource.includes('Set-ExecutionPolicy -Scope Process -ExecutionPolicy Undefined'),
    true,
  )
  assert.equal(a.childSource.includes("Assert-RdwebLoadPolicy 'Restricted'"), true)
  assert.equal(
    a.childSource.includes('if ($loadLoaded -and $loadRestored -and $loadClosed) { exit 0 }'),
    true,
  )
})

// 反向還原整個parent，不只檢查幾個關鍵字；監督與guard須逐byte保留。
test('stdout-exit preserves the full trusted parent except source pins, flag, progress and terminal scope', async () => {
  const value = await stdoutExitApi()
  const a = value.createNativeProbePowerShellStdoutExitArtifact()
  const b = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  const footerStart = b.source.lastIndexOf('try { [Console]::Write((Format-RdwebNativeDiagnostic')
  const oldFooter = b.source.slice(footerStart)
  let s = a.source
  s = s.replace(a.childSource, b.childSource)
  s = s.replace(a.childSha256, b.childSha256)
  s = s.replaceAll(
    'RdwebReceiverStdoutExit20261026Once',
    'RdwebReceiverLoadOnlyDiagnostic20261025Once',
  )
  s = s.replace(
    "[Text.Encoding]::Unicode.GetBytes('$ProgressPreference = ''SilentlyContinue''; ' + $loadChildSource)",
    '[Text.Encoding]::Unicode.GetBytes($loadChildSource)',
  )
  const newFooterStart = s.lastIndexOf('# stdout-exit結果只代表診斷完成')
  assert.equal(newFooterStart > 0, true)
  s = s.slice(0, newFooterStart) + oldFooter
  assert.equal(s, b.source)
  assert.deepEqual(a.trustedSources, b.trustedSources)
  assert.deepEqual(
    [a.normalBudgetMs, a.cleanupBudgetMs, a.totalBudgetMs, a.stdoutMaxBytes, a.stderrMaxBytes],
    [18000, 2000, 20000, 1024, 128],
  )
})

// 真解碼Base64驗完整child與U+005C，並計入exe／preamble／EncodedCommand總容量。
test('stdout-exit binds actual embedded sources and bounded progress-prefixed child transport', async () => {
  const value = await stdoutExitApi()
  const a = value.createNativeProbePowerShellStdoutExitArtifact()
  const adapter = value.createNativeProbePowerShellTypeFixedAdapterArtifact()
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  assert.equal(a.childArguments.startsWith(prefix), true)
  const decoded = Buffer.from(a.childArguments.slice(prefix.length), 'base64').toString('utf16le')
  assert.equal(decoded, "$ProgressPreference = 'SilentlyContinue'; " + a.childSource)
  for (const command of [
    'Microsoft.PowerShell.Core\\Out-Null',
    'Microsoft.PowerShell.Utility\\Write-Output',
  ]) {
    assert.equal(decoded.includes(command), true)
    assert.equal(command.charCodeAt(command.indexOf('\\')), 92)
  }
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 512 + 3 + a.childArguments.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childSource.length),
    a.childSource,
  )
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(
    a.childSource.slice(a.childAdapterOffset, a.childAdapterOffset + adapter.source.length),
    adapter.source,
  )
})

// 只在五confirmed完整診斷配缺陷observed；缺任何證據或錯marker不得冒成功。
test('stdout-exit decodes defect evidence separately from probe unavailability and product success', async () => {
  const value = await stdoutExitApi()
  const a = value.createNativeProbePowerShellStdoutExitArtifact()
  const complete = value.createNativeProbePowerShellLoadOnlySupervisorArtifact().expectedStdout
  assert.equal(a.expectedStdout, complete + stdoutExitObserved)
  const parsed = value.parseNativeProbeStdoutExitOutput(a.expectedStdout)
  assert.equal(parsed.status, 'defect_observed')
  assert.equal(parsed.diagnostic.phase, 'complete')
  assert.equal(Object.isFrozen(parsed) && Object.isFrozen(parsed.diagnostic), true)
  assert.deepEqual(
    value.parseNativeProbeStdoutExitOutput(a.expectedStdout.replaceAll('\n', '\r\n')),
    parsed,
  )
  for (const name of [
    'childStart',
    'childExit',
    'childPolicyRestore',
    'parentPolicyVerify',
    'resourcesClose',
  ]) {
    const partial = complete
      .replace('"phase":"complete","reason":"none"', '"phase":"unknown","reason":"unknown"')
      .replace(`"${name}":"confirmed"`, `"${name}":"unconfirmed"`)
    assert.throws(() => value.parseNativeProbeStdoutExitOutput(partial + stdoutExitObserved))
    assert.equal(
      value.parseNativeProbeStdoutExitOutput(partial + stdoutExitUnavailable).status,
      'unavailable',
    )
  }
  for (const wire of [
    complete + stdoutExitUnavailable,
    complete,
    stdoutExitObserved,
    a.expectedStdout.slice(0, -1),
    a.expectedStdout + '\n',
    a.expectedStdout + stdoutExitObserved,
    a.expectedStdout.replace('stdoutExitMixed=True', 'stdoutExitMixed=False'),
    a.expectedStdout.replace('"version":1', '"version":1,"version":1'),
    'x'.repeat(1281),
    null,
    undefined,
    Symbol('PUBLIC'),
  ])
    assert.throws(() => value.parseNativeProbeStdoutExitOutput(wire), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  assert.equal(
    value.parseNativeProbeStdoutExitOutput(
      a.wireFixtures.find((item) => item.label === 'case_unavailable').wire,
    ).status,
    'unavailable',
  )
})

// 來源metadata須計算真內容且不可覆寫；輸入getter或toString不得被碰觸。
test('stdout-exit freezes actual source provenance and rejects overrides without coercion', async () => {
  const value = await stdoutExitApi()
  const a = value.createNativeProbePowerShellStdoutExitArtifact()
  for (const [s, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(Buffer.byteLength(s), bytes)
    assert.equal(s.length, units)
    assert.equal(createHash('sha256').update(s).digest('hex'), pin)
    assert.equal(s.endsWith('\n'), true)
    assert.equal(s.includes('\r') || s.includes('\0'), false)
  }
  let touched = 0
  const input = {
    // 不接受外部來源覆寫診斷候選。
    get source() {
      touched++
      return 'PUBLIC'
    },
    // 不把未知物件轉型成wire。
    toString() {
      touched++
      return a.expectedStdout
    },
  }
  for (const arg of [undefined, null, input, 0, false, 'PUBLIC']) {
    assert.throws(() => value.createNativeProbePowerShellStdoutExitArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.throws(() => value.parseNativeProbeStdoutExitOutput(input))
  assert.equal(touched, 0)
  for (const item of [a, a.wireFixtures, ...a.wireFixtures])
    assert.equal(Object.isFrozen(item), true)
})

// 不能為這次診斷改寫已交付ag／ai或任何接手位元組。
test('stdout-exit preserves the complete takeover prefixes and the accepted bundle-help artifacts', async () => {
  const value = await stdoutExitApi()
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      155835,
      '1e25d483ccda765baf164af3e153fc4a49110e912feff199b4b74b10c7e9270f',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      220597,
      'a4c4e3a5bdbe6e71061ac642c7e2d13f54ceaed729c4e6050a7712c2c385d211',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  const a = value.createNativeProbePowerShellBundleHelpHandoffArtifact()
  assert.equal(a.parentSha256, 'b8cce02eb09cda8d2d165c4ed9a25c4c8d54c8a0b6dd3e0b6aaf7b87522feaf5')
  assert.equal(a.stage1Sha256, 'd9329cfbd7c45d2c1b5ff3421aa68eebe551d9dee345082173951d9ef2e19380')
  assert.equal(a.stage2Sha256, '5d5eeedd6358a0eb310754566a8217389081c4bd40093ddb4a6d243a9e75f80c')
})

// 交接API缺失須先斷言RED，不從未測wrapper直接派發原生。
async function stdoutExitHandoffApi() {
  const value = await api()
  assert.equal(typeof value.createNativeProbePowerShellStdoutExitHandoffArtifact, 'function')
  return value
}

// 按PS here-string尾LF規則讀真來源的兩段body，獨立於生成器的切割metadata。
function stdoutExitHandoffParts(source) {
  const text = source.replaceAll('\r\n', '\n')
  const bodies = []
  let wrapper = text
  for (const name of ['A', 'B']) {
    const startText = `$rdwebHandoffPart${name} = @'\n`
    const start = text.indexOf(startText)
    assert.equal(start >= 0, true)
    assert.equal(text.indexOf(startText, start + 1), -1)
    const end = text.indexOf("\n'@\n", start + startText.length)
    assert.equal(end > start, true)
    const body = text.slice(start + startText.length, end)
    bodies.push(body)
    wrapper = wrapper.replace(startText + body + "\n'@\n", '')
  }
  return { bodies, wrapper }
}

// 漏尾LF或delimiter多一字元均不能重建pinned parent，不以生成器計算當oracle。
test('stdout-exit-handoff reassembles the exact nested-child parent under LF and CRLF semantics', async () => {
  const value = await stdoutExitHandoffApi()
  const a = value.createNativeProbePowerShellStdoutExitHandoffArtifact()
  const parent = value.createNativeProbePowerShellStdoutExitArtifact()
  for (const source of [a.stage1Source, a.stage1Source.replaceAll('\n', '\r\n')]) {
    const { bodies, wrapper } = stdoutExitHandoffParts(source)
    assert.equal(
      wrapper.includes(
        '$rdwebHandoffA + $rdwebHandoffLf + "\'@" + $rdwebHandoffLf + $rdwebHandoffB',
      ),
      true,
    )
    const assembled = bodies[0] + "\n'@\n" + bodies[1]
    assert.equal(assembled, parent.source)
    assert.equal(Buffer.byteLength(assembled), 35386)
    assert.equal(assembled.length, 34000)
    assert.equal(
      createHash('sha256').update(assembled).digest('hex'),
      '9d7f19e9d05132f3ee6f9dd6a7b25954432aea38965b93203743c017e6447416',
    )
    assert.notEqual(bodies[0] + "\n'@'\n" + bodies[1], parent.source)
  }
  const broken = stdoutExitHandoffParts(a.stage1Source.replaceAll("\n\n'@\n", "\n'@\n")).bodies
  assert.notEqual(broken[0] + "\n'@\n" + broken[1], parent.source)
})

// stage1的literal外若建flag／啟程序／Invoke即越權；只允許本候選RAM搬運。
test('stdout-exit-handoff stage one is inert and binds its actual reconstructed payload to exact guards', async () => {
  const value = await stdoutExitHandoffApi()
  const a = value.createNativeProbePowerShellStdoutExitHandoffArtifact()
  const { wrapper } = stdoutExitHandoffParts(a.stage1Source)
  assert.equal(
    /ScriptBlock|\.Invoke\(|\.Start\(|ProcessStartInfo|FileStream|Set-ExecutionPolicy|New-Item|Once/.test(
      wrapper,
    ),
    false,
  )
  assert.equal(wrapper.includes(`Set-Variable -Name ${a.payloadVariable} -Scope Global`), true)
  assert.equal(wrapper.includes(`Remove-Variable -Name ${a.payloadVariable} -Scope Global`), true)
  for (const guard of [
    '$rdwebHandoffPayload.IndexOf([char]13) -lt 0',
    '$rdwebHandoffPayload.IndexOf([char]0) -lt 0',
    '$rdwebHandoffPayload.EndsWith($rdwebHandoffLf)',
    '[Text.Encoding]::UTF8.GetByteCount($rdwebHandoffPayload) -eq 35386',
    '$rdwebHandoffPayload.Length -eq 34000',
    "$rdwebHandoffHash -ceq '9d7f19e9d05132f3ee6f9dd6a7b25954432aea38965b93203743c017e6447416'",
    'finally { $rdwebHandoffSha.Dispose() }',
  ])
    assert.equal(wrapper.includes(guard), true, guard)
  assert.equal(
    a.integrityLine,
    'rdweb_stdout_exit_handoff_integrity_v1,status=ok,bytes=35386,units=34000,sha256=9d7f19e9d05132f3ee6f9dd6a7b25954432aea38965b93203743c017e6447416',
  )
  assert.equal(wrapper.includes('不自行重貼'), true)
})

// 未知值不得coercion；缺payload／改動必須在唯一Invoke之前拒絕，不能加returned補成功。
test('stdout-exit-handoff stage two revalidates typed same-session bytes before a single invocation', async () => {
  const value = await stdoutExitHandoffApi()
  const a = value.createNativeProbePowerShellStdoutExitHandoffArtifact()
  const s = a.stage2Source
  const invoke = s.indexOf('[void]([ScriptBlock]::Create($rdwebHandoffText).Invoke())')
  assert.equal(invoke > 0, true)
  assert.equal(s.split('.Invoke(').length, 2)
  for (const guard of [
    `Get-Variable -Name ${a.payloadVariable} -Scope Global`,
    '$null -eq $rdwebHandoffValue',
    '$rdwebHandoffValue.Value -isnot [string]',
    '$rdwebHandoffText = $rdwebHandoffValue.Value',
    '$rdwebHandoffText.IndexOf([char]13) -ge 0',
    '$rdwebHandoffText.IndexOf([char]0) -ge 0',
    '-not $rdwebHandoffText.EndsWith($rdwebHandoffLf)',
    '[Text.Encoding]::UTF8.GetByteCount($rdwebHandoffText) -ne 35386',
    '$rdwebHandoffText.Length -ne 34000',
    "$rdwebHandoffHash -cne '9d7f19e9d05132f3ee6f9dd6a7b25954432aea38965b93203743c017e6447416'",
  ])
    assert.equal(s.indexOf(guard) >= 0 && s.indexOf(guard) < invoke, true, guard)
  assert.equal(s.includes('[string]$rdwebHandoffValue.Value'), false)
  assert.equal(s.includes('$rdwebHandoffText.Replace('), false)
  assert.equal(
    /returned|stdoutExitMixed=True|receiverStarted|load_only|Set-ExecutionPolicy/.test(s),
    false,
  )
  assert.equal(s.includes(`catch { [Console]::Write('${a.unavailableLine}' + [char]10) }`), true)
  assert.throws(() => value.parseNativeProbeStdoutExitOutput(a.unavailableLine + '\n'))
})

// 改動或截斷真搬運body必須離開固定pin；此為JS重建驗證，不冒稱PS負向已跑。
test('stdout-exit-handoff rejects altered reconstruction against the real emitted parent pin', async () => {
  const value = await stdoutExitHandoffApi()
  const a = value.createNativeProbePowerShellStdoutExitHandoffArtifact()
  const { bodies, wrapper } = stdoutExitHandoffParts(a.stage1Source)
  const payload = bodies[0] + "\n'@\n" + bodies[1]
  const pin = wrapper.match(/\$rdwebHandoffHash -ceq '([a-f0-9]{64})'/)?.[1]
  assert.equal(pin, '9d7f19e9d05132f3ee6f9dd6a7b25954432aea38965b93203743c017e6447416')
  for (const bad of [
    payload.slice(0, -1),
    payload.slice(1),
    payload + '\n',
    payload + '\0',
    payload.replace('\n', '\r'),
    payload.replace('Restricted', 'PUBLICFAIL'),
  ]) {
    assert.notEqual(createHash('sha256').update(bad).digest('hex'), pin)
  }
})

// 檔案與來源pins不能沿用舊metadata；未知override及getter不可觸發。
test('stdout-exit-handoff freezes deterministic true source metadata and rejects overrides', async () => {
  const value = await stdoutExitHandoffApi()
  const a = value.createNativeProbePowerShellStdoutExitHandoffArtifact()
  assert.equal(a.nativeVerified, false)
  assert.equal(a.transport, 'interactive_ram_only')
  assert.equal(a.encodedCommandSupported, false)
  for (const stage of ['stage1', 'stage2']) {
    const source = a[stage + 'Source']
    assert.equal(a[stage + 'Utf8Bytes'], Buffer.byteLength(source))
    assert.equal(a[stage + 'Utf16Units'], source.length)
    assert.equal(a[stage + 'Sha256'], createHash('sha256').update(source).digest('hex'))
    assert.equal(source.endsWith('\n'), true)
    assert.equal(source.includes('\r') || source.includes('\0'), false)
  }
  assert.equal(Object.isFrozen(a), true)
  let touched = 0
  const input = {
    // 不允許外部輸入改寫已核准parent或payload名稱。
    get source() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const arg of [undefined, null, input, false, 0, 'PUBLIC']) {
    assert.throws(() => value.createNativeProbePowerShellStdoutExitHandoffArtifact(arg), {
      message: 'receiver_native_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
  assert.deepEqual(a, value.createNativeProbePowerShellStdoutExitHandoffArtifact())
})

// 本次授權只許交接，不得改動aj／任何舊候選與接手prefix。
test('stdout-exit-handoff preserves the full takeover prefixes and the approved parent and child pins', async () => {
  const value = await stdoutExitHandoffApi()
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      162513,
      'c9edc43e0e9d0ac4ffee1ee9f197e1b6076b1197e496dc5157ce3f97d2adfee8',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      231809,
      'b40f10988af3e185bc48473392af9719ced902475984f2f1eb002454d048035e',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  const a = value.createNativeProbePowerShellStdoutExitArtifact()
  assert.equal(a.sha256, '9d7f19e9d05132f3ee6f9dd6a7b25954432aea38965b93203743c017e6447416')
  assert.equal(a.childSha256, '2ff3c745e1728f5fe62c73bb1c65fb925d09bdd951c33f253b4b401b6bd7ae14')
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 31254)
})

// 新監督／parser／交接缺失必須先斷言RED，不執行來源fixture或建立Windows現場。
async function exitChannelRefApi() {
  const value = await api()
  for (const name of [
    'createNativeProbePowerShellExitChannelRefArtifact',
    'parseNativeProbeExitChannelRefChildOutput',
    'parseNativeProbeExitChannelRefOutput',
    'createNativeProbePowerShellExitChannelRefHandoffArtifact',
  ])
    assert.equal(typeof value[name], 'function', name)
  return value
}

const refTestLine =
  'receiver_exit_channel_cases_observed,syntheticExit=True,nativeExecutable=False\n'
const refChildReadyLine =
  'receiver_native_diagnostic,{"version":1,"phase":"unknown","reason":"unknown","childStart":"unknown","childExit":"unknown","childPolicyRestore":"confirmed","parentPolicyVerify":"unknown","resourcesClose":"confirmed"}\n'
const refCompleteLine =
  'receiver_native_diagnostic,{"version":1,"phase":"complete","reason":"none","childStart":"confirmed","childExit":"confirmed","childPolicyRestore":"confirmed","parentPolicyVerify":"confirmed","resourcesClose":"confirmed"}\n'
const refObservedLine =
  'receiver_windows_exit_channel_ref_observed,syntheticExit=True,nativeExecutable=False,sessionStarted=False\n'
const refUnavailableLine =
  'receiver_windows_exit_channel_ref_unavailable,terminalUse=stop,sessionStarted=False\n'
const refRootName = 'rdweb exit channel validation 公開 20261026-01'
// 獨立固定來源契約；未返回／非int0不得越過完成門檻，原test exit與catch不可重寫。
const refRunSource = String.raw`  $loadStage = 'child_parse'; $loadReason = 'unexpected_output'
  $LASTEXITCODE = 2
  & (Join-Path $loadPackage 'test-receiver-exit-channel.ps1')
  $loadTestExit = $LASTEXITCODE
  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 0) { throw 'receiver_native_load_rejected' }
`
// parent必須先驗首marker再交原canonical decoder，不能以只含marker的exit0補成功。
const refFrameSource = String.raw`  $refWire = $frame.Replace(([string][char]13 + [char]10), ([string][char]10))
  $refPrefix = 'receiver_exit_channel_cases_observed,syntheticExit=True,nativeExecutable=False' + [char]10
  if (-not $refWire.StartsWith($refPrefix, [StringComparison]::Ordinal)) { throw 'receiver_native_load_rejected' }
  $child = ConvertFrom-RdwebLoadFrame ($refWire.Substring($refPrefix.Length))
`
const refSources = [
  {
    name: 'integrity.json',
    bytes: 630,
    sha256: '0ca5642c14ac4c3f7ea2be50398868174f964236decf899d0fee312e7f39d668',
  },
  {
    name: 'start-windows-test-receiver.ps1',
    bytes: 7637,
    sha256: '8d07ea5ac6b2b364bca0389b76aa5b0929c25d36a6b7ebcbd8fcd8e43510c392',
  },
  {
    name: 'test-receiver-exit-channel.ps1',
    bytes: 3786,
    sha256: '792cd4b4d1927b601f171a9c228d1320961095c1d1dba6f597a166991ddf4148',
  },
  {
    name: 'windows-host-observer-supervisor.ps1',
    bytes: 9816,
    sha256: '51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2',
  },
  {
    name: 'LICENSE',
    bytes: 34523,
    sha256: '8486a10c4393cee1c25392769ddd3b2d6c242d6ec7928e1414efff7dfb2f07ef',
  },
]

// 從實檔呼公開回歸，若改成inline函數／孫程序或只exit0即成功，此來源契約必須失敗。
test('exit-channel-ref calls the actual pinned regression file and gates completion after its return', async () => {
  const value = await exitChannelRefApi()
  const a = value.createNativeProbePowerShellExitChannelRefArtifact()
  assert.equal(a.purpose, 'receiver_native_exit_channel_ref_v1')
  assert.equal(a.packageRelativePath, refRootName)
  assert.equal(a.onceFlag, 'RdwebReceiverExitChannelRef20261026Once')
  assert.equal(a.nativeVerified, false)
  assert.equal(a.productEntryVerified, false)
  assert.equal(a.childSource.includes(refRunSource + '  $loadLoaded = $true\n'), true)
  assert.equal(a.source.includes(refFrameSource), true)
  assert.equal(a.expectedChildStdout, refTestLine + refChildReadyLine)
  assert.equal(a.expectedStdout, refCompleteLine + refObservedLine)
  assert.equal(
    /function (?:Invoke-ReceiverChild|Invoke-ReceiverStart|Assert-ExitChannel)|ProcessStartInfo|\.Start\(|node\.exe|WriteAll|New-Item/.test(
      a.childSource,
    ),
    false,
  )
  assert.equal(
    a.childSource.includes(". (Join-Path $loadPackage 'start-windows-test-receiver.ps1')"),
    false,
  )
})

// 包來源與生成器不應互相產生oracle；直接以固定供應鏈pins逐byte核對保存的五檔。
test('exit-channel-ref pins the exact five am source files without rebuilding the fixture', async () => {
  const value = await exitChannelRefApi()
  const a = value.createNativeProbePowerShellExitChannelRefArtifact()
  assert.deepEqual(a.trustedSources, refSources)
  const { readFileSync } = await import('node:fs')
  for (const item of refSources) {
    const b = readFileSync(
      new URL(
        '../../.cache/receiver-exit-channel-validation-20261026-01/' + item.name,
        import.meta.url,
      ),
    )
    assert.equal(b.length, item.bytes)
    assert.equal(createHash('sha256').update(b).digest('hex'), item.sha256)
    assert.equal(
      a.source.includes(
        `@{ Name = '${item.name}'; Bytes = ${item.bytes}; Pin = '${item.sha256}' }`,
      ),
      true,
    )
  }
})

// 完整重建基底child，避免為exit腳本移除finally、guard或讓合成測試證據歸錯owner。
test('exit-channel-ref preserves the whole baseline child outside path, parser list and file invocation', async () => {
  const value = await exitChannelRefApi()
  const a = value.createNativeProbePowerShellExitChannelRefArtifact()
  const b = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  let s = a.childSource.replace(refRootName, b.packageRelativePath)
  s = s.replace(
    "@('start-windows-test-receiver.ps1', 'windows-host-observer-supervisor.ps1', 'test-receiver-exit-channel.ps1')",
    "@('start-windows-test-receiver.ps1', 'windows-host-observer-supervisor.ps1')",
  )
  s = s.replace(refRunSource, "  . (Join-Path $loadPackage 'start-windows-test-receiver.ps1')\n")
  assert.equal(s, b.childSource)
})

// 反向還原整個parent，證明新增wire處理沒有刪減可信來源、程序期限或cleanup。
test('exit-channel-ref preserves all baseline parent guards and supervision outside explicit replacements', async () => {
  const value = await exitChannelRefApi()
  const a = value.createNativeProbePowerShellExitChannelRefArtifact()
  const b = value.createNativeProbePowerShellLoadOnlySupervisorArtifact()
  const oldListStart = b.source.indexOf('  $loadSources = @(\n')
  const oldListEnd = b.source.indexOf('\n  )\n', oldListStart) + 5
  let s = a.source.replace(a.childSource, b.childSource)
  const listStart = s.indexOf('  $loadSources = @(\n')
  const listEnd = s.indexOf('\n  )\n', listStart) + 5
  s = s.slice(0, listStart) + b.source.slice(oldListStart, oldListEnd) + s.slice(listEnd)
  s = s.replace(refRootName, b.packageRelativePath)
  s = s.replace(a.childSha256, b.childSha256)
  s = s.replaceAll(
    'RdwebReceiverExitChannelRef20261026Once',
    'RdwebReceiverLoadOnlyDiagnostic20261025Once',
  )
  s = s.replace(refFrameSource, '  $child = ConvertFrom-RdwebLoadFrame $frame\n')
  s = s.replace(
    "'" + (refTestLine + refChildReadyLine).slice(0, -1) + "' + [char]10",
    "'" + refChildReadyLine.slice(0, -1) + "' + [char]10",
  )
  s = s.replace(
    "[Text.Encoding]::Unicode.GetBytes('$ProgressPreference = ''SilentlyContinue''; ' + $loadChildSource)",
    '[Text.Encoding]::Unicode.GetBytes($loadChildSource)',
  )
  const footerStart = s.lastIndexOf('# ref回歸結果只代表固定合成案例')
  assert.equal(footerStart > 0, true)
  s =
    s.slice(0, footerStart) +
    b.source.slice(b.source.lastIndexOf('try { [Console]::Write((Format-RdwebNativeDiagnostic'))
  assert.equal(s, b.source)
})

// marker、canonical、次序、exit及stderr缺一都不能視為完整child證據；真跑JS parser。
test('exit-channel-ref child decoder requires exact ordered output, exit zero and empty stderr', async () => {
  const value = await exitChannelRefApi()
  const good = refTestLine + refChildReadyLine
  const parsed = value.parseNativeProbeExitChannelRefChildOutput(good, '', 0)
  assert.equal(parsed.childPolicyRestore, 'confirmed')
  assert.equal(parsed.resourcesClose, 'confirmed')
  assert.equal(Object.isFrozen(parsed), true)
  assert.deepEqual(
    value.parseNativeProbeExitChannelRefChildOutput(good.replaceAll('\n', '\r\n'), '', 0),
    parsed,
  )
  for (const wire of [
    refTestLine,
    refChildReadyLine,
    refChildReadyLine + refTestLine,
    good + '\n',
    good + refChildReadyLine,
    good.slice(0, -1),
    good.replace('"childPolicyRestore":"confirmed"', '"childPolicyRestore":"unknown"'),
    good.replace('"resourcesClose":"confirmed"', '"resourcesClose":"unconfirmed"'),
    good.replace('"childExit":"unknown"', '"childExit":"confirmed"'),
    good.replace('"version":1', '"version":1,"version":1'),
    'x'.repeat(1025),
    null,
  ])
    assert.throws(() => value.parseNativeProbeExitChannelRefChildOutput(wire, '', 0))
  for (const code of [1, 2, -1, '0', null, undefined]) {
    assert.throws(() => value.parseNativeProbeExitChannelRefChildOutput(good, '', code))
  }
  for (const stderr of ['PUBLIC', null, undefined]) {
    assert.throws(() => value.parseNativeProbeExitChannelRefChildOutput(good, stderr, 0))
  }
})

// parent的完整觀察是合成回歸通過，不是缺陷observed或完整產品成功；缺證據仍拒絕。
test('exit-channel-ref parent decoder separates limited cases observed from unavailable evidence', async () => {
  const value = await exitChannelRefApi()
  const good = refCompleteLine + refObservedLine
  assert.equal(value.parseNativeProbeExitChannelRefOutput(good).status, 'ref_cases_observed')
  assert.deepEqual(
    value.parseNativeProbeExitChannelRefOutput(good.replaceAll('\n', '\r\n')),
    value.parseNativeProbeExitChannelRefOutput(good),
  )
  for (const name of [
    'childStart',
    'childExit',
    'childPolicyRestore',
    'parentPolicyVerify',
    'resourcesClose',
  ]) {
    const partial = refCompleteLine
      .replace('"phase":"complete","reason":"none"', '"phase":"unknown","reason":"unknown"')
      .replace(`"${name}":"confirmed"`, `"${name}":"unconfirmed"`)
    assert.throws(() => value.parseNativeProbeExitChannelRefOutput(partial + refObservedLine))
    assert.equal(
      value.parseNativeProbeExitChannelRefOutput(partial + refUnavailableLine).status,
      'unavailable',
    )
  }
  for (const wire of [
    good.slice(0, -1),
    good + '\n',
    good + refObservedLine,
    refObservedLine + refCompleteLine,
    refCompleteLine,
    refCompleteLine + refUnavailableLine,
    good.replace('nativeExecutable=False', 'nativeExecutable=True'),
    'x'.repeat(1281),
    null,
  ]) {
    assert.throws(() => value.parseNativeProbeExitChannelRefOutput(wire))
  }
})

// 子命令必須真的嵌入新child及preamble，容量含完整exe／空格／Base64且不擴大上限。
test('exit-channel-ref binds actual source positions and full bounded command transport', async () => {
  const value = await exitChannelRefApi()
  const a = value.createNativeProbePowerShellExitChannelRefArtifact()
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  assert.equal(a.childArguments.startsWith(prefix), true)
  assert.equal(
    Buffer.from(a.childArguments.slice(prefix.length), 'base64').toString('utf16le'),
    "$ProgressPreference = 'SilentlyContinue'; " + a.childSource,
  )
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 512 + 3 + a.childArguments.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.equal(a.source.includes('$exe.Length + 3 + $arguments.Length -gt 32766'), true)
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childSource.length),
    a.childSource,
  )
  assert.deepEqual(
    [a.normalBudgetMs, a.cleanupBudgetMs, a.totalBudgetMs, a.stdoutMaxBytes, a.stderrMaxBytes],
    [18000, 2000, 20000, 1024, 128],
  )
  for (const [s, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(Buffer.byteLength(s), bytes)
    assert.equal(s.length, units)
    assert.equal(createHash('sha256').update(s).digest('hex'), pin)
  }
})

// 單一delimiter重建及尾LF需與PS語意一致，不因新增root／wire就套錯舊literal。
test('exit-channel-ref handoff reassembles the actual parent without changing child or source pins', async () => {
  const value = await exitChannelRefApi()
  const a = value.createNativeProbePowerShellExitChannelRefHandoffArtifact()
  const parent = value.createNativeProbePowerShellExitChannelRefArtifact()
  for (const s of [a.stage1Source, a.stage1Source.replaceAll('\n', '\r\n')]) {
    const { bodies, wrapper } = stdoutExitHandoffParts(s)
    assert.equal(
      wrapper.includes(
        '$rdwebHandoffA + $rdwebHandoffLf + "\'@" + $rdwebHandoffLf + $rdwebHandoffB',
      ),
      true,
    )
    assert.equal(bodies[0] + "\n'@\n" + bodies[1], parent.source)
    assert.notEqual(bodies[0] + "\n'@'\n" + bodies[1], parent.source)
  }
  const broken = stdoutExitHandoffParts(a.stage1Source.replaceAll("\n\n'@\n", "\n'@\n")).bodies
  assert.notEqual(broken[0] + "\n'@\n" + broken[1], parent.source)
  assert.equal(a.parentSha256, parent.sha256)
})

// 第一段不得啟程序或政策，第二段必須先驗string與真pins再唯一Invoke，無returned捷徑。
test('exit-channel-ref handoff retains inert stage one and typed fail-closed stage two', async () => {
  const value = await exitChannelRefApi()
  const a = value.createNativeProbePowerShellExitChannelRefHandoffArtifact()
  const { wrapper } = stdoutExitHandoffParts(a.stage1Source)
  assert.equal(
    /ScriptBlock|\.Invoke\(|\.Start\(|ProcessStartInfo|FileStream|Set-ExecutionPolicy|Once/.test(
      wrapper,
    ),
    false,
  )
  assert.equal(wrapper.includes(`Set-Variable -Name ${a.payloadVariable} -Scope Global`), true)
  assert.equal(wrapper.includes(`Remove-Variable -Name ${a.payloadVariable} -Scope Global`), true)
  for (const [s, comparison, name] of [
    [wrapper, 'eq', 'Payload'],
    [a.stage2Source, 'ne', 'Text'],
  ]) {
    assert.equal(
      s.includes(`GetByteCount($rdwebHandoff${name}) -${comparison} ${a.parentUtf8Bytes}`),
      true,
    )
    assert.equal(
      s.includes(`$rdwebHandoff${name}.Length -${comparison} ${a.parentUtf16Units}`),
      true,
    )
    assert.equal(s.includes(`$rdwebHandoffHash -c${comparison} '${a.parentSha256}'`), true)
  }
  const s = a.stage2Source
  assert.equal(s.split('.Invoke(').length, 2)
  assert.equal(s.indexOf('$rdwebHandoffValue.Value -isnot [string]') < s.indexOf('.Invoke('), true)
  assert.equal(s.includes('[string]$rdwebHandoffValue.Value'), false)
  assert.equal(/returned|ref_observed|Set-ExecutionPolicy/.test(s), false)
  assert.equal(s.includes(`catch { [Console]::Write('${a.unavailableLine}' + [char]10) }`), true)
  assert.throws(() => value.parseNativeProbeExitChannelRefOutput(a.unavailableLine + '\n'))
})

// 全部新邊界拒絕未知值且不執行getter／toString；真來源metadata不可變。
test('exit-channel-ref rejects overrides and coercion and freezes true provenance', async () => {
  const value = await exitChannelRefApi()
  let touched = 0
  const input = {
    // 不允許未知來源覆寫固定fixture。
    get source() {
      touched++
      return 'PUBLIC'
    },
    // 不把外部物件當wire執行轉型。
    toString() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const create of [
    value.createNativeProbePowerShellExitChannelRefArtifact,
    value.createNativeProbePowerShellExitChannelRefHandoffArtifact,
  ]) {
    for (const arg of [undefined, null, input, false, 0, 'PUBLIC']) assert.throws(() => create(arg))
  }
  assert.throws(() => value.parseNativeProbeExitChannelRefChildOutput(input, '', 0))
  assert.throws(() => value.parseNativeProbeExitChannelRefOutput(input))
  assert.equal(touched, 0)
  const a = value.createNativeProbePowerShellExitChannelRefArtifact()
  for (const item of [a, a.trustedSources, ...a.trustedSources, a.wireFixtures, ...a.wireFixtures])
    assert.equal(Object.isFrozen(item), true)
  const handoff = value.createNativeProbePowerShellExitChannelRefHandoffArtifact()
  assert.equal(Object.isFrozen(handoff), true)
  for (const stage of ['stage1', 'stage2']) {
    const s = handoff[stage + 'Source']
    assert.equal(handoff[stage + 'Sha256'], createHash('sha256').update(s).digest('hex'))
    assert.equal(handoff[stage + 'Utf8Bytes'], Buffer.byteLength(s))
    assert.equal(handoff[stage + 'Utf16Units'], s.length)
    assert.equal(s.includes('\r') || s.includes('\0'), false)
    assert.equal(s.endsWith('\n'), true)
  }
})

// 原包／歷史候選的prefix與am ZIP不可為新監督而改寫或重建。
test('exit-channel-ref preserves takeover prefixes, am archive and accepted old artifact pins', async () => {
  const value = await exitChannelRefApi()
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      167973,
      'ed98ba6b0281284cfd550955a54c27aa863dc5452015f3cf93a746d0fbe15e5d',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      240712,
      'f4714a2b9edd7559a29dfb65396e9ffafceaa8183a154584f33cd6fd9193751a',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  const archive = readFileSync(
    new URL('../../.cache/receiver-exit-channel-validation-20261026-01.zip', import.meta.url),
  )
  assert.equal(archive.length, 20464)
  assert.equal(
    createHash('sha256').update(archive).digest('hex'),
    '9c2afe6cc6a467e4fd6840aa976a6d12d163ad47c9916d4ba24b6235d2e44c5b',
  )
  assert.equal(
    value.createNativeProbePowerShellStdoutExitArtifact().sha256,
    '9d7f19e9d05132f3ee6f9dd6a7b25954432aea38965b93203743c017e6447416',
  )
  assert.equal(
    value.createNativeProbePowerShellStdoutExitHandoffArtifact().stage1Sha256,
    '4fda1ba314a01ec459a91c90fed385aad884d6516af408b43c18c182e15d97c1',
  )
})

// 新scope觀察必須先因API缺失RED，不能把舊ref失敗parser當作新診斷。
async function exitScopeApi() {
  const value = await api()
  for (const name of [
    'createNativeProbePowerShellExitScopeArtifact',
    'parseNativeProbeExitScopeChildOutput',
    'parseNativeProbeExitScopeOutput',
    'createNativeProbePowerShellExitScopeHandoffArtifact',
  ])
    assert.equal(typeof value[name], 'function', name)
  return value
}

const scopeShadowLine = 'receiver_exit_scope_v1,beforeGlobal=int2,afterGlobal=int0,local=int2\n'
const scopeZeroLine = 'receiver_exit_scope_v1,beforeGlobal=missing,afterGlobal=int0,local=int0\n'
const scopeAbsentLine = 'receiver_exit_scope_v1,unavailable\n'
const scopePassedLine =
  'receiver_windows_exit_scope_observed,regression=passed,sessionStarted=False\n'
const scopeFailedLine =
  'receiver_windows_exit_scope_observed,regression=unavailable,sessionStarted=False\n'
const scopeUnavailableLine =
  'receiver_windows_exit_scope_unavailable,terminalUse=stop,sessionStarted=False\n'
const scopeChildFailed = refChildReadyLine.replace(
  '"phase":"unknown","reason":"unknown"',
  '"phase":"child_parse","reason":"unexpected_output"',
)
const scopeParentFailed =
  'receiver_native_diagnostic,{"version":1,"phase":"child_parse","reason":"unexpected_output","childStart":"confirmed","childExit":"unconfirmed","childPolicyRestore":"confirmed","parentPolicyVerify":"confirmed","resourcesClose":"confirmed"}\n'

// 真decoder需接受scope差異觀察，但原回歸失敗、exit2與canonical不可改判。
test('exit-scope decodes observations without promoting global zero into local success', async () => {
  const v = await exitScopeApi()
  const child = v.parseNativeProbeExitScopeChildOutput(
    refTestLine + scopeShadowLine + scopeChildFailed,
    '',
    2,
  )
  assert.equal(child.scope.beforeGlobal, 'int2')
  assert.equal(child.scope.afterGlobal, 'int0')
  assert.equal(child.scope.local, 'int2')
  assert.equal(child.regressionStatus, 'unavailable')
  assert.equal(child.diagnostic.phase, 'child_parse')
  const parent = v.parseNativeProbeExitScopeOutput(
    scopeParentFailed + scopeShadowLine + scopeFailedLine,
  )
  assert.equal(parent.status, 'scope_observed')
  assert.equal(parent.regressionStatus, 'unavailable')
  assert.equal(parent.diagnostic.childExit, 'unconfirmed')
  assert.equal(Object.isFrozen(parent.scope), true)
  const good = refCompleteLine + scopeZeroLine + scopePassedLine
  assert.equal(v.parseNativeProbeExitScopeOutput(good).regressionStatus, 'passed')
  assert.deepEqual(
    v.parseNativeProbeExitScopeOutput(good.replaceAll('\n', '\r\n')),
    v.parseNativeProbeExitScopeOutput(good),
  )
})

// 獨立列舉安全分類，未知值、缺值local與canonical／exit矛盾都必須拒絕。
test('exit-scope child decoder enforces finite ordered classifications and original exit gate', async () => {
  const v = await exitScopeApi()
  for (const before of ['missing', 'int0', 'int2', 'other_int', 'non_int']) {
    for (const after of ['missing', 'int0', 'int2', 'other_int', 'non_int']) {
      for (const local of ['int0', 'int2', 'other_int', 'non_int']) {
        const line = `receiver_exit_scope_v1,beforeGlobal=${before},afterGlobal=${after},local=${local}\n`
        const zero = local === 'int0'
        const wire = refTestLine + line + (zero ? refChildReadyLine : scopeChildFailed)
        assert.equal(
          v.parseNativeProbeExitScopeChildOutput(wire, '', zero ? 0 : 2).scope.local,
          local,
        )
        assert.throws(() => v.parseNativeProbeExitScopeChildOutput(wire, '', zero ? 2 : 0))
      }
    }
  }
  const good = refTestLine + scopeShadowLine + scopeChildFailed
  for (const wire of [
    good.replace('local=int2', 'local=missing'),
    good.replace('local=int2', 'local=PUBLIC'),
    scopeShadowLine + refTestLine + scopeChildFailed,
    refTestLine + scopeChildFailed,
    refTestLine + scopeShadowLine,
    good + '\n',
    good + scopeShadowLine,
    good.slice(0, -1),
    good.replace('"resourcesClose":"confirmed"', '"resourcesClose":"unconfirmed"'),
    good.replace(scopeChildFailed, refChildReadyLine),
    'x'.repeat(1025),
    null,
  ])
    assert.throws(() => v.parseNativeProbeExitScopeChildOutput(wire, '', 2))
  for (const code of ['2', undefined, null, 1, 3])
    assert.throws(() => v.parseNativeProbeExitScopeChildOutput(good, '', code))
  for (const stderr of ['PUBLIC', null, undefined])
    assert.throws(() => v.parseNativeProbeExitScopeChildOutput(good, stderr, 2))
})

// 結案失敗缺少收尾證據時只能unavailable；不能沿用scope行宣稱觀察已完整。
test('exit-scope parent decoder rejects incomplete cleanup and contradictory terminal markers', async () => {
  const v = await exitScopeApi()
  const good = scopeParentFailed + scopeShadowLine + scopeFailedLine
  for (const wire of [
    good.replace(scopeFailedLine, scopePassedLine),
    good.replace(scopeParentFailed, refCompleteLine),
    good.replace('local=int2', 'local=int0'),
    good + '\n',
    good.slice(0, -1),
    scopeShadowLine + scopeParentFailed + scopeFailedLine,
    good.replace('afterGlobal=int0', 'afterGlobal=0'),
    'x'.repeat(1281),
    null,
  ])
    assert.throws(() => v.parseNativeProbeExitScopeOutput(wire))
  for (const key of ['childStart', 'childPolicyRestore', 'parentPolicyVerify', 'resourcesClose']) {
    const partial = scopeParentFailed.replace(`"${key}":"confirmed"`, `"${key}":"unconfirmed"`)
    assert.throws(() =>
      v.parseNativeProbeExitScopeOutput(partial + scopeShadowLine + scopeFailedLine),
    )
    assert.equal(
      v.parseNativeProbeExitScopeOutput(partial + scopeAbsentLine + scopeUnavailableLine).status,
      'unavailable',
    )
  }
  assert.throws(() =>
    v.parseNativeProbeExitScopeOutput(refCompleteLine + scopeAbsentLine + scopeUnavailableLine),
  )
})

// helper只分類已取得的PSVariable；scope讀取必須在callsite，before分類不得延後。
test('exit-scope keeps the seed call immediate snapshot and exact int-zero guard', async () => {
  const v = await exitScopeApi()
  const a = v.createNativeProbePowerShellExitScopeArtifact()
  const b = v.createNativeProbePowerShellExitChannelRefArtifact()
  assert.equal(a.purpose, 'receiver_native_exit_scope_v1')
  assert.equal(a.onceFlag, 'RdwebReceiverExitScope20261026Once')
  assert.equal(a.packageRelativePath, b.packageRelativePath)
  assert.deepEqual(a.trustedSources, b.trustedSources)
  assert.equal(
    a.childSource.includes(
      '  $LASTEXITCODE = 2\n' +
        a.beforeScopeSource +
        "  & (Join-Path $loadPackage 'test-receiver-exit-channel.ps1')\n  $loadTestExit = $LASTEXITCODE\n" +
        a.afterScopeSource +
        "  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 0) { throw 'receiver_native_load_rejected' }\n  $loadLoaded = $true\n",
    ),
    true,
  )
  assert.equal(a.beforeScopeSource.includes('Get-RdwebExitClass'), true)
  assert.equal(a.beforeScopeSource.includes('-Scope Global'), true)
  assert.equal(a.afterScopeSource.includes('-Name loadTestExit -Scope Local'), true)
  assert.equal(
    /Set-Variable|Remove-Variable|\$global:LASTEXITCODE\s*=|\$script:LASTEXITCODE\s*=|ProcessStartInfo|\.Start\(|node\.exe/.test(
      a.scopeHelperSource + a.beforeScopeSource + a.afterScopeSource,
    ),
    false,
  )
  assert.equal(a.scopeHelperSource.includes('-Scope Local'), false)
  let s = a.childSource
    .replace(a.scopeHelperSource, '')
    .replace(a.beforeScopeSource, '')
    .replace(a.afterScopeSource, '')
  assert.equal(s, b.childSource)
})

// 全parent反向還原，不以片段存在取代完整守衛／收尾不變證據。
test('exit-scope reconstructs the entire ref parent outside diagnostic wire handling and new flag', async () => {
  const v = await exitScopeApi()
  const a = v.createNativeProbePowerShellExitScopeArtifact()
  const b = v.createNativeProbePowerShellExitChannelRefArtifact()
  let s = a.source.replace(a.childSource, b.childSource).replace(a.childSha256, b.childSha256)
  s = s.replaceAll(a.onceFlag, b.onceFlag)
  s = s.replace(a.scopeInitSource, '')
  s = s.replace(
    a.scopeFrameSource,
    b.source.slice(
      b.source.indexOf('  $refWire ='),
      b.source.indexOf("  if ($child['childStart']"),
    ),
  )
  s = s.replace(
    '  if ($refCanonicalWire -cne ',
    '  if ($frame.Replace(([string][char]13 + [char]10), ([string][char]10)) -cne ',
  )
  const footer = s.lastIndexOf('# scope結果只代表')
  assert.equal(footer > 0, true)
  s = s.slice(0, footer) + b.source.slice(b.source.lastIndexOf('# ref回歸結果只代表'))
  assert.equal(s, b.source)
})

// 真argv須含preamble及完整新child，不能只量未編碼來源或擴大Windows上限。
test('exit-scope binds true transport source positions and unchanged finite budgets', async () => {
  const v = await exitScopeApi()
  const a = v.createNativeProbePowerShellExitScopeArtifact()
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  assert.equal(
    Buffer.from(a.childArguments.slice(prefix.length), 'base64').toString('utf16le'),
    "$ProgressPreference = 'SilentlyContinue'; " + a.childSource,
  )
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 515 + a.childArguments.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.equal(a.commandLineLimit, 32766)
  assert.deepEqual(
    [a.stdoutMaxBytes, a.stderrMaxBytes, a.normalBudgetMs, a.cleanupBudgetMs, a.totalBudgetMs],
    [1024, 128, 18000, 2000, 20000],
  )
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childSource.length),
    a.childSource,
  )
  for (const [source, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(Buffer.byteLength(source), bytes)
    assert.equal(source.length, units)
    assert.equal(createHash('sha256').update(source).digest('hex'), pin)
  }
})

// 新交接重建真parent，包含PS here-string尾LF，第一段惰性、第二段typed唯一Invoke。
test('exit-scope handoff preserves exact LF CRLF reconstruction and typed inert transport', async () => {
  const v = await exitScopeApi()
  const a = v.createNativeProbePowerShellExitScopeHandoffArtifact()
  const parent = v.createNativeProbePowerShellExitScopeArtifact()
  for (const source of [a.stage1Source, a.stage1Source.replaceAll('\n', '\r\n')]) {
    const { bodies, wrapper } = stdoutExitHandoffParts(source)
    assert.equal(bodies[0] + "\n'@\n" + bodies[1], parent.source)
    assert.equal(
      /ScriptBlock|\.Invoke\(|\.Start\(|FileStream|Set-ExecutionPolicy|Once/.test(wrapper),
      false,
    )
    assert.equal(
      wrapper.includes(`GetByteCount($rdwebHandoffPayload) -eq ${parent.utf8Bytes}`),
      true,
    )
    assert.equal(wrapper.includes(parent.sha256), true)
  }
  assert.equal(a.stage2Source.split('.Invoke(').length, 2)
  assert.equal(a.stage2Source.includes('$rdwebHandoffValue.Value -isnot [string]'), true)
  assert.equal(/returned|scope_observed|Set-ExecutionPolicy/.test(a.stage2Source), false)
  assert.equal(a.parentSha256, parent.sha256)
  for (const stage of ['stage1', 'stage2']) {
    const s = a[stage + 'Source']
    assert.equal(a[stage + 'Sha256'], createHash('sha256').update(s).digest('hex'))
    assert.equal(a[stage + 'Utf8Bytes'], Buffer.byteLength(s))
    assert.equal(a[stage + 'Utf16Units'], s.length)
  }
})

// 所有外部覆寫拒絕且不觸getter，並保留接手bytes與完整an artifact。
test('exit-scope freezes provenance rejects coercion and preserves all takeover prefixes', async () => {
  const v = await exitScopeApi()
  let touched = 0
  const unknown = {
    // 未知輸入不能觸發內容讀取。
    get source() {
      touched++
      return 'PUBLIC'
    },
    // 未知wire不能呼叫自訂轉型。
    toString() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const create of [
    v.createNativeProbePowerShellExitScopeArtifact,
    v.createNativeProbePowerShellExitScopeHandoffArtifact,
  ]) {
    for (const arg of [undefined, null, unknown, false, '', 0]) assert.throws(() => create(arg))
  }
  assert.throws(() => v.parseNativeProbeExitScopeChildOutput(unknown, '', 0))
  assert.throws(() => v.parseNativeProbeExitScopeOutput(unknown))
  assert.equal(touched, 0)
  const a = v.createNativeProbePowerShellExitScopeArtifact()
  for (const x of [a, a.trustedSources, ...a.trustedSources, a.wireFixtures, ...a.wireFixtures])
    assert.equal(Object.isFrozen(x), true)
  for (const fixture of a.wireFixtures)
    assert.equal(v.parseNativeProbeExitScopeOutput(fixture.wire).status, fixture.status)
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      182016,
      'c33bd86b10b6ee423d5252d7aa5ea88136b5738e88d596e6b33ea2d7b774ef9f',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      259024,
      '8c643f0421e94449f31b82b202239062396fbc1d91cd1254df6612f281947c91',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  assert.equal(
    v.createNativeProbePowerShellExitChannelRefArtifact().sha256,
    '0911e6b5e28affe18a1814bd08aead2e7e3343660c02e0984e61a413ef11249b',
  )
  assert.equal(
    v.createNativeProbePowerShellExitChannelRefHandoffArtifact().stage1Sha256,
    '2fa53a7b7d746d8a3e04f6679ef63c0c9371dda6f6cee55c943acc079f057db1',
  )
})

// 所有有限組合都經真parent parser；Local結果獨立於Global，錯誤收尾不得補成功。
test('exit-scope parent decoder covers every safe classification combination', async () => {
  const v = await exitScopeApi()
  for (const before of ['missing', 'int0', 'int2', 'other_int', 'non_int']) {
    for (const after of ['missing', 'int0', 'int2', 'other_int', 'non_int']) {
      for (const local of ['int0', 'int2', 'other_int', 'non_int']) {
        const zero = local === 'int0'
        const scope = `receiver_exit_scope_v1,beforeGlobal=${before},afterGlobal=${after},local=${local}\n`
        const wire =
          (zero ? refCompleteLine : scopeParentFailed) +
          scope +
          (zero ? scopePassedLine : scopeFailedLine)
        const result = v.parseNativeProbeExitScopeOutput(wire)
        assert.equal(result.regressionStatus, zero ? 'passed' : 'unavailable')
        assert.deepEqual(result.scope, { beforeGlobal: before, afterGlobal: after, local })
        assert.throws(() => v.parseNativeProbeExitScopeOutput(wire.replace(scope, scope + scope)))
      }
    }
  }
})

// 僅在RAM增加公開註解使child超過容量，驗真生成器拒絕；不寫檔或執行PS。
test('exit-scope rejects an actually oversized child rather than extending the transport limit', async () => {
  await exitScopeApi()
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('./receiver-native-diagnostic.mjs', import.meta.url), 'utf8')
  const anchor = 'const scopeHelperSource = String.raw`'
  assert.equal(source.split(anchor).length, 2)
  const oversized = source.replace(anchor, anchor + '# ' + 'P'.repeat(1600) + '\n')
  const changed = await import(
    'data:text/javascript;base64,' + Buffer.from(oversized).toString('base64')
  )
  assert.throws(() => changed.createNativeProbePowerShellExitScopeArtifact(), {
    message: 'receiver_native_diagnostic_unavailable',
  })
  assert.throws(() => changed.createNativeProbePowerShellExitScopeHandoffArtifact(), {
    message: 'receiver_native_diagnostic_unavailable',
  })
})

// 新API缺失必須先RED；不以舊scope觀察完整替代新回歸。
async function scopedRefApi() {
  const v = await api()
  for (const name of [
    'createNativeProbePowerShellExitChannelScopedRefArtifact',
    'parseNativeProbeExitChannelScopedRefChildOutput',
    'parseNativeProbeExitChannelScopedRefOutput',
    'createNativeProbePowerShellExitChannelScopedRefHandoffArtifact',
  ])
    assert.equal(typeof v[name], 'function', name)
  return v
}

const scopedRefObserved =
  'receiver_windows_exit_channel_scoped_ref_observed,syntheticExit=True,nativeExecutable=False,sessionStarted=False\n'
const scopedRefUnavailable =
  'receiver_windows_exit_channel_scoped_ref_unavailable,terminalUse=stop,sessionStarted=False\n'

// 缺seed、填0、讀Local或在call後插入其他操作都不能符合本輪產生的child契約。
test('scoped-ref pairs conservative global seed with immediate same-scope exit snapshot', async () => {
  const v = await scopedRefApi()
  const a = v.createNativeProbePowerShellExitChannelScopedRefArtifact()
  const b = v.createNativeProbePowerShellExitChannelRefArtifact()
  const run =
    '  $global:LASTEXITCODE = 2\n' +
    "  & (Join-Path $loadPackage 'test-receiver-exit-channel.ps1')\n" +
    '  $loadTestExit = $global:LASTEXITCODE\n' +
    "  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 0) { throw 'receiver_native_load_rejected' }\n" +
    '  $loadLoaded = $true\n'
  assert.equal(a.childSource.split(run).length, 2)
  assert.equal(b.childSource.includes(run), false)
  assert.equal(
    a.childSource
      .replace('  $global:LASTEXITCODE = 2\n', '  $LASTEXITCODE = 2\n')
      .replace('  $loadTestExit = $global:LASTEXITCODE\n', '  $loadTestExit = $LASTEXITCODE\n'),
    b.childSource,
  )
  assert.equal(a.nativeVerified, false)
  assert.equal(a.productEntryVerified, false)
  assert.equal(a.nativeExecutableVerified, false)
})

// 全parent還原必須精確相等，確保guard／finally與來源驗證未被順便改寫。
test('scoped-ref reconstructs entire an parent with only child pin flag and terminal changes', async () => {
  const v = await scopedRefApi()
  const a = v.createNativeProbePowerShellExitChannelScopedRefArtifact()
  const b = v.createNativeProbePowerShellExitChannelRefArtifact()
  assert.equal(a.purpose, 'receiver_native_exit_channel_scoped_ref_v1')
  assert.equal(a.onceFlag, 'RdwebReceiverExitChannelScopedRef20261026Once')
  assert.deepEqual(a.trustedSources, b.trustedSources)
  assert.equal(a.packageRelativePath, b.packageRelativePath)
  assert.equal(
    a.source
      .replace(a.childSource, b.childSource)
      .replace(a.childSha256, b.childSha256)
      .replaceAll(a.onceFlag, b.onceFlag)
      .replaceAll(scopedRefObserved.trimEnd(), refObservedLine.trimEnd())
      .replaceAll(scopedRefUnavailable.trimEnd(), refUnavailableLine.trimEnd()),
    b.source,
  )
})

// 真child parser拒絕保守2、非整數exit、缺marker／canonical與還原未知，不mock PS語意。
test('scoped-ref child decoder requires ordered complete evidence stderr empty and integer zero', async () => {
  const v = await scopedRefApi()
  const good = refTestLine + refChildReadyLine
  assert.equal(
    v.parseNativeProbeExitChannelScopedRefChildOutput(good, '', 0).resourcesClose,
    'confirmed',
  )
  assert.deepEqual(
    v.parseNativeProbeExitChannelScopedRefChildOutput(good.replaceAll('\n', '\r\n'), '', 0),
    v.parseNativeProbeExitChannelScopedRefChildOutput(good, '', 0),
  )
  for (const code of [2, 1, -1, '0', null, undefined, NaN])
    assert.throws(() => v.parseNativeProbeExitChannelScopedRefChildOutput(good, '', code))
  for (const wire of [
    refTestLine,
    refChildReadyLine,
    refChildReadyLine + refTestLine,
    good.slice(0, -1),
    good + '\n',
    good + refTestLine,
    good.replace('"childPolicyRestore":"confirmed"', '"childPolicyRestore":"unknown"'),
    good.replace('"resourcesClose":"confirmed"', '"resourcesClose":"unconfirmed"'),
    good.replace('"version":1', '"version":1,"version":1'),
    'x'.repeat(1025),
    null,
  ])
    assert.throws(() => v.parseNativeProbeExitChannelScopedRefChildOutput(wire, '', 0))
  for (const stderr of ['PUBLIC', null, undefined])
    assert.throws(() => v.parseNativeProbeExitChannelScopedRefChildOutput(good, stderr, 0))
})

// 缺任何confirmed或沿用舊marker均不可升格成功，失敗canonical保留原拒絕點。
test('scoped-ref parent decoder refuses missing contradictory oversized or historical evidence', async () => {
  const v = await scopedRefApi()
  const good = refCompleteLine + scopedRefObserved
  assert.equal(
    v.parseNativeProbeExitChannelScopedRefOutput(good).status,
    'scoped_ref_cases_observed',
  )
  assert.deepEqual(
    v.parseNativeProbeExitChannelScopedRefOutput(good.replaceAll('\n', '\r\n')),
    v.parseNativeProbeExitChannelScopedRefOutput(good),
  )
  assert.equal(
    v.parseNativeProbeExitChannelScopedRefOutput(scopeParentFailed + scopedRefUnavailable).status,
    'unavailable',
  )
  for (const key of [
    'childStart',
    'childExit',
    'childPolicyRestore',
    'parentPolicyVerify',
    'resourcesClose',
  ]) {
    const partial = refCompleteLine
      .replace('"phase":"complete","reason":"none"', '"phase":"unknown","reason":"unknown"')
      .replace(`"${key}":"confirmed"`, `"${key}":"unknown"`)
    assert.throws(() => v.parseNativeProbeExitChannelScopedRefOutput(partial + scopedRefObserved))
    assert.equal(
      v.parseNativeProbeExitChannelScopedRefOutput(partial + scopedRefUnavailable).status,
      'unavailable',
    )
  }
  for (const wire of [
    refCompleteLine + refObservedLine,
    good.slice(0, -1),
    good + '\n',
    good + scopedRefObserved,
    scopedRefObserved + refCompleteLine,
    refCompleteLine,
    refCompleteLine + scopedRefUnavailable,
    scopeParentFailed + scopedRefObserved,
    good.replace('nativeExecutable=False', 'nativeExecutable=True'),
    good.replace('"version":1', '"version":1,"version":1'),
    'x'.repeat(1281),
    null,
  ])
    assert.throws(() => v.parseNativeProbeExitChannelScopedRefOutput(wire))
})

// 反解真Base64與來源位置，避免只改metadata卻仍傳舊child或漏算preamble。
test('scoped-ref binds real encoded transport offsets and finite budgets', async () => {
  const v = await scopedRefApi()
  const a = v.createNativeProbePowerShellExitChannelScopedRefArtifact()
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  assert.equal(a.childArguments.startsWith(prefix), true)
  assert.equal(
    Buffer.from(a.childArguments.slice(prefix.length), 'base64').toString('utf16le'),
    "$ProgressPreference = 'SilentlyContinue'; " + a.childSource,
  )
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 515 + a.childArguments.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.deepEqual(
    [
      a.commandLineLimit,
      a.normalBudgetMs,
      a.cleanupBudgetMs,
      a.totalBudgetMs,
      a.stdoutMaxBytes,
      a.stderrMaxBytes,
    ],
    [32766, 18000, 2000, 20000, 1024, 128],
  )
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childSource.length),
    a.childSource,
  )
  const adapter = v.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(
    a.childSource.slice(a.childAdapterOffset, a.childAdapterOffset + adapter.source.length),
    adapter.source,
  )
  for (const [s, bytes, units, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(Buffer.byteLength(s), bytes)
    assert.equal(s.length, units)
    assert.equal(createHash('sha256').update(s).digest('hex'), pin)
  }
})

// 交接須從真來源還原，尾LF缺失不等價；第二段型別檢查與完整性必在唯一Invoke之前。
test('scoped-ref handoff reconstructs LF CRLF bodies and retains typed fail-closed stages', async () => {
  const v = await scopedRefApi()
  const h = v.createNativeProbePowerShellExitChannelScopedRefHandoffArtifact()
  const a = v.createNativeProbePowerShellExitChannelScopedRefArtifact()
  assert.equal(h.payloadVariable, 'RdwebReceiverExitChannelScopedRef20261026Payload')
  assert.equal(h.integrityPrefix, 'rdweb_exit_channel_scoped_ref_handoff_integrity_v1,')
  assert.equal(h.parentSha256, a.sha256)
  for (const s of [h.stage1Source, h.stage1Source.replaceAll('\n', '\r\n')]) {
    const { bodies, wrapper } = stdoutExitHandoffParts(s)
    assert.equal(bodies[0] + "\n'@\n" + bodies[1], a.source)
    assert.equal(
      /ScriptBlock|\.Invoke\(|\.Start\(|FileStream|Set-ExecutionPolicy|Once/.test(wrapper),
      false,
    )
    assert.equal(wrapper.includes(`Set-Variable -Name ${h.payloadVariable} -Scope Global`), true)
    assert.equal(wrapper.includes(`Remove-Variable -Name ${h.payloadVariable} -Scope Global`), true)
    assert.equal(wrapper.includes(`GetByteCount($rdwebHandoffPayload) -eq ${a.utf8Bytes}`), true)
    assert.equal(wrapper.includes(`$rdwebHandoffPayload.Length -eq ${a.utf16Units}`), true)
    assert.equal(wrapper.includes(`$rdwebHandoffHash -ceq '${a.sha256}'`), true)
    for (const [body, label] of [
      [bodies[0], 'partA'],
      [bodies[1], 'partB'],
    ]) {
      assert.equal(h[label + 'Utf8Bytes'], Buffer.byteLength(body))
      assert.equal(h[label + 'Utf16Units'], body.length)
      assert.equal(h[label + 'Sha256'], createHash('sha256').update(body).digest('hex'))
    }
  }
  const broken = stdoutExitHandoffParts(h.stage1Source.replaceAll("\n\n'@\n", "\n'@\n")).bodies
  assert.notEqual(broken[0] + "\n'@\n" + broken[1], a.source)
  const s = h.stage2Source
  assert.equal(s.split('.Invoke(').length, 2)
  for (const guard of [
    '$rdwebHandoffValue.Value -isnot [string]',
    `GetByteCount($rdwebHandoffText) -ne ${a.utf8Bytes}`,
    `$rdwebHandoffText.Length -ne ${a.utf16Units}`,
    `$rdwebHandoffHash -cne '${a.sha256}'`,
    '$rdwebHandoffText.IndexOf([char]13)',
    '$rdwebHandoffText.IndexOf([char]0)',
    '$rdwebHandoffText.EndsWith($rdwebHandoffLf)',
  ]) {
    assert.equal(s.includes(guard), true)
    assert.equal(s.indexOf(guard) < s.indexOf('.Invoke('), true)
  }
  assert.equal(
    /returned|scoped_ref_observed|Set-ExecutionPolicy|\[string\]\$rdwebHandoffValue.Value/.test(s),
    false,
  )
  assert.throws(() => v.parseNativeProbeExitChannelScopedRefOutput(h.unavailableLine + '\n'))
  for (const stage of ['stage1', 'stage2']) {
    const text = h[stage + 'Source']
    assert.equal(h[stage + 'Utf8Bytes'], Buffer.byteLength(text))
    assert.equal(h[stage + 'Utf16Units'], text.length)
    assert.equal(h[stage + 'Sha256'], createHash('sha256').update(text).digest('hex'))
    assert.equal(text.includes('\r') || text.includes('\0'), false)
    assert.equal(text.endsWith('\n'), true)
  }
})

// 外部值不得觸發getter／轉型或覆寫來源；新metadata與fixtures仍不可變。
test('scoped-ref rejects overrides coercion and freezes provenance', async () => {
  const v = await scopedRefApi()
  let touched = 0
  const unknown = {
    // 不讀取外部來源。
    get source() {
      touched++
      return 'PUBLIC'
    },
    // 不呼叫未知wire的轉型。
    toString() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const create of [
    v.createNativeProbePowerShellExitChannelScopedRefArtifact,
    v.createNativeProbePowerShellExitChannelScopedRefHandoffArtifact,
  ]) {
    for (const arg of [undefined, null, unknown, false, '', 0]) assert.throws(() => create(arg))
    const a = create()
    assert.equal(Object.isFrozen(a), true)
    assert.equal(a.nativeVerified, false)
  }
  assert.throws(() => v.parseNativeProbeExitChannelScopedRefChildOutput(unknown, '', 0))
  assert.throws(() => v.parseNativeProbeExitChannelScopedRefOutput(unknown))
  assert.equal(touched, 0)
  const a = v.createNativeProbePowerShellExitChannelScopedRefArtifact()
  for (const x of [a.trustedSources, ...a.trustedSources, a.wireFixtures, ...a.wireFixtures])
    assert.equal(Object.isFrozen(x), true)
  assert.equal(a.expectedStdout, refCompleteLine + scopedRefObserved)
  assert.equal(a.expectedChildStdout, refTestLine + refChildReadyLine)
  for (const f of a.wireFixtures) v.parseNativeProbeExitChannelScopedRefOutput(f.wire)
})

// 接手完整prefix、舊候選與am ZIP固定，不為修新scope改寫歷史證據。
test('scoped-ref preserves complete takeover prefixes historical artifacts and archive', async () => {
  const v = await scopedRefApi()
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      198418,
      '189fc15156aa8356e4104779440a7b6d4eb666b64800a4b81edafb8d7a5a4b50',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      274721,
      '51e885c60d8ab95e0f4ca027209ee45dc2c4ecbb15c1cd5b345969c4b050d8c8',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  assert.equal(
    v.createNativeProbePowerShellExitChannelRefArtifact().sha256,
    '0911e6b5e28affe18a1814bd08aead2e7e3343660c02e0984e61a413ef11249b',
  )
  assert.equal(
    v.createNativeProbePowerShellExitScopeArtifact().sha256,
    '4825380a36f4aee7f1afbf207153f836b4c8a7e80aab6bd4583e94a2902b6764',
  )
  assert.equal(
    v.createNativeProbePowerShellExitScopeHandoffArtifact().stage2Sha256,
    '3f38648fb25d45edb3534f59a7e629eae307ae5d25b9a90b25a9fbdfa9c16e36',
  )
  assert.equal(
    createHash('sha256')
      .update(
        readFileSync(
          new URL('../../.cache/receiver-exit-channel-validation-20261026-01.zip', import.meta.url),
        ),
      )
      .digest('hex'),
    '9c2afe6cc6a467e4fd6840aa976a6d12d163ad47c9916d4ba24b6235d2e44c5b',
  )
})

// 在RAM增加新child公開註解，真生成器與交接均應拒絕超過Windows命令容量的輸出。
test('scoped-ref rejects actual oversized transport without widening the command limit', async () => {
  await scopedRefApi()
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('./receiver-native-diagnostic.mjs', import.meta.url), 'utf8')
  const offset = source.indexOf(
    'export function createNativeProbePowerShellExitChannelScopedRefArtifact()',
  )
  assert.equal(offset > 0, true)
  const anchor = "  const childSha256 = createHash('sha256').update(childSource).digest('hex')"
  const tail = source.slice(offset)
  assert.equal(tail.split(anchor).length, 2)
  const oversized =
    source.slice(0, offset) +
    tail.replace(anchor, "  childSource += '# " + 'P'.repeat(1600) + "\\n'\n" + anchor)
  const changed = await import(
    'data:text/javascript;base64,' + Buffer.from(oversized).toString('base64')
  )
  for (const create of [
    changed.createNativeProbePowerShellExitChannelScopedRefArtifact,
    changed.createNativeProbePowerShellExitChannelScopedRefHandoffArtifact,
  ])
    assert.throws(() => create(), { message: 'receiver_native_diagnostic_unavailable' })
})

// 新API缺失先RED，不把合成ref成功或舊入口當作新main負向驗收。
async function mainRejectionApi() {
  const v = await api()
  for (const name of [
    'createNativeProbePowerShellMainRejectionArtifact',
    'parseNativeProbeMainRejectionChildOutput',
    'parseNativeProbeMainRejectionOutput',
    'createNativeProbePowerShellMainRejectionHandoffArtifact',
  ])
    assert.equal(typeof v[name], 'function', name)
  return v
}

const mainRejectedLine = 'receiver_main_invalid_parent_rejected,exitCode=2,sessionStarted=False\n'
const mainObservedLine =
  'receiver_windows_main_rejection_observed,invalidParent=True,sessionStarted=False\n'
const mainUnavailableLine =
  'receiver_windows_main_rejection_unavailable,terminalUse=stop,sessionStarted=False\n'
const mainOldRun =
  "  $global:LASTEXITCODE = 2\n  & (Join-Path $loadPackage 'test-receiver-exit-channel.ps1')\n  $loadTestExit = $global:LASTEXITCODE\n  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 0) { throw 'receiver_native_load_rejected' }\n"
const mainNewRun =
  "  $global:LASTEXITCODE = 99\n  & (Join-Path $loadPackage 'start-windows-test-receiver.ps1') -Parent ''\n  $loadTestExit = $global:LASTEXITCODE\n  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 2) { throw 'receiver_native_load_rejected' }\n  [Console]::Write('receiver_main_invalid_parent_rejected,exitCode=2,sessionStarted=False' + [char]10)\n"

// 實檔call必須觸發main，sentinel99不能誤當預期2；其餘child一字不改。
test('main-rejection calls the pinned entry with empty Parent and immediately checks global integer two', async () => {
  const v = await mainRejectionApi()
  const a = v.createNativeProbePowerShellMainRejectionArtifact()
  const b = v.createNativeProbePowerShellExitChannelScopedRefArtifact()
  assert.equal(a.childSource.split(mainNewRun + '  $loadLoaded = $true\n').length, 2)
  assert.equal(b.childSource.includes(mainNewRun), false)
  assert.equal(a.childSource.replace(mainNewRun, mainOldRun), b.childSource)
  assert.equal(a.purpose, 'receiver_native_main_rejection_v1')
  assert.equal(a.onceFlag, 'RdwebReceiverMainRejection20261026Once')
  assert.deepEqual(a.trustedSources, b.trustedSources)
  assert.equal(a.packageRelativePath, b.packageRelativePath)
  assert.equal(a.nativeVerified, false)
  assert.equal(a.productEntryVerified, false)
  assert.equal(a.nativeExecutableVerified, false)
})

// stderr必須有界收至EOF再精確分類，反向還原保證未悄改其他監督／cleanup。
test('main-rejection reconstructs the full supervisor outside explicit bounded stderr and wire changes', async () => {
  const v = await mainRejectionApi()
  const a = v.createNativeProbePowerShellMainRejectionArtifact()
  const b = v.createNativeProbePowerShellExitChannelScopedRefArtifact()
  const oldErr =
    "      if ($loadErrCount -ne 0) {\n        Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'unexpected_output'\n        throw 'receiver_native_load_rejected'\n      }\n      if ($read -eq 0) { $loadErrEnd = $true }\n"
  const newErr =
    "      if ($loadErrCount -gt 128) {\n        Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'unexpected_output'\n        throw 'receiver_native_load_rejected'\n      }\n      if ($read -eq 0) { $loadErrEnd = $true }\n      else { $loadErrTask = $loadProcess.StandardError.BaseStream.ReadAsync($loadErr, $loadErrCount, 129 - $loadErrCount) }\n"
  const errorGate =
    "  $mainError = ([Text.UTF8Encoding]::new($false, $true)).GetString($loadErr, 0, $loadErrCount)\n  if ($mainError.Replace(([string][char]13 + [char]10), ([string][char]10)) -cne 'receiver_unavailable' + [char]10) { throw 'receiver_native_load_rejected' }\n"
  assert.equal(a.source.split(newErr).length, 2)
  assert.equal(a.source.split(errorGate).length, 2)
  assert.equal(a.source.indexOf(errorGate) > a.source.indexOf('$loadExited = $true\n'), true)
  assert.equal(a.source.indexOf(errorGate) < a.source.indexOf('  $frame = '), true)
  assert.equal(
    a.source
      .replace(a.childSource, b.childSource)
      .replace(a.childSha256, b.childSha256)
      .replaceAll(a.onceFlag, b.onceFlag)
      .replace(newErr, oldErr)
      .replace(errorGate, '')
      .replaceAll(mainRejectedLine.trimEnd(), refTestLine.trimEnd())
      .replaceAll(mainObservedLine.trimEnd(), scopedRefObserved.trimEnd())
      .replaceAll(mainUnavailableLine.trimEnd(), scopedRefUnavailable.trimEnd()),
    b.source,
  )
})

// 真decoder只允許預期一行stderr＋固定stdout＋child exit0，不把腳本退出2混成child退出2。
test('main-rejection child decoder requires exact rejection stderr and complete ordered evidence', async () => {
  const v = await mainRejectionApi()
  const good = mainRejectedLine + refChildReadyLine
  assert.equal(
    v.parseNativeProbeMainRejectionChildOutput(good, 'receiver_unavailable\n', 0).resourcesClose,
    'confirmed',
  )
  assert.deepEqual(
    v.parseNativeProbeMainRejectionChildOutput(
      good.replaceAll('\n', '\r\n'),
      'receiver_unavailable\r\n',
      0,
    ),
    v.parseNativeProbeMainRejectionChildOutput(good, 'receiver_unavailable\n', 0),
  )
  for (const err of [
    '',
    'receiver_unavailable',
    'receiver_unavailable\n\n',
    'PUBLIC\n',
    'receiver_unavailable\r',
    'receiver_unavailable\nPUBLIC',
    'x'.repeat(129),
    null,
    undefined,
  ])
    assert.throws(() => v.parseNativeProbeMainRejectionChildOutput(good, err, 0))
  for (const code of [99, 0.5, 1, 2, 7, '0', null, undefined, NaN])
    assert.throws(() =>
      v.parseNativeProbeMainRejectionChildOutput(good, 'receiver_unavailable\n', code),
    )
  for (const wire of [
    mainRejectedLine,
    refChildReadyLine,
    refChildReadyLine + mainRejectedLine,
    refTestLine + refChildReadyLine,
    good.slice(0, -1),
    good + '\n',
    good + mainRejectedLine,
    good.replace('"childPolicyRestore":"confirmed"', '"childPolicyRestore":"unknown"'),
    good.replace('"resourcesClose":"confirmed"', '"resourcesClose":"unconfirmed"'),
    good.replace('exitCode=2', 'exitCode=99'),
    good.replace('exitCode=2', 'exitCode=0'),
    good.replace('exitCode=2', 'exitCode=1'),
    good.replace('exitCode=2', 'exitCode=7'),
    good.replace('exitCode=2', 'exitCode=non_int'),
    good.replace('"version":1', '"version":1,"version":1'),
    'x'.repeat(1025),
    null,
  ])
    assert.throws(() =>
      v.parseNativeProbeMainRejectionChildOutput(wire, 'receiver_unavailable\n', 0),
    )
})

// 正向是預期拒絕觀察，不是產品成功；缺任何收尾或沿用歷史marker皆拒絕。
test('main-rejection parent decoder rejects incomplete contradictory historical and oversized wires', async () => {
  const v = await mainRejectionApi()
  const good = refCompleteLine + mainObservedLine
  assert.equal(v.parseNativeProbeMainRejectionOutput(good).status, 'main_rejection_observed')
  assert.deepEqual(
    v.parseNativeProbeMainRejectionOutput(good.replaceAll('\n', '\r\n')),
    v.parseNativeProbeMainRejectionOutput(good),
  )
  assert.equal(
    v.parseNativeProbeMainRejectionOutput(scopeParentFailed + mainUnavailableLine).status,
    'unavailable',
  )
  for (const key of [
    'childStart',
    'childExit',
    'childPolicyRestore',
    'parentPolicyVerify',
    'resourcesClose',
  ]) {
    const partial = refCompleteLine
      .replace('"phase":"complete","reason":"none"', '"phase":"unknown","reason":"unknown"')
      .replace(`"${key}":"confirmed"`, `"${key}":"unknown"`)
    assert.throws(() => v.parseNativeProbeMainRejectionOutput(partial + mainObservedLine))
    assert.equal(
      v.parseNativeProbeMainRejectionOutput(partial + mainUnavailableLine).status,
      'unavailable',
    )
  }
  for (const wire of [
    good.slice(0, -1),
    good + '\n',
    good + mainObservedLine,
    mainObservedLine + refCompleteLine,
    refCompleteLine,
    refCompleteLine + mainUnavailableLine,
    refCompleteLine + scopedRefObserved,
    scopeParentFailed + mainObservedLine,
    good.replace('invalidParent=True', 'invalidParent=False'),
    good.replace('"version":1', '"version":1,"version":1'),
    'x'.repeat(1281),
    null,
  ])
    assert.throws(() => v.parseNativeProbeMainRejectionOutput(wire))
})

// 真Base64、來源位置與有限預算必須跟新child同步，不沿用as數字。
test('main-rejection binds actual transport metadata offsets and unchanged finite budgets', async () => {
  const v = await mainRejectionApi()
  const a = v.createNativeProbePowerShellMainRejectionArtifact()
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  assert.equal(a.childArguments.startsWith(prefix), true)
  assert.equal(
    Buffer.from(a.childArguments.slice(prefix.length), 'base64').toString('utf16le'),
    "$ProgressPreference = 'SilentlyContinue'; " + a.childSource,
  )
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 515 + a.childArguments.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.deepEqual(
    [
      a.commandLineLimit,
      a.normalBudgetMs,
      a.cleanupBudgetMs,
      a.totalBudgetMs,
      a.stdoutMaxBytes,
      a.stderrMaxBytes,
    ],
    [32766, 18000, 2000, 20000, 1024, 128],
  )
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childSource.length),
    a.childSource,
  )
  const adapter = v.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(
    a.childSource.slice(a.childAdapterOffset, a.childAdapterOffset + adapter.source.length),
    adapter.source,
  )
  for (const [s, n, u, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(Buffer.byteLength(s), n)
    assert.equal(s.length, u)
    assert.equal(createHash('sha256').update(s).digest('hex'), pin)
  }
  assert.equal(a.expectedChildStdout, mainRejectedLine + refChildReadyLine)
  assert.equal(a.expectedChildStderr, 'receiver_unavailable\n')
  assert.equal(a.expectedStdout, refCompleteLine + mainObservedLine)
})

// literal重組驗真來源與尾LF，wrapper不可執行main；第二段型別／pin gate必先於唯一Invoke。
test('main-rejection handoff reconstructs LF CRLF bodies and retains typed inert transport', async () => {
  const v = await mainRejectionApi()
  const a = v.createNativeProbePowerShellMainRejectionArtifact()
  const h = v.createNativeProbePowerShellMainRejectionHandoffArtifact()
  assert.equal(h.payloadVariable, 'RdwebReceiverMainRejection20261026Payload')
  assert.equal(h.integrityPrefix, 'rdweb_main_rejection_handoff_integrity_v1,')
  assert.equal(h.parentSha256, a.sha256)
  for (const s of [h.stage1Source, h.stage1Source.replaceAll('\n', '\r\n')]) {
    const { bodies, wrapper } = stdoutExitHandoffParts(s)
    assert.equal(bodies[0] + "\n'@\n" + bodies[1], a.source)
    assert.equal(
      /ScriptBlock|\.Invoke\(|\.Start\(|FileStream|Set-ExecutionPolicy|Once/.test(wrapper),
      false,
    )
    assert.equal(wrapper.includes(`Set-Variable -Name ${h.payloadVariable} -Scope Global`), true)
    assert.equal(wrapper.includes(`Remove-Variable -Name ${h.payloadVariable} -Scope Global`), true)
    assert.equal(wrapper.includes(`GetByteCount($rdwebHandoffPayload) -eq ${a.utf8Bytes}`), true)
    assert.equal(wrapper.includes(`$rdwebHandoffPayload.Length -eq ${a.utf16Units}`), true)
    assert.equal(wrapper.includes(`$rdwebHandoffHash -ceq '${a.sha256}'`), true)
    for (const [body, label] of [
      [bodies[0], 'partA'],
      [bodies[1], 'partB'],
    ]) {
      assert.equal(h[label + 'Utf8Bytes'], Buffer.byteLength(body))
      assert.equal(h[label + 'Utf16Units'], body.length)
      assert.equal(h[label + 'Sha256'], createHash('sha256').update(body).digest('hex'))
    }
  }
  const broken = stdoutExitHandoffParts(h.stage1Source.replaceAll("\n\n'@\n", "\n'@\n")).bodies
  assert.notEqual(broken[0] + "\n'@\n" + broken[1], a.source)
  const s = h.stage2Source
  assert.equal(s.split('.Invoke(').length, 2)
  for (const guard of [
    '$rdwebHandoffValue.Value -isnot [string]',
    `GetByteCount($rdwebHandoffText) -ne ${a.utf8Bytes}`,
    `$rdwebHandoffText.Length -ne ${a.utf16Units}`,
    `$rdwebHandoffHash -cne '${a.sha256}'`,
    '$rdwebHandoffText.IndexOf([char]13)',
    '$rdwebHandoffText.IndexOf([char]0)',
    '$rdwebHandoffText.EndsWith($rdwebHandoffLf)',
  ]) {
    assert.equal(s.includes(guard), true)
    assert.equal(s.indexOf(guard) < s.indexOf('.Invoke('), true)
  }
  assert.equal(
    /returned|rejection_observed|Set-ExecutionPolicy|\[string\]\$rdwebHandoffValue.Value/.test(s),
    false,
  )
  assert.throws(() => v.parseNativeProbeMainRejectionOutput(h.unavailableLine + '\n'))
  for (const stage of ['stage1', 'stage2']) {
    const text = h[stage + 'Source']
    assert.equal(h[stage + 'Utf8Bytes'], Buffer.byteLength(text))
    assert.equal(h[stage + 'Utf16Units'], text.length)
    assert.equal(h[stage + 'Sha256'], createHash('sha256').update(text).digest('hex'))
    assert.equal(text.includes('\r') || text.includes('\0'), false)
    assert.equal(text.endsWith('\n'), true)
  }
})

// 未知覆寫與wire不得轉型或觸getter；metadata與fixtures不可變。
test('main-rejection rejects overrides coercion and freezes provenance', async () => {
  const v = await mainRejectionApi()
  let touched = 0
  const unknown = {
    // 未知來源不得被存取。
    get source() {
      touched++
      return 'PUBLIC'
    },
    // 未知wire不得觸發轉型。
    toString() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const create of [
    v.createNativeProbePowerShellMainRejectionArtifact,
    v.createNativeProbePowerShellMainRejectionHandoffArtifact,
  ]) {
    for (const arg of [undefined, null, unknown, false, '', 0]) assert.throws(() => create(arg))
    const a = create()
    assert.equal(Object.isFrozen(a), true)
    assert.equal(a.nativeVerified, false)
  }
  assert.throws(() =>
    v.parseNativeProbeMainRejectionChildOutput(unknown, 'receiver_unavailable\n', 0),
  )
  assert.throws(() =>
    v.parseNativeProbeMainRejectionChildOutput(mainRejectedLine + refChildReadyLine, unknown, 0),
  )
  assert.throws(() => v.parseNativeProbeMainRejectionOutput(unknown))
  assert.equal(touched, 0)
  const a = v.createNativeProbePowerShellMainRejectionArtifact()
  for (const x of [a.trustedSources, ...a.trustedSources, a.wireFixtures, ...a.wireFixtures])
    assert.equal(Object.isFrozen(x), true)
  for (const f of a.wireFixtures) v.parseNativeProbeMainRejectionOutput(f.wire)
})

// 接手完整prefix、舊候選及來源ZIP不得因新負向驗收被覆寫。
test('main-rejection preserves complete takeover prefixes historical pins and am archive', async () => {
  const v = await mainRejectionApi()
  const { readFileSync } = await import('node:fs')
  for (const [name, n, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      208100,
      'd1816890491de85eea4857b055a42d91758171d933619b78af2f959305bad3b9',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      289938,
      'e6b0bfc012a24aaaa47fed8dc330eea83f0fb200ba67a790cc71d9eea328b010',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, n))
        .digest('hex'),
      pin,
    )
  assert.equal(
    v.createNativeProbePowerShellExitChannelScopedRefArtifact().sha256,
    'e9050c13ecd24a471d8bce63c219029283fe88abfc483edde0f58fa4a5b72561',
  )
  assert.equal(
    v.createNativeProbePowerShellExitChannelScopedRefHandoffArtifact().stage1Sha256,
    'f3cac5282287d3f07b579737552b5dbb404196660e909817746e4d8852e0ab8e',
  )
  assert.equal(
    createHash('sha256')
      .update(
        readFileSync(
          new URL('../../.cache/receiver-exit-channel-validation-20261026-01.zip', import.meta.url),
        ),
      )
      .digest('hex'),
    '9c2afe6cc6a467e4fd6840aa976a6d12d163ad47c9916d4ba24b6235d2e44c5b',
  )
})

// 僅在RAM擴大新child公開註解，生成器與交接須拒絕真實超限命令，不改Windows上限。
test('main-rejection rejects actual oversized child transport', async () => {
  await mainRejectionApi()
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('./receiver-native-diagnostic.mjs', import.meta.url), 'utf8')
  const offset = source.indexOf(
    'export function createNativeProbePowerShellMainRejectionArtifact()',
  )
  assert.equal(offset > 0, true)
  const tail = source.slice(offset)
  const anchor = '  const run = String.raw`'
  assert.equal(tail.split(anchor).length, 2)
  const oversized =
    source.slice(0, offset) + tail.replace(anchor, anchor + '# ' + 'P'.repeat(1600) + '\n')
  const changed = await import(
    'data:text/javascript;base64,' + Buffer.from(oversized).toString('base64')
  )
  for (const create of [
    changed.createNativeProbePowerShellMainRejectionArtifact,
    changed.createNativeProbePowerShellMainRejectionHandoffArtifact,
  ])
    assert.throws(() => create(), { message: 'receiver_native_diagnostic_unavailable' })
})

// 新API缺失先RED，禁止把舊am候選冒充已採用新版分類的來源。
async function entryBoundaryApi() {
  const v = await api()
  for (const name of [
    'createNativeProbePowerShellEntryBoundaryArtifact',
    'parseNativeProbeEntryBoundaryChildOutput',
    'parseNativeProbeEntryBoundaryOutput',
    'createNativeProbePowerShellEntryBoundaryHandoffArtifact',
  ])
    assert.equal(typeof v[name], 'function', name)
  return v
}

const boundaryChildLine =
  'receiver_entry_boundary_invalid_parent_rejected,exitCode=2,sessionStarted=False\n'
const boundaryObservedLine =
  'receiver_windows_entry_boundary_observed,invalidParent=True,sessionStarted=False\n'
const boundaryUnavailableLine =
  'receiver_windows_entry_boundary_unavailable,terminalUse=stop,sessionStarted=False\n'
const boundaryRoot = 'rdweb entry load boundary validation 公開 20261026-01'

// 即使marker／canonical與child exit0齊全，載入錯誤仍必須被真parser拒絕。
test('entry-boundary child decoder rejects load failure despite otherwise complete evidence', async () => {
  const v = await entryBoundaryApi()
  const good = boundaryChildLine + refChildReadyLine
  assert.equal(
    v.parseNativeProbeEntryBoundaryChildOutput(good, 'receiver_unavailable\n', 0).resourcesClose,
    'confirmed',
  )
  assert.deepEqual(
    v.parseNativeProbeEntryBoundaryChildOutput(
      good.replaceAll('\n', '\r\n'),
      'receiver_unavailable\r\n',
      0,
    ),
    v.parseNativeProbeEntryBoundaryChildOutput(good, 'receiver_unavailable\n', 0),
  )
  for (const err of [
    'receiver_entry_load_unavailable\n',
    'receiver_entry_load_unavailable\r\n',
    '',
    'receiver_unavailable',
    'receiver_unavailable\n\n',
    'receiver_unavailable\r',
    'receiver_unavailable\nreceiver_entry_load_unavailable\n',
    'PUBLIC\n',
    'x'.repeat(129),
    null,
  ])
    assert.throws(() => v.parseNativeProbeEntryBoundaryChildOutput(good, err, 0))
  for (const code of [99, 2, 1, 7, '0', null, undefined, NaN])
    assert.throws(() =>
      v.parseNativeProbeEntryBoundaryChildOutput(good, 'receiver_unavailable\n', code),
    )
  for (const wire of [
    mainRejectedLine + refChildReadyLine,
    boundaryChildLine,
    refChildReadyLine,
    refChildReadyLine + boundaryChildLine,
    good + '\n',
    good.slice(0, -1),
    good + boundaryChildLine,
    good.replace('exitCode=2', 'exitCode=99'),
    good.replace('exitCode=2', 'exitCode=non_int'),
    good.replace('"childPolicyRestore":"confirmed"', '"childPolicyRestore":"unknown"'),
    good.replace('"resourcesClose":"confirmed"', '"resourcesClose":"unconfirmed"'),
    good.replace('"version":1', '"version":1,"version":1'),
    'x'.repeat(1025),
    null,
  ])
    assert.throws(() =>
      v.parseNativeProbeEntryBoundaryChildOutput(wire, 'receiver_unavailable\n', 0),
    )
})

// 缺confirmed／矛盾終態／舊marker不能補成功；成功僅是新來源的預期main拒絕。
test('entry-boundary parent decoder requires new marker and five confirmations', async () => {
  const v = await entryBoundaryApi()
  const good = refCompleteLine + boundaryObservedLine
  assert.equal(v.parseNativeProbeEntryBoundaryOutput(good).status, 'entry_boundary_observed')
  assert.deepEqual(
    v.parseNativeProbeEntryBoundaryOutput(good.replaceAll('\n', '\r\n')),
    v.parseNativeProbeEntryBoundaryOutput(good),
  )
  assert.equal(
    v.parseNativeProbeEntryBoundaryOutput(scopeParentFailed + boundaryUnavailableLine).status,
    'unavailable',
  )
  for (const key of [
    'childStart',
    'childExit',
    'childPolicyRestore',
    'parentPolicyVerify',
    'resourcesClose',
  ]) {
    const partial = refCompleteLine
      .replace('"phase":"complete","reason":"none"', '"phase":"unknown","reason":"unknown"')
      .replace(`"${key}":"confirmed"`, `"${key}":"unknown"`)
    assert.throws(() => v.parseNativeProbeEntryBoundaryOutput(partial + boundaryObservedLine))
    assert.equal(
      v.parseNativeProbeEntryBoundaryOutput(partial + boundaryUnavailableLine).status,
      'unavailable',
    )
  }
  for (const wire of [
    good.slice(0, -1),
    good + '\n',
    good + boundaryObservedLine,
    boundaryObservedLine + refCompleteLine,
    refCompleteLine,
    refCompleteLine + mainObservedLine,
    scopeParentFailed + boundaryObservedLine,
    refCompleteLine + boundaryUnavailableLine,
    good.replace('invalidParent=True', 'invalidParent=False'),
    'x'.repeat(1281),
    null,
  ])
    assert.throws(() => v.parseNativeProbeEntryBoundaryOutput(wire))
})

// 新fixture兩個pin必須真切換；反向還原有限差異後全child／parent應等於au。
test('entry-boundary binds ax sources and reconstructs the complete au supervisor', async () => {
  const v = await entryBoundaryApi()
  const a = v.createNativeProbePowerShellEntryBoundaryArtifact()
  const b = v.createNativeProbePowerShellMainRejectionArtifact()
  assert.equal(a.purpose, 'receiver_native_entry_boundary_v1')
  assert.equal(a.onceFlag, 'RdwebReceiverEntryBoundary20261026Once')
  assert.equal(a.packageRelativePath, boundaryRoot)
  assert.deepEqual(a.trustedSources, [
    {
      name: 'integrity.json',
      bytes: 637,
      sha256: '0b5cb41746392b64a112f7aafc85fe6205e95a0b108f16a21d059a5ae7fa2099',
    },
    {
      name: 'start-windows-test-receiver.ps1',
      bytes: 7652,
      sha256: 'b4056d8752f2c3748c7def507536148ebd9281ae9ab5db94f532e3c4a0ff3c19',
    },
    ...refSources.slice(2),
  ])
  assert.equal(
    a.childSource
      .replace(boundaryRoot, b.packageRelativePath)
      .replace(boundaryChildLine.trimEnd(), mainRejectedLine.trimEnd()),
    b.childSource,
  )
  assert.equal(
    a.childSource.includes(
      "  $global:LASTEXITCODE = 99\n  & (Join-Path $loadPackage 'start-windows-test-receiver.ps1') -Parent ''\n  $loadTestExit = $global:LASTEXITCODE\n  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 2) { throw 'receiver_native_load_rejected' }\n",
    ),
    true,
  )
  assert.equal(
    a.source
      .replace(a.childSource, b.childSource)
      .replace(a.childSha256, b.childSha256)
      .replaceAll(boundaryRoot, b.packageRelativePath)
      .replaceAll(a.onceFlag, b.onceFlag)
      .replace(
        "@{ Name = 'integrity.json'; Bytes = 637; Pin = '0b5cb41746392b64a112f7aafc85fe6205e95a0b108f16a21d059a5ae7fa2099' }",
        "@{ Name = 'integrity.json'; Bytes = 630; Pin = '0ca5642c14ac4c3f7ea2be50398868174f964236decf899d0fee312e7f39d668' }",
      )
      .replace(
        "@{ Name = 'start-windows-test-receiver.ps1'; Bytes = 7652; Pin = 'b4056d8752f2c3748c7def507536148ebd9281ae9ab5db94f532e3c4a0ff3c19' }",
        "@{ Name = 'start-windows-test-receiver.ps1'; Bytes = 7637; Pin = '8d07ea5ac6b2b364bca0389b76aa5b0929c25d36a6b7ebcbd8fcd8e43510c392' }",
      )
      .replaceAll(boundaryChildLine.trimEnd(), mainRejectedLine.trimEnd())
      .replaceAll(boundaryObservedLine.trimEnd(), mainObservedLine.trimEnd())
      .replaceAll(boundaryUnavailableLine.trimEnd(), mainUnavailableLine.trimEnd()),
    b.source,
  )
})

// 真命令含preamble與新child，所有offset／hash與既有限額必須相符。
test('entry-boundary computes actual encoded transport and finite source metadata', async () => {
  const v = await entryBoundaryApi()
  const a = v.createNativeProbePowerShellEntryBoundaryArtifact()
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  assert.equal(a.childArguments.startsWith(prefix), true)
  assert.equal(
    Buffer.from(a.childArguments.slice(prefix.length), 'base64').toString('utf16le'),
    "$ProgressPreference = 'SilentlyContinue'; " + a.childSource,
  )
  assert.equal(a.childCommandLineUtf16UnitsUpperBound, 515 + a.childArguments.length)
  assert.equal(a.childCommandLineUtf16UnitsUpperBound <= 32766, true)
  assert.deepEqual(
    [
      a.commandLineLimit,
      a.normalBudgetMs,
      a.cleanupBudgetMs,
      a.totalBudgetMs,
      a.stdoutMaxBytes,
      a.stderrMaxBytes,
    ],
    [32766, 18000, 2000, 20000, 1024, 128],
  )
  assert.equal(
    a.source.slice(a.childSourceOffset, a.childSourceOffset + a.childSource.length),
    a.childSource,
  )
  const adapter = v.createNativeProbePowerShellTypeFixedAdapterArtifact()
  assert.equal(
    a.source.slice(a.adapterOffset, a.adapterOffset + adapter.source.length),
    adapter.source,
  )
  assert.equal(
    a.childSource.slice(a.childAdapterOffset, a.childAdapterOffset + adapter.source.length),
    adapter.source,
  )
  for (const [s, n, u, pin] of [
    [a.source, a.utf8Bytes, a.utf16Units, a.sha256],
    [a.childSource, a.childUtf8Bytes, a.childUtf16Units, a.childSha256],
  ]) {
    assert.equal(Buffer.byteLength(s), n)
    assert.equal(s.length, u)
    assert.equal(createHash('sha256').update(s).digest('hex'), pin)
  }
  assert.equal(a.expectedChildStdout, boundaryChildLine + refChildReadyLine)
  assert.equal(a.expectedChildStderr, 'receiver_unavailable\n')
  assert.equal(a.expectedStdout, refCompleteLine + boundaryObservedLine)
})

// 兩literal須重建真parent，wrapper惰性、型別與pin檢查在唯一Invoke前且不放寬尾LF。
test('entry-boundary handoff reconstructs true LF CRLF payload and preserves typed gates', async () => {
  const v = await entryBoundaryApi()
  const a = v.createNativeProbePowerShellEntryBoundaryArtifact()
  const h = v.createNativeProbePowerShellEntryBoundaryHandoffArtifact()
  assert.equal(h.payloadVariable, 'RdwebReceiverEntryBoundary20261026Payload')
  assert.equal(h.integrityPrefix, 'rdweb_entry_boundary_handoff_integrity_v1,')
  assert.equal(h.parentSha256, a.sha256)
  for (const text of [h.stage1Source, h.stage1Source.replaceAll('\n', '\r\n')]) {
    const { bodies, wrapper } = stdoutExitHandoffParts(text)
    assert.equal(bodies[0] + "\n'@\n" + bodies[1], a.source)
    assert.equal(
      /ScriptBlock|\.Invoke\(|\.Start\(|FileStream|Set-ExecutionPolicy|Once/.test(wrapper),
      false,
    )
    assert.equal(wrapper.includes(`Set-Variable -Name ${h.payloadVariable} -Scope Global`), true)
    assert.equal(wrapper.includes(`Remove-Variable -Name ${h.payloadVariable} -Scope Global`), true)
    for (const [body, label] of [
      [bodies[0], 'partA'],
      [bodies[1], 'partB'],
    ]) {
      assert.equal(h[label + 'Utf8Bytes'], Buffer.byteLength(body))
      assert.equal(h[label + 'Utf16Units'], body.length)
      assert.equal(h[label + 'Sha256'], createHash('sha256').update(body).digest('hex'))
    }
    for (const guard of [
      `GetByteCount($rdwebHandoffPayload) -eq ${a.utf8Bytes}`,
      `$rdwebHandoffPayload.Length -eq ${a.utf16Units}`,
      `$rdwebHandoffHash -ceq '${a.sha256}'`,
    ])
      assert.equal(wrapper.includes(guard), true)
  }
  const broken = stdoutExitHandoffParts(h.stage1Source.replaceAll("\n\n'@\n", "\n'@\n")).bodies
  assert.notEqual(broken[0] + "\n'@\n" + broken[1], a.source)
  const s = h.stage2Source
  assert.equal(s.split('.Invoke(').length, 2)
  for (const guard of [
    '$rdwebHandoffValue.Value -isnot [string]',
    `GetByteCount($rdwebHandoffText) -ne ${a.utf8Bytes}`,
    `$rdwebHandoffText.Length -ne ${a.utf16Units}`,
    `$rdwebHandoffHash -cne '${a.sha256}'`,
    '$rdwebHandoffText.IndexOf([char]13)',
    '$rdwebHandoffText.IndexOf([char]0)',
    '$rdwebHandoffText.EndsWith($rdwebHandoffLf)',
  ]) {
    assert.equal(s.includes(guard), true)
    assert.equal(s.indexOf(guard) < s.indexOf('.Invoke('), true)
  }
  assert.equal(
    /returned|boundary_observed|Set-ExecutionPolicy|\[string\]\$rdwebHandoffValue.Value/.test(s),
    false,
  )
  assert.throws(() => v.parseNativeProbeEntryBoundaryOutput(h.unavailableLine + '\n'))
  for (const stage of ['stage1', 'stage2']) {
    const text = h[stage + 'Source']
    assert.equal(h[stage + 'Utf8Bytes'], Buffer.byteLength(text))
    assert.equal(h[stage + 'Utf16Units'], text.length)
    assert.equal(h[stage + 'Sha256'], createHash('sha256').update(text).digest('hex'))
    assert.equal(text.includes('\r') || text.includes('\0'), false)
    assert.equal(text.endsWith('\n'), true)
  }
})

// 不觸未知輸入getter／轉型，不接受來源覆寫；真metadata及fixture不可變。
test('entry-boundary rejects overrides coercion and freezes provenance', async () => {
  const v = await entryBoundaryApi()
  let touched = 0
  const unknown = {
    // 不讀未知來源。
    get source() {
      touched++
      return 'PUBLIC'
    },
    // 不對未知wire轉型。
    toString() {
      touched++
      return 'PUBLIC'
    },
  }
  for (const create of [
    v.createNativeProbePowerShellEntryBoundaryArtifact,
    v.createNativeProbePowerShellEntryBoundaryHandoffArtifact,
  ]) {
    for (const arg of [undefined, null, unknown, false, '', 0]) assert.throws(() => create(arg))
    const a = create()
    assert.equal(Object.isFrozen(a), true)
    assert.equal(a.nativeVerified, false)
  }
  assert.throws(() =>
    v.parseNativeProbeEntryBoundaryChildOutput(unknown, 'receiver_unavailable\n', 0),
  )
  assert.throws(() =>
    v.parseNativeProbeEntryBoundaryChildOutput(boundaryChildLine + refChildReadyLine, unknown, 0),
  )
  assert.throws(() => v.parseNativeProbeEntryBoundaryOutput(unknown))
  assert.equal(touched, 0)
  const a = v.createNativeProbePowerShellEntryBoundaryArtifact()
  for (const x of [a.trustedSources, ...a.trustedSources, a.wireFixtures, ...a.wireFixtures])
    assert.equal(Object.isFrozen(x), true)
  assert.equal(a.productEntryVerified, false)
  assert.equal(a.nativeExecutableVerified, false)
  for (const f of a.wireFixtures) v.parseNativeProbeEntryBoundaryOutput(f.wire)
})

// 真ax檔案及獨立pins、接手完整prefix、au／av歷史候選全部保留。
test('entry-boundary preserves takeover bytes historical artifacts and both source archives', async () => {
  const v = await entryBoundaryApi()
  const { readFileSync } = await import('node:fs')
  for (const [name, n, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      219939,
      '00dafb302b1fae445ce5c4a7a817fd5b4aa6ceb3e592f0383c052f67c49f22bc',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      307126,
      '7a316149dd99614752816f82e97e12f5a852e91c8e2668e2f9416ee62ed7a132',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, n))
        .digest('hex'),
      pin,
    )
  assert.equal(
    v.createNativeProbePowerShellMainRejectionArtifact().sha256,
    'd8f975be49bcf3f3831d064efa8ec11bb8395f177dffb01b6f4ef1db40c0ed3d',
  )
  assert.equal(
    v.createNativeProbePowerShellMainRejectionHandoffArtifact().stage2Sha256,
    'a894977ef267b2d364f1fdf3161134e4acd432d5419300ff7d135680327cd896',
  )
  for (const [name, pin] of [
    [
      'receiver-exit-channel-validation-20261026-01.zip',
      '9c2afe6cc6a467e4fd6840aa976a6d12d163ad47c9916d4ba24b6235d2e44c5b',
    ],
    [
      'receiver-entry-load-boundary-validation-20261026-01.zip',
      '098ce6a753b05819fb61cbc4890b2d3dc82e0efa2eb96a5b4d3ebd7f08428273',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('../../.cache/' + name, import.meta.url)))
        .digest('hex'),
      pin,
    )
  for (const item of v.createNativeProbePowerShellEntryBoundaryArtifact().trustedSources) {
    const bytes = readFileSync(
      new URL(
        '../../.cache/receiver-entry-load-boundary-validation-20261026-01/' + item.name,
        import.meta.url,
      ),
    )
    assert.equal(bytes.length, item.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256)
  }
})

// 僅RAM擴大新root使實際child命令超限，生成器與交接必須拒絕而非放寬上限。
test('entry-boundary rejects genuinely oversized child transport', async () => {
  await entryBoundaryApi()
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('./receiver-native-diagnostic.mjs', import.meta.url), 'utf8')
  const offset = source.indexOf(
    'export function createNativeProbePowerShellEntryBoundaryArtifact()',
  )
  assert.equal(offset > 0, true)
  const tail = source.slice(offset)
  const anchor = "  const packageRelativePath = '"
  assert.equal(tail.split(anchor).length, 2)
  const oversized = source.slice(0, offset) + tail.replace(anchor, anchor + 'P'.repeat(1600))
  const changed = await import(
    'data:text/javascript;base64,' + Buffer.from(oversized).toString('base64')
  )
  for (const create of [
    changed.createNativeProbePowerShellEntryBoundaryArtifact,
    changed.createNativeProbePowerShellEntryBoundaryHandoffArtifact,
  ])
    assert.throws(() => create(), { message: 'receiver_native_diagnostic_unavailable' })
})

// 新API缺失必須以斷言呈現；本節只執行純RAM模型，不啟任何程序。
async function jobModelApi() {
  const value = await import('./receiver-native-diagnostic.mjs')
  for (const name of [
    'unknownNativeProbeJobDiagnostic',
    'formatNativeProbeJobDiagnostic',
    'parseNativeProbeJobOutput',
    'createNativeProbeJobModel',
  ])
    assert.equal(typeof value[name], 'function', name)
  return value
}

const jobCompleteWire =
  'receiver_native_job_diagnostic,{"version":2,"phase":"complete","reason":"none","childStart":"confirmed","childExit":"confirmed","childPolicyRestore":"confirmed","parentPolicyVerify":"confirmed","resourcesClose":"confirmed","jobAssigned":"confirmed","treeEmpty":"confirmed","stdoutEof":"confirmed","stderrEof":"confirmed","caseSet":"matched","cancelState":"not_requested"}\n'
const jobObservedWire = jobCompleteWire + 'receiver_native_job_result,status=observed\n'

// 固定事件序列是手寫oracle，不由模型輸出反算下一步；略去事件供缺證負向使用。
function observeJobSuccess(model, omitted = '') {
  const events = [
    'suspended',
    'assigned',
    'resumed',
    'case_E0',
    'case_E1',
    'case_E2',
    'case_E7',
    'case_O',
    'case_R',
    'case_A',
    'childExit',
    'treeEmpty',
    'stdoutEof',
    'stderrEof',
    'childPolicyRestore',
    'parentPolicyVerify',
  ]
  for (const [index, name] of events.entries()) {
    if (name !== omitted) model.observe(name, index + 1, true)
  }
}

// 放寬version或漏掉tree證據都會讓此固定wire消費契約失效。
test('job-v2 accepts only the independent complete wire and a matching result', async () => {
  const v = await jobModelApi()
  const parsed = v.parseNativeProbeJobOutput(jobObservedWire)
  assert.equal(parsed.status, 'observed')
  assert.equal(parsed.diagnostic.version, 2)
  assert.equal(parsed.diagnostic.treeEmpty, 'confirmed')
  assert.equal(v.formatNativeProbeJobDiagnostic(parsed.diagnostic), jobCompleteWire)
  assert.equal(Object.isFrozen(parsed), true)
  assert.equal(Object.isFrozen(parsed.diagnostic), true)
  assert.equal(
    v.parseNativeProbeJobOutput(jobObservedWire.replaceAll('\n', '\r\n')).status,
    'observed',
  )
})

// 若parser接受多行、重複鍵或舊五confirmed，就會錯信不完整程序樹證據。
test('job-v2 rejects malformed framing duplicate keys and incomplete evidence', async () => {
  const v = await jobModelApi()
  const bad = [
    '',
    null,
    Buffer.from(jobObservedWire),
    jobObservedWire.slice(0, -1),
    jobObservedWire + '\n',
    'prefix' + jobObservedWire,
    jobObservedWire + jobObservedWire,
    jobObservedWire.replace('"version":2', '"version":1'),
    jobObservedWire.replace('"version":2', '"version":2,"version":2'),
    jobObservedWire.replace('"version":2', '"version":2,"extra":true'),
    jobObservedWire.replace('"phase":"complete"', '"phase":"unknown"'),
    jobObservedWire.replace('"cancelState":"not_requested"', '"cancelState":"requested"'),
    jobObservedWire.replace('"caseSet":"matched"', '"caseSet":"unknown"'),
    jobObservedWire.replace('status=observed', 'status=defect_observed'),
    jobObservedWire.replace('{"version":2,', '{ "version":2,'),
    'x'.repeat(8193),
  ]
  for (const key of [...evidence, 'jobAssigned', 'treeEmpty', 'stdoutEof', 'stderrEof']) {
    bad.push(jobObservedWire.replace(`"${key}":"confirmed"`, `"${key}":"unknown"`))
  }
  for (const wire of bad) {
    const parsed = v.parseNativeProbeJobOutput(wire)
    assert.equal(parsed.status, 'unavailable')
    assert.deepEqual(parsed.diagnostic, v.unknownNativeProbeJobDiagnostic())
  }
})

// descriptor白名單不可觸發getter／toJSON，也不能把動態資料帶進固定錯誤。
test('job-v2 formatter rejects unsafe objects without invoking accessors', async () => {
  const v = await jobModelApi()
  const valid = JSON.parse(jobCompleteWire.slice('receiver_native_job_diagnostic,'.length))
  let touched = 0
  const getter = { ...valid }
  Object.defineProperty(getter, 'reason', {
    enumerable: true,
    // 若被測格式器讀getter，計數即暴露錯誤邊界。
    get() {
      touched++
      return 'none'
    },
  })
  const toJSON = {
    ...valid,
    // 外部serializer callback不可被呼叫。
    toJSON() {
      touched++
      return valid
    },
  }
  for (const value of [null, [], getter, toJSON, { ...valid, [Symbol('extra')]: true }]) {
    assert.throws(() => v.formatNativeProbeJobDiagnostic(value), {
      message: 'receiver_native_job_diagnostic_unavailable',
    })
  }
  assert.equal(touched, 0)
})

// 移除任何啟動／案例／收尾gate都不能仍產生complete。
test('job-v2 model requires ordered cases cleanup and all nine confirmations', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeJobSuccess(model)
  assert.equal(model.snapshot().phase, 'unknown')
  assert.deepEqual(model.cleanup(17), { target: 'none', deadlineMs: 2017 })
  model.observe('resourcesClose', 18, true)
  const terminal = model.finish(19)
  assert.equal(v.formatNativeProbeJobDiagnostic(terminal), jobCompleteWire)
  model.observe('case_E0', 20, false)
  assert.equal(model.finish(21), terminal)
  assert.equal(Object.isFrozen(terminal), true)
})

for (const omitted of [
  'childExit',
  'treeEmpty',
  'stdoutEof',
  'stderrEof',
  'childPolicyRestore',
  'parentPolicyVerify',
  'case_A',
]) {
  // 每項缺證分開跑，防止只檢查五舊欄位或多數決成功。
  test(`job-v2 model cannot complete without ${omitted}`, async () => {
    const v = await jobModelApi()
    const model = v.createNativeProbeJobModel()
    observeJobSuccess(model, omitted)
    model.cleanup(17)
    model.observe('resourcesClose', 18, true)
    assert.notEqual(model.finish(19).phase, 'complete')
  })
}

// 恢復PS之前未納job是實際危險分支，不能只事後補assigned。
test('job-v2 model rejects resume before assignment and cannot repair the failure', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('resumed', 2, true)
  model.observe('assigned', 3, true)
  assert.equal(model.snapshot().childStart, 'unknown')
  assert.equal(model.finish(4).reason, 'guard_rejected')
})

// 指派失敗只能決策取消自有暫停handle，不能誤取消外層／未知job或重試。
test('job-v2 assignment failure chooses owned process cancellation only once', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('assigned', 2, false)
  assert.deepEqual(model.cleanup(3), { target: 'owned_process', deadlineMs: 2003 })
  assert.deepEqual(model.cleanup(4), { target: 'none', deadlineMs: 2003 })
  model.observe('cancelled', 5, true)
  assert.equal(model.finish(6).cancelState, 'requested')
})

// PS已退出仍可能有Node，不能僅憑childExit選擇不取消。
test('job-v2 assigned tree cancellation uses the owned job and one absolute deadline', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('assigned', 2, true)
  model.observe('resumed', 3, true)
  model.observe('childExit', 4, true)
  assert.deepEqual(model.cleanup(18000), { target: 'owned_job', deadlineMs: 20000 })
  assert.deepEqual(model.cleanup(19000), { target: 'none', deadlineMs: 20000 })
  model.observe('treeEmpty', 19999, true)
  model.observe('cancelled', 19999, false)
  const terminal = model.finish(20000)
  assert.equal(terminal.reason, 'deadline')
  assert.equal(terminal.cancelState, 'unconfirmed')
  assert.notEqual(terminal.phase, 'complete')
})

// 在沒有owned handle之前不准產生取消決策。
test('job-v2 cleanup with no acquisition never targets a process or job', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  assert.deepEqual(model.cleanup(0), { target: 'none', deadlineMs: 2000 })
  assert.notEqual(model.finish(1).phase, 'complete')
})

// 非單調時間、錯型別、逾期或陌生事件不能透過隱式轉型補證據。
test('job-v2 model fails closed on invalid observations and time boundaries', async () => {
  const v = await jobModelApi()
  for (const [kind, time, result] of [
    ['suspended', 0, 'true'],
    ['suspended', -1, true],
    ['suspended', NaN, true],
    ['suspended', 0.5, true],
    ['suspended', 18000, true],
    ['unknown', 0, true],
    ['assigned', 0, true],
    ['treeEmpty', 0, true],
    ['resourcesClose', 0, true],
  ]) {
    const model = v.createNativeProbeJobModel()
    model.observe(kind, time, result)
    assert.equal(model.finish(18001).phase, 'failed')
    assert.notEqual(model.snapshot().reason, 'none')
  }
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 5, true)
  model.observe('assigned', 4, true)
  assert.equal(model.finish(6).reason, 'guard_rejected')
})

// 重新報成功、跨序案例、重播case與過早treeEmpty均不能消除首失敗。
test('job-v2 model keeps negative evidence and rejects replayed or out of order cases', async () => {
  const v = await jobModelApi()
  for (const event of ['case_E1', 'treeEmpty', 'resumed']) {
    const model = v.createNativeProbeJobModel()
    model.observe('suspended', 1, true)
    model.observe('assigned', 2, true)
    model.observe('resumed', 3, true)
    model.observe(event, 4, true)
    assert.equal(model.finish(5).reason, 'guard_rejected')
  }
  const model = v.createNativeProbeJobModel()
  observeJobSuccess(model)
  model.observe('stdoutEof', 17, false)
  model.observe('stdoutEof', 18, true)
  model.cleanup(19)
  model.observe('resourcesClose', 20, true)
  assert.equal(model.finish(21).stdoutEof, 'unconfirmed')
})

// 可信案例不符必須保持defect，不能被其後收尾失敗覆蓋或偽裝成功。
test('job-v2 model distinguishes sticky case mismatch from unavailable cleanup', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('assigned', 2, true)
  model.observe('resumed', 3, true)
  model.observe('case_E0', 4, false)
  model.observe('case_E0', 5, true)
  assert.equal(model.snapshot().reason, 'case_mismatch')
  assert.equal(model.snapshot().caseSet, 'mismatched')
  for (const [i, name] of [
    'childExit',
    'treeEmpty',
    'stdoutEof',
    'stderrEof',
    'childPolicyRestore',
    'parentPolicyVerify',
  ].entries()) {
    model.observe(name, 6 + i, true)
  }
  model.cleanup(12)
  model.observe('resourcesClose', 13, true)
  const diagnostic = model.finish(14)
  const wire = v.formatNativeProbeJobDiagnostic(diagnostic)
  assert.equal(
    v.parseNativeProbeJobOutput(wire + 'receiver_native_job_result,status=defect_observed\n')
      .status,
    'defect_observed',
  )
  const missing = wire.replace('"resourcesClose":"confirmed"', '"resourcesClose":"unconfirmed"')
  const unavailable = v.parseNativeProbeJobOutput(
    missing + 'receiver_native_job_result,status=unavailable\n',
  )
  assert.equal(unavailable.status, 'unavailable')
  assert.equal(unavailable.diagnostic.reason, 'case_mismatch')
})

// 真正超過容量的wire必須在JSON解析前拒絕，不能靠固定短enum掩蓋缺少上限。
test('job-v2 parser enforces its actual byte bound before parsing', async () => {
  const v = await jobModelApi()
  const wire = jobObservedWire.replace('"reason":"none"', '"reason":"' + '公'.repeat(3000) + '"')
  assert.ok(Buffer.byteLength(wire) > 8192)
  const parse = JSON.parse
  let decoded = 0
  // 仍呼叫真JSON解析；只計數以證明超量在decode前拒絕，而非碰巧被enum擋下。
  JSON.parse = function (...args) {
    decoded++
    return parse(...args)
  }
  try {
    assert.deepEqual(
      v.parseNativeProbeJobOutput(wire).diagnostic,
      v.unknownNativeProbeJobDiagnostic(),
    )
    assert.equal(decoded, 0)
    assert.equal(v.parseNativeProbeJobOutput(jobObservedWire).status, 'observed')
    assert.equal(decoded, 1)
  } finally {
    JSON.parse = parse
  }
})

// EOF追加不得覆寫接手來源與歷史測試，所有舊候選仍由原suite驗證。
test('job-v2 preserves both complete preexisting source prefixes', async () => {
  await jobModelApi()
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      231220,
      '196a4443c7b27dd8ab819eb8f204e6a6b1a11d9059452412864d6fbe38dc1256',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      323776,
      'e324e4f1ea7566e6bb70e087822ecb0bed2beee7d398f9b10ad291271f355ae9',
    ],
  ]) {
    const source = readFileSync(new URL('./' + name, import.meta.url))
    assert.equal(createHash('sha256').update(source.subarray(0, bytes)).digest('hex'), pin)
  }
})

// OS回傳晚到不代表沒取得handle，逾期仍須保留正確owned取消目標。
test('job-v2 retains late acquired ownership without permitting resume or resetting budget', async () => {
  const v = await jobModelApi()
  const suspended = v.createNativeProbeJobModel()
  suspended.observe('suspended', 18000, true)
  assert.deepEqual(suspended.cleanup(18001), { target: 'owned_process', deadlineMs: 20000 })
  const assigned = v.createNativeProbeJobModel()
  assigned.observe('suspended', 1, true)
  assigned.observe('assigned', 18000, true)
  assigned.observe('resumed', 18001, true)
  assert.equal(assigned.snapshot().childStart, 'unknown')
  assert.deepEqual(assigned.cleanup(18002), { target: 'owned_job', deadlineMs: 20000 })
  const exhausted = v.createNativeProbeJobModel()
  exhausted.observe('suspended', 1, true)
  exhausted.observe('assigned', 2, true)
  assert.deepEqual(exhausted.cleanup(20000), { target: 'none', deadlineMs: 20000 })
  assert.equal(exhausted.finish(20001).reason, 'deadline')
})

// 正常期限不能接受晚到案例，清理2秒也不得逐項延期或在等號處確認。
test('job-v2 rejects late case evidence and evidence at the shared cleanup deadline', async () => {
  const v = await jobModelApi()
  const late = v.createNativeProbeJobModel()
  late.observe('suspended', 1, true)
  late.observe('assigned', 2, true)
  late.observe('resumed', 3, true)
  late.observe('case_E0', 18000, true)
  assert.equal(late.snapshot().reason, 'deadline')
  const model = v.createNativeProbeJobModel()
  observeJobSuccess(model)
  assert.deepEqual(model.cleanup(17), { target: 'none', deadlineMs: 2017 })
  model.observe('resourcesClose', 2017, true)
  assert.equal(model.finish(2018).resourcesClose, 'unknown')
  assert.deepEqual(model.cleanup(2019), { target: 'none', deadlineMs: 2017 })
})

// 已退出PS不可能再執行後續native案例，不能用晚到回報補matched。
test('job-v2 rejects case observations after child exit', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('assigned', 2, true)
  model.observe('resumed', 3, true)
  model.observe('childExit', 4, true)
  model.observe('case_E0', 5, true)
  assert.equal(model.finish(6).reason, 'guard_rejected')
})

// 超量輸出與stderr中止必須有安全事件，不得附內容或被改寫為成功。
test('job-v2 models output overflow and the fixed stderr interruption without payloads', async () => {
  const v = await jobModelApi()
  for (const event of ['stdoutOverflow', 'stderrOverflow']) {
    const model = v.createNativeProbeJobModel()
    model.observe('suspended', 1, true)
    model.observe('assigned', 2, true)
    model.observe('resumed', 3, true)
    model.observe(event, 4, true)
    assert.equal(model.finish(5).reason, 'unexpected_output')
  }
  const model = v.createNativeProbeJobModel()
  for (const [index, event] of [
    'suspended',
    'assigned',
    'resumed',
    'case_E0',
    'case_E1',
    'case_E2',
    'case_E7',
    'case_O',
  ].entries()) {
    model.observe(event, index + 1, true)
  }
  model.observe('stderrInterrupted', 9, true)
  assert.equal(model.snapshot().reason, 'native_stderr_interrupted')
  assert.equal(model.finish(10).caseSet, 'mismatched')
})

// 已納job之後即使觀察矛盾也不可退回單process取消，否則可能留下Node。
test('job-v2 never falls back to process cancellation after job assignment', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeJobSuccess(model)
  model.observe('childExit', 17, false)
  assert.deepEqual(model.cleanup(18), { target: 'owned_job', deadlineMs: 2018 })
})

// 首失敗保留case_mismatch不表示後續overflow可信；超量必須使對應EOF永久不足。
test('job-v2 overflow after mismatch prevents a trusted defect result', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('assigned', 2, true)
  model.observe('resumed', 3, true)
  model.observe('case_E0', 4, false)
  model.observe('stdoutOverflow', 5, true)
  model.observe('stdoutEof', 6, true)
  assert.equal(model.snapshot().reason, 'case_mismatch')
  assert.equal(model.finish(7).stdoutEof, 'unconfirmed')
})

// 額外成功回報也不能把重複案例誤認為下一個新native呼叫。
test('job-v2 rejects duplicate cases before completion', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('assigned', 2, true)
  model.observe('resumed', 3, true)
  model.observe('case_E0', 4, true)
  model.observe('case_E0', 5, true)
  assert.equal(model.finish(6).reason, 'guard_rejected')
})

// 固定trace只宣告模型觀察，不代表真的啟動PS／Node或取得Windows handle。
function observeBeLaunch(model) {
  model.observe('suspended', 1, true)
  model.observe('assigned', 2, true)
  model.observe('resumed', 3, true)
}

// 與正常exit0無關的實際收尾事實，供多個失敗路徑消費。
function observeBeTreeClosed(model) {
  model.observe('treeEmpty', 8, true)
  model.observe('stdoutEof', 9, true)
  model.observe('stderrEof', 10, true)
}

const beNonzeroWire =
  'receiver_native_job_diagnostic,{"version":2,"phase":"failed","reason":"cleanup_unconfirmed","childStart":"confirmed","childExit":"unconfirmed","childPolicyRestore":"unknown","parentPolicyVerify":"unknown","resourcesClose":"confirmed","jobAssigned":"confirmed","treeEmpty":"confirmed","stdoutEof":"confirmed","stderrEof":"confirmed","caseSet":"unknown","cancelState":"not_requested"}\n'

// 放寬只能改善失敗事實表示，不能讓非零退出或缺正常成功證據的wire被接受成observed。
test('job-exit accepts a failed empty tree without falsely requiring exit zero', async () => {
  const v = await jobModelApi()
  const result = v.parseNativeProbeJobOutput(
    beNonzeroWire + 'receiver_native_job_result,status=unavailable\n',
  )
  assert.equal(result.status, 'unavailable')
  assert.equal(result.diagnostic.treeEmpty, 'confirmed')
  assert.equal(result.diagnostic.childExit, 'unconfirmed')
  assert.equal(v.formatNativeProbeJobDiagnostic(result.diagnostic), beNonzeroWire)
  for (const suffix of ['observed', 'defect_observed']) {
    assert.deepEqual(
      v.parseNativeProbeJobOutput(beNonzeroWire + `receiver_native_job_result,status=${suffix}\n`)
        .diagnostic,
      v.unknownNativeProbeJobDiagnostic(),
    )
  }
  assert.equal(
    v.parseNativeProbeJobOutput(
      beNonzeroWire.replace('"phase":"failed"', '"phase":"complete"') +
        'receiver_native_job_result,status=observed\n',
    ).status,
    'unavailable',
  )
})

// 非零正常結束也已signal，不應為了childExit未確認而對空job發取消。
test('job-exit records nonzero process termination and empty tree without cancelling it', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeBeLaunch(model)
  model.observe('processSignaled', 6, true)
  model.observe('childExit', 7, false)
  observeBeTreeClosed(model)
  assert.deepEqual(model.cleanup(11), { target: 'none', deadlineMs: 2011 })
  model.observe('resourcesClose', 12, true)
  assert.equal(v.formatNativeProbeJobDiagnostic(model.finish(13)), beNonzeroWire)
})

// 強制終止後查空只算收尾，不得用signal補childExit或政策finally成功。
test('job-exit cancellation can confirm an empty tree but never normal success', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeBeLaunch(model)
  assert.deepEqual(model.cleanup(4), { target: 'owned_job', deadlineMs: 2004 })
  model.observe('cancelled', 5, true)
  model.observe('processSignaled', 6, true)
  model.observe('childExit', 7, false)
  observeBeTreeClosed(model)
  model.observe('childPolicyRestore', 11, false)
  model.observe('parentPolicyVerify', 12, true)
  model.observe('resourcesClose', 13, true)
  assert.deepEqual(model.cleanup(14), { target: 'none', deadlineMs: 2004 })
  const terminal = model.finish(15)
  assert.equal(terminal.treeEmpty, 'confirmed')
  assert.equal(terminal.resourcesClose, 'confirmed')
  assert.equal(terminal.childExit, 'unconfirmed')
  assert.equal(terminal.childPolicyRestore, 'unconfirmed')
  assert.equal(terminal.cancelState, 'requested')
  const wire = v.formatNativeProbeJobDiagnostic(terminal)
  assert.equal(
    v.parseNativeProbeJobOutput(wire + 'receiver_native_job_result,status=unavailable\n').diagnostic
      .treeEmpty,
    'confirmed',
  )
})

// 尚未signal只是存活觀察，不是失敗；但它絕不能支撐treeEmpty。
test('job-exit rejects empty tree claims without actual process signal', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeBeLaunch(model)
  model.observe('processSignaled', 4, false)
  assert.equal(model.snapshot().phase, 'unknown')
  model.observe('treeEmpty', 5, true)
  assert.equal(model.finish(6).reason, 'guard_rejected')
  assert.equal(model.snapshot().treeEmpty, 'unknown')
})

// 從已signal的固定child取得早先case frame可以完成正常契約，但不能重啟程序。
test('job-exit consumes ordered buffered cases before logical normal exit completion', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeBeLaunch(model)
  model.observe('processSignaled', 4, true)
  for (const [index, event] of [
    'case_E0',
    'case_E1',
    'case_E2',
    'case_E7',
    'case_O',
    'case_R',
    'case_A',
  ].entries())
    model.observe(event, 5 + index, true)
  model.observe('childExit', 12, true)
  model.observe('treeEmpty', 13, true)
  model.observe('stdoutEof', 14, true)
  model.observe('stderrEof', 15, true)
  model.observe('childPolicyRestore', 16, true)
  model.observe('parentPolicyVerify', 17, true)
  assert.deepEqual(model.cleanup(18), { target: 'none', deadlineMs: 2018 })
  model.observe('resourcesClose', 19, true)
  assert.equal(v.formatNativeProbeJobDiagnostic(model.finish(20)), jobCompleteWire)
})

// 只知道已signal與查空，仍缺少正常exit0，不能因其餘八項齊備補complete。
test('job-exit physical signal cannot replace the normal exit evidence', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeBeLaunch(model)
  model.observe('processSignaled', 4, true)
  for (const [index, event] of [
    'case_E0',
    'case_E1',
    'case_E2',
    'case_E7',
    'case_O',
    'case_R',
    'case_A',
  ].entries())
    model.observe(event, 5 + index, true)
  model.observe('treeEmpty', 12, true)
  model.observe('stdoutEof', 13, true)
  model.observe('stderrEof', 14, true)
  model.observe('childPolicyRestore', 15, true)
  model.observe('parentPolicyVerify', 16, true)
  assert.deepEqual(model.cleanup(17), { target: 'none', deadlineMs: 2017 })
  model.observe('resourcesClose', 18, true)
  const terminal = model.finish(19)
  assert.equal(terminal.phase, 'failed')
  assert.equal(terminal.childExit, 'unknown')
  assert.equal(terminal.treeEmpty, 'confirmed')
  const parsed = v.parseNativeProbeJobOutput(
    v.formatNativeProbeJobDiagnostic(terminal) + 'receiver_native_job_result,status=unavailable\n',
  )
  assert.equal(parsed.diagnostic.resourcesClose, 'confirmed')
  assert.equal(parsed.status, 'unavailable')
})

// 指派前已結束的owned暫停process無須再terminate，也不得恢復執行。
test('job-exit does not cancel or resume a signaled process before assignment', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('processSignaled', 2, true)
  assert.equal(model.snapshot().phase, 'unknown')
  assert.deepEqual(model.cleanup(3), { target: 'none', deadlineMs: 2003 })
  model.observe('assigned', 4, true)
  model.observe('resumed', 5, true)
  assert.equal(model.finish(6).childStart, 'unknown')
})

// PS即使退出，仍可能有Node；實際signal不能替代job active=0。
test('job-exit still cancels the assigned tree when only the PS process has ended', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeBeLaunch(model)
  model.observe('processSignaled', 4, true)
  assert.equal(model.snapshot().phase, 'unknown')
  assert.deepEqual(model.cleanup(5), { target: 'owned_job', deadlineMs: 2005 })
  assert.deepEqual(model.cleanup(6), { target: 'none', deadlineMs: 2005 })
})

// 取消成功回報不是正常退出，晚到positive不得抹去強制終止的成功缺證。
test('job-exit never turns a cancellation into confirmed normal exit', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  observeBeLaunch(model)
  model.cleanup(4)
  model.observe('cancelled', 5, true)
  model.observe('processSignaled', 6, true)
  model.observe('childExit', 7, true)
  assert.equal(model.finish(8).childExit, 'unconfirmed')
})

// 新內部事件不能放寬標量／owned／deadline邊界，也不能由signal回復政策或正常exit。
test('job-exit validates signal ownership result type and the shared deadline', async () => {
  const v = await jobModelApi()
  const noOwner = v.createNativeProbeJobModel()
  noOwner.observe('processSignaled', 1, true)
  assert.equal(noOwner.finish(2).reason, 'guard_rejected')
  const wrongType = v.createNativeProbeJobModel()
  observeBeLaunch(wrongType)
  wrongType.observe('processSignaled', 4, 'true')
  assert.equal(wrongType.finish(5).reason, 'guard_rejected')
  const late = v.createNativeProbeJobModel()
  observeBeLaunch(late)
  late.cleanup(4)
  late.observe('processSignaled', 2004, true)
  late.observe('treeEmpty', 2004, true)
  assert.equal(late.finish(2005).treeEmpty, 'unknown')
  const bufferedLate = v.createNativeProbeJobModel()
  observeBeLaunch(bufferedLate)
  bufferedLate.observe('processSignaled', 4, true)
  bufferedLate.observe('case_E0', 18000, true)
  assert.equal(bufferedLate.finish(18001).reason, 'deadline')
})

// 本輪允許修改bc模型，但接手的全部舊test與bc以前來源必須逐byte保留。
test('job-exit preserves the pre-bc generator and the entire takeover test prefix', async () => {
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      231220,
      '196a4443c7b27dd8ab819eb8f204e6a6b1a11d9059452412864d6fbe38dc1256',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      341509,
      'c15a23b139507148f5be4959ade8c9ce366f606f2f70536e9252f7cb672e4404',
    ],
  ]) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
  }
})

for (const action of ['assigned', 'resumed']) {
  // 必須在進cleanup之前就拒絕對已signal程序操作，不能靠收尾gate碰巧擋住。
  test(`job-exit rejects ${action} after independent signal before cleanup`, async () => {
    const v = await jobModelApi()
    const model = v.createNativeProbeJobModel()
    model.observe('suspended', 1, true)
    if (action === 'resumed') model.observe('assigned', 2, true)
    model.observe('processSignaled', 3, true)
    model.observe(action, 4, true)
    assert.equal(model.snapshot().reason, 'guard_rejected')
    assert.equal(model.finish(5).childStart, 'unknown')
  })
}

// signal事實單調保留，矛盾回報不可把已退出變回存活並導致新process取消。
test('job-exit keeps physical signal despite a contradictory later poll', async () => {
  const v = await jobModelApi()
  const model = v.createNativeProbeJobModel()
  model.observe('suspended', 1, true)
  model.observe('processSignaled', 2, true)
  model.observe('processSignaled', 3, false)
  assert.equal(model.snapshot().reason, 'guard_rejected')
  assert.deepEqual(model.cleanup(4), { target: 'none', deadlineMs: 2004 })
  assert.equal(model.finish(5).reason, 'guard_rejected')
})

const supervisorV3Evidence = [
  'childStart',
  'childExit',
  'childPolicyRestore',
  'supervisorBoundaryVerify',
  'resourcesClose',
  'jobAssigned',
  'treeEmpty',
  'stdoutEof',
  'stderrEof',
]
const supervisorV3CompleteLine =
  'receiver_native_supervisor_diagnostic,{"version":3,"phase":"complete","reason":"none","childStart":"confirmed","childExit":"confirmed","childPolicyRestore":"confirmed","supervisorBoundaryVerify":"confirmed","resourcesClose":"confirmed","jobAssigned":"confirmed","treeEmpty":"confirmed","stdoutEof":"confirmed","stderrEof":"confirmed","caseSet":"matched","cancelState":"not_requested"}\n'
const supervisorV3ObservedWire =
  supervisorV3CompleteLine + 'receiver_native_supervisor_result,status=observed\n'
const supervisorV3FailedLine =
  'receiver_native_supervisor_diagnostic,{"version":3,"phase":"failed","reason":"cleanup_unconfirmed","childStart":"confirmed","childExit":"unknown","childPolicyRestore":"unknown","supervisorBoundaryVerify":"confirmed","resourcesClose":"confirmed","jobAssigned":"confirmed","treeEmpty":"confirmed","stdoutEof":"confirmed","stderrEof":"confirmed","caseSet":"matched","cancelState":"not_requested"}\n'

// 獨立手寫資料讓formatter錯欄位或預填證據時不能產生自我驗證的oracle。
function supervisorV3Complete() {
  return {
    version: 3,
    phase: 'complete',
    reason: 'none',
    childStart: 'confirmed',
    childExit: 'confirmed',
    childPolicyRestore: 'confirmed',
    supervisorBoundaryVerify: 'confirmed',
    resourcesClose: 'confirmed',
    jobAssigned: 'confirmed',
    treeEmpty: 'confirmed',
    stdoutEof: 'confirmed',
    stderrEof: 'confirmed',
    caseSet: 'matched',
    cancelState: 'not_requested',
  }
}

// 缺能力須以typeof斷言RED，不讓module載入錯誤代替行為測試。
async function supervisorV3Api(model = false) {
  const v = await import('./receiver-native-diagnostic.mjs')
  for (const name of [
    'unknownNativeProbeSupervisorDiagnostic',
    'formatNativeProbeSupervisorDiagnostic',
    'parseNativeProbeSupervisorOutput',
    ...(model ? ['createNativeProbeSupervisorModel'] : []),
  ])
    assert.equal(typeof v[name], 'function', name)
  return v
}

// constructor不得把舊父政策或未知證據默認成功，正向wire需逐字符合獨立literal。
test('supervisor-v3 wire separates unknown evidence and canonical successful output', async () => {
  const v = await supervisorV3Api()
  const value = v.unknownNativeProbeSupervisorDiagnostic()
  assert.equal(value.version, 3)
  assert.equal(Object.keys(value).length, 14)
  assert.equal(Object.hasOwn(value, 'parentPolicyVerify'), false)
  for (const key of supervisorV3Evidence) assert.equal(value[key], 'unknown')
  assert.equal(Object.isFrozen(value), true)
  assert.equal(
    v.formatNativeProbeSupervisorDiagnostic(supervisorV3Complete()),
    supervisorV3CompleteLine,
  )
  for (const wire of [
    supervisorV3ObservedWire,
    supervisorV3ObservedWire.replaceAll('\n', '\r\n'),
  ]) {
    const result = v.parseNativeProbeSupervisorOutput(wire)
    assert.equal(result.status, 'observed')
    assert.deepEqual(result.diagnostic, supervisorV3Complete())
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result.diagnostic), true)
  }
})

// 省略任何證據或以not_acquired補票，formatter與parser都必須拒絕成功。
test('supervisor-v3 wire requires each of the nine independent confirmations', async () => {
  const v = await supervisorV3Api()
  for (const key of supervisorV3Evidence) {
    for (const state of ['unknown', 'not_acquired', 'unconfirmed']) {
      const value = { ...supervisorV3Complete(), [key]: state }
      assert.throws(
        () => v.formatNativeProbeSupervisorDiagnostic(value),
        /^Error: receiver_native_supervisor_diagnostic_unavailable$/,
      )
      const wire =
        'receiver_native_supervisor_diagnostic,' +
        JSON.stringify(value) +
        '\nreceiver_native_supervisor_result,status=observed\n'
      assert.equal(v.parseNativeProbeSupervisorOutput(wire).diagnostic.phase, 'unknown')
    }
  }
})

// 舊schema、舊prefix或父政策欄位不可經更名／補欄便當成新版證據。
test('supervisor-v3 wire rejects old versions prefixes and policy substitutions', async () => {
  const v = await supervisorV3Api()
  for (const wire of [
    supervisorV3ObservedWire.replace('"version":3', '"version":2'),
    supervisorV3ObservedWire.replace('"version":3', '"version":1'),
    supervisorV3ObservedWire.replaceAll('receiver_native_supervisor_', 'receiver_native_job_'),
    supervisorV3ObservedWire.replace('supervisorBoundaryVerify', 'parentPolicyVerify'),
    supervisorV3ObservedWire.replace(
      '"resourcesClose"',
      '"parentPolicyVerify":"confirmed","resourcesClose"',
    ),
    supervisorV3ObservedWire.replace('"childPolicyRestore":"confirmed",', ''),
    supervisorV3ObservedWire.replace('"supervisorBoundaryVerify":"confirmed",', ''),
  ]) {
    assert.equal(v.parseNativeProbeSupervisorOutput(wire).diagnostic.phase, 'unknown')
  }
  const legacy = { ...supervisorV3Complete(), parentPolicyVerify: 'confirmed' }
  delete legacy.supervisorBoundaryVerify
  assert.throws(() => v.formatNativeProbeSupervisorDiagnostic(legacy))
})

// 信任完整但案例不符才能報defect；取消或成功退出缺證仍不可用。
test('supervisor-v3 wire classifies trusted defects separately from closed nonzero failure', async () => {
  const v = await supervisorV3Api()
  for (const reason of ['case_mismatch', 'native_stderr_interrupted']) {
    const line = supervisorV3CompleteLine
      .replace('"phase":"complete","reason":"none"', '"phase":"failed","reason":"' + reason + '"')
      .replace('"caseSet":"matched"', '"caseSet":"mismatched"')
    const value = { ...supervisorV3Complete(), phase: 'failed', reason, caseSet: 'mismatched' }
    assert.equal(v.formatNativeProbeSupervisorDiagnostic(value), line)
    assert.equal(
      v.parseNativeProbeSupervisorOutput(
        line + 'receiver_native_supervisor_result,status=defect_observed\n',
      ).status,
      'defect_observed',
    )
    for (const key of supervisorV3Evidence) {
      const missing = { ...value, [key]: 'unconfirmed' }
      if (['childStart', 'jobAssigned'].includes(key)) continue
      const wire =
        v.formatNativeProbeSupervisorDiagnostic(missing) +
        'receiver_native_supervisor_result,status=unavailable\n'
      assert.equal(v.parseNativeProbeSupervisorOutput(wire).status, 'unavailable')
    }
  }
  const failed = v.parseNativeProbeSupervisorOutput(
    supervisorV3FailedLine + 'receiver_native_supervisor_result,status=unavailable\n',
  )
  assert.equal(failed.diagnostic.treeEmpty, 'confirmed')
  assert.equal(failed.diagnostic.childExit, 'unknown')
  assert.equal(failed.diagnostic.childPolicyRestore, 'unknown')
  assert.equal(v.formatNativeProbeSupervisorDiagnostic(failed.diagnostic), supervisorV3FailedLine)
  assert.equal(
    v.parseNativeProbeSupervisorOutput(
      supervisorV3FailedLine + 'receiver_native_supervisor_result,status=observed\n',
    ).diagnostic.phase,
    'unknown',
  )
  assert.throws(() =>
    v.formatNativeProbeSupervisorDiagnostic({ ...failed.diagnostic, jobAssigned: 'unconfirmed' }),
  )
})

// canonical嚴格解析拒絕重複鍵與重排；不能先JSON.parse後忽略實際傳輸差異。
test('supervisor-v3 wire rejects malformed enum ordering framing and result contradictions', async () => {
  const v = await supervisorV3Api()
  for (const wire of [
    supervisorV3ObservedWire.replace('"version":3', '"version":3,"version":3'),
    supervisorV3ObservedWire.replace(
      '{"version":3,"phase":"complete"',
      '{"phase":"complete","version":3',
    ),
    supervisorV3ObservedWire.replace('{"version"', '{ "version"'),
    supervisorV3ObservedWire.replace('"none"', '"unknown"'),
    supervisorV3ObservedWire.replace('"complete"', '"unknown"'),
    supervisorV3ObservedWire.replace('"confirmed"', 'true'),
    supervisorV3ObservedWire.replace('"matched"', '"MATCHED"'),
    supervisorV3ObservedWire.replace('"not_requested"', '"requested"'),
    supervisorV3ObservedWire.replace('status=observed', 'status=unavailable'),
    supervisorV3ObservedWire.replace('\n', '\r'),
    supervisorV3ObservedWire.slice(0, -1),
    supervisorV3ObservedWire + '\n',
    '\n' + supervisorV3ObservedWire,
    'PUBLIC\n' + supervisorV3ObservedWire,
    supervisorV3ObservedWire.replace('{', '['),
  ])
    assert.equal(v.parseNativeProbeSupervisorOutput(wire).diagnostic.phase, 'unknown')
  for (const value of [undefined, null, 3, {}, [], Buffer.from(supervisorV3ObservedWire)])
    assert.equal(v.parseNativeProbeSupervisorOutput(value).diagnostic.phase, 'unknown')
})

// descriptor邊界不能因getter／toJSON而執行輸入；proto／symbol／隱藏欄也不接受。
test('supervisor-v3 wire never invokes getters or toJSON while formatting unknown values', async () => {
  const v = await supervisorV3Api()
  let calls = 0
  const accessor = supervisorV3Complete()
  Object.defineProperty(accessor, 'phase', {
    enumerable: true,
    // 若formatter碰到外部getter，本測試呼叫計數必須暴露違規。
    get() {
      calls++
      return 'complete'
    },
  })
  const dynamic = {
    ...supervisorV3Complete(),
    // toJSON不可被formatter用來把非法外部資料轉成白名單。
    toJSON() {
      calls++
      return supervisorV3Complete()
    },
  }
  const hidden = supervisorV3Complete()
  Object.defineProperty(hidden, 'phase', { enumerable: false })
  for (const value of [
    accessor,
    dynamic,
    hidden,
    { ...supervisorV3Complete(), [Symbol('public')]: true },
    Object.assign(Object.create({}), supervisorV3Complete()),
    null,
    3,
  ])
    assert.throws(() => v.formatNativeProbeSupervisorDiagnostic(value))
  assert.equal(calls, 0)
  assert.equal(
    v.formatNativeProbeSupervisorDiagnostic(
      Object.assign(Object.create(null), supervisorV3Complete()),
    ),
    supervisorV3CompleteLine,
  )
})

// 若先normalize或parse才量byte，上限與CRLF負向會產生decoder呼叫；RAM mutation驗證guard本身。
test('supervisor-v3 wire enforces the original byte bound before invoking JSON.parse', async () => {
  await supervisorV3Api()
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const full = readFileSync(new URL('./receiver-native-diagnostic.mjs', import.meta.url), 'utf8')
  const source = full
    .slice(full.indexOf('// version3屬獨立.NET監督拓樸'))
    .replaceAll('export function ', 'function ')
  const guard = 'Buffer.byteLength(stdout) > 8192'
  assert.equal(source.split(guard).length, 2)
  for (const newline of ['\n', '\r\n']) {
    const base = supervisorV3ObservedWire.replaceAll('\n', newline)
    const atLimit = base.replace('{', '{' + ' '.repeat(8192 - Buffer.byteLength(base)))
    assert.equal(Buffer.byteLength(atLimit), 8192)
    for (const [wire, mutate, wanted] of [
      [atLimit, false, 1],
      [atLimit.replace('{', '{ '), false, 0],
      [atLimit.replace('{', '{ '), true, 1],
    ]) {
      const context = { Buffer, wire, calls: 0 }
      const measured = mutate ? source.replace(guard, 'false') : source
      runInNewContext(
        `const originalParse = JSON.parse;
// 僅在RAM計數真decoder，不替換其行為或寫入fixture。
JSON.parse = function (...args) { calls++; return originalParse(...args) };
${measured}
parseNativeProbeSupervisorOutput(wire);`,
        context,
      )
      assert.equal(context.calls, wanted)
    }
  }
})

// 固定launch trace只提交公開標量，所有預期結果另由手寫literal判斷。
function supervisorV3Launch(model) {
  model.observe('supervisorBoundaryVerify', 0, true)
  model.observe('suspended', 1, true)
  model.observe('assigned', 2, true)
  model.observe('resumed', 3, true)
}

// 七案依序提交，用於檢查首失敗後禁止再把後案補成matched。
function supervisorV3Cases(model, start = 4) {
  for (const [index, kind] of [
    'case_E0',
    'case_E1',
    'case_E2',
    'case_E7',
    'case_O',
    'case_R',
    'case_A',
  ].entries())
    model.observe(kind, start + index, true)
}

// 正常收尾不以單一exit0替代其他證據，也不在cleanup前關閉資源。
function supervisorV3Close(model, start = 11, normalExit = true) {
  model.observe(normalExit ? 'childExit' : 'processSignaled', start, true)
  model.observe('treeEmpty', start + 1, true)
  model.observe('stdoutEof', start + 2, true)
  model.observe('stderrEof', start + 3, true)
  model.observe('childPolicyRestore', start + 4, true)
  const decision = model.cleanup(start + 5)
  model.observe('resourcesClose', start + 6, true)
  return decision
}

// 完整trace須逐字符合獨立wire，不讓模型與formatter相互補造預期。
test('supervisor-v3 model completes only the ordered nine-evidence trace', async () => {
  const v = await supervisorV3Api(true)
  const model = v.createNativeProbeSupervisorModel()
  assert.equal(model.snapshot().supervisorBoundaryVerify, 'unknown')
  supervisorV3Launch(model)
  supervisorV3Cases(model)
  assert.deepEqual(supervisorV3Close(model), { target: 'none', deadlineMs: 2016 })
  const terminal = model.finish(18)
  assert.equal(v.formatNativeProbeSupervisorDiagnostic(terminal), supervisorV3CompleteLine)
  assert.equal(v.parseNativeProbeSupervisorOutput(supervisorV3ObservedWire).status, 'observed')
  assert.equal(Object.isFrozen(model), true)
  assert.equal(Object.isFrozen(model.snapshot()), true)
  assert.equal(Object.isFrozen(terminal), true)
  assert.equal(model.finish(999999), terminal)
  model.observe('stdoutOverflow', 19, true)
  assert.deepEqual(model.snapshot(), terminal)
})

// 未驗監督邊界或拿PS政策替代時，不得取得正常owned launch或重試補PASS。
test('supervisor-v3 model requires its own preflight before launch and rejects policy substitution', async () => {
  const v = await supervisorV3Api(true)
  for (const event of [
    null,
    'childPolicyRestore',
    'parentPolicyVerify',
    'childStart',
    'jobAssigned',
  ]) {
    const model = v.createNativeProbeSupervisorModel()
    if (event) model.observe(event, 0, true)
    model.observe('suspended', 1, true)
    assert.equal(model.finish(2).reason, 'guard_rejected')
    assert.equal(model.snapshot().childStart, 'unknown')
  }
  const rejected = v.createNativeProbeSupervisorModel()
  rejected.observe('supervisorBoundaryVerify', 0, false)
  rejected.observe('supervisorBoundaryVerify', 1, true)
  rejected.observe('suspended', 2, true)
  assert.equal(rejected.snapshot().supervisorBoundaryVerify, 'unconfirmed')
  assert.equal(rejected.finish(3).reason, 'guard_rejected')
})

// 建立／指派／恢復只能按序，亂序不得靠後續事件恢復成功。
test('supervisor-v3 model rejects launch order violations and repeated case frames', async () => {
  const v = await supervisorV3Api(true)
  for (const first of ['assigned', 'resumed']) {
    const model = v.createNativeProbeSupervisorModel()
    model.observe('supervisorBoundaryVerify', 0, true)
    model.observe(first, 1, true)
    assert.equal(model.finish(2).reason, 'guard_rejected')
  }
  for (const sequence of [['case_E1'], ['case_E0', 'case_E0'], ['case_A']]) {
    const model = v.createNativeProbeSupervisorModel()
    supervisorV3Launch(model)
    for (const [index, event] of sequence.entries()) model.observe(event, index + 4, true)
    assert.equal(model.finish(9).reason, 'guard_rejected')
  }
})

// 首案例不符停止累計；只有完整正常收尾才能把固定不符分類為可信defect。
test('supervisor-v3 model retains the first mismatch through cleanup and later cases', async () => {
  const v = await supervisorV3Api(true)
  const model = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(model)
  model.observe('case_E0', 4, false)
  supervisorV3Cases(model, 5)
  supervisorV3Close(model, 12)
  const terminal = model.finish(19)
  assert.equal(terminal.reason, 'case_mismatch')
  assert.equal(terminal.caseSet, 'mismatched')
  assert.equal(
    v.parseNativeProbeSupervisorOutput(
      v.formatNativeProbeSupervisorDiagnostic(terminal) +
        'receiver_native_supervisor_result,status=defect_observed\n',
    ).status,
    'defect_observed',
  )
})

// stderr中斷只能屬R案例；錯位置或未啟動時不假造可信原生缺陷。
test('supervisor-v3 model distinguishes the R interruption from out-of-order reports', async () => {
  const v = await supervisorV3Api(true)
  for (const atR of [false, true]) {
    const model = v.createNativeProbeSupervisorModel()
    supervisorV3Launch(model)
    if (atR) {
      for (const [index, kind] of ['case_E0', 'case_E1', 'case_E2', 'case_E7', 'case_O'].entries())
        model.observe(kind, 4 + index, true)
    }
    model.observe('stderrInterrupted', 9, true)
    supervisorV3Close(model, 10)
    assert.equal(model.finish(17).reason, atR ? 'native_stderr_interrupted' : 'guard_rejected')
  }
})

// PS已signal後仍可解析其先前frame，但不得再恢復或指派已結束程序。
test('supervisor-v3 model separates buffered cases from post-signal launch attempts', async () => {
  const v = await supervisorV3Api(true)
  const buffered = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(buffered)
  buffered.observe('processSignaled', 4, true)
  supervisorV3Cases(buffered, 5)
  supervisorV3Close(buffered, 12)
  assert.equal(buffered.finish(19).phase, 'complete')
  for (const event of ['assigned', 'resumed']) {
    const model = v.createNativeProbeSupervisorModel()
    model.observe('supervisorBoundaryVerify', 0, true)
    model.observe('suspended', 1, true)
    if (event === 'resumed') model.observe('assigned', 2, true)
    model.observe('processSignaled', 3, true)
    model.observe(event, 4, true)
    assert.equal(model.finish(5).reason, 'guard_rejected')
    assert.equal(model.snapshot().childStart, 'unknown')
  }
})

// 物理退出不補exit0；查空可如實保留，但不把非零結果提升為observed。
test('supervisor-v3 model retains closed nonzero evidence without normal exit success', async () => {
  const v = await supervisorV3Api(true)
  const model = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(model)
  supervisorV3Cases(model)
  supervisorV3Close(model, 11, false)
  const terminal = model.finish(18)
  assert.equal(terminal.phase, 'failed')
  assert.equal(terminal.reason, 'cleanup_unconfirmed')
  assert.equal(terminal.childExit, 'unknown')
  assert.equal(terminal.treeEmpty, 'confirmed')
  assert.equal(terminal.resourcesClose, 'confirmed')
  assert.equal(
    v.parseNativeProbeSupervisorOutput(
      v.formatNativeProbeSupervisorDiagnostic(terminal) +
        'receiver_native_supervisor_result,status=unavailable\n',
    ).status,
    'unavailable',
  )
})

// 無signal不能宣稱樹空；即使PS已退出，未查空的assigned job仍要取消。
test('supervisor-v3 model requires physical exit for tree evidence and preserves owned cancellation targets', async () => {
  const v = await supervisorV3Api(true)
  const noSignal = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(noSignal)
  noSignal.observe('treeEmpty', 4, true)
  assert.equal(noSignal.finish(5).reason, 'guard_rejected')
  const assigned = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(assigned)
  assigned.observe('processSignaled', 4, true)
  assert.deepEqual(assigned.cleanup(5), { target: 'owned_job', deadlineMs: 2005 })
  assert.deepEqual(assigned.cleanup(6), { target: 'none', deadlineMs: 2005 })
  const unassigned = v.createNativeProbeSupervisorModel()
  unassigned.observe('supervisorBoundaryVerify', 0, true)
  unassigned.observe('suspended', 1, true)
  unassigned.observe('assigned', 2, false)
  assert.deepEqual(unassigned.cleanup(3), { target: 'owned_process', deadlineMs: 2003 })
  assert.equal(unassigned.cleanup(4).target, 'none')
})

// 已assigned後的矛盾負向不能令取消退回單process；要求取消不證正常退出或還原。
test('supervisor-v3 model never downgrades owned job cancellation or restores normal exit after cancel', async () => {
  const v = await supervisorV3Api(true)
  const model = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(model)
  model.observe('assigned', 4, false)
  assert.equal(model.cleanup(5).target, 'owned_job')
  model.observe('cancelled', 6, true)
  model.observe('processSignaled', 7, true)
  model.observe('childExit', 8, true)
  model.observe('treeEmpty', 9, true)
  model.observe('stdoutEof', 10, true)
  model.observe('stderrEof', 11, true)
  model.observe('resourcesClose', 12, true)
  const terminal = model.finish(13)
  assert.equal(terminal.childExit, 'unconfirmed')
  assert.equal(terminal.childPolicyRestore, 'unknown')
  assert.equal(terminal.treeEmpty, 'confirmed')
  assert.equal(terminal.cancelState, 'requested')
  assert.equal(terminal.phase, 'failed')
})

// 第一次進cleanup才定截止；等號失敗，不因重入、多路或晚到而重新補時。
test('supervisor-v3 model uses strict shared deadlines and preserves late acquired ownership only for cleanup', async () => {
  const v = await supervisorV3Api(true)
  for (const [time, phase] of [
    [17999, 'complete'],
    [18000, 'failed'],
  ]) {
    const model = v.createNativeProbeSupervisorModel()
    supervisorV3Launch(model)
    supervisorV3Cases(model)
    supervisorV3Close(model)
    // 此trace的cleanup已在16開始，故另用晚進cleanup的trace測正常18秒界線。
    assert.equal(model.finish(time).phase, 'failed')
    const lateCleanup = v.createNativeProbeSupervisorModel()
    supervisorV3Launch(lateCleanup)
    supervisorV3Cases(lateCleanup)
    lateCleanup.observe('childExit', 11, true)
    lateCleanup.observe('treeEmpty', 12, true)
    lateCleanup.observe('stdoutEof', 13, true)
    lateCleanup.observe('stderrEof', 14, true)
    lateCleanup.observe('childPolicyRestore', time, true)
    lateCleanup.cleanup(time)
    lateCleanup.observe('resourcesClose', time, true)
    assert.equal(lateCleanup.finish(time).phase, phase)
  }
  const late = v.createNativeProbeSupervisorModel()
  late.observe('supervisorBoundaryVerify', 0, true)
  late.observe('suspended', 18000, true)
  late.observe('assigned', 18001, true)
  late.observe('resumed', 18002, true)
  assert.equal(late.snapshot().childStart, 'unknown')
  assert.deepEqual(late.cleanup(18003), { target: 'owned_job', deadlineMs: 20000 })
  assert.deepEqual(late.cleanup(19000), { target: 'none', deadlineMs: 20000 })
  late.observe('processSignaled', 20000, true)
  late.observe('treeEmpty', 20000, true)
  assert.equal(late.finish(20000).treeEmpty, 'unknown')
  const equality = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(equality)
  assert.equal(equality.cleanup(4).deadlineMs, 2004)
  equality.observe('processSignaled', 2003, true)
  equality.observe('treeEmpty', 2004, true)
  assert.equal(equality.finish(2004).treeEmpty, 'unknown')
})

// scalar／clock非法或尚未owned的signal必須拒絕，不可經隱式轉型補成功。
test('supervisor-v3 model rejects invalid scalar clocks and unowned signals', async () => {
  const v = await supervisorV3Api(true)
  for (const time of [-1, NaN, Infinity, 0.5, '0', Number.MAX_SAFE_INTEGER + 1]) {
    const model = v.createNativeProbeSupervisorModel()
    model.observe('supervisorBoundaryVerify', time, true)
    assert.equal(model.finish(1).reason, 'guard_rejected')
  }
  const wrongResult = v.createNativeProbeSupervisorModel()
  wrongResult.observe('supervisorBoundaryVerify', 0, 'true')
  assert.equal(wrongResult.finish(1).reason, 'guard_rejected')
  const noOwner = v.createNativeProbeSupervisorModel()
  noOwner.observe('processSignaled', 0, true)
  assert.equal(noOwner.finish(1).reason, 'guard_rejected')
  const backwards = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(backwards)
  backwards.observe('processSignaled', 2, true)
  assert.equal(backwards.finish(4).reason, 'guard_rejected')
})

// overflow與負向證據sticky，首mismatch不能遮蔽管線不可信而產生defect_observed。
test('supervisor-v3 model keeps overflow and negative evidence sticky after the first mismatch', async () => {
  const v = await supervisorV3Api(true)
  for (const stream of ['stdout', 'stderr']) {
    const model = v.createNativeProbeSupervisorModel()
    supervisorV3Launch(model)
    model.observe('case_E0', 4, false)
    model.observe(stream + 'Overflow', 5, true)
    supervisorV3Close(model, 6)
    const terminal = model.finish(13)
    assert.equal(terminal.reason, 'case_mismatch')
    assert.equal(terminal[stream + 'Eof'], 'unconfirmed')
    const parsed = v.parseNativeProbeSupervisorOutput(
      v.formatNativeProbeSupervisorDiagnostic(terminal) +
        'receiver_native_supervisor_result,status=unavailable\n',
    )
    assert.equal(parsed.diagnostic.caseSet, 'mismatched')
    assert.equal(parsed.status, 'unavailable')
  }
  const negative = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(negative)
  negative.observe('childPolicyRestore', 4, false)
  negative.observe('childPolicyRestore', 5, true)
  assert.equal(negative.finish(6).childPolicyRestore, 'unconfirmed')
})

// resourcesClose必須等cleanup／signal／EOF／查空；signal矛盾不應復活程序。
test('supervisor-v3 model rejects premature closure and keeps physical signal monotonic', async () => {
  const v = await supervisorV3Api(true)
  const premature = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(premature)
  premature.observe('resourcesClose', 4, true)
  assert.equal(premature.finish(5).reason, 'guard_rejected')
  const signaled = v.createNativeProbeSupervisorModel()
  signaled.observe('supervisorBoundaryVerify', 0, true)
  signaled.observe('suspended', 1, true)
  signaled.observe('processSignaled', 2, true)
  signaled.observe('processSignaled', 3, false)
  assert.equal(signaled.cleanup(4).target, 'none')
  assert.equal(signaled.finish(5).reason, 'guard_rejected')
  const empty = v.createNativeProbeSupervisorModel()
  assert.equal(empty.finish(0).phase, 'failed')
  assert.equal(empty.snapshot().reason, 'cleanup_unconfirmed')
})

// 舊來源與測試完整prefix為接手工作，EOF新增不得覆寫其bytes／pins。
test('supervisor-v3 preserves both entire takeover prefixes', async () => {
  const { readFileSync } = await import('node:fs')
  for (const [name, bytes, pin] of [
    [
      'receiver-native-diagnostic.mjs',
      243735,
      'b7135b63fa8b8c6984ffd75013176d2dc7a0de31c69ee079ffea52c485c0cab8',
    ],
    [
      'test-receiver-native-diagnostic.mjs',
      352815,
      'b128077629f50f1a709c6912e7e07133bac163d480314abc0962114d8d73adce',
    ],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('./' + name, import.meta.url)).subarray(0, bytes))
        .digest('hex'),
      pin,
    )
})

// 若關閉證據可在任何一條pipe仍未EOF時先確認，最後補EOF便可能掩蓋過早free。
test('supervisor-v3 model rejects closure until both streams and tree have settled', async () => {
  const v = await supervisorV3Api(true)
  for (const omitted of ['treeEmpty', 'stdoutEof', 'stderrEof']) {
    const model = v.createNativeProbeSupervisorModel()
    supervisorV3Launch(model)
    model.observe('processSignaled', 4, true)
    for (const key of ['treeEmpty', 'stdoutEof', 'stderrEof'])
      if (key !== omitted) model.observe(key, 5, true)
    model.cleanup(6)
    model.observe('resourcesClose', 7, true)
    assert.notEqual(model.finish(8).resourcesClose, 'confirmed')
  }
})

// .NET返回owned handle可能晚於進cleanup；只保存所有權供既有剩餘預算取消，不恢復執行。
test('supervisor-v3 model retains acquisition after cleanup without refreshing the deadline', async () => {
  const v = await supervisorV3Api(true)
  const model = v.createNativeProbeSupervisorModel()
  model.observe('supervisorBoundaryVerify', 0, true)
  assert.deepEqual(model.cleanup(18000), { target: 'none', deadlineMs: 20000 })
  model.observe('suspended', 18001, true)
  model.observe('assigned', 18002, true)
  model.observe('resumed', 18003, true)
  assert.deepEqual(model.cleanup(18004), { target: 'owned_job', deadlineMs: 20000 })
  assert.equal(model.finish(18005).childStart, 'unknown')
})

// 缺任何模型證據都不能通過完整trace；負向取消結果亦不能被之後的true洗掉。
test('supervisor-v3 model cannot complete with omitted evidence or recover a failed cancel acknowledgement', async () => {
  const v = await supervisorV3Api(true)
  for (const omitted of [
    'childExit',
    'childPolicyRestore',
    'stdoutEof',
    'stderrEof',
    'resourcesClose',
  ]) {
    const model = v.createNativeProbeSupervisorModel()
    supervisorV3Launch(model)
    supervisorV3Cases(model)
    model.observe('processSignaled', 11, true)
    for (const [index, key] of [
      'childExit',
      'treeEmpty',
      'stdoutEof',
      'stderrEof',
      'childPolicyRestore',
    ].entries())
      if (key !== omitted) model.observe(key, 12 + index, true)
    model.cleanup(17)
    if (omitted !== 'resourcesClose') model.observe('resourcesClose', 18, true)
    assert.equal(model.finish(19).phase, 'failed')
  }
  const cancelled = v.createNativeProbeSupervisorModel()
  supervisorV3Launch(cancelled)
  cancelled.cleanup(4)
  cancelled.observe('cancelled', 5, false)
  cancelled.observe('cancelled', 6, true)
  assert.equal(cancelled.finish(7).cancelState, 'unconfirmed')
})

// 首mismatch必須保留，但結案已逾期或clock非法時，不能沿用完整證據誤報可信defect。
test('supervisor-v3 model demotes trusted defect acceptance after an expired or invalid finish clock', async () => {
  const v = await supervisorV3Api(true)
  for (const time of [2018, 20000, NaN, 0]) {
    const model = v.createNativeProbeSupervisorModel()
    supervisorV3Launch(model)
    model.observe('case_E0', 4, false)
    supervisorV3Close(model, 12)
    const terminal = model.finish(time)
    assert.equal(terminal.reason, 'case_mismatch')
    assert.equal(terminal.resourcesClose, 'unconfirmed')
    assert.equal(
      v.parseNativeProbeSupervisorOutput(
        v.formatNativeProbeSupervisorDiagnostic(terminal) +
          'receiver_native_supervisor_result,status=unavailable\n',
      ).diagnostic.caseSet,
      'mismatched',
    )
  }
})
