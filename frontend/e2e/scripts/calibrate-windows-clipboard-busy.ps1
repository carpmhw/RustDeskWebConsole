param([switch]$Busy,[switch]$DiagnosticSelfTest,[switch]$ReaderChild,[switch]$HolderChild,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# 已獲本次公開隔離持鎖fixture授權；不寫clip／改owner／控制焦點鍵鼠或啟動HR。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$readerOwned=$holderOwned=$native=$fixture=$shutdown=$readerClean=$holderClean=$null;$phase='policy'

# 載入模組前驗來源／祖先non-reparse、同owner本機NTFS與protected目錄，不修ACL。
function Assert-BusySource([string]$Path,[bool]$Directory) {
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
        if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'guard' };$parent=$parent.Parent
    }
}
# reader初始ready只有scope，不含文字或clipboard，也不是HR ready。
function Assert-BusyReaderReady($Value) {
    Assert-HostFields $Value @('kind','scopeVerified')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'reader_ready' -or $Value.scopeVerified -isnot [bool] -or -not $Value.scopeVerified) { throw 'guard' }
}
# reader結果必完整安全DTO，busy只能scope／未讀／read資源均成立，不反射陌生code。
function Assert-BusySample($Value) {
    Assert-HostFields $Value @('kind','scopeVerified','busyObserved','contentWasRead','readResourcesClosed','code')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in @('scopeVerified','busyObserved','readResourcesClosed')) { if ($Value.$name -isnot [bool]) { throw 'guard' } }
    if ($null -ne $Value.contentWasRead -and $Value.contentWasRead -isnot [bool]) { throw 'guard' }
    $codes=@('host_clipboard_busy','host_observed','host_clipboard_unstable','host_clipboard_format_unavailable','host_text_unreadable','host_text_too_large','host_text_invalid','host_capability_unavailable','host_cleanup_unavailable','host_scope_changed')
    if ($codes -cnotcontains $Value.code) { throw 'guard' }
    if ($Value.busyObserved -and (-not $Value.scopeVerified -or -not $Value.readResourcesClosed -or $Value.contentWasRead -isnot [bool] -or $Value.contentWasRead -or $Value.code -cne 'host_clipboard_busy')) { throw 'guard' }
}
# fixture state不含原值／owner，lease屆滿不等於ReleaseSucceeded或全部cleanup。
function Assert-BusyHolder($Value,[string]$Kind) {
    Assert-HostFields $Value @('kind','lockAcquired','leaseActive','leaseExpired','releaseSucceeded','resourcesClosed','openAttempts','closeAttempts')
    if ($Value.kind -isnot [string] -or $Value.kind -cne $Kind) { throw 'guard' }
    foreach ($name in @('lockAcquired','leaseActive','leaseExpired','releaseSucceeded','resourcesClosed')) { if ($Value.$name -isnot [bool]) { throw 'guard' } }
    Assert-HostInteger $Value.openAttempts 0 1;Assert-HostInteger $Value.closeAttempts 0 1
    if ($Value.lockAcquired -and $Value.openAttempts -ne 1) { throw 'guard' }
    if (($Value.closeAttempts -gt 0 -or $Value.leaseExpired -or $Value.releaseSucceeded) -and -not $Value.lockAcquired) { throw 'guard' }
    if ($Value.releaseSucceeded -and $Value.closeAttempts -ne 1) { throw 'guard' }
    if ($Value.leaseActive -and (-not $Value.lockAcquired -or $Value.leaseExpired -or $Value.releaseSucceeded -or $Value.resourcesClosed -or $Value.closeAttempts -ne 0)) { throw 'guard' }
    if ($Value.resourcesClosed -and ($Value.leaseActive -or ($Value.lockAcquired -and -not $Value.releaseSucceeded))) { throw 'guard' }
    if ($Kind -ceq 'holder_closed' -and $Value.leaseActive) { throw 'guard' }
}
# reader只有各API及window／listener正常收尾才可closed=true，僅退出不代替。
function Assert-BusyReaderClosed($Value) {
    Assert-HostFields $Value @('kind','resourcesClosed')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'reader_closed' -or $Value.resourcesClosed -isnot [bool]) { throw 'guard' }
}
# 固定child stage先驗普通欄位，exception／未知frame不印stdout。
function Read-BusyFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $stages=@('policy','flags','source','compile','coordinate_setup','automation_setup','session_setup','bind_scope','listener','holder_open','ready_write','command_read','scope_before','clipboard_read','scope_after','classify','sample_write','native_close','closed_write','editor_point','editor_process','editor_bounds','editor_identity','editor_type','editor_pattern')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $stages -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}
# child只送LF／8KiB內安全metadata，writer仍由parent期限監督。
function Write-BusyFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}
# fixture逐欄複製安全DTO，不serialize fixture本體／thread或port。
function New-BusyHolderFrame($State,[string]$Kind) {
    return @{kind=$Kind;lockAcquired=$State.LockAcquired;leaseActive=$State.LeaseActive;leaseExpired=$State.LeaseExpired;releaseSucceeded=$State.ReleaseSucceeded;resourcesClosed=$State.ResourcesClosed;openAttempts=$State.OpenAttempts;closeAttempts=$State.CloseAttempts}
}
# 新程序只固定兩種role與同已授權policy；不Add-Type或開網路於parent。
function Start-BusyChild([string]$Role) {
    if (@('ReaderChild','HolderChild') -cnotcontains $Role) { throw 'guard' }
    $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -Busy -{1} -X {2} -Y {3} -Width {4} -Height {5}',$PSCommandPath,$Role,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    return (Start-HostOwnedProcess $info)
}
# 兩child呼叫均共用同一shutdown Clock；失敗立即處理此自有handle，不追加另一個2秒。
function Close-BusyChild($Owned,[string]$Kind,[Diagnostics.Stopwatch]$Clock) {
    $closed=$false
    try {
        Write-HostCommand $Owned.Process.StandardInput.BaseStream 'stop' $Clock 2000
        $frame=(Read-HostFrame $Owned.Process.StandardOutput.BaseStream $Clock 2000) | ConvertFrom-Json
        if ($Kind -ceq 'holder_closed') { Assert-BusyHolder $frame $Kind }
        else { Assert-BusyReaderClosed $frame }
        $closed=$frame.resourcesClosed
    } catch { $closed=$false }
    return (Stop-HostOwnedProcess $Owned $closed $Clock)
}
# 資料型oracle先寫；不compile／UIA／建listener、讀clip或持鎖。
function Test-BusySchema {
    $sample='{"kind":"sample","scopeVerified":true,"busyObserved":true,"contentWasRead":false,"readResourcesClosed":true,"code":"host_clipboard_busy"}'
    Assert-BusySample ($sample | ConvertFrom-Json)
    foreach ($mutation in @('extra','wrong_bool','content','scope','close','code')) {
        $value=$sample | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'wrong_bool' { $value.busyObserved='True' }
            'content' { $value.contentWasRead=$null }
            'scope' { $value.scopeVerified=$false }
            'close' { $value.readResourcesClosed=$false }
            'code' { $value.code='Public metadata' }
        }
        $rejected=$false;try { Assert-BusySample $value } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $holder='{"kind":"holder_ready","lockAcquired":true,"leaseActive":true,"leaseExpired":false,"releaseSucceeded":false,"resourcesClosed":false,"openAttempts":1,"closeAttempts":0}'
    Assert-BusyHolder ($holder | ConvertFrom-Json) 'holder_ready'
    foreach ($mutation in @('extra','wrong_bool','open','close','expired','released','resources')) {
        $value=$holder | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName version -NotePropertyValue 7 }
            'wrong_bool' { $value.leaseActive='True' }
            'open' { $value.openAttempts=2 }
            'close' { $value.closeAttempts=1 }
            'expired' { $value.leaseExpired=$true }
            'released' { $value.releaseSucceeded=$true }
            'resources' { $value.resourcesClosed=$true }
        }
        $rejected=$false;try { Assert-BusyHolder $value 'holder_ready' } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $value=$holder | ConvertFrom-Json;$value.kind='holder_closed';$value.leaseActive=$false;$value.closeAttempts=1;$value.releaseSucceeded=$true;$value.resourcesClosed=$true
    Assert-BusyHolder $value 'holder_closed'
    $value=$sample | ConvertFrom-Json;$value.PSObject.Properties.Remove('code');$script:busyGetterRead=$false
    # 未知getter不得執行或當普通code接受。
    $value | Add-Member -MemberType ScriptProperty -Name code -Value { $script:busyGetterRead=$true;return 'host_clipboard_busy' }
    $rejected=$false;try { Assert-BusySample $value } catch { $rejected=$true }
    if (-not $rejected -or $script:busyGetterRead) { throw 'guard' }
    foreach ($content in @($true,$false,$null)) {
        $value=$sample | ConvertFrom-Json;$value.busyObserved=$false;$value.contentWasRead=$content;$value.code='host_capability_unavailable';Assert-BusySample $value
    }
    Assert-BusyReaderReady ('{"kind":"reader_ready","scopeVerified":true}' | ConvertFrom-Json)
    Assert-BusyReaderClosed ('{"kind":"reader_closed","resourcesClosed":true}' | ConvertFrom-Json)
    foreach ($json in @('{"kind":"reader_ready","scopeVerified":"True"}','{"kind":"reader_ready","scopeVerified":false}','{"kind":"reader_ready","scopeVerified":true,"extra":true}')) {
        $rejected=$false;try { Assert-BusyReaderReady ($json | ConvertFrom-Json) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    foreach ($json in @('null','[]','{"kind":"failed","stage":"Public metadata"}','{"kind":"failed","stage":"compile","extra":true}')) {
        $rejected=$false;try { [void](Read-BusyFailureStage ($json | ConvertFrom-Json)) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    if ((Read-BusyFailureStage ('{"kind":"failed","stage":"compile"}' | ConvertFrom-Json)) -cne 'child_compile') { throw 'guard' }
    # builder只能取七個安全欄位，未知Text getter不能被serialize或執行。
    $value=$holder | ConvertFrom-Json;$script:busyGetterRead=$false
    $value | Add-Member -MemberType ScriptProperty -Name Text -Value { $script:busyGetterRead=$true;return 'Public metadata' }
    $built=(New-BusyHolderFrame $value 'holder_ready') | ConvertTo-Json -Compress
    Assert-BusyHolder ($built | ConvertFrom-Json) 'holder_ready'
    if ($script:busyGetterRead) { throw 'guard' }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User;$principal=New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $phase='flags'
    if (($Busy -eq $DiagnosticSelfTest) -or ($ReaderChild -and $HolderChild) -or (($ReaderChild -or $HolderChild) -and $DiagnosticSelfTest) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    Assert-BusySource $PSScriptRoot $true;Assert-BusySource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs';$geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs';$readerSource=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $core=Join-Path $PSScriptRoot 'windows-clipboard-busy-calibration.cs'
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$readerSource,$core)) { Assert-BusySource $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-BusySchema
        [Console]::WriteLine('host_clipboard_busy_schema_observed,liveClipboardQueries=false,clipboardLockHeld=false');exit 0
    }
    if ($ReaderChild -or $HolderChild) {
        $phase='compile'
        if ($HolderChild) { Add-Type -LiteralPath @($nativeSource,$core) -ErrorAction Stop }
        else { Add-Type -LiteralPath @($nativeSource,$geometry,$editorCore,$core) -ErrorAction Stop }
        if ($HolderChild) {
            $phase='holder_open';$fixture=[HostClipboardLockFixture]::OpenWindows()
            $phase='ready_write';Write-BusyFrame (New-BusyHolderFrame ($fixture.State()) 'holder_ready')
            $phase='command_read';$command=[Console]::In.ReadLine()
            if ($command -ceq 'sample') {
                $phase='sample_write';Write-BusyFrame (New-BusyHolderFrame ($fixture.State()) 'holder_state')
                $phase='command_read';$command=[Console]::In.ReadLine()
            }
            if ($command -cne 'stop') { throw 'guard' }
            $phase='native_close';$closed=$fixture.Stop();$state=$fixture.State();$fixture=$null
            $phase='closed_write';Write-BusyFrame (New-BusyHolderFrame $state 'holder_closed')
        } else {
            $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
            $phase='automation_setup';Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
            $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
            try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
            . $readerSource
            $editor=@{x=$X;y=$Y;width=$Width;height=$Height};$script:editorIdentity=$null;$script:editorTextCalls=0
            $phase='bind_scope';[void](Get-HostEditorPattern $editor)
            $phase='listener';$native=New-Object HostObserverNative;if (-not $native.Ready) { throw 'guard' }
            $phase='ready_write';Write-BusyFrame @{kind='reader_ready';scopeVerified=$true}
            $phase='command_read';$command=[Console]::In.ReadLine()
            if ($command -ceq 'sample') {
                $value=$null
                try {
                    $phase='scope_before';[void](Get-HostEditorPattern $editor)
                    $phase='clipboard_read';$value=$native.ReadClipboard(0,$script:editorPid)
                    $phase='scope_after';[void](Get-HostEditorPattern $editor)
                    $phase='classify';$result=[HostClipboardBusyCalibration]::Classify($value,$true)
                    $sample=@{kind='sample';scopeVerified=$result.ScopeVerified;busyObserved=$result.BusyObserved;contentWasRead=$result.ContentWasRead;readResourcesClosed=$result.ReadResourcesClosed;code=$result.Code}
                } finally { if ($null -ne $value) { $value.Text=$null };$value=$null }
                $phase='sample_write';Write-BusyFrame $sample
                $phase='command_read';$command=[Console]::In.ReadLine()
            }
            if ($command -cne 'stop') { throw 'guard' }
            $phase='native_close';$closed=$native.Stop();$native=$null
            $phase='closed_write';Write-BusyFrame @{kind='reader_closed';resourcesClosed=$closed}
        }
        if (-not $closed) { exit 2 };exit 0
    }
    $setup=[Diagnostics.Stopwatch]::StartNew()
    $phase='reader_start';$readerOwned=Start-BusyChild 'ReaderChild'
    $frame=(Read-HostFrame $readerOwned.Process.StandardOutput.BaseStream $setup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-BusyFailureStage $frame;throw 'guard' }
    Assert-BusyReaderReady $frame
    $phase='holder_start';$holderOwned=Start-BusyChild 'HolderChild'
    $before=(Read-HostFrame $holderOwned.Process.StandardOutput.BaseStream $setup 5000) | ConvertFrom-Json
    if ($before.kind -ceq 'failed') { $phase=Read-BusyFailureStage $before;throw 'guard' }
    Assert-BusyHolder $before 'holder_ready'
    if ($setup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $phase='holder_before';if (-not $before.lockAcquired -or -not $before.leaseActive -or $before.openAttempts -ne 1 -or $before.closeAttempts -ne 0) { throw 'guard' }
    $query=[Diagnostics.Stopwatch]::StartNew()
    $phase='reader_query_write';Write-HostCommand $readerOwned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='reader_query_reply';$sample=(Read-HostFrame $readerOwned.Process.StandardOutput.BaseStream $query 1000) | ConvertFrom-Json
    if ($sample.kind -ceq 'failed') { $phase=Read-BusyFailureStage $sample;throw 'guard' }
    Assert-BusySample $sample
    $phase='holder_query_write';Write-HostCommand $holderOwned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='holder_query_reply';$after=(Read-HostFrame $holderOwned.Process.StandardOutput.BaseStream $query 1000) | ConvertFrom-Json
    if ($after.kind -ceq 'failed') { $phase=Read-BusyFailureStage $after;throw 'guard' }
    Assert-BusyHolder $after 'holder_state'
    if ($query.ElapsedMilliseconds -ge 1000) { throw 'guard' }
    $heldAfter=$after.lockAcquired -and $after.leaseActive -and $after.openAttempts -eq 1 -and $after.closeAttempts -eq 0
    $shutdown=[Diagnostics.Stopwatch]::StartNew();$phase='close'
    $holderClean=Close-BusyChild $holderOwned 'holder_closed' $shutdown;$holderOwned=$null
    $readerClean=Close-BusyChild $readerOwned 'reader_closed' $shutdown;$readerOwned=$null
    if (-not $holderClean.ResourcesClosed -or -not $readerClean.ResourcesClosed -or -not $holderClean.ProcessExited -or -not $readerClean.ProcessExited -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $observed=$heldAfter -and $sample.scopeVerified -and $sample.busyObserved -and $sample.contentWasRead -eq $false -and $sample.readResourcesClosed -and $sample.code -ceq 'host_clipboard_busy'
    $marker='host_clipboard_busy_unavailable';if ($observed) { $marker='host_clipboard_busy_observed' }
    $content='unknown';if ($null -ne $sample.contentWasRead) { $content=$sample.contentWasRead.ToString() }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=Busy,scopeVerified={1},fixtureHeldBeforeQuery=True,fixtureHeldAfterQuery={2},busyObserved={3},contentWasRead={4},readResourcesClosed={5},code={6},holderResourcesClosed=True,readerResourcesClosed=True,holderProcessExited=True,readerProcessExited=True,resourcesClosed=True',$marker,$sample.scopeVerified,$heldAfter,$sample.busyObserved,$content,$sample.readResourcesClosed,$sample.code))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_clipboard_busy_schema_unavailable,stage='+$phase) }
    elseif ($ReaderChild -or $HolderChild) {
        if (@('bind_scope','scope_before','scope_after') -ccontains $phase -and $null -ne $script:editorStage) { $phase=$script:editorStage }
        try { Write-BusyFrame @{kind='failed';stage=$phase} } catch {}
    } else {
        if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
        if ($null -ne $holderOwned) { try { $holderClean=Close-BusyChild $holderOwned 'holder_closed' $shutdown } catch { $holderClean=$null } finally { $holderOwned=$null } }
        if ($null -ne $readerOwned) { try { $readerClean=Close-BusyChild $readerOwned 'reader_closed' $shutdown } catch { $readerClean=$null } finally { $readerOwned=$null } }
        $holderExited=$readerExited='unknown'
        if ($null -ne $holderClean) { $holderExited=$holderClean.ProcessExited.ToString() }
        if ($null -ne $readerClean) { $readerExited=$readerClean.ProcessExited.ToString() }
        [Console]::WriteLine('host_clipboard_busy_unavailable,case=Busy,stage='+$phase+',holderProcessExited='+$holderExited+',readerProcessExited='+$readerExited)
    }
    exit 2
} finally {
    if ($null -ne $fixture) { [void]$fixture.Stop() }
    if ($null -ne $native) { [void]$native.Stop() }
    if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
    if ($null -ne $holderOwned) { [void](Stop-HostOwnedProcess $holderOwned $false $shutdown) }
    if ($null -ne $readerOwned) { [void](Stop-HostOwnedProcess $readerOwned $false $shutdown) }
}
