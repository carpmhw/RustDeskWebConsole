param([switch]$NotificationOverflow,[switch]$AllowClipboardOverwrite,[switch]$DiagnosticSelfTest,[switch]$Child,
      [switch]$FailureDiagnostic,[switch]$OpenFailureDiagnostic,[int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# 獨立opt-in候選；最多65次固定公開發布，不讀舊clip或恢復內容，實際執行另授權。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$native=$null;$writer=$null;$shutdown=$null;$cleanup=$null;$phase='policy';$changeState='not_requested'
$trace=$null;$safeDiagnostic=$null;$diagnosticModuleLoaded=$false
$openCollector=$null;$safeOpenDiagnostic=$null;$openDiagnosticModuleLoaded=$false

# 只依固定basename與明確mode選source，不接受任意path或跨版本fallback。
function Get-OverflowSourceNames([string]$ScriptName,[bool]$Diagnostic,[bool]$Open=$false) {
    $standard=[string]::Equals($ScriptName,'calibrate-windows-clipboard-overflow.ps1',[StringComparison]::OrdinalIgnoreCase)
    $isDiagnosticAlias=[string]::Equals($ScriptName,'calibrate-windows-clipboard-overflow-diagnostic.ps1',[StringComparison]::OrdinalIgnoreCase)
    # 02專用入口只復用固定共同來源，不接受任意版本或path。
    $openDiagnostic=[string]::Equals($ScriptName,'calibrate-windows-clipboard-overflow-open-diagnostic.ps1',[StringComparison]::OrdinalIgnoreCase) -or [string]::Equals($ScriptName,'calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1',[StringComparison]::OrdinalIgnoreCase)
    if ($Open) {
        if ($standard) { return [pscustomobject]@{Core='windows-clipboard-overflow-core.cs';Fixture='windows-clipboard-overflow-fixture.cs'} }
        if ($openDiagnostic) { return [pscustomobject]@{Core='windows-clipboard-overflow-core-open-diagnostic.cs';Fixture='windows-clipboard-overflow-fixture-open-diagnostic.cs'} }
        throw 'guard'
    }
    if ($openDiagnostic) { throw 'guard' }
    if ($Diagnostic -and $isDiagnosticAlias) {
        return [pscustomobject]@{Core='windows-clipboard-overflow-core-diagnostic.cs';Fixture='windows-clipboard-overflow-fixture-diagnostic.cs'}
    }
    return [pscustomobject]@{Core='windows-clipboard-overflow-core.cs';Fixture='windows-clipboard-overflow-fixture.cs'}
}

# 只驗flags與固定basename；既有四參數呼叫維持原mode語義。
function Test-OverflowMode([bool]$Overflow,[bool]$Allow,[bool]$Self,[bool]$IsChild,[bool]$Failure=$false,[bool]$Open=$false,[string]$ScriptName='calibrate-windows-clipboard-overflow.ps1') {
    $standard=[string]::Equals($ScriptName,'calibrate-windows-clipboard-overflow.ps1',[StringComparison]::OrdinalIgnoreCase)
    $openAlias=[string]::Equals($ScriptName,'calibrate-windows-clipboard-overflow-open-diagnostic.ps1',[StringComparison]::OrdinalIgnoreCase) -or [string]::Equals($ScriptName,'calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1',[StringComparison]::OrdinalIgnoreCase)
    if (($Open -and (-not $Failure -or (-not $standard -and -not $openAlias))) -or ($openAlias -and -not $Open)) { return $false }
    if ($Self) { return (-not $Overflow -and -not $Allow -and -not $IsChild) }
    return ($Overflow -and $Allow)
}

# parent沿用原closed/failed base validator，再將open metadata獨立降級驗型。
function Split-OverflowParentFrame($Frame) {
    if ($OpenFailureDiagnostic) { return (Split-OverflowOpenDiagnosticFrame $Frame) }
    if ($FailureDiagnostic) {
        $split=Split-OverflowDiagnosticFrame $Frame
        return [pscustomobject]@{Primary=$split.Primary;Diagnostic=$split.Diagnostic;OpenDiagnostic=$null}
    }
    return [pscustomobject]@{Primary=$Frame;Diagnostic=$null;OpenDiagnostic=$null}
}

# 只在parent已決定primary之後輸出；module未通過source guard時只用固定fallback。
function Write-OverflowParentDiagnostic {
    try {
        if ($diagnosticModuleLoaded) { Write-OverflowDiagnostic $safeDiagnostic ([Console]::Out) }
        else { [Console]::WriteLine('host_clipboard_overflow_diagnostic_unavailable') }
    } catch {}
}

# 新native診斷在舊primary與legacy diagnostic之後最多輸出一行。
function Write-OverflowParentOpenDiagnostic {
    try {
        if ($openDiagnosticModuleLoaded) { Write-OverflowOpenDiagnostic $safeOpenDiagnostic ([Console]::Out) }
        else { [Console]::WriteLine('host_clipboard_overflow_open_diagnostic_unavailable') }
    } catch {}
}

# Snapshot只從child自有RAM轉成五欄普通物件，不呼writer或其他native。
function Add-OverflowFrameDiagnostic($Frame) {
    try {
        if ($null -ne $trace) {
            $snapshot=$trace.Snapshot()
            $Frame['diagnostic']=[pscustomobject]@{stopStage=$snapshot.StopStage;stopReason=$snapshot.StopReason;attempts=$snapshot.Attempts;sampleCode=$snapshot.SampleCode;tailProof=$snapshot.TailProof}
        }
    } catch {}
}

# 新快照只附三個普通安全字串，轉換失敗時保留原frame。
function Add-OverflowFrameOpenDiagnostic($Frame) {
    try {
        if ($null -ne $openCollector) {
            $snapshot=$openCollector.SealAndSnapshot()
            if ($null -ne $snapshot) {
                $Frame['openDiagnostic']=[pscustomobject]@{state=$snapshot.State;errorClass=$snapshot.ErrorClass;openerSnapshot=$snapshot.OpenerSnapshot}
            }
        }
    } catch {}
}

# source保持owner-only／protected NTFS／non-reparse，不修改既有ACL或輸出SID。
function Assert-OverflowSource([string]$Path,[bool]$Directory) {
    $full=[IO.Path]::GetFullPath($Path);$root=[IO.Path]::GetPathRoot($full)
    if ($root.StartsWith('\',[StringComparison]::Ordinal)) { throw 'guard' }
    $drive=[IO.DriveInfo]::new($root)
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') { throw 'guard' }
    $item=Get-Item -LiteralPath $full -Force
    if ($item.PSIsContainer -ne $Directory -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'guard' }
    $acl=Get-Acl -LiteralPath $full
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $script:sid -or ($Directory -and -not $acl.AreAccessRulesProtected)) { throw 'guard' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference -ne $script:sid) { throw 'guard' }
    }
    $parent=$item.Directory;if ($Directory) { $parent=$item.Parent }
    while ($null -ne $parent) {
        if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'guard' }
        $parent=$parent.Parent
    }
}

# 欄位必先是普通NoteProperty；不為取得kind／code執行未知getter。
function Assert-OverflowShape($Value,[bool]$Closed) {
    $fields=@('kind','scopeVerified','producerCompleted','publications','retainedNotifications','first64Verified','overflowObserved','contentReadAttempted','code')
    $bools=@('scopeVerified','producerCompleted','first64Verified','overflowObserved','contentReadAttempted')
    $kind='sample'
    if ($Closed) { $fields+=@('overflowSticky','writerResourcesClosed','listenerResourcesClosed','resourcesClosed');$bools+=@('overflowSticky','writerResourcesClosed','listenerResourcesClosed','resourcesClosed');$kind='closed' }
    Assert-HostFields $Value $fields
    if ($Value.kind -isnot [string] -or $Value.kind -cne $kind -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in $bools) { if ($Value.$name -isnot [bool]) { throw 'guard' } }
    Assert-HostInteger $Value.publications 0 65;Assert-HostInteger $Value.retainedNotifications 0 64
    $codes=@('host_observation_overflow','host_capability_unavailable','host_cleanup_unavailable','host_scope_changed','host_clipboard_unstable')
    if ($codes -cnotcontains $Value.code -or $Value.contentReadAttempted -or $Value.retainedNotifications -gt $Value.publications) { throw 'guard' }
    if ($Value.first64Verified -ne ($Value.retainedNotifications -eq 64)) { throw 'guard' }
    if ($Value.producerCompleted -and ($Value.publications -ne 65 -or -not $Value.first64Verified)) { throw 'guard' }
    if ($Value.overflowObserved -and (-not $Value.producerCompleted -or -not $Value.first64Verified)) { throw 'guard' }
    if ($Closed) {
        if ($Value.resourcesClosed -ne ($Value.writerResourcesClosed -and $Value.listenerResourcesClosed) -or ($Value.overflowSticky -and -not $Value.overflowObserved)) { throw 'guard' }
    }
    if ($Value.code -ceq 'host_observation_overflow') {
        if (-not $Value.scopeVerified -or -not $Value.producerCompleted -or $Value.publications -ne 65 -or $Value.retainedNotifications -ne 64 -or -not $Value.first64Verified -or -not $Value.overflowObserved) { throw 'guard' }
        if ($Closed -and (-not $Value.overflowSticky -or -not $Value.resourcesClosed)) { throw 'guard' }
    }
}

# sample與closed各自精確驗型，不接受未知附加欄位。
function Assert-OverflowSample($Value) { Assert-OverflowShape $Value $false }

# Closed是安全Result12欄，不帶第65筆raw row／late原生metadata。
function Assert-OverflowClosed($Value) { Assert-OverflowShape $Value $true }

# 負向成功要求True的overflow及正常cleanup，不能用code或兩個false補票。
function Test-OverflowObserved($Sample,$Closed) {
    Assert-OverflowSample $Sample;Assert-OverflowClosed $Closed
    foreach ($name in @('producerCompleted','publications','retainedNotifications','first64Verified','overflowObserved','contentReadAttempted')) {
        if ($Sample.$name -cne $Closed.$name) { throw 'guard' }
    }
    if ($Closed.scopeVerified -and -not $Sample.scopeVerified) { throw 'guard' }
    if ($Closed.code -ceq 'host_observation_overflow' -and $Sample.code -cne 'host_observation_overflow') { throw 'guard' }
    return ($Sample.code -ceq 'host_observation_overflow' -and $Closed.code -ceq 'host_observation_overflow' -and $Closed.scopeVerified -and $Closed.producerCompleted -and $Closed.publications -eq 65 -and $Closed.retainedNotifications -eq 64 -and $Closed.first64Verified -and $Closed.overflowObserved -and $Closed.overflowSticky -and -not $Closed.contentReadAttempted -and $Closed.resourcesClosed)
}

# 失敗只轉固定stage，沒有exception原文或未知frame輸出。
function Read-OverflowFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','coordinate_setup','session_setup','bind_scope','listener','writer_setup','ready_write','sample_command','scope_before','burst','scope_after','sample_write','stop_command','scope_tail','native_close','closed_write','editor_point','editor_process','editor_bounds','editor_identity','editor_type','editor_pattern')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}

# 同child frame明確LF及8KiB bound，僅傳安全DTO。
function Write-OverflowFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}

# 手寫literal oracle先於入口接線，不建child／Add-Type／UIA或碰clipboard。
function Test-OverflowSchema {
    $sampleLiteral='{"kind":"sample","scopeVerified":true,"producerCompleted":true,"publications":65,"retainedNotifications":64,"first64Verified":true,"overflowObserved":true,"contentReadAttempted":false,"code":"host_observation_overflow"}'
    $closedLiteral='{"kind":"closed","scopeVerified":true,"producerCompleted":true,"publications":65,"retainedNotifications":64,"first64Verified":true,"overflowObserved":true,"contentReadAttempted":false,"code":"host_observation_overflow","overflowSticky":true,"writerResourcesClosed":true,"listenerResourcesClosed":true,"resourcesClosed":true}'
    $sample=$sampleLiteral | ConvertFrom-Json;$closed=$closedLiteral | ConvertFrom-Json
    if (-not (Test-OverflowObserved $sample $closed)) { throw 'guard' }
    foreach ($name in @('scopeVerified','producerCompleted','first64Verified','overflowObserved','contentReadAttempted')) {
        foreach ($mutation in @('flip','missing','type')) {
            $value=$sampleLiteral | ConvertFrom-Json
            if ($mutation -eq 'flip') { $value.$name=-not $value.$name }
            elseif ($mutation -eq 'missing') { $value.PSObject.Properties.Remove($name) }
            else { $value.$name='True' }
            $rejected=$false;try { Assert-OverflowSample $value } catch { $rejected=$true }
            if (-not $rejected) { throw 'guard' }
        }
    }
    foreach ($mutation in @('extra','missing','code','count64','count66','retained63','retained65','float')) {
        $value=$sampleLiteral | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'missing' { $value.PSObject.Properties.Remove('code') }
            'code' { $value.code='Unknown public code' }
            'count64' { $value.publications=64 }
            'count66' { $value.publications=66 }
            'retained63' { $value.retainedNotifications=63 }
            'retained65' { $value.retainedNotifications=65 }
            'float' { $value.publications=65.0 }
        }
        $rejected=$false;try { Assert-OverflowSample $value } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    foreach ($name in @('scopeVerified','producerCompleted','first64Verified','overflowObserved','contentReadAttempted','overflowSticky','writerResourcesClosed','listenerResourcesClosed','resourcesClosed')) {
        $value=$closedLiteral | ConvertFrom-Json;$value.$name=-not $value.$name
        $rejected=$false;try { Assert-OverflowClosed $value } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    foreach ($mutation in @('late_overflow','writer','listener','scope','negative_code')) {
        $value=$closedLiteral | ConvertFrom-Json
        switch ($mutation) {
            'late_overflow' { $value.overflowSticky=$false;$value.code='host_capability_unavailable' }
            'writer' { $value.writerResourcesClosed=$false;$value.resourcesClosed=$false;$value.code='host_cleanup_unavailable' }
            'listener' { $value.listenerResourcesClosed=$false;$value.resourcesClosed=$false;$value.code='host_cleanup_unavailable' }
            'scope' { $value.scopeVerified=$false;$value.code='host_scope_changed' }
            'negative_code' { $value.code='host_capability_unavailable' }
        }
        if (Test-OverflowObserved $sample $value) { throw 'guard' }
    }
    $partial='{"kind":"sample","scopeVerified":true,"producerCompleted":false,"publications":32,"retainedNotifications":32,"first64Verified":false,"overflowObserved":false,"contentReadAttempted":false,"code":"host_capability_unavailable"}' | ConvertFrom-Json
    $partialClosed='{"kind":"closed","scopeVerified":true,"producerCompleted":false,"publications":32,"retainedNotifications":32,"first64Verified":false,"overflowObserved":false,"contentReadAttempted":false,"code":"host_capability_unavailable","overflowSticky":false,"writerResourcesClosed":true,"listenerResourcesClosed":true,"resourcesClosed":true}' | ConvertFrom-Json
    if (Test-OverflowObserved $partial $partialClosed) { throw 'guard' }
    $partialClosed.publications=33;$rejected=$false
    try { [void](Test-OverflowObserved $partial $partialClosed) } catch { $rejected=$true }
    if (-not $rejected) { throw 'guard' }
    $value=$sampleLiteral | ConvertFrom-Json;$value.PSObject.Properties.Remove('code');$script:overflowGetterRead=$false
    # getter絕不可在ordinary欄位驗證之前被讀取。
    $value | Add-Member -MemberType ScriptProperty -Name code -Value { $script:overflowGetterRead=$true;return 'host_observation_overflow' }
    $rejected=$false;try { Assert-OverflowSample $value } catch { $rejected=$true }
    if (-not $rejected -or $script:overflowGetterRead) { throw 'guard' }
    $errorRecord=[Management.Automation.ErrorRecord]::new([InvalidOperationException]::new('Public metadata'),'Public',[Management.Automation.ErrorCategory]::NotSpecified,$null)
    $rejected=$false;try { Assert-OverflowSample $errorRecord } catch { $rejected=$true }
    if (-not $rejected) { throw 'guard' }
    foreach ($overflow in @($false,$true)) { foreach ($allow in @($false,$true)) { foreach ($self in @($false,$true)) { foreach ($childMode in @($false,$true)) {
        $want=($overflow -and $allow -and -not $self) -or ($self -and -not $overflow -and -not $allow -and -not $childMode)
        if ((Test-OverflowMode $overflow $allow $self $childMode) -ne $want) { throw 'guard' }
    } } } }
    foreach ($stage in @('burst','scope_tail','editor_bounds')) {
        if ((Read-OverflowFailureStage ([pscustomobject]@{kind='failed';stage=$stage})) -cne ('child_'+$stage)) { throw 'guard' }
    }
    foreach ($stage in @('Unknown public stage','BURST','diagnostic_selftest')) {
        $rejected=$false;try { [void](Read-OverflowFailureStage ([pscustomobject]@{kind='failed';stage=$stage})) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $bytes=[Text.Encoding]::UTF8.GetBytes('{"kind":"ready"}'+"`n");$stream=[IO.MemoryStream]::new($bytes)
    try { if ((Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000) -cne '{"kind":"ready"}') { throw 'guard' } }
    finally { $stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length) }
    foreach ($bytes in @(([Text.Encoding]::UTF8.GetBytes(('A'*8193)+"`n")),([byte[]]@(255,10)))) {
        $stream=[IO.MemoryStream]::new($bytes);$rejected=$false
        try { [void](Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000) } catch { $rejected=$true }
        finally { $stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length) }
        if (-not $rejected) { throw 'guard' }
    }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned' -or (Get-ExecutionPolicy -Scope Process) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User;$principal=[Security.Principal.WindowsPrincipal]::new($identity)
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $phase='flags'
    $scriptName=[IO.Path]::GetFileName($PSCommandPath)
    if (-not (Test-OverflowMode ([bool]$NotificationOverflow) ([bool]$AllowClipboardOverwrite) ([bool]$DiagnosticSelfTest) ([bool]$Child) ([bool]$FailureDiagnostic) ([bool]$OpenFailureDiagnostic) $scriptName) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) {
        if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' }
    }
    Assert-OverflowSource $PSScriptRoot $true;Assert-OverflowSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $sourceNames=Get-OverflowSourceNames $scriptName ([bool]$FailureDiagnostic) ([bool]$OpenFailureDiagnostic)
    $core=Join-Path $PSScriptRoot $sourceNames.Core
    $fixture=Join-Path $PSScriptRoot $sourceNames.Fixture
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$reader,$core,$fixture)) { Assert-OverflowSource $path $false }
    . $supervisor
    if ($FailureDiagnostic) {
        $diagnosticModule=Join-Path $PSScriptRoot 'windows-clipboard-overflow-diagnostic.ps1'
        Assert-OverflowSource $diagnosticModule $false
        . $diagnosticModule
        $diagnosticModuleLoaded=$true
    }
    if ($OpenFailureDiagnostic) {
        $openDiagnosticModule=Join-Path $PSScriptRoot 'windows-clipboard-overflow-open-diagnostic.ps1'
        Assert-OverflowSource $openDiagnosticModule $false
        . $openDiagnosticModule
        $openDiagnosticModuleLoaded=$true
    }
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-OverflowSchema
        if ($FailureDiagnostic) {
            Test-OverflowDiagnosticSchema
            if ($OpenFailureDiagnostic) {
                Test-OverflowOpenDiagnosticSchema
                [Console]::WriteLine('host_clipboard_overflow_open_diagnostic_schema_observed,liveClipboardQueries=false,clipboardWritten=false');exit 0
            }
            [Console]::WriteLine('host_clipboard_overflow_diagnostic_schema_observed,liveClipboardQueries=false,clipboardWritten=false');exit 0
        }
        [Console]::WriteLine('host_clipboard_overflow_schema_observed,liveClipboardQueries=false,clipboardWritten=false');exit 0
    }
    if ($Child) {
        $phase='compile';Add-Type -LiteralPath @($nativeSource,$geometry,$editorCore,$core,$fixture) -ErrorAction Stop
        Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        if ($FailureDiagnostic) { $trace=[HostOverflowDiagnosticTrace]::new() }
        if ($OpenFailureDiagnostic) { $openCollector=[HostOpenFailureCollector]::new() }
        $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
        $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
        try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
        . $reader
        $editor=@{x=$X;y=$Y;width=$Width;height=$Height};$script:editorIdentity=$null;$script:editorTextCalls=0
        $phase='bind_scope';[void](Get-HostEditorPattern $editor)
        $phase='writer_setup'
        if ($OpenFailureDiagnostic) { $writer=[HostClipboardOverflowWindows]::StartWindows($trace,$openCollector) }
        elseif ($FailureDiagnostic) { $writer=[HostClipboardOverflowWindows]::StartWindows($trace) }
        else { $writer=[HostClipboardOverflowWindows]::StartWindows() }
        if (-not $writer.Ready) { throw 'guard' }
        $phase='listener';$native=[HostObserverNative]::new()
        $notices=[HostClipboardOverflowNotices]::new($native)
        if (-not $notices.Ready -or $notices.Drain().Length -ne 0 -or $notices.Overflow) { throw 'guard' }
        if ($FailureDiagnostic) { $coordinator=[HostClipboardOverflowCoordinator]::new($trace) }
        else { $coordinator=[HostClipboardOverflowCoordinator]::new() }
        $phase='ready_write';Write-OverflowFrame @{kind='ready'}
        $phase='sample_command';if ([Console]::In.ReadLine() -cne 'sample') { throw 'guard' }
        $phase='scope_before';[void](Get-HostEditorPattern $editor)
        $phase='burst';$budget=[HostClipboardOverflowBudget]::new()
        $sample=$coordinator.Run($writer,$notices,$budget,$true)
        if ($null -ne $trace) { $trace.RecordSample($sample.Code) }
        $phase='scope_after';[void](Get-HostEditorPattern $editor)
        if ($sample.code -ceq 'host_observation_overflow' -and -not $writer.MatchesPublished()) { throw 'guard' }
        $phase='sample_write';Write-OverflowFrame @{kind='sample';scopeVerified=$sample.ScopeVerified;producerCompleted=$sample.ProducerCompleted;publications=$sample.Publications;retainedNotifications=$sample.RetainedNotifications;first64Verified=$sample.First64Verified;overflowObserved=$sample.OverflowObserved;contentReadAttempted=$sample.ContentReadAttempted;code=$sample.Code}
        $phase='stop_command';if ([Console]::In.ReadLine() -cne 'stop') { throw 'guard' }
        # owner及scope在window仍存活時驗，不在Destroy後補造proof。
        $phase='scope_tail';$scopeTail=$false;$publicationTail=$false
        try { [void](Get-HostEditorPattern $editor);$scopeTail=$true } catch { if ($null -ne $trace) { $trace.RecordFailure('scope','scope_unavailable') } }
        if ($sample.Publications -gt 0) {
            if ($null -ne $trace) { $trace.BeginTail() }
            try { $publicationTail=$writer.MatchesPublished() } finally { if ($null -ne $trace) { $trace.EndTail() } }
        }
        $phase='native_close';$writerClosed=$false;$listenerClosed=$false
        try { $writerClosed=$writer.Stop() } catch {} finally { $writer=$null }
        try { $listenerClosed=$native.Stop() } catch {}
        $late=$native.Drain();$overflowAfterStop=$native.Overflow;$native=$null
        $result=[HostClipboardOverflowCalibration]::Classify($sample,$scopeTail,$publicationTail,$writerClosed,$listenerClosed,$overflowAfterStop,$late.Length)
        $phase='closed_write';$closedFrame=@{kind='closed';scopeVerified=$result.ScopeVerified;producerCompleted=$result.ProducerCompleted;publications=$result.Publications;retainedNotifications=$result.RetainedNotifications;first64Verified=$result.First64Verified;overflowObserved=$result.OverflowObserved;contentReadAttempted=$result.ContentReadAttempted;code=$result.Code;overflowSticky=$result.OverflowSticky;writerResourcesClosed=$result.WriterResourcesClosed;listenerResourcesClosed=$result.ListenerResourcesClosed;resourcesClosed=$result.ResourcesClosed}
        if ($FailureDiagnostic) { Add-OverflowFrameDiagnostic $closedFrame }
        if ($OpenFailureDiagnostic) { Add-OverflowFrameOpenDiagnostic $closedFrame }
        Write-OverflowFrame $closedFrame
        if (-not $result.ResourcesClosed) { exit 2 };exit 0
    }
    $phase='startup';$info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -NotificationOverflow -AllowClipboardOverwrite -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    if ($FailureDiagnostic) { $info.Arguments+=' -FailureDiagnostic' }
    if ($OpenFailureDiagnostic) { $info.Arguments+=' -OpenFailureDiagnostic' }
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') {
        if ($FailureDiagnostic) { $split=Split-OverflowParentFrame $frame;$frame=$split.Primary;$safeDiagnostic=$split.Diagnostic;$safeOpenDiagnostic=$split.OpenDiagnostic }
        $phase=Read-OverflowFailureStage $frame;throw 'guard'
    }
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'ready' -or $owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $query=[Diagnostics.Stopwatch]::StartNew()
    $phase='query_write';$changeState='unknown';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply';$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_schema';$sample=$reply | ConvertFrom-Json;$reply=$null
    if ($sample.kind -ceq 'failed') {
        if ($FailureDiagnostic) { $split=Split-OverflowParentFrame $sample;$sample=$split.Primary;$safeDiagnostic=$split.Diagnostic;$safeOpenDiagnostic=$split.OpenDiagnostic }
        $phase=Read-OverflowFailureStage $sample;throw 'guard'
    }
    Assert-OverflowSample $sample
    if ($sample.publications -gt 0) { $changeState='published' }
    if ($query.ElapsedMilliseconds -ge 1000) { throw 'guard' }
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($FailureDiagnostic) { $split=Split-OverflowParentFrame $frame;$frame=$split.Primary;$safeDiagnostic=$split.Diagnostic;$safeOpenDiagnostic=$split.OpenDiagnostic }
    if ($frame.kind -ceq 'failed') { $phase=Read-OverflowFailureStage $frame;throw 'guard' }
    Assert-OverflowClosed $frame
    $observed=Test-OverflowObserved $sample $frame
    $cleanup=Stop-HostOwnedProcess $owned $frame.resourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $phase='result';$marker='host_clipboard_overflow_unavailable';if ($observed) { $marker='host_clipboard_overflow_observed' }
     [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=NotificationOverflow,scopeVerified={1},producerCompleted={2},publications={3},retainedNotifications={4},first64Verified={5},overflowObserved={6},overflowSticky={7},contentReadAttempted={8},writerResourcesClosed={9},listenerResourcesClosed={10},resourcesClosed=True,processExited=True,code={11}',$marker,$frame.scopeVerified,$frame.producerCompleted,$frame.publications,$frame.retainedNotifications,$frame.first64Verified,$frame.overflowObserved,$frame.overflowSticky,$frame.contentReadAttempted,$frame.writerResourcesClosed,$frame.listenerResourcesClosed,$frame.code))
     if ($FailureDiagnostic) { Write-OverflowParentDiagnostic }
     if ($OpenFailureDiagnostic) { Write-OverflowParentOpenDiagnostic }
     if (-not $observed) { exit 2 };exit 0
 } catch {
     if ($DiagnosticSelfTest) {
        if ($OpenFailureDiagnostic) { [Console]::WriteLine('host_clipboard_overflow_open_diagnostic_schema_unavailable,stage='+$phase) }
        elseif ($FailureDiagnostic) { [Console]::WriteLine('host_clipboard_overflow_diagnostic_schema_unavailable,stage='+$phase) }
        else { [Console]::WriteLine('host_clipboard_overflow_schema_unavailable,stage='+$phase) }
     }
     elseif ($Child) {
        if ($null -ne $trace) {
            if (@('bind_scope','scope_before','scope_after','scope_tail') -ccontains $phase) { $trace.RecordFailure('scope','scope_unavailable') }
            else { $trace.RecordFailure('unknown','unknown') }
        }
        if (@('bind_scope','scope_before','scope_after','scope_tail') -ccontains $phase -and @('editor_point','editor_process','editor_bounds','editor_identity','editor_type','editor_pattern') -ccontains $script:editorStage) { $phase=$script:editorStage }
        try {
            $failedFrame=@{kind='failed';stage=$phase}
            if ($FailureDiagnostic) { Add-OverflowFrameDiagnostic $failedFrame }
            if ($OpenFailureDiagnostic) { Add-OverflowFrameOpenDiagnostic $failedFrame }
            Write-OverflowFrame $failedFrame
        } catch {}
    } else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
         $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) { $exited=$cleanup.ProcessExited.ToString() }
         [Console]::WriteLine('host_clipboard_overflow_unavailable,case=NotificationOverflow,stage='+$phase+',clipboardChangeState='+$changeState+',processExited='+$exited)
         if ($FailureDiagnostic) { Write-OverflowParentDiagnostic }
         if ($OpenFailureDiagnostic) { Write-OverflowParentOpenDiagnostic }
    }
    exit 2
} finally {
    if ($null -ne $writer) { try { [void]$writer.Stop() } catch {} }
    if ($null -ne $native) { try { [void]$native.Stop() } catch {} }
    if ($null -ne $owned) {
        if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
        [void](Stop-HostOwnedProcess $owned $false $shutdown)
    }
}
