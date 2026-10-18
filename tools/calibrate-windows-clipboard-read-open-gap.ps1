[CmdletBinding()]
param([switch]$ReadOpenGap,[switch]$AllowClipboardOverwrite,[switch]$DiagnosticSelfTest,[switch]$Child,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)

# ReadOpenGap獨立校準入口；schema selftest不啟動child或native fixture。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$query=$null;$shutdown=$null;$cleanup=$null;$native=$null;$fixture=$null;$sample=$null;$closed=$null;$nativeClosed=$false
$changeState='not_requested';$phase='policy';$script:sid=$null;$script:readOpenGapFrameWriteFailed=$false

# 只接受schema自測或完整雙opt-in／內部child的固定模式。
function Test-ReadOpenGapMode([bool]$Case,[bool]$Allow,[bool]$Self,[bool]$IsChild) {
    if ($Self) {return (-not $Case -and -not $Allow -and -not $IsChild)}
    return ($Case -and $Allow)
}

# 模組載入前只驗owner-only本機NTFS來源與祖先reparse狀態，不修ACL。
function Assert-ReadOpenGapSource([string]$Path,[bool]$Directory) {
    if ([string]::IsNullOrEmpty($Path) -or $Path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) {throw 'host_capability_unavailable'}
    $full=[IO.Path]::GetFullPath($Path);$root=[IO.Path]::GetPathRoot($full)
    if ($root.StartsWith('\\',[StringComparison]::Ordinal)) {throw 'host_capability_unavailable'}
    $drive=[IO.DriveInfo]::new($root)
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') {throw 'host_capability_unavailable'}
    $item=Get-Item -LiteralPath $full -Force -ErrorAction Stop
    if ($item.PSIsContainer -ne $Directory -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {throw 'host_capability_unavailable'}
    $acl=Get-Acl -LiteralPath $full -ErrorAction Stop
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $script:sid -or ($Directory -and -not $acl.AreAccessRulesProtected)) {throw 'host_capability_unavailable'}
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference -ne $script:sid) {throw 'host_capability_unavailable'}
    }
    $parent=$item.Directory;if ($Directory) {$parent=$item.Parent}
    while ($null -ne $parent) {
        if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {throw 'host_capability_unavailable'}
        $parent=$parent.Parent
    }
}

# 共享reader未呼叫時封存固定not_attempted資料，避免合成任何版本或正向證據。
function New-ReadOpenGapUnobservedCapture() {
    $evidence=[HostReadOpenGapEvidence]::new('not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted',$true)
    return [HostReadOpenGapCapture]::new([uint32]0,[uint32]0,[uint32]0,[uint32]0,[HostReadOpenGapStage]::NotAttempted,$false,$evidence)
}

# 只接受固定大小寫enum，不轉型或反射未知值。
function Assert-ReadOpenGapEnum($Value,[string[]]$Allowed) {
    if ($Value -isnot [string] -or $Allowed -cnotcontains $Value) {throw 'host_capability_unavailable'}
}

# 驗證sample的ordinary欄位與固定證據enum。
function Assert-ReadOpenGapSample($Value) {
    Assert-HostFields $Value @('kind','evidenceKind','scopeVerified','readerInvoked','readerRejected','textReturned','overflow','code','readerCode','evidence')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.evidenceKind -isnot [string] -or $Value.evidenceKind -cne 'shared_strategy_native_gap') {throw 'host_capability_unavailable'}
    foreach ($name in @('scopeVerified','readerInvoked','readerRejected','textReturned','overflow')) {
        if ($Value.$name -isnot [bool]) {throw 'host_capability_unavailable'}
    }
    $codes=@('host_observed','host_capability_unavailable','host_cleanup_unavailable','host_clipboard_unstable','host_clipboard_busy','host_clipboard_format_unavailable','host_text_too_large','host_text_invalid','host_text_unreadable','host_scope_changed','host_observation_overflow')
    if ($Value.code -isnot [string] -or $codes -cnotcontains $Value.code) {throw 'host_capability_unavailable'}
    $readerCodes=@('unknown','host_observed','host_capability_unavailable','host_cleanup_unavailable','host_clipboard_unstable','host_clipboard_busy','host_clipboard_format_unavailable','host_text_too_large','host_text_invalid','host_text_unreadable')
    Assert-ReadOpenGapEnum $Value.readerCode $readerCodes

    $e=$Value.evidence
    Assert-HostFields $e @('firstSequenceStatus','publicationStatus','gapOrderStatus','publicationSequenceStatus','readerOpenStatus','lockedPublicationStatus','payloadStatus','readerCopyStatus','postSequenceStatus','readCloseStatus','traceValid')
    $enums=[ordered]@{
        firstSequenceStatus=@('available','unavailable','not_attempted','unknown')
        publicationStatus=@('succeeded','failed','not_attempted','unknown')
        gapOrderStatus=@('verified','violated','not_attempted','unknown')
        publicationSequenceStatus=@('changed','unchanged','not_attempted','unknown')
        readerOpenStatus=@('succeeded','failed','not_attempted','unknown')
        lockedPublicationStatus=@('matched','mismatched','not_attempted','unknown')
        payloadStatus=@('matched','mismatched','not_attempted','unknown')
        readerCopyStatus=@('succeeded','failed','not_attempted','unknown')
        postSequenceStatus=@('matched','mismatched','not_attempted','unknown')
        readCloseStatus=@('succeeded','failed','not_attempted','unknown')
    }
    foreach ($name in $enums.Keys) {Assert-ReadOpenGapEnum $e.$name $enums[$name]}
    if ($e.traceValid -isnot [bool]) {throw 'host_capability_unavailable'}
    if (-not $Value.readerInvoked) {
        if ($Value.readerRejected -or $Value.textReturned -or $Value.readerCode -cne 'unknown') {throw 'host_capability_unavailable'}
        foreach ($name in $enums.Keys) {if ($e.$name -cne 'not_attempted') {throw 'host_capability_unavailable'}}
    }
    if ($Value.readerInvoked -and $e.firstSequenceStatus -ceq 'not_attempted') {throw 'host_capability_unavailable'}
    if ($Value.readerInvoked -and $e.firstSequenceStatus -ceq 'available' -and ($e.publicationStatus -ceq 'not_attempted' -or $e.gapOrderStatus -ceq 'not_attempted')) {throw 'host_capability_unavailable'}

    if (-not $e.traceValid) {
        foreach ($name in $enums.Keys) {
            if ($e.$name -in @('available','succeeded','verified','changed','unchanged','matched','mismatched')) {throw 'host_capability_unavailable'}
        }
    }
    if ($e.traceValid) {
        if (($e.FirstSequenceStatus -in @('unavailable','not_attempted')) -and ($e.publicationStatus -ne 'not_attempted' -or $e.gapOrderStatus -ne 'not_attempted')) {throw 'host_capability_unavailable'}
        if ($e.firstSequenceStatus -ceq 'unknown' -and ($e.publicationStatus -ne 'not_attempted' -or $e.gapOrderStatus -ne 'not_attempted')) {throw 'host_capability_unavailable'}
        if ($e.publicationStatus -ceq 'succeeded' -and ($e.firstSequenceStatus -cne 'available' -or $e.gapOrderStatus -cne 'verified' -or $e.publicationSequenceStatus -notin @('changed','unchanged'))) {throw 'host_capability_unavailable'}
        if ($e.publicationSequenceStatus -in @('changed','unchanged') -and $e.publicationStatus -cne 'succeeded') {throw 'host_capability_unavailable'}
        if ($e.readerOpenStatus -in @('succeeded','failed') -and ($e.publicationStatus -cne 'succeeded' -or $e.gapOrderStatus -cne 'verified' -or $e.publicationSequenceStatus -cne 'changed')) {throw 'host_capability_unavailable'}
        if ($e.readerOpenStatus -ne 'succeeded' -and $e.lockedPublicationStatus -ne 'not_attempted' -and $e.lockedPublicationStatus -ne 'unknown') {throw 'host_capability_unavailable'}
        if ($e.readerOpenStatus -eq 'succeeded' -and $e.lockedPublicationStatus -eq 'not_attempted') {throw 'host_capability_unavailable'}
        if ($e.lockedPublicationStatus -ne 'matched' -and ($e.payloadStatus -notin @('not_attempted','unknown') -or $e.readerCopyStatus -notin @('not_attempted','unknown') -or $e.postSequenceStatus -notin @('not_attempted','unknown'))) {throw 'host_capability_unavailable'}
        if ($e.payloadStatus -in @('matched','mismatched') -and $e.readerCopyStatus -cne 'succeeded') {throw 'host_capability_unavailable'}
        if ($e.readerCopyStatus -eq 'succeeded' -and ($e.payloadStatus -notin @('matched','mismatched','unknown') -or $e.lockedPublicationStatus -cne 'matched')) {throw 'host_capability_unavailable'}
        if ($e.postSequenceStatus -in @('matched','mismatched') -and $e.readerCopyStatus -cne 'succeeded') {throw 'host_capability_unavailable'}
        if ($e.readCloseStatus -ne 'not_attempted' -and $e.readerOpenStatus -cne 'succeeded') {throw 'host_capability_unavailable'}
        if ($Value.textReturned -and $e.readCloseStatus -cne 'succeeded') {throw 'host_capability_unavailable'}
    }
    if ($Value.readerCode -ceq 'host_observed' -and -not $Value.textReturned) {throw 'host_capability_unavailable'}
    if ($Value.textReturned -and $Value.readerCode -cne 'host_observed') {throw 'host_capability_unavailable'}
    if (($Value.code -ceq 'host_clipboard_unstable') -ne $Value.readerRejected) {throw 'host_capability_unavailable'}
    if ($Value.code -ceq 'host_scope_changed' -and $Value.scopeVerified) {throw 'host_capability_unavailable'}
    if ($Value.code -ceq 'host_observation_overflow' -and -not $Value.overflow) {throw 'host_capability_unavailable'}
    if ($Value.code -ceq 'host_observation_overflow' -and -not $Value.scopeVerified) {throw 'host_capability_unavailable'}
    if (-not $Value.scopeVerified -and $Value.code -cnotin @('host_scope_changed','host_cleanup_unavailable')) {throw 'host_capability_unavailable'}
    if ($Value.overflow) {
        $overflowCodes=@('host_observation_overflow','host_cleanup_unavailable')
        if (-not $Value.scopeVerified) {$overflowCodes+='host_scope_changed'}
        if ($Value.code -cnotin $overflowCodes) {throw 'host_capability_unavailable'}
    }
    $readerPathProven=$e.publicationStatus -ceq 'succeeded' -and $e.gapOrderStatus -ceq 'verified' -and $e.publicationSequenceStatus -ceq 'changed'
    $lockedReaderPathProven=$readerPathProven -and $e.readerOpenStatus -ceq 'succeeded' -and $e.lockedPublicationStatus -ceq 'matched'
    if ($Value.code -ceq 'host_clipboard_busy' -and -not ($readerPathProven -and $e.readerOpenStatus -ceq 'failed')) {throw 'host_capability_unavailable'}
    if ($Value.code -in @('host_observed','host_clipboard_format_unavailable','host_text_too_large','host_text_invalid','host_text_unreadable') -and -not $lockedReaderPathProven) {throw 'host_capability_unavailable'}
    if ($Value.readerRejected) {
        $invalidRejection = -not $Value.scopeVerified -or
            -not $Value.readerInvoked -or $Value.textReturned -or $Value.overflow -or
            $Value.code -cne 'host_clipboard_unstable' -or $Value.readerCode -cne 'host_clipboard_unstable' -or
            $e.firstSequenceStatus -cne 'available' -or $e.publicationStatus -cne 'succeeded' -or $e.gapOrderStatus -cne 'verified' -or
            $e.publicationSequenceStatus -cne 'changed' -or $e.readerOpenStatus -cne 'succeeded' -or $e.lockedPublicationStatus -cne 'matched' -or
            $e.payloadStatus -cne 'matched' -or $e.readerCopyStatus -cne 'succeeded' -or $e.postSequenceStatus -cne 'matched' -or
            $e.readCloseStatus -cne 'succeeded' -or -not $e.traceValid
        if ($invalidRejection) {throw 'host_capability_unavailable'}
    }
}

# 驗證closed的ordinary欄位與資源合取。
function Assert-ReadOpenGapClosed($Value) {
    Assert-HostFields $Value @('kind','fixtureResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed','traceFinalized','traceValid')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'closed') {throw 'host_capability_unavailable'}
    foreach ($name in @('fixtureResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed','traceFinalized','traceValid')) {
        if ($Value.$name -isnot [bool]) {throw 'host_capability_unavailable'}
    }
    if ($Value.resourcesClosed -ne ($Value.fixtureResourcesClosed -and $Value.listenerResourcesClosed)) {throw 'host_capability_unavailable'}
    if ($Value.traceFinalized -and -not $Value.fixtureResourcesClosed) {throw 'host_capability_unavailable'}
}

# 驗證sample與closed之間的單調證據。
function Assert-ReadOpenGapPair($Sample,$Closed) {
    Assert-ReadOpenGapSample $Sample
    Assert-ReadOpenGapClosed $Closed
    if ($Closed.traceFinalized -and -not $Sample.readerInvoked) {throw 'host_capability_unavailable'}
    if (-not $Sample.evidence.traceValid -and $Closed.traceValid) {throw 'host_capability_unavailable'}
}

# 只在完整讀後拒絕證據成立時回傳true。
function Test-ReadOpenGapObserved($Sample,$Closed) {
    Assert-ReadOpenGapPair $Sample $Closed
    $e=$Sample.evidence
    $observed = $Sample.scopeVerified -and $Sample.readerInvoked -and $Sample.readerRejected -and -not $Sample.textReturned -and
        -not $Sample.overflow -and -not $Closed.overflow -and $Sample.code -ceq 'host_clipboard_unstable' -and
        $Sample.readerCode -ceq 'host_clipboard_unstable' -and $e.firstSequenceStatus -ceq 'available' -and
        $e.publicationStatus -ceq 'succeeded' -and $e.gapOrderStatus -ceq 'verified' -and
        $e.publicationSequenceStatus -ceq 'changed' -and $e.readerOpenStatus -ceq 'succeeded' -and
        $e.lockedPublicationStatus -ceq 'matched' -and $e.payloadStatus -ceq 'matched' -and
        $e.readerCopyStatus -ceq 'succeeded' -and $e.postSequenceStatus -ceq 'matched' -and
        $e.readCloseStatus -ceq 'succeeded' -and $e.traceValid -and $Closed.fixtureResourcesClosed -and
        $Closed.listenerResourcesClosed -and $Closed.resourcesClosed -and $Closed.traceFinalized -and $Closed.traceValid
    return $observed
}

# 純格式化固定safe scalar，不輸出nested raw JSON。
function Format-ReadOpenGapResult($Sample,$Closed,[bool]$ProcessExited,[bool]$ResourcesClosed) {
    Assert-ReadOpenGapPair $Sample $Closed
    $totalResourcesClosed=$ResourcesClosed -and $Closed.resourcesClosed
    $observed=(Test-ReadOpenGapObserved $Sample $Closed) -and $ProcessExited -and $totalResourcesClosed
    $marker='host_clipboard_read_open_gap_unavailable'
    if ($observed) {$marker='host_clipboard_read_open_gap_observed'}
    $primaryCode=$Sample.code
    if (-not $totalResourcesClosed) {$primaryCode='host_cleanup_unavailable'}
    elseif (-not $Sample.scopeVerified) {$primaryCode='host_scope_changed'}
    elseif ($Sample.overflow -or $Closed.overflow) {$primaryCode='host_observation_overflow'}
    elseif (-not $Sample.evidence.traceValid -or -not $Closed.traceValid -or -not $Closed.traceFinalized) {$primaryCode='host_capability_unavailable'}
    $fields=[ordered]@{
        case='ReadOpenGap'
        evidenceKind='shared_strategy_native_gap'
        scopeVerified=$Sample.scopeVerified
        readerInvoked=$Sample.readerInvoked
        readerRejected=$Sample.readerRejected
        textReturned=$Sample.textReturned
        overflow=($Sample.overflow -or $Closed.overflow)
        primaryCode=$primaryCode
        readerCode=$Sample.readerCode
        firstSequenceStatus=$Sample.evidence.firstSequenceStatus
        publicationStatus=$Sample.evidence.publicationStatus
        gapOrderStatus=$Sample.evidence.gapOrderStatus
        publicationSequenceStatus=$Sample.evidence.publicationSequenceStatus
        readerOpenStatus=$Sample.evidence.readerOpenStatus
        lockedPublicationStatus=$Sample.evidence.lockedPublicationStatus
        payloadStatus=$Sample.evidence.payloadStatus
        readerCopyStatus=$Sample.evidence.readerCopyStatus
        postSequenceStatus=$Sample.evidence.postSequenceStatus
        readCloseStatus=$Sample.evidence.readCloseStatus
        traceValid=$Sample.evidence.traceValid
        fixtureResourcesClosed=$Closed.fixtureResourcesClosed
        listenerResourcesClosed=$Closed.listenerResourcesClosed
        resourcesClosed=$totalResourcesClosed
        traceFinalized=$Closed.traceFinalized
        finalTraceValid=$Closed.traceValid
        processExited=$ProcessExited
    }
    $line=$marker
    foreach ($name in $fields.Keys) {$line+=','+$name+'='+[string]$fields[$name]}
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 4096) {throw 'host_capability_unavailable'}
    return $line
}

# 只格式化固定parent stage、clipboard state及process boolean，不反射錯誤內容。
function Format-ReadOpenGapFailure([string]$Stage,[string]$ChangeState,[string]$ProcessExited) {
    $parentStages=@('policy','flags','source','startup','query_write','query_reply','query_schema','close','result')
    $childStages=@('compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','scope_before','observe','scope_after','classify','stop_command','native_close','closed_write')
    $validStage=$parentStages -ccontains $Stage
    if (-not $validStage) {
        foreach ($childStage in $childStages) {if ($Stage -ceq ('child_'+$childStage)) {$validStage=$true;break}}
    }
    if (-not $validStage) {$Stage='unknown'}
    if (@('not_requested','unknown','published') -cnotcontains $ChangeState) {$ChangeState='unknown'}
    if (@('True','False','unknown') -cnotcontains $ProcessExited) {$ProcessExited='unknown'}
    return ('host_clipboard_read_open_gap_unavailable,case=ReadOpenGap,stage='+$Stage+',clipboardChangeState='+$ChangeState+',processExited='+$ProcessExited)
}

# child失敗stage只映射固定白名單。
function Read-ReadOpenGapFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','scope_before','observe','scope_after','classify','stop_command','native_close','closed_write')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) {throw 'host_capability_unavailable'}
    return ('child_'+$Value.stage)
}

# 建立固定受限strict-UTF8 frame bytes供bounded writer使用。
function Convert-ReadOpenGapFrameBytes($Value) {
    if ($null -eq $Value -or $Value -isnot [Management.Automation.PSCustomObject]) {throw 'host_capability_unavailable'}
    $kindProperty=$Value.PSObject.Properties['kind']
    if ($null -eq $kindProperty -or $kindProperty.MemberType -ne [Management.Automation.PSMemberTypes]::NoteProperty -or $kindProperty.Value -isnot [string]) {throw 'host_capability_unavailable'}
    switch ($kindProperty.Value) {
        'ready' {Assert-HostFields $Value @('kind');if ($Value.kind -cne 'ready') {throw 'host_capability_unavailable'}}
        'sample' {Assert-ReadOpenGapSample $Value}
        'closed' {Assert-ReadOpenGapClosed $Value}
        'failed' {[void](Read-ReadOpenGapFailureStage $Value)}
        default {throw 'host_capability_unavailable'}
    }
    $json=$Value | ConvertTo-Json -Depth 4 -Compress
    $bytes=(New-Object Text.UTF8Encoding -ArgumentList $false,$true).GetBytes($json+"`n")
    if ($bytes.Length -gt 8192) { [Array]::Clear($bytes,0,$bytes.Length);throw 'host_observation_overflow' }
    return ,$bytes
}

# 只寫自行建構且通過固定契約的safe frame。
function Write-ReadOpenGapFrame($Value) {
    $bytes=Convert-ReadOpenGapFrameBytes $Value
    try {
        $stream=[Console]::OpenStandardOutput()
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush()
    } finally { [Array]::Clear($bytes,0,$bytes.Length) }
}

# 手寫literal schema oracle；不Add-Type、不建child、不碰clipboard。
function Test-ReadOpenGapSchema() {
    $sampleJson='{"kind":"sample","evidenceKind":"shared_strategy_native_gap","scopeVerified":true,"readerInvoked":true,"readerRejected":true,"textReturned":false,"overflow":false,"code":"host_clipboard_unstable","readerCode":"host_clipboard_unstable","evidence":{"firstSequenceStatus":"available","publicationStatus":"succeeded","gapOrderStatus":"verified","publicationSequenceStatus":"changed","readerOpenStatus":"succeeded","lockedPublicationStatus":"matched","payloadStatus":"matched","readerCopyStatus":"succeeded","postSequenceStatus":"matched","readCloseStatus":"succeeded","traceValid":true}}'
    $closedJson='{"kind":"closed","fixtureResourcesClosed":true,"listenerResourcesClosed":true,"overflow":false,"resourcesClosed":true,"traceFinalized":true,"traceValid":true}'
    $sample=$sampleJson | ConvertFrom-Json
    $closed=$closedJson | ConvertFrom-Json
    Assert-ReadOpenGapPair $sample $closed
    if (-not (Test-ReadOpenGapObserved $sample $closed)) {throw 'complete_literal'}
    $expected='host_clipboard_read_open_gap_observed,case=ReadOpenGap,evidenceKind=shared_strategy_native_gap,scopeVerified=True,readerInvoked=True,readerRejected=True,textReturned=False,overflow=False,primaryCode=host_clipboard_unstable,readerCode=host_clipboard_unstable,firstSequenceStatus=available,publicationStatus=succeeded,gapOrderStatus=verified,publicationSequenceStatus=changed,readerOpenStatus=succeeded,lockedPublicationStatus=matched,payloadStatus=matched,readerCopyStatus=succeeded,postSequenceStatus=matched,readCloseStatus=succeeded,traceValid=True,fixtureResourcesClosed=True,listenerResourcesClosed=True,resourcesClosed=True,traceFinalized=True,finalTraceValid=True,processExited=True'
    if ((Format-ReadOpenGapResult $sample $closed $true $true) -cne $expected) {throw 'complete_formatter'}

    foreach ($name in @('firstSequenceStatus','publicationStatus','gapOrderStatus','publicationSequenceStatus','readerOpenStatus','lockedPublicationStatus','payloadStatus','readerCopyStatus','postSequenceStatus','readCloseStatus')) {
        $partial=$sampleJson | ConvertFrom-Json
        $partial.readerRejected=$false
        $partial.code='host_capability_unavailable'
        $partial.evidence.$name='unknown'
        $observed=$false
        try {$observed=Test-ReadOpenGapObserved $partial $closed} catch {}
        if ($observed) {throw 'unknown_stage'}
    }

    $notAttemptedJson='{"kind":"sample","evidenceKind":"shared_strategy_native_gap","scopeVerified":true,"readerInvoked":true,"readerRejected":false,"textReturned":false,"overflow":false,"code":"host_capability_unavailable","readerCode":"host_clipboard_unstable","evidence":{"firstSequenceStatus":"unavailable","publicationStatus":"not_attempted","gapOrderStatus":"not_attempted","publicationSequenceStatus":"not_attempted","readerOpenStatus":"not_attempted","lockedPublicationStatus":"not_attempted","payloadStatus":"not_attempted","readerCopyStatus":"not_attempted","postSequenceStatus":"not_attempted","readCloseStatus":"not_attempted","traceValid":true}}'
    $notAttempted=$notAttemptedJson | ConvertFrom-Json
    Assert-ReadOpenGapPair $notAttempted $closed
    if (Test-ReadOpenGapObserved $notAttempted $closed) {throw 'not_attempted_success'}
    if (-not (Format-ReadOpenGapResult $notAttempted $closed $true $true).StartsWith('host_clipboard_read_open_gap_unavailable,',[StringComparison]::Ordinal)) {throw 'not_attempted_marker'}

    $notInvoked=$notAttemptedJson | ConvertFrom-Json
    $notInvoked.readerInvoked=$false
    $notInvoked.readerCode='unknown'
    $notInvoked.evidence.firstSequenceStatus='not_attempted'
    $notInvokedClosed=$closedJson | ConvertFrom-Json
    $notInvokedClosed.traceFinalized=$false
    Assert-ReadOpenGapPair $notInvoked $notInvokedClosed
    $uninvokedFinal=$closedJson | ConvertFrom-Json
    $rejected=$false;try {Assert-ReadOpenGapPair $notInvoked $uninvokedFinal} catch {$rejected=$true}
    if (-not $rejected) {throw 'uninvoked_finalized'}
    $impossible=$sampleJson | ConvertFrom-Json
    $impossible.readerInvoked=$false
    $impossible.readerRejected=$false
    $impossible.code='host_capability_unavailable'
    $rejected=$false;try {Assert-ReadOpenGapSample $impossible} catch {$rejected=$true}
    if (-not $rejected) {throw 'reader_not_invoked_with_sequence'}
    $impossible=$notAttemptedJson | ConvertFrom-Json
    $impossible.readerCode='unknown'
    $impossible.evidence.firstSequenceStatus='not_attempted'
    $rejected=$false;try {Assert-ReadOpenGapSample $impossible} catch {$rejected=$true}
    if (-not $rejected) {throw 'reader_invoked_without_first_sequence'}
    $impossible=$notAttemptedJson | ConvertFrom-Json
    $impossible.evidence.firstSequenceStatus='available'
    $rejected=$false;try {Assert-ReadOpenGapSample $impossible} catch {$rejected=$true}
    if (-not $rejected) {throw 'available_sequence_without_publication_attempt'}

    $normal=$sampleJson | ConvertFrom-Json
    $normal.readerRejected=$false
    $normal.textReturned=$true
    $normal.code='host_capability_unavailable'
    $normal.readerCode='host_observed'
    $normal.evidence.postSequenceStatus='mismatched'
    Assert-ReadOpenGapPair $normal $closed
    if (Test-ReadOpenGapObserved $normal $closed) {throw 'normal_reader_success'}

    $busyJson='{"kind":"sample","evidenceKind":"shared_strategy_native_gap","scopeVerified":true,"readerInvoked":true,"readerRejected":false,"textReturned":false,"overflow":false,"code":"host_clipboard_busy","readerCode":"host_clipboard_busy","evidence":{"firstSequenceStatus":"available","publicationStatus":"succeeded","gapOrderStatus":"verified","publicationSequenceStatus":"changed","readerOpenStatus":"failed","lockedPublicationStatus":"not_attempted","payloadStatus":"not_attempted","readerCopyStatus":"not_attempted","postSequenceStatus":"not_attempted","readCloseStatus":"not_attempted","traceValid":true}}'
    $busy=$busyJson | ConvertFrom-Json
    Assert-ReadOpenGapPair $busy $closed
    $invalidBusy=$busyJson | ConvertFrom-Json
    $invalidBusy.evidence.readerOpenStatus='not_attempted'
    $rejected=$false;try {Assert-ReadOpenGapSample $invalidBusy} catch {$rejected=$true}
    if (-not $rejected) {throw 'busy_without_reader_open'}

    $late=$sampleJson | ConvertFrom-Json
    $late.readerRejected=$false
    $late.code='host_capability_unavailable'
    $late.evidence.traceValid=$false
    foreach ($name in @('firstSequenceStatus','publicationStatus','gapOrderStatus','publicationSequenceStatus','readerOpenStatus','lockedPublicationStatus','payloadStatus','readerCopyStatus','postSequenceStatus','readCloseStatus')) {
        $late.evidence.$name='unknown'
    }
    $lateClosed=$closedJson | ConvertFrom-Json
    $lateClosed.traceValid=$false
    $lateClosed.traceFinalized=$false
    Assert-ReadOpenGapPair $late $lateClosed
    if (Test-ReadOpenGapObserved $late $lateClosed) {throw 'invalid_trace_success'}

    $overflow=$notAttemptedJson | ConvertFrom-Json
    $overflow.overflow=$true
    $overflow.code='host_observation_overflow'
    $overflowClosed=$closedJson | ConvertFrom-Json
    $overflowClosed.overflow=$false
    Assert-ReadOpenGapPair $overflow $overflowClosed
    $overflowLine=Format-ReadOpenGapResult $overflow $overflowClosed $true $true
    if (-not $overflowLine.Contains('overflow=True')) {throw 'overflow_was_erased'}

    $cleanupClosed=$closedJson | ConvertFrom-Json
    $cleanupClosed.fixtureResourcesClosed=$false
    $cleanupClosed.resourcesClosed=$false
    $cleanupClosed.traceFinalized=$false
    $cleanupLine=Format-ReadOpenGapResult $sample $cleanupClosed $true $false
    if (-not $cleanupLine.StartsWith('host_clipboard_read_open_gap_unavailable,',[StringComparison]::Ordinal) -or -not $cleanupLine.Contains('primaryCode=host_cleanup_unavailable')) {throw 'cleanup_priority'}
    $listenerFailed=$closedJson | ConvertFrom-Json
    $listenerFailed.listenerResourcesClosed=$false
    $listenerFailed.resourcesClosed=$false
    $listenerFailureRejected=$false;try {Assert-ReadOpenGapClosed $listenerFailed} catch {$listenerFailureRejected=$true}
    if ($listenerFailureRejected) {throw 'listener_cleanup_frame_rejected'}
    $listenerLine=Format-ReadOpenGapResult $sample $listenerFailed $true $false
    if (-not $listenerLine.Contains('listenerResourcesClosed=False') -or -not $listenerLine.Contains('traceFinalized=True') -or -not $listenerLine.Contains('primaryCode=host_cleanup_unavailable')) {throw 'listener_cleanup_not_preserved'}
    $processLine=Format-ReadOpenGapResult $sample $closed $false $true
    if (-not $processLine.StartsWith('host_clipboard_read_open_gap_unavailable,',[StringComparison]::Ordinal)) {throw 'process_exit_required'}

    $getter=$sampleJson | ConvertFrom-Json
    $getter.PSObject.Properties.Remove('readerRejected')
    # ScriptProperty getter計數器用來確定欄位先驗不會執行getter。
    $getter | Add-Member -MemberType ScriptProperty -Name readerRejected -Value { $script:readOpenGapGetterReads++; return $true } -Force
    $script:readOpenGapGetterReads=0
    $rejected=$false;try { Assert-ReadOpenGapSample $getter } catch {$rejected=$true}
    if (-not $rejected -or $script:readOpenGapGetterReads -ne 0) {throw 'outer_getter'}

    $nestedGetter=$sampleJson | ConvertFrom-Json
    $nestedGetter.evidence.PSObject.Properties.Remove('readerCopyStatus')
    # 巢狀ScriptProperty getter同樣不得在ordinary檢查前被取值。
    $nestedGetter.evidence | Add-Member -MemberType ScriptProperty -Name readerCopyStatus -Value { $script:readOpenGapGetterReads++; return 'succeeded' } -Force
    $script:readOpenGapGetterReads=0
    $rejected=$false;try { Assert-ReadOpenGapSample $nestedGetter } catch {$rejected=$true}
    if (-not $rejected -or $script:readOpenGapGetterReads -ne 0) {throw 'nested_getter'}

    $closedGetter=$closedJson | ConvertFrom-Json
    $closedGetter.PSObject.Properties.Remove('resourcesClosed')
    # closed的ScriptProperty getter不應由pair驗證讀取。
    $closedGetter | Add-Member -MemberType ScriptProperty -Name resourcesClosed -Value { $script:readOpenGapGetterReads++; return $true } -Force
    $script:readOpenGapGetterReads=0
    $rejected=$false;try { Assert-ReadOpenGapClosed $closedGetter } catch {$rejected=$true}
    if (-not $rejected -or $script:readOpenGapGetterReads -ne 0) {throw 'closed_getter'}

    $wrongBoolean=$sampleJson | ConvertFrom-Json
    $wrongBoolean.scopeVerified='True'
    $rejected=$false;try { Assert-ReadOpenGapSample $wrongBoolean } catch {$rejected=$true}
    if (-not $rejected) {throw 'boolean_coercion'}
    $publicError=[Management.Automation.ErrorRecord]::new([Exception]::new('Public error record'),'PublicError',[Management.Automation.ErrorCategory]::NotSpecified,$null)
    $rejected=$false;try { Assert-ReadOpenGapSample $publicError } catch {$rejected=$true}
    if (-not $rejected) {throw 'error_record'}

    foreach ($target in @('sample','evidence','closed')) {
        foreach ($mutation in @('extra','missing','type','enum')) {
            $a=$sampleJson | ConvertFrom-Json;$b=$closedJson | ConvertFrom-Json
            $object=$a;$field='code'
            if ($target -eq 'evidence') {$object=$a.evidence;$field='payloadStatus'}
            if ($target -eq 'closed') {$object=$b;$field='kind'}
            switch ($mutation) {
                'extra' {$object | Add-Member -NotePropertyName unexpected -NotePropertyValue 'Public metadata'}
                'missing' {$object.PSObject.Properties.Remove($field)}
                'type' {$object.$field='true'}
                'enum' {$object.$field='Changed'}
            }
            $rejected=$false
            try {
                if ($target -eq 'sample') {Assert-ReadOpenGapSample $object}
                elseif ($target -eq 'evidence') {Assert-ReadOpenGapSample $a}
                else {Assert-ReadOpenGapClosed $object}
            } catch {$rejected=$true}
            if (-not $rejected) {throw 'malformed_schema'}
        }
    }

    $impossible=$sampleJson | ConvertFrom-Json
    $impossible.readerRejected=$false
    $impossible.code='host_capability_unavailable'
    $impossible.evidence.readerOpenStatus='not_attempted'
    $rejected=$false;try {Assert-ReadOpenGapPair $impossible $closed} catch {$rejected=$true}
    if (-not $rejected) {throw 'copy_without_open'}
    $impossible=$sampleJson | ConvertFrom-Json
    $impossible.readerRejected=$false
    $impossible.code='host_capability_unavailable'
    $impossible.evidence.publicationStatus='failed'
    $rejected=$false;try {Assert-ReadOpenGapPair $impossible $closed} catch {$rejected=$true}
    if (-not $rejected) {throw 'guard_without_publication'}
    $impossible=$sampleJson | ConvertFrom-Json
    $impossible.scopeVerified=$false
    $impossible.code='host_scope_changed'
    $rejected=$false;try {Assert-ReadOpenGapSample $impossible} catch {$rejected=$true}
    if (-not $rejected) {throw 'rejection_without_scope'}
    $impossible=$sampleJson | ConvertFrom-Json
    $impossible.readerRejected=$false
    $impossible.code='host_capability_unavailable'
    $impossible.scopeVerified=$false
    $rejected=$false;try {Assert-ReadOpenGapSample $impossible} catch {$rejected=$true}
    if (-not $rejected) {throw 'scope_primary_code'}
    $impossible=$sampleJson | ConvertFrom-Json
    $impossible.readerRejected=$false
    $impossible.code='host_capability_unavailable'
    $impossible.overflow=$true
    $rejected=$false;try {Assert-ReadOpenGapSample $impossible} catch {$rejected=$true}
    if (-not $rejected) {throw 'overflow_primary_code'}
    $sampleInvalid=$sampleJson | ConvertFrom-Json
    $closedRecovered=$closedJson | ConvertFrom-Json
    $sampleInvalid.evidence.traceValid=$false
    $rejected=$false;try {Assert-ReadOpenGapPair $sampleInvalid $closedRecovered} catch {$rejected=$true}
    if (-not $rejected) {throw 'trace_recovered'}

    for ($bits=0;$bits -lt 16;$bits++) {
        $mode=(Test-ReadOpenGapMode (($bits -band 8) -ne 0) (($bits -band 4) -ne 0) (($bits -band 2) -ne 0) (($bits -band 1) -ne 0))
        $want=$bits -in @(2,12,13)
        if ($mode -ne $want) {throw 'mode'}
    }
    $stages=@('compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','scope_before','observe','scope_after','classify','stop_command','native_close','closed_write')
    foreach ($stage in $stages) {
        $mapped=Read-ReadOpenGapFailureStage ([pscustomobject]@{kind='failed';stage=$stage})
        if ($mapped -cne ('child_'+$stage)) {throw 'failure_stage'}
    }
    $rejected=$false;try {[void](Read-ReadOpenGapFailureStage ([pscustomobject]@{kind='failed';stage='Public unknown'}))} catch {$rejected=$true}
    if (-not $rejected) {throw 'unknown_failure_stage'}

    $ready=[pscustomobject][ordered]@{kind='ready'}
    [byte[]]$frame=Convert-ReadOpenGapFrameBytes $ready
    $stream=[IO.MemoryStream]::new($frame)
    try {
        $received=Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000
        if ($received -cne '{"kind":"ready"}') {throw 'frame_literal'}
    } finally {$stream.Dispose();[Array]::Clear($frame,0,$frame.Length)}
    [byte[]]$oversized=New-Object byte[] 8193
    for ($index=0;$index -lt 8192;$index++) {$oversized[$index]=65}
    $oversized[8192]=10
    $stream=[IO.MemoryStream]::new($oversized);$rejected=$false
    try {try {[void](Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000)} catch {$rejected=$true}}
    finally {$stream.Dispose();[Array]::Clear($oversized,0,$oversized.Length)}
    if (-not $rejected) {throw 'oversized_frame'}
    $invalidUtf8=[byte[]]@(255,10)
    $stream=[IO.MemoryStream]::new($invalidUtf8);$rejected=$false
    try {try {[void](Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000)} catch {$rejected=$true}}
    finally {$stream.Dispose();[Array]::Clear($invalidUtf8,0,$invalidUtf8.Length)}
    if (-not $rejected) {throw 'invalid_utf8_frame'}

    $line=Format-ReadOpenGapResult $sample $closed $true $true
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 4096 -or $line -notmatch '^host_clipboard_read_open_gap_observed,') {throw 'bounded_result'}

    $lateOverflowClosed=$closedJson | ConvertFrom-Json
    $lateOverflowClosed.overflow=$true
    $overflowPriority=Format-ReadOpenGapResult $sample $lateOverflowClosed $true $true
    if (-not $overflowPriority.Contains('primaryCode=host_observation_overflow')) {throw 'late_overflow_primary'}
    $invalidTraceClosed=$closedJson | ConvertFrom-Json
    $invalidTraceClosed.traceValid=$false
    $invalidTraceClosed.traceFinalized=$false
    $tracePriority=Format-ReadOpenGapResult $sample $invalidTraceClosed $true $true
    if (-not $tracePriority.Contains('primaryCode=host_capability_unavailable')) {throw 'final_trace_primary'}
    $unfinalizedClosed=$closedJson | ConvertFrom-Json
    $unfinalizedClosed.traceFinalized=$false
    $unfinalizedPriority=Format-ReadOpenGapResult $sample $unfinalizedClosed $true $true
    if (-not $unfinalizedPriority.Contains('primaryCode=host_capability_unavailable')) {throw 'unfinalized_trace_primary'}
}

# selftest完成後才在單一STA child建立C# listener與校準fixture。
try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or
        $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or
        (Get-ExecutionPolicy) -ne 'RemoteSigned' -or (Get-ExecutionPolicy -Scope Process) -ne 'RemoteSigned') {throw 'host_capability_unavailable'}
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $script:sid=$identity.User
        $principal=[Security.Principal.WindowsPrincipal]::new($identity)
        if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {throw 'host_capability_unavailable'}
    } finally {$identity.Dispose()}

    $phase='flags'
    if (-not (Test-ReadOpenGapMode ([bool]$ReadOpenGap) ([bool]$AllowClipboardOverwrite) ([bool]$DiagnosticSelfTest) ([bool]$Child)) -or
        $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or
        $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) {throw 'host_capability_unavailable'}

    $phase='source'
    Assert-ReadOpenGapSource $PSScriptRoot $true
    Assert-ReadOpenGapSource $PSCommandPath $false
    $supervisorSource=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometrySource=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCoreSource=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $editorReaderSource=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $coreSource=Join-Path $PSScriptRoot 'windows-clipboard-read-open-gap-core.cs'
    $fixtureSource=Join-Path $PSScriptRoot 'windows-clipboard-read-open-gap-fixture.cs'
    foreach ($path in @($supervisorSource,$nativeSource,$geometrySource,$editorCoreSource,$editorReaderSource,$coreSource,$fixtureSource)) {
        Assert-ReadOpenGapSource $path $false
    }
    . $supervisorSource

    if ($DiagnosticSelfTest) {
        $phase='flags'
        Test-ReadOpenGapSchema
        [Console]::WriteLine('host_clipboard_read_open_gap_schema_observed,liveClipboardQueries=false,clipboardWritten=false')
        exit 0
    }

    if ($Child) {
        $childFailureStage=$null;$sampleSent=$false;$stopCommandReceived=$false
        $fixtureResourcesClosed=$false;$listenerResourcesClosed=$false;$closedOverflow=$false
        $traceFinalized=$false;$finalTraceValid=$false;$childClosed=$null
        $frame=$null;$row=$null;$capture=$null;$readerValue=$null
        try {
            $phase='compile'
            $null=Add-Type -LiteralPath @($nativeSource,$geometrySource,$editorCoreSource,$coreSource,$fixtureSource) -ErrorAction Stop
            $null=Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop

            $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
            $phase='session_setup'
            $current=[Diagnostics.Process]::GetCurrentProcess()
            try {$script:sessionId=$current.SessionId} finally {$current.Dispose()}
            . $editorReaderSource
            $editor=@{x=$X;y=$Y;width=$Width;height=$Height}
            $script:editorIdentity=$null;$script:editorPid=0
            $phase='bind_scope';[void](Get-HostEditorPattern $editor)

            $phase='listener';$native=[HostObserverNative]::new()
            if (-not $native.Ready) {throw 'host_capability_unavailable'}
            $phase='fixture_setup';$fixture=[HostReadOpenGapWindows]::StartWindows()
            if (-not $fixture.Ready) {throw 'host_capability_unavailable'}

            $phase='ready_write'
            try {Write-ReadOpenGapFrame ([pscustomobject][ordered]@{kind='ready'})}
            catch {$script:readOpenGapFrameWriteFailed=$true;throw}

            $phase='sample_command'
            if ([Console]::In.ReadLine() -cne 'sample') {throw 'host_capability_unavailable'}
            $scopeBeforeVerified=$true
            $phase='scope_before'
            try {[void](Get-HostEditorPattern $editor)} catch {$scopeBeforeVerified=$false}
            $overflowBefore=[bool]$native.Overflow
            $scopeVerified=$scopeBeforeVerified
            $overflow=$overflowBefore

            try {
                if ($scopeBeforeVerified -and -not $overflowBefore) {
                    $phase='observe';$readerValue=$fixture.Observe($script:editorPid)
                    $scopeAfterVerified=$true
                    $phase='scope_after'
                    try {[void](Get-HostEditorPattern $editor)} catch {$scopeAfterVerified=$false}
                    $scopeVerified=$scopeBeforeVerified -and $scopeAfterVerified
                    foreach ($notice in $native.Drain()) {}
                    $overflow=[bool]$native.Overflow
                    $phase='classify';$capture=$fixture.CaptureSample()
                } else {
                    $phase='classify'
                    foreach ($notice in $native.Drain()) {}
                    $overflow=[bool]$native.Overflow
                    $capture=New-ReadOpenGapUnobservedCapture
                }
                $row=[HostReadOpenGapCalibration]::Classify($capture,$readerValue,$scopeVerified,$overflow)
                $sourceEvidence=$row.Evidence
                if ($null -eq $sourceEvidence) {$sourceEvidence=$capture.Evidence}
                $frame=[pscustomobject][ordered]@{
                    kind='sample'
                    evidenceKind='shared_strategy_native_gap'
                    scopeVerified=[bool]$row.ScopeVerified
                    readerInvoked=[bool]$row.ReaderInvoked
                    readerRejected=[bool]$row.ReaderRejected
                    textReturned=[bool]$row.TextReturned
                    overflow=[bool]$row.Overflow
                    code=$row.Code
                    readerCode=$row.ReaderCode
                    evidence=[pscustomobject][ordered]@{
                        firstSequenceStatus=$sourceEvidence.FirstSequenceStatus
                        publicationStatus=$sourceEvidence.PublicationStatus
                        gapOrderStatus=$sourceEvidence.GapOrderStatus
                        publicationSequenceStatus=$sourceEvidence.PublicationSequenceStatus
                        readerOpenStatus=$sourceEvidence.ReaderOpenStatus
                        lockedPublicationStatus=$sourceEvidence.LockedPublicationStatus
                        payloadStatus=$sourceEvidence.PayloadStatus
                        readerCopyStatus=$sourceEvidence.ReaderCopyStatus
                        postSequenceStatus=$sourceEvidence.PostSequenceStatus
                        readCloseStatus=$sourceEvidence.ReadCloseStatus
                        traceValid=[bool]$sourceEvidence.TraceValid
                    }
                }
                Assert-ReadOpenGapSample $frame
                $phase='classify'
                try {Write-ReadOpenGapFrame $frame;$sampleSent=$true}
                catch {$script:readOpenGapFrameWriteFailed=$true;throw}
            } finally {
                if ($null -ne $readerValue) {$readerValue.Text=$null}
                $readerValue=$null;$capture=$null;$row=$null;$sourceEvidence=$null
            }

            $phase='stop_command'
            if ([Console]::In.ReadLine() -cne 'stop') {throw 'host_capability_unavailable'}
            $stopCommandReceived=$true
        } catch {
            $childFailureStage=$phase
        } finally {
            $phase='native_close'
            if ($null -ne $fixture) {
                try {$fixtureResourcesClosed=$fixture.Stop()} catch {$fixtureResourcesClosed=$false}
                try {
                    $finalTrace=$fixture.GetFinalTrace()
                    $traceFinalized=[bool]$finalTrace.TraceFinalized
                    $finalTraceValid=[bool]$finalTrace.TraceValid
                } catch {$traceFinalized=$false;$finalTraceValid=$false}
                $fixture=$null
            }
            if ($null -ne $native) {
                try {$listenerResourcesClosed=$native.Stop()} catch {$listenerResourcesClosed=$false}
                try {
                    foreach ($notice in $native.Drain()) {}
                    $closedOverflow=[bool]$native.Overflow
                } catch {$closedOverflow=$true}
                $native=$null
            }
            if ($null -eq $childFailureStage -and $sampleSent -and $stopCommandReceived -and -not $script:readOpenGapFrameWriteFailed) {
                $phase='closed_write'
                $resourcesClosed=[bool]($fixtureResourcesClosed -and $listenerResourcesClosed)
                $childClosed=[pscustomobject][ordered]@{
                    kind='closed'
                    fixtureResourcesClosed=[bool]$fixtureResourcesClosed
                    listenerResourcesClosed=[bool]$listenerResourcesClosed
                    overflow=[bool]($overflow -or $closedOverflow)
                    resourcesClosed=$resourcesClosed
                    traceFinalized=[bool]$traceFinalized
                    traceValid=[bool]$finalTraceValid
                }
                try {Write-ReadOpenGapFrame $childClosed}
                catch {$script:readOpenGapFrameWriteFailed=$true;$childFailureStage='closed_write'}
            }
        }

        if ($null -ne $childFailureStage) {
            $childAllowedStages=@('compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','scope_before','observe','scope_after','classify','stop_command','native_close','closed_write')
            if (-not $script:readOpenGapFrameWriteFailed -and $childAllowedStages -ccontains $childFailureStage) {
                try {Write-ReadOpenGapFrame ([pscustomobject][ordered]@{kind='failed';stage=$childFailureStage})} catch {}
            }
            exit 2
        }
        if ($null -eq $childClosed -or -not $childClosed.resourcesClosed) {exit 2}
        exit 0
    }

    $phase='startup';$info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -ReadOpenGap -AllowClipboardOverwrite -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $readyLine=Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000
    $ready=$readyLine | ConvertFrom-Json;$readyLine=$null
    if ($ready.kind -ceq 'failed') {$phase=Read-ReadOpenGapFailureStage $ready;throw 'host_capability_unavailable'}
    Assert-HostFields $ready @('kind')
    if ($ready.kind -isnot [string] -or $ready.kind -cne 'ready' -or $owned.Startup.ElapsedMilliseconds -ge 5000) {throw 'host_capability_unavailable'}

    $query=[Diagnostics.Stopwatch]::StartNew()
    $phase='query_write';$changeState='unknown'
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply'
    $reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_schema';$wireSample=$reply | ConvertFrom-Json;$reply=$null
    if ($wireSample.kind -ceq 'failed') {$phase=Read-ReadOpenGapFailureStage $wireSample;throw 'host_capability_unavailable'}
    $sample=$wireSample;$wireSample=$null
    Assert-ReadOpenGapSample $sample
    if ($query.ElapsedMilliseconds -ge 1000) {throw 'host_query_timeout'}
    if ($sample.evidence.publicationStatus -ceq 'succeeded') {$changeState='published'}

    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $closedLine=Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000
    $wireClosed=$closedLine | ConvertFrom-Json;$closedLine=$null
    if ($wireClosed.kind -ceq 'failed') {$phase=Read-ReadOpenGapFailureStage $wireClosed;throw 'host_capability_unavailable'}
    $closed=$wireClosed;$wireClosed=$null
    Assert-ReadOpenGapClosed $closed
    $nativeClosed=[bool]$closed.resourcesClosed
    $cleanup=Stop-HostOwnedProcess $owned $nativeClosed $shutdown;$owned=$null
    if ($shutdown.ElapsedMilliseconds -ge 2000) {throw 'host_cleanup_unavailable'}
    $phase='result'
    $resultLine=Format-ReadOpenGapResult $sample $closed ([bool]$cleanup.ProcessExited) ([bool]$cleanup.ResourcesClosed)
    [Console]::WriteLine($resultLine)
    $observed=Test-ReadOpenGapObserved $sample $closed
    if (-not $observed -or -not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed) {exit 2}
    exit 0
} catch {
    if ($DiagnosticSelfTest) {
        [Console]::WriteLine('host_clipboard_read_open_gap_schema_unavailable,stage=schema')
        exit 2
    }
    if ($Child) {
        $childStages=@('compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','scope_before','observe','scope_after','classify','stop_command','native_close','closed_write')
        if (-not $script:readOpenGapFrameWriteFailed -and $childStages -ccontains $phase) {
            try {Write-ReadOpenGapFrame ([pscustomobject][ordered]@{kind='failed';stage=$phase})} catch {}
        }
        exit 2
    }
    if ($null -ne $owned) {
        if ($null -eq $shutdown) {$shutdown=[Diagnostics.Stopwatch]::StartNew()}
        try {$cleanup=Stop-HostOwnedProcess $owned $nativeClosed $shutdown} catch {$cleanup=$null} finally {$owned=$null}
    }
    $processExited='unknown'
    if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) {$processExited=$cleanup.ProcessExited.ToString()}
    [Console]::WriteLine((Format-ReadOpenGapFailure $phase $changeState $processExited))
    exit 2
} finally {
    if ($null -ne $fixture) {try {[void]$fixture.Stop()} catch {}}
    if ($null -ne $native) {try {[void]$native.Stop()} catch {}}
    if ($null -ne $owned) {
        if ($null -eq $shutdown) {$shutdown=[Diagnostics.Stopwatch]::StartNew()}
        [void](Stop-HostOwnedProcess $owned $nativeClosed $shutdown)
    }
}
