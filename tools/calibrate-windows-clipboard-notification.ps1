param([switch]$ObserveNotification,[switch]$DiagnosticSelfTest,[switch]$Child,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# 公開唯讀通知校準；只觀察第一筆真正通知，不控制焦點／鍵鼠／clip、不啟動HR。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$native=$shutdown=$cleanup=$null;$phase='policy'

# 載入模組前驗本機NTFS／同owner／protected目錄及祖先非reparse，不修ACL或讀未知設定。
function Assert-NotificationSource([string]$Path,[bool]$Directory) {
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

# arm只代表child本地通知fence；全部普通欄位先驗，不當HR ready或心跳。
function Assert-NotificationReady($Value) {
    Assert-HostFields $Value @('kind','armUs')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'ready') { throw 'guard' }
    Assert-HostInteger $Value.armUs 0 5000000
}

# 等待通知時不得讀clip；pending必零通知／未overflow且scope有效，attempt連續不重用。
function Assert-NotificationPending($Value,[int]$ExpectedAttempts) {
    Assert-HostFields $Value @('kind','scopeVerified','notifications','overflow','sampleAttempts')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'pending' -or $Value.scopeVerified -isnot [bool] -or -not $Value.scopeVerified -or $Value.overflow -isnot [bool] -or $Value.overflow) { throw 'guard' }
    Assert-HostInteger $Value.notifications 0 0
    Assert-HostInteger $Value.sampleAttempts $ExpectedAttempts $ExpectedAttempts
    Assert-HostInteger $Value.sampleAttempts 1 1200
}

# 公開sample不含ordinal／sequence／時間／文字；精確值必同第一筆通知與版本／scope／cleanup成立。
function Assert-NotificationSample($Value,[int]$ExpectedAttempts) {
    Assert-HostFields $Value @('kind','scopeVerified','readable','stable','exact','ownerMatchesEditor','notifications','overflow','readResourcesClosed','code','notificationObserved','notificationAfterArm','notificationOrderVerified','notificationVersionMatched','sampleAttempts')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in @('scopeVerified','readable','stable','exact','overflow','readResourcesClosed','notificationObserved','notificationAfterArm','notificationOrderVerified','notificationVersionMatched')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    if ($null -ne $Value.ownerMatchesEditor -and $Value.ownerMatchesEditor -isnot [bool]) { throw 'guard' }
    Assert-HostInteger $Value.notifications 0 64
    Assert-HostInteger $Value.sampleAttempts $ExpectedAttempts $ExpectedAttempts
    Assert-HostInteger $Value.sampleAttempts 0 1200
    $codes=@('host_observed','host_clipboard_busy','host_clipboard_format_unavailable','host_clipboard_unstable','host_text_too_large','host_text_invalid','host_text_unreadable','host_cleanup_unavailable','host_capability_unavailable','host_scope_changed','host_observation_overflow','host_notification_unavailable','host_observation_timeout')
    if ($codes -cnotcontains $Value.code -or $Value.notificationObserved -ne ($Value.notifications -gt 0)) { throw 'guard' }
    if (($Value.notificationAfterArm -and -not $Value.notificationObserved) -or ($Value.notificationOrderVerified -and -not $Value.notificationAfterArm)) { throw 'guard' }
    if ($Value.readable -ne $Value.stable -or ($Value.exact -and -not $Value.stable) -or ($null -ne $Value.ownerMatchesEditor -and -not $Value.readable)) { throw 'guard' }
    if ($Value.readable -and (-not $Value.scopeVerified -or -not $Value.readResourcesClosed -or $Value.overflow -or $Value.code -cne 'host_observed' -or -not $Value.notificationVersionMatched)) { throw 'guard' }
    if ($Value.notificationVersionMatched -and (-not $Value.notificationOrderVerified -or -not $Value.readable)) { throw 'guard' }
    if ($Value.code -cne 'host_observed' -and ($Value.readable -or $Value.stable -or $Value.exact -or $Value.notificationVersionMatched)) { throw 'guard' }
}

# Stop後仍保留所有late通知／sticky overflow；count不能倒退，thread退出不能代替native收尾。
function Assert-NotificationClosed($Value,[int]$PreviousCount,[bool]$PreviousOverflow) {
    Assert-HostFields $Value @('kind','resourcesClosed','notifications','overflow')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'closed' -or $Value.resourcesClosed -isnot [bool] -or $Value.overflow -isnot [bool]) { throw 'guard' }
    Assert-HostInteger $Value.notifications $PreviousCount 64
    if ($PreviousOverflow -and -not $Value.overflow) { throw 'guard' }
}

# 只反射白名單stage，不將exception／frame原文印出；先驗普通NoteProperty再取值。
function Read-NotificationFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $stages=@('policy','flags','source','compile','coordinate_setup','automation_setup','session_setup','bind_scope','listener','ready_write','command_read','sample_limit','scope_before','notice_drain','clipboard_read','scope_after','version_tail','classify','sample_write','native_close','closed_write','editor_point','editor_process','editor_bounds','editor_identity','editor_type','editor_pattern')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $stages -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}

# child只寫明確LF／8KiB以內固定metadata；同步write仍受parent單次query watchdog監督。
function Write-NotificationFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}

# 僅把production安全DTO逐欄複製，不serialize native value／state／通知或未知物件。
function New-NotificationSample($Result,[int]$Attempts) {
    return @{kind='sample';scopeVerified=$Result.ScopeVerified;readable=$Result.Readable;stable=$Result.Stable;exact=$Result.Exact;ownerMatchesEditor=$Result.OwnerMatchesEditor;notifications=$Result.Notifications;overflow=$Result.Overflow;readResourcesClosed=$Result.ReadResourcesClosed;code=$Result.Code;notificationObserved=$Result.NotificationObserved;notificationAfterArm=$Result.NotificationAfterArm;notificationOrderVerified=$Result.NotificationOrderVerified;notificationVersionMatched=$Result.NotificationVersionMatched;sampleAttempts=$Attempts}
}
# 新通知schema的資料型oracle先寫；不compile、建listener／GUI或讀clip。
function Test-NotificationSchema {
    Assert-NotificationReady ('{"kind":"ready","armUs":100}' | ConvertFrom-Json)
    Assert-NotificationPending ('{"kind":"pending","scopeVerified":true,"notifications":0,"overflow":false,"sampleAttempts":1}' | ConvertFrom-Json) 1
    $literal='{"kind":"sample","scopeVerified":true,"readable":true,"stable":true,"exact":true,"ownerMatchesEditor":true,"notifications":1,"overflow":false,"readResourcesClosed":true,"code":"host_observed","notificationObserved":true,"notificationAfterArm":true,"notificationOrderVerified":true,"notificationVersionMatched":true,"sampleAttempts":1}'
    foreach ($owner in @($true,$false,$null)) {
        $value=$literal | ConvertFrom-Json;$value.ownerMatchesEditor=$owner;Assert-NotificationSample $value 1
    }
    foreach ($code in @('host_clipboard_busy','host_clipboard_unstable','host_text_invalid','host_text_too_large','host_text_unreadable','host_clipboard_format_unavailable','host_capability_unavailable')) {
        $value=$literal | ConvertFrom-Json
        $value.readable=$value.stable=$value.exact=$value.notificationVersionMatched=$false;$value.ownerMatchesEditor=$null;$value.code=$code
        Assert-NotificationSample $value 1
    }
    foreach ($mutation in @('extra','wrong_bool','wrong_owner','count_zero','count_large','wrong_count_type','attempt','unknown_code','scope','readclose','overflow','not_observed','pre_arm','order','version')) {
        $value=$literal | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'wrong_bool' { $value.exact='True' }
            'wrong_owner' { $value.ownerMatchesEditor='True' }
            'count_zero' { $value.notifications=0 }
            'count_large' { $value.notifications=65 }
            'wrong_count_type' { $value.notifications='1' }
            'attempt' { $value.sampleAttempts=2 }
            'unknown_code' { $value.code='Public metadata' }
            'scope' { $value.scopeVerified=$false }
            'readclose' { $value.readResourcesClosed=$false }
            'overflow' { $value.overflow=$true }
            'not_observed' { $value.notificationObserved=$false }
            'pre_arm' { $value.notificationAfterArm=$false }
            'order' { $value.notificationOrderVerified=$false }
            'version' { $value.notificationVersionMatched=$false }
        }
        $rejected=$false;try { Assert-NotificationSample $value 1 } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $value=$literal | ConvertFrom-Json;$value.PSObject.Properties.Remove('code');$script:notificationGetterRead=$false
    # 未知getter不得執行或將返回值當普通code接受。
    $value | Add-Member -MemberType ScriptProperty -Name code -Value { $script:notificationGetterRead=$true;return 'host_observed' }
    $rejected=$false;try { Assert-NotificationSample $value 1 } catch { $rejected=$true }
    if (-not $rejected -or $script:notificationGetterRead) { throw 'guard' }
    foreach ($json in @('{"kind":"pending","scopeVerified":true,"notifications":1,"overflow":false,"sampleAttempts":1}','{"kind":"pending","scopeVerified":false,"notifications":0,"overflow":false,"sampleAttempts":1}','{"kind":"pending","scopeVerified":true,"notifications":0,"overflow":true,"sampleAttempts":1}')) {
        $rejected=$false;try { Assert-NotificationPending ($json | ConvertFrom-Json) 1 } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    Assert-NotificationClosed ('{"kind":"closed","resourcesClosed":true,"notifications":2,"overflow":false}' | ConvertFrom-Json) 1 $false
    foreach ($json in @('{"kind":"closed","resourcesClosed":true,"notifications":0,"overflow":false}','{"kind":"closed","resourcesClosed":"True","notifications":1,"overflow":false}','{"kind":"closed","resourcesClosed":true,"notifications":65,"overflow":false}')) {
        $rejected=$false;try { Assert-NotificationClosed ($json | ConvertFrom-Json) 1 $false } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $rejected=$false;try { Assert-NotificationClosed ('{"kind":"closed","resourcesClosed":true,"notifications":1,"overflow":false}' | ConvertFrom-Json) 1 $true } catch { $rejected=$true }
    if (-not $rejected) { throw 'guard' }
    foreach ($json in @('{"kind":"ready","armUs":-1}','{"kind":"ready","armUs":5000001}','{"kind":"ready","armUs":"100"}','{"kind":"ready","armUs":100,"extra":true}')) {
        $rejected=$false;try { Assert-NotificationReady ($json | ConvertFrom-Json) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $value=$literal | ConvertFrom-Json
    $value.readable=$value.stable=$value.exact=$value.notificationAfterArm=$value.notificationOrderVerified=$value.notificationVersionMatched=$false
    $value.ownerMatchesEditor=$null;$value.code='host_clipboard_unstable'
    Assert-NotificationSample $value 1
    $value.notificationObserved=$false;$value.notifications=0;$value.code='host_observation_timeout'
    Assert-NotificationSample $value 1
    # 真白名單builder不得因source含未知getter而serialize整個object。
    $value=$literal | ConvertFrom-Json;$script:notificationGetterRead=$false
    $value | Add-Member -MemberType ScriptProperty -Name Text -Value { $script:notificationGetterRead=$true;return 'Public metadata' }
    $built=(New-NotificationSample $value 1) | ConvertTo-Json -Compress
    Assert-NotificationSample ($built | ConvertFrom-Json) 1
    if ($script:notificationGetterRead) { throw 'guard' }
    if ((Read-NotificationFailureStage ('{"kind":"failed","stage":"editor_bounds"}' | ConvertFrom-Json)) -cne 'child_editor_bounds') { throw 'guard' }
    foreach ($json in @('null','[]','{"kind":"failed","stage":"Public metadata"}','{"kind":"failed","stage":true}','{"kind":"failed","stage":"clipboard_read","extra":true}')) {
        $rejected=$false;try { [void](Read-NotificationFailureStage ($json | ConvertFrom-Json)) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User;$principal=New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $phase='flags'
    if (($ObserveNotification -eq $DiagnosticSelfTest) -or ($Child -and $DiagnosticSelfTest) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    Assert-NotificationSource $PSScriptRoot $true;Assert-NotificationSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $snapshotCore=Join-Path $PSScriptRoot 'windows-clipboard-calibration.cs'
    $core=Join-Path $PSScriptRoot 'windows-clipboard-notification-calibration.cs'
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$reader,$snapshotCore,$core)) { Assert-NotificationSource $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-NotificationSchema
        [Console]::WriteLine('host_clipboard_notification_schema_observed,liveClipboardQueries=false');exit 0
    }
    if ($Child) {
        $phase='compile';Add-Type -LiteralPath @($nativeSource,$geometry,$editorCore,$snapshotCore,$core) -ErrorAction Stop
        $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
        $phase='automation_setup';Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
        try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
        . $reader
        $editor=@{x=$X;y=$Y;width=$Width;height=$Height};$script:editorIdentity=$null;$script:editorTextCalls=0
        $phase='bind_scope';[void](Get-HostEditorPattern $editor)
        $state=New-Object HostClipboardNotificationCalibration;$attempts=0;$measured=$false
        $phase='listener';$native=New-Object HostObserverNative
        if (-not $native.Ready) { throw 'guard' }
        $armUs=$native.Microseconds()
        $phase='ready_write';Write-NotificationFrame @{kind='ready';armUs=$armUs}
        while ($true) {
            $phase='command_read';$command=[Console]::In.ReadLine()
            if ($command -ceq 'stop') { break }
            if ($command -cne 'sample' -or $measured -or -not $native.Ready) { throw 'guard' }
            $phase='sample_limit';if ($attempts -ge 1200 -or $native.Microseconds() -ge 120000000) { throw 'guard' };$attempts++
            $phase='scope_before';[void](Get-HostEditorPattern $editor)
            $phase='notice_drain';$state.Capture($native.Drain(),$native.Overflow)
            if ($state.Notifications -eq 0 -and -not $state.Overflow) {
                $phase='sample_write';Write-NotificationFrame @{kind='pending';scopeVerified=$true;notifications=0;overflow=$false;sampleAttempts=$attempts}
                continue
            }
            $value=$null;$tailVersion=[uint32]0
            try {
                $startUs=$native.Microseconds();$notice=$state.First()
                if ($state.CanRead($armUs,$startUs)) {
                    $phase='clipboard_read';$value=$native.ReadClipboard($notice.Version,$script:editorPid)
                }
                $phase='scope_after';[void](Get-HostEditorPattern $editor)
                $phase='notice_drain';$state.Capture($native.Drain(),$native.Overflow)
                $phase='version_tail'
                if ($null -ne $value -and $value.Stable) { $tailVersion=[HostObserverNative]::GetClipboardSequenceNumber() }
                $endUs=$native.Microseconds()
                $phase='classify';$result=$state.Classify($value,$true,$armUs,$startUs,$endUs,$tailVersion)
                $sample=New-NotificationSample $result $attempts
            } finally { if ($null -ne $value) { $value.Text=$null };$value=$notice=$null }
            $measured=$true;$phase='sample_write';Write-NotificationFrame $sample
        }
        $phase='native_close';$closed=$native.Stop()
        $phase='notice_drain';$state.Capture($native.Drain(),$native.Overflow);$native=$null
        $phase='closed_write';Write-NotificationFrame @{kind='closed';resourcesClosed=$closed;notifications=$state.Notifications;overflow=$state.Overflow}
        if (-not $closed) { exit 2 };exit 0
    }
    $phase='startup';$info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -ObserveNotification -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-NotificationFailureStage $frame;throw 'guard' }
    Assert-NotificationReady $frame
    if ($owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    # 總window沿自有process啟動clock，不在ready重起120秒或延長單次query期限。
    $observation=$owned.Startup;$attempts=0;$sample=$null
    [Console]::WriteLine('host_clipboard_notification_armed,scopeVerified=True,liveClipboardQueries=false')
    while ($observation.ElapsedMilliseconds -lt 119000 -and $attempts -lt 1200) {
        $query=[Diagnostics.Stopwatch]::StartNew()
        $phase='query_write';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
        $phase='query_reply';$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
        $phase='query_json';$frame=$reply | ConvertFrom-Json;$reply=$null
        $phase='query_schema'
        if ($frame.kind -ceq 'failed') { $phase=Read-NotificationFailureStage $frame;throw 'guard' }
        if ($frame.kind -ceq 'pending') { Assert-NotificationPending $frame ($attempts+1) }
        else { Assert-NotificationSample $frame ($attempts+1);$sample=$frame }
        if ($query.ElapsedMilliseconds -ge 1000 -or $observation.ElapsedMilliseconds -ge 120000) { throw 'guard' }
        $attempts=$frame.sampleAttempts
        if ($null -ne $sample) { break }
        [Threading.Thread]::Sleep(100)
    }
    if ($null -eq $sample) {
        $sample=[pscustomobject]@{kind='sample';scopeVerified=$true;readable=$false;stable=$false;exact=$false;ownerMatchesEditor=$null;notifications=0;overflow=$false;readResourcesClosed=$true;code='host_observation_timeout';notificationObserved=$false;notificationAfterArm=$false;notificationOrderVerified=$false;notificationVersionMatched=$false;sampleAttempts=$attempts}
    }
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-NotificationFailureStage $frame;throw 'guard' }
    Assert-NotificationClosed $frame $sample.notifications $sample.overflow
    $sample.notifications=$frame.notifications;$sample.notificationObserved=($frame.notifications -gt 0)
    if ($frame.overflow) {
        $sample.overflow=$true;$sample.readable=$sample.stable=$sample.exact=$sample.notificationVersionMatched=$false;$sample.ownerMatchesEditor=$null;$sample.code='host_observation_overflow'
    }
    Assert-NotificationSample $sample $attempts
    $cleanup=Stop-HostOwnedProcess $owned $frame.resourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $observed=$sample.scopeVerified -and $sample.readable -and $sample.stable -and $sample.exact -and $sample.readResourcesClosed -and $sample.notificationObserved -and $sample.notificationAfterArm -and $sample.notificationOrderVerified -and $sample.notificationVersionMatched -and -not $sample.overflow -and $sample.code -ceq 'host_observed'
    $marker='host_clipboard_notification_unavailable';if ($observed) { $marker='host_clipboard_notification_observed' }
    $owner='unknown';if ($null -ne $sample.ownerMatchesEditor) { $owner=$sample.ownerMatchesEditor.ToString() }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=Notification,scopeVerified={1},readable={2},stable={3},exact={4},ownerMatchesEditor={5},notifications={6},overflow={7},readResourcesClosed={8},notificationObserved={9},notificationAfterArm={10},notificationOrderVerified={11},notificationVersionMatched={12},sampleAttempts={13},code={14},resourcesClosed=True,processExited=True',$marker,$sample.scopeVerified,$sample.readable,$sample.stable,$sample.exact,$owner,$sample.notifications,$sample.overflow,$sample.readResourcesClosed,$sample.notificationObserved,$sample.notificationAfterArm,$sample.notificationOrderVerified,$sample.notificationVersionMatched,$sample.sampleAttempts,$sample.code))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_clipboard_notification_schema_unavailable,stage='+$phase) }
    elseif ($Child) {
        if (@('bind_scope','scope_before','scope_after') -ccontains $phase -and $null -ne $script:editorStage) { $phase=$script:editorStage }
        try { Write-NotificationFrame @{kind='failed';stage=$phase} } catch {}
    } else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_clipboard_notification_unavailable,case=Notification,stage='+$phase+',processExited='+$exited)
    }
    exit 2
} finally {
    if ($null -ne $native) { [void]$native.Stop() }
    if ($null -ne $owned) {
        if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
        [void](Stop-HostOwnedProcess $owned $false $shutdown)
    }
}
