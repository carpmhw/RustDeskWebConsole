import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// 真Parser載入純函數與parent sample區段；child/native入口只以AST檢查。
test('ReadOpenGap schema and parent partial writes preserve safe state', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-read-open-gap-schema-')
  const script = String.raw`param([string]$Tools)
$ErrorActionPreference='Stop'
$file=Join-Path $Tools 'calibrate-windows-clipboard-read-open-gap.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if ($errors.Count -ne 0) {throw 'parser'}
$names=@('Test-ReadOpenGapMode','Assert-ReadOpenGapSource','New-ReadOpenGapUnobservedCapture','Assert-ReadOpenGapEnum','Assert-ReadOpenGapSample','Assert-ReadOpenGapClosed','Assert-ReadOpenGapPair','Test-ReadOpenGapObserved','Format-ReadOpenGapResult','Format-ReadOpenGapFailure','Read-ReadOpenGapFailureStage','Convert-ReadOpenGapFrameBytes','Write-ReadOpenGapFrame','Test-ReadOpenGapSchema')
# 只從CLI AST取出白名單pure函數，不dot-source其入口或呼叫原生。
foreach ($name in $names) {
    $definitions=@($ast.EndBlock.Statements | Where-Object {$_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq $name})
    if ($definitions.Count -ne 1) {throw 'definition'}
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}
. (Join-Path $Tools 'windows-host-observer-supervisor.ps1')
# 由真C#結果建立完整safe sample，欄位期望仍由下面獨立literal固定。
function New-ReadOpenGapTestSample($Result) {
    $e=$Result.Evidence
    $nested=[ordered]@{firstSequenceStatus=$e.FirstSequenceStatus;publicationStatus=$e.PublicationStatus;gapOrderStatus=$e.GapOrderStatus;publicationSequenceStatus=$e.PublicationSequenceStatus;readerOpenStatus=$e.ReaderOpenStatus;lockedPublicationStatus=$e.LockedPublicationStatus;payloadStatus=$e.PayloadStatus;readerCopyStatus=$e.ReaderCopyStatus;postSequenceStatus=$e.PostSequenceStatus;readCloseStatus=$e.ReadCloseStatus;traceValid=$e.TraceValid}
    return [pscustomobject][ordered]@{kind='sample';evidenceKind='shared_strategy_native_gap';scopeVerified=$Result.ScopeVerified;readerInvoked=$Result.ReaderInvoked;readerRejected=$Result.ReaderRejected;textReturned=$Result.TextReturned;overflow=$Result.Overflow;code=$Result.Code;readerCode=$Result.ReaderCode;evidence=[pscustomobject]$nested}
}
# 測試只編譯pure C# DTO與classifier，不建listener或fixture。
$null=Add-Type -LiteralPath @((Join-Path $Tools 'windows-host-observer-native.cs'),(Join-Path $Tools 'windows-editor-geometry-native.cs'),(Join-Path $Tools 'windows-host-editor-calibration.cs'),(Join-Path $Tools 'windows-clipboard-read-open-gap-core.cs')) -ErrorAction Stop
$reader=[HostClipboardValue]::new();$reader.Code='host_clipboard_unstable';$reader.Stable=$false;$reader.Version=[uint32]7;$reader.OwnerMatches=$false;$reader.ResourcesClosed=$true
$evidence=[HostReadOpenGapEvidence]::new('available','succeeded','verified','changed','succeeded','matched','matched','succeeded','matched','succeeded',$true)
$capture=[HostReadOpenGapCapture]::new([uint32]7,[uint32]8,[uint32]8,[uint32]8,[HostReadOpenGapStage]::Succeeded,$true,$evidence)
$classification=[HostReadOpenGapCalibration]::Classify($capture,$reader,$true,$false)
$sampleJson='{"kind":"sample","evidenceKind":"shared_strategy_native_gap","scopeVerified":true,"readerInvoked":true,"readerRejected":true,"textReturned":false,"overflow":false,"code":"host_clipboard_unstable","readerCode":"host_clipboard_unstable","evidence":{"firstSequenceStatus":"available","publicationStatus":"succeeded","gapOrderStatus":"verified","publicationSequenceStatus":"changed","readerOpenStatus":"succeeded","lockedPublicationStatus":"matched","payloadStatus":"matched","readerCopyStatus":"succeeded","postSequenceStatus":"matched","readCloseStatus":"succeeded","traceValid":true}}'
$actual=New-ReadOpenGapTestSample $classification
if (($actual | ConvertTo-Json -Depth 4 -Compress) -cne $sampleJson) {throw 'csharp_literal_oracle'}
$closedJson='{"kind":"closed","fixtureResourcesClosed":true,"listenerResourcesClosed":true,"overflow":false,"resourcesClosed":true,"traceFinalized":true,"traceValid":true}'
$closed=$closedJson | ConvertFrom-Json
if (-not (Test-ReadOpenGapObserved $actual $closed)) {throw 'csharp_success_cross_check'}
$expectedLine='host_clipboard_read_open_gap_observed,case=ReadOpenGap,evidenceKind=shared_strategy_native_gap,scopeVerified=True,readerInvoked=True,readerRejected=True,textReturned=False,overflow=False,primaryCode=host_clipboard_unstable,readerCode=host_clipboard_unstable,firstSequenceStatus=available,publicationStatus=succeeded,gapOrderStatus=verified,publicationSequenceStatus=changed,readerOpenStatus=succeeded,lockedPublicationStatus=matched,payloadStatus=matched,readerCopyStatus=succeeded,postSequenceStatus=matched,readCloseStatus=succeeded,traceValid=True,fixtureResourcesClosed=True,listenerResourcesClosed=True,resourcesClosed=True,traceFinalized=True,finalTraceValid=True,processExited=True'
if ((Format-ReadOpenGapResult $actual $closed $true $true) -cne $expectedLine) {throw 'csharp_formatter_cross_check'}

# 未呼共享reader時只可封存not_attempted，不得輸出虛構的序號／發布／讀取成功。
$unobservedCapture=New-ReadOpenGapUnobservedCapture
if ($unobservedCapture.ReaderInvoked -or $unobservedCapture.Evidence.TraceValid -ne $true) {throw 'unobserved_trace_state'}
foreach ($statusName in @('FirstSequenceStatus','PublicationStatus','GapOrderStatus','PublicationSequenceStatus','ReaderOpenStatus','LockedPublicationStatus','PayloadStatus','ReaderCopyStatus','PostSequenceStatus','ReadCloseStatus')) {
    if ($unobservedCapture.Evidence.$statusName -cne 'not_attempted') {throw 'unobserved_positive_evidence'}
}
$unobservedResult=[HostReadOpenGapCalibration]::Classify($unobservedCapture,$null,$false,$false)
$unobservedSample=New-ReadOpenGapTestSample $unobservedResult
Assert-ReadOpenGapSample $unobservedSample
$unobservedClosed=$closedJson | ConvertFrom-Json;$unobservedClosed.traceFinalized=$false
if (Test-ReadOpenGapObserved $unobservedSample $unobservedClosed) {throw 'unobserved_reader_rejected'}

# 讀前形態不得被C#或PowerShell誤分類為讀後拒絕。
$beforeEvidence=[HostReadOpenGapEvidence]::new('unavailable','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted','not_attempted',$true)
$beforeCapture=[HostReadOpenGapCapture]::new([uint32]0,[uint32]0,[uint32]0,[uint32]0,[HostReadOpenGapStage]::NotAttempted,$true,$beforeEvidence)
$beforeReader=[HostClipboardValue]::new();$beforeReader.Code='host_clipboard_unstable';$beforeReader.Version=[uint32]0;$beforeReader.OwnerMatches=$null;$beforeReader.ResourcesClosed=$true;$beforeReader.Stable=$false
$beforeResult=[HostReadOpenGapCalibration]::Classify($beforeCapture,$beforeReader,$true,$false)
$beforeSample=New-ReadOpenGapTestSample $beforeResult
if ($beforeResult.ReaderRejected -or (Test-ReadOpenGapObserved $beforeSample $closed)) {throw 'csharp_before_read_not_rejected'}

# 正常回字串與payload mismatch不等於expected的讀後拒絕。
$normalEvidence=[HostReadOpenGapEvidence]::new('available','succeeded','verified','changed','succeeded','matched','matched','succeeded','mismatched','succeeded',$true)
$normalCapture=[HostReadOpenGapCapture]::new([uint32]7,[uint32]8,[uint32]8,[uint32]7,[HostReadOpenGapStage]::Succeeded,$true,$normalEvidence)
$normalReader=[HostClipboardValue]::new();$normalReader.Code='host_observed';$normalReader.Text='Public same';$normalReader.Stable=$true;$normalReader.Version=[uint32]7;$normalReader.OwnerMatches=$false;$normalReader.ResourcesClosed=$true
$normalResult=[HostReadOpenGapCalibration]::Classify($normalCapture,$normalReader,$true,$false)
if ($normalResult.ReaderRejected -or $normalResult.TextReturned -ne $true -or (Test-ReadOpenGapObserved (New-ReadOpenGapTestSample $normalResult) $closed)) {throw 'csharp_normal_reader_not_rejected'}

# cleanup失敗必須在C# classifier先於預期unstable碼。
$cleanupEvidence=[HostReadOpenGapEvidence]::new('available','succeeded','verified','changed','succeeded','matched','matched','succeeded','matched','failed',$true)
$cleanupCapture=[HostReadOpenGapCapture]::new([uint32]7,[uint32]8,[uint32]8,[uint32]8,[HostReadOpenGapStage]::Succeeded,$true,$cleanupEvidence)
$cleanupReader=[HostClipboardValue]::new();$cleanupReader.Code='host_cleanup_unavailable';$cleanupReader.Stable=$false;$cleanupReader.Version=[uint32]7;$cleanupReader.OwnerMatches=$false;$cleanupReader.ResourcesClosed=$false
$cleanupResult=[HostReadOpenGapCalibration]::Classify($cleanupCapture,$cleanupReader,$true,$false)
if ($cleanupResult.ReaderRejected -or $cleanupResult.Code -cne 'host_cleanup_unavailable' -or (Test-ReadOpenGapObserved (New-ReadOpenGapTestSample $cleanupResult) $closed)) {throw 'csharp_cleanup_precedence'}

# 擷取真parent sample write/reply/schema區段；缺區段時使用會漏設unknown的可編譯拒絕stub。
$source=[IO.File]::ReadAllText($file)
$begin="$"+"phase='query_write'";$end="$"+"phase='close'"
$start=$source.IndexOf($begin,[StringComparison]::Ordinal);$finish=$source.IndexOf($end,[StringComparison]::Ordinal)
if ($start -ge 0 -and $finish -gt $start) {
    if ($source.LastIndexOf($begin,[StringComparison]::Ordinal) -ne $start -or $source.LastIndexOf($end,[StringComparison]::Ordinal) -ne $finish) {throw 'sample_region_count'}
    $sampleBlock=[scriptblock]::Create($source.Substring($start,$finish-$start))
} else {
    $fallback=@'
$phase='query_write'
Write-HostCommand $owned.Process.StandardInput.BaseStream 'sample' $query 1000
$phase='query_reply'
$reply=Read-HostFrame $owned.Process.StandardOutput.BaseStream $query 1000
$phase='query_schema'
$sample=$reply | ConvertFrom-Json
Assert-ReadOpenGapSample $sample
if ($sample.evidence.publicationStatus -ceq 'succeeded') {$changeState='published'}
if ($query.ElapsedMilliseconds -ge 1000) {throw 'host_query_timeout'}
'@
    $sampleBlock=[scriptblock]::Create($fallback)
}
# parent的query write不得被包在Child入口，否則角色顛倒仍會被相同字串測試誤認。
$queryAssignments=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -ceq '$phase' -and $node.Right.Extent.Text -ceq "'query_write'"},$true))
if ($queryAssignments.Count -ne 1) {throw 'query_write_assignment'}
$insideChild=$false
foreach ($ifStatement in $ast.FindAll({param($node) $node -is [Management.Automation.Language.IfStatementAst]},$true)) {
    foreach ($clause in $ifStatement.Clauses) {
        $condition=$clause.Item1.Extent.Text
        $body=$clause.Item2.Extent
        if ($condition -match '\$Child\b' -and $queryAssignments[0].Extent.StartOffset -ge $body.StartOffset -and $queryAssignments[0].Extent.EndOffset -le $body.EndOffset) {$insideChild=$true}
    }
}
if ($insideChild) {throw 'parent_query_in_child'}
$script:gapRealFrameReader=(Get-Command Read-HostFrame).ScriptBlock
foreach ($scenario in @('write_throw','missing_reply','invalid_schema','not_published','unknown_publication','partial_published','published','expired')) {
    & {
        $script:gapWrites=0;$script:gapReads=0;$script:gapStateAtWrite='unset'
        $sampleFull='{"kind":"sample","evidenceKind":"shared_strategy_native_gap","scopeVerified":true,"readerInvoked":true,"readerRejected":true,"textReturned":false,"overflow":false,"code":"host_clipboard_unstable","readerCode":"host_clipboard_unstable","evidence":{"firstSequenceStatus":"available","publicationStatus":"succeeded","gapOrderStatus":"verified","publicationSequenceStatus":"changed","readerOpenStatus":"succeeded","lockedPublicationStatus":"matched","payloadStatus":"matched","readerCopyStatus":"succeeded","postSequenceStatus":"matched","readCloseStatus":"succeeded","traceValid":true}}'
        $value=$sampleFull | ConvertFrom-Json
        if ($scenario -eq 'not_published') {
            $value.readerRejected=$false;$value.code='host_capability_unavailable';$value.readerCode='host_clipboard_busy'
            $value.evidence.publicationStatus='failed';$value.evidence.publicationSequenceStatus='not_attempted'
            foreach ($name in @('readerOpenStatus','lockedPublicationStatus','payloadStatus','readerCopyStatus','postSequenceStatus','readCloseStatus')) {$value.evidence.$name='not_attempted'}
        }
        if ($scenario -eq 'unknown_publication') {
            $value.readerRejected=$false;$value.code='host_capability_unavailable';$value.readerCode='unknown'
            $value.evidence.publicationStatus='unknown';$value.evidence.publicationSequenceStatus='unknown'
            foreach ($name in @('readerOpenStatus','lockedPublicationStatus','payloadStatus','readerCopyStatus','postSequenceStatus','readCloseStatus')) {$value.evidence.$name='not_attempted'}
        }
        if ($scenario -eq 'partial_published') {
            $value.readerRejected=$false;$value.code='host_clipboard_busy';$value.readerCode='host_clipboard_busy'
            $value.evidence.readerOpenStatus='failed'
            foreach ($name in @('lockedPublicationStatus','payloadStatus','readerCopyStatus','postSequenceStatus','readCloseStatus')) {$value.evidence.$name='not_attempted'}
        }
        if ($scenario -eq 'invalid_schema') {$json='{"kind":"sample"}'} else {$json=$value | ConvertTo-Json -Depth 4 -Compress}
        $bytes=[Text.Encoding]::UTF8.GetBytes($json+[char]10)
        if ($scenario -eq 'missing_reply') {$bytes=[byte[]]@()}
        $inputStream=[IO.MemoryStream]::new();$outputStream=[IO.MemoryStream]::new($bytes)
        try {
            $owned=@{Process=@{StandardInput=@{BaseStream=$inputStream};StandardOutput=@{BaseStream=$outputStream}}}
            $query=[pscustomobject]@{ElapsedMilliseconds=0}
            if ($scenario -eq 'expired') {$query.ElapsedMilliseconds=1000}
            $changeState='not_requested';$failed=$false
            # 記錄sample write進入時的狀態，不以測試替身攔截產品行為。
            function Write-HostCommand($Stream,$Command,$Clock,$Budget) {
                $script:gapWrites++
                $script:gapStateAtWrite=$changeState
                if ($Command -cne 'sample' -or $Budget -ne 1000) {throw 'write_contract'}
                if ($scenario -ceq 'write_throw') {throw 'Public pipe failure'}
            }
            # 讀取保留真Read-HostFrame，只以新Stopwatch讀MemoryStream避免等待。
            function Read-HostFrame($Stream,$Clock,$Budget) {
                $script:gapReads++
                if ($Budget -ne 1000) {throw 'read_contract'}
                return (& $script:gapRealFrameReader $Stream ([Diagnostics.Stopwatch]::StartNew()) $Budget)
            }
            try {. $sampleBlock} catch {$failed=$true}
            if ($script:gapWrites -ne 1 -or $script:gapReads -ne [int]($scenario -cne 'write_throw')) {throw 'partial_counts'}
            if ($script:gapStateAtWrite -cne 'unknown') {throw 'partial_write_must_start_unknown'}
            $mustFail=$scenario -in @('write_throw','missing_reply','invalid_schema','expired')
            if ($failed -ne $mustFail) {throw 'partial_exit'}
            $wantState='unknown';if ($scenario -in @('partial_published','published')) {$wantState='published'}
            if ($changeState -cne $wantState) {throw 'partial_change_state'}
        } finally {$inputStream.Dispose();$outputStream.Dispose();[Array]::Clear($bytes,0,$bytes.Length)}
    }
}
# AST驗證pure selftest先於唯一編譯入口，child只呼叫新fixture facade一次。
$selfCalls=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Test-ReadOpenGapSchema'},$true))
$compileCalls=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Add-Type'},$true))
if ($selfCalls.Count -ne 1 -or $compileCalls.Count -lt 1) {throw 'selftest_order'}
$compileOffsets=@($compileCalls | ForEach-Object {$_.Extent.StartOffset})
$firstCompile=($compileOffsets | Measure-Object -Minimum).Minimum
if ($selfCalls[0].Extent.StartOffset -gt $firstCompile) {throw 'selftest_order'}
if ([regex]::Matches($source,'\$fixture\.Observe\(').Count -ne 1 -or $source.Contains('ReadClipboard(') -or $source.Contains('ObserveClipboard(')) {throw 'reader_single_call'}
if ([regex]::Matches($source,'\$fixture\.CaptureSample\(').Count -ne 1 -or [regex]::Matches($source,'\$fixture\.GetFinalTrace\(').Count -ne 1) {throw 'fixture_single_seal'}
if ([regex]::Matches($source,'\[HostReadOpenGapWindows\]::StartWindows\(').Count -ne 1 -or $source.Contains('Read-HostEditorText')) {throw 'native_or_text_boundary'}
$scopeCalls=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Get-HostEditorPattern'},$true))
if ($scopeCalls.Count -lt 3 -or [regex]::Matches($source,'\$fixture\.Stop\(').Count -lt 1 -or [regex]::Matches($source,'\$native\.Stop\(').Count -lt 1) {throw 'scope_and_cleanup'}
$schemaDefinition=@($ast.EndBlock.Statements | Where-Object {$_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq 'Test-ReadOpenGapSchema'})
if ($schemaDefinition.Count -ne 1 -or $schemaDefinition[0].Extent.Text.Contains('Add-Type') -or $schemaDefinition[0].Extent.Text.Contains('StartWindows') -or $schemaDefinition[0].Extent.Text.Contains('Read-HostEditorText')) {throw 'selftest_pure_boundary'}
$supervisedWrites=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Write-HostCommand' -and $node.Extent.Text.Contains('StandardInput.BaseStream')},$true) | ForEach-Object {$_.Extent.Text})
$sampleWritePattern=[regex]::Escape("'sample'")+'\s+\$query\s+1000'
$stopWritePattern=[regex]::Escape("'stop'")+'\s+\$shutdown\s+2000'
if ($supervisedWrites.Count -ne 2 -or @($supervisedWrites | Where-Object {$_ -match $sampleWritePattern}).Count -ne 1 -or @($supervisedWrites | Where-Object {$_ -match $stopWritePattern}).Count -ne 1) {throw 'supervisor_write_budgets'}
$supervisedReads=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Read-HostFrame' -and $node.Extent.Text.Contains('StandardOutput.BaseStream')},$true) | ForEach-Object {$_.Extent.Text})
if ($supervisedReads.Count -ne 3 -or @($supervisedReads | Where-Object {$_ -match '\$owned\.Startup\s+5000'}).Count -ne 1 -or @($supervisedReads | Where-Object {$_ -match '\$query\s+1000'}).Count -ne 1 -or @($supervisedReads | Where-Object {$_ -match '\$shutdown\s+2000'}).Count -ne 1) {throw 'supervisor_read_budgets'}
if ([regex]::Matches($source,'\$phase=''query_write''').Count -ne 1 -or [regex]::Matches($source,'\$phase=''close''').Count -ne 1) {throw 'query_region'}
if (-not $source.Contains('[switch]$ReadOpenGap') -or -not $source.Contains('[switch]$AllowClipboardOverwrite')) {throw 'native_double_opt_in'}
$failureLine=Format-ReadOpenGapFailure 'query_reply' 'unknown' 'False'
if ($failureLine -cne 'host_clipboard_read_open_gap_unavailable,case=ReadOpenGap,stage=query_reply,clipboardChangeState=unknown,processExited=False') {throw 'safe_failure_literal'}
$unknownStageLine=Format-ReadOpenGapFailure 'Public path' 'published' 'unknown'
if ($unknownStageLine -cne 'host_clipboard_read_open_gap_unavailable,case=ReadOpenGap,stage=unknown,clipboardChangeState=published,processExited=unknown') {throw 'unknown_failure_stage_projection'}
[Console]::WriteLine('read_open_gap_partial_sample_observed,windowsNative=false')
# 受測PowerShell literal oracle必須辨識所有成功證據，否則在此真RED。
Test-ReadOpenGapSchema
[Console]::WriteLine('read_open_gap_schema_contracts_observed,windowsNative=false')
[Console]::WriteLine('read_open_gap_schema_engine='+$PSVersionTable.PSVersion.ToString()+',windowsNative=false')
`
  try {
    const file = join(root, 'check.ps1')
    writeFileSync(file, '\uFEFF' + script)
    chmodSync(root, 0o755)
    chmodSync(file, 0o444)
    const image = process.env.TEST_PWSH_DOCKER_IMAGE
    const command = image ? 'docker' : (process.env.TEST_PWSH_BINARY ?? 'pwsh')
    const args = image
      ? [
          'run',
          '--pull=never',
          '--rm',
          '--network=none',
          '--read-only',
          '--cap-drop=ALL',
          '--security-opt=no-new-privileges',
          '--pids-limit=64',
          '--user=65534:65534',
          '--tmpfs=/tmp:rw,noexec,nosuid,size=64m,mode=1777',
          '--env=HOME=/tmp',
          '--mount',
          `type=bind,src=${resolve('frontend/e2e/scripts')},dst=/sources,readonly`,
          '--mount',
          `type=bind,src=${root},dst=/checks,readonly`,
          '--entrypoint=pwsh',
          image,
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          '/checks/check.ps1',
          '-Tools',
          '/sources',
        ]
      : [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          file,
          '-Tools',
          resolve('frontend/e2e/scripts'),
        ]
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const lines = result.stdout.trim().replaceAll('\r\n', '\n').split('\n')
    assert.match(lines[0], /^read_open_gap_partial_sample_observed,windowsNative=false$/)
    assert.match(lines[1], /^read_open_gap_schema_contracts_observed,windowsNative=false$/)
    assert.match(lines[2], /^read_open_gap_schema_engine=.+,windowsNative=false$/)
    assert.equal(lines.length, 3)
    assert.equal(result.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
