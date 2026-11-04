param([Parameter(Mandatory=$true)][string]$Manifest,
      [Parameter(Mandatory=$true)][string]$Request,
      [Parameter(Mandatory=$true)][string]$Directory,
      [switch]$Child)
# 僅同使用者公開fixture唯讀；不改policy／焦點／鍵鼠／clipboard，不建立網路服務。
$ErrorActionPreference = 'Stop'
$VerbosePreference = $DebugPreference = $WarningPreference = $InformationPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object Text.UTF8Encoding -ArgumentList $false, $true
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
try { $sid=$identity.User } finally { $identity.Dispose() }
$native = $null
$owned = $null
$code = 'host_capability_unavailable'

# 只驗同owner且無其他允許規則，拒絕reparse及未知祖先；不修改既有ACL。
function Assert-PrivatePath([string]$Path, [bool]$IsDirectory) {
    if (Get-Command Assert-HostPrivatePath -CommandType Function -ErrorAction SilentlyContinue) {
        Assert-HostPrivatePath $Path $IsDirectory $sid
        return
    }
    # 載入supervisor前也先拒絕network／非NTFS，不從遠端路徑讀入程式。
    $root=[IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path))
    if ($root.StartsWith('\\',[StringComparison]::Ordinal)) { throw 'guard' }
    $drive=New-Object IO.DriveInfo -ArgumentList $root
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') { throw 'guard' }
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.PSIsContainer -ne $IsDirectory) { throw 'guard' }
    $acl = Get-Acl -LiteralPath $Path
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $sid) { throw 'guard' }
    if ($IsDirectory -and -not $acl.AreAccessRulesProtected) { throw 'guard' }
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference -ne $sid) { throw 'guard' }
    }
    $parent = $item.Directory
    if ($IsDirectory) { $parent = $item.Parent }
    for (; $null -ne $parent; $parent = $parent.Parent) {
        if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'guard' }
    }
}
# 預配置8193bytes、strict UTF8且close；不是無界Get-Content之後才驗。
function Read-PublicJson([string]$Path) {
    Assert-PrivatePath $Path $false
    $stream = New-Object IO.FileStream -ArgumentList $Path, ([IO.FileMode]::Open), ([IO.FileAccess]::Read), ([IO.FileShare]::Read)
    $bytes = New-Object byte[] 8193
    try {
        if ($stream.Length -gt 8192) { throw 'guard' }
        $offset = 0
        while ($offset -lt $stream.Length) { $count = $stream.Read($bytes,$offset,$bytes.Length-$offset); if ($count -le 0) { throw 'guard' }; $offset += $count }
        return ($utf8.GetString($bytes,0,$offset) | ConvertFrom-Json -ErrorAction Stop)
    } finally { [Array]::Clear($bytes,0,$bytes.Length); $stream.Dispose() }
}
# 固定JSON欄位，不接受runtime／payload或其他metadata。
function Assert-Fields($Value, [string[]]$Names) {
    $keys = @($Value.PSObject.Properties.Name)
    if ($keys.Count -ne $Names.Count) { throw 'guard' }
    foreach ($key in $keys) { if ($Names -cnotcontains $key) { throw 'guard' } }
}
# UTC只用於期限／展示，不用來硬排序Main與host。
function Parse-Utc([string]$Value) {
    return [DateTime]::ParseExact($Value,'yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture,([Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal))
}
# 每份輸出都CreateNew，繼承已驗owner-only目錄，不覆寫／不輸出原值。
function Write-PrivateJson([string]$Name, $Value, [int]$Limit=8192) {
    Assert-PrivatePath $Directory $true
    $bytes = $utf8.GetBytes(($Value | ConvertTo-Json -Depth 8 -Compress) + "`n")
    $stream = $null
    try { if ($bytes.Length -gt $Limit) { throw 'guard' }; $stream = New-Object IO.FileStream -ArgumentList (Join-Path $Directory $Name),([IO.FileMode]::CreateNew),([IO.FileAccess]::Write),([IO.FileShare]::None); $stream.Write($bytes,0,$bytes.Length) }
    finally { if ($null -ne $stream) { $stream.Dispose() }; [Array]::Clear($bytes,0,$bytes.Length) }
}
# child只送固定frame；無任何原文／hash／native exception。
function Write-Frame($Value) { $line = $Value | ConvertTo-Json -Depth 6 -Compress; if ($utf8.GetByteCount($line) -gt 8191) { throw 'guard' }; [Console]::Out.WriteLine($line); [Console]::Out.Flush() }
# 原生文字只留child RAM；UIA僅從授權point讀同一Notepad／user／session。
function Read-Editor {
    return (Read-HostEditorText $m.editor)
}
# 一次query前後讀UIA，busy／supersede不重試；不能用兩個false代替RAM比較。
function Measure-Snapshot([string]$Kind, $Notice) {
    $start = $native.Microseconds()
    $row = [ordered]@{ordinal=1;kind=$Kind;tStartUs=$start;tEndUs=$start;clipboardOrdinal=$null;notificationUs=$null;scopeVerified=$false;editorReadable=$false;editorExact=$false;editorStable=$false;clipboardReadable=$false;clipboardExact=$false;clipboardStable=$false;clipboardOwnerMatchesEditor=$null;clipboardMatchesEditor=$null;code='host_observed'}
    $before = $after = $null; $clip = $null
    if ($null -ne $Notice) { $row.clipboardOrdinal=$Notice.Ordinal; $row.notificationUs=$Notice.Us }
    try {
        $before = Read-Editor; $row.scopeVerified=$true; $row.editorReadable=$true
        if ($null -ne $Notice) {
            $clip=$native.ReadClipboard($Notice.Version,$script:editorPid)
            $row.clipboardReadable=$null -ne $clip.Text; $row.clipboardStable=$clip.Stable; $row.clipboardOwnerMatchesEditor=$clip.OwnerMatches; $row.code=$clip.Code
        }
        $after=Read-Editor
        if ($null -ne $clip -and $clip.Stable -and -not [HostObserverNative]::SameClipboardVersion($Notice.Version,$clip.Version,[HostObserverNative]::GetClipboardSequenceNumber())) {
            $clip.Stable=$false; $clip.Text=$null; $row.clipboardReadable=$false; $row.clipboardStable=$false; $row.code='host_clipboard_unstable'
        }
        $clipText=$null; if ($null -ne $clip) { $clipText=$clip.Text }
        $comparison=[HostObserverNative]::CompareText($before,$after,$clipText,$m.expected,$row.scopeVerified,$row.clipboardStable)
        $row.editorStable=$comparison.EditorStable; $row.editorExact=$comparison.EditorExact; $row.clipboardExact=$comparison.ClipboardExact; $row.clipboardMatchesEditor=$comparison.ClipboardMatchesEditor
        $clipText=$null
        $state=@($row.scopeVerified,$row.editorReadable,$row.editorExact,$row.editorStable,$row.clipboardReadable,$row.clipboardExact,$row.clipboardStable,$row.clipboardOwnerMatchesEditor,$row.clipboardMatchesEditor,$row.code) -join ':'
        $changed=$Kind -ne 'editor' -or -not [string]::Equals($after,$script:previousEditor,[StringComparison]::Ordinal) -or $state -cne $script:previousState
        $script:previousEditor=$after
        $script:previousState=$state
    } catch {
        $row.code='host_scope_changed'
        if ($_.Exception.Message -ceq 'text') { $row.code='host_text_invalid' }
        $row.scopeVerified=$false; $row.editorExact=$false; $row.clipboardExact=$false; $row.clipboardMatchesEditor=$null; $changed=$true
    }
    finally { if ($null -ne $clip) { $clip.Text=$null }; $before=$after=$null; $row.tEndUs=$native.Microseconds() }
    return @{row=$row;changed=$changed}
}
try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { $code='host_policy_unavailable'; throw 'guard' }
    foreach ($path in @($Manifest,$Request,$Directory,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    $Directory=[IO.Path]::GetFullPath($Directory); Assert-PrivatePath $Directory $true; Assert-PrivatePath $PSScriptRoot $true
    Assert-PrivatePath $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'; Assert-PrivatePath $supervisor $false
    . $supervisor
    $m=Read-PublicJson $Manifest; $r=Read-PublicJson $Request
    Assert-Fields $m @('schemaVersion','runId','expected','editor','createdUtc','expiresUtc'); Assert-Fields $r @('schemaVersion','runId','requestId','createdUtc'); Assert-Fields $m.editor @('x','y','width','height')
    $guid='\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z'
    if ($m.schemaVersion -ne 1 -or $r.schemaVersion -ne 1 -or $m.runId -cnotmatch $guid -or $r.requestId -cnotmatch $guid -or $r.runId -cne $m.runId -or $m.expected -isnot [string] -or $m.expected -cnotmatch '\APublic \u4e2d\u6587 RdWeb ' -or $m.expected.IndexOf([char]0) -ge 0 -or $utf8.GetByteCount($m.expected) -gt 4096) { throw 'guard' }
    $created=Parse-Utc $m.createdUtc; $expires=Parse-Utc $m.expiresUtc; $requested=Parse-Utc $r.createdUtc
    if (($expires-$created).TotalMilliseconds -ne 1800000 -or [DateTime]::UtcNow -lt $created -or [DateTime]::UtcNow -ge $expires -or $requested -lt $created -or $requested -ge $expires) { throw 'guard' }
    foreach ($n in @($m.editor.x,$m.editor.y,$m.editor.width,$m.editor.height)) { if ($n -isnot [int] -and $n -isnot [long]) { throw 'guard' }; if ($n -lt 0 -or $n -gt 4096) { throw 'guard' } }
    if ($m.editor.width -lt 21 -or $m.editor.height -lt 31 -or ($m.editor.x+$m.editor.width) -gt 4096 -or ($m.editor.y+$m.editor.height) -gt 4096) { throw 'guard' }
    $source=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'; Assert-PrivatePath $source $false
    $editorSource=Join-Path $PSScriptRoot 'windows-host-editor.ps1'; Assert-PrivatePath $editorSource $false
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'; Assert-PrivatePath $editorCore $false
    $geometrySource=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'; Assert-PrivatePath $geometrySource $false
    . $editorSource
    if ($Child) {
        # C# compile與所有UIA／listener初始呼叫都由parent的單一5秒startup監督。
        Add-Type -LiteralPath @($source,$editorCore,$geometrySource) -ErrorAction Stop
        [HostEditorGeometry]::InitializeChildCoordinates()
        $currentProcess=[Diagnostics.Process]::GetCurrentProcess(); $script:sessionId=$currentProcess.SessionId; $currentProcess.Dispose()
        Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $script:editorIdentity=$null; $script:editorTextCalls=0; $script:previousEditor=$null; $script:previousState=$null; $pending=New-Object 'Collections.Generic.Queue[HostClipboardNotice]'
        $started=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture); $native=New-Object HostObserverNative
        if (-not $native.Ready) { throw 'guard' }
        $first=Measure-Snapshot 'baseline' $null
        if (-not $first.row.scopeVerified -or -not $first.row.editorReadable) { throw 'guard' }
        Write-Frame @{kind='ready';utc=$started;frequency=[Diagnostics.Stopwatch]::Frequency;row=$first.row}
        $attempts=1; $notifications=0
        while ($native.Microseconds() -lt 120000000) {
            $line=[Console]::In.ReadLine(); if ($null -eq $line -or $line -ceq 'stop') { break }; if ($line -cne 'sample') { throw 'guard' }
            foreach ($notice in $native.Drain()) { $pending.Enqueue($notice); $notifications=[Math]::Max($notifications,$notice.Ordinal) }
            if ($native.Overflow -or $attempts -ge 1200) { Write-Frame @{kind='limit';clipboardNotifications=$notifications;sampleAttempts=$attempts}; break }
            $notice=$null; $kind='editor'; if ($pending.Count -gt 0) { $notice=$pending.Dequeue(); $kind='clipboard' }
            $sample=Measure-Snapshot $kind $notice; $attempts++
            Write-Frame @{kind='sample';row=$sample.row;changed=$sample.changed;sampleAttempts=$attempts;clipboardNotifications=$notifications}
            if (-not $sample.row.scopeVerified) { break }
        }
        $closed=$native.Stop(); $native=$null; Write-Frame @{kind='closed';resourcesClosed=$closed}; exit 0
    }
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments='-NoProfile -STA -File "'+$PSCommandPath+'" -Manifest "'+$Manifest+'" -Request "'+$Request+'" -Directory "'+$Directory+'" -Child'
    $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $first=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    Assert-HostFields $first @('kind','utc','frequency','row')
    if ($first.kind -isnot [string] -or $first.kind -cne 'ready' -or $first.utc -isnot [string]) { throw 'guard' }
    [void](Parse-Utc $first.utc)
    Assert-HostInteger $first.frequency 1 1000000000
    $firstRow=Assert-HostRow $first.row 0 0 0
    if ($firstRow.kind -cne 'baseline' -or -not $firstRow.scopeVerified -or -not $firstRow.editorReadable) { throw 'guard' }
    if ($owned.Startup.ElapsedMilliseconds -ge 5000) { throw 'host_query_timeout' }
    $ready=[ordered]@{schemaVersion=1;runId=$m.runId;requestId=$r.requestId;utc=$first.utc;policyAccepted=$true;scopeVerified=$true;observerReady=$true;clockDomain='windows_host';frequency=$first.frequency;origin=0}
    Write-PrivateJson 'ready.json' $ready
    $rows=New-Object 'Collections.Generic.List[object]'; $rows.Add($firstRow)
    $clock=[Diagnostics.Stopwatch]::StartNew(); $offset=[long]$firstRow.tEndUs; $previousEnd=$offset; $lastNotification=0
    $attempts=1; $notifications=0; $overflow=$false; $unavailable=$false; $closed=$false; $code='host_observed'
    $autoClosing=$false
    $shutdown=$null
    try {
        while (($clock.ElapsedMilliseconds*1000+$offset) -lt 119000000) {
            $query=[Diagnostics.Stopwatch]::StartNew()
            Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
            $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000) | ConvertFrom-Json
            if ($frame.kind -isnot [string]) { throw 'guard' }
            if ($frame.kind -ceq 'limit') {
                Assert-HostFields $frame @('kind','clipboardNotifications','sampleAttempts')
                Assert-HostInteger $frame.clipboardNotifications $notifications 64
                Assert-HostInteger $frame.sampleAttempts $attempts 1200
                $notifications=$frame.clipboardNotifications; $attempts=$frame.sampleAttempts; $overflow=$unavailable=$true; $autoClosing=$true; $code='host_observation_overflow'; break
            }
            if ($frame.kind -ceq 'closed') {
                Assert-HostFields $frame @('kind','resourcesClosed'); if ($frame.resourcesClosed -isnot [bool]) { throw 'guard' }
                $closed=$frame.resourcesClosed; break
            }
            Assert-HostFields $frame @('kind','row','changed','sampleAttempts','clipboardNotifications')
            if ($frame.kind -cne 'sample' -or $frame.changed -isnot [bool]) { throw 'guard' }
            Assert-HostInteger $frame.sampleAttempts ($attempts+1) ($attempts+1)
            if ($frame.sampleAttempts -gt 1200) { throw 'guard' }
            Assert-HostInteger $frame.clipboardNotifications $notifications 64
            $row=Assert-HostRow $frame.row $previousEnd $lastNotification $frame.clipboardNotifications
            if ($row.kind -cne 'editor' -and $row.kind -cne 'clipboard') { throw 'guard' }
            $previousEnd=$row.tEndUs; if ($null -ne $row.clipboardOrdinal) { $lastNotification=$row.clipboardOrdinal }
            $attempts=$frame.sampleAttempts; $notifications=$frame.clipboardNotifications
            if ($frame.changed -or $row.kind -ceq 'clipboard' -or $row.code -cne 'host_observed' -or -not $row.scopeVerified) {
                $row.ordinal=$rows.Count+1
                $candidate=(@($rows.ToArray()) + @($row)) | ConvertTo-Json -Depth 6 -Compress
                if ($rows.Count -ge 128 -or $utf8.GetByteCount($candidate) -gt 60000) { $overflow=$unavailable=$true; $code='host_observation_overflow'; break }
                $rows.Add($row)
            }
            if (-not $row.scopeVerified) { $unavailable=$true; $autoClosing=$true; $code=$row.code; break }
            if ($row.kind -ceq 'clipboard' -and $row.code -cne 'host_observed') { $unavailable=$true }
            [Threading.Thread]::Sleep(100)
        }
        $shutdown=[Diagnostics.Stopwatch]::StartNew()
        if (-not $closed) {
            if (-not $autoClosing -and -not $owned.Process.HasExited) { Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000 }
            $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
            Assert-HostFields $frame @('kind','resourcesClosed')
            if ($frame.kind -isnot [string] -or $frame.kind -cne 'closed' -or $frame.resourcesClosed -isnot [bool]) { throw 'guard' }
            $closed=$frame.resourcesClosed
        }
    } catch {
        $unavailable=$true; $closed=$false; $code='host_capability_unavailable'
        if ($_.Exception.Message -ceq 'host_query_timeout') { $code='host_query_timeout' }
    }
    finally {
        if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
        $cleanup=Stop-HostOwnedProcess $owned $closed $shutdown; $owned=$null
        $closed=$cleanup.ResourcesClosed
        if (-not $closed) {
            $unavailable=$true
            # 已知query逾時保留原分類；未確認process退出或正常觀察卻缺close證據才改cleanup。
            if (-not $cleanup.ProcessExited -or $code -ceq 'host_observed') { $code='host_cleanup_unavailable' }
        }
    }
    $result=[ordered]@{schemaVersion=1;runId=$m.runId;requestId=$r.requestId;startedUtc=$first.utc;endedUtc=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture);clockDomain='windows_host';observations=@($rows.ToArray());clipboardNotifications=$notifications;sampleAttempts=$attempts;overflow=$overflow;unavailable=$unavailable;resourcesClosed=$closed;code=$code}
    Write-PrivateJson 'result.json' $result 65536
    [Console]::WriteLine('host_observer_finished')
} catch {
    if ($Child) { try { Write-Frame @{kind='failed';code=$code} } catch {} }
    else { [Console]::WriteLine('host_observation_unavailable') }
    exit 2
} finally {
    if ($null -ne $native) { [void]$native.Stop() }
    if ($null -ne $owned) { [void](Stop-HostOwnedProcess $owned $false ([Diagnostics.Stopwatch]::StartNew())) }
    $m=$r=$script:previousEditor=$script:previousState=$null
}
