# Open失敗診斷的純資料schema與literal oracle；本module無頂層I/O或native能力。

# 驗三欄普通NoteProperty、字串型別及spec允許的state／分類pair。
function Assert-OverflowOpenDiagnosticSnapshot($Value) {
    Assert-HostFields $Value @('state','errorClass','openerSnapshot')
    foreach ($name in @('state','errorClass','openerSnapshot')) { if ($Value.$name -isnot [string]) { throw 'guard' } }
    $state=$Value.state;$errorClass=$Value.errorClass;$opener=$Value.openerSnapshot;$valid=$false
    switch -CaseSensitive ($state) {
        'not_applicable' { $valid=($errorClass -ceq 'not_captured' -and $opener -ceq 'not_queried') }
        'pending' { $valid=($errorClass -ceq 'not_captured' -and $opener -ceq 'not_queried') }
        'captured' {
            $knownError=@('access_denied','invalid_window_handle','other_nonzero','zero_indeterminate') -ccontains $errorClass
            $knownOpener=@('other_window_seen','self_window_seen','null_indeterminate') -ccontains $opener
            $valid=$knownError -and $knownOpener
        }
        'partial' {
            $knownError=@('access_denied','invalid_window_handle','other_nonzero','zero_indeterminate') -ccontains $errorClass
            $knownOpener=@('other_window_seen','self_window_seen','null_indeterminate') -ccontains $opener
            $valid=($errorClass -ceq 'capture_unavailable' -and $knownOpener) -or ($knownError -and $opener -ceq 'query_unavailable')
        }
        'unavailable' { $valid=($errorClass -ceq 'capture_unavailable' -and $opener -ceq 'query_unavailable') }
    }
    if (-not $valid) { throw 'guard' }
}

# 安全地取出新diagnostic欄後交原splitter完整驗base與legacy欄。
function Split-OverflowOpenDiagnosticFrame($Frame) {
    if ($null -eq $Frame -or $Frame -isnot [Management.Automation.PSCustomObject]) { throw 'guard' }
    $base=[ordered]@{};$openProperty=$null
    foreach ($property in @($Frame.PSObject.Properties)) {
        if ($property.Name -ceq 'openDiagnostic') { $openProperty=$property;continue }
        if ($property.Name -ceq 'diagnostic') {
            if ($property.MemberType -eq [Management.Automation.PSMemberTypes]::NoteProperty) { $base[$property.Name]=$property.Value }
            continue
        }
        if ($property.MemberType -ne [Management.Automation.PSMemberTypes]::NoteProperty) { throw 'guard' }
        $base[$property.Name]=$property.Value
    }
    $legacy=Split-OverflowDiagnosticFrame ([pscustomobject]$base)
    $openSnapshot=$null
    if ($null -ne $openProperty -and $openProperty.MemberType -eq [Management.Automation.PSMemberTypes]::NoteProperty) {
        try {
            $candidate=$openProperty.Value;Assert-OverflowOpenDiagnosticSnapshot $candidate
            $openSnapshot=[pscustomobject]@{state=$candidate.state;errorClass=$candidate.errorClass;openerSnapshot=$candidate.openerSnapshot}
        } catch { $openSnapshot=$null }
    }
    return [pscustomobject]@{Primary=$legacy.Primary;Diagnostic=$legacy.Diagnostic;OpenDiagnostic=$openSnapshot}
}

# Formatter只寫caller既有Writer；未知資料與輸出例外均退回固定marker。
function Write-OverflowOpenDiagnostic($Value,[IO.TextWriter]$Output) {
    $line='host_clipboard_overflow_open_diagnostic_unavailable'
    try {
        Assert-OverflowOpenDiagnosticSnapshot $Value
        $line=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'host_clipboard_overflow_open_diagnostic,state={0},errorClass={1},openerSnapshot={2}',$Value.state,$Value.errorClass,$Value.openerSnapshot)
        if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 512) { $line='host_clipboard_overflow_open_diagnostic_unavailable' }
    } catch { $line='host_clipboard_overflow_open_diagnostic_unavailable' }
    try { $Output.WriteLine($line) } catch {}
}

# 手寫literal同時驗固定pair、getter防護、base相容與mode／resolver oracle。
function Test-OverflowOpenDiagnosticSchema {
    $literals=@(
        '{"state":"captured","errorClass":"access_denied","openerSnapshot":"other_window_seen"}',
        '{"state":"captured","errorClass":"invalid_window_handle","openerSnapshot":"self_window_seen"}',
        '{"state":"captured","errorClass":"other_nonzero","openerSnapshot":"null_indeterminate"}',
        '{"state":"captured","errorClass":"zero_indeterminate","openerSnapshot":"self_window_seen"}',
        '{"state":"partial","errorClass":"capture_unavailable","openerSnapshot":"other_window_seen"}',
        '{"state":"partial","errorClass":"access_denied","openerSnapshot":"query_unavailable"}',
        '{"state":"unavailable","errorClass":"capture_unavailable","openerSnapshot":"query_unavailable"}',
        '{"state":"pending","errorClass":"not_captured","openerSnapshot":"not_queried"}',
        '{"state":"not_applicable","errorClass":"not_captured","openerSnapshot":"not_queried"}'
    )
    $lines=@(
        'host_clipboard_overflow_open_diagnostic,state=captured,errorClass=access_denied,openerSnapshot=other_window_seen',
        'host_clipboard_overflow_open_diagnostic,state=captured,errorClass=invalid_window_handle,openerSnapshot=self_window_seen',
        'host_clipboard_overflow_open_diagnostic,state=captured,errorClass=other_nonzero,openerSnapshot=null_indeterminate',
        'host_clipboard_overflow_open_diagnostic,state=captured,errorClass=zero_indeterminate,openerSnapshot=self_window_seen',
        'host_clipboard_overflow_open_diagnostic,state=partial,errorClass=capture_unavailable,openerSnapshot=other_window_seen',
        'host_clipboard_overflow_open_diagnostic,state=partial,errorClass=access_denied,openerSnapshot=query_unavailable',
        'host_clipboard_overflow_open_diagnostic,state=unavailable,errorClass=capture_unavailable,openerSnapshot=query_unavailable',
        'host_clipboard_overflow_open_diagnostic,state=pending,errorClass=not_captured,openerSnapshot=not_queried',
        'host_clipboard_overflow_open_diagnostic,state=not_applicable,errorClass=not_captured,openerSnapshot=not_queried'
    )
    for ($index=0; $index -lt $literals.Length; $index++) {
        $value=$literals[$index] | ConvertFrom-Json
        Assert-OverflowOpenDiagnosticSnapshot $value
        $output=[IO.StringWriter]::new([Globalization.CultureInfo]::InvariantCulture)
        try {
            Write-OverflowOpenDiagnostic $value $output
            if ($output.ToString() -cne ($lines[$index]+[Environment]::NewLine)) { throw 'guard' }
        } finally { $output.Dispose() }
    }
    $invalidLiterals=@(
        '{"state":"unknown","errorClass":"capture_unavailable","openerSnapshot":"query_unavailable"}',
        '{"state":"captured","errorClass":"capture_unavailable","openerSnapshot":"other_window_seen"}',
        '{"state":"captured","errorClass":"access_denied","openerSnapshot":"query_unavailable"}',
        '{"state":"unavailable","errorClass":"access_denied","openerSnapshot":"other_window_seen"}'
    )
    foreach ($literal in $invalidLiterals) {
        $value=$literal | ConvertFrom-Json;$rejected=$false
        try { Assert-OverflowOpenDiagnosticSnapshot $value } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
        $output=[IO.StringWriter]::new()
        try {
            Write-OverflowOpenDiagnostic $value $output
            if ($output.ToString() -cne ('host_clipboard_overflow_open_diagnostic_unavailable'+[Environment]::NewLine)) { throw 'guard' }
        } finally { $output.Dispose() }
    }
    foreach ($mutation in @('missing','extra','state_type','error_type','opener_type','error_record','getter')) {
        $value=$literals[0] | ConvertFrom-Json;$script:overflowOpenDiagnosticGetterRead=$false
        switch ($mutation) {
            'missing' { [void]$value.PSObject.Properties.Remove('state') }
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'state_type' { $value.state=$true }
            'error_type' { $value.errorClass=5 }
            'opener_type' { $value.openerSnapshot=$null }
            'error_record' { $value=[Management.Automation.ErrorRecord]::new([InvalidOperationException]::new('Public metadata'),'Public',[Management.Automation.ErrorCategory]::NotSpecified,$null) }
            'getter' {
                [void]$value.PSObject.Properties.Remove('state')
                $value | Add-Member -MemberType ScriptProperty -Name state -Value { $script:overflowOpenDiagnosticGetterRead=$true;return 'captured' }
            }
        }
        $rejected=$false;try { Assert-OverflowOpenDiagnosticSnapshot $value } catch { $rejected=$true }
        if (-not $rejected -or $script:overflowOpenDiagnosticGetterRead) { throw 'guard' }
        $output=[IO.StringWriter]::new()
        try {
            Write-OverflowOpenDiagnostic $value $output
            if ($output.ToString() -cne ('host_clipboard_overflow_open_diagnostic_unavailable'+[Environment]::NewLine) -or $script:overflowOpenDiagnosticGetterRead) { throw 'guard' }
        } finally { $output.Dispose() }
    }
    $closedLiteral='{"kind":"closed","scopeVerified":true,"producerCompleted":true,"publications":65,"retainedNotifications":64,"first64Verified":true,"overflowObserved":true,"contentReadAttempted":false,"code":"host_observation_overflow","overflowSticky":true,"writerResourcesClosed":true,"listenerResourcesClosed":true,"resourcesClosed":true}'
    $partialLiteral='{"kind":"closed","scopeVerified":true,"producerCompleted":false,"publications":19,"retainedNotifications":19,"first64Verified":false,"overflowObserved":false,"contentReadAttempted":false,"code":"host_clipboard_unstable","overflowSticky":false,"writerResourcesClosed":true,"listenerResourcesClosed":true,"resourcesClosed":true}'
    $legacyLiteral='{"stopStage":"open","stopReason":"returned_false","attempts":20,"sampleCode":"host_capability_unavailable","tailProof":"blocked_prior_failure"}'
    foreach ($baseLiteral in @($closedLiteral,$partialLiteral)) {
        $frame=$baseLiteral | ConvertFrom-Json
        $frame | Add-Member -NotePropertyName diagnostic -NotePropertyValue ($legacyLiteral | ConvertFrom-Json)
        $frame | Add-Member -NotePropertyName openDiagnostic -NotePropertyValue ($literals[0] | ConvertFrom-Json)
        $split=Split-OverflowOpenDiagnosticFrame $frame
        Assert-OverflowClosed $split.Primary
        if ($split.Diagnostic.stopStage -cne 'open' -or $split.OpenDiagnostic.state -cne 'captured' -or $split.Primary.code -cne $frame.code -or $split.Primary.publications -ne $frame.publications) { throw 'guard' }
        $invalid=$baseLiteral | ConvertFrom-Json
        $invalid | Add-Member -NotePropertyName diagnostic -NotePropertyValue ($legacyLiteral | ConvertFrom-Json)
        $invalid | Add-Member -NotePropertyName openDiagnostic -NotePropertyValue ($invalidLiterals[0] | ConvertFrom-Json)
        $split=Split-OverflowOpenDiagnosticFrame $invalid
        Assert-OverflowClosed $split.Primary
        if ($null -ne $split.OpenDiagnostic -or $split.Diagnostic.stopStage -cne 'open' -or $split.Primary.code -cne $invalid.code) { throw 'guard' }
        $missing=$baseLiteral | ConvertFrom-Json
        $missing | Add-Member -NotePropertyName diagnostic -NotePropertyValue ($legacyLiteral | ConvertFrom-Json)
        $split=Split-OverflowOpenDiagnosticFrame $missing
        Assert-OverflowClosed $split.Primary
        if ($null -ne $split.OpenDiagnostic -or $split.Diagnostic.stopStage -cne 'open' -or $split.Primary.code -cne $missing.code) { throw 'guard' }
    }
    $script:overflowOpenDiagnosticGetterRead=$false
    $openGetter=$closedLiteral | ConvertFrom-Json
    $openGetter | Add-Member -NotePropertyName diagnostic -NotePropertyValue ($legacyLiteral | ConvertFrom-Json)
    $openGetter | Add-Member -MemberType ScriptProperty -Name openDiagnostic -Value { $script:overflowOpenDiagnosticGetterRead=$true;return [pscustomobject]@{state='captured';errorClass='access_denied';openerSnapshot='other_window_seen'} }
    $split=Split-OverflowOpenDiagnosticFrame $openGetter
    if ($null -ne $split.OpenDiagnostic -or $script:overflowOpenDiagnosticGetterRead) { throw 'guard' }
    $script:overflowOpenDiagnosticGetterRead=$false
    $legacyGetter=$closedLiteral | ConvertFrom-Json
    [void]$legacyGetter.PSObject.Properties.Remove('diagnostic')
    $legacyGetter | Add-Member -MemberType ScriptProperty -Name diagnostic -Value { $script:overflowOpenDiagnosticGetterRead=$true;return [pscustomobject]@{stopStage='open';stopReason='returned_false';attempts=20;sampleCode='host_capability_unavailable';tailProof='blocked_prior_failure'} }
    $legacyGetter | Add-Member -NotePropertyName openDiagnostic -NotePropertyValue ($literals[0] | ConvertFrom-Json)
    $split=Split-OverflowOpenDiagnosticFrame $legacyGetter
    Assert-OverflowClosed $split.Primary
    if ($null -ne $split.Diagnostic -or $split.OpenDiagnostic.state -cne 'captured' -or $script:overflowOpenDiagnosticGetterRead) { throw 'guard' }
    $script:overflowOpenDiagnosticGetterRead=$false
    $baseGetter=$closedLiteral | ConvertFrom-Json
    [void]$baseGetter.PSObject.Properties.Remove('kind')
    $baseGetter | Add-Member -MemberType ScriptProperty -Name kind -Value { $script:overflowOpenDiagnosticGetterRead=$true;return 'closed' }
    $rejected=$false;try { Split-OverflowOpenDiagnosticFrame $baseGetter } catch { $rejected=$true }
    if (-not $rejected -or $script:overflowOpenDiagnosticGetterRead) { throw 'guard' }
    $unknownOuter=$closedLiteral | ConvertFrom-Json;$unknownOuter | Add-Member -NotePropertyName extra -NotePropertyValue 'Public metadata'
    $rejected=$false;try { Split-OverflowOpenDiagnosticFrame $unknownOuter } catch { $rejected=$true }
    if (-not $rejected) { throw 'guard' }
    $invalidBase=$closedLiteral | ConvertFrom-Json
    $invalidBase.publications=66
    $invalidBase | Add-Member -NotePropertyName openDiagnostic -NotePropertyValue ($literals[0] | ConvertFrom-Json)
    $rejected=$false;try { Split-OverflowOpenDiagnosticFrame $invalidBase } catch { $rejected=$true }
    if (-not $rejected) { throw 'guard' }
    $failed=[pscustomobject]@{kind='failed';stage='burst';diagnostic=($legacyLiteral | ConvertFrom-Json);openDiagnostic=($literals[1] | ConvertFrom-Json)}
    $split=Split-OverflowOpenDiagnosticFrame $failed
    if ((Read-OverflowFailureStage $split.Primary) -cne 'child_burst' -or $split.Diagnostic.stopStage -cne 'open' -or $split.OpenDiagnostic.errorClass -cne 'invalid_window_handle') { throw 'guard' }
    $jsonFrame=[ordered]@{kind='closed';scopeVerified=$true;producerCompleted=$true;publications=65;retainedNotifications=64;first64Verified=$true;overflowObserved=$true;contentReadAttempted=$false;code='host_observation_overflow';overflowSticky=$true;writerResourcesClosed=$true;listenerResourcesClosed=$true;resourcesClosed=$true;diagnostic=($legacyLiteral | ConvertFrom-Json);openDiagnostic=($literals[0] | ConvertFrom-Json)} | ConvertTo-Json -Depth 4 -Compress
    $bytes=[Text.Encoding]::UTF8.GetBytes($jsonFrame+"`n");$stream=[IO.MemoryStream]::new($bytes)
    try {
        if ([Text.Encoding]::UTF8.GetByteCount($jsonFrame) -gt 8191) { throw 'guard' }
        $roundTrip=Read-HostFrame $stream ([Diagnostics.Stopwatch]::StartNew()) 1000
        $split=Split-OverflowOpenDiagnosticFrame ($roundTrip | ConvertFrom-Json)
        if ($split.Primary.code -cne 'host_observation_overflow' -or $split.Diagnostic.stopStage -cne 'open' -or $split.OpenDiagnostic.errorClass -cne 'access_denied') { throw 'guard' }
    } finally { $stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length) }
    $output=[IO.StringWriter]::new();$output.Dispose()
    Write-OverflowOpenDiagnostic ($literals[0] | ConvertFrom-Json) $output
    if (-not (Test-OverflowMode $false $false $true $false) -or -not (Test-OverflowMode $true $true $false $false)) { throw 'guard' }
    if (-not (Test-OverflowMode $false $false $true $false $true $true 'calibrate-windows-clipboard-overflow-open-diagnostic.ps1') -or -not (Test-OverflowMode $true $true $false $false $true $true 'calibrate-windows-clipboard-overflow.ps1')) { throw 'guard' }
    if (-not (Test-OverflowMode $true $true $false $false $true $true 'calibrate-windows-clipboard-overflow-open-diagnostic.ps1')) { throw 'guard' }
    $oldSources=Get-OverflowSourceNames 'calibrate-windows-clipboard-overflow-diagnostic.ps1' $true
    $rootSources=Get-OverflowSourceNames 'calibrate-windows-clipboard-overflow.ps1' $false
    if ($oldSources.Core -cne 'windows-clipboard-overflow-core-diagnostic.cs' -or $rootSources.Core -cne 'windows-clipboard-overflow-core.cs') { throw 'guard' }
    foreach ($invalidMode in @(
        { Test-OverflowMode $false $false $true $false $false $true 'calibrate-windows-clipboard-overflow-open-diagnostic.ps1' },
        { Test-OverflowMode $true $true $false $false $false $true 'calibrate-windows-clipboard-overflow-diagnostic.ps1' },
        { Test-OverflowMode $false $false $true $false $true $true 'Public-unknown.ps1' },
        { Test-OverflowMode $false $false $true $false $false $false 'calibrate-windows-clipboard-overflow-open-diagnostic.ps1' }
    )) { if (& $invalidMode) { throw 'guard' } }
    $invalidResolver=@(
        { Get-OverflowSourceNames 'calibrate-windows-clipboard-overflow-open-diagnostic.ps1' $false $false },
        { Get-OverflowSourceNames 'calibrate-windows-clipboard-overflow-diagnostic.ps1' $true $true },
        { Get-OverflowSourceNames 'Public-unknown.ps1' $false $true }
    )
    foreach ($invalidCase in $invalidResolver) {
        $rejected=$false;try { [void](& $invalidCase) } catch { $rejected=$true }
        if (-not $rejected) { throw 'guard' }
    }
    $sourceCases=@(
        [pscustomobject]@{Name='calibrate-windows-clipboard-overflow.ps1';Diagnostic=$false;Open=$false;Core='windows-clipboard-overflow-core.cs';Fixture='windows-clipboard-overflow-fixture.cs'},
        [pscustomobject]@{Name='calibrate-windows-clipboard-overflow-diagnostic.ps1';Diagnostic=$true;Open=$false;Core='windows-clipboard-overflow-core-diagnostic.cs';Fixture='windows-clipboard-overflow-fixture-diagnostic.cs'},
        [pscustomobject]@{Name='calibrate-windows-clipboard-overflow-open-diagnostic.ps1';Diagnostic=$false;Open=$true;Core='windows-clipboard-overflow-core-open-diagnostic.cs';Fixture='windows-clipboard-overflow-fixture-open-diagnostic.cs'},
        [pscustomobject]@{Name='CALIBRATE-WINDOWS-CLIPBOARD-OVERFLOW-OPEN-DIAGNOSTIC.PS1';Diagnostic=$false;Open=$true;Core='windows-clipboard-overflow-core-open-diagnostic.cs';Fixture='windows-clipboard-overflow-fixture-open-diagnostic.cs'}
    )
    foreach ($case in $sourceCases) {
        $names=Get-OverflowSourceNames $case.Name $case.Diagnostic $case.Open
        if ($names.Core -cne $case.Core -or $names.Fixture -cne $case.Fixture) { throw 'guard' }
    }
}
