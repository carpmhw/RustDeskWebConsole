param([switch]$DiagnosticSelfTest,[switch]$RoundTripOnly)
# Windows-only真supervisor契約測試；只建自有公開child，不碰桌面／剪貼簿或政策。
$ErrorActionPreference='Stop'
$owned=$null
$privateRoot=$null
$roundTripShutdown=$null
$roundTripCleanup=$null
$stage='runtime'
# 僅固定階段白名單；未知值一律unknown，不輸出ErrorRecord／Message／stack／路徑。
function Supervisor-FailureMarker($Stage) {
    $allowed=@('runtime','module_load','roundtrip_start','roundtrip_ready','roundtrip_write','roundtrip_reply','roundtrip_stop_write','roundtrip_close_reply','roundtrip_cleanup','acl_create','acl_owner_only','acl_dacl_model','acl_extra_allow','acl_extra_add','acl_extra_persist','acl_extra_readback','acl_extra_reject','acl_restore','acl_restore_readback','junction','parser','reader_valid','reader_bounds','row_valid','row_negative','startup_block','query_block','early_exit','malformed','closed_false','closed_true','cleanup')
    $safe='unknown'
    if ($Stage -is [string] -and $allowed -ccontains $Stage) { $safe=$Stage }
    return ('host_supervisor_contracts_unavailable,stage='+$safe)
}
# 只將真ErrorRecord的enum／已知例外型別映成固定code；最多八層，不讀Message／TargetObject／HResult。
function Supervisor-ErrorMetadata($Record) {
    $unknown=',reason=unknown,category=unknown'
    if ($Record -isnot [Management.Automation.ErrorRecord]) { return $unknown }
    try {
        $category='unknown'
        if ($Record.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::PermissionDenied) { $category='permission_denied' }
        elseif ($Record.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::InvalidArgument) { $category='invalid_argument' }
        elseif ($Record.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::InvalidOperation) { $category='invalid_operation' }
        $reason='unknown';$exception=$Record.Exception
        for ($i=0;$i -lt 8 -and $null -ne $exception;$i++) {
            if ($exception -is [Security.AccessControl.PrivilegeNotHeldException]) { $reason='privilege_not_held' }
            elseif ($exception -is [UnauthorizedAccessException]) { $reason='access_denied' }
            elseif ($exception -is [Security.Principal.IdentityNotMappedException]) { $reason='identity_not_mapped' }
            elseif ($exception -is [ArgumentException]) { $reason='argument_invalid' }
            elseif ($exception -is [ComponentModel.Win32Exception]) {
                switch ($exception.NativeErrorCode) {
                    5 { $reason='access_denied' }
                    87 { $reason='argument_invalid' }
                    1307 { $reason='owner_invalid' }
                    1314 { $reason='privilege_not_held' }
                    1332 { $reason='identity_not_mapped' }
                }
            }
            $exception=$exception.InnerException
        }
        if ($null -ne $exception) { $reason='unknown' }
        return (',reason='+$reason+',category='+$category)
    } catch { return $unknown }
}
# data-only測試只驗白名單，不啟動child或讀任何外部／剪貼簿；與原正常測試出口分離。
if ($DiagnosticSelfTest -and $RoundTripOnly) { [Console]::WriteLine('host_pipe_roundtrip_contracts_unavailable,stage=flags');exit 2 }
if ($DiagnosticSelfTest) {
    # 新階段逐一驗公開marker；漏白名單不得以unknown冒充已定位。
    foreach ($pair in @(
        @('roundtrip_start','host_supervisor_contracts_unavailable,stage=roundtrip_start'),
        @('roundtrip_ready','host_supervisor_contracts_unavailable,stage=roundtrip_ready'),
        @('roundtrip_write','host_supervisor_contracts_unavailable,stage=roundtrip_write'),
        @('roundtrip_reply','host_supervisor_contracts_unavailable,stage=roundtrip_reply'),
        @('roundtrip_stop_write','host_supervisor_contracts_unavailable,stage=roundtrip_stop_write'),
        @('roundtrip_close_reply','host_supervisor_contracts_unavailable,stage=roundtrip_close_reply'),
        @('roundtrip_cleanup','host_supervisor_contracts_unavailable,stage=roundtrip_cleanup'),
        @('acl_dacl_model','host_supervisor_contracts_unavailable,stage=acl_dacl_model'),
        @('acl_extra_add','host_supervisor_contracts_unavailable,stage=acl_extra_add'),
        @('acl_extra_persist','host_supervisor_contracts_unavailable,stage=acl_extra_persist'),
        @('acl_extra_readback','host_supervisor_contracts_unavailable,stage=acl_extra_readback'),
        @('acl_extra_reject','host_supervisor_contracts_unavailable,stage=acl_extra_reject'),
        @('acl_restore_readback','host_supervisor_contracts_unavailable,stage=acl_restore_readback')
    )) {
        if ((Supervisor-FailureMarker $pair[0]) -cne $pair[1]) {
            [Console]::WriteLine('host_supervisor_diagnostic_schema_unavailable');exit 2
        }
    }
    if ((Supervisor-FailureMarker 'row_valid') -cne 'host_supervisor_contracts_unavailable,stage=row_valid' -or (Supervisor-FailureMarker 'Public denied metadata') -cne 'host_supervisor_contracts_unavailable,stage=unknown' -or (Supervisor-FailureMarker $null) -cne 'host_supervisor_contracts_unavailable,stage=unknown') {
        [Console]::WriteLine('host_supervisor_diagnostic_schema_unavailable');exit 2
    }
    # 用真ErrorRecord／Exception驗分類及未知fallback；公開原文與TargetObject不得流入輸出。
    try {
        foreach ($pair in @(
            @([UnauthorizedAccessException]::new('Public denied message'),'access_denied'),
            @([Security.AccessControl.PrivilegeNotHeldException]::new('Public denied privilege'),'privilege_not_held'),
            @([Security.Principal.IdentityNotMappedException]::new('Public denied message'),'identity_not_mapped'),
            @([ArgumentException]::new('Public denied message'),'argument_invalid'),
            @([ComponentModel.Win32Exception]::new(1307,'Public denied message'),'owner_invalid'),
            @([ComponentModel.Win32Exception]::new(5,'Public denied message'),'access_denied'),
            @([ComponentModel.Win32Exception]::new(87,'Public denied message'),'argument_invalid'),
            @([ComponentModel.Win32Exception]::new(1314,'Public denied message'),'privilege_not_held'),
            @([ComponentModel.Win32Exception]::new(1332,'Public denied message'),'identity_not_mapped'),
            @([Exception]::new('Public denied message'),'unknown'),
            @([ComponentModel.Win32Exception]::new(12345,'Public denied message'),'unknown'),
            @([InvalidOperationException]::new('Public denied wrapper',[UnauthorizedAccessException]::new('Public denied inner')),'access_denied')
        )) {
            $record=[Management.Automation.ErrorRecord]::new($pair[0],'Public denied id',[Management.Automation.ErrorCategory]::PermissionDenied,'Public denied target')
            if ((Supervisor-ErrorMetadata $record) -cne (',reason='+$pair[1]+',category=permission_denied')) { throw 'schema' }
        }
        $record=[Management.Automation.ErrorRecord]::new([Exception]::new('Public denied message'),'Public denied id',[Management.Automation.ErrorCategory]::InvalidData,'Public denied target')
        if ((Supervisor-ErrorMetadata $record) -cne ',reason=unknown,category=unknown' -or (Supervisor-ErrorMetadata $null) -cne ',reason=unknown,category=unknown' -or (Supervisor-ErrorMetadata ([pscustomobject]@{Exception='Public denied'})) -cne ',reason=unknown,category=unknown') { throw 'schema' }
        $record=[Management.Automation.ErrorRecord]::new([ArgumentException]::new('Public denied message'),'Public denied id',[Management.Automation.ErrorCategory]::InvalidArgument,'Public denied target')
        if ((Supervisor-ErrorMetadata $record) -cne ',reason=argument_invalid,category=invalid_argument') { throw 'schema' }
        $exception=[UnauthorizedAccessException]::new('Public denied inner')
        for ($i=0;$i -lt 7;$i++) { $exception=[InvalidOperationException]::new('Public denied wrapper',$exception) }
        $record=[Management.Automation.ErrorRecord]::new($exception,'Public denied id',[Management.Automation.ErrorCategory]::InvalidOperation,$null)
        if ((Supervisor-ErrorMetadata $record) -cne ',reason=access_denied,category=invalid_operation') { throw 'schema' }
        $exception=[InvalidOperationException]::new('Public denied wrapper',$exception)
        $record=[Management.Automation.ErrorRecord]::new($exception,'Public denied id',[Management.Automation.ErrorCategory]::InvalidOperation,$null)
        if ((Supervisor-ErrorMetadata $record) -cne ',reason=unknown,category=invalid_operation') { throw 'schema' }
    } catch { [Console]::WriteLine('host_supervisor_diagnostic_schema_unavailable');exit 2 }
    [Console]::WriteLine('host_supervisor_diagnostic_schema_observed,liveTextQueries=false');exit 0
}
# 固定失敗訊息不帶frame原文或底層exception。
function Assert-Test([bool]$Value) { if (-not $Value) { throw 'host_test_failed' } }
# 必須確實拒絕，不將無例外或原native錯誤誤當測試通過。
function Assert-Rejected([scriptblock]$Action) {
    $failed=$false
    try { [void](& $Action) } catch { $failed=$true }
    Assert-Test $failed
}
# 此public row手寫oracle，不從被測validator生成預期。
function Public-Row {
    return ('{"ordinal":1,"kind":"clipboard","tStartUs":100,"tEndUs":110,"clipboardOrdinal":1,"notificationUs":90,"scopeVerified":true,"editorReadable":true,"editorExact":false,"editorStable":true,"clipboardReadable":true,"clipboardExact":false,"clipboardStable":true,"clipboardOwnerMatchesEditor":true,"clipboardMatchesEditor":true,"code":"host_observed"}' | ConvertFrom-Json)
}
# 真PowerShell子程序只固定sleep／exit／輸出公開frame，用於監督而非假裝Windows輸入成功。
function Public-Child([string]$Mode) {
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments='-NoProfile -STA -NonInteractive -File "'+(Join-Path $PSScriptRoot 'windows-host-observer-fixture.ps1')+'" -Mode "'+$Mode+'"'
    $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    return (Start-HostOwnedProcess $info)
}
try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { throw 'guard' }
    $stage='module_load'
    . (Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1')
    # 獨立正向pipe校準；回應只能在child真的讀到sample／stop後產生，不讀live內容。
    if ($RoundTripOnly) {
        $stage='roundtrip_start'
        $owned=Public-Child 'round-trip'
        $stage='roundtrip_ready'
        Assert-Test ((Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) -ceq 'public_ready')
        $query=[Diagnostics.Stopwatch]::StartNew()
        $stage='roundtrip_write'
        Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
        $stage='roundtrip_reply'
        Assert-Test ((Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000) -ceq 'public_sample_received')
        $roundTripShutdown=[Diagnostics.Stopwatch]::StartNew()
        $stage='roundtrip_stop_write'
        Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $roundTripShutdown 2000
        $stage='roundtrip_close_reply'
        Assert-Test ((Read-HostFrame $owned.Process.StandardOutput.BaseStream $roundTripShutdown 2000) -ceq 'public_stop_received')
        $stage='roundtrip_cleanup'
        $roundTripCleanup=Stop-HostOwnedProcess $owned $true $roundTripShutdown;$owned=$null
        Assert-Test ($roundTripCleanup.ProcessExited -and $roundTripCleanup.ResourcesClosed -and $roundTripShutdown.ElapsedMilliseconds -lt 2000)
        [Console]::WriteLine('host_pipe_roundtrip_contracts_observed,liveTextQueries=false');exit 0
    }
    # ACL與junction使用全新自有temp，拒絕extra Allow，不改既有目錄或安全政策。
    $stage='acl_create'
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try { $owner=$identity.User } finally { $identity.Dispose() }
    $privateRoot=Join-Path ([IO.Path]::GetTempPath()) ('rdweb-host-public-test-'+[Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($privateRoot)
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false)
    $rule=New-Object Security.AccessControl.FileSystemAccessRule -ArgumentList $owner,([Security.AccessControl.FileSystemRights]::FullControl),([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),([Security.AccessControl.PropagationFlags]::None),([Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule);Set-Acl -LiteralPath $privateRoot -AclObject $acl
    $stage='acl_owner_only'
    Assert-HostPrivatePath $privateRoot $true $owner
    $groupBefore=(Get-Acl -LiteralPath $privateRoot).GetGroup([Security.Principal.SecurityIdentifier])
    # 測試更新模型只含DACL，不能順帶更新owner／group／audit。
    $stage='acl_dacl_model'
    $directory=New-Object IO.DirectoryInfo -ArgumentList $privateRoot
    $acl=$directory.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
    Assert-Test ($null -eq $acl.GetOwner([Security.Principal.SecurityIdentifier]) -and $null -eq $acl.GetGroup([Security.Principal.SecurityIdentifier]) -and $acl.GetAuditRules($true,$true,[Security.Principal.SecurityIdentifier]).Count -eq 0 -and $acl.AreAccessRulesProtected)
    $stage='acl_extra_allow'
    $extra=New-Object Security.AccessControl.FileSystemAccessRule -ArgumentList (New-Object Security.Principal.SecurityIdentifier -ArgumentList 'S-1-5-32-545'),([Security.AccessControl.FileSystemRights]::Read),([Security.AccessControl.AccessControlType]::Allow)
    $stage='acl_extra_add'
    $acl.AddAccessRule($extra)
    $stage='acl_extra_persist'
    # 只持久化新讀模型的Access變更；不走Set-Acl完整descriptor複製與Audit fallback。
    $directory.SetAccessControl($acl)
    # 真回讀確認owner／group保留、仍停用繼承且兩個公開測試ACE完整落盤；不讀SACL或輸出SID。
    $stage='acl_extra_readback'
    $persisted=Get-Acl -LiteralPath $privateRoot
    Assert-Test ($persisted.GetOwner([Security.Principal.SecurityIdentifier]) -eq $owner -and $persisted.GetGroup([Security.Principal.SecurityIdentifier]) -eq $groupBefore -and $persisted.AreAccessRulesProtected)
    $rules=@($persisted.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    $ownerAllow=$false;$extraAllow=$false
    foreach ($entry in $rules) {
        Assert-Test (-not $entry.IsInherited -and $entry.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow)
        if ($entry.IdentityReference -eq $owner -and $entry.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl) { $ownerAllow=$true }
        if ($entry.IdentityReference -eq $extra.IdentityReference -and $entry.FileSystemRights -eq ([Security.AccessControl.FileSystemRights]::Read -bor [Security.AccessControl.FileSystemRights]::Synchronize)) { $extraAllow=$true }
    }
    Assert-Test ($rules.Count -eq 2 -and $ownerAllow -and $extraAllow)
    $stage='acl_extra_reject'
    Assert-Rejected {Assert-HostPrivatePath $privateRoot $true $owner}
    $stage='acl_restore'
    [void]$acl.RemoveAccessRule($extra);$directory.SetAccessControl($acl)
    $stage='acl_restore_readback'
    Assert-HostPrivatePath $privateRoot $true $owner
    $restored=Get-Acl -LiteralPath $privateRoot
    $rules=@($restored.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    Assert-Test ($restored.GetGroup([Security.Principal.SecurityIdentifier]) -eq $groupBefore -and $rules.Count -eq 1 -and $rules[0].IdentityReference -eq $owner -and $rules[0].FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and -not $rules[0].IsInherited)
    $stage='junction'
    $junction=Join-Path $privateRoot 'link';$destination=Join-Path $privateRoot 'public';[void][IO.Directory]::CreateDirectory($destination)
    [void](New-Item -ItemType Junction -Path $junction -Value $destination)
    Assert-Rejected {Assert-HostPrivatePath $junction $true $owner}
    [IO.Directory]::Delete($junction)
    $stage='parser'
    foreach ($path in @('windows-host-observer-supervisor.ps1','windows-host-observer.ps1','test-windows-host-supervisor.ps1')) {
        $tokens=$null; $errors=$null
        [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $path),[ref]$tokens,[ref]$errors)
        Assert-Test ($errors.Count -eq 0)
    }
    $stage='reader_valid'
    $bytes=[Text.Encoding]::UTF8.GetBytes("public_frame`n")
    $stream=New-Object IO.MemoryStream -ArgumentList (,$bytes)
    try { Assert-Test ((Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000) -ceq 'public_frame') } finally { $stream.Dispose() }
    $stage='reader_bounds'
    foreach ($bytes in @([Text.Encoding]::UTF8.GetBytes(('A'*8193)+"`n"),[byte[]]@(255,10))) {
        $stream=New-Object IO.MemoryStream -ArgumentList (,$bytes)
        try { Assert-Rejected { Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000 } } finally { $stream.Dispose() }
    }
    $stage='row_valid'
    $row=Assert-HostRow (Public-Row) 0 0 1
    Assert-Test ($row.clipboardMatchesEditor -eq $true -and -not $row.editorExact -and -not $row.clipboardExact)
    $stage='row_negative'
    foreach ($kind in @('extra','wrong_type','backwards','duplicate','contradiction','missing_readable','too_late')) {
        $value=Public-Row
        switch ($kind) {
            extra { $value | Add-Member -NotePropertyName raw -NotePropertyValue 'Public denied' }
            wrong_type { $value.editorReadable='true' }
            backwards { $value.tEndUs=99 }
            contradiction { $value.editorExact=$true }
            missing_readable { $value.editorReadable=$false }
            too_late { $value.tEndUs=120000001 }
        }
        $prior=0; if ($kind -ceq 'duplicate') { $prior=1 }
        Assert-Rejected { Assert-HostRow $value 0 $prior 1 }
    }
    # startup阻塞真child，compile期亦不在parent中執行；5秒無ready必拒絕並收自有child。
    $stage='startup_block'
    $owned=Public-Child 'block'
    $watch=[Diagnostics.Stopwatch]::StartNew()
    Assert-Rejected { Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000 }
    $closed=Stop-HostOwnedProcess $owned $false ([Diagnostics.Stopwatch]::StartNew())
    Assert-Test ($closed.ProcessExited -and -not $closed.ResourcesClosed -and $watch.ElapsedMilliseconds -lt 7500)
    $owned=$null
    # 原生query阻塞模擬仍使用真pipe／child；1000ms後不能新開query或反覆延長。
    $stage='query_block'
    $owned=Public-Child 'query-block'
    Assert-Test ((Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) -ceq 'public_ready')
    $watch=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $watch 1000
    Assert-Rejected { Read-HostFrame $owned.Process.StandardOutput.BaseStream $watch 1000 }
    $closed=Stop-HostOwnedProcess $owned $false ([Diagnostics.Stopwatch]::StartNew())
    Assert-Test ($closed.ProcessExited -and -not $closed.ResourcesClosed -and $watch.ElapsedMilliseconds -lt 3500)
    $owned=$null
    # child早exit不可被當ready；exit與native resourcesClosed不可互換。
    $stage='early_exit'
    $owned=Public-Child 'early-exit'
    Assert-Rejected { Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000 }
    $closed=Stop-HostOwnedProcess $owned $false ([Diagnostics.Stopwatch]::StartNew())
    Assert-Test ($closed.ProcessExited -and -not $closed.ResourcesClosed)
    $owned=$null
    # 真malformed child不能被當row或進落盤；程序成功exit亦不能代替完整schema。
    $stage='malformed'
    $owned=Public-Child 'malformed'
    $value=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    Assert-Rejected {Assert-HostRow $value 0 0 0}
    $closed=Stop-HostOwnedProcess $owned $false ([Diagnostics.Stopwatch]::StartNew());$owned=$null
    Assert-Test (-not $closed.ResourcesClosed)
    foreach ($mode in @('closed-false','closed-true')) {
        $stage='closed_false';if ($mode -ceq 'closed-true') { $stage='closed_true' }
        $owned=Public-Child $mode
        $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
        Assert-HostFields $frame @('kind','resourcesClosed')
        $closed=Stop-HostOwnedProcess $owned $frame.resourcesClosed ([Diagnostics.Stopwatch]::StartNew());$owned=$null
        Assert-Test ($closed.ProcessExited -and $closed.ResourcesClosed -eq ($mode -ceq 'closed-true'))
    }
    [Console]::WriteLine('host_supervisor_contracts_observed,liveTextQueries=false')
} catch {
    $record=$_
    $marker=Supervisor-FailureMarker $stage
    if ($RoundTripOnly) {
        $marker=$marker.Replace('host_supervisor_contracts_unavailable','host_pipe_roundtrip_contracts_unavailable')
        # 正向探針失敗先收自有child才報固定布林；已有shutdown則沿同一期限，不補新2秒。
        if ($null -ne $owned) {
            if ($null -eq $roundTripShutdown) { $roundTripShutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $roundTripCleanup=Stop-HostOwnedProcess $owned $false $roundTripShutdown }
            catch { $roundTripCleanup=$null }
            finally { $owned=$null }
        }
        $exited='unknown'
        if ($null -ne $roundTripCleanup -and $roundTripCleanup.ProcessExited -is [bool]) { $exited=$roundTripCleanup.ProcessExited.ToString() }
        $marker+=(',processExited='+$exited)
    }
    if ($stage -ceq 'acl_extra_persist') { $marker+=(Supervisor-ErrorMetadata $record) }
    [Console]::WriteLine($marker);exit 2
}
finally {
    if ($null -ne $owned) {
        if ($null -eq $roundTripShutdown) { $roundTripShutdown=[Diagnostics.Stopwatch]::StartNew() }
        [void](Stop-HostOwnedProcess $owned $false $roundTripShutdown)
    }
    if ($null -ne $privateRoot) {
        # 只刪本案自行建立且未再連向其他位置的精確temp；junction先解除，不廣泛清理Temp。
        $link=Join-Path $privateRoot 'link'
        if (Test-Path -LiteralPath $link) { [IO.Directory]::Delete($link) }
        Remove-Item -LiteralPath $privateRoot -Recurse -Force
    }
}
