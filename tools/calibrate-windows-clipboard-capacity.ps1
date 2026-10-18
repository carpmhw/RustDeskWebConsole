param([switch]$ContainerOversize,[switch]$AllowClipboardOverwrite,[switch]$DiagnosticSelfTest,[switch]$Child,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# 獨立容量校準候選；只有雙重opt-in的sample才可覆寫公開clipboard，正式reader不變。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$native=$null;$fixture=$null;$shutdown=$null;$cleanup=$null;$phase='policy'
$changeState='not_requested'

# 所有mode先純資料驗證，selftest／錯配flags不得建立child或接觸clip。
function Test-CapacityMode([bool]$Container,[bool]$Allow,[bool]$Self,[bool]$IsChild) {
    if ($Self) { return (-not $Container -and -not $Allow -and -not $IsChild) }
    return ($Container -and $Allow)
}

# 模組載入前只驗source owner-only與本機非reparse，不修ACL或輸出SID。
function Assert-CapacitySource([string]$Path,[bool]$Directory) {
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

# 安全sample完整欄位先驗，ReaderRejected不能靠單一code或兩個false補票。
function Assert-CapacitySample($Value) {
    Assert-HostFields $Value @('kind','scopeVerified','producerPublished','containerOversizeVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow','code')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in @('scopeVerified','producerPublished','containerOversizeVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    $codes=@('host_observed','host_capability_unavailable','host_cleanup_unavailable','host_scope_changed','host_observation_overflow','host_clipboard_unstable','host_text_too_large','host_clipboard_busy','host_clipboard_format_unavailable','host_text_invalid','host_text_unreadable')
    if ($codes -cnotcontains $Value.code) { throw 'guard' }
    if ($Value.ownerVersionMatched -and (-not $Value.producerPublished -or -not $Value.containerOversizeVerified)) { throw 'guard' }
    if ($Value.readerRejected -and (-not $Value.scopeVerified -or -not $Value.producerPublished -or -not $Value.containerOversizeVerified -or -not $Value.ownerVersionMatched -or $Value.textReturned -or -not $Value.readResourcesClosed -or $Value.overflow -or $Value.code -cne 'host_text_too_large')) { throw 'guard' }
}

# 資源與overflow獨立驗，正常close不代表這次資料可用。
function Assert-CapacityClosed($Value) {
    Assert-HostFields $Value @('kind','writerResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'closed') { throw 'guard' }
    foreach ($name in @('writerResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    if ($Value.resourcesClosed -ne ($Value.writerResourcesClosed -and $Value.listenerResourcesClosed)) { throw 'guard' }
}

# 明確成功predicate保留晚到overflow／close失敗，不把合法負向DTO冒充PASS。
function Test-CapacityObserved($Sample,$Closed) {
    Assert-CapacitySample $Sample;Assert-CapacityClosed $Closed
    if ($Sample.overflow -and -not $Closed.overflow) { throw 'guard' }
    return ($Sample.readerRejected -and $Sample.scopeVerified -and $Sample.producerPublished -and $Sample.containerOversizeVerified -and $Sample.ownerVersionMatched -and -not $Sample.textReturned -and $Sample.readResourcesClosed -and -not $Sample.overflow -and -not $Closed.overflow -and $Closed.resourcesClosed -and $Sample.code -ceq 'host_text_too_large')
}

# 只白名單child stage，不讀Message／stack或未知frame內容。
function Read-CapacityFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','coordinate_setup','session_setup','bind_scope','listener','writer_setup','ready_write','sample_command','publish','scope_before','reader','scope_after','classify','stop_command','native_close','closed_write')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}

# frame只有受控metadata，raw native value永遠不傳出child。
function Write-CapacityFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}

# 手寫literal oracle僅驗資料型、mode及真正MemoryStream，不編譯C#或啟window。
function Test-CapacitySchema {
    $sampleLiteral='{"kind":"sample","scopeVerified":true,"producerPublished":true,"containerOversizeVerified":true,"ownerVersionMatched":true,"readerRejected":true,"textReturned":false,"readResourcesClosed":true,"overflow":false,"code":"host_text_too_large"}'
    $closedLiteral='{"kind":"closed","writerResourcesClosed":true,"listenerResourcesClosed":true,"overflow":false,"resourcesClosed":true}'
    $sample=$sampleLiteral | ConvertFrom-Json;$closed=$closedLiteral | ConvertFrom-Json
    if (-not (Test-CapacityObserved $sample $closed)) { throw 'guard' }
    foreach ($mutation in @('extra','missing','wrong_bool','unknown_code','scope','producer','container','owner','text','read_close','overflow','reader_code')) {
        $value=$sampleLiteral | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'missing' { $value.PSObject.Properties.Remove('code') }
            'wrong_bool' { $value.readerRejected='True' }
            'unknown_code' { $value.code='Unknown public code' }
            'scope' { $value.scopeVerified=$false }
            'producer' { $value.producerPublished=$false }
            'container' { $value.containerOversizeVerified=$false }
            'owner' { $value.ownerVersionMatched=$false }
            'text' { $value.textReturned=$true }
            'read_close' { $value.readResourcesClosed=$false }
            'overflow' { $value.overflow=$true }
            'reader_code' { $value.code='host_clipboard_busy' }
        }
        $rejected=$false
        try { Assert-CapacitySample $value } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    foreach ($code in @('host_clipboard_busy','host_clipboard_unstable','host_capability_unavailable')) {
        $value=$sampleLiteral | ConvertFrom-Json;$value.readerRejected=$false;$value.code=$code
        Assert-CapacitySample $value
        if (Test-CapacityObserved $value $closed) { throw 'guard' }
    }
    foreach ($mutation in @('extra','wrong_bool','inconsistent','late_overflow','writer','listener')) {
        $value=$closedLiteral | ConvertFrom-Json
        switch ($mutation) {
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'wrong_bool' { $value.resourcesClosed='True' }
            'inconsistent' { $value.resourcesClosed=$false }
            'late_overflow' { $value.overflow=$true }
            'writer' { $value.writerResourcesClosed=$value.resourcesClosed=$false }
            'listener' { $value.listenerResourcesClosed=$value.resourcesClosed=$false }
        }
        if ($mutation -eq 'late_overflow' -or $mutation -eq 'writer' -or $mutation -eq 'listener') {
            if (Test-CapacityObserved $sample $value) { throw 'guard' }
        } else {
            $rejected=$false;try { Assert-CapacityClosed $value } catch { $rejected=$true }
            if (-not $rejected) { throw 'guard' }
        }
    }
    $value=$sampleLiteral | ConvertFrom-Json;$value.PSObject.Properties.Remove('code');$script:capacityGetterRead=$false
    # getter不可在欄位檢查前被執行。
    $value | Add-Member -MemberType ScriptProperty -Name code -Value { $script:capacityGetterRead=$true;return 'host_text_too_large' }
    $rejected=$false;try { Assert-CapacitySample $value } catch { $rejected=$true }
    if (-not $rejected -or $script:capacityGetterRead) { throw 'guard' }
    foreach ($container in @($false,$true)) { foreach ($allow in @($false,$true)) {
        if ((Test-CapacityMode $container $allow $false $false) -ne ($container -and $allow)) { throw 'guard' }
        if (Test-CapacityMode $container $allow $true $true) { throw 'guard' }
        if ((Test-CapacityMode $container $allow $true $false) -ne (-not $container -and -not $allow)) { throw 'guard' }
        if ((Test-CapacityMode $container $allow $false $true) -ne ($container -and $allow)) { throw 'guard' }
    } }
    $errorRecord=[Management.Automation.ErrorRecord]::new([InvalidOperationException]::new('Public metadata'),'Public',[Management.Automation.ErrorCategory]::NotSpecified,$null)
    $rejected=$false;try { Assert-CapacitySample $errorRecord } catch { $rejected=$true }
    if (-not $rejected) { throw 'guard' }
    $frame=[pscustomobject]@{kind='failed';stage='publish'}
    if ((Read-CapacityFailureStage $frame) -cne 'child_publish') { throw 'guard' }
    $frame.stage='Unknown public stage';$rejected=$false
    try { [void](Read-CapacityFailureStage $frame) } catch { $rejected=$true }
    if (-not $rejected) { throw 'guard' }
    $bytes=[Text.Encoding]::UTF8.GetBytes('{"kind":"ready"}'+"`n")
    $stream=[IO.MemoryStream]::new($bytes)
    try {
        if ((Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000) -cne '{"kind":"ready"}') { throw 'guard' }
    } finally { $stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length) }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned' -or (Get-ExecutionPolicy -Scope Process) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User
        $principal=[Security.Principal.WindowsPrincipal]::new($identity)
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $phase='flags'
    if (-not (Test-CapacityMode ([bool]$ContainerOversize) ([bool]$AllowClipboardOverwrite) ([bool]$DiagnosticSelfTest) ([bool]$Child)) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) {
        if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' }
    }
    Assert-CapacitySource $PSScriptRoot $true;Assert-CapacitySource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $core=Join-Path $PSScriptRoot 'windows-clipboard-capacity-core.cs'
    $writer=Join-Path $PSScriptRoot 'windows-clipboard-capacity-fixture.cs'
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$reader,$core,$writer)) { Assert-CapacitySource $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-CapacitySchema
        [Console]::WriteLine('host_clipboard_capacity_schema_observed,liveClipboardQueries=false,clipboardWritten=false');exit 0
    }
    if ($Child) {
        $phase='compile';Add-Type -LiteralPath @($nativeSource,$geometry,$editorCore,$core,$writer) -ErrorAction Stop
        Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
        $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
        try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
        . $reader
        $editor=@{x=$X;y=$Y;width=$Width;height=$Height};$script:editorIdentity=$null;$script:editorTextCalls=0
        $phase='bind_scope';[void](Get-HostEditorPattern $editor)
        $phase='listener';$native=[HostObserverNative]::new()
        if (-not $native.Ready) { throw 'guard' }
        $phase='writer_setup';$fixture=[HostClipboardCapacityWindows]::StartWindows()
        if (-not $fixture.Ready) { throw 'guard' }
        $phase='ready_write';Write-CapacityFrame @{kind='ready'}
        $phase='sample_command';if ([Console]::In.ReadLine() -cne 'sample') { throw 'guard' }
        $value=$null;$notifications=0
        try {
            # 再驗scope後才觸一次新副作用；已送sample的父程序保守視為unknown。
            $phase='scope_before';[void](Get-HostEditorPattern $editor)
            $phase='listener';if (-not $native.Ready -or $native.Overflow) { throw 'guard' }
            $phase='publish';$publication=$fixture.Publish()
            $ownerBefore=$false;$ownerAfter=$false
            if ($publication.Published -and $publication.ContainerOversizeVerified -and $publication.WriterOpenClosed -and $publication.Code -ceq 'host_observed') {
                $phase='scope_before';[void](Get-HostEditorPattern $editor)
                $ownerBefore=$fixture.MatchesPublished()
                if ($ownerBefore) {
                    $version=$fixture.PublishedVersion()
                    if ($version -ne 0 -and -not $native.Overflow) {
                        $phase='reader';$value=$native.ReadClipboard($version,$script:editorPid)
                        $phase='scope_after';[void](Get-HostEditorPattern $editor)
                        $ownerAfter=$fixture.MatchesPublished()
                    } else { $ownerBefore=$false }
                }
            }
            foreach ($notice in $native.Drain()) { $notifications++ }
            $phase='classify'
            $row=[HostClipboardCapacityCalibration]::Classify($publication,$value,$true,($ownerBefore -and $ownerAfter),$native.Overflow)
            $sample=@{kind='sample';scopeVerified=$row.ScopeVerified;producerPublished=$row.ProducerPublished;containerOversizeVerified=$row.ContainerOversizeVerified;ownerVersionMatched=$row.OwnerVersionMatched;readerRejected=$row.ReaderRejected;textReturned=$row.TextReturned;readResourcesClosed=$row.ReadResourcesClosed;overflow=$row.Overflow;code=$row.Code}
        } finally { if ($null -ne $value) { $value.Text=$null };$value=$null }
        Write-CapacityFrame $sample
        $phase='stop_command';if ([Console]::In.ReadLine() -cne 'stop') { throw 'guard' }
        $phase='native_close';$writerClosed=$false;$listenerClosed=$false
        # 兩個Stop各自嘗試，不以第一項false短路而漏收另一項。
        try { $writerClosed=$fixture.Stop() } catch {} finally { $fixture=$null }
        try { $listenerClosed=$native.Stop() } catch {}
        foreach ($notice in $native.Drain()) { $notifications++ }
        $overflow=$native.Overflow;$native=$null
        $closed=$writerClosed -and $listenerClosed
        $phase='closed_write';Write-CapacityFrame @{kind='closed';writerResourcesClosed=$writerClosed;listenerResourcesClosed=$listenerClosed;overflow=$overflow;resourcesClosed=$closed}
        if (-not $closed) { exit 2 };exit 0
    }
    $phase='startup';$info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -ContainerOversize -AllowClipboardOverwrite -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-CapacityFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'ready' -or $owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $query=[Diagnostics.Stopwatch]::StartNew()
    # 寫入可能部分完成，即使write失敗也不可宣稱clipboard未變。
    $phase='query_write';$changeState='unknown';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply';$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_schema';$sample=$reply | ConvertFrom-Json;$reply=$null
    if ($sample.kind -ceq 'failed') { $phase=Read-CapacityFailureStage $sample;throw 'guard' }
    Assert-CapacitySample $sample
    if ($sample.producerPublished) { $changeState='published' }
    if ($query.ElapsedMilliseconds -ge 1000) { throw 'guard' }
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-CapacityFailureStage $frame;throw 'guard' }
    Assert-CapacityClosed $frame
    $observed=Test-CapacityObserved $sample $frame
    $cleanup=Stop-HostOwnedProcess $owned $frame.resourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $phase='result';$marker='host_clipboard_capacity_unavailable';if ($observed) { $marker='host_clipboard_capacity_observed' }
    $overflow=$sample.overflow -or $frame.overflow
    $code=$sample.code;if ($overflow) { $code='host_observation_overflow' }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=ContainerOversize,scopeVerified={1},producerPublished={2},containerOversizeVerified={3},ownerVersionMatched={4},readerRejected={5},textReturned={6},readResourcesClosed={7},writerResourcesClosed={8},listenerResourcesClosed={9},overflow={10},resourcesClosed=True,processExited=True,code={11}',$marker,$sample.scopeVerified,$sample.producerPublished,$sample.containerOversizeVerified,$sample.ownerVersionMatched,($sample.readerRejected -and -not $overflow),$sample.textReturned,$sample.readResourcesClosed,$frame.writerResourcesClosed,$frame.listenerResourcesClosed,$overflow,$code))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_clipboard_capacity_schema_unavailable,stage='+$phase) }
    elseif ($Child) {
        try { Write-CapacityFrame @{kind='failed';stage=$phase} } catch {}
    } else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_clipboard_capacity_unavailable,case=ContainerOversize,stage='+$phase+',clipboardChangeState='+$changeState+',processExited='+$exited)
    }
    exit 2
} finally {
    if ($null -ne $fixture) { try { [void]$fixture.Stop() } catch {} }
    if ($null -ne $native) { try { [void]$native.Stop() } catch {} }
    if ($null -ne $owned) {
        if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
        [void](Stop-HostOwnedProcess $owned $false $shutdown)
    }
}
