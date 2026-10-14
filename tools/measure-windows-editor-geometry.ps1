param([switch]$Child,[switch]$DiagnosticSelfTest)
# 只讀操作者指定公開文字控制項的幾何；不讀文字／窗標題／clipboard，不移焦點或注入輸入。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$shutdown=$null;$cleanup=$null;$sid=$null;$phase='policy'

# 載入模組前驗固定NTFS／owner-only來源及祖先reparse；不修ACL或讀未知遠端來源。
function Assert-GeometrySource([string]$Path,[bool]$IsDirectory) {
    $full=[IO.Path]::GetFullPath($Path);$root=[IO.Path]::GetPathRoot($full)
    if ($root.StartsWith('\',[StringComparison]::Ordinal)) { throw 'guard' }
    $drive=New-Object IO.DriveInfo -ArgumentList $root
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') { throw 'guard' }
    $item=Get-Item -LiteralPath $full -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.PSIsContainer -ne $IsDirectory) { throw 'guard' }
    $acl=Get-Acl -LiteralPath $full
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $sid -or ($IsDirectory -and -not $acl.AreAccessRulesProtected)) { throw 'guard' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference -ne $sid) { throw 'guard' }
    }
    $parent=$item.Directory;if ($IsDirectory) { $parent=$item.Parent }
    while ($null -ne $parent) {
        if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'guard' }
        $parent=$parent.Parent
    }
}

# child只送有界固定欄位，明確LF；同步stdout Flush只在被監督child內執行。
function Write-GeometryFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 3 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) { throw 'guard' }
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}

# 先驗完整普通欄位，再將固定child階段轉marker；絕不轉印frame原文或exception。
function Read-GeometryFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string]) { throw 'guard' }
    $allowed=@('policy','source','native_compile','geometry_compile','coordinate_setup','automation_setup','session_setup','ready_write','command_sample','cursor_read','cursor_bounds','point_lookup','element_present','element_password','element_type','process_lookup','process_name','process_session','process_alive','process_user','rectangle_read','rectangle_bounds','geometry_bounds','geometry_nonfinite','geometry_negative_origin','geometry_nonpositive_extent','geometry_outside_limit','geometry_too_small','geometry_call_unavailable','identity_read','identity_present','pattern_capability','anchor_lookup','anchor_present','anchor_password','anchor_process','anchor_type','anchor_identity_read','anchor_identity_match','anchor_rectangle_read','anchor_rectangle_match','process_alive_after','geometry_reply','command_stop','closed_write')
    if ($allowed -cnotcontains $Value.stage) { throw 'guard' }
    return ('child_'+$Value.stage)
}

# 僅在原Enclose已失敗後分類已讀的RAM矩形，不作成功判定／修正或額外UIA查詢。
function Read-GeometryBoundsFailureStage([double]$X,[double]$Y,[double]$Width,[double]$Height) {
    foreach ($number in @($X,$Y,$Width,$Height)) {
        if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) { return 'geometry_nonfinite' }
    }
    if ($X -lt 0 -or $Y -lt 0) { return 'geometry_negative_origin' }
    if ($Width -le 0 -or $Height -le 0) { return 'geometry_nonpositive_extent' }
    if ($X+$Width -gt 4096 -or $Y+$Height -gt 4096) { return 'geometry_outside_limit' }
    $outerWidth=[Math]::Ceiling($X+$Width) - [Math]::Floor($X)
    $outerHeight=[Math]::Ceiling($Y+$Height) - [Math]::Floor($Y)
    if ($outerWidth -lt 21 -or $outerHeight -lt 31) { return 'geometry_too_small' }
    # 數值規則未解釋呼叫失敗時保留unknown邊界；不宣稱一定是binder或允許該矩形。
    return 'geometry_call_unavailable'
}

# 同一公開point及anchor驗identity／rect；只查TextPattern能力，不呼GetText／GetSelection或Name。
function Read-Geometry {
    $script:phase='cursor_read'
    $point=[HostEditorGeometry]::ReadCursor()
    $script:phase='cursor_bounds'
    if ($point.X -lt 0 -or $point.Y -lt 0 -or $point.X -gt 4096 -or $point.Y -gt 4096) { throw 'guard' }
    $script:phase='point_lookup'
    $element=[System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point -ArgumentList $point.X,$point.Y))
    $script:phase='element_present'
    if ($null -eq $element) { throw 'guard' }
    $script:phase='element_password'
    if ($element.Current.IsPassword) { throw 'guard' }
    $script:phase='element_type'
    $control=$element.Current.ControlType
    if ($control -ne [System.Windows.Automation.ControlType]::Edit -and $control -ne [System.Windows.Automation.ControlType]::Document) { throw 'guard' }
    $script:phase='process_lookup'
    $process=[Diagnostics.Process]::GetProcessById($element.Current.ProcessId)
    try {
        $script:phase='process_name'
        if ($process.ProcessName -ine 'notepad') { throw 'guard' }
        $script:phase='process_session'
        if ($process.SessionId -ne $script:sessionId) { throw 'guard' }
        $script:phase='process_alive'
        if ($process.HasExited) { throw 'guard' }
        $script:phase='process_user'
        if (-not [HostObserverNative]::SameUser($process.Id)) { throw 'guard' }
        $script:phase='rectangle_read'
        $rect=$element.Current.BoundingRectangle
        $script:phase='rectangle_bounds'
        if ($rect.IsEmpty -or $point.X -lt $rect.Left -or $point.X -ge $rect.Right -or $point.Y -lt $rect.Top -or $point.Y -ge $rect.Bottom) { throw 'guard' }
        $script:phase='geometry_bounds'
        try { $geometry=[HostEditorGeometry]::Enclose($rect.X,$rect.Y,$rect.Width,$rect.Height) }
        catch {
            $script:phase=Read-GeometryBoundsFailureStage $rect.X $rect.Y $rect.Width $rect.Height
            throw 'guard'
        }
        $script:phase='identity_read'
        $firstId=$element.GetRuntimeId()
        $script:phase='identity_present'
        if ($null -eq $firstId -or $firstId.Length -eq 0) { throw 'guard' }
        $script:phase='pattern_capability'
        $pattern=$null
        if (-not $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) { throw 'guard' }
        $script:phase='anchor_lookup'
        $anchor=[System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point -ArgumentList ($geometry.X+20),($geometry.Y+30)))
        $script:phase='anchor_present'
        if ($null -eq $anchor) { throw 'guard' }
        $script:phase='anchor_password'
        if ($anchor.Current.IsPassword) { throw 'guard' }
        $script:phase='anchor_process'
        if ($anchor.Current.ProcessId -ne $process.Id) { throw 'guard' }
        $script:phase='anchor_type'
        if ($anchor.Current.ControlType -ne $control) { throw 'guard' }
        $script:phase='anchor_identity_read'
        $anchorId=$anchor.GetRuntimeId()
        $script:phase='anchor_identity_match'
        if ($null -eq $anchorId -or $anchorId.Length -eq 0 -or ($anchorId -join ',') -cne ($firstId -join ',')) { throw 'guard' }
        $script:phase='anchor_rectangle_read'
        $again=$anchor.Current.BoundingRectangle
        $script:phase='anchor_rectangle_match'
        if ($again.X -ne $rect.X -or $again.Y -ne $rect.Y -or $again.Width -ne $rect.Width -or $again.Height -ne $rect.Height) { throw 'guard' }
        $script:phase='process_alive_after'
        if ($process.HasExited) { throw 'guard' }
        $script:phase='geometry_reply'
        return @{kind='geometry';scopeVerified=$true;x=$geometry.X;y=$geometry.Y;width=$geometry.Width;height=$geometry.Height}
    } finally { $process.Dispose() }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try { $sid=$identity.User } finally { $identity.Dispose() }
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) { if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) { throw 'guard' } }
    Assert-GeometrySource $PSScriptRoot $true
    Assert-GeometrySource $PSCommandPath $false
    $module=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometrySource=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    foreach ($path in @($module,$nativeSource,$geometrySource)) { Assert-GeometrySource $path $false }
    . $module
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest'
        if ($Child) { throw 'guard' }
        # 純資料oracle獨立手寫；若白名單漏stage或反射未知字串，必須拒絕而非通過。
        foreach ($stage in @('policy','source','native_compile','geometry_compile','coordinate_setup','automation_setup','session_setup','ready_write','command_sample','cursor_read','cursor_bounds','point_lookup','element_present','element_password','element_type','process_lookup','process_name','process_session','process_alive','process_user','rectangle_read','rectangle_bounds','geometry_bounds','identity_read','identity_present','pattern_capability','anchor_lookup','anchor_present','anchor_password','anchor_process','anchor_type','anchor_identity_read','anchor_identity_match','anchor_rectangle_read','anchor_rectangle_match','process_alive_after','geometry_reply','command_stop','closed_write')) {
            $value=('{"kind":"failed","stage":"'+$stage+'"}') | ConvertFrom-Json
            if ((Read-GeometryFailureStage $value) -cne ('child_'+$stage)) { throw 'guard' }
        }
        # 缺欄、額外欄、未知原文、大小寫、null、非string／非object均不得流入marker。
        foreach ($json in @('null','[]','"Public metadata"','{"kind":"failed"}','{"kind":"failed","stage":"cursor_read","extra":true}','{"kind":"ready","stage":"cursor_read"}','{"kind":true,"stage":"cursor_read"}','{"kind":"failed","stage":null}','{"kind":"failed","stage":true}','{"kind":"failed","stage":1}','{"kind":"failed","stage":["cursor_read"]}','{"kind":"failed","stage":"CURSOR_READ"}','{"kind":"failed","stage":"Public metadata"}','{"kind":"failed","stage":"cursor_read\nPublic metadata"}')) {
            $value=$json | ConvertFrom-Json
            $rejected=$false
            try { [void](Read-GeometryFailureStage $value) } catch { $rejected=$true }
            if (-not $rejected) { throw 'guard' }
        }
        # 驗普通NoteProperty邊界，不能為取得kind而執行輸入上的ScriptProperty。
        $script:geometryTestPropertyRead=$false
        $value=[pscustomobject]@{stage='cursor_read'}
        $value | Add-Member -MemberType ScriptProperty -Name kind -Value { $script:geometryTestPropertyRead=$true;return 'failed' }
        $rejected=$false
        try { [void](Read-GeometryFailureStage $value) } catch { $rejected=$true }
        if (-not $rejected -or $script:geometryTestPropertyRead) { throw 'guard' }
        # 真純資料分類須保留floor／ceil外包規則；合法數值不能被誤報為已知幾何違規。
        foreach ($row in @(
            @(0.0,61.0,1398.0,894.0,'geometry_call_unavailable'),
            @(0.25,61.25,1397.5,893.5,'geometry_call_unavailable'),
            @(4075.0,4065.0,21.0,31.0,'geometry_call_unavailable'),
            @(0.0,0.0,20.5,30.5,'geometry_call_unavailable'),
            @(-0.1,61.0,100.0,100.0,'geometry_negative_origin'),
            @(0.0,-0.1,100.0,100.0,'geometry_negative_origin'),
            @(0.0,61.0,0.0,100.0,'geometry_nonpositive_extent'),
            @(0.0,61.0,100.0,-1.0,'geometry_nonpositive_extent'),
            @(4000.0,0.0,97.0,100.0,'geometry_outside_limit'),
            @(0.0,4000.0,100.0,97.0,'geometry_outside_limit'),
            @(0.0,0.0,20.0,100.0,'geometry_too_small'),
            @(0.0,0.0,100.0,30.0,'geometry_too_small')
        )) {
            $stage=Read-GeometryBoundsFailureStage $row[0] $row[1] $row[2] $row[3]
            if ($stage -cne $row[4]) { throw 'guard' }
            $value=[pscustomobject]@{kind='failed';stage=$stage}
            if ((Read-GeometryFailureStage $value) -cne ('child_'+$row[4])) { throw 'guard' }
        }
        # NaN／正負Infinity在四個位置均須固定分類，不洩漏數值或底層exception。
        foreach ($bad in @([double]::NaN,[double]::PositiveInfinity,[double]::NegativeInfinity)) {
            for ($index=0;$index -lt 4;$index++) {
                $numbers=@(0.0,61.0,100.0,100.0);$numbers[$index]=$bad
                $stage=Read-GeometryBoundsFailureStage $numbers[0] $numbers[1] $numbers[2] $numbers[3]
                if ($stage -cne 'geometry_nonfinite' -or (Read-GeometryFailureStage ([pscustomobject]@{kind='failed';stage=$stage})) -cne 'child_geometry_nonfinite') { throw 'guard' }
            }
        }
        [Console]::WriteLine('host_editor_geometry_diagnostic_schema_observed,liveTextQueries=false');exit 0
    }
    if ($Child) {
        # 所有compile／assembly載入都在child五秒setup內，parent不Add-Type。
        $phase='native_compile'
        Add-Type -Path $nativeSource -ErrorAction Stop
        $phase='geometry_compile'
        Add-Type -Path $geometrySource -ErrorAction Stop
        $phase='coordinate_setup'
        [HostEditorGeometry]::InitializeChildCoordinates()
        $phase='automation_setup'
        Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $phase='session_setup'
        $current=[Diagnostics.Process]::GetCurrentProcess()
        try { $script:sessionId=$current.SessionId } finally { $current.Dispose() }
        $phase='ready_write'
        Write-GeometryFrame @{kind='ready'}
        $phase='command_sample'
        if ([Console]::In.ReadLine() -cne 'sample') { throw 'guard' }
        Write-GeometryFrame (Read-Geometry)
        $phase='command_stop'
        if ([Console]::In.ReadLine() -cne 'stop') { throw 'guard' }
        $phase='closed_write'
        Write-GeometryFrame @{kind='closed'};exit 0
    }
    $phase='startup'
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments='-NoProfile -STA -NonInteractive -File "'+$PSCommandPath+'" -Child'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -is [string] -and $frame.kind -ceq 'failed') { $phase=Read-GeometryFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'ready') { throw 'guard' }
    $phase='query_write'
    $query=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply'
    $reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_json'
    $frame=$reply | ConvertFrom-Json
    $reply=$null
    $phase='query_schema'
    if ($frame.kind -is [string] -and $frame.kind -ceq 'failed') { $phase=Read-GeometryFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind','scopeVerified','x','y','width','height')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'geometry' -or $frame.scopeVerified -isnot [bool] -or -not $frame.scopeVerified) { throw 'guard' }
    Assert-HostInteger $frame.x 0 4096;Assert-HostInteger $frame.y 0 4096
    Assert-HostInteger $frame.width 21 4096;Assert-HostInteger $frame.height 31 4096
    if ($frame.x+$frame.width -gt 4096 -or $frame.y+$frame.height -gt 4096) { throw 'guard' }
    $geometry=@{x=$frame.x;y=$frame.y;width=$frame.width;height=$frame.height}
    $phase='close'
    $shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -is [string] -and $frame.kind -ceq 'failed') { $phase=Read-GeometryFailureStage $frame;throw 'guard' }
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'closed') { throw 'guard' }
    $cleanup=Stop-HostOwnedProcess $owned $true $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) { throw 'guard' }
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'host_editor_geometry_observed,scopeVerified=True,processExited=True,x={0},y={1},width={2},height={3}',$geometry.x,$geometry.y,$geometry.width,$geometry.height))
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_editor_geometry_diagnostic_schema_unavailable,stage='+$phase) }
    elseif ($Child) { try { Write-GeometryFrame @{kind='failed';stage=$phase} } catch {} }
    else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
            try { $cleanup=Stop-HostOwnedProcess $owned $false $shutdown } catch { $cleanup=$null } finally { $owned=$null }
        }
        $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) { $exited=$cleanup.ProcessExited.ToString() }
        [Console]::WriteLine('host_editor_geometry_unavailable,stage='+$phase+',processExited='+$exited)
    }
    exit 2
} finally {
    if ($null -ne $owned) {
        if ($null -eq $shutdown) { $shutdown=[Diagnostics.Stopwatch]::StartNew() }
        [void](Stop-HostOwnedProcess $owned $false $shutdown)
    }
}
