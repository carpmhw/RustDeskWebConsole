param([switch]$ReadRaceDiagnostic,[switch]$AllowClipboardOverwrite,[switch]$DiagnosticSelfTest,[switch]$Child,
      [int]$X=-1,[int]$Y=-1,[int]$Width=-1,[int]$Height=-1)
# 獨立診斷：未具完整契約與雙opt-in以前不得碰原生。
$ErrorActionPreference='Stop'
$VerbosePreference=$DebugPreference=$WarningPreference=$InformationPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$owned=$null;$native=$null;$fixture=$null;$shutdown=$null;$cleanup=$null;$phase='policy';$changeState='not_requested'
# mode只接受self或native雙opt-in，不靠預設寬放。
function Test-ReadRaceDiagnosticMode([bool]$Diagnostic,[bool]$Allow,[bool]$Self,[bool]$IsChild) {
    if ($Self) {return (-not $Diagnostic -and -not $Allow -and -not $IsChild)}
    return ($Diagnostic -and $Allow)
}
# outer及nested ordinary欄位先核對，getter不得參與驗證。
function Assert-ReadRaceDiagnosticSample($Value) {
    Assert-HostFields $Value @('kind','scopeVerified','registrationVerified','renderVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow','code','diagnostic')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'sample' -or $Value.code -isnot [string]) {throw 'guard'}
    foreach ($name in @('scopeVerified','registrationVerified','renderVerified','ownerVersionMatched','readerRejected','textReturned','readResourcesClosed','overflow')) {
        if ($Value.$name -isnot [bool]) {throw 'guard'}
    }
    $codes=@('host_observed','host_capability_unavailable','host_cleanup_unavailable','host_scope_changed','host_observation_overflow','host_clipboard_unstable','host_text_too_large','host_clipboard_busy','host_clipboard_format_unavailable','host_text_invalid','host_text_unreadable')
    if ($codes -cnotcontains $Value.code) {throw 'guard'}
    if (($Value.renderVerified -or $Value.ownerVersionMatched) -and -not $Value.registrationVerified) {throw 'guard'}
    if ($Value.readerRejected -and (-not $Value.scopeVerified -or -not $Value.registrationVerified -or -not $Value.renderVerified -or -not $Value.ownerVersionMatched -or $Value.textReturned -or -not $Value.readResourcesClosed -or $Value.overflow -or $Value.code -cne 'host_clipboard_unstable')) {throw 'guard'}
    $d=$Value.diagnostic
    Assert-HostFields $d @('renderSeen','requestExactlyOnce','deliveryStatus','sequenceStatus','failureObserved','firstRenderPhase','multipleRenderPhases','evidenceConsistent','traceValid','readerCode')
    foreach ($name in @('renderSeen','requestExactlyOnce','deliveryStatus','sequenceStatus','failureObserved','firstRenderPhase','multipleRenderPhases','readerCode')) {
        if ($d.$name -isnot [string]) {throw 'guard'}
    }
    if ($d.evidenceConsistent -isnot [bool] -or $d.traceValid -isnot [bool]) {throw 'guard'}
    foreach ($name in @('renderSeen','requestExactlyOnce','failureObserved','multipleRenderPhases')) {if (@('yes','no','unknown') -cnotcontains $d.$name) {throw 'guard'}}
    if (@('succeeded','failed','not_attempted','unknown') -cnotcontains $d.deliveryStatus -or @('changed','unchanged','unknown') -cnotcontains $d.sequenceStatus) {throw 'guard'}
    if (@('none','registration','before_reader','reader_bracket','after_reader','unknown') -cnotcontains $d.firstRenderPhase) {throw 'guard'}
    $readerCodes=@('unknown','host_observed','host_capability_unavailable','host_cleanup_unavailable','host_clipboard_unstable','host_clipboard_busy','host_clipboard_format_unavailable','host_text_too_large','host_text_invalid','host_text_unreadable')
    if ($readerCodes -cnotcontains $d.readerCode) {throw 'guard'}
    if ($d.firstRenderPhase -ceq 'unknown' -and $d.traceValid) {throw 'guard'}
    if ($d.deliveryStatus -ceq 'succeeded' -and $d.renderSeen -cne 'yes') {throw 'guard'}
    if ($d.deliveryStatus -ceq 'failed' -and ($d.renderSeen -cne 'yes' -or $d.failureObserved -ceq 'no')) {throw 'guard'}
    if ($d.deliveryStatus -ceq 'succeeded' -and $d.failureObserved -ceq 'yes' -and $d.sequenceStatus -cne 'unknown') {throw 'guard'}
    if ($d.firstRenderPhase -ceq 'none' -and ($d.renderSeen -cne 'no' -or $d.requestExactlyOnce -cne 'no' -or $d.multipleRenderPhases -cne 'no')) {throw 'guard'}
    if ($d.renderSeen -ceq 'no' -and ($d.firstRenderPhase -cne 'none' -or $d.deliveryStatus -cne 'not_attempted')) {throw 'guard'}
    if ($d.requestExactlyOnce -ceq 'yes' -and ($d.renderSeen -cne 'yes' -or $d.firstRenderPhase -ceq 'none' -or $d.multipleRenderPhases -ceq 'yes')) {throw 'guard'}
    $renderTrue=$d.requestExactlyOnce -ceq 'yes' -and $d.deliveryStatus -ceq 'succeeded' -and $d.sequenceStatus -ceq 'changed' -and $d.failureObserved -ceq 'no'
    $renderFalse=$d.requestExactlyOnce -ceq 'no' -or $d.deliveryStatus -in @('failed','not_attempted') -or $d.sequenceStatus -ceq 'unchanged' -or $d.failureObserved -ceq 'yes'
    if (($renderTrue -and $Value.registrationVerified -and -not $Value.renderVerified) -or ($renderFalse -and $Value.renderVerified)) {throw 'guard'}
    if (($d.readerCode -ceq 'host_observed' -and -not $Value.textReturned) -or ($Value.textReturned -and ($d.readerCode -cne 'host_observed' -or -not $Value.readResourcesClosed))) {throw 'guard'}
    if ($Value.readerRejected -and $d.readerCode -cne 'host_clipboard_unstable') {throw 'guard'}
}
# final只保留metadata，正常thread退出不替代各native資源收尾。
function Assert-ReadRaceDiagnosticClosed($Value) {
    Assert-HostFields $Value @('kind','fixtureResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed','diagnostic')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'closed') {throw 'guard'}
    foreach ($name in @('fixtureResourcesClosed','listenerResourcesClosed','overflow','resourcesClosed')) {if ($Value.$name -isnot [bool]) {throw 'guard'}}
    if ($Value.resourcesClosed -ne ($Value.fixtureResourcesClosed -and $Value.listenerResourcesClosed)) {throw 'guard'}
    $d=$Value.diagnostic
    Assert-HostFields $d @('traceFinalized','lateRender','firstRenderPhase','multipleRenderPhases','traceValid')
    foreach ($name in @('traceFinalized','lateRender','traceValid')) {if ($d.$name -isnot [bool]) {throw 'guard'}}
    if ($d.firstRenderPhase -isnot [string] -or $d.multipleRenderPhases -isnot [string]) {throw 'guard'}
    if (@('none','registration','before_reader','reader_bracket','after_reader','closing','unknown') -cnotcontains $d.firstRenderPhase -or @('yes','no','unknown') -cnotcontains $d.multipleRenderPhases) {throw 'guard'}
    if ($d.firstRenderPhase -ceq 'unknown' -and $d.traceValid) {throw 'guard'}
    if ($d.firstRenderPhase -ceq 'none' -and ($d.multipleRenderPhases -cne 'no' -or $d.lateRender)) {throw 'guard'}
}
# 晚事件允許none變具體phase，但不允許早期失效被沖掉。
function Assert-ReadRaceDiagnosticPair($Sample,$Closed) {
    Assert-ReadRaceDiagnosticSample $Sample;Assert-ReadRaceDiagnosticClosed $Closed
    $a=$Sample.diagnostic;$b=$Closed.diagnostic
    if ($Sample.overflow -and -not $Closed.overflow) {throw 'guard'}
    if (-not $a.traceValid -and $b.traceValid) {throw 'guard'}
    if ($a.multipleRenderPhases -ceq 'yes' -and $b.multipleRenderPhases -ceq 'no') {throw 'guard'}
    if ($a.firstRenderPhase -ceq 'unknown' -and $b.firstRenderPhase -cne 'unknown') {throw 'guard'}
    if ($a.firstRenderPhase -cnotin @('none','unknown') -and $b.firstRenderPhase -cne 'unknown' -and $a.firstRenderPhase -cne $b.firstRenderPhase) {throw 'guard'}
    if ($a.firstRenderPhase -ceq 'none' -and $b.firstRenderPhase -cnotin @('none','unknown') -and -not $b.lateRender) {throw 'guard'}
    if ($a.multipleRenderPhases -ceq 'no' -and $b.multipleRenderPhases -ceq 'yes' -and -not $b.lateRender) {throw 'guard'}
}
# 原predicate原義不受診斷完整度或未知狀態改寫。
function Test-ReadRaceDiagnosticLegacy($Sample,$Closed) {
    Assert-ReadRaceDiagnosticPair $Sample $Closed
    return ($Sample.readerRejected -and $Sample.scopeVerified -and $Sample.registrationVerified -and $Sample.renderVerified -and $Sample.ownerVersionMatched -and -not $Sample.textReturned -and $Sample.readResourcesClosed -and -not $Sample.overflow -and -not $Closed.overflow -and $Closed.resourcesClosed -and $Sample.code -ceq 'host_clipboard_unstable')
}
# 完整負向資料可以診斷完成，但未知／late／cleanup不可成功。
function Test-ReadRaceDiagnosticComplete($Sample,$Closed) {
    Assert-ReadRaceDiagnosticPair $Sample $Closed
    $a=$Sample.diagnostic;$b=$Closed.diagnostic
    foreach ($name in @('renderSeen','requestExactlyOnce','deliveryStatus','sequenceStatus','failureObserved','firstRenderPhase','multipleRenderPhases','readerCode')) {if ($a.$name -ceq 'unknown') {return $false}}
    return ($Sample.scopeVerified -and $Sample.registrationVerified -and $Sample.ownerVersionMatched -and $Sample.readResourcesClosed -and -not $Sample.overflow -and -not $Closed.overflow -and $Closed.resourcesClosed -and $a.traceValid -and $a.evidenceConsistent -and $b.traceValid -and $b.traceFinalized -and -not $b.lateRender -and $a.firstRenderPhase -ceq $b.firstRenderPhase -and $a.multipleRenderPhases -ceq $b.multipleRenderPhases)
}
# 僅格式化已驗普通值，輸出名稱與順序固定，不寫console或反射未知字串。
function Format-ReadRaceDiagnosticResult($Sample,$Closed,[bool]$ProcessExited,[bool]$ResourcesClosed) {
    $complete=Test-ReadRaceDiagnosticComplete $Sample $Closed
    $legacy=Test-ReadRaceDiagnosticLegacy $Sample $Closed
    $marker='host_clipboard_read_race_diagnostic_unavailable';if ($complete -and $ProcessExited -and $ResourcesClosed) {$marker='host_clipboard_read_race_diagnostic_observed'}
    $a=$Sample.diagnostic;$b=$Closed.diagnostic
    $pairs=[ordered]@{scopeVerified=$Sample.scopeVerified;registrationVerified=$Sample.registrationVerified;renderVerified=$Sample.renderVerified;ownerVersionMatched=$Sample.ownerVersionMatched;readerRejected=$Sample.readerRejected;textReturned=$Sample.textReturned;readResourcesClosed=$Sample.readResourcesClosed;fixtureResourcesClosed=$Closed.fixtureResourcesClosed;listenerResourcesClosed=$Closed.listenerResourcesClosed;overflow=($Sample.overflow -or $Closed.overflow);resourcesClosed=$ResourcesClosed;processExited=$ProcessExited;primaryCode=$Sample.code;renderSeen=$a.renderSeen;requestExactlyOnce=$a.requestExactlyOnce;deliveryStatus=$a.deliveryStatus;sequenceStatus=$a.sequenceStatus;failureObserved=$a.failureObserved;firstRenderPhase=$a.firstRenderPhase;multipleRenderPhases=$a.multipleRenderPhases;evidenceConsistent=$a.evidenceConsistent;traceValid=$a.traceValid;readerCode=$a.readerCode;traceFinalized=$b.traceFinalized;lateRender=$b.lateRender;finalFirstRenderPhase=$b.firstRenderPhase;finalMultipleRenderPhases=$b.multipleRenderPhases;finalTraceValid=$b.traceValid;legacyPredicateMatched=$legacy}
    $line=$marker+',case=ReadRaceDiagnostic'
    foreach ($name in $pairs.Keys) {$line+=','+$name+'='+[string]$pairs[$name]}
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 4096) {throw 'guard'}
    return $line
}
# Child只接受19個安全stage，未知不反射。
function Read-ReadRaceDiagnosticFailureStage($Value) {
    Assert-HostFields $Value @('kind','stage')
    $allowed=@('policy','flags','source','compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','register','scope_before','reader','scope_after','classify','stop_command','native_close','closed_write')
    if ($Value.kind -isnot [string] -or $Value.kind -cne 'failed' -or $Value.stage -isnot [string] -or $allowed -cnotcontains $Value.stage) {throw 'guard'}
    return ('child_'+$Value.stage)
}
# 只驗owner-only本機NTFS／non-reparse來源，不修ACL／policy或解除封鎖。
function Assert-ReadRaceDiagnosticSource([string]$Path,[bool]$Directory) {
    $full=[IO.Path]::GetFullPath($Path);$root=[IO.Path]::GetPathRoot($full)
    if ($root.StartsWith('\',[StringComparison]::Ordinal)) {throw 'guard'}
    $drive=[IO.DriveInfo]::new($root)
    if ($drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -cne 'NTFS') {throw 'guard'}
    $item=Get-Item -LiteralPath $full -Force
    if ($item.PSIsContainer -ne $Directory -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {throw 'guard'}
    $acl=Get-Acl -LiteralPath $full
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $script:sid -or ($Directory -and -not $acl.AreAccessRulesProtected)) {throw 'guard'}
    foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference -ne $script:sid) {throw 'guard'}
    }
    $parent=$item.Directory;if ($Directory) {$parent=$item.Parent}
    while ($null -ne $parent) {if (($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {throw 'guard'};$parent=$parent.Parent}
}
# 僅輸出自行建立的有界metadata，從不序列化native或reader物件。
function Write-ReadRaceDiagnosticFrame($Value) {
    $line=$Value | ConvertTo-Json -Depth 4 -Compress
    if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 8191) {throw 'guard'}
    [Console]::Out.Write($line+"`n");[Console]::Out.Flush()
}
# 先手寫literal與完整期望，不能借受測formatter產生oracle。
function Test-ReadRaceDiagnosticSchema {
    $sampleLiteral='{"kind":"sample","scopeVerified":true,"registrationVerified":true,"renderVerified":false,"ownerVersionMatched":true,"readerRejected":false,"textReturned":true,"readResourcesClosed":true,"overflow":false,"code":"host_capability_unavailable","diagnostic":{"renderSeen":"yes","requestExactlyOnce":"yes","deliveryStatus":"succeeded","sequenceStatus":"unchanged","failureObserved":"no","firstRenderPhase":"reader_bracket","multipleRenderPhases":"no","evidenceConsistent":true,"traceValid":true,"readerCode":"host_observed"}}'
    $closedLiteral='{"kind":"closed","fixtureResourcesClosed":true,"listenerResourcesClosed":true,"overflow":false,"resourcesClosed":true,"diagnostic":{"traceFinalized":true,"lateRender":false,"firstRenderPhase":"reader_bracket","multipleRenderPhases":"no","traceValid":true}}'
    $sample=$sampleLiteral | ConvertFrom-Json;$closed=$closedLiteral | ConvertFrom-Json
    if (-not (Test-ReadRaceDiagnosticComplete $sample $closed) -or (Test-ReadRaceDiagnosticLegacy $sample $closed)) { throw 'literal' }
    $expected='host_clipboard_read_race_diagnostic_observed,case=ReadRaceDiagnostic,scopeVerified=True,registrationVerified=True,renderVerified=False,ownerVersionMatched=True,readerRejected=False,textReturned=True,readResourcesClosed=True,fixtureResourcesClosed=True,listenerResourcesClosed=True,overflow=False,resourcesClosed=True,processExited=True,primaryCode=host_capability_unavailable,renderSeen=yes,requestExactlyOnce=yes,deliveryStatus=succeeded,sequenceStatus=unchanged,failureObserved=no,firstRenderPhase=reader_bracket,multipleRenderPhases=no,evidenceConsistent=True,traceValid=True,readerCode=host_observed,traceFinalized=True,lateRender=False,finalFirstRenderPhase=reader_bracket,finalMultipleRenderPhases=no,finalTraceValid=True,legacyPredicateMatched=False'
    if ((Format-ReadRaceDiagnosticResult $sample $closed $true $true) -cne $expected) { throw 'formatter' }
    foreach ($which in @('process','resources')) {
        $line=Format-ReadRaceDiagnosticResult $sample $closed ($which -cne 'process') ($which -cne 'resources')
        if (-not $line.StartsWith('host_clipboard_read_race_diagnostic_unavailable,',[StringComparison]::Ordinal)) { throw 'cleanup' }
    }
    $sample.renderVerified=$true;$sample.readerRejected=$true;$sample.textReturned=$false;$sample.code='host_clipboard_unstable'
    $sample.diagnostic.sequenceStatus='changed';$sample.diagnostic.readerCode='host_clipboard_unstable'
    if (-not (Test-ReadRaceDiagnosticComplete $sample $closed) -or -not (Test-ReadRaceDiagnosticLegacy $sample $closed)) { throw 'legacy' }
    foreach ($name in @('renderSeen','requestExactlyOnce','deliveryStatus','sequenceStatus','failureObserved','firstRenderPhase','multipleRenderPhases','readerCode')) {
        $value=$sampleLiteral | ConvertFrom-Json;$value.diagnostic.$name='unknown';$observed=$false
        try { $observed=Test-ReadRaceDiagnosticComplete $value $closed } catch {}
        if ($observed) { throw 'unknown' }
    }
    $value=$sampleLiteral | ConvertFrom-Json;$value.diagnostic.sequenceStatus='unknown';$value.diagnostic.failureObserved='yes'
    Assert-ReadRaceDiagnosticSample $value
    if (Test-ReadRaceDiagnosticComplete $value $closed) { throw 'delivery_then_sequence_failure' }
    $none=$sampleLiteral | ConvertFrom-Json;$none.diagnostic.renderSeen='no';$none.diagnostic.requestExactlyOnce='no';$none.diagnostic.deliveryStatus='not_attempted';$none.diagnostic.firstRenderPhase='none'
    $noneClosed=$closedLiteral | ConvertFrom-Json;$noneClosed.diagnostic.firstRenderPhase='none'
    if (-not (Test-ReadRaceDiagnosticComplete $none $noneClosed)) { throw 'not_attempted' }
    $late=$closedLiteral | ConvertFrom-Json;$late.diagnostic.firstRenderPhase='closing';$late.diagnostic.lateRender=$true
    Assert-ReadRaceDiagnosticPair $none $late
    if (Test-ReadRaceDiagnosticComplete $none $late) { throw 'late' }
    foreach ($mutation in @('late','overflow','trace','phase','multiple')) {
        $a=$sampleLiteral | ConvertFrom-Json;$b=$closedLiteral | ConvertFrom-Json
        switch ($mutation) {
            'late' { $a=$none;$b=$late | ConvertTo-Json -Depth 4 | ConvertFrom-Json;$b.diagnostic.lateRender=$false }
            'overflow' { $a.overflow=$true }
            'trace' { $a.diagnostic.traceValid=$false }
            'phase' { $b.diagnostic.firstRenderPhase='before_reader' }
            'multiple' { $a.diagnostic.multipleRenderPhases='yes';$a.diagnostic.requestExactlyOnce='no' }
        }
        $rejected=$false;try { Assert-ReadRaceDiagnosticPair $a $b } catch { $rejected=$true }
        if (-not $rejected) { throw 'pair_contradiction' }
    }
    foreach ($target in @('sample','sample_diagnostic','closed','closed_diagnostic')) {
        foreach ($mutation in @('extra','missing','getter','type','enum','record')) {
            $a=$sampleLiteral | ConvertFrom-Json;$b=$closedLiteral | ConvertFrom-Json
            $object=$a;$field='code'
            switch ($target) {
                'sample_diagnostic' { $object=$a.diagnostic;$field='deliveryStatus' }
                'closed' { $object=$b;$field='kind' }
                'closed_diagnostic' { $object=$b.diagnostic;$field='firstRenderPhase' }
            }
            $script:readRaceDiagnosticGetterRead=$false
            switch ($mutation) {
                'extra' { $object | Add-Member -NotePropertyName publicExtra -NotePropertyValue 'Public metadata' }
                'missing' { $object.PSObject.Properties.Remove($field) }
                'getter' {
                    $object.PSObject.Properties.Remove($field)
                    # ordinary欄位驗完之前不得呼叫任何getter。
                    $object | Add-Member -MemberType ScriptProperty -Name $field -Value { $script:readRaceDiagnosticGetterRead=$true;return 'Public metadata' }
                }
                'type' { $object.$field=$true }
                'enum' { $object.$field='Public unknown' }
                'record' {
                    $errorValue=[Management.Automation.ErrorRecord]::new([InvalidOperationException]::new('Public metadata'),'Public',[Management.Automation.ErrorCategory]::NotSpecified,$null)
                    switch ($target) { 'sample' {$a=$errorValue} 'sample_diagnostic' {$a.diagnostic=$errorValue} 'closed' {$b=$errorValue} 'closed_diagnostic' {$b.diagnostic=$errorValue} }
                }
            }
            $rejected=$false;try { Assert-ReadRaceDiagnosticPair $a $b } catch { $rejected=$true }
            if (-not $rejected -or $script:readRaceDiagnosticGetterRead) { throw 'ordinary' }
        }
    }
    foreach ($mutation in @('bool','reader','render','seen','case','finalized','closed_resources','consistent')) {
        $a=$sampleLiteral | ConvertFrom-Json;$b=$closedLiteral | ConvertFrom-Json;$observed=$false
        switch ($mutation) {
            'bool' {$a.scopeVerified='True'}
            'reader' {$a.diagnostic.readerCode='host_text_invalid'}
            'render' {$a.renderVerified=$true}
            'seen' {$a.diagnostic.renderSeen='no'}
            'case' {$a.diagnostic.requestExactlyOnce='YES'}
            'finalized' {$b.diagnostic.traceFinalized=$false}
            'closed_resources' {$b.resourcesClosed=$false;$b.fixtureResourcesClosed=$false}
            'consistent' {$a.diagnostic.evidenceConsistent=$false}
        }
        try {$observed=Test-ReadRaceDiagnosticComplete $a $b} catch {}
        if ($observed) {throw 'mutation'}
    }
    for ($bits=0;$bits -lt 16;$bits++) {
        $want=$bits -in @(2,12,13)
        if ((Test-ReadRaceDiagnosticMode (($bits -band 8) -ne 0) (($bits -band 4) -ne 0) (($bits -band 2) -ne 0) (($bits -band 1) -ne 0)) -ne $want) { throw 'mode' }
    }
    foreach ($stage in @('policy','flags','source','compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','register','scope_before','reader','scope_after','classify','stop_command','native_close','closed_write')) {
        if ((Read-ReadRaceDiagnosticFailureStage ([pscustomobject]@{kind='failed';stage=$stage})) -cne ('child_'+$stage)) { throw 'stage' }
    }
    $rejected=$false;try {[void](Read-ReadRaceDiagnosticFailureStage ([pscustomobject]@{kind='failed';stage='Public unknown'}))} catch {$rejected=$true}
    if (-not $rejected) {throw 'stage_unknown'}
    foreach ($kind in @('valid','oversize','utf8')) {
        $bytes=[Text.Encoding]::UTF8.GetBytes('{"kind":"ready"}'+[char]10)
        if ($kind -eq 'oversize') { $bytes=New-Object byte[] 8193;for ($i=0;$i -lt 8192;$i++) {$bytes[$i]=65};$bytes[8192]=10 }
        if ($kind -eq 'utf8') {$bytes=[byte[]]@(255,10)}
        $stream=[IO.MemoryStream]::new($bytes);$rejected=$false
        try {
            try {$frame=Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000} catch {$rejected=$true}
            if ($kind -eq 'valid') {if ($rejected -or $frame -cne '{"kind":"ready"}') {throw 'stream'}}
            elseif (-not $rejected) {throw 'stream_reject'}
        } finally {$stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length)}
    }
}
try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA -or (Get-ExecutionPolicy) -ne 'RemoteSigned' -or (Get-ExecutionPolicy -Scope Process) -ne 'RemoteSigned') {throw 'guard'}
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    try {$script:sid=$identity.User;$principal=[Security.Principal.WindowsPrincipal]::new($identity);if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {throw 'guard'}} finally {$identity.Dispose()}
    $phase='flags'
    if (-not (Test-ReadRaceDiagnosticMode ([bool]$ReadRaceDiagnostic) ([bool]$AllowClipboardOverwrite) ([bool]$DiagnosticSelfTest) ([bool]$Child)) -or $X -lt 0 -or $Y -lt 0 -or $X -gt 4096 -or $Y -gt 4096 -or $Width -lt 21 -or $Height -lt 31 -or $Width -gt 4096 -or $Height -gt 4096 -or $X+$Width -gt 4096 -or $Y+$Height -gt 4096) {throw 'guard'}
    $phase='source'
    foreach ($path in @($PSScriptRoot,$PSCommandPath)) {if ($path.IndexOfAny([char[]]@([char]0,[char]10,[char]13,[char]34)) -ge 0) {throw 'guard'}}
    Assert-ReadRaceDiagnosticSource $PSScriptRoot $true;Assert-ReadRaceDiagnosticSource $PSCommandPath $false
    $supervisor=Join-Path $PSScriptRoot 'windows-host-observer-supervisor.ps1'
    $nativeSource=Join-Path $PSScriptRoot 'windows-host-observer-native.cs'
    $geometry=Join-Path $PSScriptRoot 'windows-editor-geometry-native.cs'
    $editorCore=Join-Path $PSScriptRoot 'windows-host-editor-calibration.cs'
    $reader=Join-Path $PSScriptRoot 'windows-host-editor.ps1'
    $coreSource=Join-Path $PSScriptRoot 'windows-clipboard-read-race-core.cs'
    $diagnosticCore=Join-Path $PSScriptRoot 'windows-clipboard-read-race-diagnostic-core.cs'
    $diagnosticFixture=Join-Path $PSScriptRoot 'windows-clipboard-read-race-diagnostic-fixture.cs'
    foreach ($path in @($supervisor,$nativeSource,$geometry,$editorCore,$reader,$coreSource,$diagnosticCore,$diagnosticFixture)) {Assert-ReadRaceDiagnosticSource $path $false}
    . $supervisor
    if ($DiagnosticSelfTest) {
        $phase='diagnostic_selftest';Test-ReadRaceDiagnosticSchema
        [Console]::WriteLine('host_clipboard_read_race_diagnostic_schema_observed,liveClipboardQueries=false,clipboardWritten=false');exit 0
    }
    if ($Child) {
        $phase='compile';Add-Type -LiteralPath @($nativeSource,$geometry,$editorCore,$coreSource,$diagnosticCore,$diagnosticFixture) -ErrorAction Stop
        Add-Type -AssemblyName WindowsBase,UIAutomationTypes,UIAutomationClient -ErrorAction Stop
        $phase='coordinate_setup';[HostEditorGeometry]::InitializeChildCoordinates()
        $phase='session_setup';$current=[Diagnostics.Process]::GetCurrentProcess()
        try {$script:sessionId=$current.SessionId} finally {$current.Dispose()}
        . $reader
        $editor=@{x=$X;y=$Y;width=$Width;height=$Height};$script:editorIdentity=$null;$script:editorTextCalls=0
        $phase='bind_scope';[void](Get-HostEditorPattern $editor)
        $phase='listener';$native=[HostObserverNative]::new();if (-not $native.Ready) {throw 'guard'}
        $phase='fixture_setup';$fixture=[HostReadRaceDiagnosticWindows]::StartWindows();if (-not $fixture.Ready) {throw 'guard'}
        $phase='ready_write';Write-ReadRaceDiagnosticFrame @{kind='ready'}
        $phase='sample_command';if ([Console]::In.ReadLine() -cne 'sample') {throw 'guard'}
        $value=$null
        try {
            $phase='scope_before';[void](Get-HostEditorPattern $editor)
            $phase='listener';if (-not $native.Ready -or $native.Overflow) {throw 'guard'}
            $phase='register';$registration=$fixture.Register()
            $ownerBefore=$false;$ownerAfter=$false;$readerBracket=$false
            if ($registration.Registered -and $registration.OpenClosed -and $registration.RegistrationVersion -ne 0 -and $registration.Code -ceq 'host_observed') {
                $phase='scope_before';[void](Get-HostEditorPattern $editor);$ownerBefore=$fixture.OwnsClipboard()
                if ($ownerBefore -and -not $native.Overflow) {
                    $phase='reader';if (-not $fixture.BeginReader()) {throw 'guard'};$readerBracket=$true
                    try {$value=$native.ReadClipboard($registration.RegistrationVersion,$script:editorPid)}
                    finally {if (-not $fixture.EndReader()) {throw 'guard'}}
                    $phase='scope_after';[void](Get-HostEditorPattern $editor);$ownerAfter=$fixture.OwnsClipboard()
                } else {$ownerBefore=$false}
            }
            if (-not $readerBracket -and -not $fixture.EndReader()) {throw 'guard'}
            foreach ($notice in $native.Drain()) {}
            $phase='classify';$capture=$fixture.CaptureSample()
            $row=[HostClipboardReadRaceCalibration]::Classify($registration,$capture.Evidence,$value,$true,($ownerBefore -and $ownerAfter),$native.Overflow)
            $readerCode=$null;if ($null -ne $value) {$readerCode=$value.Code}
            $d=$capture.Diagnostic.WithReaderCode($readerCode)
            $sample=@{kind='sample';scopeVerified=$row.ScopeVerified;registrationVerified=$row.RegistrationVerified;renderVerified=$row.RenderVerified;ownerVersionMatched=$row.OwnerVersionMatched;readerRejected=$row.ReaderRejected;textReturned=$row.TextReturned;readResourcesClosed=$row.ReadResourcesClosed;overflow=$row.Overflow;code=$row.Code;diagnostic=@{renderSeen=$d.RenderSeen;requestExactlyOnce=$d.RequestExactlyOnce;deliveryStatus=$d.DeliveryStatus;sequenceStatus=$d.SequenceStatus;failureObserved=$d.FailureObserved;firstRenderPhase=$d.FirstRenderPhase;multipleRenderPhases=$d.MultipleRenderPhases;evidenceConsistent=$d.EvidenceConsistent;traceValid=$d.TraceValid;readerCode=$d.ReaderCode}}
        } finally {if ($null -ne $value) {$value.Text=$null};$value=$null}
        Write-ReadRaceDiagnosticFrame $sample
        $phase='stop_command';if ([Console]::In.ReadLine() -cne 'stop') {throw 'guard'}
        $phase='native_close';$fixtureClosed=$false;$listenerClosed=$false;$final=$null
        # 兩項Stop都嘗試，不因第一項false短路漏另一項。
        try {$fixtureClosed=$fixture.Stop();$final=$fixture.GetFinalTrace()} catch {} finally {$fixture=$null}
        try {$listenerClosed=$native.Stop()} catch {}
        foreach ($notice in $native.Drain()) {}
        $overflow=$native.Overflow;$native=$null
        if ($null -eq $final) {throw 'guard'}
        $closed=$fixtureClosed -and $listenerClosed
        $phase='closed_write';Write-ReadRaceDiagnosticFrame @{kind='closed';fixtureResourcesClosed=$fixtureClosed;listenerResourcesClosed=$listenerClosed;overflow=$overflow;resourcesClosed=$closed;diagnostic=@{traceFinalized=$final.TraceFinalized;lateRender=$final.LateRender;firstRenderPhase=$final.FirstRenderPhase;multipleRenderPhases=$final.MultipleRenderPhases;traceValid=$final.TraceValid}}
        if (-not $closed) {exit 2};exit 0
    }
    $phase='startup';$info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=Join-Path $PSHOME 'powershell.exe'
    $info.Arguments=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'-NoProfile -STA -NonInteractive -File "{0}" -ReadRaceDiagnostic -AllowClipboardOverwrite -X {1} -Y {2} -Width {3} -Height {4} -Child',$PSCommandPath,$X,$Y,$Width,$Height)
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $owned=Start-HostOwnedProcess $info
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $owned.Startup 5000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') {$phase=Read-ReadRaceDiagnosticFailureStage $frame;throw 'guard'}
    Assert-HostFields $frame @('kind')
    if ($frame.kind -isnot [string] -or $frame.kind -cne 'ready' -or $owned.Startup.ElapsedMilliseconds -ge 5000) {throw 'guard'}
    $query=[Diagnostics.Stopwatch]::StartNew()
    # 可能部分送達之前即設unknown，缺可信回覆不得宣稱沒副作用。
    $phase='query_write';$changeState='unknown';Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
    $phase='query_reply';$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
    $phase='query_schema';$sample=$reply | ConvertFrom-Json;$reply=$null
    if ($sample.kind -ceq 'failed') {$phase=Read-ReadRaceDiagnosticFailureStage $sample;throw 'guard'}
    Assert-ReadRaceDiagnosticSample $sample
    if ($sample.registrationVerified) {$changeState='published'}
    if ($query.ElapsedMilliseconds -ge 1000) {throw 'guard'}
    $phase='close';$shutdown=[Diagnostics.Stopwatch]::StartNew()
    Write-HostCommand $owned.Process.StandardInput.BaseStream 'stop' $shutdown 2000
    $frame=(Read-HostFrame $owned.Process.StandardOutput.BaseStream $shutdown 2000) | ConvertFrom-Json
    if ($frame.kind -ceq 'failed') {$phase=Read-ReadRaceDiagnosticFailureStage $frame;throw 'guard'}
    Assert-ReadRaceDiagnosticPair $sample $frame
    $complete=Test-ReadRaceDiagnosticComplete $sample $frame
    $cleanup=Stop-HostOwnedProcess $owned $frame.resourcesClosed $shutdown;$owned=$null
    if (-not $cleanup.ProcessExited -or -not $cleanup.ResourcesClosed -or $shutdown.ElapsedMilliseconds -ge 2000) {throw 'guard'}
    $phase='result';[Console]::WriteLine((Format-ReadRaceDiagnosticResult $sample $frame $cleanup.ProcessExited $cleanup.ResourcesClosed))
    if (-not $complete) {exit 2};exit 0
} catch {
    if ($DiagnosticSelfTest) {[Console]::WriteLine('host_clipboard_read_race_diagnostic_schema_unavailable,stage='+$phase)}
    elseif ($Child) {try {Write-ReadRaceDiagnosticFrame @{kind='failed';stage=$phase}} catch {}}
    else {
        if ($null -ne $owned) {
            if ($null -eq $shutdown) {$shutdown=[Diagnostics.Stopwatch]::StartNew()}
            try {$cleanup=Stop-HostOwnedProcess $owned $false $shutdown} catch {$cleanup=$null} finally {$owned=$null}
        }
        $exited='unknown';if ($null -ne $cleanup -and $cleanup.ProcessExited -is [bool]) {$exited=$cleanup.ProcessExited.ToString()}
        $stage='unknown'
        if (@('policy','flags','source','startup','query_write','query_reply','query_schema','close','result') -ccontains $phase) {$stage=$phase}
        foreach ($childStage in @('policy','flags','source','compile','coordinate_setup','session_setup','bind_scope','listener','fixture_setup','ready_write','sample_command','register','scope_before','reader','scope_after','classify','stop_command','native_close','closed_write')) {if ($phase -ceq ('child_'+$childStage)) {$stage=$phase}}
        [Console]::WriteLine('host_clipboard_read_race_diagnostic_unavailable,case=ReadRaceDiagnostic,stage='+$stage+',clipboardChangeState='+$changeState+',processExited='+$exited)
    }
    exit 2
} finally {
    if ($null -ne $fixture) {try {[void]$fixture.Stop()} catch {}}
    if ($null -ne $native) {try {[void]$native.Stop()} catch {}}
    if ($null -ne $owned) {if ($null -eq $shutdown) {$shutdown=[Diagnostics.Stopwatch]::StartNew()};[void](Stop-HostOwnedProcess $owned $false $shutdown)}
}
