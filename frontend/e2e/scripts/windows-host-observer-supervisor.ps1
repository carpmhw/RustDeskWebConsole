# 純PowerShell＋既有.NET；parent不編譯C#，此模組不啟動任何程序／listener或修改政策。
# 只驗同owner普通本機路徑與owner-only DACL，不替操作者修ACL，拒絕UNC／network／reparse。
function Assert-HostPrivatePath([string]$Path, [bool]$IsDirectory, [Security.Principal.SecurityIdentifier]$Owner) {
    $full=[IO.Path]::GetFullPath($Path); $root=[IO.Path]::GetPathRoot($full)
    if ($root.StartsWith('\\',[StringComparison]::Ordinal)) { throw 'host_capability_unavailable' }
    $drive=New-Object IO.DriveInfo -ArgumentList $root
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') { throw 'host_capability_unavailable' }
    $item=Get-Item -LiteralPath $full -Force -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.PSIsContainer -ne $IsDirectory) { throw 'host_capability_unavailable' }
    $acl=Get-Acl -LiteralPath $full
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $Owner -or ($IsDirectory -and -not $acl.AreAccessRulesProtected)) { throw 'host_capability_unavailable' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference -ne $Owner) { throw 'host_capability_unavailable' }
    }
    $parent=$item.Directory; if ($IsDirectory) { $parent=$item.Parent }
    while ($null -ne $parent) {
        if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'host_capability_unavailable' }
        $parent=$parent.Parent
    }
}
# stdout僅容許8KiB frame，整次read共用deadline；逾時不得在同pipe再讀。
function Read-HostFrame([IO.Stream]$Stream, [Diagnostics.Stopwatch]$Clock, [int]$Budget) {
    if ($Budget -lt 1 -or $Budget -gt 5000) { throw 'host_capability_unavailable' }
    $bytes=New-Object byte[] 8192; $one=New-Object byte[] 1
    $count=0
    try {
        while ($count -lt $bytes.Length) {
            $left=$Budget-[int]$Clock.ElapsedMilliseconds
            if ($left -le 0) { throw 'host_query_timeout' }
            $pending=$Stream.ReadAsync($one,0,1)
            if (-not $pending.Wait($left)) { throw 'host_query_timeout' }
            if ($Clock.ElapsedMilliseconds -ge $Budget) { throw 'host_query_timeout' }
            if ($pending.Result -ne 1) { throw 'host_capability_unavailable' }
            if ($one[0] -eq 10) { return (New-Object Text.UTF8Encoding -ArgumentList $false,$true).GetString($bytes,0,$count) }
            $bytes[$count]=$one[0]; $count++
        }
        throw 'host_observation_overflow'
    } finally { [Array]::Clear($bytes,0,$bytes.Length); [Array]::Clear($one,0,$one.Length) }
}
# 寫入、flush與讀reply共用同一期限；Flush由純.NET委派在背景執行，不阻塞parent或依賴背景runspace。
function Write-HostCommand([IO.Stream]$Stream, [string]$Command, [Diagnostics.Stopwatch]$Clock, [int]$Budget) {
    if ($Command -cne 'sample' -and $Command -cne 'stop') { throw 'host_capability_unavailable' }
    $bytes=[Text.Encoding]::ASCII.GetBytes($Command+"`n")
    try {
        $left=$Budget-[int]$Clock.ElapsedMilliseconds
        if ($left -le 0) { throw 'host_query_timeout' }
        $pending=$Stream.WriteAsync($bytes,0,$bytes.Length)
        if (-not $pending.Wait($left) -or $Clock.ElapsedMilliseconds -ge $Budget) { throw 'host_query_timeout' }
        # .NET Framework的FileStream.FlushAsync可能在回傳Task前同步flush；不可直接在parent呼叫。
        [Action]$flush=[Delegate]::CreateDelegate([Action],$Stream,'Flush')
        $left=$Budget-[int]$Clock.ElapsedMilliseconds
        if ($left -le 0) { throw 'host_query_timeout' }
        $pending=[Threading.Tasks.Task]::Factory.StartNew($flush,[Threading.CancellationToken]::None,[Threading.Tasks.TaskCreationOptions]::DenyChildAttach,[Threading.Tasks.TaskScheduler]::Default)
        $left=$Budget-[int]$Clock.ElapsedMilliseconds
        if ($left -le 0 -or -not $pending.Wait($left) -or $Clock.ElapsedMilliseconds -ge $Budget) { throw 'host_query_timeout' }
    } finally { [Array]::Clear($bytes,0,$bytes.Length) }
}
# 只接JSON普通NoteProperty；extra／ScriptProperty／null及錯型別先拒絕，不轉型未知資料。
function Assert-HostFields($Value, [string[]]$Names) {
    if ($null -eq $Value -or $Value -isnot [Management.Automation.PSCustomObject]) { throw 'host_capability_unavailable' }
    $properties=@($Value.PSObject.Properties)
    if ($properties.Count -ne $Names.Count) { throw 'host_capability_unavailable' }
    foreach ($property in $properties) {
        if ($property.MemberType -ne [Management.Automation.PSMemberTypes]::NoteProperty -or $Names -cnotcontains $property.Name) { throw 'host_capability_unavailable' }
    }
}
# 整數不接受bool／字串／double轉型；metadata不保存原native PID／HWND。
function Assert-HostInteger($Value, [long]$Min, [long]$Max) {
    if (($Value -isnot [int] -and $Value -isnot [long]) -or $Value -lt $Min -or $Value -gt $Max) { throw 'host_capability_unavailable' }
}
# 只收既有固定安全code，不能把exception message或任意字串寫入結果。
function Assert-HostCode($Value) {
    if ($Value -isnot [string] -or @('host_observed','host_observation_timeout','host_query_timeout','host_scope_changed','host_text_unreadable','host_clipboard_busy','host_clipboard_format_unavailable','host_clipboard_unstable','host_text_too_large','host_text_invalid','host_observation_overflow','host_policy_unavailable','host_capability_unavailable','host_cleanup_unavailable') -cnotcontains $Value) { throw 'host_capability_unavailable' }
}
# 所有row完整重驗後才建白名單副本；判相等依證據，不把兩個false推成true。
function Assert-HostRow($Value, [long]$PreviousEnd, [int]$PreviousNotification, [int]$Notifications) {
    $names=@('ordinal','kind','tStartUs','tEndUs','clipboardOrdinal','notificationUs','scopeVerified','editorReadable','editorExact','editorStable','clipboardReadable','clipboardExact','clipboardStable','clipboardOwnerMatchesEditor','clipboardMatchesEditor','code')
    Assert-HostFields $Value $names
    Assert-HostInteger $Value.ordinal 1 1
    Assert-HostInteger $Value.tStartUs $PreviousEnd 120000000
    Assert-HostInteger $Value.tEndUs $Value.tStartUs 120000000
    if ($Value.kind -isnot [string] -or @('baseline','editor','clipboard','terminal') -cnotcontains $Value.kind) { throw 'host_capability_unavailable' }
    Assert-HostCode $Value.code
    foreach ($name in @('scopeVerified','editorReadable','editorExact','editorStable','clipboardReadable','clipboardExact','clipboardStable')) {
        if ($Value.$name -isnot [bool]) { throw 'host_capability_unavailable' }
    }
    foreach ($name in @('clipboardOwnerMatchesEditor','clipboardMatchesEditor')) {
        if ($null -ne $Value.$name -and $Value.$name -isnot [bool]) { throw 'host_capability_unavailable' }
    }
    if ($Value.kind -ceq 'clipboard') {
        Assert-HostInteger $Value.clipboardOrdinal ($PreviousNotification+1) $Notifications
        Assert-HostInteger $Value.notificationUs 0 $Value.tStartUs
    } elseif ($null -ne $Value.clipboardOrdinal -or $null -ne $Value.notificationUs) { throw 'host_capability_unavailable' }
    if (($Value.editorExact -and (-not $Value.scopeVerified -or -not $Value.editorReadable -or -not $Value.editorStable)) -or ($Value.clipboardExact -and (-not $Value.scopeVerified -or -not $Value.clipboardReadable -or -not $Value.clipboardStable))) { throw 'host_capability_unavailable' }
    if ($null -ne $Value.clipboardMatchesEditor) {
        if (-not $Value.scopeVerified -or -not $Value.editorReadable -or -not $Value.editorStable -or -not $Value.clipboardReadable -or -not $Value.clipboardStable -or ($Value.editorExact -and $Value.clipboardExact -and -not $Value.clipboardMatchesEditor) -or ($Value.editorExact -ne $Value.clipboardExact -and $Value.clipboardMatchesEditor)) { throw 'host_capability_unavailable' }
    }
    $copy=[ordered]@{}
    foreach ($name in $names) { $copy[$name]=$Value.$name }
    return $copy
}
# 開始時立刻保留同一Process handle／identity；startup期限在任何child compile之前起算。
function Start-HostOwnedProcess([Diagnostics.ProcessStartInfo]$Info) {
    $watch=[Diagnostics.Stopwatch]::StartNew()
    $process=[Diagnostics.Process]::Start($Info)
    try {
        $handle=$process.Handle
        return @{Process=$process;Id=$process.Id;Handle=$handle;Startup=$watch}
    } catch { try { if (-not $process.HasExited) { $process.Kill() } } finally { $process.Dispose() }; throw 'host_capability_unavailable' }
}
# 關閉總期限共2000ms，不另等第二個2秒；只kill同一捕獲handle的自有child。
function Stop-HostOwnedProcess($Owned, [bool]$NativeClosed, [Diagnostics.Stopwatch]$Clock) {
    $exited=$false; $normal=$false; $streamsClosed=$true; $process=$Owned.Process
    try {
        if ($process.Id -ne $Owned.Id -or $process.Handle -ne $Owned.Handle) { throw 'host_cleanup_unavailable' }
        $left=[Math]::Max(0,2000-[int]$Clock.ElapsedMilliseconds)
        if (-not $process.HasExited) {
            if (-not $NativeClosed) { $process.Kill() }
            $exited=$process.WaitForExit($left)
            if (-not $exited -and -not $process.HasExited) { $process.Kill() }
        } else { $exited=$true }
        $normal=$exited -and $process.ExitCode -eq 0
    } catch { $exited=$false }
    finally {
        foreach ($name in @('StandardInput','StandardOutput','StandardError')) {
            try { $process.$name.Dispose() } catch { $streamsClosed=$false }
        }
        $process.Dispose()
    }
    return @{ProcessExited=$exited;ResourcesClosed=($NativeClosed -and $normal -and $streamsClosed)}
}
