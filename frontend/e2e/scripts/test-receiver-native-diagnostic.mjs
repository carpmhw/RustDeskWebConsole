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
