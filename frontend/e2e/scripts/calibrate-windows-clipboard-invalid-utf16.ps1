param([switch]$InvalidUtf16,[switch]$AllowClipboardOverwrite,[switch]$DiagnosticSelfTest,[switch]$Child,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# 獨立固定非法UTF16校準；只有雙opt-in的唯一sample才可清除／覆寫clipboard。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$native=$null;$fixture=$null;$shutdown=$null;$cleanup=$null;$phase='policy'
$changeState='not_requested'
# mode錯配與schema都不得建立child或讀寫剪貼簿。
function Test-InvalidUtf16Mode([bool]$Invalid,[bool]$Allow,[bool]$Self,[bool]$IsChild) {
    if ($Self) { return (-not $Invalid -and -not $Allow -and -not $IsChild) }
    return ($Invalid -and $Allow)
}
# 載入模組前只驗private來源，拒絕UNC／network／reparse，不修ACL。
function Assert-InvalidUtf16Source([string]$Path,[bool]$Directory) {
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
# 固定ordinary欄位先驗，invalid共用碼不能單獨補足來源／正常收尾。
function Assert-InvalidUtf16Sample($Value) {
    Assert-HostFields $Value @('kind','scopeVerified','producerPublished','fixtureVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow','code')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in @('scopeVerified','producerPublished','fixtureVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    $codes=@('host_observed','host_capability_unavailable','host_cleanup_unavailable','host_scope_changed','host_observation_overflow','host_clipboard_unstable','host_text_too_large','host_clipboard_busy','host_clipboard_format_unavailable','host_text_invalid','host_text_unreadable')
    if ($codes -cnotcontains $Value.code) { throw 'guard' }
    if ($Value.ownerVersionMatched -and (-not $Value.producerPublished -or -not $Value.fixtureVerified)) { throw 'guard' }
    if ($Value.readerRejected -and (-not $Value.scopeVerified -or -not $Value.producerPublished -or -not $Value.fixtureVerified -or -not $Value.ownerVersionMatched -or $Value.textReturned -or -not $Value.readResourcesClosed -or $Value.overflow -or $Value.code -cne 'host_text_invalid')) { throw 'guard' }
}
# 各native正常清理與總資源合取一致，thread退出本身不等於成功。
function Assert-InvalidUtf16Closed($Value) {
    Assert-HostFields $Value @('kind','writerResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'closed') { throw 'guard' }
    foreach ($name in @('writerResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    if ($Value.resourcesClosed -ne ($Value.writerResourcesClosed -and $Value.listenerResourcesClosed)) { throw 'guard' }
}
# 保留late overflow／cleanup失敗，不只看code或空Text。
function Test-InvalidUtf16Observed($Sample,$Closed) {
    Assert-InvalidUtf16Sample $Sample;Assert-InvalidUtf16Closed $Closed
    if ($Sample.overflow -and -not $Closed.overflow) { throw 'guard' }
    return ($Sample.readerRejected -and $Sample.scopeVerified -and $Sample.producerPublished -and $Sample.fixtureVerified -and $Sample.ownerVersionMatched -and -not $Sample.textReturned -and $Sample.readResourcesClosed -and -not $Sample.overflow -and -not $Closed.overflow -and $Closed.resourcesClosed -and $Sample.code -ceq 'host_text_invalid')
}
# child stage只接受白名單，未知frame不反射原字串。
function Read-InvalidUtf16FailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','coordinate_setup','session_setup','bind_scope','listener','writer_setup','ready_write','sample_command','publish','scope_before','reader','scope_after','classify','stop_command','native_close','closed_write')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}
# 只輸出自行建立的有界metadata frame，native value永不序列化。
function Write-InvalidUtf16Frame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}
# 資料型oracle先寫，不能靠受測builder生成期望值。
function Test-InvalidUtf16Schema {
    $sampleLiteral='{"kind":"sample","scopeVerified":true,"producerPublished":true,"fixtureVerified":true,"ownerVersionMatched":true,"readerRejected":true,"textReturned":false,"readResourcesClosed":true,"overflow":false,"code":"host_text_invalid"}'
    $closedLiteral='{"kind":"closed","writerResourcesClosed":true,"listenerResourcesClosed":true,"overflow":false,"resourcesClosed":true}'
    $sample=$sampleLiteral | ConvertFrom-Json;$closed=$closedLiteral | ConvertFrom-Json
    if (-not (Test-InvalidUtf16Observed $sample $closed)) { throw 'literal' }
    foreach ($mutation in @('scopeVerified','producerPublished','fixtureVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow','code','extra','missing','bool_type')) {
        $value=$sampleLiteral | ConvertFrom-Json
        switch ($mutation) {
            'code' { $value.code='Public unknown code' }
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'missing' { $value.PSObject.Properties.Remove('fixtureVerified') }
            'bool_type' { $value.readerRejected='True' }
            default { $value.$mutation=-not $value.$mutation }
        }
        $observed=$false
        try { $observed=Test-InvalidUtf16Observed $value $closed } catch {}
        if ($observed) { throw 'sample_mutation' }
    }
    foreach ($mutation in @('writer','listener','inconsistent','overflow','extra','bool_type')) {
        $value=$closedLiteral | ConvertFrom-Json
        switch ($mutation) {
            'writer' { $value.writerResourcesClosed=$value.resourcesClosed=$false }
            'listener' { $value.listenerResourcesClosed=$value.resourcesClosed=$false }
            'inconsistent' { $value.resourcesClosed=$false }
            'overflow' { $value.overflow=$true }
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'bool_type' { $value.resourcesClosed='True' }
        }
        $observed=$false;try { $observed=Test-InvalidUtf16Observed $sample $value } catch {}
        if ($observed) { throw 'closed_mutation' }
    }
    foreach ($code in @('host_observed','host_clipboard_busy','host_clipboard_format_unavailable','host_clipboard_unstable','host_text_too_large','host_text_unreadable','host_cleanup_unavailable','host_capability_unavailable','host_scope_changed','host_observation_overflow')) {
        $value=$sampleLiteral | ConvertFrom-Json;$value.readerRejected=$false;$value.code=$code
        Assert-InvalidUtf16Sample $value
        if (Test-InvalidUtf16Observed $value $closed) { throw 'wrong_code' }
    }
    $value=$sampleLiteral | ConvertFrom-Json;$value.readerRejected=$false;$value.fixtureVerified=$false
    $rejected=$false;try { Assert-InvalidUtf16Sample $value } catch { $rejected=$true }
    if (-not $rejected) { throw 'owner_requires_fixture' }
    $value=$sampleLiteral | ConvertFrom-Json;$value.PSObject.Properties.Remove('code');$script:invalidUtf16GetterRead=$false
    # getter不應在ordinary欄位檢查之前執行。
    $value | Add-Member -MemberType ScriptProperty -Name code -Value { $script:invalidUtf16GetterRead=$true;return 'host_text_invalid' }
    $rejected=$false;try { Assert-InvalidUtf16Sample $value } catch { $rejected=$true }
    if (-not $rejected -or $script:invalidUtf16GetterRead) { throw 'getter' }
    $value=[Management.Automation.ErrorRecord]::new([InvalidOperationException]::new('Public metadata'),'Public',[Management.Automation.ErrorCategory]::NotSpecified,$null)
    $rejected=$false;try { Assert-InvalidUtf16Sample $value } catch { $rejected=$true }
    if (-not $rejected) { throw 'record' }
    for ($bits=0;$bits -lt 16;$bits++) {
        $invalid=($bits -band 8) -ne 0;$allow=($bits -band 4) -ne 0;$self=($bits -band 2) -ne 0;$isChild=($bits -band 1) -ne 0
        # 獨立手寫三組合法mode，不借受測函數算期望值。
        $want=$bits -in @(2,12,13)
        if ((Test-InvalidUtf16Mode $invalid $allow $self $isChild) -ne $want) { throw 'mode' }
    }
    foreach ($stage in @('publish','reader','native_close')) {
        if ((Read-InvalidUtf16FailureStage ([pscustomobject]@{kind='failed';stage=$stage})) -cne ('child_'+$stage)) { throw 'stage' }
    }
    $rejected=$false;try { [void](Read-InvalidUtf16FailureStage ([pscustomobject]@{kind='failed';stage='Public unknown stage'})) } catch { $rejected=$true }
    if (-not $rejected) { throw 'unknown_stage' }
    foreach ($kind in @('valid','oversize','utf8')) {
        $bytes=[Text.Encoding]::UTF8.GetBytes('{"kind":"ready"}'+"`n")
        if ($kind -eq 'oversize') { $bytes=New-Object byte[] 8193;for ($i=0;$i -lt 8192;$i++) { $bytes[$i]=65 };$bytes[8192]=10 }
        if ($kind -eq 'utf8') { $bytes=[byte[]]@(255,10) }
        $stream=[IO.MemoryStream]::new($bytes);$rejected=$false
        try {
            try { $frame=Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000 } catch { $rejected=$true }
            if ($kind -eq 'valid') { if ($rejected -or $frame -cne '{"kind":"ready"}') { throw 'stream' } }
            elseif (-not $rejected) { throw 'stream_reject' }
        } finally { $stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length) }
    }
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
    if (-not (Test-InvalidUtf16Mode ([bool]$InvalidUtf16) ([bool]$AllowClipboardOverwrite) ([bool]$DiagnosticSelfTest) ([bool]$Child)) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) {
        if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' }
    }
    Assert-InvalidUtf16Source $PSScriptRoot $true;Assert-InvalidUtf16Source $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $core=Join-Path $PSScriptRoot 'windows-clipboard-invalid-utf16-core.cs'
    $writer=Join-Path $PSScriptRoot 'windows-clipboard-invalid-utf16-fixture.cs'
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$reader,$core,$writer)) { Assert-InvalidUtf16Source $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-InvalidUtf16Schema
        [Console]::WriteLine('host_clipboard_invalid_utf16_schema_observed,liveClipboardQueries=false,clipboardWritten=false');exit 0
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
        $phase='writer_setup';$fixture=[HostClipboardInvalidUtf16Windows]::StartWindows()
        if (-not $fixture.Ready) { throw 'guard' }
        $phase='ready_write';Write-InvalidUtf16Frame @{kind='ready'}
        $phase='sample_command';if ([Console]::In.ReadLine() -cne 'sample') { throw 'guard' }
        $value=$null
        try {
            # scope／listener通過後才觸唯一發布，不能拿先前ready快照替代。
            $phase='scope_before';[void](Get-HostEditorPattern $editor)
            $phase='listener';if (-not $native.Ready -or $native.Overflow) { throw 'guard' }
            $phase='publish';$publication=$fixture.Publish()
            $ownerBefore=$false;$ownerAfter=$false
            if ($publication.Published -and $publication.FixtureVerified -and $publication.WriterOpenClosed -and $publication.Code -ceq 'host_observed') {
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
            foreach ($notice in $native.Drain()) { }
            $phase='classify'
            $row=[HostClipboardInvalidUtf16Calibration]::Classify($publication,$value,$true,($ownerBefore -and $ownerAfter),$native.Overflow)
            $sample=@{kind='sample';scopeVerified=$row.ScopeVerified;producerPublished=$row.ProducerPublished;fixtureVerified=$row.FixtureVerified;ownerVersionMatched=$row.OwnerVersionMatched;readerRejected=$row.ReaderRejected;textReturned=$row.TextReturned;readResourcesClosed=$row.ReadResourcesClosed;overflow=$row.Overflow;code=$row.Code}
        } finally { if ($null -ne $value) { $value.Text=$null };$value=$null }
        Write-InvalidUtf16Frame $sample
        $phase='stop_command';if ([Console]::In.ReadLine() -cne 'stop') { throw 'guard' }
        $phase='native_close';$writerClosed=$false;$listenerClosed=$false
        # 兩個Stop皆嘗試，第一個false不可短路漏另一項。
        try { $writerClosed=$fixture.Stop() } catch {} finally { $fixture=$null }
        try { $listenerClosed=$native.Stop() } catch {}
        foreach ($notice in $native.Drain()) { }
        $overflow=$native.Overflow;$native=$null
        $closed=$writerClosed -and $listenerClosed
        $phase='closed_write';Write-InvalidUtf16Frame @{kind='closed';writerResourcesClosed=$writerClosed;listenerResourcesClosed=$listenerClosed;overflow=$overflow;resourcesClosed=$closed}
        if (-not $closed) { exit 2 };exit 0
    }
    $phase='startup';$info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -InvalidUtf16 -AllowClipboardOverwrite -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-InvalidUtf16FailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'ready' -or $owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $query=[Diagnostics.Stopwatch]::StartNew()
    # 寫入可能部分抵達，缺可信回覆不能宣稱clipboard沒改變。
    $phase='query_write';$changeState='unknown';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply';$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_schema';$sample=$reply | ConvertFrom-Json;$reply=$null
    if ($sample.kind -ceq 'failed') { $phase=Read-InvalidUtf16FailureStage $sample;throw 'guard' }
    Assert-InvalidUtf16Sample $sample
    if ($sample.producerPublished) { $changeState='published' }
    if ($query.ElapsedMilliseconds -ge 1000) { throw 'guard' }
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-InvalidUtf16FailureStage $frame;throw 'guard' }
    Assert-InvalidUtf16Closed $frame
    $observed=Test-InvalidUtf16Observed $sample $frame
    $cleanup=Stop-HostOwnedProcess $owned $frame.resourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $phase='result';$marker='host_clipboard_invalid_utf16_unavailable';if ($observed) { $marker='host_clipboard_invalid_utf16_observed' }
    $overflow=$sample.overflow -or $frame.overflow
    $code=$sample.code;if ($overflow) { $code='host_observation_overflow' }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=InvalidUtf16,scopeVerified={1},producerPublished={2},fixtureVerified={3},ownerVersionMatched={4},readerRejected={5},textReturned={6},readResourcesClosed={7},writerResourcesClosed={8},listenerResourcesClosed={9},overflow={10},resourcesClosed=True,processExited=True,code={11}',$marker,$sample.scopeVerified,$sample.producerPublished,$sample.fixtureVerified,$sample.ownerVersionMatched,($sample.readerRejected -and -not $overflow),$sample.textReturned,$sample.readResourcesClosed,$frame.writerResourcesClosed,$frame.listenerResourcesClosed,$overflow,$code))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_clipboard_invalid_utf16_schema_unavailable,stage='+$phase) }
    elseif ($Child) {
        try { Write-InvalidUtf16Frame @{kind='failed';stage=$phase} } catch {}
    } else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_clipboard_invalid_utf16_unavailable,case=InvalidUtf16,stage='+$phase+',clipboardChangeState='+$changeState+',processExited='+$exited)
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
