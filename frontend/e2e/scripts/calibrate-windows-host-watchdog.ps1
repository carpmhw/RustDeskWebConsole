param([switch]$NativeBlock,[switch]$DiagnosticSelfTest,[switch]$Child)
# 公開負向校準只讓自有worker原生等待，不碰桌面／UIA／clipboard／網路或policy。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$cleanup=$shutdown=$null;$stage='policy'

# 僅owner-only protected本機NTFS來源及non-reparse祖先，不修ACL／不載外部module。
function Assert-WatchdogSource([string]$Path,[bool]$Directory) {
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
# ready只是compile完成，不是原生worker已阻塞的證據。
function Assert-WatchdogReady($Value) {
    Assert-HostFields $Value @('kind')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'ready') { throw 'guard' }
}
# 三個安全flag須完整且一致，started／即將進入不能冒稱OS delay已觀察。
function Assert-WatchdogBlocked($Value) {
    Assert-HostFields $Value @('kind','workerStarted','nativeDelayObserved','workerReturned')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'blocked') { throw 'guard' }
    foreach ($name in @('workerStarted','nativeDelayObserved','workerReturned')) { if ($Value.$name -isnot [bool]) { throw 'guard' } }
    if (-not $Value.workerStarted -or -not $Value.nativeDelayObserved -or $Value.workerReturned) { throw 'guard' }
}
# 只認既有supervisor固定throw的FQID＋RuntimeException，不讀／輸出例外Message。
function Test-WatchdogTimeout($Record) {
    return ($Record -is [Management.Automation.ErrorRecord] -and $Record.Exception -is [Management.Automation.RuntimeException] -and $Record.FullyQualifiedErrorId -ceq 'host_query_timeout')
}
# 以原stream參考的關閉能力或明確ObjectDisposed確認，不靠NativeClosed=false猜stream狀態。
function Test-WatchdogStreamClosed([IO.Stream]$Stream,[bool]$Writing) {
    if ($null -eq $Stream) { return $false }
    try {
        $capability=$Stream.CanRead;if ($Writing) { $capability=$Stream.CanWrite }
        if ($capability -isnot [bool]) { return $false };return (-not $capability)
    } catch [ObjectDisposedException] { return $true } catch { return $false }
}
# 負向成功只證watchdog與自有process／stream收尾，native cleanup及正式resources仍未知／False。
function New-WatchdogResult([bool]$Proof,[bool]$TimedOut,[bool]$Identity,[bool]$Alive,[bool]$Exited,[bool]$Streams,[bool]$ReportedClosed,[long]$QueryMs,[long]$ShutdownMs) {
    if ($QueryMs -lt 0 -or $ShutdownMs -lt 0 -or $QueryMs -gt 120000 -or $ShutdownMs -gt 120000) { throw 'guard' }
    $observed=$Proof -and $TimedOut -and $Identity -and $Alive -and $Exited -and $Streams -and -not $ReportedClosed -and $QueryMs -ge 1000 -and $ShutdownMs -lt 2000 -and $QueryMs+$ShutdownMs -lt 3000
    $code='host_capability_unavailable'
    if (-not $Exited -or -not $Streams -or $ShutdownMs -ge 2000) { $code='host_cleanup_unavailable' }
    if ($observed) { $code='host_query_timeout' }
    return [pscustomobject]@{watchdogObserved=$observed;nativeWaitObserved=$Proof;queryTimedOut=$TimedOut;ownedIdentityMatched=$Identity;childWasAlive=$Alive;processExited=$Exited;streamsClosed=$Streams;nativeCleanupConfirmed=$false;resourcesClosed=$false;code=$code}
}
# 失敗frame只固定stage，不曝露內部OS metadata／例外／任意frame。
function Read-WatchdogFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','ready_write','command_read','native_start','native_proof','blocked_write','native_wait')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}
# 僅固定LF／8KiB內小frame，parent仍受相同setup／query deadline監督。
function Write-WatchdogFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' };[Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}
# 只逐欄複製三bool，不能泛型serialize fixture或raw thread資訊。
function New-WatchdogBlockedFrame($Proof) {
    return @{kind='blocked';workerStarted=$Proof.WorkerStarted;nativeDelayObserved=$Proof.NativeDelayObserved;workerReturned=$Proof.WorkerReturned}
}
# 資料型oracle先寫；不編譯／啟動child／原生wait或取得OS thread資訊。
function Test-WatchdogSchema {
    Assert-WatchdogReady ('{"kind":"ready"}' | ConvertFrom-Json)
    $literal='{"kind":"blocked","workerStarted":true,"nativeDelayObserved":true,"workerReturned":false}'
    Assert-WatchdogBlocked ($literal | ConvertFrom-Json)
    foreach ($mutation in @('extra','bool','started','observed','returned')) {
        $value=$literal | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName threadId -NotePropertyValue 41 }
            'bool' { $value.nativeDelayObserved='True' }
            'started' { $value.workerStarted=$false }
            'observed' { $value.nativeDelayObserved=$false }
            'returned' { $value.workerReturned=$true }
        }
        $rejected=$false;try { Assert-WatchdogBlocked $value } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    $value=$literal | ConvertFrom-Json;$value.PSObject.Properties.Remove('nativeDelayObserved');$script:watchdogGetterRead=$false
    # getter在普通欄位guard之前不可被呼叫或反射成布林。
    $value | Add-Member -MemberType ScriptProperty -Name nativeDelayObserved -Value { $script:watchdogGetterRead=$true;return $true }
    $rejected=$false;try { Assert-WatchdogBlocked $value } catch { $rejected=$true }
    if (-not $rejected -or $script:watchdogGetterRead) { throw 'guard' }
    try { throw 'host_query_timeout' } catch { $timeoutRecord=$_ }
    if (-not (Test-WatchdogTimeout $timeoutRecord)) { throw 'guard' }
    foreach ($record in @($null,[pscustomobject]@{FullyQualifiedErrorId='host_query_timeout'},[Management.Automation.ErrorRecord]::new([InvalidOperationException]::new('Public metadata'),'host_query_timeout',[Management.Automation.ErrorCategory]::OperationStopped,$null),[Management.Automation.ErrorRecord]::new([Management.Automation.RuntimeException]::new('Public metadata'),'Public unknown id',[Management.Automation.ErrorCategory]::OperationStopped,$null))) {
        if (Test-WatchdogTimeout $record) { throw 'guard' }
    }
    $inputs=@($true,$true,$true,$true,$true,$true,$false,1001,20)
    $result=New-WatchdogResult @inputs
    Assert-HostFields $result @('watchdogObserved','nativeWaitObserved','queryTimedOut','ownedIdentityMatched','childWasAlive','processExited','streamsClosed','nativeCleanupConfirmed','resourcesClosed','code')
    if (-not $result.watchdogObserved -or $result.nativeCleanupConfirmed -or $result.resourcesClosed -or $result.code -cne 'host_query_timeout') { throw 'guard' }
    foreach ($name in @('watchdogObserved','nativeWaitObserved','queryTimedOut','ownedIdentityMatched','childWasAlive','processExited','streamsClosed')) { if ($result.$name -isnot [bool] -or -not $result.$name) { throw 'guard' } }
    for ($index=0;$index -le 6;$index++) {
        $invalid=$inputs.Clone();$invalid[$index]=-not $invalid[$index];$result=New-WatchdogResult @invalid
        if ($result.watchdogObserved -or $result.nativeCleanupConfirmed -or $result.resourcesClosed) { throw 'guard' }
    }
    foreach ($pair in @(@(999,20),@(1000,2000),@(2000,1000),@(30000,0))) {
        $invalid=$inputs.Clone();$invalid[7]=$pair[0];$invalid[8]=$pair[1]
        if ((New-WatchdogResult @invalid).watchdogObserved) { throw 'guard' }
    }
    $stream=New-Object IO.MemoryStream
    try {
        if ((Test-WatchdogStreamClosed $stream $false) -or (Test-WatchdogStreamClosed $stream $true)) { throw 'guard' }
        $stream.Dispose()
        if (-not (Test-WatchdogStreamClosed $stream $false) -or -not (Test-WatchdogStreamClosed $stream $true)) { throw 'guard' }
    } finally { $stream.Dispose() }
    if (Test-WatchdogStreamClosed $null $false) { throw 'guard' }
    foreach ($json in @('null','[]','{"kind":"failed","stage":"Public unknown stage"}','{"kind":"failed","stage":"compile","raw":true}')) {
        $rejected=$false;try { [void](Read-WatchdogFailureStage ($json | ConvertFrom-Json)) } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    if ((Read-WatchdogFailureStage ('{"kind":"failed","stage":"compile"}' | ConvertFrom-Json)) -cne 'child_compile') { throw 'guard' }
    $value=$literal | ConvertFrom-Json;$script:watchdogGetterRead=$false
    # 額外private getter不能被builder呼叫或serialize。
    $value | Add-Member -MemberType ScriptProperty -Name ThreadId -Value { $script:watchdogGetterRead=$true;return 41 }
    Assert-WatchdogBlocked ((New-WatchdogBlockedFrame $value) | ConvertTo-Json -Compress | ConvertFrom-Json)
    if ($script:watchdogGetterRead) { throw 'guard' }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User;$principal=New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $stage='flags';if (($NativeBlock -eq $DiagnosticSelfTest) -or ($Child -and $DiagnosticSelfTest)) { throw 'guard' }
    $stage='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    Assert-WatchdogSource $PSScriptRoot $true;Assert-WatchdogSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1';$core=Join-Path $PSScriptRoot 'windows-host-watchdog-fixture.cs'
    foreach ($path in @($supervisor,$core)) { Assert-WatchdogSource $path $false };. $supervisor
    if ($DiagnosticSelfTest) {
        $stage='diagnostic_selftest';Test-WatchdogSchema
        [Console]::WriteLine('host_watchdog_schema_observed,liveNativeWait=false,liveTextQueries=false,liveClipboardQueries=false');exit 0
    }
    if ($Child) {
        $stage='compile';Add-Type -LiteralPath $core -ErrorAction Stop
        $stage='ready_write';Write-WatchdogFrame @{kind='ready'}
        $stage='command_read';if ([Console]::In.ReadLine() -cne 'sample') { throw 'guard' }
        $stage='native_start';$fixture=[HostNativeWaitFixture]::StartWindows()
        $stage='native_proof';$proofClock=[Diagnostics.Stopwatch]::StartNew();$proof=$null
        for ($attempt=0;$attempt -lt 64 -and $proofClock.ElapsedMilliseconds -lt 500;$attempt++) {
            $proof=$fixture.Capture();if ($proof.NativeDelayObserved -or $proof.WorkerReturned) { break }
            [Threading.Thread]::Sleep(5)
        }
        if ($null -eq $proof -or -not $proof.WorkerStarted -or -not $proof.NativeDelayObserved -or $proof.WorkerReturned -or $proofClock.ElapsedMilliseconds -ge 500) { throw 'guard' }
        $stage='blocked_write';Write-WatchdogFrame (New-WatchdogBlockedFrame $proof)
        # 此處故意不讀stop或送sample reply，讓父程序原1000ms watchdog收自有child。
        $stage='native_wait';$fixture.WaitForReturn();exit 2
    }
    $stage='startup';$info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments='-NoProfile -STA -NonInteractive -File "'+$PSCommandPath+'" -NativeBlock -Child'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $inputStream=$owned.Process.StandardInput.BaseStream;$outputStream=$owned.Process.StandardOutput.BaseStream;$errorStream=$owned.Process.StandardError.BaseStream
    $frame=(Read-HostFrame $outputStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $stage=Read-WatchdogFailureStage $frame;throw 'guard' };Assert-WatchdogReady $frame
    if ($owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $query=[Diagnostics.Stopwatch]::StartNew();$proofObserved=$timedOut=$false
    try {
        $stage='query_write';Write-HostCommand $inputStream 'sample' $query 1000
        $stage='query_proof';$frame=(Read-HostFrame $outputStream $query 1000) | ConvertFrom-Json
        if ($frame.kind -ceq 'failed') { $stage=Read-WatchdogFailureStage $frame;throw 'guard' };Assert-WatchdogBlocked $frame;$proofObserved=$true
        # 同一query clock繼續等待結果，任何正常frame／EOF都不是預期timeout。
        $stage='query_reply';[void](Read-HostFrame $outputStream $query 1000);throw 'guard'
    } catch {
        if (-not (Test-WatchdogTimeout $_)) { throw };$timedOut=$true
    }
    $queryMs=$query.ElapsedMilliseconds;$shutdown=[Diagnostics.Stopwatch]::StartNew()
    # timeout後不再讀同pipe或送stop；只核matching自有process仍alive後直接收尾。
    $stage='identity';$matched=($owned.Process.Id -eq $owned.Id -and $owned.Process.Handle -eq $owned.Handle);$alive=(-not $owned.Process.HasExited)
    if (-not $matched -or -not $alive) { throw 'guard' }
    $stage='cleanup';$cleanup=Stop-HostOwnedProcess $owned $false $shutdown;$owned=$null
    $streams=(Test-WatchdogStreamClosed $inputStream $true) -and (Test-WatchdogStreamClosed $outputStream $false) -and (Test-WatchdogStreamClosed $errorStream $false)
    $result=New-WatchdogResult $proofObserved $timedOut $matched $alive $cleanup.ProcessExited $streams $cleanup.ResourcesClosed $queryMs $shutdown.ElapsedMilliseconds
    $marker='host_watchdog_unavailable';if ($result.watchdogObserved) { $marker='host_watchdog_observed' }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=NativeBlock,watchdogObserved={1},nativeWaitObserved={2},queryTimedOut={3},ownedIdentityMatched={4},childWasAlive={5},processExited={6},streamsClosed={7},nativeCleanupConfirmed=False,resourcesClosed=False,code={8},liveTextQueries=False,liveClipboardQueries=False',$marker,$result.watchdogObserved,$result.nativeWaitObserved,$result.queryTimedOut,$result.ownedIdentityMatched,$result.childWasAlive,$result.processExited,$result.streamsClosed,$result.code))
    if (-not $result.watchdogObserved) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_watchdog_schema_unavailable,stage='+$stage) }
    elseif ($Child) { try { Write-WatchdogFrame @{kind='failed';stage=$stage} } catch {} }
    else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_watchdog_unavailable,case=NativeBlock,stage='+$stage+',processExited='+$exited+',nativeCleanupConfirmed=False,resourcesClosed=False')
    }
    exit 2
} finally {
    if ($null -ne $owned) { if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() };[void](Stop-HostOwnedProcess $owned $false $shutdown) }
}
