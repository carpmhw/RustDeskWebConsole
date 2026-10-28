import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const phases = new Set([
  'unknown',
  'parent_preflight',
  'source_pin',
  'supervisor_pin',
  'root_absence',
  'child_start',
  'child_parse',
  'child_policy',
  'private_create',
  'private_guard',
  'negative_guard',
  'copy',
  'junction',
  'child_cleanup',
  'parent_cleanup',
  'complete',
])
const reasons = new Set([
  'unknown',
  'none',
  'guard_rejected',
  'source_mismatch',
  'parse_rejected',
  'io_failed',
  'deadline',
  'unexpected_output',
  'cleanup_unconfirmed',
])
const evidence = [
  'childStart',
  'childExit',
  'childPolicyRestore',
  'parentPolicyVerify',
  'resourcesClose',
]
const evidenceNames = new Set(evidence)
const states = new Set(['unknown', 'not_acquired', 'confirmed', 'unconfirmed'])
const fields = ['version', 'phase', 'reason', ...evidence]
const prefix = 'receiver_native_diagnostic,'
const maxLineBytes = 1024

// 只回固定錯誤，不帶外部值、例外原文或cause。
function unavailable() {
  throw new Error('receiver_native_diagnostic_unavailable')
}

// 初始狀態沒有任何原生證據；unknown不能推成未取得或已還原。
export function unknownNativeProbeDiagnostic() {
  return Object.freeze({
    version: 1,
    phase: 'unknown',
    reason: 'unknown',
    childStart: 'unknown',
    childExit: 'unknown',
    childPolicyRestore: 'unknown',
    parentPolicyVerify: 'unknown',
    resourcesClose: 'unknown',
  })
}

// 只複製精確白名單的純資料descriptor，不讀getter或呼叫外部toJSON。
function validatedCopy(value) {
  if (value === null || typeof value !== 'object') return unavailable()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return unavailable()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length !== fields.length) return unavailable()
  const copy = Object.create(null)
  for (const name of fields) {
    const descriptor = descriptors[name]
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      return unavailable()
    }
    copy[name] = descriptor.value
  }
  if (copy.version !== 1 || !phases.has(copy.phase) || !reasons.has(copy.reason)) {
    return unavailable()
  }
  for (const name of evidence) if (!states.has(copy[name])) return unavailable()
  if ((copy.phase === 'complete') !== (copy.reason === 'none')) return unavailable()
  if (copy.phase === 'complete') {
    for (const name of evidence) if (copy[name] !== 'confirmed') return unavailable()
  }
  return copy
}

// 每輪固定容量collector；只記安全證據，不決定receiver結果、exit或授權。
export function createNativeProbeDiagnostic() {
  const value = { ...unknownNativeProbeDiagnostic() }
  const attempted = new Set()
  const negative = new Set()
  let failed = false
  let terminal = null
  return Object.freeze({
    // 首失敗含unknown也要鎖定，晚到清理結果不得替換原因。
    fail(phase, reason) {
      if (terminal || failed) return
      failed = true
      value.phase = phases.has(phase) && phase !== 'complete' ? phase : 'unknown'
      value.reason = reasons.has(reason) && reason !== 'none' ? reason : 'unknown'
    },
    // 開始取得即未確認；重複或與未取得宣告矛盾的attempt不能重用成功證據。
    attempt(name) {
      if (terminal || !evidenceNames.has(name)) return
      if (attempted.has(name) || value[name] === 'not_acquired') negative.add(name)
      attempted.add(name)
      value[name] = 'unconfirmed'
    },
    // 只確認本輪已attempt的證據；任何非嚴格true保留不可逆負向。
    settle(name, confirmed) {
      if (terminal || !evidenceNames.has(name) || !attempted.has(name)) return
      if (confirmed !== true) negative.add(name)
      value[name] = confirmed === true && !negative.has(name) ? 'confirmed' : 'unconfirmed'
    },
    // 只有owner確定本輪未開始取得才能宣告，不能覆蓋attempt或清理不足。
    notAcquired(name) {
      if (terminal || !evidenceNames.has(name) || attempted.has(name)) return
      if (value[name] === 'unknown') value[name] = 'not_acquired'
    },
    // 快照是凍結副本，不讓晚到事件改寫已交付的資料。
    snapshot() {
      return Object.freeze({ ...value })
    },
    // 僅完整五項確認才標記complete，結案後所有事件均忽略。
    finish() {
      if (terminal) return terminal
      let allConfirmed = true
      for (const name of evidence) if (value[name] !== 'confirmed') allConfirmed = false
      if (!failed && allConfirmed) {
        value.phase = 'complete'
        value.reason = 'none'
      }
      terminal = Object.freeze({ ...value })
      return terminal
    },
  })
}

// 僅序列化安全副本，單一canonical終態行含LF至多1024 UTF-8 bytes。
export function formatNativeProbeDiagnostic(value) {
  try {
    const line = prefix + JSON.stringify(validatedCopy(value)) + '\n'
    if (Buffer.byteLength(line, 'utf8') > maxLineBytes) return unavailable()
    return line
  } catch {
    return unavailable()
  }
}

// 只接一個完整canonical行；重複key／marker、截斷或未知資料皆固定unknown。
export function parseNativeProbeDiagnostic(stdout) {
  try {
    if (typeof stdout !== 'string' || Buffer.byteLength(stdout, 'utf8') > maxLineBytes) {
      return unknownNativeProbeDiagnostic()
    }
    if (!stdout.endsWith('\n')) return unknownNativeProbeDiagnostic()
    const body = stdout.endsWith('\r\n') ? stdout.slice(0, -2) : stdout.slice(0, -1)
    if (!body.startsWith(prefix) || body.includes('\n') || body.includes('\r')) {
      return unknownNativeProbeDiagnostic()
    }
    const value = validatedCopy(JSON.parse(body.slice(prefix.length)))
    if (formatNativeProbeDiagnostic(value).slice(0, -1) !== body) {
      return unknownNativeProbeDiagnostic()
    }
    return Object.freeze({ ...value })
  } catch {
    return unknownNativeProbeDiagnostic()
  }
}

// 只把內部固定schema資料轉成PS單引號literal，不接受呼叫端的程式或路徑。
function psLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'"
}

// 陣列元素均來自同一份JS白名單，避免另一份手抄schema漂移。
function psArray(values) {
  return '@(' + values.map(psLiteral).join(', ') + ')'
}

// artifact只描述公開原碼；生成、雜湊或容量檢查都不是原生驗證。
function powerShellArtifact(purpose, source, expectedStdout) {
  if (!source || source.includes('\r') || source.includes('\0')) return unavailable()
  const argumentUtf16Units =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '.length +
    Buffer.from(source, 'utf16le').toString('base64').length
  // 為未來明確exe路徑保留512 units；實際執行仍須另驗完整命令列與授權。
  if (argumentUtf16Units + 512 + 3 > 32766) return unavailable()
  return Object.freeze({
    purpose,
    source,
    nativeVerified: false,
    utf8Bytes: Buffer.byteLength(source, 'utf8'),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    argumentUtf16Units,
    expectedStdout,
  })
}

// 只生成PS5.1候選函數；不執行PS、不讀環境或檔案，也沒有live CLI。
export function createNativeProbePowerShellAdapterArtifact() {
  if (arguments.length !== 0) return unavailable()
  const source = `# 僅定義純RAM診斷函數；此候選尚未取得PS5.1原生驗證。
# 所有欄位與literal由同一JS schema生成，函數不啟程序或操作政策／檔案。
function Get-RdwebNativeSchema {
  return ,@{
    Fields = ${psArray(fields)}
    Evidence = ${psArray(evidence)}
    Phases = ${psArray([...phases])}
    Reasons = ${psArray([...reasons])}
    States = ${psArray([...states])}
    Prefix = ${psLiteral(prefix)}
    MaxBytes = ${maxLineBytes}
  }
}

# 初始所有證據unknown，attempt與負向紀錄只存固定名稱。
function New-RdwebNativeDiagnostic {
  return ,@{
    Value = [ordered]@{ version = 1; phase = 'unknown'; reason = 'unknown'; ${evidence.map((name) => name + " = 'unknown'").join('; ')} }
    Attempted = @{}; Negative = @{}; Failed = $false; Terminal = $null
  }
}

# 首失敗含未知也要鎖定，不從exception取得原因或轉型未知值。
function Set-RdwebNativeFailure([hashtable]$State, [object]$Phase, [object]$Reason) {
  if ($null -ne $State.Terminal -or $State.Failed) { return }
  $State.Failed = $true
  $schema = Get-RdwebNativeSchema
  $State.Value['phase'] = 'unknown'
  $State.Value['reason'] = 'unknown'
  if ($Phase -is [string] -and $Phase -cne 'complete' -and $schema.Phases -ccontains $Phase) {
    $State.Value['phase'] = $Phase
  }
  if ($Reason -is [string] -and $Reason -cne 'none' -and $schema.Reasons -ccontains $Reason) {
    $State.Value['reason'] = $Reason
  }
}

# 開始取得即未確認，重複取得或違反not_acquired宣告均不可恢復成功。
function Start-RdwebNativeEvidence([hashtable]$State, [object]$Name) {
  if ($null -ne $State.Terminal -or $Name -isnot [string]) { return }
  if ((Get-RdwebNativeSchema).Evidence -cnotcontains $Name) { return }
  if ($State.Attempted.ContainsKey($Name) -or $State.Value[$Name] -ceq 'not_acquired') {
    $State.Negative[$Name] = $true
  }
  $State.Attempted[$Name] = $true
  $State.Value[$Name] = 'unconfirmed'
}

# 只有已開始取得的本輪證據能確認，非嚴格bool true留下sticky負向。
function Confirm-RdwebNativeEvidence([hashtable]$State, [object]$Name, [object]$Confirmed) {
  if ($null -ne $State.Terminal -or $Name -isnot [string]) { return }
  if ((Get-RdwebNativeSchema).Evidence -cnotcontains $Name -or -not $State.Attempted.ContainsKey($Name)) { return }
  if ($Confirmed -isnot [bool] -or -not $Confirmed) { $State.Negative[$Name] = $true }
  $State.Value[$Name] = 'unconfirmed'
  if ($Confirmed -is [bool] -and $Confirmed -and -not $State.Negative.ContainsKey($Name)) {
    $State.Value[$Name] = 'confirmed'
  }
}

# 只有尚未attempt的owner宣告能記not_acquired，不能抹除已取得或負向。
function Set-RdwebNativeNotAcquired([hashtable]$State, [object]$Name) {
  if ($null -ne $State.Terminal -or $Name -isnot [string]) { return }
  if ((Get-RdwebNativeSchema).Evidence -cnotcontains $Name -or $State.Attempted.ContainsKey($Name)) { return }
  if ($State.Value[$Name] -ceq 'unknown') { $State.Value[$Name] = 'not_acquired' }
}

# 快照複製成唯讀dictionary，單物件回傳以避免管線展開或洩漏內部引用。
function Get-RdwebNativeSnapshot([hashtable]$State) {
  $copy = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
  foreach ($name in (Get-RdwebNativeSchema).Fields) { $copy.Add($name, $State.Value[$name]) }
  return ,([Collections.ObjectModel.ReadOnlyDictionary[string,object]]::new($copy))
}

# 僅無首失敗且五項全confirmed才complete；結案後所有事件皆忽略。
function Complete-RdwebNativeDiagnostic([hashtable]$State) {
  if ($null -ne $State.Terminal) { return ,($State.Terminal) }
  $all = $true
  foreach ($name in (Get-RdwebNativeSchema).Evidence) {
    if ($State.Value[$name] -cne 'confirmed') { $all = $false }
  }
  if (-not $State.Failed -and $all) { $State.Value['phase'] = 'complete'; $State.Value['reason'] = 'none' }
  $State.Terminal = Get-RdwebNativeSnapshot $State
  return ,($State.Terminal)
}

# 只接dictionary白名單標量，固定順序手組JSON，不呼叫未知getter或serializer。
function Format-RdwebNativeDiagnostic([object]$Value) {
  if ($null -eq $Value) { throw 'receiver_native_diagnostic_unavailable' }
  $type = $Value.psbase.GetType()
  if ($type -ne [hashtable] -and $type -ne [Collections.Specialized.OrderedDictionary] -and
      $type -ne [Collections.ObjectModel.ReadOnlyDictionary[string,object]]) {
    throw 'receiver_native_diagnostic_unavailable'
  }
  $schema = Get-RdwebNativeSchema
  if ($Value.psbase.Count -ne $schema.Fields.Count) { throw 'receiver_native_diagnostic_unavailable' }
  foreach ($key in $Value.psbase.Keys) {
    if ($key -isnot [string] -or $schema.Fields -cnotcontains $key) { throw 'receiver_native_diagnostic_unavailable' }
  }
  if ($Value['version'] -isnot [int] -or $Value['version'] -ne 1 -or
      $Value['phase'] -isnot [string] -or $schema.Phases -cnotcontains $Value['phase'] -or
      $Value['reason'] -isnot [string] -or $schema.Reasons -cnotcontains $Value['reason']) {
    throw 'receiver_native_diagnostic_unavailable'
  }
  foreach ($name in $schema.Evidence) {
    if ($Value[$name] -isnot [string] -or $schema.States -cnotcontains $Value[$name]) {
      throw 'receiver_native_diagnostic_unavailable'
    }
  }
  if (($Value['phase'] -ceq 'complete') -ne ($Value['reason'] -ceq 'none')) { throw 'receiver_native_diagnostic_unavailable' }
  if ($Value['phase'] -ceq 'complete') {
    foreach ($name in $schema.Evidence) {
      if ($Value[$name] -cne 'confirmed') { throw 'receiver_native_diagnostic_unavailable' }
    }
  }
  $parts = [Collections.Generic.List[string]]::new()
  foreach ($name in $schema.Fields) {
    if ($name -ceq 'version') { $parts.Add('"version":1') }
    else { $parts.Add('"' + $name + '":"' + $Value[$name] + '"') }
  }
  $line = $schema.Prefix + '{' + [string]::Join(',', $parts.ToArray()) + '}' + [char]10
  if ([Text.Encoding]::UTF8.GetByteCount($line) -gt $schema.MaxBytes) { throw 'receiver_native_diagnostic_unavailable' }
  return $line
}
`
  return powerShellArtifact('receiver_native_diagnostic_adapter_v1', source, '')
}

// 只生成同一adapter的公開RAM自測候選；oracle由獨立JS核心生成，不執行PS。
export function createNativeProbePowerShellSelfTestArtifact() {
  if (arguments.length !== 0) return unavailable()
  const adapter = createNativeProbePowerShellAdapterArtifact()
  const all = { ...unknownNativeProbeDiagnostic(), phase: 'complete', reason: 'none' }
  for (const name of evidence) all[name] = 'confirmed'
  const expectedWires = Object.freeze([
    formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()),
    formatNativeProbeDiagnostic(all),
    formatNativeProbeDiagnostic({
      ...unknownNativeProbeDiagnostic(),
      phase: 'root_absence',
      reason: 'guard_rejected',
      resourcesClose: 'confirmed',
    }),
  ])
  const expectedStdout = 'receiver_native_diagnostic_fixture_observed\n'
  const failureStdout = 'receiver_native_diagnostic_fixture_unavailable\n'
  const opening = '& {\n'
  const source =
    opening +
    adapter.source +
    `
# 自測只用公開RAM資料；不是child／政策／檔案或NTFS證據。
$ErrorActionPreference = 'Stop'
# 斷言失敗只回固定fixture marker，不顯示未知例外。
function Assert-RdwebNativeFixture([bool]$Condition) {
  if (-not $Condition) { throw 'receiver_native_fixture_failed' }
}
# 負向必須是adapter固定拒絕分類，任意native錯誤不得當通過。
function Assert-RdwebNativeFixtureRejected([scriptblock]$Action) {
  $rejected = $false
  try { [void](& $Action) }
  catch {
    if ($_.Exception -isnot [Management.Automation.RuntimeException] -or
        $_.Exception.Message -cne 'receiver_native_diagnostic_unavailable') { throw 'receiver_native_fixture_failed' }
    $rejected = $true
  }
  Assert-RdwebNativeFixture $rejected
}
# 只模擬五項公開證據，不聲稱真的取得或關閉任何原生資源。
function Confirm-RdwebNativeFixtureAll([hashtable]$State) {
  foreach ($name in (Get-RdwebNativeSchema).Evidence) {
    Start-RdwebNativeEvidence $State $name
    Confirm-RdwebNativeEvidence $State $name $true
  }
}
try {
  $expected = ${psArray(expectedWires.map((line) => line.slice(0, -1)))}
  $d = New-RdwebNativeDiagnostic
  $before = Get-RdwebNativeSnapshot $d
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic $before) -ceq ($expected[0] + [char]10))
  $blocked = $false
  try { $before['phase'] = 'complete' } catch { $blocked = $true }
  Assert-RdwebNativeFixture ($blocked -and $before['phase'] -ceq 'unknown')
  Confirm-RdwebNativeFixtureAll $d
  $done = Complete-RdwebNativeDiagnostic $d
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic $done) -ceq ($expected[1] + [char]10))
  Assert-RdwebNativeFixture ($before['phase'] -ceq 'unknown')
  Set-RdwebNativeFailure $d 'parent_cleanup' 'deadline'
  Start-RdwebNativeEvidence $d 'childStart'
  Confirm-RdwebNativeEvidence $d 'resourcesClose' $false
  Set-RdwebNativeNotAcquired $d 'childExit'
  Assert-RdwebNativeFixture ([object]::ReferenceEquals($done, (Complete-RdwebNativeDiagnostic $d)))
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic (Get-RdwebNativeSnapshot $d)) -ceq ($expected[1] + [char]10))

  $d = New-RdwebNativeDiagnostic
  Set-RdwebNativeFailure $d 'root_absence' 'guard_rejected'
  Set-RdwebNativeFailure $d 'parent_cleanup' 'deadline'
  Start-RdwebNativeEvidence $d 'resourcesClose'
  Confirm-RdwebNativeEvidence $d 'resourcesClose' $true
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic (Complete-RdwebNativeDiagnostic $d)) -ceq ($expected[2] + [char]10))
  $d = New-RdwebNativeDiagnostic
  foreach ($name in (Get-RdwebNativeSchema).Evidence) { Confirm-RdwebNativeEvidence $d $name $true }
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic (Complete-RdwebNativeDiagnostic $d)) -ceq ($expected[0] + [char]10))

  foreach ($negative in @($false, $null, 'true', 1)) {
    $d = New-RdwebNativeDiagnostic
    Start-RdwebNativeEvidence $d 'resourcesClose'
    Set-RdwebNativeNotAcquired $d 'resourcesClose'
    Confirm-RdwebNativeEvidence $d 'resourcesClose' $negative
    Confirm-RdwebNativeEvidence $d 'resourcesClose' $true
    $snapshot = Complete-RdwebNativeDiagnostic $d
    Assert-RdwebNativeFixture ($snapshot['resourcesClose'] -ceq 'unconfirmed' -and $snapshot['phase'] -ceq 'unknown')
  }
  $d = New-RdwebNativeDiagnostic
  foreach ($name in (Get-RdwebNativeSchema).Evidence) { Set-RdwebNativeNotAcquired $d $name }
  Assert-RdwebNativeFixture ((Get-RdwebNativeSnapshot $d)['childStart'] -ceq 'not_acquired')
  Confirm-RdwebNativeFixtureAll $d
  Assert-RdwebNativeFixture ((Complete-RdwebNativeDiagnostic $d)['phase'] -ceq 'unknown')
  $d = New-RdwebNativeDiagnostic
  Confirm-RdwebNativeFixtureAll $d
  Start-RdwebNativeEvidence $d 'childStart'
  Confirm-RdwebNativeEvidence $d 'childStart' $true
  Assert-RdwebNativeFixture ((Complete-RdwebNativeDiagnostic $d)['childStart'] -ceq 'unconfirmed')
  $d = New-RdwebNativeDiagnostic
  Set-RdwebNativeFailure $d 'complete' 'none'
  Confirm-RdwebNativeFixtureAll $d
  Assert-RdwebNativeFixture ((Complete-RdwebNativeDiagnostic $d)['phase'] -ceq 'unknown')

  $bad = (New-RdwebNativeDiagnostic).Value
  $bad['public_extra'] = 'PUBLIC_UNTRUSTED'
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $bad) }
  $bad = (New-RdwebNativeDiagnostic).Value
  $bad['version'] = $true
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $bad) }
  $bad = (New-RdwebNativeDiagnostic).Value
  $bad['phase'] = 'complete'; $bad['reason'] = 'none'
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $bad) }
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic @{version = 1}) }
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic 'PUBLIC_UNTRUSTED') }
  [Console]::Write(${psLiteral(expectedStdout.slice(0, -1))} + [char]10)
}
catch { [Console]::Write(${psLiteral(failureStdout.slice(0, -1))} + [char]10) }
}
`
  return Object.freeze({
    ...powerShellArtifact('receiver_native_diagnostic_fixture_v1', source, expectedStdout),
    failureStdout,
    expectedWires,
    adapterOffset: opening.length,
    adapterUnits: adapter.source.length,
    adapterSha256: adapter.sha256,
  })
}

// 來源轉換只接受固定唯一錨點，缺少或重複即拒絕，不猜測另一段PS原碼。
function uniqueSourceOffset(source, needle) {
  const offset = source.indexOf(needle)
  if (offset < 0 || offset !== source.lastIndexOf(needle)) return unavailable()
  return offset
}

// 保留v1案例位元及同一adapter，只生成附固定步驟的RAM候選，不執行PS。
export function createNativeProbePowerShellDiagnosticSelfTestArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellSelfTestArtifact()
  const adapter = createNativeProbePowerShellAdapterArtifact()
  if (
    baseline.sha256 !== 'ab88c6293129b9e74aae555c67c1b89f2509df47f2ee4da0949e38085fd96fac' ||
    adapter.sha256 !== '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f'
  ) {
    return unavailable()
  }
  const steps = [
    ['oracle_setup', '  $expected = @('],
    ['state_create', '  $d = New-RdwebNativeDiagnostic\n  $before ='],
    ['snapshot_initial', '  $before = Get-RdwebNativeSnapshot $d\n'],
    ['wire_unknown', '  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic $before)'],
    ['snapshot_readonly', '  $blocked = $false\n'],
    ['confirm_all', '  Confirm-RdwebNativeFixtureAll $d\n  $done ='],
    ['finish_complete', '  $done = Complete-RdwebNativeDiagnostic $d\n'],
    ['wire_complete', '  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic $done)'],
    ['snapshot_retained', "  Assert-RdwebNativeFixture ($before['phase'] -ceq 'unknown')\n"],
    [
      'late_events',
      "  Set-RdwebNativeFailure $d 'parent_cleanup' 'deadline'\n  Start-RdwebNativeEvidence $d 'childStart'",
    ],
    ['finish_identity', '  Assert-RdwebNativeFixture ([object]::ReferenceEquals'],
    [
      'sealed_wire',
      '  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic (Get-RdwebNativeSnapshot $d))',
    ],
    [
      'first_failure_wire',
      "  $d = New-RdwebNativeDiagnostic\n  Set-RdwebNativeFailure $d 'root_absence'",
    ],
    [
      'unattempted',
      '  $d = New-RdwebNativeDiagnostic\n  foreach ($name in (Get-RdwebNativeSchema).Evidence) { Confirm-RdwebNativeEvidence',
    ],
    ['sticky_negative', "  foreach ($negative in @($false, $null, 'true', 1)) {"],
    [
      'not_acquired',
      '  $d = New-RdwebNativeDiagnostic\n  foreach ($name in (Get-RdwebNativeSchema).Evidence) { Set-RdwebNativeNotAcquired',
    ],
    [
      'contradictory_acquisition',
      "  Confirm-RdwebNativeFixtureAll $d\n  Assert-RdwebNativeFixture ((Complete-RdwebNativeDiagnostic $d)['phase'] -ceq 'unknown')\n  $d = New-RdwebNativeDiagnostic\n  Confirm-RdwebNativeFixtureAll $d\n  Start-RdwebNativeEvidence",
    ],
    [
      'repeated_attempt',
      '  $d = New-RdwebNativeDiagnostic\n  Confirm-RdwebNativeFixtureAll $d\n  Start-RdwebNativeEvidence',
    ],
    [
      'unknown_failure',
      "  $d = New-RdwebNativeDiagnostic\n  Set-RdwebNativeFailure $d 'complete' 'none'",
    ],
    ['reject_extra', "  $bad = (New-RdwebNativeDiagnostic).Value\n  $bad['public_extra']"],
    ['reject_version', "  $bad = (New-RdwebNativeDiagnostic).Value\n  $bad['version']"],
    ['reject_incomplete', "  $bad = (New-RdwebNativeDiagnostic).Value\n  $bad['phase']"],
    [
      'reject_missing',
      '  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic @{version = 1}) }',
    ],
    [
      'reject_type',
      "  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic 'PUBLIC_UNTRUSTED') }",
    ],
  ]
  const offsets = steps.map(([, needle]) => uniqueSourceOffset(baseline.source, needle))
  const bodyEnd = uniqueSourceOffset(
    baseline.source,
    "  [Console]::Write('receiver_native_diagnostic_fixture_observed'",
  )
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] >= bodyEnd || (i > 0 && offsets[i] <= offsets[i - 1])) return unavailable()
  }

  const adapterEnd = baseline.adapterOffset + baseline.adapterUnits
  let helpers = baseline.source.slice(adapterEnd, offsets[0])
  const assertion = "if (-not $Condition) { throw 'receiver_native_fixture_failed' }"
  const assertionOffset = uniqueSourceOffset(helpers, assertion)
  helpers =
    helpers.slice(0, assertionOffset) +
    "if (-not $Condition) { $fixtureDiagnostic.Kind = 'assertion'; throw 'receiver_native_fixture_failed' }" +
    helpers.slice(assertionOffset + assertion.length)
  let source =
    baseline.source.slice(0, adapterEnd) +
    '\n# 自測診斷只存固定case／kind；不讀取或輸出原生例外。\n' +
    "$fixtureDiagnostic = @{ Case = 'unknown'; Kind = 'runtime' }\n" +
    helpers
  const caseMap = []
  for (let i = 0; i < steps.length; i++) {
    const id = 'c' + String(i + 1).padStart(2, '0')
    const next = offsets[i + 1] ?? bodyEnd
    source += '  $fixtureDiagnostic.Case = ' + psLiteral(id) + '\n'
    const offset = source.length
    const original = baseline.source.slice(offsets[i], next)
    source += original
    caseMap.push(
      Object.freeze({
        id,
        label: steps[i][0],
        offset,
        units: original.length,
        baselineOffset: offsets[i],
      }),
    )
  }
  Object.freeze(caseMap)
  const outputPrefix = 'receiver_native_diagnostic_fixture_v2,'
  const expectedStdout = outputPrefix + 'result=observed,case=complete,kind=none\n'
  const failureStdout = outputPrefix + 'result=unavailable,case=unknown,kind=unknown\n'
  const allowedStdout = Object.freeze([
    expectedStdout,
    failureStdout,
    ...caseMap.flatMap(({ id }) =>
      ['assertion', 'runtime'].map(
        (kind) => outputPrefix + 'result=unavailable,case=' + id + ',kind=' + kind + '\n',
      ),
    ),
  ])
  // 這只驗交接描述的固定字串，不把它當成候選已執行的stdout。
  for (const line of allowedStdout) {
    if (!/^[\x20-\x7e]+\n$/.test(line) || Buffer.byteLength(line, 'utf8') > 256) {
      return unavailable()
    }
  }
  source += `  [Console]::Write(${psLiteral(expectedStdout.slice(0, -1))} + [char]10)
}
catch {
  # 首次失敗直接離開整個try；只驗自有白名單，不讀ErrorRecord或例外內容。
  $line = ${psLiteral(failureStdout.slice(0, -1))} + [char]10
  if ($fixtureDiagnostic.Case -is [string] -and
      ${psArray(caseMap.map(({ id }) => id))} -ccontains $fixtureDiagnostic.Case -and
      $fixtureDiagnostic.Kind -is [string] -and
      @('assertion', 'runtime') -ccontains $fixtureDiagnostic.Kind) {
    $line = ${psLiteral(outputPrefix + 'result=unavailable,case=')} + $fixtureDiagnostic.Case + ',kind=' + $fixtureDiagnostic.Kind + [char]10
  }
  if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 256) {
    $line = ${psLiteral(failureStdout.slice(0, -1))} + [char]10
  }
  [Console]::Write($line)
}
}
`
  if (!source || source.includes('\r') || source.includes('\0')) return unavailable()
  const argumentUtf16Units =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '.length +
    Buffer.from(source, 'utf16le').toString('base64').length
  // v2明確只供RAM交接；超額只報實際容量，不提高v1上限或刪去負向案例。
  return Object.freeze({
    purpose: 'receiver_native_diagnostic_fixture_v2',
    source,
    nativeVerified: false,
    transport: 'interactive_ram_only',
    encodedCommandSupported: false,
    encodedCommandFits: argumentUtf16Units + 512 + 3 <= 32766,
    argumentUtf16Units,
    utf8Bytes: Buffer.byteLength(source, 'utf8'),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    baselineSha256: baseline.sha256,
    adapterOffset: baseline.adapterOffset,
    adapterUnits: baseline.adapterUnits,
    adapterSha256: adapter.sha256,
    caseMap,
    expectedWires: baseline.expectedWires,
    expectedStdout,
    failureStdout,
    allowedStdout,
    maxStdoutUtf8Bytes: 256,
  })
}

// 只生成同一公開初始快照的c04邊界探針；不修改adapter、不執行PS或I/O。
export function createNativeProbePowerShellC04ProbeArtifact() {
  if (arguments.length !== 0) return unavailable()
  const adapter = createNativeProbePowerShellAdapterArtifact()
  if (adapter.sha256 !== '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f') {
    return unavailable()
  }
  const formatterOffset = uniqueSourceOffset(
    adapter.source,
    'function Format-RdwebNativeDiagnostic(',
  )
  const formatter = adapter.source.slice(formatterOffset)
  const boundaries = [
    ['type_lookup', '  $type = $Value.psbase.GetType()\n'],
    ['type_guard', '  if ($type -ne [hashtable]'],
    ['schema_lookup', '  $schema = Get-RdwebNativeSchema\n'],
    ['field_count', '  if ($Value.psbase.Count'],
    ['field_keys', '  foreach ($key in $Value.psbase.Keys) {'],
    ['scalar_guards', "  if ($Value['version'] -isnot [int]"],
    ['evidence_guards', '  foreach ($name in $schema.Evidence) {'],
    ['state_pair', "  if (($Value['phase'] -ceq 'complete')"],
    ['end', '  $parts = [Collections.Generic.List[string]]::new()\n'],
  ]
  // 換行也納入唯一錨點，不能將巢狀四空白的foreach誤配成二空白步驟。
  const offsets = boundaries.map(([, text]) => uniqueSourceOffset(formatter, '\n' + text) + 1)
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i] <= offsets[i - 1]) return unavailable()
  }
  const order = [
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
  const guardSteps = new Set([
    'input_shape',
    'type_guard',
    'field_count',
    'field_keys',
    'scalar_guards',
    'evidence_guards',
    'state_pair',
  ])
  const expectedWire = formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic())
  const opening = '& {\n'
  let source =
    opening +
    adapter.source +
    `
# 只記公開步驟與固定分類；建立一份初始快照，不讀環境或舊ErrorRecord。
$ErrorActionPreference = 'Stop'
$C04 = @{ Step = 'unknown'; Kind = 'runtime' }
# 與原formatter相同的object參數界線；分解檢查不取代最後的原函數呼叫。
function Invoke-RdwebC04BoundaryProbe([object]$Value, [hashtable]$C04, [string]$ExpectedWire) {
`
  const regions = new Map()
  // 每段只加固定步驟標記，並保存真正交接位置及原adapter的來源對照。
  function appendStep(step, body, adapterOffset = null, original = null) {
    if (!order.includes(step) || regions.has(step) || !body) return unavailable()
    source += '  $C04.Step = ' + psLiteral(step) + "; $C04.Kind = 'runtime'\n"
    const offset = source.length
    source += body
    const kinds = ['runtime']
    if (guardSteps.has(step)) kinds.push('guard_rejected')
    if (step === 'wire_compare') kinds.push('comparison_mismatch')
    regions.set(
      step,
      Object.freeze({
        step,
        offset,
        units: body.length,
        adapterOffset,
        adapterUnits: original === null ? 0 : original.length,
        originalSha256:
          original === null ? null : createHash('sha256').update(original, 'utf8').digest('hex'),
        kinds: Object.freeze(kinds),
      }),
    )
  }
  appendStep(
    'input_shape',
    `  if ($null -eq $Value -or $Value -isnot [Collections.ObjectModel.ReadOnlyDictionary[string,object]]) {
    $C04.Kind = 'guard_rejected'; throw 'receiver_native_c04_probe_failed'
  }
`,
  )
  for (let i = 0; i < boundaries.length - 1; i++) {
    const original = formatter.slice(offsets[i], offsets[i + 1])
    const body = original.replaceAll(
      "throw 'receiver_native_diagnostic_unavailable'",
      "$C04.Kind = 'guard_rejected'; throw 'receiver_native_diagnostic_unavailable'",
    )
    appendStep(boundaries[i][0], body, formatterOffset + offsets[i], original)
  }
  appendStep('format_call', '  $actual = Format-RdwebNativeDiagnostic $Value\n')
  appendStep(
    'wire_compare',
    `  if ($actual -isnot [string] -or $actual -cne $ExpectedWire) {
    $C04.Kind = 'comparison_mismatch'; throw 'receiver_native_c04_probe_failed'
  }
`,
  )
  source += '}\ntry {\n'
  appendStep(
    'oracle_setup',
    '  $expectedWire = ' + psLiteral(expectedWire.slice(0, -1)) + ' + [char]10\n',
  )
  appendStep('state_create', '  $state = New-RdwebNativeDiagnostic\n')
  appendStep('snapshot', '  $snapshot = Get-RdwebNativeSnapshot $state\n')
  appendStep('probe_call', '  Invoke-RdwebC04BoundaryProbe $snapshot $C04 $expectedWire\n')
  if (regions.size !== order.length) return unavailable()
  const stepMap = Object.freeze(order.map((step) => regions.get(step)))
  const outputPrefix = 'receiver_native_c04_probe_v1,'
  const expectedStdout = outputPrefix + 'result=observed,step=complete,kind=none\n'
  const failureStdout = outputPrefix + 'result=unavailable,step=unknown,kind=unknown\n'
  const pairs = stepMap.flatMap(({ step, kinds }) => kinds.map((kind) => step + ':' + kind))
  const allowedStdout = Object.freeze([
    expectedStdout,
    failureStdout,
    ...stepMap.flatMap(({ step, kinds }) =>
      kinds.map(
        (kind) => outputPrefix + 'result=unavailable,step=' + step + ',kind=' + kind + '\n',
      ),
    ),
  ])
  for (const line of allowedStdout) {
    if (!/^[\x20-\x7e]+\n$/.test(line) || Buffer.byteLength(line, 'utf8') > 256) {
      return unavailable()
    }
  }
  source += `  [Console]::Write(${psLiteral(expectedStdout.slice(0, -1))} + [char]10)
}
catch {
  # 第一次失敗即結案；只用自有白名單，不讀取例外的message／type／stack。
  $line = ${psLiteral(failureStdout.slice(0, -1))} + [char]10
  if ($C04.Step -is [string] -and $C04.Kind -is [string] -and
      ${psArray(pairs)} -ccontains ($C04.Step + ':' + $C04.Kind)) {
    $line = ${psLiteral(outputPrefix + 'result=unavailable,step=')} + $C04.Step + ',kind=' + $C04.Kind + [char]10
  }
  if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 256) {
    $line = ${psLiteral(failureStdout.slice(0, -1))} + [char]10
  }
  [Console]::Write($line)
}
}
`
  if (source.includes('\r') || source.includes('\0')) return unavailable()
  const argumentUtf16Units =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '.length +
    Buffer.from(source, 'utf16le').toString('base64').length
  return Object.freeze({
    purpose: 'receiver_native_c04_probe_v1',
    source,
    nativeVerified: false,
    transport: 'interactive_ram_only',
    encodedCommandSupported: false,
    encodedCommandFits: argumentUtf16Units + 512 + 3 <= 32766,
    argumentUtf16Units,
    utf8Bytes: Buffer.byteLength(source, 'utf8'),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    adapterOffset: opening.length,
    adapterUnits: adapter.source.length,
    adapterSha256: adapter.sha256,
    stepMap,
    expectedWire,
    expectedStdout,
    failureStdout,
    allowedStdout,
    maxStdoutUtf8Bytes: 256,
  })
}

// 新版僅替換原adapter的一行型別查詢；舊候選與所有guard逐字保留。
export function createNativeProbePowerShellTypeFixedAdapterArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellAdapterArtifact()
  if (baseline.sha256 !== '9eccbb68e73c3c43e2a8fb79506babcdd4b925dad1a95032aa47a146990cf48f') {
    return unavailable()
  }
  const original = '  $type = $Value.psbase.GetType()\n'
  const replacement = "  $type = [object].GetMethod('GetType').Invoke($Value, $null)\n"
  const offset = uniqueSourceOffset(baseline.source, original)
  const source =
    baseline.source.slice(0, offset) + replacement + baseline.source.slice(offset + original.length)
  const artifact = powerShellArtifact('receiver_native_diagnostic_adapter_v2', source, '')
  return Object.freeze({
    ...artifact,
    transport: 'interactive_ram_only',
    encodedCommandSupported: false,
    encodedCommandFits: artifact.argumentUtf16Units + 512 + 3 <= 32766,
    baselineSha256: baseline.sha256,
    typeLookupOffset: offset,
    originalTypeLookupUnits: original.length,
    typeLookupUnits: replacement.length,
  })
}

// 保留v2全部案例及嚴格拒絕helper，只換新版adapter並追加公開型別fixture。
export function createNativeProbePowerShellTypeFixedSelfTestArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellDiagnosticSelfTestArtifact()
  const adapter = createNativeProbePowerShellTypeFixedAdapterArtifact()
  if (
    baseline.sha256 !== 'f038a7310d6883c8677333eb27a3b4830dc2bd3580eac39ceb1045c3f443a85a' ||
    baseline.adapterSha256 !== adapter.baselineSha256
  ) {
    return unavailable()
  }
  const adapterEnd = baseline.adapterOffset + baseline.adapterUnits
  const lastCase = baseline.caseMap.at(-1)
  const bodyEnd = lastCase.offset + lastCase.units
  const delta = adapter.source.length - baseline.adapterUnits
  let source =
    baseline.source.slice(0, baseline.adapterOffset) +
    adapter.source +
    baseline.source.slice(adapterEnd, bodyEnd)
  const caseMap = baseline.caseMap.map((item) =>
    Object.freeze({
      id: item.id,
      label: item.label,
      offset: item.offset + delta,
      units: item.units,
      baselineOffset: item.offset,
    }),
  )
  // 這些固定原碼只屬公開RAM測試，不是原生執行結果或現場輸入。
  const additions = [
    [
      'accept_hashtable',
      `  $plain = @{}
  foreach ($name in (Get-RdwebNativeSchema).Fields) { $plain.Add($name, $before[$name]) }
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic $plain) -ceq ($expected[0] + [char]10))
`,
    ],
    [
      'accept_ordered',
      `  $ordered = (New-RdwebNativeDiagnostic).Value
  Assert-RdwebNativeFixture ((Format-RdwebNativeDiagnostic $ordered) -ceq ($expected[0] + [char]10))
`,
    ],
    [
      'reject_null',
      `  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $null) }
`,
    ],
    [
      'reject_other_dictionary',
      `  $generic = [Collections.Generic.Dictionary[string,object]]::new()
  foreach ($name in (Get-RdwebNativeSchema).Fields) { $generic.Add($name, $before[$name]) }
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $generic) }
`,
    ],
    [
      'reject_custom_object',
      `  $custom = [pscustomobject]$plain
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $custom) }
`,
    ],
    [
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
      'reject_nonstring_key',
      `  $bad = $plain.Clone()
  $bad.Remove('phase'); $bad.Add(7, 'unknown')
  Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $bad) }
`,
    ],
    [
      'reject_member_key_collisions',
      `  foreach ($collision in @('psbase', 'GetType', 'Count', 'Keys')) {
    $bad = $plain.Clone()
    $bad.Remove('phase'); $bad.Add($collision, 'unknown')
    Assert-RdwebNativeFixtureRejected { [void](Format-RdwebNativeDiagnostic $bad) }
  }
`,
    ],
  ]
  for (const [index, [label, body]] of additions.entries()) {
    const id = 't' + String(index + 1).padStart(2, '0')
    source += '  $fixtureDiagnostic.Case = ' + psLiteral(id) + '\n'
    const offset = source.length
    source += body
    caseMap.push(Object.freeze({ id, label, offset, units: body.length, baselineOffset: null }))
  }
  Object.freeze(caseMap)
  const purpose = 'receiver_native_diagnostic_fixture_v3'
  const oldPurpose = 'receiver_native_diagnostic_fixture_v2'
  // 沿用原首失敗catch，只替換固定用途及新增case白名單，不放寬拒絕分類。
  let tail = baseline.source.slice(bodyEnd).replaceAll(oldPurpose + ',', purpose + ',')
  const originalIds = psArray(baseline.caseMap.map(({ id }) => id))
  const idsOffset = uniqueSourceOffset(tail, originalIds)
  tail =
    tail.slice(0, idsOffset) +
    psArray(caseMap.map(({ id }) => id)) +
    tail.slice(idsOffset + originalIds.length)
  source += tail
  const expectedStdout = purpose + ',result=observed,case=complete,kind=none\n'
  const failureStdout = purpose + ',result=unavailable,case=unknown,kind=unknown\n'
  const allowedStdout = Object.freeze([
    expectedStdout,
    failureStdout,
    ...caseMap.flatMap(({ id }) =>
      ['assertion', 'runtime'].map(
        (kind) => purpose + ',result=unavailable,case=' + id + ',kind=' + kind + '\n',
      ),
    ),
  ])
  for (const line of allowedStdout) {
    if (!/^[\x20-\x7e]+\n$/.test(line) || Buffer.byteLength(line, 'utf8') > 256) {
      return unavailable()
    }
  }
  if (!source || source.includes('\r') || source.includes('\0')) return unavailable()
  const argumentUtf16Units =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '.length +
    Buffer.from(source, 'utf16le').toString('base64').length
  return Object.freeze({
    purpose,
    source,
    nativeVerified: false,
    transport: 'interactive_ram_only',
    encodedCommandSupported: false,
    encodedCommandFits: argumentUtf16Units + 512 + 3 <= 32766,
    argumentUtf16Units,
    utf8Bytes: Buffer.byteLength(source, 'utf8'),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    baselineSha256: baseline.sha256,
    adapterOffset: baseline.adapterOffset,
    adapterUnits: adapter.source.length,
    adapterSha256: adapter.sha256,
    caseMap,
    expectedWires: baseline.expectedWires,
    expectedStdout,
    failureStdout,
    allowedStdout,
    maxStdoutUtf8Bytes: 256,
  })
}

// 只生成固定原包的解析／載入監督候選；import與生成均不執行PS或I/O。
export function createNativeProbePowerShellLoadOnlySupervisorArtifact() {
  if (arguments.length !== 0) return unavailable()
  const adapter = createNativeProbePowerShellTypeFixedAdapterArtifact()
  if (adapter.sha256 !== 'bfb93ed20519623ea1c2de54062156c71f48c47093cb77cd48ff046dae80ca7d') {
    return unavailable()
  }
  const packageRelativePath = String.raw`rdweb-receiver-download-20261024-01\unpacked-01\rdweb-test-receiver-v24.22.1-win-x64`
  const trustedSources = Object.freeze([
    Object.freeze({
      name: 'integrity.json',
      bytes: null,
      sha256: 'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
    }),
    Object.freeze({
      name: 'start-windows-test-receiver.ps1',
      bytes: 7455,
      sha256: 'd84c60ed6a70751f82e71ef7c53735a52d89e0d8a94c424779e9373359324c09',
    }),
    Object.freeze({
      name: 'windows-host-observer-supervisor.ps1',
      bytes: 9816,
      sha256: '51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2',
    }),
  ])
  const policySource = String.raw`
# 僅接受本候選固定的兩種完整政策狀態，不讀舊會話或修改其他scope。
function Assert-RdwebLoadPolicy([string]$Effective) {
  $names = @('MachinePolicy', 'UserPolicy', 'Process', 'CurrentUser', 'LocalMachine')
  $rows = @(Microsoft.PowerShell.Security\Get-ExecutionPolicy -List -ErrorAction Stop)
  if ($rows.Count -ne 5) { throw 'receiver_native_load_rejected' }
  $seen = @{}
  foreach ($row in $rows) {
    $name = [string]$row.Scope
    $want = 'Undefined'
    if ($name -ceq 'Process' -and $Effective -ceq 'RemoteSigned') { $want = 'RemoteSigned' }
    if ($names -cnotcontains $name -or $seen.ContainsKey($name) -or
        ([string]$row.ExecutionPolicy) -cne $want) { throw 'receiver_native_load_rejected' }
    $seen[$name] = $true
  }
  if (([string](Microsoft.PowerShell.Security\Get-ExecutionPolicy -ErrorAction Stop)) -cne $Effective) {
    throw 'receiver_native_load_rejected'
  }
}
`
  const opening = '& {\n'
  const childSource =
    opening +
    adapter.source +
    policySource +
    String.raw`
# child只確認自己的政策與身份物件；不宣告parent政策或自己已退出。
$ErrorActionPreference = 'Stop'
$loadDiagnostic = New-RdwebNativeDiagnostic
$loadStage = 'child_policy'; $loadReason = 'unknown'
$loadIdentity = $null; $loadResourceAttempted = $false; $loadClosed = $false
$loadChanged = $false; $loadRestored = $false; $loadLoaded = $false
try {
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or
      $PSVersionTable.PSEdition -cne 'Desktop' -or -not [Environment]::Is64BitProcess -or
      ([string]$ExecutionContext.SessionState.LanguageMode) -cne 'FullLanguage' -or
      ([string][Threading.Thread]::CurrentThread.GetApartmentState()) -cne 'STA') {
    Set-RdwebNativeFailure $loadDiagnostic 'child_policy' 'guard_rejected'
    throw 'receiver_native_load_rejected'
  }
  Assert-RdwebLoadPolicy 'Restricted'
  Start-RdwebNativeEvidence $loadDiagnostic 'resourcesClose'
  $loadResourceAttempted = $true
  $loadIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($loadIdentity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Set-RdwebNativeFailure $loadDiagnostic 'child_policy' 'guard_rejected'
    throw 'receiver_native_load_rejected'
  }
  Start-RdwebNativeEvidence $loadDiagnostic 'childPolicyRestore'
  $loadChanged = $true
  Microsoft.PowerShell.Security\Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
  Assert-RdwebLoadPolicy 'RemoteSigned'
  $loadStage = 'child_parse'; $loadReason = 'unknown'
  $loadPackage = Join-Path ([IO.Path]::GetTempPath()) ${psLiteral(packageRelativePath)}
  foreach ($name in @('start-windows-test-receiver.ps1', 'windows-host-observer-supervisor.ps1')) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $loadPackage $name), [ref]$tokens, [ref]$errors)
    if ($errors.Count -ne 0) {
      Set-RdwebNativeFailure $loadDiagnostic 'child_parse' 'parse_rejected'
      throw 'receiver_native_load_rejected'
    }
  }
  . (Join-Path $loadPackage 'start-windows-test-receiver.ps1')
  $loadLoaded = $true
}
catch { Set-RdwebNativeFailure $loadDiagnostic $loadStage $loadReason }
finally {
  if ($loadChanged) {
    try {
      Microsoft.PowerShell.Security\Set-ExecutionPolicy -Scope Process -ExecutionPolicy Undefined -Force -ErrorAction Stop
      Assert-RdwebLoadPolicy 'Restricted'
      $loadRestored = $true
    }
    catch { Set-RdwebNativeFailure $loadDiagnostic 'child_cleanup' 'cleanup_unconfirmed' }
    Confirm-RdwebNativeEvidence $loadDiagnostic 'childPolicyRestore' $loadRestored
  }
  else { Set-RdwebNativeNotAcquired $loadDiagnostic 'childPolicyRestore' }
  if ($loadResourceAttempted) {
    try {
      if ($null -eq $loadIdentity) { throw 'receiver_native_load_rejected' }
      $loadIdentity.Dispose(); $loadClosed = $true
    }
    catch { Set-RdwebNativeFailure $loadDiagnostic 'child_cleanup' 'cleanup_unconfirmed' }
    Confirm-RdwebNativeEvidence $loadDiagnostic 'resourcesClose' $loadClosed
  }
  else { Set-RdwebNativeNotAcquired $loadDiagnostic 'resourcesClose' }
}
try { [Console]::Write((Format-RdwebNativeDiagnostic (Complete-RdwebNativeDiagnostic $loadDiagnostic))) }
catch {
  [Console]::Write(${psLiteral(formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()).slice(0, -1))} + [char]10)
  exit 2
}
if ($loadLoaded -and $loadRestored -and $loadClosed) { exit 0 }
exit 2
}
`
  const commandPrefix =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  const childArguments = commandPrefix + Buffer.from(childSource, 'utf16le').toString('base64')
  const maxExecutableUtf16Units = 512
  const childCommandLineUtf16UnitsUpperBound = maxExecutableUtf16Units + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > 32766) return unavailable()
  const ready = {
    ...unknownNativeProbeDiagnostic(),
    childPolicyRestore: 'confirmed',
    resourcesClose: 'confirmed',
  }
  const expectedChildStdout = formatNativeProbeDiagnostic(ready)
  const all = { ...unknownNativeProbeDiagnostic(), phase: 'complete', reason: 'none' }
  for (const name of evidence) all[name] = 'confirmed'
  const expectedStdout = formatNativeProbeDiagnostic(all)
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'child_ready', wire: expectedChildStdout }),
    Object.freeze({
      label: 'child_parse_rejected',
      wire: formatNativeProbeDiagnostic({
        ...ready,
        phase: 'child_parse',
        reason: 'parse_rejected',
      }),
    }),
    Object.freeze({
      label: 'child_restore_unconfirmed',
      wire: formatNativeProbeDiagnostic({
        ...ready,
        phase: 'child_cleanup',
        reason: 'cleanup_unconfirmed',
        childPolicyRestore: 'unconfirmed',
      }),
    }),
  ])
  const invalidWireFixtures = Object.freeze(
    [
      ['missing', ''],
      ['truncated', expectedChildStdout.slice(0, -1)],
      ['duplicate', expectedChildStdout + expectedChildStdout],
      ['oversize', 'X'.repeat(1025)],
      ['wrong_type', expectedChildStdout.replace('"version":1', '"version":true')],
      ['extra_field', expectedChildStdout.replace('"version":1', '"extra":1,"version":1')],
      [
        'unknown_value',
        expectedChildStdout.replace('"phase":"unknown"', '"phase":"PUBLIC_UNKNOWN"'),
      ],
    ].map(([label, wire]) => Object.freeze({ label, wire })),
  )
  const childSha256 = createHash('sha256').update(childSource, 'utf8').digest('hex')
  let source =
    opening +
    adapter.source +
    policySource +
    String.raw`
# 只解碼自有child的一行UTF-8診斷，canonical重編碼同時拒絕重複JSON key。
function ConvertFrom-RdwebLoadFrame([string]$Line) {
  if ($null -eq $Line -or [Text.Encoding]::UTF8.GetByteCount($Line) -gt 1024) { throw 'receiver_native_load_rejected' }
  $wire = $Line
  if ($wire.EndsWith(([string][char]13 + [char]10), [StringComparison]::Ordinal)) {
    $wire = $wire.Substring(0, $wire.Length - 2) + [char]10
  }
  $schema = Get-RdwebNativeSchema
  if (-not $wire.StartsWith($schema.Prefix, [StringComparison]::Ordinal) -or
      -not $wire.EndsWith(([string][char]10), [StringComparison]::Ordinal)) { throw 'receiver_native_load_rejected' }
  $value = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject $wire.Substring($schema.Prefix.Length) -ErrorAction Stop
  if ($value -isnot [Management.Automation.PSCustomObject]) { throw 'receiver_native_load_rejected' }
  $properties = @($value.PSObject.Properties)
  if ($properties.Count -ne $schema.Fields.Count) { throw 'receiver_native_load_rejected' }
  $copy = @{}
  foreach ($property in $properties) {
    if ($property.MemberType -ne [Management.Automation.PSMemberTypes]::NoteProperty -or
        $schema.Fields -cnotcontains $property.Name -or $copy.ContainsKey($property.Name)) {
      throw 'receiver_native_load_rejected'
    }
    $copy.Add($property.Name, $property.Value)
  }
  if ((Format-RdwebNativeDiagnostic $copy) -cne $wire) { throw 'receiver_native_load_rejected' }
  return ,$copy
}
# 固定本機普通路徑與祖先檢查，不讀舊NTFS root、不修ACL或跟隨reparse。
function Assert-RdwebLoadPath([string]$Path, [bool]$Directory) {
  $full = [IO.Path]::GetFullPath($Path)
  if ($full -notmatch '^[A-Za-z]:\\' -or $full.Length -gt 240) { throw 'receiver_native_load_rejected' }
  $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))
  if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') { throw 'receiver_native_load_rejected' }
  $item = Microsoft.PowerShell.Management\Get-Item -LiteralPath $full -Force -ErrorAction Stop
  if (($Directory -and $item -isnot [IO.DirectoryInfo]) -or
      (-not $Directory -and $item -isnot [IO.FileInfo])) { throw 'receiver_native_load_rejected' }
  $cursor = $item
  while ($null -ne $cursor) {
    if (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'receiver_native_load_rejected' }
    if ($cursor -is [IO.FileInfo]) { $cursor = $cursor.Directory }
    else { $cursor = $cursor.Parent }
  }
  return $item
}
# child literal逐字保留原來源尾LF；生成器本身不會解析或執行它。
$loadChildSource = @'
`
  const childSourceOffset = source.length
  source +=
    childSource +
    String.raw`
'@
$ErrorActionPreference = 'Stop'
$loadDiagnostic = New-RdwebNativeDiagnostic
$loadStage = 'parent_preflight'; $loadReason = 'unknown'
$loadMayRun = $false; $loadStarted = $false; $loadExited = $false; $loadKilled = $false
$loadProcess = $null; $loadHandle = $null; $loadIdentity = $null; $loadWatch = $null
$loadHandles = [Collections.Generic.List[IO.FileStream]]::new()
$loadOutTask = $null; $loadErrTask = $null; $loadChildClosed = $false; $loadResourceFault = $false
$loadOut = [byte[]]::new(1025); $loadErr = [byte[]]::new(129)
$loadOutCount = 0; $loadErrCount = 0; $loadOutEnd = $false; $loadErrEnd = $false
try {
  $used = @(Microsoft.PowerShell.Utility\Get-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once -Scope Global -ErrorAction Ignore)
  if ($used.Count -ne 0) { throw 'receiver_native_load_rejected' }
  Microsoft.PowerShell.Utility\New-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once -Scope Global -Value $true -ErrorAction Stop
  $loadMayRun = $true
  Start-RdwebNativeEvidence $loadDiagnostic 'parentPolicyVerify'
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or
      $PSVersionTable.PSEdition -cne 'Desktop' -or -not [Environment]::Is64BitProcess -or
      $Host.Name -cne 'ConsoleHost' -or [Console]::IsInputRedirected -or [Console]::IsOutputRedirected -or
      ([string]$ExecutionContext.SessionState.LanguageMode) -cne 'FullLanguage' -or
      ([string][Threading.Thread]::CurrentThread.GetApartmentState()) -cne 'STA') { throw 'receiver_native_load_rejected' }
  Assert-RdwebLoadPolicy 'Restricted'
  Start-RdwebNativeEvidence $loadDiagnostic 'resourcesClose'
  $loadResourceFault = $true
  $loadIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $loadResourceFault = $false
  $principal = [Security.Principal.WindowsPrincipal]::new($loadIdentity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'receiver_native_load_rejected' }
  $loadPackage = Join-Path ([IO.Path]::GetTempPath()) ${psLiteral(packageRelativePath)}
  [void](Assert-RdwebLoadPath $loadPackage $true)
  $loadStage = 'source_pin'
  $loadSources = @(
${trustedSources.map((item) => `    @{ Name = ${psLiteral(item.name)}; Bytes = ${item.bytes ?? -1}; Pin = ${psLiteral(item.sha256)} }`).join(',\n')}
  )
  foreach ($sourceItem in $loadSources) {
    if ($sourceItem.Name -ceq 'windows-host-observer-supervisor.ps1') { $loadStage = 'supervisor_pin' }
    $path = Join-Path $loadPackage $sourceItem.Name
    [void](Assert-RdwebLoadPath $path $false)
    try {
      $stream = [IO.FileStream]::new($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
      $loadHandles.Add($stream)
    }
    catch { $loadResourceFault = $true; throw 'receiver_native_load_rejected' }
    if ($stream.Length -lt 1 -or $stream.Length -gt 1048576 -or
        ($sourceItem.Bytes -ge 0 -and $stream.Length -ne $sourceItem.Bytes)) {
      Set-RdwebNativeFailure $loadDiagnostic $loadStage 'source_mismatch'
      throw 'receiver_native_load_rejected'
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $pin = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally {
      try { $sha.Dispose() }
      catch { $loadResourceFault = $true; throw 'receiver_native_load_rejected' }
    }
    if ($pin -cne $sourceItem.Pin) {
      Set-RdwebNativeFailure $loadDiagnostic $loadStage 'source_mismatch'
      throw 'receiver_native_load_rejected'
    }
  }
  $loadStage = 'source_pin'
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $pin = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($loadChildSource))).Replace('-', '').ToLowerInvariant() }
  finally {
    try { $sha.Dispose() }
    catch { $loadResourceFault = $true; throw 'receiver_native_load_rejected' }
  }
  if ($pin -cne ${psLiteral(childSha256)}) {
    Set-RdwebNativeFailure $loadDiagnostic 'source_pin' 'source_mismatch'
    throw 'receiver_native_load_rejected'
  }
  $exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  [void](Assert-RdwebLoadPath $exe $false)
  $arguments = ${psLiteral(commandPrefix)} + [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loadChildSource))
  if ($exe.Length -gt 512 -or $exe.Length + 3 + $arguments.Length -gt 32766) { throw 'receiver_native_load_rejected' }
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $exe; $info.Arguments = $arguments
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  $loadProcess = [Diagnostics.Process]::new(); $loadProcess.StartInfo = $info
  $loadStage = 'child_start'; $loadReason = 'io_failed'
  Start-RdwebNativeEvidence $loadDiagnostic 'childStart'
  Start-RdwebNativeEvidence $loadDiagnostic 'childExit'
  Start-RdwebNativeEvidence $loadDiagnostic 'childPolicyRestore'
  $loadWatch = [Diagnostics.Stopwatch]::StartNew()
  if (-not $loadProcess.Start()) { throw 'receiver_native_load_rejected' }
  $loadStarted = $true; $loadHandle = $loadProcess.Handle
  Confirm-RdwebNativeEvidence $loadDiagnostic 'childStart' $true
  $loadOutTask = $loadProcess.StandardOutput.BaseStream.ReadAsync($loadOut, 0, 1025)
  $loadErrTask = $loadProcess.StandardError.BaseStream.ReadAsync($loadErr, 0, 129)
  $loadStage = 'unknown'; $loadReason = 'io_failed'
  while (-not ($loadOutEnd -and $loadErrEnd -and $loadProcess.HasExited)) {
    $left = 18000 - [int]$loadWatch.ElapsedMilliseconds
    if ($left -le 0) {
      Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'deadline'
      throw 'receiver_native_load_rejected'
    }
    if (-not $loadOutEnd -and $loadOutTask.IsCompleted) {
      $read = $loadOutTask.Result; $loadOutCount += $read
      if ($loadOutCount -gt 1024) {
        Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'unexpected_output'
        throw 'receiver_native_load_rejected'
      }
      if ($read -eq 0) { $loadOutEnd = $true }
      else { $loadOutTask = $loadProcess.StandardOutput.BaseStream.ReadAsync($loadOut, $loadOutCount, 1025 - $loadOutCount) }
    }
    if (-not $loadErrEnd -and $loadErrTask.IsCompleted) {
      $read = $loadErrTask.Result; $loadErrCount += $read
      if ($loadErrCount -ne 0) {
        Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'unexpected_output'
        throw 'receiver_native_load_rejected'
      }
      if ($read -eq 0) { $loadErrEnd = $true }
    }
    [void]$loadProcess.WaitForExit([Math]::Min(20, $left))
  }
  if ($loadWatch.ElapsedMilliseconds -ge 18000) {
    Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'deadline'
    throw 'receiver_native_load_rejected'
  }
  $loadExited = $true
  $loadStage = 'child_parse'; $loadReason = 'unexpected_output'
  $frame = ([Text.UTF8Encoding]::new($false, $true)).GetString($loadOut, 0, $loadOutCount)
  $child = ConvertFrom-RdwebLoadFrame $frame
  if ($child['childStart'] -cne 'unknown' -or $child['childExit'] -cne 'unknown' -or
      $child['parentPolicyVerify'] -cne 'unknown') { throw 'receiver_native_load_rejected' }
  if (@('unknown', 'child_policy', 'child_parse', 'child_cleanup') -cnotcontains $child['phase']) {
    throw 'receiver_native_load_rejected'
  }
  if ($child['phase'] -cne 'unknown' -or $child['reason'] -cne 'unknown') {
    Set-RdwebNativeFailure $loadDiagnostic $child['phase'] $child['reason']
  }
  Confirm-RdwebNativeEvidence $loadDiagnostic 'childPolicyRestore' ($child['childPolicyRestore'] -ceq 'confirmed')
  $loadChildClosed = $child['resourcesClose'] -ceq 'confirmed'
  Confirm-RdwebNativeEvidence $loadDiagnostic 'childExit' ($loadProcess.ExitCode -eq 0)
  if ($frame.Replace(([string][char]13 + [char]10), ([string][char]10)) -cne ${psLiteral(expectedChildStdout.slice(0, -1))} + [char]10 -or
      $loadProcess.ExitCode -ne 0) {
    Set-RdwebNativeFailure $loadDiagnostic 'child_cleanup' 'cleanup_unconfirmed'
  }
}
catch { Set-RdwebNativeFailure $loadDiagnostic $loadStage $loadReason }
finally {
  $closed = -not $loadResourceFault
  $loadCleanupEnd = 0
  if ($null -ne $loadWatch) {
    # 全部收尾等待共用一個絕對截止點，不逐項再給兩秒。
    $loadCleanupEnd = [Math]::Min(20000, [int]$loadWatch.ElapsedMilliseconds + 2000)
  }
  if ($null -ne $loadProcess) {
    if ($loadStarted) {
      try {
        if ($null -eq $loadHandle -or $loadProcess.Handle -ne $loadHandle) { throw 'receiver_native_load_rejected' }
        if (-not $loadProcess.HasExited) {
          $loadKilled = $true; $loadProcess.Kill()
        }
        $left = [Math]::Max(0, $loadCleanupEnd - [int]$loadWatch.ElapsedMilliseconds)
        if ($loadProcess.HasExited) { $loadExited = $true }
        elseif ($left -gt 0) { $loadExited = $loadProcess.WaitForExit($left) }
        if (-not $loadExited) {
          Set-RdwebNativeFailure $loadDiagnostic 'parent_cleanup' 'deadline'
          throw 'receiver_native_load_rejected'
        }
      }
      catch { $closed = $false; Set-RdwebNativeFailure $loadDiagnostic 'parent_cleanup' 'cleanup_unconfirmed' }
      foreach ($name in @('StandardOutput', 'StandardError')) {
        try { $loadProcess.$name.Dispose() }
        catch { $closed = $false }
      }
      foreach ($pending in @($loadOutTask, $loadErrTask)) {
        if ($null -ne $pending) {
          try {
            $left = [Math]::Max(0, $loadCleanupEnd - [int]$loadWatch.ElapsedMilliseconds)
            if (-not $pending.IsCompleted -and ($left -le 0 -or -not $pending.Wait($left))) { $closed = $false }
            if ($pending.IsFaulted -or $pending.IsCanceled) { $closed = $false }
          }
          catch { $closed = $false }
        }
      }
    }
    try { $loadProcess.Dispose() } catch { $closed = $false }
  }
  foreach ($stream in $loadHandles) {
    try { $stream.Dispose() } catch { $closed = $false }
  }
  if ($null -ne $loadIdentity) {
    try { $loadIdentity.Dispose() } catch { $closed = $false }
  }
  if ($loadStarted -and (-not $loadExited -or $loadKilled)) {
    Confirm-RdwebNativeEvidence $loadDiagnostic 'childExit' $false
    Confirm-RdwebNativeEvidence $loadDiagnostic 'childPolicyRestore' $false
  }
  if (-not $loadDiagnostic.Attempted.ContainsKey('childStart')) {
    foreach ($name in @('childStart', 'childExit', 'childPolicyRestore')) { Set-RdwebNativeNotAcquired $loadDiagnostic $name }
  }
  if ($loadMayRun) {
    $loadParentPolicy = $false
    try { Assert-RdwebLoadPolicy 'Restricted'; $loadParentPolicy = $true }
    catch { Set-RdwebNativeFailure $loadDiagnostic 'parent_cleanup' 'cleanup_unconfirmed' }
    Confirm-RdwebNativeEvidence $loadDiagnostic 'parentPolicyVerify' $loadParentPolicy
  }
  if ($null -ne $loadWatch) {
    if ($loadWatch.ElapsedMilliseconds -ge 20000 -or $loadWatch.ElapsedMilliseconds -ge $loadCleanupEnd) {
      $closed = $false; Set-RdwebNativeFailure $loadDiagnostic 'parent_cleanup' 'deadline'
    }
    $loadWatch.Stop()
  }
  if ($loadDiagnostic.Attempted.ContainsKey('resourcesClose')) {
    if ($loadDiagnostic.Attempted.ContainsKey('childStart') -and -not $loadExited) { $closed = $false }
    if ($loadStarted -and -not $loadChildClosed) { $closed = $false }
    Confirm-RdwebNativeEvidence $loadDiagnostic 'resourcesClose' $closed
    if (-not $closed) { Set-RdwebNativeFailure $loadDiagnostic 'parent_cleanup' 'cleanup_unconfirmed' }
  }
  else { Set-RdwebNativeNotAcquired $loadDiagnostic 'resourcesClose' }
  [Array]::Clear($loadOut, 0, $loadOut.Length); [Array]::Clear($loadErr, 0, $loadErr.Length)
}
try { [Console]::Write((Format-RdwebNativeDiagnostic (Complete-RdwebNativeDiagnostic $loadDiagnostic))) }
catch { [Console]::Write(${psLiteral(formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()).slice(0, -1))} + [char]10) }
}
`
  if (source.includes('\r') || source.includes('\0') || childSource.includes("\n'@"))
    return unavailable()
  return Object.freeze({
    purpose: 'receiver_native_load_only_supervisor_v1',
    source,
    childSource,
    nativeVerified: false,
    transport: 'interactive_ram_only',
    encodedCommandSupported: false,
    utf8Bytes: Buffer.byteLength(source, 'utf8'),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    childUtf8Bytes: Buffer.byteLength(childSource, 'utf8'),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    maxExecutableUtf16Units,
    commandLineLimit: 32766,
    childCommandLineUtf16UnitsUpperBound,
    childExecutableRelativePath: String.raw`System32\WindowsPowerShell\v1.0\powershell.exe`,
    adapterOffset: opening.length,
    childAdapterOffset: opening.length,
    adapterUnits: adapter.source.length,
    adapterSha256: adapter.sha256,
    childSourceOffset,
    packageRelativePath,
    trustedSources,
    childEvidenceNames: Object.freeze(['childPolicyRestore', 'resourcesClose']),
    parentEvidenceNames: Object.freeze(['childStart', 'childExit', 'parentPolicyVerify']),
    stdoutMaxBytes: 1024,
    stderrMaxBytes: 128,
    totalBudgetMs: 20000,
    normalBudgetMs: 18000,
    cleanupBudgetMs: 2000,
    expectedStdout,
    expectedChildStdout,
    wireFixtures,
    invalidWireFixtures,
  })
}

// 只在新parent加入固定輸出拒絕分支標記，保留原child與全部守衛，不執行PS或I/O。
export function createNativeProbePowerShellLoadOnlyOutputProbeArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellLoadOnlySupervisorArtifact()
  const baselineSha256 = 'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e'
  if (
    createHash('sha256').update(baseline.source, 'utf8').digest('hex') !== baselineSha256 ||
    createHash('sha256').update(baseline.childSource, 'utf8').digest('hex') !==
      '21f0c3563ae7469fc0f842d63f00bb5fd8d9c747787f4bb131c22c4d53b3394e'
  ) {
    return unavailable()
  }
  const onceFlag = 'RdwebReceiverLoadOnlyOutputProbe20261025Once'
  // PS5.1以-EncodedCommand啟動且stderr被重導時，模組首次載入的progress記錄會寫入stderr；
  // 固定preamble必須在child第一個cmdlet前執行，才不會被parent的stderr守衛誤判。
  const progressPreamble = "$ProgressPreference = 'SilentlyContinue'; "
  const branchNames = Object.freeze(['not_observed', 'stdout_limit', 'stderr_nonempty'])
  const outputPrefix = 'receiver_native_load_only_output_v1,firstBranch='
  const allowedBranchStdout = Object.freeze(branchNames.map((name) => outputPrefix + name + '\n'))
  for (const line of allowedBranchStdout) {
    if (!/^[\x20-\x7e]+\n$/.test(line) || Buffer.byteLength(line, 'utf8') > 128)
      return unavailable()
  }
  const emitter =
    '# 僅回固定首觀察分支；未知值拒絕，不輸出管線內容或補成功。\n' +
    'switch -CaseSensitive ($loadOutputBranch) {\n' +
    branchNames
      .map(
        (name, index) =>
          '  ' +
          psLiteral(name) +
          ' { [Console]::Write(' +
          psLiteral(allowedBranchStdout[index].slice(0, -1)) +
          ' + [char]10); break }\n',
      )
      .join('') +
    "  default { throw 'receiver_native_diagnostic_unavailable' }\n}\n"
  const canonicalTail =
    'catch { [Console]::Write(' +
    psLiteral(formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()).slice(0, -1)) +
    ' + [char]10) }\n'
  const stage = "$loadStage = 'parent_preflight'; $loadReason = 'unknown'\n"
  const stdoutGuard = '      if ($loadOutCount -gt 1024) {\n'
  const stderrGuard = '      if ($loadErrCount -ne 0) {\n'
  const changes = [
    [stage, "$loadOutputBranch = 'not_observed'\n" + stage],
    [
      stdoutGuard,
      stdoutGuard +
        "        if ($loadOutputBranch -ceq 'not_observed') { $loadOutputBranch = 'stdout_limit' }\n",
    ],
    [
      stderrGuard,
      stderrGuard +
        "        if ($loadOutputBranch -ceq 'not_observed') { $loadOutputBranch = 'stderr_nonempty' }\n",
    ],
    [
      'Get-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'Get-Variable -Name ' + onceFlag,
    ],
    [
      'New-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'New-Variable -Name ' + onceFlag,
    ],
    [
      '[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loadChildSource))',
      "[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('$ProgressPreference = ''SilentlyContinue''; ' + $loadChildSource))",
    ],
    [canonicalTail, canonicalTail + emitter],
  ]
  let source = baseline.source
  for (const [original, replacement] of changes) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  const adapter = createNativeProbePowerShellTypeFixedAdapterArtifact()
  const adapterOffset = source.indexOf(adapter.source)
  if (adapterOffset < 0) return unavailable()
  // metadata必須反映實際送出的命令列，不能沿用未加preamble的baseline長度。
  const childBase64 = Buffer.from(baseline.childSource, 'utf16le').toString('base64')
  if (!baseline.childArguments.endsWith(childBase64)) return unavailable()
  const launchBase64 = Buffer.from(progressPreamble + baseline.childSource, 'utf16le').toString(
    'base64',
  )
  const childArguments =
    baseline.childArguments.slice(0, baseline.childArguments.length - childBase64.length) +
    launchBase64
  const childCommandLineUtf16UnitsUpperBound =
    baseline.maxExecutableUtf16Units + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > baseline.commandLineLimit) return unavailable()
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_load_only_output_probe_v1',
    source,
    utf8Bytes: Buffer.byteLength(source, 'utf8'),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    baselineSha256,
    adapterOffset,
    childSourceOffset: uniqueSourceOffset(source, baseline.childSource),
    childAdapterOffset: uniqueSourceOffset(baseline.childSource, adapter.source),
    onceFlag,
    progressPreamble,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    branchNames,
    outputPrefix,
    allowedBranchStdout,
    branchStdoutMaxBytes: 128,
    expectedDiagnosticStdout: baseline.expectedStdout,
    expectedStdout: baseline.expectedStdout + allowedBranchStdout[0],
  })
}

// 交付只搬運既有parent：第一段純RAM驗雜湊，第二段才呼叫一次，兩段皆不新增原生副作用。
export function createNativeProbePowerShellHandoffArtifact() {
  if (arguments.length !== 0) return unavailable()
  const parent = createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  const separator = "\n'@\n"
  const split = parent.source.indexOf(separator)
  if (split < 0 || parent.source.indexOf(separator, split + 1) !== -1) return unavailable()
  const partA = parent.source.slice(0, split)
  const partB = parent.source.slice(split + separator.length)
  if (!partA.endsWith('\n') || !partB.endsWith('\n')) return unavailable()
  if (partA.includes("\n'@\n") || partB.includes("\n'@\n")) return unavailable()
  if (partA.includes('\r') || partB.includes('\r')) return unavailable()

  const payloadVariable = 'RdwebReceiverLoadOnlyOutputProbe20261025Payload'
  const integrityPrefix = 'rdweb_handoff_integrity_v2,'
  const integrityErrorLine = integrityPrefix + 'status=error'
  const integrityLine =
    integrityPrefix +
    'status=ok,bytes=' +
    parent.utf8Bytes +
    ',units=' +
    parent.utf16Units +
    ',sha256=' +
    parent.sha256
  const unavailableLine =
    'receiver_windows_load_only_output_unavailable,terminalUse=stop,receiverStarted=False'
  const returnedLine = 'receiver_windows_load_only_output_returned,receiverStarted=False'

  const stage1Source = `# rdweb 交接 v2 第一段：只把既有 parent 放進本 session 並回報固定雜湊行。
# 本段不呼叫 parent、不建立 once 旗標、不改政策、不啟程序、不讀寫檔案。
# 只有這行是 ok 才繼續；任何 error 都先停手回報，是否同視窗重貼由代理判斷。
& {
$rdwebHandoffPartA = @'
${partA}
'@

$rdwebHandoffPartB = @'
${partB}
'@

$rdwebHandoffLf = [string][char]10
$rdwebHandoffStatus = 'error'
try {
  # 貼上可能把 LF 轉成 CRLF；只做這個無損正規化，bare CR 仍拒絕。
  $rdwebHandoffA = $rdwebHandoffPartA.Replace(([string][char]13 + [string][char]10), $rdwebHandoffLf)
  $rdwebHandoffB = $rdwebHandoffPartB.Replace(([string][char]13 + [string][char]10), $rdwebHandoffLf)
  $rdwebHandoffPayload = $rdwebHandoffA + $rdwebHandoffLf + "'@" + $rdwebHandoffLf + $rdwebHandoffB
  $rdwebHandoffSha = [Security.Cryptography.SHA256]::Create()
  try {
    $rdwebHandoffHash = ([BitConverter]::ToString($rdwebHandoffSha.ComputeHash([Text.Encoding]::UTF8.GetBytes($rdwebHandoffPayload)))).Replace('-', '').ToLowerInvariant()
  }
  finally { $rdwebHandoffSha.Dispose() }
  if ($rdwebHandoffPayload.IndexOf([char]13) -lt 0 -and
      $rdwebHandoffPayload.IndexOf([char]0) -lt 0 -and
      $rdwebHandoffPayload.EndsWith($rdwebHandoffLf) -and
      [Text.Encoding]::UTF8.GetByteCount($rdwebHandoffPayload) -eq ${parent.utf8Bytes} -and
      $rdwebHandoffPayload.Length -eq ${parent.utf16Units} -and
      $rdwebHandoffHash -ceq ${psLiteral(parent.sha256)}) {
    Set-Variable -Name ${payloadVariable} -Scope Global -Value $rdwebHandoffPayload
    $rdwebHandoffStatus = 'ok'
  }
}
catch { $rdwebHandoffStatus = 'error' }
if ($rdwebHandoffStatus -ceq 'ok') { [Console]::Write(${psLiteral(integrityLine)} + [char]10) }
else {
  # 失敗時不留下任何payload，第二段只能因缺變數而拒絕。
  Remove-Variable -Name ${payloadVariable} -Scope Global -ErrorAction SilentlyContinue
  [Console]::Write(${psLiteral(integrityErrorLine)} + [char]10)
}
}
`

  const stage2Source = `# rdweb 交接 v2 第二段：只重驗第一段留在本 session 的 payload，相符才呼叫 parent 一次。
# 不重新貼上內容、不建檔、不改政策；任何不符或例外都只回固定 unavailable。
& {
$ErrorActionPreference = 'Stop'
$rdwebHandoffLf = [string][char]10
try {
  $rdwebHandoffValue = Get-Variable -Name ${payloadVariable} -Scope Global -ErrorAction SilentlyContinue
  if ($null -eq $rdwebHandoffValue) { throw 'receiver_native_handoff_rejected' }
  $rdwebHandoffText = [string]$rdwebHandoffValue.Value
  $rdwebHandoffSha = [Security.Cryptography.SHA256]::Create()
  try {
    $rdwebHandoffHash = ([BitConverter]::ToString($rdwebHandoffSha.ComputeHash([Text.Encoding]::UTF8.GetBytes($rdwebHandoffText)))).Replace('-', '').ToLowerInvariant()
  }
  finally { $rdwebHandoffSha.Dispose() }
  if ($rdwebHandoffText.IndexOf([char]13) -ge 0 -or
      $rdwebHandoffText.IndexOf([char]0) -ge 0 -or
      -not $rdwebHandoffText.EndsWith($rdwebHandoffLf) -or
      [Text.Encoding]::UTF8.GetByteCount($rdwebHandoffText) -ne ${parent.utf8Bytes} -or
      $rdwebHandoffText.Length -ne ${parent.utf16Units} -or
      $rdwebHandoffHash -cne ${psLiteral(parent.sha256)}) { throw 'receiver_native_handoff_rejected' }
  [void]([ScriptBlock]::Create($rdwebHandoffText).Invoke())
  [Console]::Write(${psLiteral(returnedLine)} + [char]10)
}
catch { [Console]::Write(${psLiteral(unavailableLine)} + [char]10) }
}
`

  for (const source of [stage1Source, stage2Source]) {
    if (source.includes('\r') || source.includes('\0') || !source.endsWith('\n'))
      return unavailable()
  }
  return Object.freeze({
    purpose: 'receiver_native_load_only_output_handoff_v2',
    nativeVerified: false,
    transport: 'interactive_ram_only',
    encodedCommandSupported: false,
    parentUtf8Bytes: parent.utf8Bytes,
    parentUtf16Units: parent.utf16Units,
    parentSha256: parent.sha256,
    separator,
    partAUtf8Bytes: Buffer.byteLength(partA, 'utf8'),
    partAUtf16Units: partA.length,
    partASha256: createHash('sha256').update(partA, 'utf8').digest('hex'),
    partBUtf8Bytes: Buffer.byteLength(partB, 'utf8'),
    partBUtf16Units: partB.length,
    partBSha256: createHash('sha256').update(partB, 'utf8').digest('hex'),
    payloadVariable,
    integrityPrefix,
    integrityLine,
    integrityErrorLine,
    unavailableLine,
    returnedLine,
    stage1Source,
    stage1Utf8Bytes: Buffer.byteLength(stage1Source, 'utf8'),
    stage1Utf16Units: stage1Source.length,
    stage1Sha256: createHash('sha256').update(stage1Source, 'utf8').digest('hex'),
    stage2Source,
    stage2Utf8Bytes: Buffer.byteLength(stage2Source, 'utf8'),
    stage2Utf16Units: stage2Source.length,
    stage2Sha256: createHash('sha256').update(stage2Source, 'utf8').digest('hex'),
  })
}

// 只驗NTFS private-path guard的正負向；parent只啟動一個自有child，不自行載入檔案。
// child僅改自己的Process政策並還原，dot-source真入口；不建檔案、不複製、不建junction、不刪除。
export function createNativeProbePowerShellNtfsGuardArtifact() {
  if (arguments.length !== 0) return unavailable()
  const purpose = 'receiver_windows_ntfs_guard_v1'
  const rootName = 'rdweb receiver NTFS guard 公開 20261025-02'
  const packageRoot =
    'rdweb-receiver-download-20261024-01\\unpacked-01\\rdweb-test-receiver-v24.22.1-win-x64'
  const entryBytes = 7455
  const entrySha256 = 'd84c60ed6a70751f82e71ef7c53735a52d89e0d8a94c424779e9373359324c09'
  const supervisorBytes = 9816
  const supervisorSha256 = '51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2'
  const successLine =
    'receiver_windows_ntfs_guard_observed,positive=accepted,negative=rejected,package=accepted,policyBaseline=confirmed,receiverStarted=False,resourcesClosed=True,artifactsRetained=True\n'
  const unavailablePrefix = 'receiver_windows_ntfs_guard_unavailable,stage='
  const stages = Object.freeze([
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
  ])
  const source = String.raw`# 只驗NTFS private-path guard的正負向；不建檔案、不複製、不建junction、不刪除。
# 本child只改自己的Process政策並還原；不啟Node／receiver，不改父視窗政策。
& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = $DebugPreference = $WarningPreference = $InformationPreference = 'SilentlyContinue'
$rdwebGuardStage = 'preflight'
$rdwebGuardFailure = $null
$rdwebGuardPolicyChanged = $false
$rdwebGuardOwner = $null
$rdwebGuardIdentity = $null
$rdwebGuardSuccess = $false

# 只接受五scope的指定Process值與effective值；未知即拒絕。
function Assert-RdwebGuardPolicy([string]$ProcessPolicy, [string]$EffectivePolicy) {
  foreach ($rdwebGuardScope in @('Process','CurrentUser','LocalMachine','UserPolicy','MachinePolicy')) {
    $rdwebGuardWant = 'Undefined'
    if ($rdwebGuardScope -ceq 'Process') { $rdwebGuardWant = $ProcessPolicy }
    if ((Get-ExecutionPolicy -Scope $rdwebGuardScope) -ne $rdwebGuardWant) { throw 'receiver_windows_ntfs_guard_unavailable' }
  }
  if ((Get-ExecutionPolicy) -ne $EffectivePolicy) { throw 'receiver_windows_ntfs_guard_unavailable' }
}

try {
  # 先驗本次child的固定前置，不符即停止。
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or
      $PSVersionTable.PSEdition -cne 'Desktop' -or
      -not [Environment]::Is64BitProcess -or
      $Host.Name -cne 'ConsoleHost' -or
      ([string]$ExecutionContext.SessionState.LanguageMode) -cne 'FullLanguage' -or
      ([string][Threading.Thread]::CurrentThread.GetApartmentState()) -cne 'STA') { throw 'receiver_windows_ntfs_guard_unavailable' }
  $rdwebGuardIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $rdwebGuardOwner = $rdwebGuardIdentity.User
  $rdwebGuardPrincipal = New-Object Security.Principal.WindowsPrincipal -ArgumentList $rdwebGuardIdentity
  if ($rdwebGuardPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'receiver_windows_ntfs_guard_unavailable' }
  Assert-RdwebGuardPolicy 'Undefined' 'Restricted'

  # 僅將自己的Process改RemoteSigned，讓真入口與supervisor可載入；父視窗不變。
  $rdwebGuardStage = 'policy_baseline'
  $rdwebGuardPolicyChanged = $true
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
  Assert-RdwebGuardPolicy 'RemoteSigned' 'RemoteSigned'

  # 固定原包位置；先驗存在與來源pin，再載入真入口。
  $rdwebGuardStage = 'package_missing'
  $rdwebGuardPackage = Join-Path $env:TEMP '${packageRoot}'
  $rdwebGuardEntry = Join-Path $rdwebGuardPackage 'portable\start-windows-test-receiver.ps1'
  if (-not [IO.File]::Exists($rdwebGuardEntry)) {
    $rdwebGuardEntry = Join-Path $rdwebGuardPackage 'start-windows-test-receiver.ps1'
  }
  if (-not [IO.File]::Exists($rdwebGuardEntry)) { throw 'receiver_windows_ntfs_guard_unavailable' }
  $rdwebGuardSupervisor = Join-Path (Split-Path -Parent $rdwebGuardEntry) 'windows-host-observer-supervisor.ps1'
  if (-not [IO.File]::Exists($rdwebGuardSupervisor)) { throw 'receiver_windows_ntfs_guard_unavailable' }

  $rdwebGuardStage = 'package_guard'
  $rdwebGuardEntryItem = Get-Item -LiteralPath $rdwebGuardEntry -Force -ErrorAction Stop
  $rdwebGuardSupervisorItem = Get-Item -LiteralPath $rdwebGuardSupervisor -Force -ErrorAction Stop
  foreach ($rdwebGuardItem in @($rdwebGuardEntryItem, $rdwebGuardSupervisorItem)) {
    if ($rdwebGuardItem.PSIsContainer -or
        ($rdwebGuardItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $rdwebGuardItem.Length -lt 1) { throw 'receiver_windows_ntfs_guard_unavailable' }
  }
  $rdwebGuardEntryHash = (Get-FileHash -LiteralPath $rdwebGuardEntry -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
  $rdwebGuardSupervisorHash = (Get-FileHash -LiteralPath $rdwebGuardSupervisor -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
  if ($rdwebGuardEntryItem.Length -ne ${entryBytes} -or
      $rdwebGuardSupervisorItem.Length -ne ${supervisorBytes} -or
      $rdwebGuardEntryHash -cne '${entrySha256}' -or
      $rdwebGuardSupervisorHash -cne '${supervisorSha256}') { throw 'receiver_windows_ntfs_guard_unavailable' }
  . $rdwebGuardEntry
  [void](Assert-LocalNtfsPath $rdwebGuardPackage)
  [void](Assert-RegularFile $rdwebGuardEntry)
  [void](Assert-RegularFile $rdwebGuardSupervisor)

  # 新root與兩個空目錄；已存在即停止，不重用或刪除。
  $rdwebGuardStage = 'root_create'
  $rdwebGuardRoot = Join-Path $env:TEMP '${rootName}'
  if ([IO.Directory]::Exists($rdwebGuardRoot) -or [IO.File]::Exists($rdwebGuardRoot)) {
    $rdwebGuardStage = 'root_exists'
    throw 'receiver_windows_ntfs_guard_unavailable'
  }
  [void][IO.Directory]::CreateDirectory($rdwebGuardRoot)
  $rdwebGuardPositive = Join-Path $rdwebGuardRoot 'positive'
  $rdwebGuardNegative = Join-Path $rdwebGuardRoot 'negative'
  $rdwebGuardStage = 'positive_create'
  New-OwnerOnlyDirectory $rdwebGuardPositive $rdwebGuardOwner
  $rdwebGuardPositiveAcl = Get-Acl -LiteralPath $rdwebGuardPositive
  if ($rdwebGuardPositiveAcl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $rdwebGuardOwner -or
      -not $rdwebGuardPositiveAcl.AreAccessRulesProtected) { throw 'receiver_windows_ntfs_guard_unavailable' }
  foreach ($rdwebGuardRule in $rdwebGuardPositiveAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($rdwebGuardRule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        $rdwebGuardRule.IdentityReference -ne $rdwebGuardOwner) { throw 'receiver_windows_ntfs_guard_unavailable' }
  }

  $rdwebGuardStage = 'negative_create'
  New-OwnerOnlyDirectory $rdwebGuardNegative $rdwebGuardOwner
  $rdwebGuardNegativeItem = Get-Item -LiteralPath $rdwebGuardNegative -Force -ErrorAction Stop
  $rdwebGuardGroupBefore = (Get-Acl -LiteralPath $rdwebGuardNegative).GetGroup([Security.Principal.SecurityIdentifier])
  $rdwebGuardNegativeAcl = $rdwebGuardNegativeItem.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
  if ($null -ne $rdwebGuardNegativeAcl.GetOwner([Security.Principal.SecurityIdentifier]) -or
      $null -ne $rdwebGuardNegativeAcl.GetGroup([Security.Principal.SecurityIdentifier]) -or
      $rdwebGuardNegativeAcl.GetAuditRules($true,$true,[Security.Principal.SecurityIdentifier]).Count -ne 0 -or
      -not $rdwebGuardNegativeAcl.AreAccessRulesProtected) { throw 'receiver_windows_ntfs_guard_unavailable' }
  $rdwebGuardUsers = New-Object Security.Principal.SecurityIdentifier -ArgumentList 'S-1-5-32-545'
  $rdwebGuardRule = New-Object Security.AccessControl.FileSystemAccessRule -ArgumentList $rdwebGuardUsers, ([Security.AccessControl.FileSystemRights]::Read), ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit), ([Security.AccessControl.PropagationFlags]::None), ([Security.AccessControl.AccessControlType]::Allow)
  $rdwebGuardNegativeAcl.AddAccessRule($rdwebGuardRule)
  $rdwebGuardNegativeItem.SetAccessControl($rdwebGuardNegativeAcl)
  $rdwebGuardNegativeAcl = Get-Acl -LiteralPath $rdwebGuardNegative
  if ($rdwebGuardNegativeAcl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $rdwebGuardOwner -or
      $rdwebGuardNegativeAcl.GetGroup([Security.Principal.SecurityIdentifier]) -ne $rdwebGuardGroupBefore -or
      -not $rdwebGuardNegativeAcl.AreAccessRulesProtected) { throw 'receiver_windows_ntfs_guard_unavailable' }
  $rdwebGuardRules = @($rdwebGuardNegativeAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  if ($rdwebGuardRules.Count -ne 2) { throw 'receiver_windows_ntfs_guard_unavailable' }
  $rdwebGuardOwnerAllow = $false
  $rdwebGuardUsersAllow = $false
  foreach ($rdwebGuardRule in $rdwebGuardRules) {
    if ($rdwebGuardRule.IsInherited) { throw 'receiver_windows_ntfs_guard_unavailable' }
    if ($rdwebGuardRule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        $rdwebGuardRule.IdentityReference -eq $rdwebGuardOwner -and
        $rdwebGuardRule.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl) { $rdwebGuardOwnerAllow = $true }
    if ($rdwebGuardRule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        $rdwebGuardRule.IdentityReference -eq $rdwebGuardUsers -and
        $rdwebGuardRule.FileSystemRights -eq ([Security.AccessControl.FileSystemRights]::Read -bor [Security.AccessControl.FileSystemRights]::Synchronize)) { $rdwebGuardUsersAllow = $true }
  }
  if (-not $rdwebGuardOwnerAllow -or -not $rdwebGuardUsersAllow) { throw 'receiver_windows_ntfs_guard_unavailable' }

  # 正向必須接受，負向必須以固定guard錯誤拒絕。
  $rdwebGuardStage = 'positive_guard'
  Assert-HostPrivatePath $rdwebGuardPositive $true $rdwebGuardOwner
  $rdwebGuardStage = 'negative_guard'
  $rdwebGuardRejected = $false
  try { Assert-HostPrivatePath $rdwebGuardNegative $true $rdwebGuardOwner }
  catch { if ($_.Exception.Message -ceq 'host_capability_unavailable') { $rdwebGuardRejected = $true } else { throw } }
  if (-not $rdwebGuardRejected) { throw 'receiver_windows_ntfs_guard_unavailable' }
  $rdwebGuardSuccess = $true
}
catch {
  if ($null -eq $rdwebGuardFailure) { $rdwebGuardFailure = $rdwebGuardStage }
}
finally {
  # 任何結果都要還原自己的Process政策；還原失敗不得回成功。
  if ($rdwebGuardPolicyChanged) {
    try {
      Set-ExecutionPolicy -Scope Process -ExecutionPolicy Undefined -Force -ErrorAction Stop
      Assert-RdwebGuardPolicy 'Undefined' 'Restricted'
      $rdwebGuardPolicyChanged = $false
    }
    catch {
      if ($null -eq $rdwebGuardFailure) { $rdwebGuardFailure = 'policy_baseline' }
    }
  }
  if ($null -ne $rdwebGuardIdentity) {
    try { $rdwebGuardIdentity.Dispose() }
    catch { if ($null -eq $rdwebGuardFailure) { $rdwebGuardFailure = 'resources_close' } }
    $rdwebGuardIdentity = $null
  }
}
if ($null -eq $rdwebGuardFailure -and $rdwebGuardSuccess) {
  [Console]::Write('${successLine.slice(0, -1)}' + [char]10)
  exit 0
}
if ($null -eq $rdwebGuardFailure) { $rdwebGuardFailure = 'preflight' }
[Console]::Write('${unavailablePrefix}' + $rdwebGuardFailure + ',terminalUse=stop,receiverStarted=False' + [char]10)
exit 2
}
`
  const childBase64 = Buffer.from(source, 'utf16le').toString('base64')
  const commandLine = String.raw`& {
$rdwebGuardLaunchFailure = '${unavailablePrefix}child_launch,terminalUse=stop,receiverStarted=False'
$rdwebGuardChildExitFailure = '${unavailablePrefix}child_exit,terminalUse=stop,receiverStarted=False'
try {
  & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '${childBase64}'
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2) { [Console]::Write($rdwebGuardChildExitFailure + [char]10) }
}
catch { [Console]::Write($rdwebGuardLaunchFailure + [char]10) }
}
`
  if (source.includes('\r') || source.includes('\0') || !source.endsWith('\n')) return unavailable()
  if (commandLine.includes('\r') || commandLine.includes('\0') || !commandLine.endsWith('\n'))
    return unavailable()
  const artifact = powerShellArtifact(purpose, source, successLine)
  if (artifact.purpose !== purpose) return unavailable()
  if (artifact.argumentUtf16Units > 32766 || commandLine.length > 32766) return unavailable()
  return Object.freeze({
    ...artifact,
    transport: 'interactive_ram_only',
    encodedCommandSupported: true,
    commandLine,
    commandLineUtf16Units: commandLine.length,
    childBase64,
    rootName,
    packageRoot,
    entryBytes,
    entrySha256,
    supervisorBytes,
    supervisorSha256,
    successLine,
    unavailablePrefix,
    stages,
    stageStdout: Object.freeze(
      stages.map(
        (stage) => unavailablePrefix + stage + ',terminalUse=stop,receiverStarted=False\n',
      ),
    ),
  })
}

// 只生成公開複製fixture與完整parent監督候選；不執行PS、I/O或現場政策例外。
export function createNativeProbePowerShellCopyContractsArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellLoadOnlySupervisorArtifact()
  if (
    createHash('sha256').update(baseline.source).digest('hex') !==
    'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e'
  )
    return unavailable()
  const rootName = 'rdweb receiver Copy 公開 20261025-01'
  const onceFlag = 'RdwebReceiverCopyContracts20261025Once'
  const policyStart = uniqueSourceOffset(
    baseline.childSource,
    '# 僅接受本候選固定的兩種完整政策狀態',
  )
  const policyEnd = uniqueSourceOffset(baseline.childSource, '# child只確認自己的政策與身份物件')
  const policySource = baseline.childSource.slice(policyStart, policyEnd)
  const caseBodies = [
    [
      'copy_8192',
      `  Copy-PrivateSetting $copySource $copyDestination
  Assert-CopyFixture $copySource 8192 65
  Assert-CopyFixture $copyDestination 8192 65
`,
    ],
    [
      'existing',
      `  Assert-CopyRejected { Copy-PrivateSetting $copySource $copyExisting }
  Assert-CopyFixture $copySource 8192 65
  Assert-CopyFixture $copyExisting 16 67
`,
    ],
    [
      'oversize_8193',
      `  Assert-CopyRejected { Copy-PrivateSetting $copyLarge $copyOversizeDestination }
  Assert-CopyFixture $copyLarge 8193 66
  Assert-CopyAbsent $copyOversizeDestination
`,
    ],
    [
      'missing',
      `  Assert-CopyAbsent $copyMissingSource
  Assert-CopyRejected { Copy-PrivateSetting $copyMissingSource $copyMissingDestination }
  Assert-CopyAbsent $copyMissingSource
  Assert-CopyAbsent $copyMissingDestination
`,
    ],
  ]
  let childSource =
    '& {\n' +
    String.raw`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$copyStage = 'child_policy'; $copyReason = 'guard_rejected'
$copyPhase = 'unknown'; $copyFailureReason = 'unknown'; $copyFailed = $false
$copyIdentity = $null; $copyIdentityAttempted = $false
$copyPolicyAttempted = $false; $copyRestored = $false; $copyClosed = $false; $copyDone = $false
$copyResources = @{ Fault = $false }
` +
    policySource +
    String.raw`
# 不存在才可測試；未知存取錯誤不當不存在，也不建立／刪除路徑。
function Assert-CopyAbsent([string]$Path) {
  $absent = $false
  try { [void][IO.File]::GetAttributes($Path) }
  catch [IO.FileNotFoundException] { $absent = $true }
  catch [IO.DirectoryNotFoundException] { $absent = $true }
  if (-not $absent) { throw 'receiver_copy_rejected' }
}
# 只在新私有root以CreateNew寫固定公開bytes；任何失敗半成品皆保留。
function New-CopyFixture([string]$Path, [int]$Size, [byte]$Fill) {
  if ($Size -lt 1 -or $Size -gt 8193) { throw 'receiver_copy_rejected' }
  Assert-HostPrivatePath $copyRoot $true $copyOwner
  $buffer = [byte[]]::new($Size); $stream = $null
  try {
    for ($i = 0; $i -lt $Size; $i++) { $buffer[$i] = $Fill }
    $stream = [IO.FileStream]::new($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stream.Write($buffer, 0, $buffer.Length); $stream.Flush()
  }
  catch { $copyResources.Fault = $true; throw }
  finally {
    try { if ($null -ne $stream) { $stream.Dispose() } }
    catch { $copyResources.Fault = $true; throw }
    finally { [Array]::Clear($buffer, 0, $buffer.Length) }
  }
}
# 有界逐byte核對本輪公開fixture，不輸出內容／長度／hash，不讀其他檔案。
function Assert-CopyFixture([string]$Path, [int]$Size, [byte]$Fill) {
  if ($Size -lt 1 -or $Size -gt 8193) { throw 'receiver_copy_rejected' }
  Assert-HostPrivatePath $Path $false $copyOwner
  $buffer = [byte[]]::new(1); $stream = $null
  try {
    $stream = [IO.FileStream]::new($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    if ($stream.Length -ne $Size) { throw 'receiver_copy_rejected' }
    for ($i = 0; $i -lt $Size; $i++) {
      $read = $stream.Read($buffer, 0, 1)
      if ($read -ne 1 -or $buffer[0] -ne $Fill) { throw 'receiver_copy_rejected' }
    }
    if ($stream.ReadByte() -ne -1) { throw 'receiver_copy_rejected' }
  }
  catch { $copyResources.Fault = $true; throw }
  finally {
    try { if ($null -ne $stream) { $stream.Dispose() } }
    catch { $copyResources.Fault = $true; throw }
    finally { [Array]::Clear($buffer, 0, $buffer.Length) }
  }
}
# 只把原函數的固定拒絕算預期負向，Dispose或其他例外不能偽裝成功。
function Assert-CopyRejected([scriptblock]$Action) {
  $rejected = $false
  try { & $Action }
  catch {
    if ($_.Exception.Message -ceq 'receiver_unavailable') { $rejected = $true }
    else { $copyResources.Fault = $true; throw }
  }
  if (-not $rejected) { throw 'receiver_copy_rejected' }
}
try {
  if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or
      $PSVersionTable.PSEdition -cne 'Desktop' -or -not [Environment]::Is64BitProcess -or
      $Host.Name -cne 'ConsoleHost' -or
      ([string]$ExecutionContext.SessionState.LanguageMode) -cne 'FullLanguage' -or
      ([string][Threading.Thread]::CurrentThread.GetApartmentState()) -cne 'STA') { throw 'receiver_copy_rejected' }
  Assert-RdwebLoadPolicy 'Restricted'
  $copyIdentityAttempted = $true
  $copyIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $copyOwner = $copyIdentity.User
  $principal = [Security.Principal.WindowsPrincipal]::new($copyIdentity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'receiver_copy_rejected' }
  $copyPolicyAttempted = $true
  Microsoft.PowerShell.Security\Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
  Assert-RdwebLoadPolicy 'RemoteSigned'
  $copyStage = 'child_parse'; $copyReason = 'unknown'
  $copyPackage = Join-Path ([IO.Path]::GetTempPath()) ${psLiteral(baseline.packageRelativePath)}
  foreach ($name in @('start-windows-test-receiver.ps1', 'windows-host-observer-supervisor.ps1')) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $copyPackage $name), [ref]$tokens, [ref]$errors)
    if ($errors.Count -ne 0) { $copyReason = 'parse_rejected'; throw 'receiver_copy_rejected' }
  }
  $copyReason = 'unknown'
  . (Join-Path $copyPackage 'start-windows-test-receiver.ps1')
  $copyStage = 'root_absence'; $copyReason = 'guard_rejected'
  $copyRoot = Join-Path ([IO.Path]::GetTempPath()) ${psLiteral(rootName)}
  [void](Assert-LocalNtfsPath $copyRoot)
  $copyCursor = Get-Item -LiteralPath ([IO.Path]::GetTempPath()) -Force -ErrorAction Stop
  while ($null -ne $copyCursor) {
    if ($copyCursor -isnot [IO.DirectoryInfo] -or
        ($copyCursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'receiver_copy_rejected' }
    $copyCursor = $copyCursor.Parent
  }
  Assert-CopyAbsent $copyRoot
  $copyStage = 'private_create'; $copyReason = 'io_failed'
  New-OwnerOnlyDirectory $copyRoot $copyOwner
  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'
  Assert-HostPrivatePath $copyRoot $true $copyOwner
  $copyAcl = Get-Acl -LiteralPath $copyRoot -ErrorAction Stop
  if (-not $copyAcl.AreAccessRulesProtected -or
      $copyAcl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $copyOwner) { throw 'receiver_copy_rejected' }
  foreach ($rule in $copyAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        $rule.IdentityReference -ne $copyOwner) { throw 'receiver_copy_rejected' }
  }
  $copySource = Join-Path $copyRoot 'source.bin'
  $copyExisting = Join-Path $copyRoot 'existing.bin'
  $copyLarge = Join-Path $copyRoot 'large.bin'
  $copyDestination = Join-Path $copyRoot 'copied.bin'
  $copyOversizeDestination = Join-Path $copyRoot 'oversize-destination.bin'
  $copyMissingSource = Join-Path $copyRoot 'missing-source.bin'
  $copyMissingDestination = Join-Path $copyRoot 'missing-destination.bin'
  $copyStage = 'copy'; $copyReason = 'io_failed'
  New-CopyFixture $copySource 8192 65
  New-CopyFixture $copyExisting 16 67
  New-CopyFixture $copyLarge 8193 66
  Assert-CopyFixture $copySource 8192 65
  Assert-CopyFixture $copyExisting 16 67
  Assert-CopyFixture $copyLarge 8193 66
  Assert-CopyAbsent $copyDestination
  Assert-CopyAbsent $copyOversizeDestination
  Assert-CopyAbsent $copyMissingSource
  Assert-CopyAbsent $copyMissingDestination
`
  const caseMap = []
  for (const [id, body] of caseBodies) {
    const offset = childSource.length
    childSource += body
    caseMap.push(
      Object.freeze({
        id,
        stage: 'copy',
        offset,
        units: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      }),
    )
  }
  const template = formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()).slice(0, -1)
  childSource += String.raw`  $copyDone = $true
}
catch {
  if (-not $copyFailed) { $copyFailed = $true; $copyPhase = $copyStage; $copyFailureReason = $copyReason }
  $copyResources.Fault = $true
}
finally {
  if ($copyPolicyAttempted) {
    try {
      Microsoft.PowerShell.Security\Set-ExecutionPolicy -Scope Process -ExecutionPolicy Undefined -Force -ErrorAction Stop
      Assert-RdwebLoadPolicy 'Restricted'; $copyRestored = $true
    }
    catch {
      if (-not $copyFailed) { $copyFailed = $true; $copyPhase = 'child_cleanup'; $copyFailureReason = 'cleanup_unconfirmed' }
    }
  }
  if ($copyIdentityAttempted) {
    try {
      if ($null -eq $copyIdentity) { throw 'receiver_copy_rejected' }
      $copyIdentity.Dispose(); $copyClosed = -not $copyResources.Fault
    }
    catch { $copyResources.Fault = $true }
    if (-not $copyClosed -and -not $copyFailed) {
      $copyFailed = $true; $copyPhase = 'child_cleanup'; $copyFailureReason = 'cleanup_unconfirmed'
    }
  }
}
$copyPolicyState = 'not_acquired'; $copyResourceState = 'not_acquired'
if ($copyPolicyAttempted) {
  $copyPolicyState = 'unconfirmed'; if ($copyRestored) { $copyPolicyState = 'confirmed' }
}
if ($copyIdentityAttempted) {
  $copyResourceState = 'unconfirmed'; if ($copyClosed) { $copyResourceState = 'confirmed' }
}
# 模板由共用JS formatter生成，只替換本child固定白名單欄位，其餘owner一律unknown。
$copyWire = ${psLiteral(template)}
$copyWire = $copyWire.Replace('"phase":"unknown"', '"phase":"' + $copyPhase + '"')
$copyWire = $copyWire.Replace('"reason":"unknown"', '"reason":"' + $copyFailureReason + '"')
$copyWire = $copyWire.Replace('"childPolicyRestore":"unknown"', '"childPolicyRestore":"' + $copyPolicyState + '"')
$copyWire = $copyWire.Replace('"resourcesClose":"unknown"', '"resourcesClose":"' + $copyResourceState + '"')
[Console]::Write($copyWire + [char]10)
if ($copyDone -and -not $copyFailed -and $copyRestored -and $copyClosed) { exit 0 }
exit 2
}
`
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const childArguments =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(childSource, 'utf16le').toString('base64')
  const childCommandLineUtf16UnitsUpperBound = 512 + 3 + childArguments.length
  if (
    childCommandLineUtf16UnitsUpperBound > 32766 ||
    childSource.includes("\n'@") ||
    childSource.includes('\r') ||
    childSource.includes('\0')
  )
    return unavailable()
  let source = baseline.source
  const allowedPhases =
    "@('unknown', 'child_policy', 'child_parse', 'root_absence', 'private_create', 'private_guard', 'copy', 'child_cleanup')"
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    ["@('unknown', 'child_policy', 'child_parse', 'child_cleanup')", allowedPhases],
    [
      'Get-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'Get-Variable -Name ' + onceFlag,
    ],
    [
      'New-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'New-Variable -Name ' + onceFlag,
    ],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  const ready = {
    ...unknownNativeProbeDiagnostic(),
    childPolicyRestore: 'confirmed',
    resourcesClose: 'confirmed',
  }
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'child_ready', wire: baseline.expectedChildStdout }),
    Object.freeze({
      label: 'copy_rejected',
      wire: formatNativeProbeDiagnostic({ ...ready, phase: 'copy', reason: 'io_failed' }),
    }),
    Object.freeze({
      label: 'child_cleanup_unconfirmed',
      wire: formatNativeProbeDiagnostic({
        ...ready,
        phase: 'child_cleanup',
        reason: 'cleanup_unconfirmed',
        childPolicyRestore: 'unconfirmed',
        resourcesClose: 'unconfirmed',
      }),
    }),
  ])
  const fixturePlan = Object.freeze([
    Object.freeze({ name: 'source.bin', bytes: 8192, fill: 65, creation: 'fixture' }),
    Object.freeze({ name: 'existing.bin', bytes: 16, fill: 67, creation: 'fixture' }),
    Object.freeze({ name: 'large.bin', bytes: 8193, fill: 66, creation: 'fixture' }),
    Object.freeze({ name: 'copied.bin', bytes: 8192, fill: 65, creation: 'copy' }),
    Object.freeze({ name: 'oversize-destination.bin', bytes: 0, fill: null, creation: 'absent' }),
    Object.freeze({ name: 'missing-destination.bin', bytes: 0, fill: null, creation: 'absent' }),
  ])
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_copy_contracts_v1',
    source,
    utf8Bytes: Buffer.byteLength(source, 'utf8'),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    baselineSha256: baseline.sha256,
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource, 'utf8'),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    childAdapterOffset: null,
    childAdapterUnits: 0,
    rootName,
    onceFlag,
    caseMap: Object.freeze(caseMap),
    fixturePlan,
    artifactBudget: Object.freeze({
      directories: 1,
      normalFiles: 4,
      normalBytes: 24593,
      maxFiles: 6,
      maxBytes: 32786,
    }),
    wireFixtures,
    childFrameTemplate: template + '\n',
  })
}

// 步驟代碼只由固定序號生成，不由檔名、例外或任何外部值推導。
const copyOperationStepIds = Object.freeze(
  Array.from({ length: 23 }, (_, index) => 'c' + String(index + 1).padStart(2, '0')),
)
const copyOutputStepIds = Object.freeze(['not_started', 'complete', ...copyOperationStepIds])
const copyStepPrefix = 'receiver_native_copy_step,step='
const copyPreflightPhases = Object.freeze([
  'child_policy',
  'child_parse',
  'root_absence',
  'private_create',
  'private_guard',
])

// 只消費公開的兩行診斷契約；JS解碼通過不代表生成PS或Windows I/O已驗證。
export function parseNativeProbeCopyStepOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout, 'utf8') > 1024) {
    return unavailable()
  }
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 3 || lines[2] !== '' || !lines[0].startsWith(copyStepPrefix)) {
    return unavailable()
  }
  const step = lines[0].slice(copyStepPrefix.length)
  if (!copyOutputStepIds.includes(step)) return unavailable()
  const frame = lines[1] + '\n'
  const diagnostic = parseNativeProbeDiagnostic(frame)
  if (
    formatNativeProbeDiagnostic(diagnostic) !== frame ||
    diagnostic.childStart !== 'unknown' ||
    diagnostic.childExit !== 'unknown' ||
    diagnostic.parentPolicyVerify !== 'unknown'
  )
    return unavailable()
  const ready = formatNativeProbeDiagnostic({
    ...unknownNativeProbeDiagnostic(),
    childPolicyRestore: 'confirmed',
    resourcesClose: 'confirmed',
  })
  if (diagnostic.phase === 'unknown') {
    if (step !== 'complete' || frame !== ready) return unavailable()
  } else if (diagnostic.phase === 'copy') {
    if (
      !copyOperationStepIds.includes(step) ||
      diagnostic.reason !== 'io_failed' ||
      diagnostic.resourcesClose !== 'unconfirmed' ||
      !['confirmed', 'unconfirmed'].includes(diagnostic.childPolicyRestore)
    )
      return unavailable()
  } else if (diagnostic.phase === 'child_cleanup') {
    if (
      step !== 'complete' ||
      diagnostic.reason !== 'cleanup_unconfirmed' ||
      !['confirmed', 'unconfirmed'].includes(diagnostic.childPolicyRestore) ||
      !['confirmed', 'unconfirmed'].includes(diagnostic.resourcesClose) ||
      (diagnostic.childPolicyRestore === 'confirmed' && diagnostic.resourcesClose === 'confirmed')
    ) {
      return unavailable()
    }
  } else if (
    !copyPreflightPhases.includes(diagnostic.phase) ||
    step !== 'not_started' ||
    diagnostic.reason === 'none' ||
    diagnostic.resourcesClose === 'confirmed'
  )
    return unavailable()
  return Object.freeze({ step, diagnostic, frame })
}

// 生成與JS同白名單的兩行PS解碼器；只回已驗固定值，不回顯被拒絕的wire。
function copyStepOutputDecoderSource(expectedChildDiagnosticStdout) {
  return `# 先驗完整兩行與固定步驟配對；不能把step=complete當作退出／政策／資源成功。
function ConvertFrom-RdwebCopyStepOutput([string]$Wire) {
  if ($null -eq $Wire -or [Text.Encoding]::UTF8.GetByteCount($Wire) -gt 1024) { throw 'receiver_native_load_rejected' }
  $lines = $Wire.Replace(([string][char]13 + [char]10), ([string][char]10)).Split([char]10)
  $prefix = ${psLiteral(copyStepPrefix)}
  if ($lines.Count -ne 3 -or $lines[2] -cne '' -or
      -not $lines[0].StartsWith($prefix, [StringComparison]::Ordinal)) { throw 'receiver_native_load_rejected' }
  $step = $lines[0].Substring($prefix.Length)
  if (${psArray(copyOutputStepIds)} -cnotcontains $step) { throw 'receiver_native_load_rejected' }
  $frame = $lines[1] + [char]10
  $value = ConvertFrom-RdwebLoadFrame $frame
  if ($value['childStart'] -cne 'unknown' -or $value['childExit'] -cne 'unknown' -or
      $value['parentPolicyVerify'] -cne 'unknown') { throw 'receiver_native_load_rejected' }
  if ($value['phase'] -ceq 'unknown') {
    if ($step -cne 'complete' -or $frame -cne ${psLiteral(expectedChildDiagnosticStdout.slice(0, -1))} + [char]10) { throw 'receiver_native_load_rejected' }
  }
  elseif ($value['phase'] -ceq 'copy') {
    if (${psArray(copyOperationStepIds)} -cnotcontains $step -or
        $value['reason'] -cne 'io_failed' -or $value['resourcesClose'] -cne 'unconfirmed' -or
        @('confirmed', 'unconfirmed') -cnotcontains $value['childPolicyRestore']) { throw 'receiver_native_load_rejected' }
  }
  elseif ($value['phase'] -ceq 'child_cleanup') {
    if ($step -cne 'complete' -or $value['reason'] -cne 'cleanup_unconfirmed' -or
        @('confirmed', 'unconfirmed') -cnotcontains $value['childPolicyRestore'] -or
        @('confirmed', 'unconfirmed') -cnotcontains $value['resourcesClose'] -or
        ($value['childPolicyRestore'] -ceq 'confirmed' -and $value['resourcesClose'] -ceq 'confirmed')) { throw 'receiver_native_load_rejected' }
  }
  elseif (${psArray(copyPreflightPhases)} -cnotcontains $value['phase'] -or
      $step -cne 'not_started' -or $value['reason'] -ceq 'none' -or
      $value['resourcesClose'] -ceq 'confirmed') { throw 'receiver_native_load_rejected' }
  return ,@{ Step = $step; Diagnostic = $value; Frame = $frame }
}
`
}

// 只派生新步驟候選；保留原copy監督與複製行為，所有新root／旗標仍待原生單次授權。
export function createNativeProbePowerShellCopyStepsArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellCopyContractsArtifact()
  if (
    createHash('sha256').update(baseline.source).digest('hex') !==
    '9c865eef002b046c900a2e98f81d1df53d28705afdc838af426c1d084d1838f8'
  )
    return unavailable()
  const rootName = 'rdweb receiver Copy steps 公開 20261025-01'
  const onceFlag = 'RdwebReceiverCopySteps20261025Once'
  let childSource = baseline.childSource
  const operationStart =
    uniqueSourceOffset(childSource, "  $copyStage = 'copy'; $copyReason = 'io_failed'\n") +
    "  $copyStage = 'copy'; $copyReason = 'io_failed'\n".length
  const operationEnd = uniqueSourceOffset(childSource, '  $copyDone = $true\n')
  const operations = childSource.slice(operationStart, operationEnd).split('\n')
  if (
    operations.pop() !== '' ||
    operations.length !== 23 ||
    operations.some((line) => !line.startsWith('  ') || line.includes('$copyStep'))
  )
    return unavailable()
  // 每個原操作前只插入一個固定標記，原命令順序與參數保持不變。
  const bodies = operations.map(
    (line, index) => `  $copyStep = '${copyOperationStepIds[index]}'\n` + line + '\n',
  )
  childSource =
    childSource.slice(0, operationStart) +
    bodies.join('') +
    "  $copyStep = 'complete'\n" +
    childSource.slice(operationEnd)
  const childOutput = `$copyOutputStep = $copyStep
if ($null -ne $copyFirstStep) { $copyOutputStep = $copyFirstStep }
if (${psArray(copyOutputStepIds)} -cnotcontains $copyOutputStep) { exit 2 }
[Console]::Write(${psLiteral(copyStepPrefix)} + $copyOutputStep + [char]10)
`
  for (const [original, replacement] of [
    [baseline.rootName, rootName],
    [
      '$copyResources = @{ Fault = $false }\n',
      "$copyResources = @{ Fault = $false }\n$copyStep = 'not_started'; $copyFirstStep = $null\n",
    ],
    [
      '; $copyFailureReason = $copyReason }\n',
      '; $copyFailureReason = $copyReason; $copyFirstStep = $copyStep }\n',
    ],
    [
      '[Console]::Write($copyWire + [char]10)\n',
      childOutput + '[Console]::Write($copyWire + [char]10)\n',
    ],
  ]) {
    const offset = uniqueSourceOffset(childSource, original)
    childSource =
      childSource.slice(0, offset) + replacement + childSource.slice(offset + original.length)
  }
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const childArguments =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(childSource, 'utf16le').toString('base64')
  const childCommandLineUtf16UnitsUpperBound = 512 + 3 + childArguments.length
  if (
    childCommandLineUtf16UnitsUpperBound > 32766 ||
    childSource.includes("\n'@") ||
    childSource.includes('\r') ||
    childSource.includes('\0')
  )
    return unavailable()
  // 每個span以真正嵌入的完整標記加命令綁定，不沿用舊offset。
  const stepMap = Object.freeze(
    bodies.map((body, index) =>
      Object.freeze({
        id: copyOperationStepIds[index],
        offset: uniqueSourceOffset(childSource, body),
        units: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      }),
    ),
  )
  // 四case仍按原順序執行；範圍包含各自操作與所有回驗步驟。
  const caseMap = Object.freeze(
    baseline.caseMap.map((item, index) => {
      const first = [10, 13, 16, 19][index]
      const last = [12, 15, 18, 22][index]
      const offset = stepMap[first].offset
      const units = stepMap[last].offset + stepMap[last].units - offset
      return Object.freeze({
        id: item.id,
        stage: 'copy',
        offset,
        units,
        sha256: createHash('sha256')
          .update(childSource.slice(offset, offset + units))
          .digest('hex'),
        steps: Object.freeze(copyOperationStepIds.slice(first, last + 1)),
      })
    }),
  )
  const expectedChildDiagnosticStdout = baseline.expectedChildStdout
  const outputDecoderSource = copyStepOutputDecoderSource(expectedChildDiagnosticStdout)
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    [
      '# child literal逐字保留原來源尾LF',
      outputDecoderSource + '# child literal逐字保留原來源尾LF',
    ],
    [
      '$loadDiagnostic = New-RdwebNativeDiagnostic\n',
      "$loadDiagnostic = New-RdwebNativeDiagnostic\n$loadCopyStep = 'unknown'\n",
    ],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
    [
      '  $child = ConvertFrom-RdwebLoadFrame $frame\n',
      '  $copyFrame = ConvertFrom-RdwebCopyStepOutput $frame\n  $child = $copyFrame.Diagnostic; $frame = $copyFrame.Frame\n',
    ],
    [
      "  if ($child['phase'] -cne 'unknown' -or $child['reason'] -cne 'unknown') {\n",
      "  $loadCopyStep = $copyFrame.Step\n  if ($child['phase'] -cne 'unknown' -or $child['reason'] -cne 'unknown') {\n",
    ],
    ['  if ($frame.Replace', "  if ($loadCopyStep -cne 'complete' -or\n      $frame.Replace"],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  if (!source.endsWith('}\n')) return unavailable()
  source =
    source.slice(0, -2) +
    `[Console]::Write(${psLiteral(copyStepPrefix)} + $loadCopyStep + [char]10)\n}\n`
  const expectedChildStdout = copyStepPrefix + 'complete\n' + expectedChildDiagnosticStdout
  const failed = formatNativeProbeDiagnostic({
    ...unknownNativeProbeDiagnostic(),
    phase: 'copy',
    reason: 'io_failed',
    childPolicyRestore: 'confirmed',
    resourcesClose: 'unconfirmed',
  })
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'child_ready', wire: expectedChildStdout }),
    // 每個失敗fixture只含固定代碼與公開診斷，沒有檔案或例外資料。
    ...copyOperationStepIds.map((step) =>
      Object.freeze({
        label: step,
        wire: copyStepPrefix + step + '\n' + failed,
      }),
    ),
  ])
  // 自驗公開wire只涵蓋JS契約；不會執行生成的PS或取得原生證據。
  for (const fixture of wireFixtures) parseNativeProbeCopyStepOutput(fixture.wire)
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_copy_steps_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    outputDecoderSource,
    outputDecoderOffset: uniqueSourceOffset(source, outputDecoderSource),
    outputDecoderSha256: createHash('sha256').update(outputDecoderSource).digest('hex'),
    rootName,
    onceFlag,
    stepMap,
    caseMap,
    stepIds: copyOutputStepIds,
    expectedChildDiagnosticStdout,
    expectedChildStdout,
    expectedStdout: baseline.expectedStdout + copyStepPrefix + 'complete\n',
    wireFixtures,
    invalidWireFixtures: Object.freeze([]),
  })
}

// 僅修正新候選c21的缺檔拒絕契約，不改原函數、舊候選或原生成功門檻。
export function createNativeProbePowerShellCopyMissingSourceArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellCopyStepsArtifact()
  if (
    createHash('sha256').update(baseline.source).digest('hex') !==
    'fe46f33095c8f836a6f356106e340eaab1acb33703685fd339c146aff549361e'
  )
    return unavailable()
  const rootName = 'rdweb receiver Copy missing 公開 20261025-01'
  const onceFlag = 'RdwebReceiverCopyMissing20261025Once'
  const previous = baseline.stepMap[20]
  const previousBody = baseline.childSource.slice(previous.offset, previous.offset + previous.units)
  const missingBody = `  $copyStep = 'c21'
  # 缺少來源在原函數try之前拒絕；只接受缺檔型別與分類，不讀取錯誤文字。
  $copyMissingRejected = $false
  try { Copy-PrivateSetting $copyMissingSource $copyMissingDestination }
  catch [Management.Automation.ItemNotFoundException] {
    if ($_.CategoryInfo.Category -ne [Management.Automation.ErrorCategory]::ObjectNotFound) { throw }
    $copyMissingRejected = $true
  }
  if (-not $copyMissingRejected) { throw 'receiver_copy_rejected' }
`
  let childSource = baseline.childSource
  for (const [original, replacement] of [
    [previousBody, missingBody],
    [baseline.rootName, rootName],
  ]) {
    const offset = uniqueSourceOffset(childSource, original)
    childSource =
      childSource.slice(0, offset) + replacement + childSource.slice(offset + original.length)
  }
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const childArguments =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(childSource, 'utf16le').toString('base64')
  const childCommandLineUtf16UnitsUpperBound = 512 + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > 32766) return unavailable()
  // 基底已綁定23個固定步驟，只重算新來源的位置與hash，不重新驗內部資料形狀。
  const stepMap = Object.freeze(
    baseline.stepMap.map((step) => {
      const body =
        step.id === 'c21'
          ? missingBody
          : baseline.childSource.slice(step.offset, step.offset + step.units)
      return Object.freeze({
        ...step,
        offset: uniqueSourceOffset(childSource, body),
        units: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      })
    }),
  )
  // case保留原步驟集合；missing範圍仍完整涵蓋c20到c23的事前／事後回驗。
  const caseMap = Object.freeze(
    baseline.caseMap.map((item) => {
      const first = stepMap.find((step) => step.id === item.steps[0])
      const last = stepMap.find((step) => step.id === item.steps.at(-1))
      const offset = first.offset
      const units = last.offset + last.units - offset
      return Object.freeze({
        ...item,
        offset,
        units,
        sha256: createHash('sha256')
          .update(childSource.slice(offset, offset + units))
          .digest('hex'),
      })
    }),
  )
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_copy_missing_source_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    outputDecoderOffset: uniqueSourceOffset(source, baseline.outputDecoderSource),
    rootName,
    onceFlag,
    stepMap,
    caseMap,
  })
}

// 只生成一次性launch claim候選；不執行PS或建立任何現場產物。
export function createNativeProbePowerShellLaunchClaimArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellCopyContractsArtifact()
  if (
    createHash('sha256').update(baseline.source).digest('hex') !==
    '9c865eef002b046c900a2e98f81d1df53d28705afdc838af426c1d084d1838f8'
  )
    return unavailable()
  const rootName = 'rdweb receiver Launch claim 公開 20261025-01'
  const onceFlag = 'RdwebReceiverLaunchClaim20261025Once'
  const helperSource = String.raw`# 只核對本輪公開claim固定bytes及EOF；任何讀取或Dispose失敗均保留失敗。
function Assert-LaunchClaimFixture() {
  Assert-HostPrivatePath $claimPath $false $copyOwner
  $expected = [Text.Encoding]::ASCII.GetBytes('{"schemaVersion":1,"purpose":"rustdesk_test_receiver_v1"}' + "${'`'}n")
  $buffer = [byte[]]::new(1); $stream = $null
  try {
    $stream = [IO.FileStream]::new($claimPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    if ($stream.Length -ne $expected.Length) { throw 'receiver_copy_rejected' }
    for ($i = 0; $i -lt $expected.Length; $i++) {
      $read = $stream.Read($buffer, 0, 1)
      if ($read -ne 1 -or $buffer[0] -ne $expected[$i]) { throw 'receiver_copy_rejected' }
    }
    if ($stream.ReadByte() -ne -1) { throw 'receiver_copy_rejected' }
  }
  catch { $copyResources.Fault = $true; throw }
  finally {
    try { if ($null -ne $stream) { $stream.Dispose() } }
    catch { $copyResources.Fault = $true; throw }
    finally {
      [Array]::Clear($expected, 0, $expected.Length)
      [Array]::Clear($buffer, 0, $buffer.Length)
    }
  }
}
`
  const cases = [
    [
      'create',
      `  $copyStage = 'private_create'; $copyReason = 'io_failed'
  Claim-ReceiverLaunch $copyRoot
`,
    ],
    [
      'before',
      `  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'
  Assert-LaunchClaimFixture
  $claimBefore = Get-Item -LiteralPath $claimPath -Force -ErrorAction Stop
`,
    ],
    [
      'duplicate',
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
    ],
    [
      'after',
      `  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'
  Assert-LaunchClaimFixture
  $claimAfter = Get-Item -LiteralPath $claimPath -Force -ErrorAction Stop
  if ($claimBefore.CreationTimeUtc.Ticks -ne $claimAfter.CreationTimeUtc.Ticks -or
      $claimBefore.LastWriteTimeUtc.Ticks -ne $claimAfter.LastWriteTimeUtc.Ticks -or
      $claimBefore.Attributes -ne $claimAfter.Attributes) { throw 'receiver_copy_rejected' }
`,
    ],
  ]
  const helpersStart = uniqueSourceOffset(
    baseline.childSource,
    '# 只在新私有root以CreateNew寫固定公開bytes',
  )
  const helpersEnd = uniqueSourceOffset(baseline.childSource, '\ntry {\n  if ($PSVersionTable')
  const operationsStart = uniqueSourceOffset(
    baseline.childSource,
    "  $copySource = Join-Path $copyRoot 'source.bin'\n",
  )
  const operationsEnd = uniqueSourceOffset(baseline.childSource, '  $copyDone = $true\n')
  let childSource = (
    baseline.childSource.slice(0, helpersStart) +
    helperSource +
    baseline.childSource.slice(helpersEnd, operationsStart) +
    "  $claimPath = Join-Path $copyRoot 'launch-claim.json'\n  Assert-CopyAbsent $claimPath\n"
  ).replace(baseline.rootName, rootName)
  // 逐段加入操作並以真來源位置綁定metadata，不沿用copy的offset。
  const caseMap = Object.freeze(
    cases.map(([id, body]) => {
      const offset = childSource.length
      childSource += body
      return Object.freeze({
        id,
        offset,
        units: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      })
    }),
  )
  childSource += baseline.childSource.slice(operationsEnd)
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const childArguments =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(childSource, 'utf16le').toString('base64')
  const childCommandLineUtf16UnitsUpperBound = 515 + childArguments.length
  if (
    childCommandLineUtf16UnitsUpperBound > 32766 ||
    childSource.includes("\n'@") ||
    childSource.includes('\r') ||
    childSource.includes('\0')
  )
    return unavailable()
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  const bytes = Buffer.byteLength('{"schemaVersion":1,"purpose":"rustdesk_test_receiver_v1"}\n')
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_launch_claim_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    rootName,
    onceFlag,
    caseMap,
    fixturePlan: Object.freeze([
      Object.freeze({ name: 'launch-claim.json', bytes, creation: 'claim' }),
    ]),
    artifactBudget: Object.freeze({
      directories: 1,
      normalFiles: 1,
      normalBytes: bytes,
      maxFiles: 1,
      maxBytes: bytes,
    }),
    wireFixtures: Object.freeze(
      baseline.wireFixtures.filter((fixture) => fixture.label !== 'copy_rejected'),
    ),
  })
}

// 僅生成私有子目錄及junction拒絕候選，不執行PS或建立現場產物。
export function createNativeProbePowerShellPrivateJunctionArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellLaunchClaimArtifact()
  if (
    createHash('sha256').update(baseline.source).digest('hex') !==
    '54122af06e3dd23ef1375df63be53eece192170855690ef4de09e22c50346cb6'
  )
    return unavailable()
  const rootName = 'rdweb receiver Private junction 公開 20261025-01'
  const onceFlag = 'RdwebReceiverPrivateJunction20261025Once'
  const privateVerifierSource = `# 只回讀本輪普通私有子目錄與DACL，快照留RAM、不輸出路徑或SDDL。
function Get-PrivateRunSnapshot([string]$Path) {
  $full = [IO.Path]::GetFullPath($Path)
  if ($full -cne $Path -or $full.Length -gt 240 -or
      -not [string]::Equals([IO.Path]::GetDirectoryName($full), $copyRoot, [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($full) -cnotmatch '^receiver-[0-9a-f]{32}$') { throw 'receiver_copy_rejected' }
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if ($item -isnot [IO.DirectoryInfo] -or
      ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
      -not [string]::Equals($item.Parent.FullName, $copyRoot, [StringComparison]::OrdinalIgnoreCase) -or
      $item.Name -cnotmatch '^receiver-[0-9a-f]{32}$') { throw 'receiver_copy_rejected' }
  Assert-HostPrivatePath $Path $true $copyOwner
  $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
  if (-not $acl.AreAccessRulesProtected -or
      $acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $copyOwner) { throw 'receiver_copy_rejected' }
  $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne 1 -or $rules[0].IsInherited -or
      $rules[0].IdentityReference -ne $copyOwner -or
      $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
      $rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'receiver_copy_rejected' }
  $sections = [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Access
  return [pscustomobject]@{
    Creation = $item.CreationTimeUtc.Ticks
    Write = $item.LastWriteTimeUtc.Ticks
    Attributes = [int]$item.Attributes
    Security = $acl.GetSecurityDescriptorSddlForm($sections)
  }
}
`
  const cases = [
    [
      'private_create',
      `  $copyStage = 'private_create'; $copyReason = 'io_failed'
  $privateOutput = @(New-PrivateRunDirectory $copyRoot $copyOwner)
  if ($privateOutput.Count -ne 1 -or $privateOutput[0] -isnot [string]) { throw 'receiver_copy_rejected' }
  $privateRun = $privateOutput[0]
`,
    ],
    [
      'private_before',
      `  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'
  $privateBefore = Get-PrivateRunSnapshot $privateRun
`,
    ],
    [
      'junction_create',
      `  $copyStage = 'junction'; $copyReason = 'io_failed'
  $junctionPath = Join-Path $copyRoot 'public-link'
  if ($junctionPath.Length -gt 240) { throw 'receiver_copy_rejected' }
  Assert-CopyAbsent $junctionPath
  [void](Microsoft.PowerShell.Management\New-Item -ItemType Junction -Path $junctionPath -Value $privateRun -ErrorAction Stop)
`,
    ],
    [
      'junction_verify',
      `  $copyStage = 'junction'; $copyReason = 'guard_rejected'
  $junctionItem = Get-Item -LiteralPath $junctionPath -Force -ErrorAction Stop
  if ($junctionItem -isnot [IO.DirectoryInfo] -or
      ($junctionItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -or
      $junctionItem.LinkType -cne 'Junction') { throw 'receiver_copy_rejected' }
  $junctionTargets = @($junctionItem.Target)
  if ($junctionTargets.Count -ne 1 -or $junctionTargets[0] -isnot [string] -or
      -not [string]::Equals($junctionTargets[0], $privateRun, [StringComparison]::OrdinalIgnoreCase)) { throw 'receiver_copy_rejected' }
`,
    ],
    [
      'junction_reject',
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
    ],
    [
      'private_after',
      `  $copyStage = 'private_guard'; $copyReason = 'guard_rejected'
  $privateAfter = Get-PrivateRunSnapshot $privateRun
  if ($privateBefore.Creation -ne $privateAfter.Creation -or
      $privateBefore.Write -ne $privateAfter.Write -or
      $privateBefore.Attributes -ne $privateAfter.Attributes -or
      $privateBefore.Security -cne $privateAfter.Security) { throw 'receiver_copy_rejected' }
`,
    ],
  ]
  const helperStart = uniqueSourceOffset(
    baseline.childSource,
    '# 只核對本輪公開claim固定bytes及EOF',
  )
  const helperEnd = uniqueSourceOffset(baseline.childSource, '\ntry {\n  if ($PSVersionTable')
  const operationsStart = uniqueSourceOffset(
    baseline.childSource,
    "  $claimPath = Join-Path $copyRoot 'launch-claim.json'\n",
  )
  const operationsEnd = uniqueSourceOffset(baseline.childSource, '  $copyDone = $true\n')
  let childSource = (
    baseline.childSource.slice(0, helperStart) +
    privateVerifierSource +
    baseline.childSource.slice(helperEnd, operationsStart)
  ).replace(baseline.rootName, rootName)
  // 六段固定操作各自綁定真正輸出span；不沿用claim的過期offset。
  const caseMap = Object.freeze(
    cases.map(([id, body]) => {
      const offset = childSource.length
      childSource += body
      return Object.freeze({
        id,
        offset,
        units: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      })
    }),
  )
  childSource += baseline.childSource.slice(operationsEnd)
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const childArguments =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(childSource, 'utf16le').toString('base64')
  const childCommandLineUtf16UnitsUpperBound = 515 + childArguments.length
  if (
    childCommandLineUtf16UnitsUpperBound > 32766 ||
    childSource.includes("\n'@") ||
    childSource.includes('\r') ||
    childSource.includes('\0')
  )
    return unavailable()
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
    [
      "@('unknown', 'child_policy', 'child_parse', 'root_absence', 'private_create', 'private_guard', 'copy', 'child_cleanup')",
      "@('unknown', 'child_policy', 'child_parse', 'root_absence', 'private_create', 'private_guard', 'copy', 'junction', 'child_cleanup')",
    ],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  const junctionFailure = formatNativeProbeDiagnostic({
    ...unknownNativeProbeDiagnostic(),
    phase: 'junction',
    reason: 'guard_rejected',
    childPolicyRestore: 'confirmed',
    resourcesClose: 'unconfirmed',
  })
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_private_junction_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    rootName,
    onceFlag,
    caseMap,
    privateVerifierSource,
    privateVerifierOffset: uniqueSourceOffset(childSource, privateVerifierSource),
    privateVerifierSha256: createHash('sha256').update(privateVerifierSource).digest('hex'),
    fixturePlan: Object.freeze([
      Object.freeze({ name: 'receiver-<guid>', kind: 'directory', creation: 'private_run' }),
      Object.freeze({
        name: 'public-link',
        kind: 'junction',
        target: 'private_run',
        creation: 'junction',
      }),
    ]),
    artifactBudget: Object.freeze({
      directories: 2,
      junctions: 1,
      normalFiles: 0,
      normalBytes: 0,
      maxFiles: 0,
      maxBytes: 0,
    }),
    wireFixtures: Object.freeze([
      ...baseline.wireFixtures,
      Object.freeze({ label: 'junction_rejected', wire: junctionFailure }),
    ]),
  })
}

// 只修新候選的module分隔符，保留原有缺陷候選與所有原生成功門檻。
export function createNativeProbePowerShellPrivateJunctionQualifiedArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellPrivateJunctionArtifact()
  if (
    createHash('sha256').update(baseline.source).digest('hex') !==
    '5b7e96c9bb91a84db90243df423f2353967f039be0508b1a59f0c75fc49622e2'
  )
    return unavailable()
  const malformed = 'Microsoft.PowerShell.ManagementNew-Item'
  const qualified = String.raw`Microsoft.PowerShell.Management\New-Item`
  const rootName = 'rdweb receiver Private junction qualified 公開 20261026-01'
  const onceFlag = 'RdwebReceiverPrivateJunctionQualified20261026Once'
  let childSource = baseline.childSource
  for (const [original, replacement] of [
    [malformed, qualified],
    [baseline.rootName, rootName],
  ]) {
    const offset = uniqueSourceOffset(childSource, original)
    childSource =
      childSource.slice(0, offset) + replacement + childSource.slice(offset + original.length)
  }
  // 由真生成來源重算六段位置，junction_create包含新增的U+005C。
  const caseMap = Object.freeze(
    baseline.caseMap.map((span) => {
      const body = baseline.childSource
        .slice(span.offset, span.offset + span.units)
        .replace(malformed, qualified)
      return Object.freeze({
        ...span,
        offset: uniqueSourceOffset(childSource, body),
        units: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      })
    }),
  )
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const childArguments =
    '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand ' +
    Buffer.from(childSource, 'utf16le').toString('base64')
  const childCommandLineUtf16UnitsUpperBound = 515 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > 32766) return unavailable()
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_private_junction_qualified_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    privateVerifierOffset: uniqueSourceOffset(childSource, baseline.privateVerifierSource),
    rootName,
    onceFlag,
    caseMap,
  })
}

// Node沒有PS政策；四項證據均由持有唯一child的parent確認。
const bundleHelpEvidence = Object.freeze([
  'childStart',
  'childExit',
  'parentPolicyVerify',
  'resourcesClose',
])
const bundleHelpObservedLine = 'receiver_windows_bundle_help_observed,sessionStarted=False\n'
const bundleHelpUnavailableLine =
  'receiver_windows_bundle_help_unavailable,terminalUse=stop,sessionStarted=False\n'

// 只接受canonical雙行help結果，不把not_acquired政策偽裝成五confirmed complete。
export function parseNativeProbeBundleHelpOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1280) return unavailable()
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 3 || lines[2] !== '') return unavailable()
  const diagnostic = parseNativeProbeDiagnostic(lines[0] + '\n')
  if (
    formatNativeProbeDiagnostic(diagnostic) !== lines[0] + '\n' ||
    diagnostic.childPolicyRestore !== 'not_acquired'
  )
    return unavailable()
  const ready =
    diagnostic.phase === 'unknown' &&
    diagnostic.reason === 'unknown' &&
    bundleHelpEvidence.every((name) => diagnostic[name] === 'confirmed')
  const marker = lines[1] + '\n'
  if (marker !== (ready ? bundleHelpObservedLine : bundleHelpUnavailableLine)) return unavailable()
  return Object.freeze({ status: ready ? 'observed' : 'unavailable', diagnostic })
}

// 僅生成固定Node與原bundle --help監督來源，不執行runtime、PS或現場I/O。
export function createNativeProbePowerShellBundleHelpArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellLoadOnlySupervisorArtifact()
  if (
    createHash('sha256').update(baseline.source).digest('hex') !==
    'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e'
  )
    return unavailable()
  const onceFlag = 'RdwebReceiverBundleHelp20261026Once'
  const expectedChildStdout = 'receiver_usage,run --directory <root>|--help\n'
  const trustedSources = Object.freeze([
    Object.freeze({
      name: 'integrity.json',
      bytes: 1073,
      sha256: 'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
    }),
    Object.freeze({
      name: 'node.exe',
      bytes: 93915464,
      sha256: 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5',
    }),
    Object.freeze({
      name: 'receiver.mjs',
      bytes: 2362470,
      sha256: '03d6c730119b941e20454e3f52ad9e920a08a6ef4473ac1e61d9c341ff559947',
    }),
  ])
  const decoderStart = uniqueSourceOffset(baseline.source, '# 只解碼自有child的一行UTF-8診斷')
  const decoderEnd = uniqueSourceOffset(baseline.source, '# 固定本機普通路徑與祖先檢查')
  const literalStart = uniqueSourceOffset(baseline.source, '# child literal逐字保留原來源尾LF')
  const literalEnd = uniqueSourceOffset(baseline.source, "\n'@\n") + 4
  const sourcesStart = uniqueSourceOffset(baseline.source, '  $loadSources = @(\n')
  const sourcesEnd = baseline.source.indexOf('\n  )\n', sourcesStart) + '\n  )\n'.length
  const launchStart = uniqueSourceOffset(
    baseline.source,
    "  $loadStage = 'source_pin'\n  $sha = [Security.Cryptography.SHA256]::Create()\n",
  )
  const launchEnd = uniqueSourceOffset(
    baseline.source,
    '  $info = [Diagnostics.ProcessStartInfo]::new()\n',
  )
  const parseStart = uniqueSourceOffset(
    baseline.source,
    "  $loadStage = 'child_parse'; $loadReason = 'unexpected_output'\n",
  )
  const parseEnd =
    parseStart +
    uniqueSourceOffset(
      baseline.source.slice(parseStart),
      '}\ncatch { Set-RdwebNativeFailure $loadDiagnostic $loadStage $loadReason }\n',
    )
  const outputStart =
    parseEnd +
    uniqueSourceOffset(
      baseline.source.slice(parseEnd),
      'try { [Console]::Write((Format-RdwebNativeDiagnostic (Complete-RdwebNativeDiagnostic $loadDiagnostic))) }\n',
    )
  const launchSource = String.raw`  $exe = Join-Path $loadPackage 'node.exe'
  $bundle = Join-Path $loadPackage 'receiver.mjs'
  [void](Assert-RdwebLoadPath $exe $false)
  [void](Assert-RdwebLoadPath $bundle $false)
  if ($bundle.IndexOf([char]34) -ge 0) { throw 'receiver_native_load_rejected' }
  $arguments = [string][char]34 + $bundle + [char]34 + ' --help'
  if ($exe.Length -gt 512 -or $bundle.Length -gt 512 -or $exe.Length + 3 + $arguments.Length -gt 32766) { throw 'receiver_native_load_rejected' }
`
  const environmentSource = String.raw`  $info.WorkingDirectory = $loadPackage
  $info.EnvironmentVariables.Clear()
  $info.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $info.EnvironmentVariables['WINDIR'] = $env:SystemRoot
  $info.EnvironmentVariables['TEMP'] = [IO.Path]::GetTempPath()
  $info.EnvironmentVariables['TMP'] = [IO.Path]::GetTempPath()
`
  const parseSource = String.raw`  $loadStage = 'child_parse'; $loadReason = 'unexpected_output'
  $frame = ([Text.UTF8Encoding]::new($false, $true)).GetString($loadOut, 0, $loadOutCount)
  Confirm-RdwebNativeEvidence $loadDiagnostic 'childExit' ($loadProcess.ExitCode -eq 0)
  if ($frame.Replace(([string][char]13 + [char]10), ([string][char]10)) -cne 'receiver_usage,run --directory <root>|--help' + [char]10 -or
      $loadProcess.ExitCode -ne 0) { throw 'receiver_native_load_rejected' }
  $loadHelpVerified = $true
`
  const ready = { ...unknownNativeProbeDiagnostic(), childPolicyRestore: 'not_acquired' }
  for (const name of bundleHelpEvidence) ready[name] = 'confirmed'
  const fallback = formatNativeProbeDiagnostic({
    ...unknownNativeProbeDiagnostic(),
    childPolicyRestore: 'not_acquired',
  })
  const outputSource = `# help-only結果獨立判定；Node未取得PS政策，不宣告generic complete。
try {
  $loadTerminal = Complete-RdwebNativeDiagnostic $loadDiagnostic
  $helpObserved = $loadHelpVerified -and -not $loadDiagnostic.Failed -and
    $loadTerminal['phase'] -ceq 'unknown' -and $loadTerminal['reason'] -ceq 'unknown' -and
    $loadTerminal['childPolicyRestore'] -ceq 'not_acquired'
  foreach ($name in @('childStart', 'childExit', 'parentPolicyVerify', 'resourcesClose')) {
    if ($loadTerminal[$name] -cne 'confirmed') { $helpObserved = $false }
  }
  [Console]::Write((Format-RdwebNativeDiagnostic $loadTerminal))
  if ($helpObserved) { [Console]::Write(${psLiteral(bundleHelpObservedLine.slice(0, -1))} + [char]10) }
  else { [Console]::Write(${psLiteral(bundleHelpUnavailableLine.slice(0, -1))} + [char]10) }
}
catch {
  [Console]::Write(${psLiteral(fallback.slice(0, -1))} + [char]10)
  [Console]::Write(${psLiteral(bundleHelpUnavailableLine.slice(0, -1))} + [char]10)
}
}
`
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.source.slice(decoderStart, decoderEnd), ''],
    [baseline.source.slice(literalStart, literalEnd), ''],
    [
      baseline.source.slice(sourcesStart, sourcesEnd),
      '  $loadSources = @(\n' +
        trustedSources
          .map(
            (item) =>
              `    @{ Name = ${psLiteral(item.name)}; Bytes = ${item.bytes}; Pin = ${psLiteral(item.sha256)} }`,
          )
          .join(',\n') +
        '\n  )\n',
    ],
    [
      "    if ($sourceItem.Name -ceq 'windows-host-observer-supervisor.ps1') { $loadStage = 'supervisor_pin' }\n",
      '',
    ],
    [
      '    if ($stream.Length -lt 1 -or $stream.Length -gt 1048576 -or\n        ($sourceItem.Bytes -ge 0 -and $stream.Length -ne $sourceItem.Bytes)) {\n',
      '    if ($stream.Length -ne $sourceItem.Bytes) {\n',
    ],
    [baseline.source.slice(launchStart, launchEnd), launchSource],
    [
      '  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true\n',
      '  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true\n' +
        environmentSource,
    ],
    [
      'Get-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'Get-Variable -Name ' + onceFlag,
    ],
    [
      'New-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'New-Variable -Name ' + onceFlag,
    ],
    [
      '$loadDiagnostic = New-RdwebNativeDiagnostic\n',
      "$loadDiagnostic = New-RdwebNativeDiagnostic\nSet-RdwebNativeNotAcquired $loadDiagnostic 'childPolicyRestore'\n$loadHelpVerified = $false\n",
    ],
    ['$loadChildClosed = $false; ', ''],
    ["  Start-RdwebNativeEvidence $loadDiagnostic 'childPolicyRestore'\n", ''],
    [baseline.source.slice(parseStart, parseEnd), parseSource],
    ["    Confirm-RdwebNativeEvidence $loadDiagnostic 'childPolicyRestore' $false\n", ''],
    ["@('childStart', 'childExit', 'childPolicyRestore')", "@('childStart', 'childExit')"],
    ['    if ($loadStarted -and -not $loadChildClosed) { $closed = $false }\n', ''],
    [baseline.source.slice(outputStart), outputSource],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  const expectedStdout = formatNativeProbeDiagnostic(ready) + bundleHelpObservedLine
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'observed', wire: expectedStdout }),
    Object.freeze({
      label: 'source_mismatch',
      wire:
        formatNativeProbeDiagnostic({
          ...ready,
          phase: 'source_pin',
          reason: 'source_mismatch',
          childStart: 'not_acquired',
          childExit: 'not_acquired',
        }) + bundleHelpUnavailableLine,
    }),
  ])
  // 只執行真JS解碼器檢查公開fixtures，不執行生成的PS或bundle。
  for (const fixture of wireFixtures) parseNativeProbeBundleHelpOutput(fixture.wire)
  return Object.freeze({
    purpose: 'receiver_native_bundle_help_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    nativeVerified: false,
    transport: 'interactive_ram_only',
    encodedCommandSupported: false,
    childSource: null,
    childSourceOffset: null,
    childExecutableName: 'node.exe',
    childCommandLineUtf16UnitsUpperBound: 512 + 3 + 512 + 2 + 7,
    adapterOffset: uniqueSourceOffset(
      source,
      createNativeProbePowerShellTypeFixedAdapterArtifact().source,
    ),
    adapterSha256: baseline.adapterSha256,
    packageRelativePath: baseline.packageRelativePath,
    onceFlag,
    trustedSources,
    allowedChildEnvironment: Object.freeze(['SystemRoot', 'WINDIR', 'TEMP', 'TMP']),
    stdoutMaxBytes: 1024,
    stderrMaxBytes: 128,
    normalBudgetMs: 18000,
    cleanupBudgetMs: 2000,
    totalBudgetMs: 20000,
    expectedChildStdout,
    expectedStdout,
    wireFixtures,
  })
}

// 專用交接只搬運既有Node-only parent；先驗RAM完整性，另段才允許一次呼叫。
export function createNativeProbePowerShellBundleHelpHandoffArtifact() {
  if (arguments.length !== 0) return unavailable()
  const parent = createNativeProbePowerShellBundleHelpArtifact()
  if (
    parent.utf8Bytes !== 20473 ||
    parent.utf16Units !== 19819 ||
    createHash('sha256').update(parent.source).digest('hex') !==
      'b8cce02eb09cda8d2d165c4ed9a25c4c8d54c8a0b6dd3e0b6aaf7b87522feaf5' ||
    parent.source.includes("\n'@") ||
    parent.source.includes('\r') ||
    parent.source.includes('\0') ||
    !parent.source.endsWith('\n')
  )
    return unavailable()
  const payloadVariable = 'RdwebReceiverBundleHelp20261026Payload'
  const integrityLine =
    'rdweb_bundle_help_handoff_integrity_v1,status=ok,bytes=20473,units=19819,sha256=' +
    parent.sha256
  const integrityErrorLine = 'rdweb_bundle_help_handoff_integrity_v1,status=error'
  const unavailableLine =
    'receiver_windows_bundle_help_handoff_unavailable,terminalUse=stop,sessionStarted=False'
  const stage1Source = `# bundle help交接第一段：只驗RAM來源，不呼叫parent或啟動程序。
# 先回報完整性行供代理比對；任何error先停手回報，不自行重貼。
& {
$ErrorActionPreference = 'Stop'
$rdwebHelpLiteral = @'
${parent.source}
'@
$rdwebHelpLf = [string][char]10
$rdwebHelpStatus = 'error'
try {
  # 只正規化CRLF；保留原parent尾LF，不補字元或忽略bare CR。
  $rdwebHelpText = $rdwebHelpLiteral.Replace(([string][char]13 + [char]10), $rdwebHelpLf)
  $rdwebHelpSha = [Security.Cryptography.SHA256]::Create()
  try {
    $rdwebHelpHash = ([BitConverter]::ToString($rdwebHelpSha.ComputeHash([Text.Encoding]::UTF8.GetBytes($rdwebHelpText)))).Replace('-', '').ToLowerInvariant()
  }
  finally { $rdwebHelpSha.Dispose() }
  if ($rdwebHelpText.IndexOf([char]13) -lt 0 -and
      $rdwebHelpText.IndexOf([char]0) -lt 0 -and
      $rdwebHelpText.EndsWith($rdwebHelpLf) -and
      [Text.Encoding]::UTF8.GetByteCount($rdwebHelpText) -eq ${parent.utf8Bytes} -and
      $rdwebHelpText.Length -eq ${parent.utf16Units} -and
      $rdwebHelpHash -ceq ${psLiteral(parent.sha256)}) {
    Set-Variable -Name ${payloadVariable} -Scope Global -Value $rdwebHelpText
    $rdwebHelpStatus = 'ok'
  }
}
catch { $rdwebHelpStatus = 'error' }
if ($rdwebHelpStatus -ceq 'ok') { [Console]::Write(${psLiteral(integrityLine)} + [char]10) }
else {
  # 只移除本候選RAM payload；不碰磁碟、其他旗標或既有產物。
  Remove-Variable -Name ${payloadVariable} -Scope Global -ErrorAction SilentlyContinue
  [Console]::Write(${psLiteral(integrityErrorLine)} + [char]10)
}
}
`
  const stage2Source = `# bundle help交接第二段：只在代理核對第一段ok後貼上一次。
# 重驗同session字串，不補成功行；唯一Invoke後只接受parent的完整雙行證據。
& {
$ErrorActionPreference = 'Stop'
$rdwebHelpLf = [string][char]10
try {
  $rdwebHelpValue = Get-Variable -Name ${payloadVariable} -Scope Global -ErrorAction SilentlyContinue
  if ($null -eq $rdwebHelpValue -or $rdwebHelpValue.Value -isnot [string]) { throw 'receiver_native_handoff_rejected' }
  $rdwebHelpText = $rdwebHelpValue.Value
  $rdwebHelpSha = [Security.Cryptography.SHA256]::Create()
  try {
    $rdwebHelpHash = ([BitConverter]::ToString($rdwebHelpSha.ComputeHash([Text.Encoding]::UTF8.GetBytes($rdwebHelpText)))).Replace('-', '').ToLowerInvariant()
  }
  finally { $rdwebHelpSha.Dispose() }
  if ($rdwebHelpText.IndexOf([char]13) -ge 0 -or
      $rdwebHelpText.IndexOf([char]0) -ge 0 -or
      -not $rdwebHelpText.EndsWith($rdwebHelpLf) -or
      [Text.Encoding]::UTF8.GetByteCount($rdwebHelpText) -ne ${parent.utf8Bytes} -or
      $rdwebHelpText.Length -ne ${parent.utf16Units} -or
      $rdwebHelpHash -cne ${psLiteral(parent.sha256)}) { throw 'receiver_native_handoff_rejected' }
  [void]([ScriptBlock]::Create($rdwebHelpText).Invoke())
}
catch { [Console]::Write(${psLiteral(unavailableLine)} + [char]10) }
}
`
  return Object.freeze({
    purpose: 'receiver_native_bundle_help_handoff_v1',
    nativeVerified: false,
    transport: 'interactive_ram_only',
    encodedCommandSupported: false,
    parentUtf8Bytes: parent.utf8Bytes,
    parentUtf16Units: parent.utf16Units,
    parentSha256: parent.sha256,
    payloadVariable,
    integrityLine,
    integrityErrorLine,
    unavailableLine,
    stage1Source,
    stage1Utf8Bytes: Buffer.byteLength(stage1Source),
    stage1Utf16Units: stage1Source.length,
    stage1Sha256: createHash('sha256').update(stage1Source).digest('hex'),
    stage2Source,
    stage2Utf8Bytes: Buffer.byteLength(stage2Source),
    stage2Utf16Units: stage2Source.length,
    stage2Sha256: createHash('sha256').update(stage2Source).digest('hex'),
  })
}

const stdoutExitObservedLine =
  'receiver_windows_stdout_exit_probe_observed,stdoutExitMixed=True,sessionStarted=False\n'
const stdoutExitUnavailableLine =
  'receiver_windows_stdout_exit_probe_unavailable,terminalUse=stop,sessionStarted=False\n'

// 完整診斷只證明替身案例觀察到混流；不把缺陷observed誤報成產品入口成功。
export function parseNativeProbeStdoutExitOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1280) return unavailable()
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 3 || lines[2] !== '') return unavailable()
  const diagnostic = parseNativeProbeDiagnostic(lines[0] + '\n')
  if (formatNativeProbeDiagnostic(diagnostic) !== lines[0] + '\n') return unavailable()
  const observed = diagnostic.phase === 'complete' && diagnostic.reason === 'none'
  if (lines[1] + '\n' !== (observed ? stdoutExitObservedLine : stdoutExitUnavailableLine))
    return unavailable()
  return Object.freeze({ status: observed ? 'defect_observed' : 'unavailable', diagnostic })
}

// 只生成原函數的公開cmdlet管線診斷，保留既有PS child監督；不執行原生或修正式入口。
export function createNativeProbePowerShellStdoutExitArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellLoadOnlySupervisorArtifact()
  if (
    createHash('sha256').update(baseline.source).digest('hex') !==
    'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e'
  )
    return unavailable()
  const caseSource = String.raw`  # 只在child設定公開合成exit；內建cmdlet不啟程序，這不是OS退出碼驗證。
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
  const insert = uniqueSourceOffset(baseline.childSource, '  $loadLoaded = $true\n')
  const childSource =
    baseline.childSource.slice(0, insert) + caseSource + baseline.childSource.slice(insert)
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const onceFlag = 'RdwebReceiverStdoutExit20261026Once'
  const progressPreamble = "$ProgressPreference = 'SilentlyContinue'; "
  const oldBase64 = Buffer.from(baseline.childSource, 'utf16le').toString('base64')
  if (!baseline.childArguments.endsWith(oldBase64)) return unavailable()
  const childArguments =
    baseline.childArguments.slice(0, -oldBase64.length) +
    Buffer.from(progressPreamble + childSource, 'utf16le').toString('base64')
  const childCommandLineUtf16UnitsUpperBound =
    baseline.maxExecutableUtf16Units + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > baseline.commandLineLimit) return unavailable()
  const footerStart = baseline.source.lastIndexOf(
    'try { [Console]::Write((Format-RdwebNativeDiagnostic',
  )
  if (footerStart < baseline.childSourceOffset + baseline.childSource.length) return unavailable()
  const footerSource = `# stdout-exit結果只代表診斷完成且觀察到混流，不代表產品入口正確。
try {
  $loadTerminal = Complete-RdwebNativeDiagnostic $loadDiagnostic
  [Console]::Write((Format-RdwebNativeDiagnostic $loadTerminal))
  if ($loadTerminal['phase'] -ceq 'complete' -and $loadTerminal['reason'] -ceq 'none') {
    [Console]::Write(${psLiteral(stdoutExitObservedLine.slice(0, -1))} + [char]10)
  }
  else { [Console]::Write(${psLiteral(stdoutExitUnavailableLine.slice(0, -1))} + [char]10) }
}
catch {
  [Console]::Write(${psLiteral(formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()).slice(0, -1))} + [char]10)
  [Console]::Write(${psLiteral(stdoutExitUnavailableLine.slice(0, -1))} + [char]10)
}
}
`
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    [
      'Get-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'Get-Variable -Name ' + onceFlag,
    ],
    [
      'New-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'New-Variable -Name ' + onceFlag,
    ],
    [
      '[Text.Encoding]::Unicode.GetBytes($loadChildSource)',
      "[Text.Encoding]::Unicode.GetBytes('$ProgressPreference = ''SilentlyContinue''; ' + $loadChildSource)",
    ],
    [baseline.source.slice(footerStart), footerSource],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  const expectedStdout = baseline.expectedStdout + stdoutExitObservedLine
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'defect_observed', wire: expectedStdout }),
    Object.freeze({
      label: 'case_unavailable',
      wire:
        formatNativeProbeDiagnostic({
          ...unknownNativeProbeDiagnostic(),
          phase: 'child_parse',
          reason: 'unexpected_output',
        }) + stdoutExitUnavailableLine,
    }),
  ])
  // 真JS parser只驗公開wire fixture，不執行所生成的PS或模擬原生exit。
  for (const fixture of wireFixtures) parseNativeProbeStdoutExitOutput(fixture.wire)
  const adapter = createNativeProbePowerShellTypeFixedAdapterArtifact()
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_stdout_exit_probe_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    adapterOffset: source.indexOf(adapter.source),
    childAdapterOffset: uniqueSourceOffset(childSource, adapter.source),
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    onceFlag,
    caseSourceOffset: uniqueSourceOffset(childSource, caseSource),
    caseSourceUnits: caseSource.length,
    nativeVerified: false,
    productEntryVerified: false,
    nativeExecutableVerified: false,
    expectedStdout,
    wireFixtures,
  })
}

// 沿已驗兩literal交接語意搬運固定aj parent；舊API／來源不變，第二段不補returned。
export function createNativeProbePowerShellStdoutExitHandoffArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellHandoffArtifact()
  const oldParent = createNativeProbePowerShellLoadOnlyOutputProbeArtifact()
  const parent = createNativeProbePowerShellStdoutExitArtifact()
  if (
    baseline.stage1Sha256 !== 'ac86248ddccb37b3f9979a3e1900e9a59cdb56ba2d3b26fe5410af475ba14d5b' ||
    baseline.stage2Sha256 !== '8b3bda5b8aa2fbe672e04bdc91794dfe0f1a46d4cdd52f73ade6a3953169e845' ||
    createHash('sha256').update(parent.source).digest('hex') !==
      '9d7f19e9d05132f3ee6f9dd6a7b25954432aea38965b93203743c017e6447416' ||
    parent.utf8Bytes !== 35386 ||
    parent.utf16Units !== 34000
  )
    return unavailable()
  const separator = "\n'@\n"
  const oldSplit = uniqueSourceOffset(oldParent.source, separator)
  const split = uniqueSourceOffset(parent.source, separator)
  const oldA = oldParent.source.slice(0, oldSplit)
  const oldB = oldParent.source.slice(oldSplit + separator.length)
  const partA = parent.source.slice(0, split)
  const partB = parent.source.slice(split + separator.length)
  if (!partA.endsWith('\n') || !partB.endsWith('\n')) return unavailable()
  const payloadVariable = 'RdwebReceiverStdoutExit20261026Payload'
  const integrityPrefix = 'rdweb_stdout_exit_handoff_integrity_v1,'
  const integrityLine =
    integrityPrefix + 'status=ok,bytes=35386,units=34000,sha256=' + parent.sha256
  const integrityErrorLine = integrityPrefix + 'status=error'
  const unavailableLine =
    'receiver_windows_stdout_exit_handoff_unavailable,terminalUse=stop,sessionStarted=False'
  const stages = [
    {
      source: baseline.stage1Source,
      changes: [
        [oldA, partA],
        [oldB, partB],
        ['Set-Variable -Name ' + baseline.payloadVariable, 'Set-Variable -Name ' + payloadVariable],
        [
          'Remove-Variable -Name ' + baseline.payloadVariable,
          'Remove-Variable -Name ' + payloadVariable,
        ],
        [baseline.integrityLine, integrityLine],
        [baseline.integrityErrorLine, integrityErrorLine],
        [
          'GetByteCount($rdwebHandoffPayload) -eq ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffPayload) -eq 35386',
        ],
        [
          '$rdwebHandoffPayload.Length -eq ' + baseline.parentUtf16Units,
          '$rdwebHandoffPayload.Length -eq 34000',
        ],
        [
          "$rdwebHandoffHash -ceq '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -ceq '" + parent.sha256 + "'",
        ],
        [
          "& {\n$rdwebHandoffPartA = @'\n",
          "& {\n$ErrorActionPreference = 'Stop'\n$rdwebHandoffPartA = @'\n",
        ],
        [
          '任何 error 都先停手回報，是否同視窗重貼由代理判斷。',
          '任何 error 都先停手回報，不自行重貼。',
        ],
      ],
    },
    {
      source: baseline.stage2Source,
      changes: [
        [baseline.payloadVariable, payloadVariable],
        [baseline.unavailableLine, unavailableLine],
        [
          'GetByteCount($rdwebHandoffText) -ne ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffText) -ne 35386',
        ],
        [
          '$rdwebHandoffText.Length -ne ' + baseline.parentUtf16Units,
          '$rdwebHandoffText.Length -ne 34000',
        ],
        [
          "$rdwebHandoffHash -cne '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -cne '" + parent.sha256 + "'",
        ],
        [
          'if ($null -eq $rdwebHandoffValue)',
          'if ($null -eq $rdwebHandoffValue -or $rdwebHandoffValue.Value -isnot [string])',
        ],
        [
          '$rdwebHandoffText = [string]$rdwebHandoffValue.Value',
          '$rdwebHandoffText = $rdwebHandoffValue.Value',
        ],
        ['  [Console]::Write(' + psLiteral(baseline.returnedLine) + ' + [char]10)\n', ''],
      ],
    },
  ]
  for (const stage of stages) {
    for (const [original, replacement] of stage.changes) {
      const offset = uniqueSourceOffset(stage.source, original)
      stage.source =
        stage.source.slice(0, offset) + replacement + stage.source.slice(offset + original.length)
    }
  }
  const stage1Source = stages[0].source
  const stage2Source = stages[1].source
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_stdout_exit_handoff_v1',
    nativeVerified: false,
    parentUtf8Bytes: parent.utf8Bytes,
    parentUtf16Units: parent.utf16Units,
    parentSha256: parent.sha256,
    partAUtf8Bytes: Buffer.byteLength(partA),
    partAUtf16Units: partA.length,
    partASha256: createHash('sha256').update(partA).digest('hex'),
    partBUtf8Bytes: Buffer.byteLength(partB),
    partBUtf16Units: partB.length,
    partBSha256: createHash('sha256').update(partB).digest('hex'),
    payloadVariable,
    integrityPrefix,
    integrityLine,
    integrityErrorLine,
    unavailableLine,
    returnedLine: null,
    stage1Source,
    stage1Utf8Bytes: Buffer.byteLength(stage1Source),
    stage1Utf16Units: stage1Source.length,
    stage1Sha256: createHash('sha256').update(stage1Source).digest('hex'),
    stage2Source,
    stage2Utf8Bytes: Buffer.byteLength(stage2Source),
    stage2Utf16Units: stage2Source.length,
    stage2Sha256: createHash('sha256').update(stage2Source).digest('hex'),
  })
}

const exitChannelRefTestLine =
  'receiver_exit_channel_cases_observed,syntheticExit=True,nativeExecutable=False\n'
const exitChannelRefObservedLine =
  'receiver_windows_exit_channel_ref_observed,syntheticExit=True,nativeExecutable=False,sessionStarted=False\n'
const exitChannelRefUnavailableLine =
  'receiver_windows_exit_channel_ref_unavailable,terminalUse=stop,sessionStarted=False\n'

// 只接受完整有序的公開回歸marker與原child診斷，禁止轉型或以exit0補足證據。
export function parseNativeProbeExitChannelRefChildOutput(stdout, stderr, exitCode) {
  if (
    typeof stdout !== 'string' ||
    Buffer.byteLength(stdout) > 1024 ||
    stderr !== '' ||
    !Number.isInteger(exitCode) ||
    exitCode !== 0
  )
    return unavailable()
  const baseline = createNativeProbePowerShellLoadOnlySupervisorArtifact()
  if (stdout.replaceAll('\r\n', '\n') !== exitChannelRefTestLine + baseline.expectedChildStdout)
    return unavailable()
  return parseNativeProbeDiagnostic(baseline.expectedChildStdout)
}

// 僅分類本候選的合成案例結果；完整診斷與結果marker必須彼此一致。
export function parseNativeProbeExitChannelRefOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1280) return unavailable()
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 3 || lines[2] !== '') return unavailable()
  const diagnostic = parseNativeProbeDiagnostic(lines[0] + '\n')
  if (formatNativeProbeDiagnostic(diagnostic) !== lines[0] + '\n') return unavailable()
  const observed = diagnostic.phase === 'complete' && diagnostic.reason === 'none'
  if (lines[1] + '\n' !== (observed ? exitChannelRefObservedLine : exitChannelRefUnavailableLine))
    return unavailable()
  return Object.freeze({ status: observed ? 'ref_cases_observed' : 'unavailable', diagnostic })
}

// 從固定load-only基底窄改來源與實檔回歸，完整保留政策、期限及owned程序收尾。
export function createNativeProbePowerShellExitChannelRefArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellLoadOnlySupervisorArtifact()
  if (baseline.sha256 !== 'e706dd060f1bc700c9b5edc18d44368e250841f169db2f0ca7f0e8b3e8bfd46e')
    return unavailable()
  const packageRelativePath = 'rdweb exit channel validation 公開 20261026-01'
  const onceFlag = 'RdwebReceiverExitChannelRef20261026Once'
  const trustedSources = Object.freeze([
    Object.freeze({
      name: 'integrity.json',
      bytes: 630,
      sha256: '0ca5642c14ac4c3f7ea2be50398868174f964236decf899d0fee312e7f39d668',
    }),
    Object.freeze({
      name: 'start-windows-test-receiver.ps1',
      bytes: 7637,
      sha256: '8d07ea5ac6b2b364bca0389b76aa5b0929c25d36a6b7ebcbd8fcd8e43510c392',
    }),
    Object.freeze({
      name: 'test-receiver-exit-channel.ps1',
      bytes: 3786,
      sha256: '792cd4b4d1927b601f171a9c228d1320961095c1d1dba6f597a166991ddf4148',
    }),
    Object.freeze({
      name: 'windows-host-observer-supervisor.ps1',
      bytes: 9816,
      sha256: '51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2',
    }),
    Object.freeze({
      name: 'LICENSE',
      bytes: 34523,
      sha256: '8486a10c4393cee1c25392769ddd3b2d6c242d6ec7928e1414efff7dfb2f07ef',
    }),
  ])
  const runSource = String.raw`  $loadStage = 'child_parse'; $loadReason = 'unexpected_output'
  $LASTEXITCODE = 2
  & (Join-Path $loadPackage 'test-receiver-exit-channel.ps1')
  $loadTestExit = $LASTEXITCODE
  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 0) { throw 'receiver_native_load_rejected' }
`
  let childSource = baseline.childSource
  for (const [original, replacement] of [
    [baseline.packageRelativePath, packageRelativePath],
    [
      "@('start-windows-test-receiver.ps1', 'windows-host-observer-supervisor.ps1')",
      "@('start-windows-test-receiver.ps1', 'windows-host-observer-supervisor.ps1', 'test-receiver-exit-channel.ps1')",
    ],
    ["  . (Join-Path $loadPackage 'start-windows-test-receiver.ps1')\n", runSource],
  ]) {
    const offset = uniqueSourceOffset(childSource, original)
    childSource =
      childSource.slice(0, offset) + replacement + childSource.slice(offset + original.length)
  }
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const oldBase64 = Buffer.from(baseline.childSource, 'utf16le').toString('base64')
  if (!baseline.childArguments.endsWith(oldBase64)) return unavailable()
  const childArguments =
    baseline.childArguments.slice(0, -oldBase64.length) +
    Buffer.from("$ProgressPreference = 'SilentlyContinue'; " + childSource, 'utf16le').toString(
      'base64',
    )
  const childCommandLineUtf16UnitsUpperBound =
    baseline.maxExecutableUtf16Units + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > baseline.commandLineLimit) return unavailable()
  const expectedChildStdout = exitChannelRefTestLine + baseline.expectedChildStdout
  const frameSource = String.raw`  $refWire = $frame.Replace(([string][char]13 + [char]10), ([string][char]10))
  $refPrefix = 'receiver_exit_channel_cases_observed,syntheticExit=True,nativeExecutable=False' + [char]10
  if (-not $refWire.StartsWith($refPrefix, [StringComparison]::Ordinal)) { throw 'receiver_native_load_rejected' }
  $child = ConvertFrom-RdwebLoadFrame ($refWire.Substring($refPrefix.Length))
`
  const listStart = uniqueSourceOffset(baseline.source, '  $loadSources = @(\n')
  const listEnd = baseline.source.indexOf('\n  )\n', listStart) + 5
  if (listEnd <= listStart) return unavailable()
  const footerStart = baseline.source.lastIndexOf(
    'try { [Console]::Write((Format-RdwebNativeDiagnostic',
  )
  if (footerStart < baseline.childSourceOffset + baseline.childSource.length) return unavailable()
  const footerSource = `# ref回歸結果只代表固定合成案例，不代表產品入口或OS輸入正確。
try {
  $loadTerminal = Complete-RdwebNativeDiagnostic $loadDiagnostic
  [Console]::Write((Format-RdwebNativeDiagnostic $loadTerminal))
  if ($loadTerminal['phase'] -ceq 'complete' -and $loadTerminal['reason'] -ceq 'none') {
    [Console]::Write(${psLiteral(exitChannelRefObservedLine.slice(0, -1))} + [char]10)
  }
  else { [Console]::Write(${psLiteral(exitChannelRefUnavailableLine.slice(0, -1))} + [char]10) }
}
catch {
  [Console]::Write(${psLiteral(formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()).slice(0, -1))} + [char]10)
  [Console]::Write(${psLiteral(exitChannelRefUnavailableLine.slice(0, -1))} + [char]10)
}
}
`
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.packageRelativePath, packageRelativePath],
    [baseline.childSha256, childSha256],
    [
      baseline.source.slice(listStart, listEnd),
      '  $loadSources = @(\n' +
        trustedSources
          .map(
            (item) =>
              `    @{ Name = ${psLiteral(item.name)}; Bytes = ${item.bytes}; Pin = ${psLiteral(item.sha256)} }`,
          )
          .join(',\n') +
        '\n  )\n',
    ],
    [
      'Get-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'Get-Variable -Name ' + onceFlag,
    ],
    [
      'New-Variable -Name RdwebReceiverLoadOnlyDiagnostic20261025Once',
      'New-Variable -Name ' + onceFlag,
    ],
    ['  $child = ConvertFrom-RdwebLoadFrame $frame\n', frameSource],
    [
      psLiteral(baseline.expectedChildStdout.slice(0, -1)) + ' + [char]10',
      psLiteral(expectedChildStdout.slice(0, -1)) + ' + [char]10',
    ],
    [
      '[Text.Encoding]::Unicode.GetBytes($loadChildSource)',
      "[Text.Encoding]::Unicode.GetBytes('$ProgressPreference = ''SilentlyContinue''; ' + $loadChildSource)",
    ],
    [baseline.source.slice(footerStart), footerSource],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  const expectedStdout = baseline.expectedStdout + exitChannelRefObservedLine
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'ref_cases_observed', wire: expectedStdout }),
    Object.freeze({
      label: 'unavailable',
      wire:
        formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()) + exitChannelRefUnavailableLine,
    }),
  ])
  for (const fixture of wireFixtures) parseNativeProbeExitChannelRefOutput(fixture.wire)
  parseNativeProbeExitChannelRefChildOutput(expectedChildStdout, '', 0)
  const adapter = createNativeProbePowerShellTypeFixedAdapterArtifact()
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_exit_channel_ref_v1',
    baselineSha256: baseline.sha256,
    packageRelativePath,
    onceFlag,
    trustedSources,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    adapterOffset: source.indexOf(adapter.source),
    childAdapterOffset: uniqueSourceOffset(childSource, adapter.source),
    nativeVerified: false,
    productEntryVerified: false,
    nativeExecutableVerified: false,
    expectedChildStdout,
    expectedStdout,
    wireFixtures,
  })
}

// 沿typed兩literal交接模板重建本候選；第一段只存RAM，第二段真核對後唯一Invoke。
export function createNativeProbePowerShellExitChannelRefHandoffArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellStdoutExitHandoffArtifact()
  if (
    baseline.stage1Sha256 !== '4fda1ba314a01ec459a91c90fed385aad884d6516af408b43c18c182e15d97c1' ||
    baseline.stage2Sha256 !== '85ab7549f3d19b6dd91ac8a0a4163f67d71abf9e03d9f9f4af75c356683dd437'
  )
    return unavailable()
  const oldParent = createNativeProbePowerShellStdoutExitArtifact()
  const parent = createNativeProbePowerShellExitChannelRefArtifact()
  const separator = "\n'@\n"
  const oldSplit = uniqueSourceOffset(oldParent.source, separator)
  const split = uniqueSourceOffset(parent.source, separator)
  const partA = parent.source.slice(0, split)
  const partB = parent.source.slice(split + separator.length)
  if (!partA.endsWith('\n') || !partB.endsWith('\n')) return unavailable()
  const payloadVariable = 'RdwebReceiverExitChannelRef20261026Payload'
  const integrityPrefix = 'rdweb_exit_channel_ref_handoff_integrity_v1,'
  const integrityLine =
    integrityPrefix +
    `status=ok,bytes=${parent.utf8Bytes},units=${parent.utf16Units},sha256=${parent.sha256}`
  const integrityErrorLine = integrityPrefix + 'status=error'
  const unavailableLine =
    'receiver_windows_exit_channel_ref_handoff_unavailable,terminalUse=stop,sessionStarted=False'
  const stages = [
    {
      source: baseline.stage1Source,
      changes: [
        [oldParent.source.slice(0, oldSplit), partA],
        [oldParent.source.slice(oldSplit + separator.length), partB],
        ['Set-Variable -Name ' + baseline.payloadVariable, 'Set-Variable -Name ' + payloadVariable],
        [
          'Remove-Variable -Name ' + baseline.payloadVariable,
          'Remove-Variable -Name ' + payloadVariable,
        ],
        [baseline.integrityLine, integrityLine],
        [baseline.integrityErrorLine, integrityErrorLine],
        [
          'GetByteCount($rdwebHandoffPayload) -eq ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffPayload) -eq ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffPayload.Length -eq ' + baseline.parentUtf16Units,
          '$rdwebHandoffPayload.Length -eq ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -ceq '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -ceq '" + parent.sha256 + "'",
        ],
      ],
    },
    {
      source: baseline.stage2Source,
      changes: [
        [baseline.payloadVariable, payloadVariable],
        [baseline.unavailableLine, unavailableLine],
        [
          'GetByteCount($rdwebHandoffText) -ne ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffText) -ne ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffText.Length -ne ' + baseline.parentUtf16Units,
          '$rdwebHandoffText.Length -ne ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -cne '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -cne '" + parent.sha256 + "'",
        ],
      ],
    },
  ]
  for (const stage of stages) {
    for (const [original, replacement] of stage.changes) {
      const offset = uniqueSourceOffset(stage.source, original)
      stage.source =
        stage.source.slice(0, offset) + replacement + stage.source.slice(offset + original.length)
    }
  }
  const stage1Source = stages[0].source
  const stage2Source = stages[1].source
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_exit_channel_ref_handoff_v1',
    nativeVerified: false,
    parentUtf8Bytes: parent.utf8Bytes,
    parentUtf16Units: parent.utf16Units,
    parentSha256: parent.sha256,
    partAUtf8Bytes: Buffer.byteLength(partA),
    partAUtf16Units: partA.length,
    partASha256: createHash('sha256').update(partA).digest('hex'),
    partBUtf8Bytes: Buffer.byteLength(partB),
    partBUtf16Units: partB.length,
    partBSha256: createHash('sha256').update(partB).digest('hex'),
    payloadVariable,
    integrityPrefix,
    integrityLine,
    integrityErrorLine,
    unavailableLine,
    stage1Source,
    stage1Utf8Bytes: Buffer.byteLength(stage1Source),
    stage1Utf16Units: stage1Source.length,
    stage1Sha256: createHash('sha256').update(stage1Source).digest('hex'),
    stage2Source,
    stage2Utf8Bytes: Buffer.byteLength(stage2Source),
    stage2Utf16Units: stage2Source.length,
    stage2Sha256: createHash('sha256').update(stage2Source).digest('hex'),
  })
}

const exitScopeAbsentLine = 'receiver_exit_scope_v1,unavailable\n'
const exitScopeUnavailableLine =
  'receiver_windows_exit_scope_unavailable,terminalUse=stop,sessionStarted=False\n'
const exitScopePassedLine =
  'receiver_windows_exit_scope_observed,regression=passed,sessionStarted=False\n'
const exitScopeFailedLine =
  'receiver_windows_exit_scope_observed,regression=unavailable,sessionStarted=False\n'
const exitScopeChildFailure = formatNativeProbeDiagnostic({
  ...unknownNativeProbeDiagnostic(),
  phase: 'child_parse',
  reason: 'unexpected_output',
  childPolicyRestore: 'confirmed',
  resourcesClose: 'confirmed',
})
const exitScopeParentFailure = formatNativeProbeDiagnostic({
  ...unknownNativeProbeDiagnostic(),
  phase: 'child_parse',
  reason: 'unexpected_output',
  childStart: 'confirmed',
  childExit: 'unconfirmed',
  childPolicyRestore: 'confirmed',
  parentPolicyVerify: 'confirmed',
  resourcesClose: 'confirmed',
})

// 只解碼內部已驗string中的有限分類，未知內容不回傳或轉型。
function decodeExitScopeLine(line) {
  const match =
    /^receiver_exit_scope_v1,beforeGlobal=(missing|int0|int2|other_int|non_int),afterGlobal=(missing|int0|int2|other_int|non_int),local=(int0|int2|other_int|non_int)\n$/.exec(
      line,
    )
  if (!match) return unavailable()
  return Object.freeze({ beforeGlobal: match[1], afterGlobal: match[2], local: match[3] })
}

// 觀察完整scope frame仍保留原int0門檻；其他Local分類只能對應原失敗診斷及exit2。
export function parseNativeProbeExitScopeChildOutput(stdout, stderr, exitCode) {
  if (
    typeof stdout !== 'string' ||
    Buffer.byteLength(stdout) > 1024 ||
    stderr !== '' ||
    !Number.isInteger(exitCode)
  )
    return unavailable()
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 4 || lines[3] !== '' || lines[0] + '\n' !== exitChannelRefTestLine)
    return unavailable()
  const scope = decodeExitScopeLine(lines[1] + '\n')
  const zero = scope.local === 'int0'
  const expected = zero
    ? createNativeProbePowerShellLoadOnlySupervisorArtifact().expectedChildStdout
    : exitScopeChildFailure
  if (lines[2] + '\n' !== expected || exitCode !== (zero ? 0 : 2)) return unavailable()
  return Object.freeze({
    scope,
    regressionStatus: zero ? 'passed' : 'unavailable',
    diagnostic: parseNativeProbeDiagnostic(expected),
  })
}

// scope觀察完整與原回歸成功分開分類，缺少收尾證據不能因Global為0而補成功。
export function parseNativeProbeExitScopeOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1280) return unavailable()
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 4 || lines[3] !== '') return unavailable()
  const diagnostic = parseNativeProbeDiagnostic(lines[0] + '\n')
  if (formatNativeProbeDiagnostic(diagnostic) !== lines[0] + '\n') return unavailable()
  if (lines[1] + '\n' === exitScopeAbsentLine) {
    if (diagnostic.phase === 'complete' || lines[2] + '\n' !== exitScopeUnavailableLine)
      return unavailable()
    return Object.freeze({
      status: 'unavailable',
      regressionStatus: 'unavailable',
      scope: null,
      diagnostic,
    })
  }
  const scope = decodeExitScopeLine(lines[1] + '\n')
  const zero = scope.local === 'int0'
  const expected = zero
    ? createNativeProbePowerShellLoadOnlySupervisorArtifact().expectedStdout
    : exitScopeParentFailure
  if (
    lines[0] + '\n' !== expected ||
    lines[2] + '\n' !== (zero ? exitScopePassedLine : exitScopeFailedLine)
  )
    return unavailable()
  return Object.freeze({
    status: 'scope_observed',
    regressionStatus: zero ? 'passed' : 'unavailable',
    scope,
    diagnostic,
  })
}

// 僅增加三個scope分類快照，原Local seed、實檔call、立即保存與int0門檻逐字保留。
export function createNativeProbePowerShellExitScopeArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellExitChannelRefArtifact()
  if (baseline.sha256 !== '0911e6b5e28affe18a1814bd08aead2e7e3343660c02e0984e61a413ef11249b')
    return unavailable()
  const scopeHelperSource = String.raw`# 只分類已取得的變數；不轉型未知值、不在函數內讀caller Local。
function Get-RdwebExitClass($v) {
  if ($null -eq $v) { return 'missing' }
  $x = $v.Value
  if ($x -isnot [int]) { return 'non_int' }
  if ($x -eq 0) { return 'int0' }
  if ($x -eq 2) { return 'int2' }
  return 'other_int'
}
`
  const beforeScopeSource = String.raw`  $sg0 = Get-RdwebExitClass (Microsoft.PowerShell.Utility\Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction Ignore)
`
  const afterScopeSource = String.raw`  $sg1 = Get-RdwebExitClass (Microsoft.PowerShell.Utility\Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction Ignore)
  $sl = Get-RdwebExitClass (Microsoft.PowerShell.Utility\Get-Variable -Name loadTestExit -Scope Local -ErrorAction Stop)
  [Console]::Write('receiver_exit_scope_v1,beforeGlobal=' + $sg0 + ',afterGlobal=' + $sg1 + ',local=' + $sl + [char]10)
`
  let childSource = baseline.childSource
  for (const [original, replacement] of [
    [
      '# child只確認自己的政策與身份物件；不宣告parent政策或自己已退出。',
      scopeHelperSource + '# child只確認自己的政策與身份物件；不宣告parent政策或自己已退出。',
    ],
    ['  $LASTEXITCODE = 2\n', '  $LASTEXITCODE = 2\n' + beforeScopeSource],
    ['  $loadTestExit = $LASTEXITCODE\n', '  $loadTestExit = $LASTEXITCODE\n' + afterScopeSource],
  ]) {
    const offset = uniqueSourceOffset(childSource, original)
    childSource =
      childSource.slice(0, offset) + replacement + childSource.slice(offset + original.length)
  }
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  const childArguments =
    prefix +
    Buffer.from("$ProgressPreference = 'SilentlyContinue'; " + childSource, 'utf16le').toString(
      'base64',
    )
  const childCommandLineUtf16UnitsUpperBound =
    baseline.maxExecutableUtf16Units + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > baseline.commandLineLimit) return unavailable()
  const scopeInitSource = '$scopeWire = $null\n'
  const scopePattern =
    '\\Areceiver_exit_scope_v1,beforeGlobal=(missing|int0|int2|other_int|non_int),afterGlobal=(missing|int0|int2|other_int|non_int),local=(int0|int2|other_int|non_int)\\z'
  const readyChild = createNativeProbePowerShellLoadOnlySupervisorArtifact().expectedChildStdout
  const scopeFrameSource = String.raw`  $refWire = $frame.Replace(([string][char]13 + [char]10), ([string][char]10))
  $refPrefix = 'receiver_exit_channel_cases_observed,syntheticExit=True,nativeExecutable=False' + [char]10
  if (-not $refWire.StartsWith($refPrefix, [StringComparison]::Ordinal)) { throw 'receiver_native_load_rejected' }
  $scopeParts = $refWire.Substring($refPrefix.Length).Split([char]10)
  if ($scopeParts.Length -ne 3 -or $scopeParts[2] -cne '') { throw 'receiver_native_load_rejected' }
  $scopeMatch = [regex]::Match($scopeParts[0], ${psLiteral(scopePattern)})
  if (-not $scopeMatch.Success) { throw 'receiver_native_load_rejected' }
  $scopeZero = $scopeMatch.Groups[3].Value -ceq 'int0'
  $scopeExpected = ${psLiteral(exitScopeChildFailure.slice(0, -1))}
  $scopeExit = 2
  if ($scopeZero) { $scopeExpected = ${psLiteral(readyChild.slice(0, -1))}; $scopeExit = 0 }
  if ($scopeParts[1] -cne $scopeExpected -or $loadProcess.ExitCode -ne $scopeExit) { throw 'receiver_native_load_rejected' }
  $refCanonicalWire = $refPrefix + $scopeParts[1] + [char]10
  $child = ConvertFrom-RdwebLoadFrame ($scopeParts[1] + [char]10)
  $scopeWire = $scopeParts[0] + [char]10
`
  const frameStart = uniqueSourceOffset(baseline.source, '  $refWire =')
  const frameEnd = uniqueSourceOffset(baseline.source, "  if ($child['childStart']")
  const footerStart = uniqueSourceOffset(baseline.source, '# ref回歸結果只代表')
  const footer = `# scope結果只代表觀察完整；Global為0不能替原Local門檻補成功。
try {
  $loadTerminal = Complete-RdwebNativeDiagnostic $loadDiagnostic
  $scopeDiagnostic = Format-RdwebNativeDiagnostic $loadTerminal
  [Console]::Write($scopeDiagnostic)
  $scopeComplete = $null -ne $scopeWire -and
    (($scopeZero -and $scopeDiagnostic -ceq ${psLiteral(baseline.expectedStdout.slice(0, -exitChannelRefObservedLine.length - 1))} + [char]10) -or
     (-not $scopeZero -and $scopeDiagnostic -ceq ${psLiteral(exitScopeParentFailure.slice(0, -1))} + [char]10))
  if ($scopeComplete) {
    [Console]::Write($scopeWire)
    if ($scopeZero) { [Console]::Write(${psLiteral(exitScopePassedLine.slice(0, -1))} + [char]10) }
    else { [Console]::Write(${psLiteral(exitScopeFailedLine.slice(0, -1))} + [char]10) }
  }
  else {
    [Console]::Write(${psLiteral(exitScopeAbsentLine.slice(0, -1))} + [char]10)
    [Console]::Write(${psLiteral(exitScopeUnavailableLine.slice(0, -1))} + [char]10)
  }
}
catch {
  [Console]::Write(${psLiteral(formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()).slice(0, -1))} + [char]10)
  [Console]::Write(${psLiteral(exitScopeAbsentLine.slice(0, -1))} + [char]10)
  [Console]::Write(${psLiteral(exitScopeUnavailableLine.slice(0, -1))} + [char]10)
}
}
`
  const onceFlag = 'RdwebReceiverExitScope20261026Once'
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
    [baseline.source.slice(frameStart, frameEnd), scopeFrameSource],
    [
      '  if ($frame.Replace(([string][char]13 + [char]10), ([string][char]10)) -cne ',
      '  if ($refCanonicalWire -cne ',
    ],
    [baseline.source.slice(footerStart), footer],
    [
      "$loadStage = 'parent_preflight'; $loadReason = 'unknown'\n",
      "$loadStage = 'parent_preflight'; $loadReason = 'unknown'\n" + scopeInitSource,
    ],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  const shadowLine = 'receiver_exit_scope_v1,beforeGlobal=int2,afterGlobal=int0,local=int2\n'
  const zeroLine = 'receiver_exit_scope_v1,beforeGlobal=missing,afterGlobal=int0,local=int0\n'
  const complete = createNativeProbePowerShellLoadOnlySupervisorArtifact().expectedStdout
  const wireFixtures = Object.freeze([
    Object.freeze({
      label: 'scope_difference',
      status: 'scope_observed',
      wire: exitScopeParentFailure + shadowLine + exitScopeFailedLine,
    }),
    Object.freeze({
      label: 'regression_passed',
      status: 'scope_observed',
      wire: complete + zeroLine + exitScopePassedLine,
    }),
    Object.freeze({
      label: 'unavailable',
      status: 'unavailable',
      wire:
        formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()) +
        exitScopeAbsentLine +
        exitScopeUnavailableLine,
    }),
  ])
  for (const item of wireFixtures) parseNativeProbeExitScopeOutput(item.wire)
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_exit_scope_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    onceFlag,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    scopeHelperSource,
    beforeScopeSource,
    afterScopeSource,
    scopeInitSource,
    scopeFrameSource,
    nativeVerified: false,
    expectedStdout: wireFixtures[1].wire,
    expectedChildStdout: exitChannelRefTestLine + zeroLine + readyChild,
    wireFixtures,
  })
}

// 保留既有typed兩literal語意，只換新parent及其實際bytes／units／pins與專用payload。
export function createNativeProbePowerShellExitScopeHandoffArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellExitChannelRefHandoffArtifact()
  const oldParent = createNativeProbePowerShellExitChannelRefArtifact()
  const parent = createNativeProbePowerShellExitScopeArtifact()
  const separator = "\n'@\n"
  const oldSplit = uniqueSourceOffset(oldParent.source, separator)
  const split = uniqueSourceOffset(parent.source, separator)
  const partA = parent.source.slice(0, split),
    partB = parent.source.slice(split + separator.length)
  if (!partA.endsWith('\n') || !partB.endsWith('\n')) return unavailable()
  const payloadVariable = 'RdwebReceiverExitScope20261026Payload'
  const integrityPrefix = 'rdweb_exit_scope_handoff_integrity_v1,'
  const integrityLine =
    integrityPrefix +
    `status=ok,bytes=${parent.utf8Bytes},units=${parent.utf16Units},sha256=${parent.sha256}`
  const integrityErrorLine = integrityPrefix + 'status=error'
  const unavailableLine =
    'receiver_windows_exit_scope_handoff_unavailable,terminalUse=stop,sessionStarted=False'
  const stages = [
    {
      source: baseline.stage1Source,
      changes: [
        [oldParent.source.slice(0, oldSplit), partA],
        [oldParent.source.slice(oldSplit + separator.length), partB],
        ['Set-Variable -Name ' + baseline.payloadVariable, 'Set-Variable -Name ' + payloadVariable],
        [
          'Remove-Variable -Name ' + baseline.payloadVariable,
          'Remove-Variable -Name ' + payloadVariable,
        ],
        [baseline.integrityLine, integrityLine],
        [baseline.integrityErrorLine, integrityErrorLine],
        [
          'GetByteCount($rdwebHandoffPayload) -eq ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffPayload) -eq ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffPayload.Length -eq ' + baseline.parentUtf16Units,
          '$rdwebHandoffPayload.Length -eq ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -ceq '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -ceq '" + parent.sha256 + "'",
        ],
      ],
    },
    {
      source: baseline.stage2Source,
      changes: [
        [baseline.payloadVariable, payloadVariable],
        [baseline.unavailableLine, unavailableLine],
        [
          'GetByteCount($rdwebHandoffText) -ne ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffText) -ne ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffText.Length -ne ' + baseline.parentUtf16Units,
          '$rdwebHandoffText.Length -ne ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -cne '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -cne '" + parent.sha256 + "'",
        ],
      ],
    },
  ]
  for (const stage of stages) {
    for (const [original, replacement] of stage.changes) {
      const offset = uniqueSourceOffset(stage.source, original)
      stage.source =
        stage.source.slice(0, offset) + replacement + stage.source.slice(offset + original.length)
    }
  }
  const stage1Source = stages[0].source,
    stage2Source = stages[1].source
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_exit_scope_handoff_v1',
    parentUtf8Bytes: parent.utf8Bytes,
    parentUtf16Units: parent.utf16Units,
    parentSha256: parent.sha256,
    partAUtf8Bytes: Buffer.byteLength(partA),
    partAUtf16Units: partA.length,
    partASha256: createHash('sha256').update(partA).digest('hex'),
    partBUtf8Bytes: Buffer.byteLength(partB),
    partBUtf16Units: partB.length,
    partBSha256: createHash('sha256').update(partB).digest('hex'),
    payloadVariable,
    integrityPrefix,
    integrityLine,
    integrityErrorLine,
    unavailableLine,
    stage1Source,
    stage1Utf8Bytes: Buffer.byteLength(stage1Source),
    stage1Utf16Units: stage1Source.length,
    stage1Sha256: createHash('sha256').update(stage1Source).digest('hex'),
    stage2Source,
    stage2Utf8Bytes: Buffer.byteLength(stage2Source),
    stage2Utf16Units: stage2Source.length,
    stage2Sha256: createHash('sha256').update(stage2Source).digest('hex'),
  })
}

const exitChannelScopedRefObservedLine =
  'receiver_windows_exit_channel_scoped_ref_observed,syntheticExit=True,nativeExecutable=False,sessionStarted=False\n'
const exitChannelScopedRefUnavailableLine =
  'receiver_windows_exit_channel_scoped_ref_unavailable,terminalUse=stop,sessionStarted=False\n'

// child的wire契約不變，沿原parser要求marker、partial canonical、空stderr及整數exit0。
export function parseNativeProbeExitChannelScopedRefChildOutput(stdout, stderr, exitCode) {
  return parseNativeProbeExitChannelRefChildOutput(stdout, stderr, exitCode)
}

// 僅將精確的新終態marker映至既有嚴格decoder，舊marker與額外輸出不得沿用。
export function parseNativeProbeExitChannelScopedRefOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1280) return unavailable()
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 3 || lines[2] !== '') return unavailable()
  let marker
  if (lines[1] + '\n' === exitChannelScopedRefObservedLine) marker = exitChannelRefObservedLine
  else if (lines[1] + '\n' === exitChannelScopedRefUnavailableLine)
    marker = exitChannelRefUnavailableLine
  else return unavailable()
  const parsed = parseNativeProbeExitChannelRefOutput(lines[0] + '\n' + marker)
  return Object.freeze({
    status: parsed.status === 'ref_cases_observed' ? 'scoped_ref_cases_observed' : 'unavailable',
    diagnostic: parsed.diagnostic,
  })
}

// 只把an的保守seed與立即讀回配成child Global；其他guard、實檔呼叫及finally逐字保留。
export function createNativeProbePowerShellExitChannelScopedRefArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellExitChannelRefArtifact()
  if (baseline.sha256 !== '0911e6b5e28affe18a1814bd08aead2e7e3343660c02e0984e61a413ef11249b')
    return unavailable()
  let childSource = baseline.childSource
  for (const [original, replacement] of [
    ['  $LASTEXITCODE = 2\n', '  $global:LASTEXITCODE = 2\n'],
    ['  $loadTestExit = $LASTEXITCODE\n', '  $loadTestExit = $global:LASTEXITCODE\n'],
  ]) {
    const offset = uniqueSourceOffset(childSource, original)
    childSource =
      childSource.slice(0, offset) + replacement + childSource.slice(offset + original.length)
  }
  const childSha256 = createHash('sha256').update(childSource).digest('hex')
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  const childArguments =
    prefix +
    Buffer.from("$ProgressPreference = 'SilentlyContinue'; " + childSource, 'utf16le').toString(
      'base64',
    )
  const childCommandLineUtf16UnitsUpperBound =
    baseline.maxExecutableUtf16Units + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > baseline.commandLineLimit) return unavailable()
  const onceFlag = 'RdwebReceiverExitChannelScopedRef20261026Once'
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childSha256],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
    [exitChannelRefObservedLine.trimEnd(), exitChannelScopedRefObservedLine.trimEnd()],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  // 失敗marker在正常footer與catch各出現一次，只改固定兩處、不擴大替換範圍。
  if (source.split(exitChannelRefUnavailableLine.trimEnd()).length !== 3) return unavailable()
  source = source.replaceAll(
    exitChannelRefUnavailableLine.trimEnd(),
    exitChannelScopedRefUnavailableLine.trimEnd(),
  )
  const expectedStdout =
    baseline.expectedStdout.slice(0, -exitChannelRefObservedLine.length) +
    exitChannelScopedRefObservedLine
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'scoped_ref_cases_observed', wire: expectedStdout }),
    Object.freeze({
      label: 'unavailable',
      wire:
        formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()) +
        exitChannelScopedRefUnavailableLine,
    }),
  ])
  const adapter = createNativeProbePowerShellTypeFixedAdapterArtifact()
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_exit_channel_scoped_ref_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    onceFlag,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    adapterOffset: source.indexOf(adapter.source),
    childAdapterOffset: uniqueSourceOffset(childSource, adapter.source),
    nativeVerified: false,
    expectedStdout,
    wireFixtures,
  })
}

// 沿an兩literal模板重建真parent，另用新payload與marker，保留型別檢查及唯一Invoke。
export function createNativeProbePowerShellExitChannelScopedRefHandoffArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellExitChannelRefHandoffArtifact()
  if (
    baseline.stage1Sha256 !== '2fa53a7b7d746d8a3e04f6679ef63c0c9371dda6f6cee55c943acc079f057db1' ||
    baseline.stage2Sha256 !== 'c221df5e9582d30daea3f983c112baf7eb75bdf044b53a2dd4ff0b50fd13ff94'
  )
    return unavailable()
  const oldParent = createNativeProbePowerShellExitChannelRefArtifact()
  const parent = createNativeProbePowerShellExitChannelScopedRefArtifact()
  const separator = "\n'@\n"
  const oldSplit = uniqueSourceOffset(oldParent.source, separator)
  const split = uniqueSourceOffset(parent.source, separator)
  const partA = parent.source.slice(0, split)
  const partB = parent.source.slice(split + separator.length)
  if (!partA.endsWith('\n') || !partB.endsWith('\n')) return unavailable()
  const payloadVariable = 'RdwebReceiverExitChannelScopedRef20261026Payload'
  const integrityPrefix = 'rdweb_exit_channel_scoped_ref_handoff_integrity_v1,'
  const integrityLine =
    integrityPrefix +
    `status=ok,bytes=${parent.utf8Bytes},units=${parent.utf16Units},sha256=${parent.sha256}`
  const integrityErrorLine = integrityPrefix + 'status=error'
  const unavailableLine =
    'receiver_windows_exit_channel_scoped_ref_handoff_unavailable,terminalUse=stop,sessionStarted=False'
  const stages = [
    {
      source: baseline.stage1Source,
      changes: [
        [oldParent.source.slice(0, oldSplit), partA],
        [oldParent.source.slice(oldSplit + separator.length), partB],
        ['Set-Variable -Name ' + baseline.payloadVariable, 'Set-Variable -Name ' + payloadVariable],
        [
          'Remove-Variable -Name ' + baseline.payloadVariable,
          'Remove-Variable -Name ' + payloadVariable,
        ],
        [baseline.integrityLine, integrityLine],
        [baseline.integrityErrorLine, integrityErrorLine],
        [
          'GetByteCount($rdwebHandoffPayload) -eq ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffPayload) -eq ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffPayload.Length -eq ' + baseline.parentUtf16Units,
          '$rdwebHandoffPayload.Length -eq ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -ceq '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -ceq '" + parent.sha256 + "'",
        ],
      ],
    },
    {
      source: baseline.stage2Source,
      changes: [
        [baseline.payloadVariable, payloadVariable],
        [baseline.unavailableLine, unavailableLine],
        [
          'GetByteCount($rdwebHandoffText) -ne ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffText) -ne ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffText.Length -ne ' + baseline.parentUtf16Units,
          '$rdwebHandoffText.Length -ne ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -cne '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -cne '" + parent.sha256 + "'",
        ],
      ],
    },
  ]
  for (const stage of stages) {
    for (const [original, replacement] of stage.changes) {
      const offset = uniqueSourceOffset(stage.source, original)
      stage.source =
        stage.source.slice(0, offset) + replacement + stage.source.slice(offset + original.length)
    }
  }
  const stage1Source = stages[0].source
  const stage2Source = stages[1].source
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_exit_channel_scoped_ref_handoff_v1',
    parentUtf8Bytes: parent.utf8Bytes,
    parentUtf16Units: parent.utf16Units,
    parentSha256: parent.sha256,
    partAUtf8Bytes: Buffer.byteLength(partA),
    partAUtf16Units: partA.length,
    partASha256: createHash('sha256').update(partA).digest('hex'),
    partBUtf8Bytes: Buffer.byteLength(partB),
    partBUtf16Units: partB.length,
    partBSha256: createHash('sha256').update(partB).digest('hex'),
    payloadVariable,
    integrityPrefix,
    integrityLine,
    integrityErrorLine,
    unavailableLine,
    stage1Source,
    stage1Utf8Bytes: Buffer.byteLength(stage1Source),
    stage1Utf16Units: stage1Source.length,
    stage1Sha256: createHash('sha256').update(stage1Source).digest('hex'),
    stage2Source,
    stage2Utf8Bytes: Buffer.byteLength(stage2Source),
    stage2Utf16Units: stage2Source.length,
    stage2Sha256: createHash('sha256').update(stage2Source).digest('hex'),
  })
}

const mainRejectionChildLine =
  'receiver_main_invalid_parent_rejected,exitCode=2,sessionStarted=False\n'
const mainRejectionObservedLine =
  'receiver_windows_main_rejection_observed,invalidParent=True,sessionStarted=False\n'
const mainRejectionUnavailableLine =
  'receiver_windows_main_rejection_unavailable,terminalUse=stop,sessionStarted=False\n'
const mainRejectionStderr = 'receiver_unavailable\n'

// 僅接受完整負向marker、原partial canonical、精確一行stderr及真正child exit0。
export function parseNativeProbeMainRejectionChildOutput(stdout, stderr, exitCode) {
  if (
    typeof stdout !== 'string' ||
    Buffer.byteLength(stdout) > 1024 ||
    typeof stderr !== 'string' ||
    Buffer.byteLength(stderr) > 128 ||
    stderr.replaceAll('\r\n', '\n') !== mainRejectionStderr ||
    !Number.isInteger(exitCode) ||
    exitCode !== 0
  )
    return unavailable()
  const canonical = createNativeProbePowerShellLoadOnlySupervisorArtifact().expectedChildStdout
  if (stdout.replaceAll('\r\n', '\n') !== mainRejectionChildLine + canonical) return unavailable()
  return parseNativeProbeDiagnostic(canonical)
}

// parent只接受本負向案例的終態marker；五confirmed仍由既有嚴格decoder驗證。
export function parseNativeProbeMainRejectionOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1280) return unavailable()
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 3 || lines[2] !== '') return unavailable()
  let marker
  if (lines[1] + '\n' === mainRejectionObservedLine) marker = exitChannelScopedRefObservedLine
  else if (lines[1] + '\n' === mainRejectionUnavailableLine)
    marker = exitChannelScopedRefUnavailableLine
  else return unavailable()
  const parsed = parseNativeProbeExitChannelScopedRefOutput(lines[0] + '\n' + marker)
  return Object.freeze({
    status:
      parsed.status === 'scoped_ref_cases_observed' ? 'main_rejection_observed' : 'unavailable',
    diagnostic: parsed.diagnostic,
  })
}

// 只呼叫已pin實檔main的空Parent負向，保留監督與收尾，stderr僅多收精確預期分類。
export function createNativeProbePowerShellMainRejectionArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellExitChannelScopedRefArtifact()
  if (baseline.sha256 !== 'e9050c13ecd24a471d8bce63c219029283fe88abfc483edde0f58fa4a5b72561')
    return unavailable()
  const oldRun = String.raw`  $global:LASTEXITCODE = 2
  & (Join-Path $loadPackage 'test-receiver-exit-channel.ps1')
  $loadTestExit = $global:LASTEXITCODE
  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 0) { throw 'receiver_native_load_rejected' }
`
  const run = String.raw`  $global:LASTEXITCODE = 99
  & (Join-Path $loadPackage 'start-windows-test-receiver.ps1') -Parent ''
  $loadTestExit = $global:LASTEXITCODE
  if ($loadTestExit -isnot [int] -or $loadTestExit -ne 2) { throw 'receiver_native_load_rejected' }
  [Console]::Write('receiver_main_invalid_parent_rejected,exitCode=2,sessionStarted=False' + [char]10)
`
  const runOffset = uniqueSourceOffset(baseline.childSource, oldRun)
  const childSource =
    baseline.childSource.slice(0, runOffset) +
    run +
    baseline.childSource.slice(runOffset + oldRun.length)
  const childPin = createHash('sha256').update(childSource).digest('hex')
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  const childArguments =
    prefix +
    Buffer.from("$ProgressPreference = 'SilentlyContinue'; " + childSource, 'utf16le').toString(
      'base64',
    )
  const childCommandLineUtf16UnitsUpperBound =
    baseline.maxExecutableUtf16Units + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > baseline.commandLineLimit) return unavailable()
  const oldErrorRead = String.raw`      if ($loadErrCount -ne 0) {
        Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'unexpected_output'
        throw 'receiver_native_load_rejected'
      }
      if ($read -eq 0) { $loadErrEnd = $true }
`
  const errorRead = String.raw`      if ($loadErrCount -gt 128) {
        Set-RdwebNativeFailure $loadDiagnostic 'unknown' 'unexpected_output'
        throw 'receiver_native_load_rejected'
      }
      if ($read -eq 0) { $loadErrEnd = $true }
      else { $loadErrTask = $loadProcess.StandardError.BaseStream.ReadAsync($loadErr, $loadErrCount, 129 - $loadErrCount) }
`
  const errorGate = String.raw`  $mainError = ([Text.UTF8Encoding]::new($false, $true)).GetString($loadErr, 0, $loadErrCount)
  if ($mainError.Replace(([string][char]13 + [char]10), ([string][char]10)) -cne 'receiver_unavailable' + [char]10) { throw 'receiver_native_load_rejected' }
`
  const onceFlag = 'RdwebReceiverMainRejection20261026Once'
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childPin],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
    [oldErrorRead, errorRead],
    ['  $frame = ', errorGate + '  $frame = '],
    [exitChannelScopedRefObservedLine.trimEnd(), mainRejectionObservedLine.trimEnd()],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  for (const [original, replacement] of [
    [exitChannelRefTestLine.trimEnd(), mainRejectionChildLine.trimEnd()],
    [exitChannelScopedRefUnavailableLine.trimEnd(), mainRejectionUnavailableLine.trimEnd()],
  ]) {
    if (source.split(original).length !== 3) return unavailable()
    source = source.replaceAll(original, replacement)
  }
  const expectedStdout =
    baseline.expectedStdout.slice(0, -exitChannelScopedRefObservedLine.length) +
    mainRejectionObservedLine
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'main_rejection_observed', wire: expectedStdout }),
    Object.freeze({
      label: 'unavailable',
      wire:
        formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()) + mainRejectionUnavailableLine,
    }),
  ])
  const adapter = createNativeProbePowerShellTypeFixedAdapterArtifact()
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_main_rejection_v1',
    baselineSha256: baseline.sha256,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256: childPin,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    onceFlag,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    adapterOffset: source.indexOf(adapter.source),
    childAdapterOffset: uniqueSourceOffset(childSource, adapter.source),
    expectedChildStdout:
      mainRejectionChildLine +
      createNativeProbePowerShellLoadOnlySupervisorArtifact().expectedChildStdout,
    expectedChildStderr: mainRejectionStderr,
    expectedStdout,
    wireFixtures,
    nativeVerified: false,
    productEntryVerified: false,
    nativeExecutableVerified: false,
  })
}

// 只置換as交接的真parent／metadata及獨立payload，保留惰性第一段與typed唯一Invoke。
export function createNativeProbePowerShellMainRejectionHandoffArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellExitChannelScopedRefHandoffArtifact()
  if (
    baseline.stage1Sha256 !== 'f3cac5282287d3f07b579737552b5dbb404196660e909817746e4d8852e0ab8e' ||
    baseline.stage2Sha256 !== 'ff4629e3d4ebd36c353c8554bb8abb51c314b2b6775c1bb19318f3b99441349f'
  )
    return unavailable()
  const oldParent = createNativeProbePowerShellExitChannelScopedRefArtifact()
  const parent = createNativeProbePowerShellMainRejectionArtifact()
  const separator = "\n'@\n"
  const oldSplit = uniqueSourceOffset(oldParent.source, separator)
  const split = uniqueSourceOffset(parent.source, separator)
  const partA = parent.source.slice(0, split)
  const partB = parent.source.slice(split + separator.length)
  if (!partA.endsWith('\n') || !partB.endsWith('\n')) return unavailable()
  const payloadVariable = 'RdwebReceiverMainRejection20261026Payload'
  const integrityPrefix = 'rdweb_main_rejection_handoff_integrity_v1,'
  const integrityLine =
    integrityPrefix +
    `status=ok,bytes=${parent.utf8Bytes},units=${parent.utf16Units},sha256=${parent.sha256}`
  const integrityErrorLine = integrityPrefix + 'status=error'
  const unavailableLine =
    'receiver_windows_main_rejection_handoff_unavailable,terminalUse=stop,sessionStarted=False'
  const stages = [
    {
      source: baseline.stage1Source,
      changes: [
        [oldParent.source.slice(0, oldSplit), partA],
        [oldParent.source.slice(oldSplit + separator.length), partB],
        ['Set-Variable -Name ' + baseline.payloadVariable, 'Set-Variable -Name ' + payloadVariable],
        [
          'Remove-Variable -Name ' + baseline.payloadVariable,
          'Remove-Variable -Name ' + payloadVariable,
        ],
        [baseline.integrityLine, integrityLine],
        [baseline.integrityErrorLine, integrityErrorLine],
        [
          'GetByteCount($rdwebHandoffPayload) -eq ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffPayload) -eq ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffPayload.Length -eq ' + baseline.parentUtf16Units,
          '$rdwebHandoffPayload.Length -eq ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -ceq '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -ceq '" + parent.sha256 + "'",
        ],
      ],
    },
    {
      source: baseline.stage2Source,
      changes: [
        [baseline.payloadVariable, payloadVariable],
        [baseline.unavailableLine, unavailableLine],
        [
          'GetByteCount($rdwebHandoffText) -ne ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffText) -ne ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffText.Length -ne ' + baseline.parentUtf16Units,
          '$rdwebHandoffText.Length -ne ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -cne '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -cne '" + parent.sha256 + "'",
        ],
      ],
    },
  ]
  for (const stage of stages) {
    for (const [original, replacement] of stage.changes) {
      const offset = uniqueSourceOffset(stage.source, original)
      stage.source =
        stage.source.slice(0, offset) + replacement + stage.source.slice(offset + original.length)
    }
  }
  const stage1Source = stages[0].source
  const stage2Source = stages[1].source
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_main_rejection_handoff_v1',
    parentUtf8Bytes: parent.utf8Bytes,
    parentUtf16Units: parent.utf16Units,
    parentSha256: parent.sha256,
    partAUtf8Bytes: Buffer.byteLength(partA),
    partAUtf16Units: partA.length,
    partASha256: createHash('sha256').update(partA).digest('hex'),
    partBUtf8Bytes: Buffer.byteLength(partB),
    partBUtf16Units: partB.length,
    partBSha256: createHash('sha256').update(partB).digest('hex'),
    payloadVariable,
    integrityPrefix,
    integrityLine,
    integrityErrorLine,
    unavailableLine,
    stage1Source,
    stage1Utf8Bytes: Buffer.byteLength(stage1Source),
    stage1Utf16Units: stage1Source.length,
    stage1Sha256: createHash('sha256').update(stage1Source).digest('hex'),
    stage2Source,
    stage2Utf8Bytes: Buffer.byteLength(stage2Source),
    stage2Utf16Units: stage2Source.length,
    stage2Sha256: createHash('sha256').update(stage2Source).digest('hex'),
  })
}

const entryBoundaryChildLine =
  'receiver_entry_boundary_invalid_parent_rejected,exitCode=2,sessionStarted=False\n'
const entryBoundaryObservedLine =
  'receiver_windows_entry_boundary_observed,invalidParent=True,sessionStarted=False\n'
const entryBoundaryUnavailableLine =
  'receiver_windows_entry_boundary_unavailable,terminalUse=stop,sessionStarted=False\n'

// 先驗新marker與實際容量，再沿原嚴格decoder拒絕載入分類、額外stderr或缺失退出證據。
export function parseNativeProbeEntryBoundaryChildOutput(stdout, stderr, exitCode) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1024) return unavailable()
  const wire = stdout.replaceAll('\r\n', '\n')
  if (!wire.startsWith(entryBoundaryChildLine)) return unavailable()
  return parseNativeProbeMainRejectionChildOutput(
    mainRejectionChildLine + wire.slice(entryBoundaryChildLine.length),
    stderr,
    exitCode,
  )
}

// 只接受新來源專用終態，不把舊候選結果升格成新邊界已驗。
export function parseNativeProbeEntryBoundaryOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1280) return unavailable()
  const lines = stdout.replaceAll('\r\n', '\n').split('\n')
  if (lines.length !== 3 || lines[2] !== '') return unavailable()
  let marker
  if (lines[1] + '\n' === entryBoundaryObservedLine) marker = mainRejectionObservedLine
  else if (lines[1] + '\n' === entryBoundaryUnavailableLine) marker = mainRejectionUnavailableLine
  else return unavailable()
  const parsed = parseNativeProbeMainRejectionOutput(lines[0] + '\n' + marker)
  return Object.freeze({
    status: parsed.status === 'main_rejection_observed' ? 'entry_boundary_observed' : 'unavailable',
    diagnostic: parsed.diagnostic,
  })
}

// 僅切換ax新版來源、root與獨立識別；原main呼叫、精確stderr gate及finally完整保留。
export function createNativeProbePowerShellEntryBoundaryArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellMainRejectionArtifact()
  if (baseline.sha256 !== 'd8f975be49bcf3f3831d064efa8ec11bb8395f177dffb01b6f4ef1db40c0ed3d')
    return unavailable()
  const packageRelativePath = 'rdweb entry load boundary validation 公開 20261026-01'
  const onceFlag = 'RdwebReceiverEntryBoundary20261026Once'
  const trustedSources = Object.freeze(
    baseline.trustedSources.map((item) => {
      if (item.name === 'integrity.json')
        return Object.freeze({
          name: item.name,
          bytes: 637,
          sha256: '0b5cb41746392b64a112f7aafc85fe6205e95a0b108f16a21d059a5ae7fa2099',
        })
      if (item.name === 'start-windows-test-receiver.ps1')
        return Object.freeze({
          name: item.name,
          bytes: 7652,
          sha256: 'b4056d8752f2c3748c7def507536148ebd9281ae9ab5db94f532e3c4a0ff3c19',
        })
      return item
    }),
  )
  let childSource = baseline.childSource
  for (const [original, replacement] of [
    [baseline.packageRelativePath, packageRelativePath],
    [mainRejectionChildLine.trimEnd(), entryBoundaryChildLine.trimEnd()],
  ]) {
    const offset = uniqueSourceOffset(childSource, original)
    childSource =
      childSource.slice(0, offset) + replacement + childSource.slice(offset + original.length)
  }
  const childPin = createHash('sha256').update(childSource).digest('hex')
  const prefix = '-NoLogo -NoProfile -STA -NonInteractive -OutputFormat Text -EncodedCommand '
  const childArguments =
    prefix +
    Buffer.from("$ProgressPreference = 'SilentlyContinue'; " + childSource, 'utf16le').toString(
      'base64',
    )
  const childCommandLineUtf16UnitsUpperBound =
    baseline.maxExecutableUtf16Units + 3 + childArguments.length
  if (childCommandLineUtf16UnitsUpperBound > baseline.commandLineLimit) return unavailable()
  let source = baseline.source
  for (const [original, replacement] of [
    [baseline.childSource, childSource],
    [baseline.childSha256, childPin],
    [baseline.packageRelativePath, packageRelativePath],
    ['Get-Variable -Name ' + baseline.onceFlag, 'Get-Variable -Name ' + onceFlag],
    ['New-Variable -Name ' + baseline.onceFlag, 'New-Variable -Name ' + onceFlag],
    [mainRejectionObservedLine.trimEnd(), entryBoundaryObservedLine.trimEnd()],
  ]) {
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  for (const item of trustedSources.slice(0, 2)) {
    const old = baseline.trustedSources.find((entry) => entry.name === item.name)
    const original = `@{ Name = '${old.name}'; Bytes = ${old.bytes}; Pin = '${old.sha256}' }`
    const replacement = `@{ Name = '${item.name}'; Bytes = ${item.bytes}; Pin = '${item.sha256}' }`
    const offset = uniqueSourceOffset(source, original)
    source = source.slice(0, offset) + replacement + source.slice(offset + original.length)
  }
  for (const [original, replacement] of [
    [mainRejectionChildLine.trimEnd(), entryBoundaryChildLine.trimEnd()],
    [mainRejectionUnavailableLine.trimEnd(), entryBoundaryUnavailableLine.trimEnd()],
  ]) {
    if (source.split(original).length !== 3) return unavailable()
    source = source.replaceAll(original, replacement)
  }
  const expectedStdout =
    baseline.expectedStdout.slice(0, -mainRejectionObservedLine.length) + entryBoundaryObservedLine
  const wireFixtures = Object.freeze([
    Object.freeze({ label: 'entry_boundary_observed', wire: expectedStdout }),
    Object.freeze({
      label: 'unavailable',
      wire:
        formatNativeProbeDiagnostic(unknownNativeProbeDiagnostic()) + entryBoundaryUnavailableLine,
    }),
  ])
  const adapter = createNativeProbePowerShellTypeFixedAdapterArtifact()
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_entry_boundary_v1',
    baselineSha256: baseline.sha256,
    packageRelativePath,
    onceFlag,
    trustedSources,
    source,
    utf8Bytes: Buffer.byteLength(source),
    utf16Units: source.length,
    sha256: createHash('sha256').update(source).digest('hex'),
    childSource,
    childUtf8Bytes: Buffer.byteLength(childSource),
    childUtf16Units: childSource.length,
    childSha256: childPin,
    childArguments,
    childCommandLineUtf16UnitsUpperBound,
    childSourceOffset: uniqueSourceOffset(source, childSource),
    adapterOffset: source.indexOf(adapter.source),
    childAdapterOffset: uniqueSourceOffset(childSource, adapter.source),
    expectedChildStdout:
      entryBoundaryChildLine + baseline.expectedChildStdout.slice(mainRejectionChildLine.length),
    expectedStdout,
    wireFixtures,
    nativeVerified: false,
    productEntryVerified: false,
    nativeExecutableVerified: false,
  })
}

// 沿au既有typed兩段模板，只換真新parent與專用payload及實算metadata。
export function createNativeProbePowerShellEntryBoundaryHandoffArtifact() {
  if (arguments.length !== 0) return unavailable()
  const baseline = createNativeProbePowerShellMainRejectionHandoffArtifact()
  if (
    baseline.stage1Sha256 !== '6f0541ead69810504dd1360b1e9341b79bf143313173a2aa8763cee613e76923' ||
    baseline.stage2Sha256 !== 'a894977ef267b2d364f1fdf3161134e4acd432d5419300ff7d135680327cd896'
  )
    return unavailable()
  const oldParent = createNativeProbePowerShellMainRejectionArtifact()
  const parent = createNativeProbePowerShellEntryBoundaryArtifact()
  const separator = "\n'@\n"
  const oldSplit = uniqueSourceOffset(oldParent.source, separator)
  const split = uniqueSourceOffset(parent.source, separator)
  const partA = parent.source.slice(0, split)
  const partB = parent.source.slice(split + separator.length)
  if (!partA.endsWith('\n') || !partB.endsWith('\n')) return unavailable()
  const payloadVariable = 'RdwebReceiverEntryBoundary20261026Payload'
  const integrityPrefix = 'rdweb_entry_boundary_handoff_integrity_v1,'
  const integrityLine =
    integrityPrefix +
    `status=ok,bytes=${parent.utf8Bytes},units=${parent.utf16Units},sha256=${parent.sha256}`
  const integrityErrorLine = integrityPrefix + 'status=error'
  const unavailableLine =
    'receiver_windows_entry_boundary_handoff_unavailable,terminalUse=stop,sessionStarted=False'
  const stages = [
    {
      source: baseline.stage1Source,
      changes: [
        [oldParent.source.slice(0, oldSplit), partA],
        [oldParent.source.slice(oldSplit + separator.length), partB],
        ['Set-Variable -Name ' + baseline.payloadVariable, 'Set-Variable -Name ' + payloadVariable],
        [
          'Remove-Variable -Name ' + baseline.payloadVariable,
          'Remove-Variable -Name ' + payloadVariable,
        ],
        [baseline.integrityLine, integrityLine],
        [baseline.integrityErrorLine, integrityErrorLine],
        [
          'GetByteCount($rdwebHandoffPayload) -eq ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffPayload) -eq ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffPayload.Length -eq ' + baseline.parentUtf16Units,
          '$rdwebHandoffPayload.Length -eq ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -ceq '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -ceq '" + parent.sha256 + "'",
        ],
      ],
    },
    {
      source: baseline.stage2Source,
      changes: [
        [baseline.payloadVariable, payloadVariable],
        [baseline.unavailableLine, unavailableLine],
        [
          'GetByteCount($rdwebHandoffText) -ne ' + baseline.parentUtf8Bytes,
          'GetByteCount($rdwebHandoffText) -ne ' + parent.utf8Bytes,
        ],
        [
          '$rdwebHandoffText.Length -ne ' + baseline.parentUtf16Units,
          '$rdwebHandoffText.Length -ne ' + parent.utf16Units,
        ],
        [
          "$rdwebHandoffHash -cne '" + baseline.parentSha256 + "'",
          "$rdwebHandoffHash -cne '" + parent.sha256 + "'",
        ],
      ],
    },
  ]
  for (const stage of stages) {
    for (const [original, replacement] of stage.changes) {
      const offset = uniqueSourceOffset(stage.source, original)
      stage.source =
        stage.source.slice(0, offset) + replacement + stage.source.slice(offset + original.length)
    }
  }
  const stage1Source = stages[0].source
  const stage2Source = stages[1].source
  return Object.freeze({
    ...baseline,
    purpose: 'receiver_native_entry_boundary_handoff_v1',
    parentUtf8Bytes: parent.utf8Bytes,
    parentUtf16Units: parent.utf16Units,
    parentSha256: parent.sha256,
    partAUtf8Bytes: Buffer.byteLength(partA),
    partAUtf16Units: partA.length,
    partASha256: createHash('sha256').update(partA).digest('hex'),
    partBUtf8Bytes: Buffer.byteLength(partB),
    partBUtf16Units: partB.length,
    partBSha256: createHash('sha256').update(partB).digest('hex'),
    payloadVariable,
    integrityPrefix,
    integrityLine,
    integrityErrorLine,
    unavailableLine,
    stage1Source,
    stage1Utf8Bytes: Buffer.byteLength(stage1Source),
    stage1Utf16Units: stage1Source.length,
    stage1Sha256: createHash('sha256').update(stage1Source).digest('hex'),
    stage2Source,
    stage2Utf8Bytes: Buffer.byteLength(stage2Source),
    stage2Utf16Units: stage2Source.length,
    stage2Sha256: createHash('sha256').update(stage2Source).digest('hex'),
  })
}

// version2僅描述觀察契約與純模型，不提供Windows啟動、helper或授權能力。
const jobEvidence = [...evidence, 'jobAssigned', 'treeEmpty', 'stdoutEof', 'stderrEof']
const jobFields = ['version', 'phase', 'reason', ...jobEvidence, 'caseSet', 'cancelState']
const jobCases = ['case_E0', 'case_E1', 'case_E2', 'case_E7', 'case_O', 'case_R', 'case_A']
const jobReasons = new Set([
  'unknown',
  'none',
  'guard_rejected',
  'io_failed',
  'deadline',
  'unexpected_output',
  'cleanup_unconfirmed',
  'case_mismatch',
  'native_stderr_interrupted',
])
const jobPrefix = 'receiver_native_job_diagnostic,'

// 缺證回傳固定unknown副本，與舊版五欄位診斷完全分離。
export function unknownNativeProbeJobDiagnostic() {
  return Object.freeze({
    version: 2,
    phase: 'unknown',
    reason: 'unknown',
    childStart: 'unknown',
    childExit: 'unknown',
    childPolicyRestore: 'unknown',
    parentPolicyVerify: 'unknown',
    resourcesClose: 'unknown',
    jobAssigned: 'unknown',
    treeEmpty: 'unknown',
    stdoutEof: 'unknown',
    stderrEof: 'unknown',
    caseSet: 'unknown',
    cancelState: 'unknown',
  })
}

// 多個公開邊界共用固定安全錯誤，不附外部物件或cause。
function jobUnavailable() {
  throw new Error('receiver_native_job_diagnostic_unavailable')
}

// 只於格式化邊界驗證純資料descriptor，白名單複製後不再重複驗證。
function validatedJobCopy(value) {
  if (value === null || typeof value !== 'object') return jobUnavailable()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return jobUnavailable()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(descriptors).length !== jobFields.length) return jobUnavailable()
  const copy = Object.create(null)
  for (const key of jobFields) {
    const descriptor = descriptors[key]
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      return jobUnavailable()
    }
    copy[key] = descriptor.value
  }
  if (
    copy.version !== 2 ||
    !['unknown', 'failed', 'complete'].includes(copy.phase) ||
    !jobReasons.has(copy.reason) ||
    !['unknown', 'matched', 'mismatched'].includes(copy.caseSet) ||
    !['unknown', 'not_requested', 'requested', 'unconfirmed'].includes(copy.cancelState)
  ) {
    return jobUnavailable()
  }
  for (const key of jobEvidence) if (!states.has(copy[key])) return jobUnavailable()
  if (
    (copy.phase === 'complete') !== (copy.reason === 'none') ||
    (copy.phase === 'unknown' && copy.reason !== 'unknown')
  )
    return jobUnavailable()
  if (
    copy.treeEmpty === 'confirmed' &&
    (copy.jobAssigned !== 'confirmed' ||
      (copy.childExit !== 'confirmed' && copy.phase !== 'failed'))
  )
    return jobUnavailable()
  if (copy.childStart === 'confirmed' && copy.jobAssigned !== 'confirmed') return jobUnavailable()
  if (
    copy.phase === 'complete' &&
    (jobEvidence.some((key) => copy[key] !== 'confirmed') ||
      copy.caseSet !== 'matched' ||
      copy.cancelState !== 'not_requested')
  )
    return jobUnavailable()
  if (
    ['case_mismatch', 'native_stderr_interrupted'].includes(copy.reason) &&
    (copy.phase !== 'failed' ||
      copy.caseSet !== 'mismatched' ||
      copy.childStart !== 'confirmed' ||
      copy.jobAssigned !== 'confirmed')
  )
    return jobUnavailable()
  return copy
}

// 固定canonical單行，不序列化外部getter／toJSON，實際容量限制為8KiB。
export function formatNativeProbeJobDiagnostic(value) {
  const line = jobPrefix + JSON.stringify(validatedJobCopy(value)) + '\n'
  if (Buffer.byteLength(line) > 8192) return jobUnavailable()
  return line
}

// 已驗資料的分類只看完整證據；已知不符但收尾不足仍不可用。
function jobStatus(value) {
  if (value.phase === 'complete') return 'observed'
  if (
    value.phase === 'failed' &&
    ['case_mismatch', 'native_stderr_interrupted'].includes(value.reason) &&
    jobEvidence.every((key) => value[key] === 'confirmed') &&
    value.cancelState === 'not_requested'
  )
    return 'defect_observed'
  return 'unavailable'
}

// 僅消費兩行完整canonical契約；不以marker、舊版五confirmed或exit0推論成功。
export function parseNativeProbeJobOutput(stdout) {
  const unknownResult = Object.freeze({
    status: 'unavailable',
    diagnostic: unknownNativeProbeJobDiagnostic(),
  })
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 8192) return unknownResult
  const wire = stdout.replaceAll('\r\n', '\n')
  if (wire.includes('\r')) return unknownResult
  const lines = wire.split('\n')
  if (lines.length !== 3 || lines[2] !== '' || !lines[0].startsWith(jobPrefix)) return unknownResult
  // JSON本身可能無效；只在這個外部wire解析邊界捕捉並丟棄例外。
  try {
    const diagnostic = validatedJobCopy(JSON.parse(lines[0].slice(jobPrefix.length)))
    if (jobPrefix + JSON.stringify(diagnostic) !== lines[0]) return unknownResult
    const status = jobStatus(diagnostic)
    if (lines[1] !== 'receiver_native_job_result,status=' + status) return unknownResult
    return Object.freeze({ status, diagnostic: Object.freeze({ ...diagnostic }) })
  } catch {
    return unknownResult
  }
}

// 純RAM模型只接受安全標量觀察並產生取消決策，絕不執行決策或證明原生API。
export function createNativeProbeJobModel() {
  const value = { ...unknownNativeProbeJobDiagnostic(), cancelState: 'not_requested' }
  const negative = new Set()
  let failed = false
  let terminal = null
  let lastTime = 0
  let cleanupEnd = null
  let suspended = false
  let processSignaled = false
  let stage = 0
  let caseIndex = 0
  let cancelIssued = false

  // 首失敗不可被晚到清理、重播案例或deadline覆蓋。
  function fail(reason) {
    if (failed) return
    failed = true
    value.phase = 'failed'
    value.reason = reason
  }

  // 共用單調clock與絕對截止點，任何入口不得重新取得一段預算。
  function acceptTime(elapsedMs) {
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < lastTime) {
      fail('guard_rejected')
      return false
    }
    lastTime = elapsedMs
    if (elapsedMs >= (cleanupEnd ?? 18000)) {
      fail('deadline')
    }
    return true
  }

  return Object.freeze({
    // 事件與結果只在此標量邊界驗一次；不接受動態payload或隱式轉型。
    observe(kind, elapsedMs, result) {
      if (terminal) return
      if (!acceptTime(elapsedMs)) return
      if (typeof kind !== 'string' || typeof result !== 'boolean') {
        fail('guard_rejected')
        return
      }
      if (['suspended', 'assigned', 'resumed'].includes(kind)) {
        // 獨立signal或已確認正常退出之後，不得再指派或恢復同一程序。
        if (processSignaled || value.childExit === 'confirmed') {
          fail('guard_rejected')
          return
        }
        // 晚到取得仍保存owned歸屬，但逾期永不接受恢復執行。
        if (
          (failed && value.reason !== 'deadline') ||
          cleanupEnd !== null ||
          (failed && kind === 'resumed')
        )
          return
        const wanted = ['suspended', 'assigned', 'resumed'][stage]
        if (kind !== wanted) {
          fail('guard_rejected')
          return
        }
        if (kind === 'assigned') value.jobAssigned = result ? 'confirmed' : 'unconfirmed'
        if (kind === 'resumed') value.childStart = result ? 'confirmed' : 'unconfirmed'
        if (!result) {
          fail('io_failed')
          return
        }
        if (kind === 'suspended') suspended = true
        stage++
        return
      }
      if (elapsedMs >= (cleanupEnd ?? 18000)) return
      if (kind === 'processSignaled') {
        if (!suspended || (!result && (processSignaled || value.childExit === 'confirmed'))) {
          fail('guard_rejected')
          return
        }
        // false只是尚未退出，true單調保留；兩者都不確認正常exit0或finally。
        if (result) processSignaled = true
        return
      }
      if (['stdoutOverflow', 'stderrOverflow'].includes(kind)) {
        if (result) {
          const name = kind === 'stdoutOverflow' ? 'stdoutEof' : 'stderrEof'
          negative.add(name)
          value[name] = 'unconfirmed'
        }
        fail(result ? 'unexpected_output' : 'guard_rejected')
        return
      }
      if (kind === 'stderrInterrupted') {
        if (
          !failed &&
          stage === 3 &&
          jobCases[caseIndex] === 'case_R' &&
          result &&
          cleanupEnd === null &&
          value.childExit !== 'confirmed'
        ) {
          value.caseSet = 'mismatched'
          fail('native_stderr_interrupted')
        } else {
          fail('guard_rejected')
        }
        return
      }
      if (jobCases.includes(kind)) {
        if (failed) return
        if (
          stage !== 3 ||
          cleanupEnd !== null ||
          value.childExit === 'confirmed' ||
          kind !== jobCases[caseIndex]
        ) {
          fail('guard_rejected')
          return
        }
        if (!result) {
          value.caseSet = 'mismatched'
          fail('case_mismatch')
          return
        }
        caseIndex++
        if (caseIndex === jobCases.length) value.caseSet = 'matched'
        return
      }
      if (kind === 'cancelled') {
        if (!cancelIssued) {
          fail('guard_rejected')
          return
        }
        if (!result) negative.add(kind)
        value.cancelState = result && !negative.has(kind) ? 'requested' : 'unconfirmed'
        return
      }
      if (!jobEvidence.includes(kind) || ['childStart', 'jobAssigned'].includes(kind)) {
        fail('guard_rejected')
        return
      }
      if (
        !suspended ||
        (kind === 'treeEmpty' &&
          (value.jobAssigned !== 'confirmed' ||
            (!processSignaled && value.childExit !== 'confirmed'))) ||
        (kind === 'resourcesClose' &&
          (cleanupEnd === null ||
            (!processSignaled && value.childExit !== 'confirmed') ||
            ['treeEmpty', 'stdoutEof', 'stderrEof'].some((key) => value[key] !== 'confirmed')))
      ) {
        fail('guard_rejected')
        return
      }
      const confirmed = result && !(kind === 'childExit' && cancelIssued)
      if (!confirmed) {
        negative.add(kind)
        fail('cleanup_unconfirmed')
      }
      value[kind] = confirmed && !negative.has(kind) ? 'confirmed' : 'unconfirmed'
    },
    // 只決策一次取消目標；未指派只能自有process，已指派只能本輪job。
    cleanup(elapsedMs) {
      if (terminal) return Object.freeze({ target: 'none', deadlineMs: cleanupEnd })
      if (!acceptTime(elapsedMs)) return Object.freeze({ target: 'none', deadlineMs: cleanupEnd })
      if (cleanupEnd === null) cleanupEnd = Math.min(20000, elapsedMs + 2000)
      let target = 'none'
      if (!cancelIssued && elapsedMs < cleanupEnd) {
        if (value.jobAssigned === 'confirmed') {
          if (
            value.treeEmpty !== 'confirmed' ||
            (!processSignaled && value.childExit !== 'confirmed')
          )
            target = 'owned_job'
        } else if (suspended && !processSignaled && value.childExit !== 'confirmed')
          target = 'owned_process'
        if (target !== 'none') {
          cancelIssued = true
          value.cancelState = 'unconfirmed'
          fail('cleanup_unconfirmed')
        }
      }
      return Object.freeze({ target, deadlineMs: cleanupEnd })
    },
    // 外部只能取得凍結副本，不能改寫模型的證據或終態。
    snapshot() {
      return Object.freeze({ ...value })
    },
    // 明確結案且所有案例／九證據齊備才complete，結案後忽略任何晚到事件。
    finish(elapsedMs) {
      if (terminal) return terminal
      acceptTime(elapsedMs)
      // 物理退出已知但正常成功缺證，終態只能失敗；查空事實仍可保留。
      if (processSignaled && value.childExit !== 'confirmed') fail('cleanup_unconfirmed')
      if (
        !failed &&
        cleanupEnd !== null &&
        value.caseSet === 'matched' &&
        value.cancelState === 'not_requested' &&
        jobEvidence.every((key) => value[key] === 'confirmed')
      ) {
        value.phase = 'complete'
        value.reason = 'none'
      }
      terminal = Object.freeze({ ...value })
      return terminal
    },
  })
}

// version3屬獨立.NET監督拓樸，不把PS父政策轉譯成新監督邊界的證據。
const supervisorEvidence = [
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
const supervisorFields = [
  'version',
  'phase',
  'reason',
  ...supervisorEvidence,
  'caseSet',
  'cancelState',
]
const supervisorStates = new Set(['unknown', 'not_acquired', 'confirmed', 'unconfirmed'])
const supervisorReasons = new Set([
  'unknown',
  'none',
  'guard_rejected',
  'io_failed',
  'deadline',
  'unexpected_output',
  'cleanup_unconfirmed',
  'case_mismatch',
  'native_stderr_interrupted',
])
const supervisorPrefix = 'receiver_native_supervisor_diagnostic,'

// 新版缺證維持unknown，不因舊版限定通過或runtime切換而預填成功。
export function unknownNativeProbeSupervisorDiagnostic() {
  return Object.freeze({
    version: 3,
    phase: 'unknown',
    reason: 'unknown',
    childStart: 'unknown',
    childExit: 'unknown',
    childPolicyRestore: 'unknown',
    supervisorBoundaryVerify: 'unknown',
    resourcesClose: 'unknown',
    jobAssigned: 'unknown',
    treeEmpty: 'unknown',
    stdoutEof: 'unknown',
    stderrEof: 'unknown',
    caseSet: 'unknown',
    cancelState: 'unknown',
  })
}

// 新版固定拒絕不反射來源物件、動態欄位或例外內容。
function supervisorUnavailable() {
  throw new Error('receiver_native_supervisor_diagnostic_unavailable')
}

// formatter與wire decoder共用唯一schema邊界，往內僅傳白名單純資料副本。
function validatedSupervisorCopy(value) {
  if (value === null || typeof value !== 'object') return supervisorUnavailable()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return supervisorUnavailable()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(descriptors).length !== supervisorFields.length)
    return supervisorUnavailable()
  const copy = Object.create(null)
  for (const key of supervisorFields) {
    const descriptor = descriptors[key]
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
      return supervisorUnavailable()
    copy[key] = descriptor.value
  }
  if (
    copy.version !== 3 ||
    !['unknown', 'failed', 'complete'].includes(copy.phase) ||
    !supervisorReasons.has(copy.reason) ||
    !['unknown', 'matched', 'mismatched'].includes(copy.caseSet) ||
    !['unknown', 'not_requested', 'requested', 'unconfirmed'].includes(copy.cancelState)
  )
    return supervisorUnavailable()
  for (const key of supervisorEvidence)
    if (!supervisorStates.has(copy[key])) return supervisorUnavailable()
  if (
    (copy.phase === 'complete') !== (copy.reason === 'none') ||
    (copy.phase === 'unknown' && copy.reason !== 'unknown') ||
    (copy.treeEmpty === 'confirmed' &&
      (copy.jobAssigned !== 'confirmed' ||
        (copy.childExit !== 'confirmed' && copy.phase !== 'failed'))) ||
    (copy.childStart === 'confirmed' && copy.jobAssigned !== 'confirmed')
  )
    return supervisorUnavailable()
  if (
    copy.phase === 'complete' &&
    (supervisorEvidence.some((key) => copy[key] !== 'confirmed') ||
      copy.caseSet !== 'matched' ||
      copy.cancelState !== 'not_requested')
  )
    return supervisorUnavailable()
  if (
    ['case_mismatch', 'native_stderr_interrupted'].includes(copy.reason) &&
    (copy.phase !== 'failed' ||
      copy.caseSet !== 'mismatched' ||
      copy.childStart !== 'confirmed' ||
      copy.jobAssigned !== 'confirmed')
  )
    return supervisorUnavailable()
  return copy
}

// 僅格式化固定canonical首行，不執行外部getter或toJSON。
export function formatNativeProbeSupervisorDiagnostic(value) {
  const line = supervisorPrefix + JSON.stringify(validatedSupervisorCopy(value)) + '\n'
  if (Buffer.byteLength(line) > 8192) return supervisorUnavailable()
  return line
}

// 已知案例不符仍需要完整可信收尾，缺證或取消不升級為defect_observed。
function supervisorStatus(value) {
  if (value.phase === 'complete') return 'observed'
  if (
    value.phase === 'failed' &&
    ['case_mismatch', 'native_stderr_interrupted'].includes(value.reason) &&
    supervisorEvidence.every((key) => value[key] === 'confirmed') &&
    value.cancelState === 'not_requested'
  )
    return 'defect_observed'
  return 'unavailable'
}

// 真wire容量在JSON解析前檢查，完整兩行與canonical一致才保留診斷。
export function parseNativeProbeSupervisorOutput(stdout) {
  const unknownResult = Object.freeze({
    status: 'unavailable',
    diagnostic: unknownNativeProbeSupervisorDiagnostic(),
  })
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 8192) return unknownResult
  const wire = stdout.replaceAll('\r\n', '\n')
  if (wire.includes('\r')) return unknownResult
  const lines = wire.split('\n')
  if (lines.length !== 3 || lines[2] !== '' || !lines[0].startsWith(supervisorPrefix))
    return unknownResult
  // 外部JSON可無效；例外僅在此解析邊界丟棄，不寫入診斷或log。
  try {
    const diagnostic = validatedSupervisorCopy(JSON.parse(lines[0].slice(supervisorPrefix.length)))
    if (supervisorPrefix + JSON.stringify(diagnostic) !== lines[0]) return unknownResult
    const status = supervisorStatus(diagnostic)
    if (lines[1] !== 'receiver_native_supervisor_result,status=' + status) return unknownResult
    return Object.freeze({ status, diagnostic: Object.freeze({ ...diagnostic }) })
  } catch {
    return unknownResult
  }
}

// v3模型只消費標量事實並產生取消決策，不建立程序、管線或任何原生證據。
export function createNativeProbeSupervisorModel() {
  const value = { ...unknownNativeProbeSupervisorDiagnostic(), cancelState: 'not_requested' }
  const cases = ['case_E0', 'case_E1', 'case_E2', 'case_E7', 'case_O', 'case_R', 'case_A']
  const negative = new Set()
  let failed = false
  let terminal = null
  let lastTime = 0
  let cleanupEnd = null
  let stage = 0
  let processSignaled = false
  let cancelIssued = false
  let caseIndex = 0

  // 首失敗黏住，後續收尾與逾期只能補事實，不能取代原失敗原因。
  function fail(reason) {
    if (failed) return
    failed = true
    value.phase = 'failed'
    value.reason = reason
  }

  // 時間只在標量入口驗一次；保留晚到owned歸屬但不接受逾期成功證據。
  function acceptTime(elapsedMs) {
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs < lastTime) {
      negative.add('resourcesClose')
      value.resourcesClose = 'unconfirmed'
      fail('guard_rejected')
      return false
    }
    lastTime = elapsedMs
    if (elapsedMs >= (cleanupEnd ?? 18000)) {
      // 首失敗不覆寫，但缺少有效預算內結案時不得保留可信收尾的接受證據。
      negative.add('resourcesClose')
      value.resourcesClose = 'unconfirmed'
      fail('deadline')
    }
    return true
  }

  return Object.freeze({
    // 監督邊界與PS還原是不同owner；只有固定事件與嚴格布林可改動模型。
    observe(kind, elapsedMs, result) {
      if (terminal || !acceptTime(elapsedMs)) return
      if (typeof kind !== 'string' || typeof result !== 'boolean') {
        fail('guard_rejected')
        return
      }
      if (kind === 'supervisorBoundaryVerify') {
        if (
          stage !== 0 ||
          failed ||
          cleanupEnd !== null ||
          value.supervisorBoundaryVerify !== 'unknown'
        ) {
          fail('guard_rejected')
          return
        }
        value.supervisorBoundaryVerify = result ? 'confirmed' : 'unconfirmed'
        if (!result) fail('guard_rejected')
        return
      }
      if (['suspended', 'assigned', 'resumed'].includes(kind)) {
        if (
          value.supervisorBoundaryVerify !== 'confirmed' ||
          processSignaled ||
          value.childExit === 'confirmed' ||
          kind !== ['suspended', 'assigned', 'resumed'][stage]
        ) {
          fail('guard_rejected')
          return
        }
        if (kind === 'resumed' && (failed || cleanupEnd !== null)) {
          fail('guard_rejected')
          return
        }
        if (failed && value.reason !== 'deadline' && value.reason !== 'cleanup_unconfirmed') return
        if (kind === 'assigned') value.jobAssigned = result ? 'confirmed' : 'unconfirmed'
        if (kind === 'resumed') value.childStart = result ? 'confirmed' : 'unconfirmed'
        if (!result) {
          fail('io_failed')
          return
        }
        stage++
        if (cleanupEnd !== null) fail('cleanup_unconfirmed')
        return
      }
      if (elapsedMs >= (cleanupEnd ?? 18000)) return
      if (kind === 'processSignaled') {
        if (stage === 0 || (!result && (processSignaled || value.childExit === 'confirmed'))) {
          fail('guard_rejected')
          return
        }
        if (result) processSignaled = true
        return
      }
      if (['stdoutOverflow', 'stderrOverflow'].includes(kind)) {
        if (result) {
          const key = kind === 'stdoutOverflow' ? 'stdoutEof' : 'stderrEof'
          negative.add(key)
          value[key] = 'unconfirmed'
        }
        fail(result ? 'unexpected_output' : 'guard_rejected')
        return
      }
      if (kind === 'stderrInterrupted') {
        if (
          !failed &&
          stage === 3 &&
          cases[caseIndex] === 'case_R' &&
          result &&
          cleanupEnd === null &&
          value.childExit !== 'confirmed'
        ) {
          value.caseSet = 'mismatched'
          fail('native_stderr_interrupted')
        } else fail('guard_rejected')
        return
      }
      if (cases.includes(kind)) {
        if (failed) return
        if (
          stage !== 3 ||
          cleanupEnd !== null ||
          value.childExit === 'confirmed' ||
          kind !== cases[caseIndex]
        ) {
          fail('guard_rejected')
          return
        }
        if (!result) {
          value.caseSet = 'mismatched'
          fail('case_mismatch')
          return
        }
        caseIndex++
        if (caseIndex === cases.length) value.caseSet = 'matched'
        return
      }
      if (kind === 'cancelled') {
        if (!cancelIssued) {
          fail('guard_rejected')
          return
        }
        if (!result) negative.add(kind)
        value.cancelState = result && !negative.has(kind) ? 'requested' : 'unconfirmed'
        return
      }
      if (!supervisorEvidence.includes(kind) || ['childStart', 'jobAssigned'].includes(kind)) {
        fail('guard_rejected')
        return
      }
      if (
        stage === 0 ||
        (kind === 'childExit' && stage !== 3) ||
        (kind === 'treeEmpty' &&
          (value.jobAssigned !== 'confirmed' ||
            (!processSignaled && value.childExit !== 'confirmed'))) ||
        (kind === 'resourcesClose' &&
          (cleanupEnd === null ||
            (!processSignaled && value.childExit !== 'confirmed') ||
            ['treeEmpty', 'stdoutEof', 'stderrEof'].some((key) => value[key] !== 'confirmed')))
      ) {
        fail('guard_rejected')
        return
      }
      const confirmed = result && !(kind === 'childExit' && cancelIssued)
      if (!confirmed) {
        negative.add(kind)
        fail('cleanup_unconfirmed')
      }
      value[kind] = confirmed && !negative.has(kind) ? 'confirmed' : 'unconfirmed'
    },
    // 一次取消決策與共用絕對截止，job歸屬成立後永不退回單process。
    cleanup(elapsedMs) {
      if (terminal || !acceptTime(elapsedMs))
        return Object.freeze({ target: 'none', deadlineMs: cleanupEnd })
      if (cleanupEnd === null) cleanupEnd = Math.min(20000, elapsedMs + 2000)
      let target = 'none'
      if (!cancelIssued && elapsedMs < cleanupEnd) {
        if (value.jobAssigned === 'confirmed') {
          if (
            value.treeEmpty !== 'confirmed' ||
            (!processSignaled && value.childExit !== 'confirmed')
          )
            target = 'owned_job'
        } else if (stage > 0 && !processSignaled && value.childExit !== 'confirmed') {
          target = 'owned_process'
        }
        if (target !== 'none') {
          cancelIssued = true
          value.cancelState = 'unconfirmed'
          fail('cleanup_unconfirmed')
        }
      }
      return Object.freeze({ target, deadlineMs: cleanupEnd })
    },
    // 凍結副本與terminal分離，外部改動不能回寫尚在觀察的模型。
    snapshot() {
      return Object.freeze({ ...value })
    },
    // 缺任一證據就失敗結案；signaled不是正常退出，晚到事件不復活終態。
    finish(elapsedMs) {
      if (terminal) return terminal
      acceptTime(elapsedMs)
      if (
        !failed &&
        cleanupEnd !== null &&
        value.caseSet === 'matched' &&
        value.cancelState === 'not_requested' &&
        supervisorEvidence.every((key) => value[key] === 'confirmed')
      ) {
        value.phase = 'complete'
        value.reason = 'none'
      } else fail('cleanup_unconfirmed')
      terminal = Object.freeze({ ...value })
      return terminal
    },
  })
}
