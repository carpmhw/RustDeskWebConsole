import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// 真AST載入pure白名單；永不dot-source CLI top-level或執行原生。
test('read race diagnostic schemas distinguish complete negative, unknown and late evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'rdweb-read-race-diagnostic-schema-'))
  const script = String.raw`param([string]$Tools)
$ErrorActionPreference='Stop'
$file=Join-Path $Tools 'calibrate-windows-clipboard-read-race-diagnostic.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if ($errors.Count -ne 0) {throw 'parser'}
foreach ($name in @('Test-ReadRaceDiagnosticMode','Assert-ReadRaceDiagnosticSample','Assert-ReadRaceDiagnosticClosed','Assert-ReadRaceDiagnosticPair','Test-ReadRaceDiagnosticLegacy','Test-ReadRaceDiagnosticComplete','Format-ReadRaceDiagnosticResult','Read-ReadRaceDiagnosticFailureStage','Test-ReadRaceDiagnosticSchema')) {
    $definitions=@($ast.EndBlock.Statements | Where-Object {$_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq $name})
    if ($definitions.Count -ne 1) {throw 'definition'}
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}
. (Join-Path $Tools 'windows-host-observer-supervisor.ps1')
Test-ReadRaceDiagnosticSchema
# 舊AST只在測試中載入；移除新欄後比較真正primary predicate。
$old=[Management.Automation.Language.Parser]::ParseFile((Join-Path $Tools 'calibrate-windows-clipboard-read-race.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count -ne 0) {throw 'old_parser'}
foreach ($name in @('Assert-ReadRaceSample','Assert-ReadRaceClosed','Test-ReadRaceObserved')) {
    $definitions=@($old.EndBlock.Statements | Where-Object {$_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq $name})
    if ($definitions.Count -ne 1) {throw 'old_definition'}
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}
$sampleLiteral='{"kind":"sample","scopeVerified":true,"registrationVerified":true,"renderVerified":true,"ownerVersionMatched":true,"readerRejected":true,"textReturned":false,"readResourcesClosed":true,"overflow":false,"code":"host_clipboard_unstable","diagnostic":{"renderSeen":"yes","requestExactlyOnce":"yes","deliveryStatus":"succeeded","sequenceStatus":"changed","failureObserved":"no","firstRenderPhase":"reader_bracket","multipleRenderPhases":"no","evidenceConsistent":true,"traceValid":true,"readerCode":"host_clipboard_unstable"}}'
$closedLiteral='{"kind":"closed","fixtureResourcesClosed":true,"listenerResourcesClosed":true,"overflow":false,"resourcesClosed":true,"diagnostic":{"traceFinalized":true,"lateRender":false,"firstRenderPhase":"reader_bracket","multipleRenderPhases":"no","traceValid":true}}'
foreach ($mutation in @('none','reader','scope','overflow','close')) {
    $a=$sampleLiteral | ConvertFrom-Json;$b=$closedLiteral | ConvertFrom-Json
    switch ($mutation) {
        'reader' {$a.readerRejected=$false}
        'scope' {$a.readerRejected=$false;$a.scopeVerified=$false}
        'overflow' {$a.readerRejected=$false;$a.overflow=$true;$b.overflow=$true}
        'close' {$b.resourcesClosed=$false;$b.fixtureResourcesClosed=$false}
    }
    $oldA=$a | ConvertTo-Json -Depth 4 | ConvertFrom-Json;$oldA.PSObject.Properties.Remove('diagnostic')
    $oldB=$b | ConvertTo-Json -Depth 4 | ConvertFrom-Json;$oldB.PSObject.Properties.Remove('diagnostic')
    if ((Test-ReadRaceDiagnosticLegacy $a $b) -ne (Test-ReadRaceObserved $oldA $oldB)) {throw 'legacy_ast'}
}
# 擷取真parent區段，僅替OS pipe的寫入邊界；不執行CLI top-level。
$source=[IO.File]::ReadAllText($file)
$begin="$"+"phase='query_write'";$end="$"+"phase='close'"
$start=$source.IndexOf($begin,[StringComparison]::Ordinal);$finish=$source.IndexOf($end,[StringComparison]::Ordinal)
if ($start -lt 0 -or $finish -le $start -or $source.LastIndexOf($begin,[StringComparison]::Ordinal) -ne $start -or $source.LastIndexOf($end,[StringComparison]::Ordinal) -ne $finish) {throw 'sample_region'}
$sampleBlock=[scriptblock]::Create($source.Substring($start,$finish-$start))
$realReader=(Get-Command Read-HostFrame).ScriptBlock
foreach ($scenario in @('write_throw','missing_reply','invalid_schema','published','not_published','partial_published')) {
    & {
        $script:diagnosticWrites=0;$script:diagnosticReads=0
        # 真parent必須在寫入可能部分抵達前改unknown，不能再寫。
        function Write-HostCommand($Stream,$Command,$Clock,$Budget) {
            $script:diagnosticWrites++
            if ($changeState -cne 'unknown' -or $Command -cne 'sample' -or $Budget -ne 1000) {throw 'write_guard'}
            if ($scenario -ceq 'write_throw') {throw 'Public pipe failure'}
        }
        # 只記呼叫次數，保留原有界stream reader及deadline。
        function Read-HostFrame($Stream,$Clock,$Budget) { $script:diagnosticReads++;return (& $realReader $Stream $Clock $Budget) }
        $value=$sampleLiteral | ConvertFrom-Json
        if ($scenario -in @('not_published','partial_published')) {
            $value.readerRejected=$false;$value.renderVerified=$false;$value.ownerVersionMatched=$false;$value.code='host_capability_unavailable'
            $value.registrationVerified=($scenario -ceq 'partial_published')
            foreach ($name in @('renderSeen','requestExactlyOnce','deliveryStatus','sequenceStatus','failureObserved','firstRenderPhase','multipleRenderPhases','readerCode')) {$value.diagnostic.$name='unknown'}
            $value.diagnostic.evidenceConsistent=$false;$value.diagnostic.traceValid=$false
        }
        $json=$value | ConvertTo-Json -Depth 4 -Compress
        if ($scenario -ceq 'invalid_schema') {$json='{"kind":"sample","diagnostic":{"traceValid":true}}'}
        $bytes=[Text.Encoding]::UTF8.GetBytes($json+[char]10);if ($scenario -ceq 'missing_reply') {$bytes=[byte[]]@()}
        $inputStream=[IO.MemoryStream]::new();$outputStream=[IO.MemoryStream]::new($bytes)
        try {
            $owned=@{Process=@{StandardInput=@{BaseStream=$inputStream};StandardOutput=@{BaseStream=$outputStream}}}
            $query=[Diagnostics.Stopwatch]::StartNew();$changeState='not_requested';$failed=$false
            try {. $sampleBlock} catch {$failed=$true}
            if ($script:diagnosticWrites -ne 1 -or $script:diagnosticReads -ne [int]($scenario -cne 'write_throw')) {throw 'once'}
            if ($failed -ne ($scenario -in @('write_throw','missing_reply','invalid_schema'))) {throw 'partial_failure'}
            $wantState='unknown';if ($scenario -in @('published','partial_published')) {$wantState='published'}
            if ($changeState -cne $wantState) {throw 'partial_state'}
        } finally {$inputStream.Dispose();$outputStream.Dispose();[Array]::Clear($bytes,0,$bytes.Length)}
    }
}
[Console]::WriteLine('read_race_diagnostic_partial_sample_observed,windowsNative=false')
[Console]::WriteLine('read_race_diagnostic_schema_contracts_observed,windowsNative=false')
[Console]::WriteLine('read_race_diagnostic_schema_engine='+$PSVersionTable.PSVersion.ToString()+',windowsNative=false')
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
          `type=bind,src=${resolve('tools')},dst=/sources,readonly`,
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
      : ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', file, '-Tools', resolve('tools')]
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(
      result.stdout,
      /read_race_diagnostic_schema_contracts_observed,windowsNative=false/,
    )
    console.log(result.stdout.trim())
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
