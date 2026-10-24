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
