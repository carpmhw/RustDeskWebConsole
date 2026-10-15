param([switch]$LeaseExpiry,[switch]$DiagnosticSelfTest,[switch]$Child)
# 單次lease校準只開／關自有lock，不讀內容／UIA或寫clipboard，不更改政策。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$fixture=$shutdown=$cleanup=$null;$stage='policy'

# source只接受自有owner-only NTFS／protected目錄／non-reparse祖先，不修改ACL。
function Assert-LeaseSource([string]$Path,[bool]$Directory) {
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
# sample只是fixture快照；timer／Close正在進行都不能當已成功釋放。
function Assert-LeaseHolder($Value,[string]$Kind) {
    Assert-HostFields $Value @('kind','lockAcquired','leaseActive','leaseExpired','releaseSucceeded','resourcesClosed','openAttempts','closeAttempts')
    if ($Value.kind -isnot [string] -or $Value.kind -cne $Kind) { throw 'guard' }
    foreach ($name in @('lockAcquired','leaseActive','leaseExpired','releaseSucceeded','resourcesClosed')) { if ($Value.$name -isnot [bool]) { throw 'guard' } }
    Assert-HostInteger $Value.openAttempts 0 1;Assert-HostInteger $Value.closeAttempts 0 1
    if ($Value.closeAttempts -gt $Value.openAttempts -or $Value.resourcesClosed) { throw 'guard' }
    if ($Value.lockAcquired -and $Value.openAttempts -ne 1) { throw 'guard' }
    if (-not $Value.lockAcquired -and ($Value.leaseActive -or $Value.leaseExpired -or $Value.releaseSucceeded -or $Value.closeAttempts -ne 0)) { throw 'guard' }
    if ($Value.leaseActive -and ($Value.leaseExpired -or $Value.releaseSucceeded -or $Value.closeAttempts -ne 0)) { throw 'guard' }
    if ($Value.releaseSucceeded -and ($Value.closeAttempts -ne 1 -or $Value.leaseActive -or -not $Value.leaseExpired)) { throw 'guard' }
}
# 同一fixture不可倒退close／expiry或重新active，不能用後續state掩蓋失敗。
function Assert-LeaseTransition($Previous,$Current) {
    if (-not $Current.lockAcquired -or $Current.openAttempts -ne $Previous.openAttempts -or $Current.closeAttempts -lt $Previous.closeAttempts -or ($Previous.leaseExpired -and -not $Current.leaseExpired) -or ($Previous.releaseSucceeded -and -not $Current.releaseSucceeded) -or (-not $Previous.leaseActive -and $Current.leaseActive)) { throw 'guard' }
}
# 完整初始active證據不可被後來expiry快照代替。
function Test-LeaseHeld($Value) {
    return ($Value.lockAcquired -and $Value.leaseActive -and -not $Value.leaseExpired -and -not $Value.releaseSucceeded -and -not $Value.resourcesClosed -and $Value.openAttempts -eq 1 -and $Value.closeAttempts -eq 0)
}
# 此predicate只接受stop前真Close成功，不以LeaseExpired或CloseAttempts單項判成功。
function Test-LeaseReleased($Value) {
    return ($Value.lockAcquired -and -not $Value.leaseActive -and $Value.leaseExpired -and $Value.releaseSucceeded -and -not $Value.resourcesClosed -and $Value.openAttempts -eq 1 -and $Value.closeAttempts -eq 1)
}
# summary固定欄位／count／code，terminal成功不能覆蓋缺少stop前release的證據。
function Assert-LeaseClosed($Value) {
    Assert-HostFields $Value @('kind','initialHeld','leaseExpired','releasedBeforeStop','releaseSucceeded','holderResourcesClosed','openAttempts','closeAttempts','code')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'closed' -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in @('initialHeld','leaseExpired','releasedBeforeStop','releaseSucceeded','holderResourcesClosed')) { if ($Value.$name -isnot [bool]) { throw 'guard' } }
    Assert-HostInteger $Value.openAttempts 0 1;Assert-HostInteger $Value.closeAttempts 0 1
    if (@('host_clipboard_lease_observed','host_clipboard_lease_unavailable','host_cleanup_unavailable') -cnotcontains $Value.code -or $Value.closeAttempts -gt $Value.openAttempts) { throw 'guard' }
    if ($Value.releasedBeforeStop -and -not $Value.leaseExpired) { throw 'guard' }
    if ($Value.releaseSucceeded -and $Value.closeAttempts -ne 1) { throw 'guard' }
    if ($Value.holderResourcesClosed -and (-not $Value.releaseSucceeded -or $Value.openAttempts -ne 1 -or $Value.closeAttempts -ne 1)) { throw 'guard' }
    $complete=$Value.initialHeld -and $Value.leaseExpired -and $Value.releasedBeforeStop -and $Value.releaseSucceeded -and $Value.holderResourcesClosed -and $Value.openAttempts -eq 1 -and $Value.closeAttempts -eq 1
    if (($Value.code -ceq 'host_clipboard_lease_observed') -ne $complete -or ($Value.code -ceq 'host_cleanup_unavailable') -eq $Value.holderResourcesClosed) { throw 'guard' }
}
# 失敗frame先完整白名單驗，未知stage不能反射成公開marker。
function Read-LeaseFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','holder_open','ready_write','command_read','sample_limit','state_read','state_write','native_close','classify','closed_write')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}
# 僅固定LF及有界frame，不serialize fixture／port或例外物件。
function Write-LeaseFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' };[Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}
# 逐欄建立七個安全state值，私有fixture原物件不得跨pipe。
function New-LeaseHolderFrame($Value,[string]$Kind) {
    return @{kind=$Kind;lockAcquired=$Value.LockAcquired;leaseActive=$Value.LeaseActive;leaseExpired=$Value.LeaseExpired;releaseSucceeded=$Value.ReleaseSucceeded;resourcesClosed=$Value.ResourcesClosed;openAttempts=$Value.OpenAttempts;closeAttempts=$Value.CloseAttempts}
}
# 只複製分類結果，不讓initial／released／terminal原快照被泛型serialize。
function New-LeaseClosedFrame($Value) {
    return @{kind='closed';initialHeld=$Value.InitialHeld;leaseExpired=$Value.LeaseExpired;releasedBeforeStop=$Value.ReleasedBeforeStop;releaseSucceeded=$Value.ReleaseSucceeded;holderResourcesClosed=$Value.HolderResourcesClosed;openAttempts=$Value.OpenAttempts;closeAttempts=$Value.CloseAttempts;code=$Value.Code}
}
# 資料型oracle先寫；不編譯／啟動child／持鎖／呼UIA或任何clipboard API。
function Test-LeaseSchema {
    $initial='{"kind":"ready","lockAcquired":true,"leaseActive":true,"leaseExpired":false,"releaseSucceeded":false,"resourcesClosed":false,"openAttempts":1,"closeAttempts":0}'
    $released='{"kind":"state","lockAcquired":true,"leaseActive":false,"leaseExpired":true,"releaseSucceeded":true,"resourcesClosed":false,"openAttempts":1,"closeAttempts":1}'
    $closed='{"kind":"closed","initialHeld":true,"leaseExpired":true,"releasedBeforeStop":true,"releaseSucceeded":true,"holderResourcesClosed":true,"openAttempts":1,"closeAttempts":1,"code":"host_clipboard_lease_observed"}'
    $value=$initial | ConvertFrom-Json;Assert-LeaseHolder $value 'ready'
    if (-not (Test-LeaseHeld $value) -or (Test-LeaseReleased $value)) { throw 'guard' }
    $value=$released | ConvertFrom-Json;Assert-LeaseHolder $value 'state'
    if ((Test-LeaseHeld $value) -or -not (Test-LeaseReleased $value)) { throw 'guard' }
    $timer=$initial | ConvertFrom-Json;$timer.kind='state';$timer.leaseActive=$false;$timer.leaseExpired=$true
    Assert-LeaseHolder $timer 'state';if (Test-LeaseReleased $timer) { throw 'guard' }
    Assert-LeaseClosed ($closed | ConvertFrom-Json)
    foreach ($mutation in @('extra','bool','count','negative','active_expired','release_without_close','release_without_expiry','premature_resources')) {
        $value=$initial | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName version -NotePropertyValue 7 }
            'bool' { $value.leaseActive='True' }
            'count' { $value.openAttempts=2 }
            'negative' { $value.closeAttempts=-1 }
            'active_expired' { $value.leaseExpired=$true }
            'release_without_close' { $value.releaseSucceeded=$true }
            'release_without_expiry' { $value.leaseActive=$false;$value.releaseSucceeded=$true;$value.closeAttempts=1 }
            'premature_resources' { $value.resourcesClosed=$true }
        }
        $rejected=$false;try { Assert-LeaseHolder $value 'ready' } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    foreach ($mutation in @('extra','bool','count','held','expiry','before','release','resources','code')) {
        $value=$closed | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName raw -NotePropertyValue 'Public metadata' }
            'bool' { $value.releasedBeforeStop='True' }
            'count' { $value.closeAttempts=0 }
            'held' { $value.initialHeld=$false }
            'expiry' { $value.leaseExpired=$false }
            'before' { $value.releasedBeforeStop=$false }
            'release' { $value.releaseSucceeded=$false }
            'resources' { $value.holderResourcesClosed=$false }
            'code' { $value.code='Public unknown code' }
        }
        $rejected=$false;try { Assert-LeaseClosed $value } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    $value=$closed | ConvertFrom-Json;$value.releasedBeforeStop=$false;$value.code='host_clipboard_lease_unavailable';Assert-LeaseClosed $value
    $value=$closed | ConvertFrom-Json;$value.holderResourcesClosed=$false;$value.code='host_cleanup_unavailable';Assert-LeaseClosed $value
    $value=$released | ConvertFrom-Json;$value.PSObject.Properties.Remove('leaseExpired');$script:leaseGetterRead=$false
    # 未知getter必須先被普通欄位guard拒絕，不能執行後才驗flag。
    $value | Add-Member -MemberType ScriptProperty -Name leaseExpired -Value { $script:leaseGetterRead=$true;return $true }
    $rejected=$false;try { Assert-LeaseHolder $value 'state' } catch { $rejected=$true }
    if (-not $rejected -or $script:leaseGetterRead) { throw 'guard' }
    foreach ($json in @('null','[]','{"kind":"failed","stage":"Public metadata"}','{"kind":"failed","stage":"compile","raw":true}')) {
        $rejected=$false;try { [void](Read-LeaseFailureStage ($json | ConvertFrom-Json)) } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    if ((Read-LeaseFailureStage ('{"kind":"failed","stage":"compile"}' | ConvertFrom-Json)) -cne 'child_compile') { throw 'guard' }
    $before=$initial | ConvertFrom-Json;$after=$released | ConvertFrom-Json;Assert-LeaseTransition $before $after
    foreach ($mutation in @('close','expiry','active','release','acquired','open')) {
        $prior=$released | ConvertFrom-Json;$after=$released | ConvertFrom-Json
        switch ($mutation) {
            'close' { $prior.releaseSucceeded=$false;$after.releaseSucceeded=$false;$after.closeAttempts=0 }
            'expiry' { $prior=$timer;$after=$initial | ConvertFrom-Json;$after.leaseActive=$false }
            'active' { $prior=$initial | ConvertFrom-Json;$prior.leaseActive=$false;$after=$initial | ConvertFrom-Json }
            'release' { $after.releaseSucceeded=$false }
            'acquired' { $prior=$initial | ConvertFrom-Json;$after=$initial | ConvertFrom-Json;$after.lockAcquired=$false;$after.leaseActive=$false }
            'open' { $prior=$initial | ConvertFrom-Json;$after=$initial | ConvertFrom-Json;$after.openAttempts=0 }
        }
        $rejected=$false;try { Assert-LeaseTransition $prior $after } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    $value=$initial | ConvertFrom-Json;$script:leaseGetterRead=$false
    # builder遇到額外內容getter仍只取允許的安全欄位。
    $value | Add-Member -MemberType ScriptProperty -Name Text -Value { $script:leaseGetterRead=$true;return 'Public metadata' }
    Assert-LeaseHolder ((New-LeaseHolderFrame $value 'ready') | ConvertTo-Json -Compress | ConvertFrom-Json) 'ready'
    $value=$closed | ConvertFrom-Json
    # summary亦不能泛型serialize額外內容getter。
    $value | Add-Member -MemberType ScriptProperty -Name Text -Value { $script:leaseGetterRead=$true;return 'Public metadata' }
    Assert-LeaseClosed ((New-LeaseClosedFrame $value) | ConvertTo-Json -Compress | ConvertFrom-Json)
    if ($script:leaseGetterRead) { throw 'guard' }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User;$principal=New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $stage='flags';if (($LeaseExpiry -eq $DiagnosticSelfTest) -or ($Child -and $DiagnosticSelfTest)) { throw 'guard' }
    $stage='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    Assert-LeaseSource $PSScriptRoot $true;Assert-LeaseSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1';$native=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $busyCore=Join-Path $PSScriptRoot 'windows-clipboard-busy-calibration.cs';$core=Join-Path $PSScriptRoot 'windows-clipboard-lease-calibration.cs'
    foreach ($path in @($supervisor,$native,$busyCore,$core)) { Assert-LeaseSource $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $stage='diagnostic_selftest';Test-LeaseSchema
        [Console]::WriteLine('host_clipboard_lease_schema_observed,liveClipboardQueries=false,clipboardLockHeld=false');exit 0
    }
    if ($Child) {
        $stage='compile';Add-Type -LiteralPath @($native,$busyCore,$core) -ErrorAction Stop
        $stage='holder_open';$fixture=[HostClipboardLockFixture]::OpenWindows();$initial=$fixture.State();$released=$null;$attempts=0
        $stage='ready_write';Write-LeaseFrame (New-LeaseHolderFrame $initial 'ready')
        while ($true) {
            $stage='command_read';$command=[Console]::In.ReadLine();if ($command -ceq 'stop') { break }
            if ($command -cne 'sample' -or $null -ne $released) { throw 'guard' }
            $stage='sample_limit';if ($attempts -ge 1200) { throw 'guard' };$attempts++
            $stage='state_read';$state=$fixture.State()
            # 證據在Stop前取得；不可用最後Stop的Close成功回填。
            if ([HostClipboardLeaseCalibration]::IsReleasedBeforeStop($state)) { $released=$state }
            $stage='state_write';Write-LeaseFrame (New-LeaseHolderFrame $state 'state')
        }
        $stage='native_close';$stopped=$fixture.Stop();$terminal=$fixture.State();$fixture=$null
        $stage='classify';$result=[HostClipboardLeaseCalibration]::Classify($initial,$released,$terminal,$stopped)
        $stage='closed_write';Write-LeaseFrame (New-LeaseClosedFrame $result)
        if (-not $result.HolderResourcesClosed) { exit 2 };exit 0
    }
    $stage='startup';$info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments='-NoProfile -STA -NonInteractive -File "'+$PSCommandPath+'" -LeaseExpiry -Child'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $before=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($before.kind -ceq 'failed') { $stage=Read-LeaseFailureStage $before;throw 'guard' }
    Assert-LeaseHolder $before 'ready'
    if ($owned.Startup.ElapsedMilliseconds -ge 5000 -or -not (Test-LeaseHeld $before)) { throw 'guard' }
    $observation=$owned.Startup;$leaseWait=[Diagnostics.Stopwatch]::StartNew();$attempts=0;$releasedObserved=$false;$previous=$before
    # 另加較嚴的ready後2秒觀察上限，避免Close故障時仍持鎖等完整120秒。
    while ($observation.ElapsedMilliseconds -lt 119000 -and $leaseWait.ElapsedMilliseconds -lt 2000 -and $attempts -lt 1200) {
        $budget=[Math]::Min(1000,2000-[int]$leaseWait.ElapsedMilliseconds);if ($budget -le 0) { break }
        $query=[Diagnostics.Stopwatch]::StartNew();$stage='query_write';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query $budget
        $stage='query_reply';$state=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $query $budget) | ConvertFrom-Json
        $stage='query_schema';if ($state.kind -ceq 'failed') { $stage=Read-LeaseFailureStage $state;throw 'guard' };Assert-LeaseHolder $state 'state'
        Assert-LeaseTransition $previous $state;$previous=$state
        if ($query.ElapsedMilliseconds -ge $budget -or $observation.ElapsedMilliseconds -ge 120000 -or $leaseWait.ElapsedMilliseconds -ge 2000) { throw 'guard' };$attempts++
        if (Test-LeaseReleased $state) { $releasedObserved=$true;break }
        $pause=[Math]::Min(100,2000-[int]$leaseWait.ElapsedMilliseconds);if ($pause -gt 0) { [Threading.Thread]::Sleep($pause) }
    }
    $stage='close';$shutdown=[Diagnostics.Stopwatch]::StartNew();Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $stage=Read-LeaseFailureStage $frame;throw 'guard' };Assert-LeaseClosed $frame
    $stage='cleanup';$cleanup=Stop-HostOwnedProcess $owned $frame.holderResourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $observed=$releasedObserved -and $frame.code -ceq 'host_clipboard_lease_observed'
    $marker='host_clipboard_lease_unavailable';if ($observed) { $marker='host_clipboard_lease_observed' }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=LeaseExpiry,initialHeld={1},leaseExpired={2},releasedBeforeStop={3},releaseSucceeded={4},holderResourcesClosed={5},openAttempts={6},closeAttempts={7},sampleAttempts={8},code={9},contentWasRead=False,contentWasWritten=False,resourcesClosed=True,processExited=True',$marker,$frame.initialHeld,$frame.leaseExpired,$frame.releasedBeforeStop,$frame.releaseSucceeded,$frame.holderResourcesClosed,$frame.openAttempts,$frame.closeAttempts,$attempts,$frame.code))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_clipboard_lease_schema_unavailable,stage='+$stage) }
    elseif ($Child) { try { Write-LeaseFrame @{kind='failed';stage=$stage} } catch {} }
    else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_clipboard_lease_unavailable,case=LeaseExpiry,stage='+$stage+',processExited='+$exited)
    }
    exit 2
} finally {
    if ($null -ne $fixture) { [void]$fixture.Stop() }
    if ($null -ne $owned) { if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() };[void](Stop-HostOwnedProcess $owned $false $shutdown) }
}
