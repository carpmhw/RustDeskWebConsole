param([switch]$Snapshot,[switch]$DiagnosticSelfTest,[switch]$Child,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# 公開CF_UNICODETEXT單次快照；helper不寫clip、不控制鍵鼠、不查UIA文本、不建立HR資料。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$native=$null;$shutdown=$null;$cleanup=$null;$phase='policy'

# 模組載入前驗本機owner-only source及祖先，不能修ACL或讀未知設定。
function Assert-ClipboardSource([string]$Path,[bool]$Directory) {
    $full=[IO.Path]::GetFullPath($Path);$root=[IO.Path]::GetPathRoot($full)
    if ($root.StartsWith('\',[StringComparison]::Ordinal)) { throw 'guard' }
    $drive=New-Object IO.DriveInfo -ArgumentList $root
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

# 只接受完整安全DTO與一致flags，不把native value的Text／Version或getter帶入結果。
function Assert-ClipboardCalibrationSample($Value) {
    Assert-HostFields $Value @('kind','scopeVerified','readable','stable','exact','ownerMatchesEditor','notifications','overflow','readResourcesClosed','code')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in @('scopeVerified','readable','stable','exact','overflow','readResourcesClosed')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    if ($null -ne $Value.ownerMatchesEditor -and $Value.ownerMatchesEditor -isnot [bool]) { throw 'guard' }
    Assert-HostInteger $Value.notifications 0 64
    $codes=@('host_observed','host_clipboard_busy','host_clipboard_format_unavailable','host_clipboard_unstable','host_text_too_large','host_text_invalid','host_text_unreadable','host_cleanup_unavailable','host_capability_unavailable','host_scope_changed','host_observation_overflow')
    if ($codes -cnotcontains $Value.code) { throw 'guard' }
    if ($Value.readable -and (-not $Value.scopeVerified -or -not $Value.readResourcesClosed -or $Value.overflow -or $Value.code -cne 'host_observed')) { throw 'guard' }
    if (($Value.stable -and -not $Value.readable) -or ($Value.exact -and -not $Value.stable) -or ($null -ne $Value.ownerMatchesEditor -and -not $Value.readable)) { throw 'guard' }
    if ($Value.code -cne 'host_observed' -and ($Value.readable -or $Value.stable -or $Value.exact)) { throw 'guard' }
}

# 固定child失敗stage先驗全部普通欄位；未知字串拒絕、不反射Message／frame。
function Read-ClipboardFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','coordinate_setup','automation_setup','session_setup','bind_scope','listener','ready_write','sample_command','scope_before','clipboard_read','scope_after','version_tail','classify','stop_command','native_close','closed_write','editor_point','editor_process','editor_bounds','editor_identity','editor_type','editor_pattern')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}

# child僅明確LF／8KiB以內的固定metadata，同步stdout由parent watchdog監督。
function Write-ClipboardFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}
# 原生資料型schema先寫oracle；不Add-Type／listener／GUI或讀clip。
function Test-ClipboardCalibrationSchema {
    $literal='{"kind":"sample","scopeVerified":true,"readable":true,"stable":true,"exact":true,"ownerMatchesEditor":true,"notifications":0,"overflow":false,"readResourcesClosed":true,"code":"host_observed"}'
    foreach ($owner in @($true,$false,$null)) {
        $value=$literal | ConvertFrom-Json;$value.ownerMatchesEditor=$owner
        Assert-ClipboardCalibrationSample $value
    }
    foreach ($code in @('host_clipboard_busy','host_clipboard_unstable','host_clipboard_format_unavailable','host_text_too_large','host_text_invalid','host_text_unreadable')) {
        $value=$literal | ConvertFrom-Json
        $value.readable=$value.stable=$value.exact=$false;$value.ownerMatchesEditor=$null;$value.code=$code
        Assert-ClipboardCalibrationSample $value
    }
    foreach ($mutation in @('extra','wrong_bool','wrong_owner','large_count','negative_count','unknown_code','scope','readclose','unstable','overflow')) {
        $value=$literal | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'wrong_bool' { $value.exact='True' }
            'wrong_owner' { $value.ownerMatchesEditor='True' }
            'large_count' { $value.notifications=65 }
            'negative_count' { $value.notifications=-1 }
            'unknown_code' { $value.code='Public metadata' }
            'scope' { $value.scopeVerified=$false }
            'readclose' { $value.readResourcesClosed=$false }
            'unstable' { $value.stable=$false }
            'overflow' { $value.overflow=$true }
        }
        $rejected=$false
        try { Assert-ClipboardCalibrationSample $value } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $value=$literal | ConvertFrom-Json;$value.PSObject.Properties.Remove('code');$script:clipboardGetterRead=$false
    # 必須先驗普通NoteProperty，不執行未知getter。
    $value | Add-Member -MemberType ScriptProperty -Name code -Value { $script:clipboardGetterRead=$true;return 'host_observed' }
    $rejected=$false
    try { Assert-ClipboardCalibrationSample $value } catch { $rejected=$true }
    if (-not $rejected -or $script:clipboardGetterRead) { throw 'guard' }
    foreach ($stage in @('clipboard_read','version_tail','native_close','editor_bounds')) {
        $value=[pscustomobject]@{kind='failed';stage=$stage}
        if ((Read-ClipboardFailureStage $value) -cne ('child_'+$stage)) { throw 'guard' }
    }
    foreach ($json in @('null','[]','{"kind":"failed","stage":"Public metadata"}','{"kind":"failed","stage":true}','{"kind":"failed","stage":"clipboard_read","extra":true}')) {
        $value=$json | ConvertFrom-Json;$rejected=$false
        try { [void](Read-ClipboardFailureStage $value) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User
        $principal=New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $phase='flags'
    if (($Snapshot -eq $DiagnosticSelfTest) -or ($Child -and $DiagnosticSelfTest) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    Assert-ClipboardSource $PSScriptRoot $true;Assert-ClipboardSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $core=Join-Path $PSScriptRoot 'windows-clipboard-calibration.cs'
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$reader,$core)) { Assert-ClipboardSource $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-ClipboardCalibrationSchema
        [Console]::WriteLine('host_clipboard_calibration_schema_observed,liveClipboardQueries=false');exit 0
    }
    if ($Child) {
        $phase='compile';Add-Type -LiteralPath @($nativeSource,$geometry,$editorCore,$core) -ErrorAction Stop
        $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
        $phase='automation_setup';Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
        try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
        . $reader
        $editor=@{x=$X;y=$Y;width=$Width;height=$Height};$script:editorIdentity=$null;$script:editorTextCalls=0
        $phase='bind_scope';[void](Get-HostEditorPattern $editor)
        $phase='listener';$native=New-Object HostObserverNative
        if (-not $native.Ready) { throw 'guard' }
        $phase='ready_write';Write-ClipboardFrame @{kind='ready'}
        $phase='sample_command';if ([Console]::In.ReadLine() -cne 'sample') { throw 'guard' }
        $value=$null;$notifications=0
        try {
            $phase='scope_before';[void](Get-HostEditorPattern $editor)
            foreach ($notice in $native.Drain()) { $notifications++ }
            $phase='clipboard_read'
            if ($native.Overflow) { $value=New-Object HostClipboardValue }
            else { $value=$native.ReadClipboard(0,$script:editorPid) }
            $phase='scope_after';[void](Get-HostEditorPattern $editor)
            $phase='version_tail'
            if ($null -ne $value -and $value.Stable -and -not [HostObserverNative]::SameClipboardVersion(0,$value.Version,[HostObserverNative]::GetClipboardSequenceNumber())) {
                $value.Text=$null;$value.Stable=$false;$value.Code='host_clipboard_unstable'
            }
            foreach ($notice in $native.Drain()) { $notifications++ }
            $phase='classify';$result=[HostClipboardCalibration]::Classify($value,$true,$notifications,$native.Overflow)
            $sample=@{kind='sample';scopeVerified=$result.ScopeVerified;readable=$result.Readable;stable=$result.Stable;exact=$result.Exact;ownerMatchesEditor=$result.OwnerMatchesEditor;notifications=$result.Notifications;overflow=$result.Overflow;readResourcesClosed=$result.ReadResourcesClosed;code=$result.Code}
        } finally { if ($null -ne $value) { $value.Text=$null };$value=$null }
        Write-ClipboardFrame $sample
        $phase='stop_command';if ([Console]::In.ReadLine() -cne 'stop') { throw 'guard' }
        $phase='native_close';$closed=$native.Stop()
        foreach ($notice in $native.Drain()) { $notifications++ }
        $overflow=$native.Overflow;$native=$null
        $phase='closed_write';Write-ClipboardFrame @{kind='closed';resourcesClosed=$closed;notifications=$notifications;overflow=$overflow}
        if (-not $closed) { exit 2 };exit 0
    }
    $phase='startup';$info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -Snapshot -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-ClipboardFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'ready' -or $owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $query=[Diagnostics.Stopwatch]::StartNew()
    $phase='query_write';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply';$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_json';$sample=$reply | ConvertFrom-Json;$reply=$null
    $phase='query_schema'
    if ($sample.kind -ceq 'failed') { $phase=Read-ClipboardFailureStage $sample;throw 'guard' }
    Assert-ClipboardCalibrationSample $sample
    if ($query.ElapsedMilliseconds -ge 1000) { throw 'guard' }
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-ClipboardFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind','resourcesClosed','notifications','overflow')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'closed' -or $frame.resourcesClosed -isnot [bool] -or $frame.overflow -isnot [bool]) { throw 'guard' }
    Assert-HostInteger $frame.notifications $sample.notifications 64
    if ($sample.overflow -and -not $frame.overflow) { throw 'guard' }
    $sample.notifications=$frame.notifications
    if ($frame.overflow) {
        $sample.overflow=$true;$sample.readable=$sample.stable=$sample.exact=$false;$sample.ownerMatchesEditor=$null;$sample.code='host_observation_overflow'
    }
    $cleanup=Stop-HostOwnedProcess $owned $frame.resourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $observed=$sample.scopeVerified -and $sample.readable -and $sample.stable -and $sample.exact -and $sample.readResourcesClosed -and -not $sample.overflow -and $sample.code -ceq 'host_observed'
    $marker='host_clipboard_calibration_unavailable';if ($observed) { $marker='host_clipboard_calibration_observed' }
    $owner='unknown';if ($null -ne $sample.ownerMatchesEditor) { $owner=$sample.ownerMatchesEditor.ToString() }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=Snapshot,scopeVerified={1},readable={2},stable={3},exact={4},ownerMatchesEditor={5},notifications={6},overflow={7},readResourcesClosed={8},code={9},resourcesClosed=True,processExited=True',$marker,$sample.scopeVerified,$sample.readable,$sample.stable,$sample.exact,$owner,$sample.notifications,$sample.overflow,$sample.readResourcesClosed,$sample.code))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_clipboard_calibration_schema_unavailable,stage='+$phase) }
    elseif ($Child) {
        if (@('bind_scope','scope_before','scope_after') -ccontains $phase -and $null -ne $script:editorStage) { $phase=$script:editorStage }
        try { Write-ClipboardFrame @{kind='failed';stage=$phase} } catch {}
    } else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_clipboard_calibration_unavailable,case=Snapshot,stage='+$phase+',processExited='+$exited)
    }
    exit 2
} finally {
    if ($null -ne $native) { [void]$native.Stop() }
    if ($null -ne $owned) {
        if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
        [void](Stop-HostOwnedProcess $owned $false $shutdown)
    }
}
