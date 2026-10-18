import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// 真PS AST／literal consumer，不dot-source任何Windows CLI入口或執行原生。
test('invalid UTF16 PowerShell schemas reject incomplete evidence without native side effects', () => {
  const root = mkdtempSync(join(tmpdir(), 'rdweb-invalid-utf16-schema-'))
  const script = String.raw`param([string]$Tools)
$ErrorActionPreference='Stop'
$file=Join-Path $Tools 'calibrate-windows-clipboard-invalid-utf16.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if ($errors.Count -ne 0) { throw 'parser' }
# 僅載入無副作用的白名單資料型函數，保留真正sample／closed斷言與原stream reader。
foreach ($name in @('Test-InvalidUtf16Mode','Assert-InvalidUtf16Sample','Assert-InvalidUtf16Closed','Test-InvalidUtf16Observed','Read-InvalidUtf16FailureStage','Test-InvalidUtf16Schema')) {
    $definitions=@($ast.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq $name })
    if ($definitions.Count -ne 1) { throw 'definition' }
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}
. (Join-Path $Tools 'windows-host-observer-supervisor.ps1')
Test-InvalidUtf16Schema
# 擷取真正parent sample段，僅替換OS pipe失敗邊界；不執行CLI top-level或程序。
$source=[IO.File]::ReadAllText($file)
$begin="$"+"phase='query_write'";$end="$"+"phase='close'"
$start=$source.IndexOf($begin,[StringComparison]::Ordinal);$finish=$source.IndexOf($end,[StringComparison]::Ordinal)
if ($start -lt 0 -or $finish -le $start -or $source.LastIndexOf($begin,[StringComparison]::Ordinal) -ne $start -or $source.LastIndexOf($end,[StringComparison]::Ordinal) -ne $finish) { throw 'sample_region' }
$sampleBlock=[scriptblock]::Create($source.Substring($start,$finish-$start))
$realReader=(Get-Command Read-HostFrame).ScriptBlock
foreach ($scenario in @('write_throw','missing_reply','invalid_schema','published','not_published')) {
    & {
        $script:sampleWrites=0;$script:sampleReads=0
        # 模擬部分送達後失敗，真parent必須先改為unknown且不能再寫。
        function Write-HostCommand($Stream,$Command,$Clock,$Budget) {
            $script:sampleWrites++
            if ($Command -cne 'sample' -or $Budget -ne 1000) { throw 'command' }
            if ($scenario -ceq 'write_throw') { throw 'Public pipe failure' }
        }
        # 只記真consumer是否開始讀，仍由原有界stream reader解析與判deadline。
        function Read-HostFrame($Stream,$Clock,$Budget) {
            $script:sampleReads++
            return (& $realReader $Stream $Clock $Budget)
        }
        $json='{"kind":"sample","scopeVerified":true,"producerPublished":true,"fixtureVerified":true,"ownerVersionMatched":true,"readerRejected":true,"textReturned":false,"readResourcesClosed":true,"overflow":false,"code":"host_text_invalid"}'
        if ($scenario -ceq 'invalid_schema') { $json='{"kind":"sample","producerPublished":true}' }
        if ($scenario -ceq 'not_published') { $json='{"kind":"sample","scopeVerified":true,"producerPublished":false,"fixtureVerified":true,"ownerVersionMatched":false,"readerRejected":false,"textReturned":false,"readResourcesClosed":false,"overflow":false,"code":"host_capability_unavailable"}' }
        $bytes=[Text.Encoding]::UTF8.GetBytes($json+[char]10)
        if ($scenario -ceq 'missing_reply') { $bytes=[byte[]]@() }
        $commandStream=[IO.MemoryStream]::new();$replyStream=[IO.MemoryStream]::new($bytes)
        try {
            $owned=@{Process=@{StandardInput=@{BaseStream=$commandStream};StandardOutput=@{BaseStream=$replyStream}}}
            $query=[Diagnostics.Stopwatch]::StartNew();$changeState='not_requested';$failed=$false
            try { . $sampleBlock } catch { $failed=$true }
            if ($script:sampleWrites -ne 1 -or $script:sampleReads -ne [int]($scenario -cne 'write_throw')) { throw 'once' }
            $wantFailure=$scenario -in @('write_throw','missing_reply','invalid_schema')
            if ($failed -ne $wantFailure) { throw 'sample_failure' }
            $wantState='unknown';if ($scenario -ceq 'published') { $wantState='published' }
            if ($changeState -cne $wantState) { throw 'change_state' }
        } finally { $commandStream.Dispose();$replyStream.Dispose();[Array]::Clear($bytes,0,$bytes.Length) }
    }
}
[Console]::WriteLine('invalid_utf16_partial_sample_observed,windowsNative=false')
[Console]::WriteLine('invalid_utf16_schema_contracts_observed,windowsNative=false')
[Console]::WriteLine('invalid_utf16_schema_engine='+$PSVersionTable.PSVersion.ToString()+',windowsNative=false')
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
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60_000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /invalid_utf16_schema_contracts_observed,windowsNative=false/)
    console.log(result.stdout.trim())
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
