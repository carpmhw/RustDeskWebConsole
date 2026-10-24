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
