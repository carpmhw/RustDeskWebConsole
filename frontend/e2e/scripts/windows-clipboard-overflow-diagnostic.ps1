# 純資料診斷schema及literal oracle；此模組沒有頂層I/O或actor／內容能力。

# 五個普通欄位驗完才取值；固定pair與型別不接受字串轉型或未知getter。
function Assert-OverflowDiagnosticSnapshot($Value) {
    Assert-HostFields $Value @('stopStage','stopReason','attempts','sampleCode','tailProof')
    foreach ($name in @('stopStage','stopReason','sampleCode','tailProof')) { if ($Value.$name -isnot [string]) { throw 'guard' } }
    Assert-HostInteger $Value.attempts 0 65
    $reasons=@()
    switch -CaseSensitive ($Value.stopStage) {
        'none' { $reasons=@('none') }
        'unknown' { $reasons=@('unknown') }
        { @('prepare','open','empty','set','close','release') -ccontains $_ } { $reasons=@('returned_false','threw') }
        { @('publish_owner','proof_owner') -ccontains $_ } { $reasons=@('owner_mismatch','threw') }
        'publish_version' { $reasons=@('version_zero','threw') }
        'proof_version' { $reasons=@('version_mismatch','version_zero','threw') }
        'initial' { $reasons=@('not_ready','initial_dirty','invalid_input') }
        'budget' { $reasons=@('budget_exhausted','budget_invalid','threw') }
        'pending_notice' { $reasons=@('initial_dirty','null_batch','not_ready','early_overflow') }
        'publication' { $reasons=@('publication_invalid','threw') }
        'notice' { $reasons=@('null_batch','null_notice','not_ready','extra_notice','early_overflow','ordinal_mismatch','notice_time_invalid','notice_version_mismatch','threw') }
        'version' { $reasons=@('version_zero','version_duplicate') }
        'coordinator' { $reasons=@('threw') }
        { @('writer_initialize','writer_dispatch','writer_stop') -ccontains $_ } { $reasons=@('returned_false','wait_timeout','threw') }
        'scope' { $reasons=@('scope_unavailable') }
    }
    if ($reasons -cnotcontains $Value.stopReason) { throw 'guard' }
    if (@('unknown','host_observation_overflow','host_capability_unavailable','host_cleanup_unavailable','host_scope_changed','host_clipboard_unstable') -cnotcontains $Value.sampleCode) { throw 'guard' }
    if (@('not_checked','unknown','matched','blocked_prior_failure','owner_mismatch','version_mismatch','query_unavailable','not_ready') -cnotcontains $Value.tailProof) { throw 'guard' }
}

# 只剝離已知診斷欄；非法base或未知outer欄位仍交原validator拒絕，絕不執行getter。
function Split-OverflowDiagnosticFrame($Frame) {
    if ($null -eq $Frame -or $Frame -isnot [Management.Automation.PSCustomObject]) { throw 'guard' }
    $properties=@($Frame.PSObject.Properties);$diagnosticProperty=$null
    foreach ($property in $properties) {
        if ($property.Name -ceq 'diagnostic') { $diagnosticProperty=$property;continue }
        if ($property.MemberType -ne [Management.Automation.PSMemberTypes]::NoteProperty) { throw 'guard' }
    }
    $base=[ordered]@{}
    foreach ($property in $properties) { if ($property.Name -cne 'diagnostic') { $base[$property.Name]=$property.Value } }
    $primary=[pscustomobject]$base
    if ($primary.kind -isnot [string]) { throw 'guard' }
    if ($primary.kind -ceq 'closed') { Assert-OverflowClosed $primary }
    elseif ($primary.kind -ceq 'failed') { [void](Read-OverflowFailureStage $primary) }
    else { throw 'guard' }
    $diagnostic=$null
    if ($null -ne $diagnosticProperty -and $diagnosticProperty.MemberType -eq [Management.Automation.PSMemberTypes]::NoteProperty) {
        try {
            $candidate=$diagnosticProperty.Value;Assert-OverflowDiagnosticSnapshot $candidate
            $diagnostic=[pscustomobject]@{stopStage=$candidate.stopStage;stopReason=$candidate.stopReason;attempts=$candidate.attempts;sampleCode=$candidate.sampleCode;tailProof=$candidate.tailProof}
        } catch { $diagnostic=$null }
    }
    return [pscustomobject]@{Primary=$primary;Diagnostic=$diagnostic}
}

# formatter只寫caller既有Writer，失敗不能變更primary結果或將未知資料反射到stdout。
function Write-OverflowDiagnostic($Value,[IO.TextWriter]$Output) {
    $line='host_clipboard_overflow_diagnostic_unavailable'
    try {
        Assert-OverflowDiagnosticSnapshot $Value
        $line=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'host_clipboard_overflow_diagnostic,stopStage={0},stopReason={1},attempts={2},sampleCode={3},tailProof={4}',$Value.stopStage,$Value.stopReason,$Value.attempts,$Value.sampleCode,$Value.tailProof)
        if ([Text.Encoding]::UTF8.GetByteCount($line) -gt 512) { $line='host_clipboard_overflow_diagnostic_unavailable' }
    } catch { $line='host_clipboard_overflow_diagnostic_unavailable' }
    try { $Output.WriteLine($line) } catch {}
}

# 先定義手寫oracle，尚無5.1 engine時不得聲稱此測試已執行。
function Test-OverflowDiagnosticSchema {
    $openLiteral='{"stopStage":"open","stopReason":"returned_false","attempts":18,"sampleCode":"host_capability_unavailable","tailProof":"blocked_prior_failure"}'
    $ownerLiteral='{"stopStage":"proof_owner","stopReason":"owner_mismatch","attempts":17,"sampleCode":"host_clipboard_unstable","tailProof":"blocked_prior_failure"}'
    $normalLiteral='{"stopStage":"none","stopReason":"none","attempts":65,"sampleCode":"host_observation_overflow","tailProof":"matched"}'
    $unknownLiteral='{"stopStage":"unknown","stopReason":"unknown","attempts":0,"sampleCode":"unknown","tailProof":"unknown"}'
    $closedLiteral='{"kind":"closed","scopeVerified":true,"producerCompleted":true,"publications":65,"retainedNotifications":64,"first64Verified":true,"overflowObserved":true,"contentReadAttempted":false,"code":"host_observation_overflow","overflowSticky":true,"writerResourcesClosed":true,"listenerResourcesClosed":true,"resourcesClosed":true}'
    $partialLiteral='{"kind":"closed","scopeVerified":true,"producerCompleted":false,"publications":17,"retainedNotifications":17,"first64Verified":false,"overflowObserved":false,"contentReadAttempted":false,"code":"host_clipboard_unstable","overflowSticky":false,"writerResourcesClosed":true,"listenerResourcesClosed":true,"resourcesClosed":true}'
    foreach ($literal in @($openLiteral,$ownerLiteral,$normalLiteral,$unknownLiteral)) {
        Assert-OverflowDiagnosticSnapshot ($literal | ConvertFrom-Json)
    }
    $expected=@(
        'host_clipboard_overflow_diagnostic,stopStage=open,stopReason=returned_false,attempts=18,sampleCode=host_capability_unavailable,tailProof=blocked_prior_failure',
        'host_clipboard_overflow_diagnostic,stopStage=proof_owner,stopReason=owner_mismatch,attempts=17,sampleCode=host_clipboard_unstable,tailProof=blocked_prior_failure',
        'host_clipboard_overflow_diagnostic,stopStage=none,stopReason=none,attempts=65,sampleCode=host_observation_overflow,tailProof=matched',
        'host_clipboard_overflow_diagnostic,stopStage=unknown,stopReason=unknown,attempts=0,sampleCode=unknown,tailProof=unknown'
    )
    $index=0
    foreach ($literal in @($openLiteral,$ownerLiteral,$normalLiteral,$unknownLiteral)) {
        $output=[IO.StringWriter]::new([Globalization.CultureInfo]::InvariantCulture)
        try {
            Write-OverflowDiagnostic ($literal | ConvertFrom-Json) $output
            if ($output.ToString() -cne ($expected[$index]+[Environment]::NewLine)) { throw 'guard' }
        } finally { $output.Dispose() }
        $index++
    }
    foreach ($mutation in @('stage','reason','pair','sample','tail','extra','missing','getter','error','negative','large','float','bool','string','case')) {
        $value=$openLiteral | ConvertFrom-Json
        $script:overflowDiagnosticGetterRead=$false
        switch ($mutation) {
            'stage' { $value.stopStage='Public unknown' }
            'reason' { $value.stopReason='Public unknown' }
            'pair' { $value.stopReason='owner_mismatch' }
            'sample' { $value.sampleCode='Public unknown' }
            'tail' { $value.tailProof='Public unknown' }
            'extra' { $value | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
            'missing' { $value.PSObject.Properties.Remove('stopStage') }
            'getter' {
                $value.PSObject.Properties.Remove('stopStage')
                # 未知getter不得執行，即使它宣稱回白名單值。
                $value | Add-Member -MemberType ScriptProperty -Name stopStage -Value { $script:overflowDiagnosticGetterRead=$true;return 'open' }
            }
            'error' { $value=[Management.Automation.ErrorRecord]::new([InvalidOperationException]::new('Public metadata'),'Public',[Management.Automation.ErrorCategory]::NotSpecified,$null) }
            'negative' { $value.attempts=-1 }
            'large' { $value.attempts=66 }
            'float' { $value.attempts=18.0 }
            'bool' { $value.attempts=$true }
            'string' { $value.attempts='18' }
            'case' { $value.stopStage='OPEN' }
        }
        $rejected=$false;try { Assert-OverflowDiagnosticSnapshot $value } catch { $rejected=$true }
        if (-not $rejected -or $script:overflowDiagnosticGetterRead) { throw 'guard' }
        $output=[IO.StringWriter]::new()
        try {
            Write-OverflowDiagnostic $value $output
            if ($output.ToString() -cne ('host_clipboard_overflow_diagnostic_unavailable'+[Environment]::NewLine) -or $script:overflowDiagnosticGetterRead) { throw 'guard' }
        } finally { $output.Dispose() }
        foreach ($baseLiteral in @($closedLiteral,$partialLiteral)) {
            $frame=$baseLiteral | ConvertFrom-Json;$frame | Add-Member -NotePropertyName diagnostic -NotePropertyValue $value
            $split=Split-OverflowDiagnosticFrame $frame
            Assert-OverflowClosed $split.Primary
            if ($null -ne $split.Diagnostic -or $script:overflowDiagnosticGetterRead) { throw 'guard' }
            $base=$baseLiteral | ConvertFrom-Json
            foreach ($name in @('code','publications','resourcesClosed','overflowSticky')) { if ($split.Primary.$name -cne $base.$name) { throw 'guard' } }
        }
    }
    foreach ($baseLiteral in @($closedLiteral,$partialLiteral)) {
        foreach ($mode in @('missing','valid','getter','unknown_outer','base_getter','invalid_base')) {
            $frame=$baseLiteral | ConvertFrom-Json;$script:overflowDiagnosticGetterRead=$false
            switch ($mode) {
                'valid' { $frame | Add-Member -NotePropertyName diagnostic -NotePropertyValue ($openLiteral | ConvertFrom-Json) }
                'getter' {
                    # outer診斷getter不執行且不能讓合法base失效。
                    $frame | Add-Member -MemberType ScriptProperty -Name diagnostic -Value { $script:overflowDiagnosticGetterRead=$true;return $null }
                }
                'unknown_outer' { $frame | Add-Member -NotePropertyName text -NotePropertyValue 'Public metadata' }
                'base_getter' {
                    $frame.PSObject.Properties.Remove('kind')
                    # base getter則整份primary拒絕，但仍不得執行。
                    $frame | Add-Member -MemberType ScriptProperty -Name kind -Value { $script:overflowDiagnosticGetterRead=$true;return 'closed' }
                }
                'invalid_base' { $frame.publications=66 }
            }
            $rejected=$false
            try {
                $split=Split-OverflowDiagnosticFrame $frame
                Assert-OverflowClosed $split.Primary
                if (($mode -eq 'valid') -ne ($null -ne $split.Diagnostic)) { throw 'oracle' }
            } catch { $rejected=$true }
            if ($rejected -ne (@('unknown_outer','base_getter','invalid_base') -contains $mode) -or $script:overflowDiagnosticGetterRead) { throw 'guard' }
        }
    }
    $failed=[pscustomobject]@{kind='failed';stage='burst';diagnostic=($ownerLiteral | ConvertFrom-Json)}
    $split=Split-OverflowDiagnosticFrame $failed
    if ((Read-OverflowFailureStage $split.Primary) -cne 'child_burst' -or $split.Diagnostic.attempts -ne 17) { throw 'guard' }
    $closedOutput=[IO.StringWriter]::new();$closedOutput.Dispose()
    Write-OverflowDiagnostic ($openLiteral | ConvertFrom-Json) $closedOutput
    foreach ($diagnostic in @($false,$true)) {
        foreach ($name in @('calibrate-windows-clipboard-overflow.ps1','calibrate-windows-clipboard-overflow-diagnostic.ps1','CALIBRATE-WINDOWS-CLIPBOARD-OVERFLOW-DIAGNOSTIC.PS1','Public unknown.ps1')) {
            $names=Get-OverflowSourceNames $name $diagnostic
            $suffix='';if ($diagnostic -and @('calibrate-windows-clipboard-overflow-diagnostic.ps1','CALIBRATE-WINDOWS-CLIPBOARD-OVERFLOW-DIAGNOSTIC.PS1') -ccontains $name) { $suffix='-diagnostic' }
            if ($names.Core -cne ('windows-clipboard-overflow-core'+$suffix+'.cs') -or $names.Fixture -cne ('windows-clipboard-overflow-fixture'+$suffix+'.cs')) { throw 'guard' }
        }
    }
}
