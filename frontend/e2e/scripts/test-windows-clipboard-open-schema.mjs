import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { URL } from 'node:url'

// 真PowerShell載入純函數，不執行CLI入口、政策、UIA或任何剪貼簿原生呼叫。
test('PowerShell resolver preserves false diagnostic flags and all literal schemas', () => {
  const root = mkdtempSync(join(tmpdir(), 'rdweb-open-schema-'))
  const script = String.raw`param([string]$Tools,[string]$OperationCard,[string]$OperationLaunchTest,[string]$OperationInstallTest)
$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $Tools 'calibrate-windows-clipboard-overflow.ps1'),[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'parser' }
$names=@('Get-OverflowSourceNames','Test-OverflowMode','Assert-OverflowShape','Assert-OverflowSample','Assert-OverflowClosed','Test-OverflowObserved','Read-OverflowFailureStage','Test-OverflowSchema')
# 僅擷取白名單頂層函數的原始AST，不dot-source有Windows入口的CLI。
foreach ($name in $names) {
    $definitions=@($ast.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq $name })
    if ($definitions.Count -ne 1) { throw 'definition' }
    . ([scriptblock]::Create($definitions[0].Extent.Text))
}
. (Join-Path $Tools 'windows-host-observer-supervisor.ps1')
. (Join-Path $Tools 'windows-clipboard-overflow-diagnostic.ps1')
. (Join-Path $Tools 'windows-clipboard-overflow-open-diagnostic.ps1')
$failed=$false
# 直接驗真resolver的手寫期望值，覆寫參數的回歸必須在此被抓到。
try {
    $result=Get-OverflowSourceNames 'calibrate-windows-clipboard-overflow-diagnostic.ps1' $false
    if ($result.Core -cne 'windows-clipboard-overflow-core.cs' -or $result.Fixture -cne 'windows-clipboard-overflow-fixture.cs') { throw 'oracle' }
    [Console]::WriteLine('open_schema_case_observed,case=legacy_false')
} catch { $failed=$true;[Console]::WriteLine('open_schema_case_unavailable,case=legacy_false') }
# 固定02專用入口只選既有共同來源，大小寫變化不改契約。
try {
    foreach ($entry in @('calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1','CALIBRATE-WINDOWS-CLIPBOARD-OVERFLOW-OPEN-DIAGNOSTIC-02.PS1')) {
        foreach ($diagnostic in @($false,$true)) {
            $result=Get-OverflowSourceNames $entry $diagnostic $true
            if ($result.Core -cne 'windows-clipboard-overflow-core-open-diagnostic.cs' -or $result.Fixture -cne 'windows-clipboard-overflow-fixture-open-diagnostic.cs') { throw 'oracle' }
        }
    }
    [Console]::WriteLine('open_schema_case_observed,case=entry02_resolver')
} catch { $failed=$true;[Console]::WriteLine('open_schema_case_unavailable,case=entry02_resolver') }
# 手寫truth-table驗新入口仍需雙診斷旗標，schema與native模式不可混搭。
try {
    $entry='calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1'
    $cases=@(
        @{O=$false;A=$false;S=$true;C=$false;F=$true;N=$true;Want=$true},
        @{O=$true;A=$true;S=$false;C=$false;F=$true;N=$true;Want=$true},
        @{O=$true;A=$true;S=$false;C=$true;F=$true;N=$true;Want=$true},
        @{O=$false;A=$false;S=$true;C=$false;F=$false;N=$true;Want=$false},
        @{O=$false;A=$false;S=$true;C=$false;F=$true;N=$false;Want=$false},
        @{O=$false;A=$false;S=$true;C=$false;F=$false;N=$false;Want=$false},
        @{O=$false;A=$false;S=$true;C=$true;F=$true;N=$true;Want=$false},
        @{O=$true;A=$true;S=$true;C=$false;F=$true;N=$true;Want=$false},
        @{O=$true;A=$false;S=$false;C=$false;F=$true;N=$true;Want=$false},
        @{O=$false;A=$true;S=$false;C=$false;F=$true;N=$true;Want=$false},
        @{O=$false;A=$false;S=$false;C=$false;F=$true;N=$true;Want=$false}
    )
    foreach ($case in $cases) {
        if ((Test-OverflowMode $case.O $case.A $case.S $case.C $case.F $case.N $entry) -ne $case.Want) { throw 'oracle' }
    }
    if (-not (Test-OverflowMode $false $false $true $false $true $true $entry.ToUpperInvariant())) { throw 'oracle' }
    [Console]::WriteLine('open_schema_case_observed,case=entry02_mode')
} catch { $failed=$true;[Console]::WriteLine('open_schema_case_unavailable,case=entry02_mode') }
# 新alias缺Open或近似名稱一律拒絕，不能任意path／wildcard fallback。
try {
    $rejected=$false
    try { [void](Get-OverflowSourceNames 'calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1' $true $false) } catch { $rejected=$true }
    if (-not $rejected) { throw 'oracle' }
    foreach ($entry in @('calibrate-windows-clipboard-overflow-open-diagnostic-03.ps1','calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1.bak','calibrate-windows-clipboard-overflow-open-diagnostic-02-extra.ps1','public/calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1')) {
        $rejected=$false;try { [void](Get-OverflowSourceNames $entry $true $true) } catch { $rejected=$true }
        if (-not $rejected -or (Test-OverflowMode $false $false $true $false $true $true $entry)) { throw 'oracle' }
    }
    [Console]::WriteLine('open_schema_case_observed,case=entry02_strict')
} catch { $failed=$true;[Console]::WriteLine('open_schema_case_unavailable,case=entry02_strict') }
# 執行原有oracle全文，不替代或改寫既有schema斷言。
foreach ($name in @('Test-OverflowSchema','Test-OverflowDiagnosticSchema','Test-OverflowOpenDiagnosticSchema')) {
    try { & $name;[Console]::WriteLine('open_schema_case_observed,case='+$name) }
    catch { $failed=$true;[Console]::WriteLine('open_schema_case_unavailable,case='+$name) }
}
[Console]::WriteLine('open_schema_engine='+$PSVersionTable.PSVersion.ToString()+',windowsNative=false')
# 解析實際操作卡；只在非Windows執行其環境拒絕路徑，不進入解壓或子程序。
$tokens=$null;$parseErrors=$null
[void][Management.Automation.Language.Parser]::ParseFile($OperationCard,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'operation_card_parser' }
if ($env:OS -ne 'Windows_NT') {
    & $OperationCard
    try { & $OperationLaunchTest;[Console]::WriteLine('open_schema_case_observed,case=handoff_exit_capture') }
    catch { $failed=$true;[Console]::WriteLine('open_schema_case_unavailable,case=handoff_exit_capture') }
    try { & $OperationInstallTest -Root ([IO.Path]::GetDirectoryName($OperationInstallTest));[Console]::WriteLine('open_schema_case_observed,case=entry02_preinstall') }
    catch { $failed=$true;[Console]::WriteLine('open_schema_case_unavailable,case=entry02_preinstall') }
}
if ($failed) { exit 1 }
`
  try {
    const file = join(root, 'check.ps1')
    writeFileSync(file, '\uFEFF' + script)
    // 歷史執行單元獨立保存為文字fixture，不再依賴本機忽略的Markdown文件。
    const card = readFileSync(
      new URL('../fixtures/windows-clipboard-open-schema-operation.ps1.txt', import.meta.url),
      'utf8',
    )
    writeFileSync(join(root, 'operation-card.ps1'), '\uFEFF' + card)
    // 執行操作卡真正的啟動／捕捉片段，只把OS程序邊界換成公開的固定exit命令。
    const launchStart = card.indexOf("$stage='schema';")
    const launchEnd = card.indexOf(
      "$expected='host_clipboard_overflow_open_diagnostic_schema_observed",
    )
    assert.ok(launchStart >= 0 && launchEnd > launchStart)
    const launch = card.slice(launchStart, launchEnd)
    const launchTest = String.raw`# 真程序exit必須被本次操作卡捕捉，不可沿用舊值或被local變數遮蔽。
& {
    $ErrorActionPreference='Stop';$exe='/bin/false';$destination='/checks';$schemaExit=$null
    $global:LASTEXITCODE=99
    ${launch}
    if ($schemaExit -ne 1) { throw 'exit_capture' }
}
# 啟動失敗只准回未取得，不可繼承上一個成功程序的退出碼。
& {
    $ErrorActionPreference='Stop';$exe='/missing-public-test-executable';$destination='/checks';$schemaExit=$null
    $global:LASTEXITCODE=0;$caught=$false
    try { ${launch} } catch { $caught=$true }
    if (-not $caught -or $null -ne $schemaExit) { throw 'stale_exit' }
}
`
    writeFileSync(join(root, 'operation-launch-test.ps1'), '\uFEFF' + launchTest)
    // 執行卡片真實共同來源與安裝guard；只替換Linux沒有的NTFS ACL／寫入邊界。
    const sharedStart = card.indexOf("$stage='shared_sources'")
    const sharedEnd = card.indexOf("$stage='archive_hash'")
    const installStart = card.indexOf(
      "$entryName='calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1'",
    )
    const installEnd = card.indexOf("$stage='schema';")
    assert.ok(sharedStart >= 0 && sharedEnd > sharedStart)
    assert.ok(installStart >= 0 && installEnd > installStart)
    const shared = card.slice(sharedStart, sharedEnd)
    const install = card.slice(installStart, installEnd)
    const sharedSources = {
      'windows-clipboard-overflow-core-open-diagnostic.cs': 'windows-clipboard-overflow-core.cs',
      'windows-clipboard-overflow-fixture-open-diagnostic.cs':
        'windows-clipboard-overflow-fixture.cs',
      'windows-clipboard-overflow-open-diagnostic.ps1':
        'windows-clipboard-overflow-open-diagnostic.ps1',
    }
    for (const folder of ['shared-good', 'shared-bad']) {
      mkdirSync(join(root, folder), { mode: 0o755 })
      for (const [name, source] of Object.entries(sharedSources)) {
        writeFileSync(
          join(root, folder, name),
          readFileSync(join('frontend/e2e/scripts', source)),
          {
            mode: 0o444,
          },
        )
      }
    }
    chmodSync(join(root, 'shared-bad', 'windows-clipboard-overflow-core-open-diagnostic.cs'), 0o644)
    writeFileSync(
      join(root, 'shared-bad', 'windows-clipboard-overflow-core-open-diagnostic.cs'),
      'Public mismatched source\n',
    )
    chmodSync(join(root, 'shared-bad', 'windows-clipboard-overflow-core-open-diagnostic.cs'), 0o444)
    writeFileSync(
      join(root, 'shared-good', 'calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1'),
      readFileSync('frontend/e2e/scripts/calibrate-windows-clipboard-overflow.ps1'),
      { mode: 0o444 },
    )
    writeFileSync(
      join(root, 'shared-good', 'calibrate-windows-clipboard-overflow-open-diagnostic.ps1'),
      'Public retained old entry\n',
      { mode: 0o444 },
    )
    const installTest = String.raw`param([string]$Root)
$ErrorActionPreference='Stop';$script:aclMode='own';$script:writeCalls=0;$script:allowFixtureWrite=$false
# 僅替NTFS邊界提供完整owner／Allow規則，不替換真正hash或來源驗證策略。
function Get-Acl {
    [CmdletBinding()]param([string]$LiteralPath)
    $owner='public_owner';if ($script:aclMode -ceq 'foreign_owner') { $owner='public_other' }
    $acl=[pscustomobject]@{Owner=$owner;Foreign=($script:aclMode -ceq 'foreign_allow')}
    # 回報固定公開owner，測試外來owner必須被真guard拒絕。
    $acl | Add-Member -MemberType ScriptMethod -Name GetOwner -Value { param($Kind) return $this.Owner }
    # 規則模型保留原Allow欄位，外來Allow不能被忽略。
    $acl | Add-Member -MemberType ScriptMethod -Name GetAccessRules -Value {
        param($Explicit,$Inherited,$Kind)
        $rows=@([pscustomobject]@{AccessControlType=[Security.AccessControl.AccessControlType]::Allow;IdentityReference='public_owner'})
        if ($this.Foreign) { $rows+=([pscustomobject]@{AccessControlType=[Security.AccessControl.AccessControlType]::Allow;IdentityReference='public_other'}) }
        return $rows
    }
    return $acl
}
# 真安裝guard不得在已有02入口時抵達寫入邊界。
function Expand-Archive {
    [CmdletBinding()]param([string]$LiteralPath,[string]$DestinationPath)
    $script:writeCalls++
    if ($script:allowFixtureWrite) { Microsoft.PowerShell.Archive\Expand-Archive -LiteralPath $LiteralPath -DestinationPath $DestinationPath -ErrorAction Stop }
}
& {
    $destination=Join-Path $Root 'shared-good';$sid='public_owner'
    ${shared}
}
foreach ($mode in @('foreign_owner','foreign_allow','bad_hash')) {
    $script:aclMode=$mode;$caught=$false
    try {
        & {
            $destination=Join-Path $Root 'shared-good';if ($mode -ceq 'bad_hash') { $destination=Join-Path $Root 'shared-bad' }
            $sid='public_owner'
            ${shared}
        }
    } catch { $caught=$true }
    if (-not $caught) { throw 'shared_guard' }
}
$script:aclMode='own';$caught=$false
try {
    & {
        $destination=Join-Path $Root 'shared-good';$sid='public_owner';$zip='public-unused.zip'
        ${install}
    }
} catch { $caught=$true }
if (-not $caught -or $script:writeCalls -ne 0) { throw 'entry_collision' }
# 自有Linux暫存中真解壓一次單入口ZIP；原01入口與三個共同檔必須逐byte保留。
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('rdweb-entry02-positive-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temporary)
try {
    $destination=Join-Path $temporary 'target';[void][IO.Directory]::CreateDirectory($destination)
    $retained=@('calibrate-windows-clipboard-overflow-open-diagnostic.ps1','windows-clipboard-overflow-core-open-diagnostic.cs','windows-clipboard-overflow-fixture-open-diagnostic.cs','windows-clipboard-overflow-open-diagnostic.ps1')
    $before=@{}
    foreach ($name in $retained) {
        $path=Join-Path $destination $name
        Copy-Item -LiteralPath (Join-Path (Join-Path $Root 'shared-good') $name) -Destination $path -ErrorAction Stop
        $before[$name]=(Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop).Hash
    }
    $zip=Join-Path $temporary 'public-single-entry.zip'
    Microsoft.PowerShell.Archive\Compress-Archive -LiteralPath (Join-Path (Join-Path $Root 'shared-good') 'calibrate-windows-clipboard-overflow-open-diagnostic-02.ps1') -DestinationPath $zip -ErrorAction Stop
    $script:allowFixtureWrite=$true;$script:writeCalls=0;$sid='public_owner'
    ${install}
    if ($script:writeCalls -ne 1 -or @(Get-ChildItem -LiteralPath $destination -Force).Count -ne 5) { throw 'single_entry' }
    foreach ($name in $retained) {
        if ((Get-FileHash -LiteralPath (Join-Path $destination $name) -Algorithm SHA256 -ErrorAction Stop).Hash -cne $before[$name]) { throw 'retained_source' }
    }
} finally { $script:allowFixtureWrite=$false;[IO.Directory]::Delete($temporary,$true) }
`
    writeFileSync(join(root, 'operation-install-test.ps1'), '\uFEFF' + installTest)
    // scratch只有公開測試腳本，允許唯讀容器的非root使用者讀取。
    chmodSync(root, 0o755)
    chmodSync(file, 0o444)
    chmodSync(join(root, 'operation-card.ps1'), 0o444)
    chmodSync(join(root, 'operation-launch-test.ps1'), 0o444)
    chmodSync(join(root, 'operation-install-test.ps1'), 0o444)
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
          '-OperationCard',
          '/checks/operation-card.ps1',
          '-OperationLaunchTest',
          '/checks/operation-launch-test.ps1',
          '-OperationInstallTest',
          '/checks/operation-install-test.ps1',
        ]
      : [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          file,
          '-Tools',
          resolve('frontend/e2e/scripts'),
          '-OperationCard',
          join(root, 'operation-card.ps1'),
          '-OperationLaunchTest',
          join(root, 'operation-launch-test.ps1'),
          '-OperationInstallTest',
          join(root, 'operation-install-test.ps1'),
        ]
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60_000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /open_schema_case_observed,case=legacy_false/)
    assert.match(result.stdout, /open_schema_case_observed,case=Test-OverflowOpenDiagnosticSchema/)
    assert.doesNotMatch(result.stdout, /open_schema_case_unavailable/)
    if (image || process.platform !== 'win32') {
      assert.match(
        result.stdout,
        /host_clipboard_open_schema_handoff_unavailable,stage=environment/,
      )
      assert.match(result.stdout, /OverflowOpenDiagnosticSchemaExit=not_started/)
      assert.match(result.stdout, /open_schema_case_observed,case=handoff_exit_capture/)
      assert.match(result.stdout, /open_schema_case_observed,case=entry02_preinstall/)
    }
    console.log(result.stdout.trim())
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
