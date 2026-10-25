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
