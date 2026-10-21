param([switch]$ReadRace,[switch]$AllowClipboardOverwrite,[switch]$DiagnosticSelfTest,[switch]$Child,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# 獨立讀取途中race（delayed rendering）校準候選；只有雙opt-in的唯一sample才可清除／覆寫clipboard，正式reader不變。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$native=$null;$fixture=$null;$shutdown=$null;$cleanup=$null;$phase='policy'
$changeState='not_requested'

# mode錯配與schema都不得建立child或讀寫剪貼簿。
function Test-ReadRaceMode([bool]$ReadRace,[bool]$Allow,[bool]$Self,[bool]$IsChild) {
    if ($Self) { return (-not $ReadRace -and -not $Allow -and -not $IsChild) }
    return ($ReadRace -and $Allow)
}

# 載入模組前只驗private來源，拒絕UNC／network／reparse，不修ACL。
function Assert-ReadRaceSource([string]$Path,[bool]$Directory) {
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
# 固定ordinary欄位先驗，race證據不能單獨補足來源／正常收尾。
function Assert-ReadRaceSample($Value) {
    Assert-HostFields $Value @('kind','scopeVerified','registrationVerified','renderVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow','code')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.code -isnot [string]) { throw 'guard' }
    foreach ($name in @('scopeVerified','registrationVerified','renderVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    $codes=@('host_observed','host_capability_unavailable','host_cleanup_unavailable','host_scope_changed','host_observation_overflow','host_clipboard_unstable','host_text_too_large','host_clipboard_busy','host_clipboard_format_unavailable','host_text_invalid','host_text_unreadable')
    if ($codes -cnotcontains $Value.code) { throw 'guard' }
    if ($Value.renderVerified -and -not $Value.registrationVerified) { throw 'guard' }
    if ($Value.ownerVersionMatched -and -not $Value.registrationVerified) { throw 'guard' }
    if ($Value.readerRejected -and (-not $Value.scopeVerified -or -not $Value.registrationVerified -or -not $Value.renderVerified -or -not $Value.ownerVersionMatched -or $Value.textReturned -or -not $Value.readResourcesClosed -or $Value.overflow -or $Value.code -cne 'host_clipboard_unstable')) { throw 'guard' }
}
# 各native正常清理與總資源合取一致，thread退出本身不等於成功。
function Assert-ReadRaceClosed($Value) {
    Assert-HostFields $Value @('kind','fixtureResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'closed') { throw 'guard' }
    foreach ($name in @('fixtureResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed')) {
        if ($Value.$name -isnot [bool]) { throw 'guard' }
    }
    if ($Value.resourcesClosed -ne ($Value.fixtureResourcesClosed -and $Value.listenerResourcesClosed)) { throw 'guard' }
}
# 保留late overflow／cleanup失敗，不只看code或空Text。
function Test-ReadRaceObserved($Sample,$Closed) {
    Assert-ReadRaceSample $Sample;Assert-ReadRaceClosed $Closed
    if ($Sample.overflow -and -not $Closed.overflow) { throw 'guard' }
    return ($Sample.readerRejected -and $Sample.scopeVerified -and $Sample.registrationVerified -and $Sample.renderVerified -and $Sample.ownerVersionMatched -and -not $Sample.textReturned -and $Sample.readResourcesClosed -and -not $Sample.overflow -and -not $Closed.overflow -and $Closed.resourcesClosed -and $Sample.code -ceq 'host_clipboard_unstable')
}
# child stage只接受白名單，未知frame不反射原字串。
function Read-ReadRaceFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','register','scope_before','reader','scope_after','classify','stop_command','native_close','closed_write')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}
# 只輸出自行建立的有界metadata frame，native value永不序列化。
function Write-ReadRaceFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}
# 資料型oracle先寫，不能靠受測builder生成期望值。
function Test-ReadRaceSchema {
    $sampleLiteral='{"kind":"sample","scopeVerified":true,"registrationVerified":true,"renderVerified":true,"ownerVersionMatched":true,"readerRejected":true,"textReturned":false,"readResourcesClosed":true,"overflow":false,"code":"host_clipboard_unstable"}'
    $closedLiteral='{"kind":"closed","fixtureResourcesClosed":true,"listenerResourcesClosed":true,"overflow":false,"resourcesClosed":true}'
    $sample=$sampleLiteral | ConvertFrom-Json;$closed=$closedLiteral | ConvertFrom-Json
    if (-not (Test-ReadRaceObserved $sample $closed)) { throw 'literal' }
    foreach ($mutation in @('scopeVerified','registrationVerified','renderVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow','code','extra','missing','bool_type')) {
        $value=$sampleLiteral | ConvertFrom-Json
        switch ($mutation) {
            'code' { $value.code='Public unknown code' }
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'missing' { $value.PSObject.Properties.Remove('renderVerified') }
            'bool_type' { $value.readerRejected='True' }
            default { $value.$mutation=-not $value.$mutation }
        }
        $observed=$false
        try { $observed=Test-ReadRaceObserved $value $closed } catch {}
        if ($observed) { throw 'sample_mutation' }
    }
    foreach ($mutation in @('fixture','listener','inconsistent','overflow','extra','bool_type')) {
        $value=$closedLiteral | ConvertFrom-Json
        switch ($mutation) {
            'fixture' { $value.fixtureResourcesClosed=$value.resourcesClosed=$false }
            'listener' { $value.listenerResourcesClosed=$value.resourcesClosed=$false }
            'inconsistent' { $value.resourcesClosed=$false }
            'overflow' { $value.overflow=$true }
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'bool_type' { $value.resourcesClosed='True' }
        }
        $observed=$false;try { $observed=Test-ReadRaceObserved $sample $value } catch {}
        if ($observed) { throw 'closed_mutation' }
    }
    foreach ($code in @('host_observed','host_clipboard_busy','host_clipboard_format_unavailable','host_clipboard_unstable','host_text_too_large','host_text_unreadable','host_cleanup_unavailable','host_capability_unavailable','host_scope_changed','host_observation_overflow')) {
        $value=$sampleLiteral | ConvertFrom-Json;$value.readerRejected=$false;$value.code=$code
        Assert-ReadRaceSample $value
        if (Test-ReadRaceObserved $value $closed) { throw 'wrong_code' }
    }
    # sample與closed的overflow合併保留，不能被較晚false沖掉。
    $value=$sampleLiteral | ConvertFrom-Json;$value.readerRejected=$false;$value.overflow=$true
    $rejected=$false;try { [void](Test-ReadRaceObserved $value $closed) } catch { $rejected=$true }
    if (-not $rejected) { throw 'overflow_sticky' }
    # ownerVersionMatched與renderVerified都必須有registration來源。
    $value=$sampleLiteral | ConvertFrom-Json;$value.readerRejected=$false;$value.renderVerified=$false;$value.ownerVersionMatched=$true;$value.registrationVerified=$false
    $rejected=$false;try { Assert-ReadRaceSample $value } catch { $rejected=$true }
    if (-not $rejected) { throw 'owner_requires_registration' }
    $value=$sampleLiteral | ConvertFrom-Json;$value.readerRejected=$false;$value.ownerVersionMatched=$false;$value.renderVerified=$true;$value.registrationVerified=$false
    $rejected=$false;try { Assert-ReadRaceSample $value } catch { $rejected=$true }
    if (-not $rejected) { throw 'render_requires_registration' }
    # readerRejected=True不得缺render或改用其他reader code。
    $value=$sampleLiteral | ConvertFrom-Json;$value.renderVerified=$false
    $rejected=$false;try { Assert-ReadRaceSample $value } catch { $rejected=$true }
    if (-not $rejected) { throw 'reader_requires_render' }
    $value=$sampleLiteral | ConvertFrom-Json;$value.code='host_observed'
    $rejected=$false;try { Assert-ReadRaceSample $value } catch { $rejected=$true }
    if (-not $rejected) { throw 'reader_code_contradiction' }
    $value=$sampleLiteral | ConvertFrom-Json;$value.PSObject.Properties.Remove('code');$script:readRaceGetterRead=$false
    # getter不應在ordinary欄位檢查之前執行。
    $value | Add-Member -MemberType ScriptProperty -Name code -Value { $script:readRaceGetterRead=$true;return 'host_clipboard_unstable' }
    $rejected=$false;try { Assert-ReadRaceSample $value } catch { $rejected=$true }
    if (-not $rejected -or $script:readRaceGetterRead) { throw 'getter' }
    $value=[Management.Automation.ErrorRecord]::new([InvalidOperationException]::new('Public metadata'),'Public',[Management.Automation.ErrorCategory]::NotSpecified,$null)
    $rejected=$false;try { Assert-ReadRaceSample $value } catch { $rejected=$true }
    if (-not $rejected) { throw 'record' }
    for ($bits=0;$bits -lt 16;$bits++) {
        $readRace=($bits -band 8) -ne 0;$allow=($bits -band 4) -ne 0;$self=($bits -band 2) -ne 0;$isChild=($bits -band 1) -ne 0
        # 獨立手寫三組合法mode，不借受測函數算期望值。
        $want=$bits -in @(2,12,13)
        if ((Test-ReadRaceMode $readRace $allow $self $isChild) -ne $want) { throw 'mode' }
    }
    foreach ($stage in @('register','reader','native_close')) {
        if ((Read-ReadRaceFailureStage ([pscustomobject]@{kind='failed';stage=$stage})) -cne ('child_'+$stage)) { throw 'stage' }
    }
    $rejected=$false;try { [void](Read-ReadRaceFailureStage ([pscustomobject]@{kind='failed';stage='Public unknown stage'})) } catch { $rejected=$true }
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
    if (-not (Test-ReadRaceMode ([bool]$ReadRace) ([bool]$AllowClipboardOverwrite) ([bool]$DiagnosticSelfTest) ([bool]$Child)) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) { throw 'guard' }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) {
        if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' }
    }
    Assert-ReadRaceSource $PSScriptRoot $true;Assert-ReadRaceSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $coreSource=Join-Path $PSScriptRoot 'windows-clipboard-read-race-core.cs'
    $fixtureSource=Join-Path $PSScriptRoot 'windows-clipboard-read-race-fixture.cs'
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$reader,$coreSource,$fixtureSource)) { Assert-ReadRaceSource $path $false }
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-ReadRaceSchema
        [Console]::WriteLine('host_clipboard_read_race_schema_observed,liveClipboardQueries=false,clipboardWritten=false');exit 0
    }
    if ($Child) {
        $phase='compile';Add-Type -LiteralPath @($nativeSource,$geometry,$editorCore,$coreSource,$fixtureSource) -ErrorAction Stop
        Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
        $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
        try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
        . $reader
        $editor=@{x=$X;y=$Y;width=$Width;height=$Height};$script:editorIdentity=$null;$script:editorTextCalls=0
        $phase='bind_scope';[void](Get-HostEditorPattern $editor)
        $phase='listener';$native=[HostObserverNative]::new()
        if (-not $native.Ready) { throw 'guard' }
        $phase='fixture_setup';$fixture=[HostClipboardReadRaceWindows]::StartWindows()
        if (-not $fixture.Ready) { throw 'guard' }
        $phase='ready_write';Write-ReadRaceFrame @{kind='ready'}
        $phase='sample_command';if ([Console]::In.ReadLine() -cne 'sample') { throw 'guard' }
        $value=$null
        try {
            # scope／listener通過後才觸唯一註冊，不能拿先前ready快照替代。
            $phase='scope_before';[void](Get-HostEditorPattern $editor)
            $phase='listener';if (-not $native.Ready -or $native.Overflow) { throw 'guard' }
            $phase='register';$registration=$fixture.Register()
            $ownerBefore=$false;$ownerAfter=$false
            if ($registration.Registered -and $registration.OpenClosed -and $registration.RegistrationVersion -ne 0 -and $registration.Code -ceq 'host_observed') {
                $phase='scope_before';[void](Get-HostEditorPattern $editor)
                $ownerBefore=$fixture.OwnsClipboard()
                if ($ownerBefore -and -not $native.Overflow) {
                    $phase='reader';$value=$native.ReadClipboard($registration.RegistrationVersion,$script:editorPid)
                    $phase='scope_after';[void](Get-HostEditorPattern $editor)
                    $ownerAfter=$fixture.OwnsClipboard()
                } else { $ownerBefore=$false }
            }
            foreach ($notice in $native.Drain()) { }
            $phase='classify'
            $render=$fixture.RenderEvidence()
            $row=[HostClipboardReadRaceCalibration]::Classify($registration,$render,$value,$true,($ownerBefore -and $ownerAfter),$native.Overflow)
            $sample=@{kind='sample';scopeVerified=$row.ScopeVerified;registrationVerified=$row.RegistrationVerified;renderVerified=$row.RenderVerified;ownerVersionMatched=$row.OwnerVersionMatched;readerRejected=$row.ReaderRejected;textReturned=$row.TextReturned;readResourcesClosed=$row.ReadResourcesClosed;overflow=$row.Overflow;code=$row.Code}
        } finally { if ($null -ne $value) { $value.Text=$null };$value=$null }
        Write-ReadRaceFrame $sample
        $phase='stop_command';if ([Console]::In.ReadLine() -cne 'stop') { throw 'guard' }
        $phase='native_close';$fixtureClosed=$false;$listenerClosed=$false
        # 兩個Stop皆嘗試，第一個false不可短路漏另一項。
        try { $fixtureClosed=$fixture.Stop() } catch {} finally { $fixture=$null }
        try { $listenerClosed=$native.Stop() } catch {}
        foreach ($notice in $native.Drain()) { }
        $overflow=$native.Overflow;$native=$null
        $closed=$fixtureClosed -and $listenerClosed
        $phase='closed_write';Write-ReadRaceFrame @{kind='closed';fixtureResourcesClosed=$fixtureClosed;listenerResourcesClosed=$listenerClosed;overflow=$overflow;resourcesClosed=$closed}
        if (-not $closed) { exit 2 };exit 0
    }
    $phase='startup';$info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -ReadRace -AllowClipboardOverwrite -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-ReadRaceFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'ready' -or $owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'guard' }
    $query=[Diagnostics.Stopwatch]::StartNew()
    # 寫入可能部分抵達，缺可信回覆不能宣稱clipboard沒改變。
    $phase='query_write';$changeState='unknown';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply';$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_schema';$sample=$reply | ConvertFrom-Json;$reply=$null
    if ($sample.kind -ceq 'failed') { $phase=Read-ReadRaceFailureStage $sample;throw 'guard' }
    Assert-ReadRaceSample $sample
    if ($sample.registrationVerified) { $changeState='published' }
    if ($query.ElapsedMilliseconds -ge 1000) { throw 'guard' }
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') { $phase=Read-ReadRaceFailureStage $frame;throw 'guard' }
    Assert-ReadRaceClosed $frame
    $observed=Test-ReadRaceObserved $sample $frame
    $cleanup=Stop-HostOwnedProcess $owned $frame.resourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    $phase='result';$marker='host_clipboard_read_race_unavailable';if ($observed) { $marker='host_clipboard_read_race_observed' }
    $overflow=$sample.overflow -or $frame.overflow
    $code=$sample.code;if ($overflow) { $code='host_observation_overflow' }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0},case=ReadRace,scopeVerified={1},registrationVerified={2},renderVerified={3},ownerVersionMatched={4},readerRejected={5},textReturned={6},readResourcesClosed={7},fixtureResourcesClosed={8},listenerResourcesClosed={9},overflow={10},resourcesClosed=True,processExited=True,code={11}',$marker,$sample.scopeVerified,$sample.registrationVerified,$sample.renderVerified,$sample.ownerVersionMatched,($sample.readerRejected -and -not $overflow),$sample.textReturned,$sample.readResourcesClosed,$frame.fixtureResourcesClosed,$frame.listenerResourcesClosed,$overflow,$code))
    if (-not $observed) { exit 2 }
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_clipboard_read_race_schema_unavailable,stage='+$phase) }
    elseif ($Child) {
        try { Write-ReadRaceFrame @{kind='failed';stage=$phase} } catch {}
    } else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) { $exited=$cleanup.ProcessExited.ToString() }
        # parent只輸出白名單stage，未知僅unknown，不反射任意字串。
        $stage='unknown'
        if (@('policy','flags','source','startup','query_write','query_reply','query_schema','close','result') -ccontains $phase) { $stage=$phase }
        foreach ($childStage in @('policy','flags','source','compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','register','scope_before','reader','scope_after','classify','stop_command','native_close','closed_write')) {
            if ($phase -ceq ('child_'+$childStage)) { $stage=$phase }
        }
        [Console]::WriteLine('host_clipboard_read_race_unavailable,case=ReadRace,stage='+$stage+',clipboardChangeState='+$changeState+',processExited='+$exited)
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
