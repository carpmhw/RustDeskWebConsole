param([ValidateSet('SingleLine','Multiline','Mismatch','ScopeDenied')][string]$Case='SingleLine',
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1,
      [switch]$Child,[switch]$DiagnosticSelfTest)
# 公開全文校準專用；不控制Notepad／clipboard，不建立listener／網路或HR資料。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$shutdown=$null;$cleanup=$null;$phase='policy';$sample=$null

# 模組載入前即驗本機private source與祖先；不修ACL、不讀外部配置／私有JSON。
function Assert-UiaSource([string]$Path,[bool]$Directory) {
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

# 全欄位及語義重驗，representation只固定公開enum，不能反射未知字串／getter。
function Assert-UiaCalibrationSample($Value,[string]$ExpectedCase) {
    Assert-HostFields $Value @('kind','case','scopeVerified','scopeRejected','textWasRead','readable','stable','exact','fixtureRecognized','representation')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.case -isnot [string] -or $Value.case -cne $ExpectedCase -or $Value.representation -isnot [string]) { throw 'guard' }
    foreach ($name in @('scopeVerified','scopeRejected','textWasRead','readable','stable','exact','fixtureRecognized')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    if ($ExpectedCase -ceq 'ScopeDenied') {
        if ($Value.scopeVerified -or $Value.readable -or $Value.stable -or $Value.exact -or $Value.fixtureRecognized -or $Value.representation -cne 'not_read' -or ($Value.scopeRejected -and $Value.textWasRead)) { throw 'guard' }
        return
    }
    if (@('SingleLine','Multiline','Mismatch') -cnotcontains $ExpectedCase -or $Value.scopeRejected -or ($Value.scopeVerified -and -not $Value.textWasRead) -or ($Value.readable -and -not $Value.scopeVerified) -or ($Value.stable -and -not $Value.readable) -or ($Value.exact -and -not $Value.stable) -or ($Value.fixtureRecognized -and -not $Value.stable)) { throw 'guard' }
    if ($Value.representation -ceq 'unknown') {
        if ($Value.fixtureRecognized) { throw 'guard' }
        return
    }
    $allowed=@('single_exact','single_suffix_cr','single_suffix_lf','single_suffix_crlf')
    if ($ExpectedCase -ceq 'Mismatch') { $allowed=@('negative_exact','negative_suffix_cr','negative_suffix_lf','negative_suffix_crlf') }
    elseif ($ExpectedCase -ceq 'Multiline') {
        $allowed=@('multiline_crlf_exact','multiline_crlf_suffix_cr','multiline_crlf_suffix_lf','multiline_crlf_suffix_crlf','multiline_lf_exact','multiline_lf_suffix_cr','multiline_lf_suffix_lf','multiline_lf_suffix_crlf','multiline_cr_exact','multiline_cr_suffix_cr','multiline_cr_suffix_lf','multiline_cr_suffix_crlf')
    }
    $expectedExact=$Value.representation -ceq 'single_exact' -or $Value.representation -ceq 'multiline_crlf_exact'
    if ($allowed -cnotcontains $Value.representation -or -not $Value.scopeVerified -or -not $Value.textWasRead -or -not $Value.readable -or -not $Value.stable -or -not $Value.fixtureRecognized -or $Value.exact -ne $expectedExact) { throw 'guard' }
}

# 只有固定child stage可進終端；未知extra／stage拒絕，不輸出exception或frame。
function Read-UiaFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','coordinate_setup','automation_setup','session_setup','bind_scope','ready_write','sample_command','snapshot','scope_sample','classify','stop_command','closed_write','editor_point','editor_process','editor_bounds','editor_identity','editor_type','editor_pattern','editor_text_read','editor_text_validate')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}

# child只寫固定安全frame及明確LF，同步flush受parent單一期限監督。
function Write-UiaFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}

# 最多八層只查known bounds exception型別，不以任意錯誤／Message代替scope拒絕。
function Test-UiaBoundsDenied($Record) {
    $exception=$Record.Exception
    for ($index=0;$index -lt 8 -and $null -ne $exception;$index++) {
        if ($exception -is [HostEditorBoundsException]) { return $true }
        $exception=$exception.InnerException
    }
    return $false
}
# 自測只驗真sample validator的欄位／語義，不能接觸UIA或建立child。
function Test-UiaCalibrationSchema {
    foreach ($pair in @(@('SingleLine','single_exact',$true),@('SingleLine','single_suffix_cr',$false),@('Multiline','multiline_crlf_exact',$true),@('Multiline','multiline_lf_suffix_cr',$false),@('Mismatch','negative_exact',$false))) {
        $value=[pscustomobject]@{kind='sample';case=$pair[0];scopeVerified=$true;scopeRejected=$false;textWasRead=$true;readable=$true;stable=$true;exact=$pair[2];fixtureRecognized=$true;representation=$pair[1]}
        Assert-UiaCalibrationSample $value $pair[0]
    }
    $value='{"kind":"sample","case":"ScopeDenied","scopeVerified":false,"scopeRejected":true,"textWasRead":false,"readable":false,"stable":false,"exact":false,"fixtureRecognized":false,"representation":"not_read"}' | ConvertFrom-Json
    Assert-UiaCalibrationSample $value 'ScopeDenied'
    # 所有公開表示都可經validator，但exact只允許canonical raw全文。
    foreach ($ending in @('crlf','lf','cr')) {
        foreach ($suffix in @('exact','suffix_cr','suffix_lf','suffix_crlf')) {
            $representation='multiline_'+$ending+'_'+$suffix
            $exact=$ending -ceq 'crlf' -and $suffix -ceq 'exact'
            $value=[pscustomobject]@{kind='sample';case='Multiline';scopeVerified=$true;scopeRejected=$false;textWasRead=$true;readable=$true;stable=$true;exact=$exact;fixtureRecognized=$true;representation=$representation}
            Assert-UiaCalibrationSample $value 'Multiline'
        }
    }
    foreach ($mode in @('SingleLine','Mismatch')) {
        foreach ($suffix in @('exact','suffix_cr','suffix_lf','suffix_crlf')) {
            $prefix='single_';if ($mode -ceq 'Mismatch') { $prefix='negative_' }
            $value=[pscustomobject]@{kind='sample';case=$mode;scopeVerified=$true;scopeRejected=$false;textWasRead=$true;readable=$true;stable=$true;exact=($mode -ceq 'SingleLine' -and $suffix -ceq 'exact');fixtureRecognized=$true;representation=($prefix+$suffix)}
            Assert-UiaCalibrationSample $value $mode
        }
    }
    $literal='{"kind":"sample","case":"SingleLine","scopeVerified":true,"scopeRejected":false,"textWasRead":true,"readable":true,"stable":true,"exact":true,"fixtureRecognized":true,"representation":"single_exact"}'
    foreach ($mutation in @('extra','wrong_bool','wrong_case','unknown_repr','inconsistent_exact','inconsistent_scope','not_read','unrecognized','unstable')) {
        $value=$literal | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName extra -NotePropertyValue 'Public metadata' }
            'wrong_bool' { $value.exact='True' }
            'wrong_case' { $value.case='Mismatch' }
            'unknown_repr' { $value.representation='Public metadata' }
            'inconsistent_exact' { $value.exact=$false }
            'inconsistent_scope' { $value.scopeRejected=$true }
            'not_read' { $value.textWasRead=$false }
            'unrecognized' { $value.fixtureRecognized=$false }
            'unstable' { $value.stable=$false }
        }
        $rejected=$false
        try { Assert-UiaCalibrationSample $value 'SingleLine' } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $value=$literal | ConvertFrom-Json
    $value.PSObject.Properties.Remove('exact')
    $script:uiaGetterRead=$false
    # 未知getter不執行；完整普通欄位檢查必須先於取exact值。
    $value | Add-Member -MemberType ScriptProperty -Name exact -Value { $script:uiaGetterRead=$true;return $true }
    $rejected=$false
    try { Assert-UiaCalibrationSample $value 'SingleLine' } catch { $rejected=$true }
    if (-not $rejected -or $script:uiaGetterRead) { throw 'guard' }
    foreach ($stage in @('editor_point','editor_process','editor_bounds','editor_identity','editor_type','editor_pattern','editor_text_read','editor_text_validate')) {
        $value=[pscustomobject]@{kind='failed';stage=$stage}
        if ((Read-UiaFailureStage $value) -cne ('child_'+$stage)) { throw 'guard' }
    }
    foreach ($json in @('null','[]','{"kind":"failed","stage":"Public metadata"}','{"kind":"failed","stage":true}','{"kind":"failed","stage":"editor_bounds","extra":1}')) {
        $value=$json | ConvertFrom-Json;$rejected=$false
        try { [void](Read-UiaFailureStage $value) } catch { $rejected=$true }
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
    if (($Child -and $DiagnosticSelfTest) -or @('SingleLine','Multiline','Mismatch','ScopeDenied') -cnotcontains $Case -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096 -or ($Case -ceq 'ScopeDenied' -and $Width -eq 21 -and $Height -eq 31)) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    Assert-UiaSource $PSScriptRoot $true;Assert-UiaSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $native=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $core=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    foreach ($path in @($supervisor,$native,$geometry,$core,$reader)) { Assert-UiaSource $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-UiaCalibrationSchema
        [Console]::WriteLine('host_uia_calibration_schema_observed,liveTextQueries=false');exit 0
    }
    if ($Child) {
        $phase='compile';Add-Type -LiteralPath @($native,$geometry,$core) -ErrorAction Stop
        $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
        $phase='automation_setup';Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
        try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
        . $reader
        $editor=@{x=$X;y=$Y;width=$Width;height=$Height}
        $script:editorIdentity=$null;$script:editorTextCalls=0
        $phase='bind_scope';[void](Get-HostEditorPattern $editor)
        $phase='ready_write';Write-UiaFrame @{kind='ready';case=$Case}
        $phase='sample_command';if ([Console]::In.ReadLine() -cne 'sample') { throw 'guard' }
        $before=$after=$ignored=$null
        try {
            if ($Case -ceq 'ScopeDenied') {
                $phase='scope_sample';$denied=@{x=$X;y=$Y;width=21;height=31};$boundsDenied=$false
                try { $ignored=Read-HostEditorText $denied } catch {
                    $boundsDenied=Test-UiaBoundsDenied $_
                    if (-not $boundsDenied) { throw 'guard' }
                } finally { $ignored=$null }
                $sample=@{kind='sample';case=$Case;scopeVerified=$false;scopeRejected=($boundsDenied -and $script:editorTextCalls -eq 0);textWasRead=($script:editorTextCalls -gt 0);readable=$false;stable=$false;exact=$false;fixtureRecognized=$false;representation='not_read'}
            } else {
                $phase='snapshot';$before=Read-HostEditorText $editor;$after=Read-HostEditorText $editor
                $phase='classify';$result=[HostEditorCalibration]::ClassifySnapshot($before,$after,$Case)
                $sample=@{kind='sample';case=$Case;scopeVerified=$true;scopeRejected=$false;textWasRead=($script:editorTextCalls -gt 0);readable=$result.Readable;stable=$result.Stable;exact=$result.Exact;fixtureRecognized=$result.FixtureRecognized;representation=$result.Representation}
            }
        } finally { $before=$after=$ignored=$null }
        Write-UiaFrame $sample
        $phase='stop_command';if ([Console]::In.ReadLine() -cne 'stop') { throw 'guard' }
        $phase='closed_write';Write-UiaFrame @{kind='closed'};exit 0
    }
    $phase='startup'
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -Case {1} -X {2} -Y {3} -Width {4} -Height {5} -Child',$PSCommandPath,$Case,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-UiaFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind','case')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'ready' -or $frame.case -isnot [string] -or $frame.case -cne $Case -or $owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $query=[Diagnostics.Stopwatch]::StartNew()
    $phase='query_write';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply';$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_json';$sample=$reply | ConvertFrom-Json;$reply=$null
    $phase='query_schema'
    if ($sample.kind -ceq 'failed') { $phase=Read-UiaFailureStage $sample;throw 'guard' }
    Assert-UiaCalibrationSample $sample $Case
    if ($query.ElapsedMilliseconds -ge 1000) { throw 'guard' }
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-UiaFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'closed') { throw 'guard' }
    $cleanup=Stop-HostOwnedProcess $owned $true $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $observed=$sample.scopeVerified -and $sample.textWasRead -and $sample.readable -and $sample.stable -and $sample.fixtureRecognized -and -not $sample.scopeRejected
    if ($Case -ceq 'Mismatch') { $observed=$observed -and -not $sample.exact }
    elseif ($Case -ceq 'ScopeDenied') { $observed=$sample.scopeRejected -and -not $sample.textWasRead }
    $marker='host_uia_calibration_unavailable';if ($observed) { $marker='host_uia_calibration_observed' }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case={1},scopeVerified={2},scopeRejected={3},textWasRead={4},readable={5},stable={6},exact={7},fixtureRecognized={8},representation={9},processExited=True',$marker,$Case,$sample.scopeVerified,$sample.scopeRejected,$sample.textWasRead,$sample.readable,$sample.stable,$sample.exact,$sample.fixtureRecognized,$sample.representation))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_uia_calibration_schema_unavailable,stage='+$phase) }
    elseif ($Child) {
        if (@('bind_scope','snapshot','scope_sample') -ccontains $phase -and $null -ne $script:editorStage) { $phase=$script:editorStage }
        try { Write-UiaFrame @{kind='failed';stage=$phase} } catch {}
    } else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_uia_calibration_unavailable,case='+$Case+',stage='+$phase+',processExited='+$exited)
    }
    exit 2
} finally {
    if ($null -ne $owned) {
        if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
        [void](Stop-HostOwnedProcess $owned $false $shutdown)
    }
}
