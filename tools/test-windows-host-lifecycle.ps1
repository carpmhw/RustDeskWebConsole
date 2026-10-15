param([switch]$DiagnosticSelfTest,[switch]$Run,[int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# Windows-local正式檔案子case；不建Linux假claim／client，不啟動HR或改原helper。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$stage='policy';$reportedClosed='unknown';$safeCode='host_capability_unavailable'

# oracle先寫，所有預期源自公開手寫literal；不建立檔案／child或讀OS文字／clipboard。
function Test-LifecycleSchema {
    $script:stage='schema_positive'
    $m='{"schemaVersion":1,"runId":"00000000-0000-4000-8000-000000000001","expected":"Public 中文 RdWeb 00000000-0000-4000-8000-000000000003","editor":{"x":0,"y":152,"width":1075,"height":508},"createdUtc":"2026-01-01T00:00:00.000Z","expiresUtc":"2026-01-01T00:30:00.000Z"}' | ConvertFrom-Json
    $r='{"schemaVersion":1,"runId":"00000000-0000-4000-8000-000000000001","requestId":"00000000-0000-4000-8000-000000000002","createdUtc":"2026-01-01T00:00:00.000Z"}' | ConvertFrom-Json
    $readyLiteral='{"schemaVersion":1,"runId":"00000000-0000-4000-8000-000000000001","requestId":"00000000-0000-4000-8000-000000000002","utc":"2026-01-01T00:00:00.000Z","policyAccepted":true,"scopeVerified":true,"observerReady":true,"clockDomain":"windows_host","frequency":10000000,"origin":0}'
    $resultLiteral='{"schemaVersion":1,"runId":"00000000-0000-4000-8000-000000000001","requestId":"00000000-0000-4000-8000-000000000002","startedUtc":"2026-01-01T00:00:00.000Z","endedUtc":"2026-01-01T00:00:01.000Z","clockDomain":"windows_host","observations":[{"ordinal":1,"kind":"baseline","tStartUs":100,"tEndUs":110,"clipboardOrdinal":null,"notificationUs":null,"scopeVerified":true,"editorReadable":true,"editorExact":false,"editorStable":true,"clipboardReadable":false,"clipboardExact":false,"clipboardStable":false,"clipboardOwnerMatchesEditor":null,"clipboardMatchesEditor":null,"code":"host_observed"},{"ordinal":2,"kind":"editor","tStartUs":200,"tEndUs":210,"clipboardOrdinal":null,"notificationUs":null,"scopeVerified":true,"editorReadable":true,"editorExact":false,"editorStable":true,"clipboardReadable":false,"clipboardExact":false,"clipboardStable":false,"clipboardOwnerMatchesEditor":null,"clipboardMatchesEditor":null,"code":"host_observed"}],"clipboardNotifications":0,"sampleAttempts":2,"overflow":false,"unavailable":false,"resourcesClosed":true,"code":"host_observed"}'
    $ready=$readyLiteral | ConvertFrom-Json;$result=$resultLiteral | ConvertFrom-Json
    Assert-LifecyclePair $m $r $ready $result
    if ($result.observations[1].ordinal -ne 2) { throw 'guard' }
    $script:stage='schema_builder'
    $inputs=New-LifecycleInputs (Convert-LifecycleUtc '2026-01-01T00:00:00.000Z') $m.runId $r.requestId '00000000-0000-4000-8000-000000000003' $m.editor
    if (($inputs.manifest | ConvertTo-Json -Compress -Depth 4) -cne ($m | ConvertTo-Json -Compress -Depth 4) -or ($inputs.request | ConvertTo-Json -Compress) -cne ($r | ConvertTo-Json -Compress)) { throw 'guard' }
    foreach ($badEditor in @([pscustomobject]@{x=0;y=152;width=20;height=508},[pscustomobject]@{x=4090;y=152;width=1075;height=508},[pscustomobject]@{x='0';y=152;width=1075;height=508})) {
        $rejected=$false;try { [void](New-LifecycleInputs (Convert-LifecycleUtc $m.createdUtc) $m.runId $r.requestId '00000000-0000-4000-8000-000000000003' $badEditor) } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    }
    $script:stage='schema_negative'
    foreach ($mutation in @('ready_extra','ready_request','ready_bool','result_extra','result_request','close','overflow','unavailable','code','ordinal','clock','counter','duration','row_exact','getter')) {
        $ready=$readyLiteral | ConvertFrom-Json;$result=$resultLiteral | ConvertFrom-Json;$script:lifecycleGetterRead=$false
        switch ($mutation) {
            'ready_extra' { $ready | Add-Member -NotePropertyName text -NotePropertyValue 'Public denied metadata' }
            'ready_request' { $ready.requestId='00000000-0000-4000-8000-000000000004' }
            'ready_bool' { $ready.observerReady='True' }
            'result_extra' { $result | Add-Member -NotePropertyName text -NotePropertyValue 'Public denied metadata' }
            'result_request' { $result.requestId='00000000-0000-4000-8000-000000000004' }
            'close' { $result.resourcesClosed=$false }
            'overflow' { $result.overflow=$true }
            'unavailable' { $result.unavailable=$true }
            'code' { $result.code='Public unknown code' }
            'ordinal' { $result.observations[1].ordinal=1 }
            'clock' { $result.observations[1].tStartUs=105 }
            'counter' { $result.sampleAttempts=1 }
            'duration' { $result.endedUtc='2026-01-01T00:02:02.001Z' }
            'row_exact' { $result.observations[0].editorStable=$false;$result.observations[0].editorExact=$true }
            'getter' {
                $result.PSObject.Properties.Remove('resourcesClosed')
                # 普通欄位guard須在讀取getter之前拒絕。
                $result | Add-Member -MemberType ScriptProperty -Name resourcesClosed -Value { $script:lifecycleGetterRead=$true;return $true }
            }
        }
        $rejected=$false;try { Assert-LifecyclePair $m $r $ready $result } catch { $rejected=$true }
        if (-not $rejected -or $script:lifecycleGetterRead) { throw 'guard' }
    }
    # 實際兩筆clipboard row不可重用通知ordinal；不是只看結果頂層True。
    $script:stage='schema_notifications'
    $ready=$readyLiteral | ConvertFrom-Json;$result=$resultLiteral | ConvertFrom-Json
    $clip=$result.observations[1].PSObject.Copy();$clip.kind='clipboard';$clip.clipboardOrdinal=1;$clip.notificationUs=190
    $result.clipboardNotifications=2;$result.sampleAttempts=3;$result.observations=@($result.observations[0],$clip,$clip.PSObject.Copy())
    $result.observations[2].ordinal=3;$result.observations[2].tStartUs=220;$result.observations[2].tEndUs=230
    $result.observations[2].clipboardOrdinal=2;Assert-LifecyclePair $m $r $ready $result
    $result.observations[2].clipboardOrdinal=1
    $rejected=$false;try { Assert-LifecyclePair $m $r $ready $result } catch { $rejected=$true };if (-not $rejected) { throw 'guard' }
    $script:stage='schema_stream'
    $bytes=[Text.Encoding]::UTF8.GetBytes(('{"public":true}').PadRight(64,[char]32))
    $stream=[IO.MemoryStream]::new($bytes)
    try { $value=Read-LifecycleStream $stream 64;if ($value.public -isnot [bool] -or -not $value.public) { throw 'guard' } } finally { $stream.Dispose() }
    foreach ($bytes in @([byte[]]@(0xc3,0x28),([Text.Encoding]::UTF8.GetBytes((' '*64)+'{}')))) {
        $stream=[IO.MemoryStream]::new($bytes)
        try { $rejected=$false;try { [void](Read-LifecycleStream $stream 64) } catch { $rejected=$true };if (-not $rejected) { throw 'guard' } } finally { $stream.Dispose() }
    }
}

# 不修改ACL；在載入共用supervisor之前先驗普通本機NTFS／同owner私有來源及祖先。
function Assert-LifecyclePath([string]$Path,[bool]$Directory) {
    $full=[IO.Path]::GetFullPath($Path);$root=[IO.Path]::GetPathRoot($full)
    if ($root.StartsWith('\',[StringComparison]::Ordinal)) { throw 'guard' }
    $drive=[IO.DriveInfo]::new($root)
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') { throw 'guard' }
    $item=Get-Item -LiteralPath $full -Force
    if ($item.PSIsContainer -ne $Directory -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'guard' }
    $acl=Get-Acl -LiteralPath $full
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $script:owner -or ($Directory -and -not $acl.AreAccessRulesProtected)) { throw 'guard' }
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference -ne $script:owner) { throw 'guard' }
    }
    if ($Directory) { $parent=$item.Parent } else { $parent=$item.Directory }
    while ($null -ne $parent) { if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'guard' };$parent=$parent.Parent }
}
# UTC僅驗本機檔案連續性／期限，不生成跨clock因果排序。
function Convert-LifecycleUtc([string]$Value) {
    return [DateTime]::ParseExact($Value,'yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture,([Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal))
}
# 公開fixture builder可用固定時間／GUID作oracle；Run才傳入新的本機UTC及隨機GUID。
function New-LifecycleInputs([DateTime]$Now,[string]$RunId,[string]$RequestId,[string]$FixtureId,$Editor) {
    $guid='\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z'
    foreach ($id in @($RunId,$RequestId,$FixtureId)) { if ($id -cnotmatch $guid) { throw 'guard' } }
    if ($Now.Kind -ne [DateTimeKind]::Utc) { throw 'guard' }
    Assert-HostFields $Editor @('x','y','width','height')
    foreach ($name in @('x','y','width','height')) { Assert-HostInteger $Editor.$name 0 4096 }
    if ($Editor.width -lt 21 -or $Editor.height -lt 31 -or $Editor.x+$Editor.width -gt 4096 -or $Editor.y+$Editor.height -gt 4096) { throw 'guard' }
    $created=$Now.ToString('yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture)
    return [pscustomobject]@{
        manifest=[pscustomobject][ordered]@{schemaVersion=1;runId=$RunId;expected=('Public 中文 RdWeb '+$FixtureId);editor=$Editor;createdUtc=$created;expiresUtc=$Now.AddMinutes(30).ToString('yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture)}
        request=[pscustomobject][ordered]@{schemaVersion=1;runId=$RunId;requestId=$RequestId;createdUtc=$created}
    }
}
# 固定buffer讀完整JSON後才解碼，最多Limit+1，超額／非法UTF8不截斷或回原文。
function Read-LifecycleStream([IO.Stream]$Stream,[int]$Limit) {
    if ($null -eq $Stream -or $Limit -lt 1 -or $Limit -gt 65536) { throw 'guard' }
    $bytes=New-Object byte[] ($Limit+1);$count=0
    try {
        while ($count -lt $bytes.Length) {
            $read=$Stream.Read($bytes,$count,$bytes.Length-$count)
            if ($read -eq 0) { break };$count+=$read
        }
        if ($count -gt $Limit) { throw 'guard' }
        return ([Text.UTF8Encoding]::new($false,$true).GetString($bytes,0,$count) | ConvertFrom-Json)
    } finally { [Array]::Clear($bytes,0,$bytes.Length) }
}
# 只讀目前隔離run的安全結果；FileShare.Read防止同時寫入，關閉後不保留byte。
function Read-LifecycleFile([string]$Path,[int]$Limit) {
    Assert-LifecyclePath $Path $false
    $stream=[IO.FileStream]::new($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try { if ($stream.Length -gt $Limit) { throw 'guard' };return (Read-LifecycleStream $stream $Limit) } finally { $stream.Dispose() }
}
# 只對新run寫兩份公開輸入；不覆寫／不產生文字結果或假Linux claim／client。
function Write-LifecycleInput([string]$Directory,[string]$Name,$Value) {
    if (@('manifest.json','start-request.json') -cnotcontains $Name) { throw 'guard' }
    Assert-LifecyclePath $Directory $true
    $bytes=[Text.UTF8Encoding]::new($false,$true).GetBytes(($Value | ConvertTo-Json -Depth 4 -Compress)+"`n");$stream=$null
    try {
        if ($bytes.Length -gt 8192) { throw 'guard' }
        $stream=[IO.FileStream]::new((Join-Path $Directory $Name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $stream.Write($bytes,0,$bytes.Length)
    } finally { if ($null -ne $stream) { $stream.Dispose() };[Array]::Clear($bytes,0,$bytes.Length) }
}
# header先驗普通欄位再取值，對本次public run／request做Ordinal精確綁定。
function Assert-LifecycleHeader($Value,[string[]]$Names,$Manifest,$Request) {
    Assert-HostFields $Value $Names
    Assert-HostInteger $Value.schemaVersion 1 1
    if ($Value.runId -isnot [string] -or $Value.requestId -isnot [string] -or $Value.runId -cne $Manifest.runId -or $Value.requestId -cne $Request.requestId -or $Value.clockDomain -isnot [string] -or $Value.clockDomain -cne 'windows_host') { throw 'guard' }
}
# 驗正常Windows檔案子case，不要求editorExact=True；fresh expected未輸入是正常的。
function Assert-LifecyclePair($Manifest,$Request,$Ready,$Result) {
    Assert-LifecycleHeader $Ready @('schemaVersion','runId','requestId','utc','policyAccepted','scopeVerified','observerReady','clockDomain','frequency','origin') $Manifest $Request
    foreach ($name in @('policyAccepted','scopeVerified','observerReady')) { if ($Ready.$name -isnot [bool] -or -not $Ready.$name) { throw 'guard' } }
    Assert-HostInteger $Ready.frequency 1 1000000000;Assert-HostInteger $Ready.origin 0 0
    if ($Ready.utc -isnot [string]) { throw 'guard' }
    $started=Convert-LifecycleUtc $Ready.utc
    if ($started -lt (Convert-LifecycleUtc $Request.createdUtc) -or $started -ge (Convert-LifecycleUtc $Manifest.expiresUtc)) { throw 'guard' }
    Assert-LifecycleHeader $Result @('schemaVersion','runId','requestId','startedUtc','endedUtc','clockDomain','observations','clipboardNotifications','sampleAttempts','overflow','unavailable','resourcesClosed','code') $Manifest $Request
    if ($Result.startedUtc -isnot [string] -or $Result.endedUtc -isnot [string] -or $Result.startedUtc -cne $Ready.utc) { throw 'guard' }
    $elapsed=((Convert-LifecycleUtc $Result.endedUtc)-$started).TotalMilliseconds
    if ($elapsed -lt 0 -or $elapsed -gt 122000) { throw 'guard' }
    foreach ($name in @('overflow','unavailable','resourcesClosed')) { if ($Result.$name -isnot [bool]) { throw 'guard' } }
    Assert-HostCode $Result.code
    if ($Result.overflow -or $Result.unavailable -or -not $Result.resourcesClosed -or $Result.code -cne 'host_observed') { throw 'guard' }
    Assert-HostInteger $Result.clipboardNotifications 0 64;Assert-HostInteger $Result.sampleAttempts 1 1200
    if ($Result.observations -isnot [Array] -or $Result.observations.Count -lt 1 -or $Result.observations.Count -gt 128 -or $Result.observations.Count -gt $Result.sampleAttempts) { throw 'guard' }
    $names=@('ordinal','kind','tStartUs','tEndUs','clipboardOrdinal','notificationUs','scopeVerified','editorReadable','editorExact','editorStable','clipboardReadable','clipboardExact','clipboardStable','clipboardOwnerMatchesEditor','clipboardMatchesEditor','code')
    $previousEnd=0;$previousNotification=0;$ordinal=0
    foreach ($row in $Result.observations) {
        Assert-HostFields $row $names;$ordinal++;Assert-HostInteger $row.ordinal $ordinal $ordinal
        # 持久序號已驗；僅私有副本映為child frame的1以沿用共用row validator，原檔及row不改。
        $probe=$row.PSObject.Copy();$probe.ordinal=1
        [void](Assert-HostRow $probe $previousEnd $previousNotification $Result.clipboardNotifications)
        if (($ordinal -eq 1 -and $row.kind -cne 'baseline') -or ($ordinal -gt 1 -and @('editor','clipboard') -cnotcontains $row.kind) -or -not $row.scopeVerified -or -not $row.editorReadable -or $row.code -cne 'host_observed') { throw 'guard' }
        $previousEnd=$row.tEndUs
        if ($null -ne $row.clipboardOrdinal) { $previousNotification=$row.clipboardOrdinal }
    }
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned' -or (Get-ExecutionPolicy -Scope Process) -ne 'RemoteSigned') { throw 'guard' }
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:owner=$identity.User;$principal=[Security.Principal.WindowsPrincipal]::new($identity)
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'guard' }
    } finally { $identity.Dispose() }
    $stage='flags';if ($Run -eq $DiagnosticSelfTest) { throw 'guard' }
    $stage='source';Assert-LifecyclePath $PSScriptRoot $true;Assert-LifecyclePath $PSCommandPath $false
    $sources=@(
        @('windows-host-observer-supervisor.ps1',9816,'51fc9465075526356354c943ed9b029fff39ffcd405c4db56b62ef9932fd63b2'),
        @('windows-host-observer-uia-shared.ps1',19114,'ca47ceabcd815ab2f168b952076ae627ba39dc3113f202fee491eb6b2a3ccada'),
        @('windows-host-observer-native.cs',19651,'a33ccda1f29efaf69fd54ec2a9139209a192b5e229b859484d0484e6e85c2dcc'),
        @('windows-host-editor.ps1',2642,'8e6e51a0f8ba8d23603757960ddfcbd6eee094b21c8126096cf35b4f3b07530e'),
        @('windows-host-editor-calibration.cs',3648,'a9e60f638b36ad3e96f0d4bf661eb1c8dccd9a93140c22d01af6e52b6d23b840'),
        @('windows-editor-geometry-native.cs',3137,'82ef5c42f387f7e2262f2db57615312d3b3c42d98213cf6223b737b386d50b33')
    )
    foreach ($source in $sources) {
        $path=Join-Path $PSScriptRoot $source[0];Assert-LifecyclePath $path $false
        if ((Get-Item -LiteralPath $path -Force).Length -ne $source[1] -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $source[2]) { throw 'guard' }
    }
    . (Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1')
    if ($DiagnosticSelfTest) {
        $stage='diagnostic_selftest';Test-LifecycleSchema
        [Console]::WriteLine('host_formal_lifecycle_schema_observed,liveTextQueries=false,liveClipboardQueries=false');exit 0
    }
    $stage='inputs'
    $inputs=New-LifecycleInputs ([DateTime]::UtcNow) ([Guid]::NewGuid().ToString('D')) ([Guid]::NewGuid().ToString('D')) ([Guid]::NewGuid().ToString('D')) ([pscustomobject][ordered]@{x=$X;y=$Y;width=$Width;height=$Height})
    $stage='run_directory';$runDirectory=Join-Path $PSScriptRoot 'formal-lifecycle-01'
    if (Test-Path -LiteralPath $runDirectory) { throw 'guard' }
    [void](New-Item -ItemType Directory -Path $runDirectory)
    # 僅新資料夾的Access-only模型將繼承owner-only規則轉明確規則，不改owner／group／SACL。
    $directory=[IO.DirectoryInfo]::new($runDirectory)
    $acl=$directory.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true,$true)
    if (-not $acl.AreAccessRulesCanonical) { throw 'guard' }
    $directory.SetAccessControl($acl)
    Assert-LifecyclePath $runDirectory $true
    Write-LifecycleInput $runDirectory 'manifest.json' $inputs.manifest
    Write-LifecycleInput $runDirectory 'start-request.json' $inputs.request
    $stage='formal_run';$exe=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $formal=Join-Path $PSScriptRoot 'windows-host-observer-uia-shared.ps1'
    $lines=@(& $exe -NoProfile -STA -File $formal -Manifest (Join-Path $runDirectory 'manifest.json') -Request (Join-Path $runDirectory 'start-request.json') -Directory $runDirectory 2>$null)
    $formalExit=$LASTEXITCODE
    if ($formalExit -ne 0 -or $lines.Count -ne 1 -or $lines[0] -isnot [string] -or $lines[0] -cne 'host_observer_finished') { throw 'guard' }
    $stage='ready_file';$ready=Read-LifecycleFile (Join-Path $runDirectory 'ready.json') 8192
    $stage='result_file';$result=Read-LifecycleFile (Join-Path $runDirectory 'result.json') 65536
    $stage='result_schema'
    Assert-HostFields $result @('schemaVersion','runId','requestId','startedUtc','endedUtc','clockDomain','observations','clipboardNotifications','sampleAttempts','overflow','unavailable','resourcesClosed','code')
    Assert-HostCode $result.code;$safeCode=$result.code
    if ($result.resourcesClosed -is [bool]) { $reportedClosed=$result.resourcesClosed.ToString() }
    Assert-LifecyclePair $inputs.manifest $inputs.request $ready $result
    [Console]::WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'host_formal_lifecycle_observed,case=QuietWindow,readyMatched=True,resultMatched=True,resourcesClosed=True,sampleAttempts={0},observations={1},clipboardNotifications={2},overflow=False,unavailable=False,code=host_observed,hrStarted=False,linuxClaimVerified=False,liveSetupVerified=False',$result.sampleAttempts,$result.observations.Count,$result.clipboardNotifications))
} catch {
    if ($DiagnosticSelfTest) { [Console]::WriteLine('host_formal_lifecycle_schema_unavailable,stage='+$stage) }
    else { [Console]::WriteLine('host_formal_lifecycle_unavailable,stage='+$stage+',reportedResourcesClosed='+$reportedClosed+',code='+$safeCode+',hrStarted=False') }
    exit 2
} finally { $inputs=$ready=$result=$null }
