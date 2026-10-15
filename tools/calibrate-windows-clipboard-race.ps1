param([switch]$QueuedRace,[switch]$DiagnosticSelfTest,[switch]$Child,[switch]$IdentityDiagnostic,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# queued首通知被替代的唯讀校準；不寫clip／控制焦點鍵鼠、不重試或啟動HR。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$native=$shutdown=$cleanup=$null;$phase='policy'

# 模組前驗本機owner-only protected NTFS／祖先non-reparse，不修ACL或讀未知設定。
function Assert-RaceSource([string]$Path,[bool]$Directory) {
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
    while ($null -ne $parent) { if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'guard' };$parent=$parent.Parent }
}
# ready只是child本地fence，不當HR ready、心跳或精確Copy時刻。
function Assert-RaceReady($Value) {
    Assert-HostFields $Value @('kind','armUs')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'ready') { throw 'guard' };Assert-HostInteger $Value.armUs 0 5000000
}
# pending／sample同安全DTO，未知extra／getter先拒絕，staleRejected須完整實際早拒絕證據。
function Assert-RaceSample($Value,[int]$ExpectedAttempts,[int]$PreviousCount) {
    Assert-HostFields $Value @('kind','scopeVerified','firstNotificationObserved','firstAfterArm','replacementObserved','differentVersions','orderVerified','currentVersionMatched','staleRejected','readAttempted','contentWasRead','readResourcesClosed','notifications','overflow','code','sampleAttempts')
    if ($Value.kind -isnot [string] -or @('pending','sample') -cnotcontains $Value.kind -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in @('scopeVerified','firstNotificationObserved','firstAfterArm','replacementObserved','differentVersions','orderVerified','currentVersionMatched','staleRejected','readAttempted','readResourcesClosed','overflow')) { if ($Value.$name -isnot [bool]) { throw 'guard' } }
    if ($null -ne $Value.contentWasRead -and $Value.contentWasRead -isnot [bool]) { throw 'guard' }
    Assert-HostInteger $Value.notifications $PreviousCount 64
    Assert-HostInteger $Value.sampleAttempts $ExpectedAttempts $ExpectedAttempts;Assert-HostInteger $Value.sampleAttempts 0 1200
    $codes=@('host_clipboard_unstable','host_observed','host_clipboard_busy','host_clipboard_format_unavailable','host_text_unreadable','host_text_too_large','host_text_invalid','host_capability_unavailable','host_cleanup_unavailable','host_scope_changed','host_notification_unavailable','host_observation_overflow','host_observation_timeout')
    if ($codes -cnotcontains $Value.code -or $Value.firstNotificationObserved -ne ($Value.notifications -gt 0)) { throw 'guard' }
    if ($Value.firstAfterArm -and -not $Value.firstNotificationObserved) { throw 'guard' }
    if ($Value.replacementObserved -and ($Value.notifications -lt 2 -or -not $Value.firstNotificationObserved)) { throw 'guard' }
    if (($Value.differentVersions -and -not $Value.replacementObserved) -or ($Value.currentVersionMatched -and -not $Value.differentVersions) -or ($Value.orderVerified -and (-not $Value.firstAfterArm -or -not $Value.replacementObserved))) { throw 'guard' }
    if (-not $Value.readAttempted -and ($Value.contentWasRead -isnot [bool] -or $Value.contentWasRead)) { throw 'guard' }
    if ($Value.staleRejected -and (-not $Value.scopeVerified -or -not $Value.firstAfterArm -or -not $Value.differentVersions -or -not $Value.orderVerified -or -not $Value.currentVersionMatched -or -not $Value.readAttempted -or $Value.contentWasRead -isnot [bool] -or $Value.contentWasRead -or -not $Value.readResourcesClosed -or $Value.overflow -or $Value.code -cne 'host_clipboard_unstable')) { throw 'guard' }
    if ($Value.kind -ceq 'pending' -and (-not $Value.scopeVerified -or $Value.readAttempted -or $Value.replacementObserved -or $Value.staleRejected -or $Value.overflow -or -not $Value.readResourcesClosed -or $Value.code -cne 'host_notification_unavailable' -or ($Value.firstNotificationObserved -and -not $Value.firstAfterArm))) { throw 'guard' }
}
# Stop後補late counter／sticky overflow，不因thread退出而假裝所有native已清。
function Assert-RaceClosed($Value,[int]$PreviousCount,[bool]$PreviousOverflow) {
    Assert-HostFields $Value @('kind','resourcesClosed','notifications','overflow')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'closed' -or $Value.resourcesClosed -isnot [bool] -or $Value.overflow -isnot [bool]) { throw 'guard' }
    Assert-HostInteger $Value.notifications $PreviousCount 64
    if ($PreviousOverflow -and -not $Value.overflow) { throw 'guard' }
}
# 固定stage先完整白名單驗，不輸出native exception／未知frame。
function Read-RaceFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $stages=@('policy','flags','source','compile','coordinate_setup','automation_setup','session_setup','bind_scope','listener','ready_write','command_read','sample_limit','scope_before','notice_drain','version_before','clipboard_read','scope_after','version_tail','classify','sample_write','native_close','closed_write','editor_point','editor_process','editor_bounds','editor_identity','editor_type','editor_pattern')
    if ($script:IdentityDiagnostic) {
        $stages+=@('editor_identity_runtime_get','editor_identity_runtime_empty','editor_identity_process_get','editor_identity_start_get','editor_identity_window_get','editor_identity_bounds_get','editor_identity_compose','editor_identity_baseline_missing','editor_identity_compare','editor_identity_runtime_changed','editor_identity_process_changed','editor_identity_start_changed','editor_identity_window_changed','editor_identity_bounds_changed','editor_identity_composite_changed')
    }
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $stages -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}
# 所有frame只固定LF／8KiB內metadata，child同步writer由parent query期限監督。
function Write-RaceFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' };[Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}
# 只逐欄複製安全DTO，不serialize state／native value／notice或unknown properties。
function New-RaceFrame($Result,[string]$Kind,[int]$Attempts) {
    return @{kind=$Kind;scopeVerified=$Result.ScopeVerified;firstNotificationObserved=$Result.FirstNotificationObserved;firstAfterArm=$Result.FirstAfterArm;replacementObserved=$Result.ReplacementObserved;differentVersions=$Result.DifferentVersions;orderVerified=$Result.OrderVerified;currentVersionMatched=$Result.CurrentVersionMatched;staleRejected=$Result.StaleRejected;readAttempted=$Result.ReadAttempted;contentWasRead=$Result.ContentWasRead;readResourcesClosed=$Result.ReadResourcesClosed;notifications=$Result.Notifications;overflow=$Result.Overflow;code=$Result.Code;sampleAttempts=$Attempts}
}
# 新資料型oracle先寫，不compile／UIA／listener／讀clip或改內容。
function Test-RaceSchema {
    $literal='{"kind":"sample","scopeVerified":true,"firstNotificationObserved":true,"firstAfterArm":true,"replacementObserved":true,"differentVersions":true,"orderVerified":true,"currentVersionMatched":true,"staleRejected":true,"readAttempted":true,"contentWasRead":false,"readResourcesClosed":true,"notifications":2,"overflow":false,"code":"host_clipboard_unstable","sampleAttempts":2}'
    Assert-RaceSample ($literal | ConvertFrom-Json) 2 1
    foreach ($mutation in @('extra','type','count','attempt','scope','arm','replacement','versions','order','current','reject_code','content','read','close','overflow')) {
        $value=$literal | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName version -NotePropertyValue 7 }
            'type' { $value.staleRejected='True' }
            'count' { $value.notifications=1 }
            'attempt' { $value.sampleAttempts=3 }
            'scope' { $value.scopeVerified=$false }
            'arm' { $value.firstAfterArm=$false }
            'replacement' { $value.replacementObserved=$false }
            'versions' { $value.differentVersions=$false }
            'order' { $value.orderVerified=$false }
            'current' { $value.currentVersionMatched=$false }
            'reject_code' { $value.code='host_observed' }
            'content' { $value.contentWasRead=$null }
            'read' { $value.readAttempted=$false }
            'close' { $value.readResourcesClosed=$false }
            'overflow' { $value.overflow=$true }
        }
        $rejected=$false;try { Assert-RaceSample $value 2 1 } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $pending=$literal | ConvertFrom-Json
    $pending.kind='pending';$pending.replacementObserved=$pending.differentVersions=$pending.orderVerified=$pending.currentVersionMatched=$pending.staleRejected=$pending.readAttempted=$false
    $pending.notifications=1;$pending.code='host_notification_unavailable'
    Assert-RaceSample $pending 2 0
    $pending.readAttempted=$true;$rejected=$false
    try { Assert-RaceSample $pending 2 0 } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    $value=$literal | ConvertFrom-Json;$value.PSObject.Properties.Remove('code');$script:raceGetterRead=$false
    # 未知getter先拒絕，不能執行後才驗code。
    $value | Add-Member -MemberType ScriptProperty -Name code -Value { $script:raceGetterRead=$true;return 'host_clipboard_unstable' }
    $rejected=$false;try { Assert-RaceSample $value 2 0 } catch { $rejected=$true }
    if (-not $rejected -or $script:raceGetterRead) { throw 'guard' }
    Assert-RaceReady ('{"kind":"ready","armUs":100}' | ConvertFrom-Json)
    Assert-RaceClosed ('{"kind":"closed","resourcesClosed":true,"notifications":2,"overflow":false}' | ConvertFrom-Json) 1 $false
    foreach ($json in @('{"kind":"closed","resourcesClosed":"True","notifications":2,"overflow":false}','{"kind":"closed","resourcesClosed":true,"notifications":0,"overflow":false}','{"kind":"closed","resourcesClosed":true,"notifications":65,"overflow":false}')) {
        $rejected=$false;try { Assert-RaceClosed ($json | ConvertFrom-Json) 1 $false } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    $rejected=$false;try { Assert-RaceClosed ('{"kind":"closed","resourcesClosed":true,"notifications":2,"overflow":false}' | ConvertFrom-Json) 2 $true } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    $value=$literal | ConvertFrom-Json;$script:raceGetterRead=$false
    # builder不能因source另含Text getter而serialize整個native物件。
    $value | Add-Member -MemberType ScriptProperty -Name Text -Value { $script:raceGetterRead=$true;return 'Public metadata' }
    $built=(New-RaceFrame $value 'sample' 2) | ConvertTo-Json -Compress
    Assert-RaceSample ($built | ConvertFrom-Json) 2 0;if ($script:raceGetterRead) { throw 'guard' }
    foreach ($json in @('null','[]','{"kind":"failed","stage":"Public metadata"}','{"kind":"failed","stage":"compile","extra":true}')) {
        $rejected=$false;try { [void](Read-RaceFailureStage ($json | ConvertFrom-Json)) } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    if ((Read-RaceFailureStage ('{"kind":"failed","stage":"compile"}' | ConvertFrom-Json)) -cne 'child_compile') { throw 'guard' }
}

# 新診斷oracle只執行真正metadata組合／guard與普通literal fixture，不載入UIA或編譯C#。
function Test-RaceIdentitySchema {
    # 公開完整fixture只替代不可在資料型自測呼叫的UIA／Process getter。
    $makeFixture={
        $element=[pscustomobject]@{Current=[pscustomobject]@{NativeWindowHandle=9}}
        # RuntimeId是測試literal，不來自真實視窗或程序。
        $element | Add-Member -MemberType ScriptMethod -Name GetRuntimeId -Value { return [int[]]@(3,41) }
        return @{Element=$element;Process=[pscustomobject]@{Id=41;StartTime=[datetime]::new([long]638000000000000000)};Rect=[pscustomobject]@{X=0;Y=152;Width=1075;Height=508}}
    }
    $fixture=& $makeFixture
    $baseline=Get-HostEditorIdentitySnapshot $fixture.Element $fixture.Process $fixture.Rect
    if ($baseline.Key -cne '3,41:41:638000000000000000:9:0:152:1075:508') { throw 'guard' }
    Assert-HostEditorIdentitySnapshot $baseline $baseline $baseline.Key
    foreach ($case in @(
        @('Runtime','editor_identity_runtime_changed'),@('Process','editor_identity_process_changed'),
        @('Start','editor_identity_start_changed'),@('Window','editor_identity_window_changed'),
        @('Bounds','editor_identity_bounds_changed'),@('Key','editor_identity_composite_changed')
    )) {
        $current=$baseline.Clone();$current[$case[0]]='Public changed';$current.Key='Public changed key'
        $rejected=$false;try { Assert-HostEditorIdentitySnapshot $current $baseline $baseline.Key } catch { $rejected=$true }
        if (-not $rejected -or $script:editorStage -cne $case[1]) { throw 'guard' }
        $frame=[pscustomobject]@{kind='failed';stage=$case[1]}
        if ((Read-RaceFailureStage $frame) -cne ('child_'+$case[1])) { throw 'guard' }
    }
    $current=$baseline.Clone();$current.Key='Public changed key';$current.Runtime='Public runtime';$current.Window='Public window'
    $rejected=$false;try { Assert-HostEditorIdentitySnapshot $current $baseline $baseline.Key } catch { $rejected=$true }
    if (-not $rejected -or $script:editorStage -cne 'editor_identity_runtime_changed') { throw 'guard' }
    $rejected=$false;try { Assert-HostEditorIdentitySnapshot $baseline $null $baseline.Key } catch { $rejected=$true }
    if (-not $rejected -or $script:editorStage -cne 'editor_identity_baseline_missing') { throw 'guard' }
    # 完整key相同即沿原guard通過，不因診斷component另有不同而改變原成功條件。
    $current=$baseline.Clone();$current.Runtime='Public different diagnostic component'
    Assert-HostEditorIdentitySnapshot $current $baseline $baseline.Key
    foreach ($case in @(
        @('runtime','editor_identity_runtime_get'),@('process','editor_identity_process_get'),
        @('start','editor_identity_start_get'),@('window','editor_identity_window_get'),
        @('bounds','editor_identity_bounds_get'),@('empty','editor_identity_runtime_empty')
    )) {
        $fixture=& $makeFixture
        switch ($case[0]) {
            # 只getter／method邊界失敗，實際組合函數與stage仍用production。
            'runtime' { $fixture.Element.PSObject.Members.Remove('GetRuntimeId');$fixture.Element | Add-Member -MemberType ScriptMethod -Name GetRuntimeId -Value { throw 'public_fixture' } }
            'process' { $fixture.Process.PSObject.Properties.Remove('Id');$fixture.Process | Add-Member -MemberType ScriptProperty -Name Id -Value { throw 'public_fixture' } }
            'start' { $fixture.Process.PSObject.Properties.Remove('StartTime');$fixture.Process | Add-Member -MemberType ScriptProperty -Name StartTime -Value { throw 'public_fixture' } }
            'window' { $fixture.Element.Current.PSObject.Properties.Remove('NativeWindowHandle');$fixture.Element.Current | Add-Member -MemberType ScriptProperty -Name NativeWindowHandle -Value { throw 'public_fixture' } }
            'bounds' { $fixture.Rect.PSObject.Properties.Remove('X');$fixture.Rect | Add-Member -MemberType ScriptProperty -Name X -Value { throw 'public_fixture' } }
            'empty' { $fixture.Element.PSObject.Members.Remove('GetRuntimeId');$fixture.Element | Add-Member -MemberType ScriptMethod -Name GetRuntimeId -Value { return [int[]]@() } }
        }
        $rejected=$false;try { [void](Get-HostEditorIdentitySnapshot $fixture.Element $fixture.Process $fixture.Rect) } catch { $rejected=$true }
        if (-not $rejected -or $script:editorStage -cne $case[1]) { throw 'guard' }
        if ((Read-RaceFailureStage ([pscustomobject]@{kind='failed';stage=$case[1]})) -cne ('child_'+$case[1])) { throw 'guard' }
    }
    foreach ($json in @('{"kind":"failed","stage":"editor_identity_runtime_changed","runtimeId":3}','{"kind":"failed","stage":"editor_identity_unknown_changed"}')) {
        $rejected=$false;try { [void](Read-RaceFailureStage ($json | ConvertFrom-Json)) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $before=$script:IdentityDiagnostic
    try {
        $script:IdentityDiagnostic=$false;$rejected=$false
        try { [void](Read-RaceFailureStage ([pscustomobject]@{kind='failed';stage='editor_identity_runtime_changed'})) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    } finally { $script:IdentityDiagnostic=$before }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User;$principal=New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $phase='flags'
    if (($QueuedRace -eq $DiagnosticSelfTest) -or ($Child -and $DiagnosticSelfTest) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    Assert-RaceSource $PSScriptRoot $true;Assert-RaceSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1';$nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs';$editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1';$snapshotCore=Join-Path $PSScriptRoot 'windows-clipboard-calibration.cs'
    $notificationCore=Join-Path $PSScriptRoot 'windows-clipboard-notification-calibration.cs';$core=Join-Path $PSScriptRoot 'windows-clipboard-race-calibration.cs'
    if ($IdentityDiagnostic) { $reader=Join-Path $PSScriptRoot 'windows-host-editor-identity.ps1' }
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$reader,$snapshotCore,$notificationCore,$core)) { Assert-RaceSource $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-RaceSchema
        if ($IdentityDiagnostic) {
            . $reader
            Test-RaceIdentitySchema
            [Console]::WriteLine('host_clipboard_race_identity_schema_observed,liveClipboardQueries=false,liveTextQueries=false');exit 0
        }
        [Console]::WriteLine('host_clipboard_race_schema_observed,liveClipboardQueries=false');exit 0
    }
    if ($Child) {
        $phase='compile';Add-Type -LiteralPath @($nativeSource,$geometry,$editorCore,$snapshotCore,$notificationCore,$core) -ErrorAction Stop
        $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
        $phase='automation_setup';Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
        try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
        . $reader
        $editor=@{x=$X;y=$Y;width=$Width;height=$Height};$script:editorIdentity=$null;$script:editorIdentitySnapshot=$null;$script:editorTextCalls=0
        $phase='bind_scope';[void](Get-HostEditorPattern $editor)
        $state=New-Object HostClipboardRaceCalibration;$attempts=0;$firstReported=$measured=$false
        $phase='listener';$native=New-Object HostObserverNative;if (-not $native.Ready) { throw 'guard' }
        $armUs=$native.Microseconds();$phase='ready_write';Write-RaceFrame @{kind='ready';armUs=$armUs}
        while ($true) {
            $phase='command_read';$command=[Console]::In.ReadLine();if ($command -ceq 'stop') { break }
            if ($command -cne 'sample' -or $measured -or -not $native.Ready) { throw 'guard' }
            $phase='sample_limit';if ($attempts -ge 1200 -or $native.Microseconds() -ge 120000000) { throw 'guard' };$attempts++
            $phase='scope_before';[void](Get-HostEditorPattern $editor)
            $phase='notice_drain';$state.Capture($native.Drain(),$native.Overflow)
            $startUs=$native.Microseconds();$first=$state.First();$replacement=$state.Replacement()
            if (-not $state.Overflow -and ($null -eq $first -or ($state.FirstEligible($armUs,$startUs) -and $null -eq $replacement))) {
                $result=$state.Classify($null,$true,$armUs,$startUs,$startUs,0,0)
                $phase='sample_write';Write-RaceFrame (New-RaceFrame $result 'pending' $attempts)
                if ($null -ne $first) { $firstReported=$true };continue
            }
            $value=$null;$beforeVersion=$tailVersion=[uint32]0
            try {
                # 首pending尚未回報就出現replacement，不把額外來源當第二次operator Copy。
                if ($firstReported -and $state.CanProbe($armUs,$startUs)) {
                    $phase='version_before';$beforeVersion=[HostObserverNative]::GetClipboardSequenceNumber()
                    $phase='clipboard_read';$value=$native.ReadClipboard($first.Version,$script:editorPid)
                }
                $phase='scope_after';[void](Get-HostEditorPattern $editor)
                $phase='notice_drain';$state.Capture($native.Drain(),$native.Overflow)
                $phase='version_tail';if ($null -ne $value) { $tailVersion=[HostObserverNative]::GetClipboardSequenceNumber() }
                $endUs=$native.Microseconds();$phase='classify';$result=$state.Classify($value,$true,$armUs,$startUs,$endUs,$beforeVersion,$tailVersion)
                $sample=New-RaceFrame $result 'sample' $attempts
            } finally { if ($null -ne $value) { $value.Text=$null };$value=$first=$replacement=$null }
            $measured=$true;$phase='sample_write';Write-RaceFrame $sample
        }
        $phase='native_close';$closed=$native.Stop()
        $phase='notice_drain';$state.Capture($native.Drain(),$native.Overflow);$native=$null
        $phase='closed_write';Write-RaceFrame @{kind='closed';resourcesClosed=$closed;notifications=$state.Notifications;overflow=$state.Overflow}
        if (-not $closed) { exit 2 };exit 0
    }
    $phase='startup';$info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -QueuedRace -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    if ($IdentityDiagnostic) { $info.Arguments+=' -IdentityDiagnostic' }
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-RaceFailureStage $frame;throw 'guard' };Assert-RaceReady $frame
    if ($owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $observation=$owned.Startup;$attempts=$count=0;$markedFirst=$false;$sample=$lastPending=$null
    [Console]::WriteLine('host_clipboard_race_armed,scopeVerified=True,liveClipboardQueries=false')
    while ($observation.ElapsedMilliseconds -lt 119000 -and $attempts -lt 1200) {
        $query=[Diagnostics.Stopwatch]::StartNew();$phase='query_write';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
        $phase='query_reply';$frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000) | ConvertFrom-Json
        $phase='query_schema';if ($frame.kind -ceq 'failed') { $phase=Read-RaceFailureStage $frame;throw 'guard' }
        Assert-RaceSample $frame ($attempts+1) $count
        if ($query.ElapsedMilliseconds -ge 1000 -or $observation.ElapsedMilliseconds -ge 120000) { throw 'guard' }
        $attempts=$frame.sampleAttempts;$count=$frame.notifications
        if ($frame.kind -ceq 'sample') { $sample=$frame;break }
        $lastPending=$frame
        if ($frame.firstNotificationObserved -and -not $markedFirst) {
            $markedFirst=$true;[Console]::WriteLine('host_clipboard_race_first_notice_captured,scopeVerified=True,liveClipboardQueries=false')
        }
        [Threading.Thread]::Sleep(100)
    }
    if ($null -eq $sample) {
        if ($null -ne $lastPending) { $sample=$lastPending;$sample.kind='sample';$sample.code='host_observation_timeout' }
        else { throw 'guard' }
    }
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew();Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-RaceFailureStage $frame;throw 'guard' }
    Assert-RaceClosed $frame $sample.notifications $sample.overflow
    $sample.notifications=$frame.notifications;$sample.firstNotificationObserved=($frame.notifications -gt 0)
    if ($frame.overflow) { $sample.overflow=$true;$sample.staleRejected=$false;$sample.code='host_observation_overflow' }
    Assert-RaceSample $sample $attempts $count
    $cleanup=Stop-HostOwnedProcess $owned $frame.resourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $observed=$markedFirst -and $sample.staleRejected
    $marker='host_clipboard_race_unavailable';if ($observed) { $marker='host_clipboard_race_observed' }
    $content='unknown';if ($null -ne $sample.contentWasRead) { $content=$sample.contentWasRead.ToString() }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=QueuedStale,scopeVerified={1},firstNotificationObserved={2},firstAfterArm={3},replacementObserved={4},differentVersions={5},orderVerified={6},currentVersionMatched={7},staleRejected={8},readAttempted={9},contentWasRead={10},readResourcesClosed={11},notifications={12},overflow={13},sampleAttempts={14},code={15},resourcesClosed=True,processExited=True',$marker,$sample.scopeVerified,$sample.firstNotificationObserved,$sample.firstAfterArm,$sample.replacementObserved,$sample.differentVersions,$sample.orderVerified,$sample.currentVersionMatched,$sample.staleRejected,$sample.readAttempted,$content,$sample.readResourcesClosed,$sample.notifications,$sample.overflow,$sample.sampleAttempts,$sample.code))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) {
        $marker='host_clipboard_race_schema_unavailable';if ($IdentityDiagnostic) { $marker='host_clipboard_race_identity_schema_unavailable' }
        [Console]::WriteLine($marker+',stage='+$phase)
    }
    elseif ($Child) {
        if (@('bind_scope','scope_before','scope_after') -ccontains $phase -and $null -ne $script:editorStage) { $phase=$script:editorStage }
        try { Write-RaceFrame @{kind='failed';stage=$phase} } catch {}
    } else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_clipboard_race_unavailable,case=QueuedStale,stage='+$phase+',processExited='+$exited)
    }
    exit 2
} finally {
    if ($null -ne $native) { [void]$native.Stop() }
    if ($null -ne $owned) { if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() };[void](Stop-HostOwnedProcess $owned $false $shutdown) }
}
