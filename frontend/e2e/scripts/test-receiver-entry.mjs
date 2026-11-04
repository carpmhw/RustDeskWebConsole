import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { URL } from 'node:url'
import { spawnSync } from 'node:child_process'

// 只讀本次Task29入口檔；不執行PowerShell、真Node runtime或任何socket。
const scripts = new URL('./', import.meta.url)
const read = (name) =>
  readFileSync(new URL(name, scripts), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')

// cmd註解行不參與命令檢查，避免中文REM被誤判成可執行內容。
function commandLines(text) {
  return text.split('\n').filter((line) => {
    const value = line.trim().toLowerCase()
    return value && !value.startsWith('@rem') && !value.startsWith('rem ')
  })
}

// 所有手寫入口都不得引入政策例外或從PATH尋找runtime。
function assertNoBypass(text) {
  assert.doesNotMatch(text, /-ExecutionPolicy|ExecutionPolicy\s+Bypass|Set-ExecutionPolicy/i)
  assert.doesNotMatch(text, /Unblock-File|SmartScreen\s+bypass|AppLocker\s+bypass/i)
}

test('cmd only selects the same-directory node.exe and preserves the child exit code', () => {
  const source = read('start-windows-test-receiver.cmd')
  assert.match(source, /setlocal EnableExtensions DisableDelayedExpansion/i)
  assert.match(source, /NoDefaultCurrentDirectoryInExePath=1/i)
  assert.match(source, /if not exist "%~dp0node\.exe" exit \/b 2/i)
  assert.match(source, /if not exist "%~dp0receiver\.mjs" exit \/b 2/i)
  assert.match(source, /if not exist "%~dp0vp8\.webm" exit \/b 2/i)
  assert.match(source, /if not exist "%~dp0start-windows-test-receiver\.ps1" exit \/b 2/i)
  assert.match(
    source,
    /"%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe" -NoProfile -NonInteractive -File "%~dp0start-windows-test-receiver\.ps1" -Parent "%~1"/i,
  )
  assert.match(source, /exit \/b %ERRORLEVEL%/i)
  for (const line of commandLines(source)) {
    // 任何node提及都必須是帶目錄的runtime路徑，不能是PATH上的裸node。
    if (/\bnode\b/i.test(line)) assert.match(line, /%~dp0node\.exe/i)
  }
  assert.doesNotMatch(source, /\bwhere(\.exe)?\s+node\b/i)
  assert.doesNotMatch(source, /Get-Command\s+node/i)
  assertNoBypass(source)
})

test('PowerShell entry creates a new guarded directory and runs only the same-directory runtime', () => {
  const source = read('start-windows-test-receiver.ps1')
  assert.match(source, /Assert-HostPrivatePath \$parentPath \$true \$owner/)
  assert.match(source, /windows-host-observer-supervisor\.ps1/)
  assert.match(source, /Join-Path \$receiverScriptRoot 'node\.exe'/)
  assert.match(source, /Join-Path \$receiverScriptRoot 'receiver\.mjs'/)
  assert.match(source, /Join-Path \$receiverScriptRoot 'vp8\.webm'/)
  assert.match(source, /binding\.json/)
  assert.match(source, /connection\.json/)
  assert.match(source, /New-PrivateRunDirectory/)
  assert.match(source, /CreateDirectory\(\$Path, \$acl\)/)
  assert.match(source, /SetAccessRuleProtection\(\$true, \$false\)/)
  assert.match(source, /\[IO\.FileMode\]::CreateNew/)
  assert.match(source, /ReparsePoint/)
  assert.match(source, /DriveType\]::Fixed/)
  assert.match(source, /DriveFormat -cne 'NTFS'/)
  assert.match(source, /RDWEB_RECEIVER_PRIVATE_ENTRY = '1'/)
  assert.match(source, /&\s*\$NodePath @Arguments/)
  assert.match(source, /\$MyInvocation\.InvocationName -ne '\.'/)
  assert.doesNotMatch(source, /Get-Command\s+node/i)
  assert.doesNotMatch(source, /\bwhere(\.exe)?\s+node\b/i)
  assert.doesNotMatch(source, /Start-Process/i)
  assert.doesNotMatch(source, /Invoke-WebRequest|Net\.WebClient|TcpClient|Dns\./i)
  assertNoBypass(source)
})

// 舊腳本保留歷史來源檢查；有刪除行為且沿舊回傳介面，不可作新版可派發測試。
test('Windows-only legacy contract source retains its public fake child without network code', () => {
  const source = read('test-windows-test-receiver.ps1')
  assert.match(source, /Windows_NT/)
  assert.match(source, /PSVersionTable\.PSVersion\.Major -ne 5/)
  assert.match(source, /FullLanguage/)
  assert.match(source, /Invoke-ReceiverChild/)
  assert.match(source, /public_receiver_fake_child/)
  assert.match(source, /\$PSHOME 'powershell\.exe'/)
  assert.match(source, /Assert-HostPrivatePath/)
  // CreateNew實作在start入口；本檔改驗它確實呼叫涵蓋同一路徑的設定函式。
  assert.match(source, /Copy-PrivateSetting \$source/)
  assert.match(source, /Copy-PrivateSetting \$moveSource/)
  assert.match(source, /Claim-ReceiverLaunch/)
  assert.match(source, /New-Item -ItemType Junction/)
  assert.match(source, /receiver_entry_contracts_observed/)
  assert.doesNotMatch(source, /Invoke-WebRequest|Net\.WebClient|TcpClient|UdpClient|Dns\./i)
  assert.doesNotMatch(source, /node\.exe/i)
  assertNoBypass(source)
})

// child若把exit寫回success stream或捕獲stdout，新來源契約必須RED；此檢查不執行PS。
test('exit-channel child sends only a normalized code through an explicit reference', () => {
  const source = read('start-windows-test-receiver.ps1')
  const child = source.slice(source.indexOf('function Invoke-ReceiverChild('))
  const body = child.slice(0, child.indexOf('\n}\n') + 3)
  assert.match(body, /\[ref\]\$ExitCode\)/)
  assert.match(
    body,
    /\$ExitCode.Value = 2\s+& \$NodePath @Arguments\s+\$ExitCode.Value = Get-ReceiverExitCode \$LASTEXITCODE/,
  )
  assert.doesNotMatch(body, /\breturn\b|\|\s*Out-|ForEach-Object|2>&1|\$\w+\s*=\s*&/)
})

// start及main任一層再用賦值捕獲函數輸出，都會重新引入混流。
test('exit-channel start and main forward output without assigning the command pipeline', () => {
  const source = read('start-windows-test-receiver.ps1')
  const start = source.slice(source.indexOf('function Invoke-ReceiverStart('))
  assert.match(
    start,
    /function Invoke-ReceiverStart\(\[string\]\$Parent, \[ref\]\$ExitCode\) \{\s+\$ExitCode.Value = 2/,
  )
  assert.match(
    start,
    /Invoke-ReceiverChild -NodePath \$nodePath -Arguments @\(\$bundlePath, 'run', '--directory', \$runPath\) -ExitCode \$ExitCode/,
  )
  assert.match(
    start,
    /\$code = 2\s+try \{ Invoke-ReceiverStart -Parent \$Parent -ExitCode \(\[ref\]\$code\) \}/,
  )
  assert.doesNotMatch(
    start,
    /\$\w+\s*=\s*Invoke-Receiver(?:Child|Start)|return \(Get-ReceiverExitCode/,
  )
  assert.match(
    start,
    /catch \{ \[Console\]::Error.WriteLine\('receiver_unavailable'\); \$code = 2 \}\s+exit \$code/,
  )
})

// 不得透過接受陣列或取最後一項放寬退出碼邊界；保留原數值白名單。
test('exit-channel keeps the scalar-only exit-code whitelist and all entry safety guards', () => {
  const source = read('start-windows-test-receiver.ps1')
  const offset = source.indexOf('function Get-ReceiverExitCode(')
  assert.equal(
    source.slice(offset, source.indexOf('\n}\n', offset) + 3),
    `function Get-ReceiverExitCode($Value) {
    if (($Value -is [int] -or $Value -is [long]) -and @(0, 1, 2) -contains [int]$Value) { return [int]$Value }
    return 2
}
`,
  )
  assert.doesNotMatch(source, /\$Value\[-1\]|Select-Object\s+-Last|Out-Host|Console\]::Out.Write/)
  assertNoBypass(source)
})

// 公開PS回歸只能是待授權來源；不引入舊腳本刪除流程或自動啟原生來補GREEN。
test('exit-channel pending PowerShell regression uses RAM-only public stream and failure cases', () => {
  const source = read('test-receiver-exit-channel.ps1')
  assert.match(source, /\. \(Join-Path \$PSScriptRoot 'start-windows-test-receiver.ps1'\)/)
  assert.match(source, /\[ref\]\$code/)
  assert.match(source, /foreach \(\$raw in @\(0, 1, 2, 7\)\)/)
  assert.match(source, /Microsoft.PowerShell.Core\\Out-Null/)
  assert.match(source, /Microsoft.PowerShell.Utility\\Write-Output/)
  assert.match(source, /Write-ExitChannelPublicStreams/)
  assert.match(source, /Throw-ExitChannelPublicFailure/)
  assert.match(source, /\[Console\]::SetOut\(\$savedOut\)/)
  assert.match(source, /\[Console\]::SetError\(\$savedError\)/)
  assert.doesNotMatch(
    source,
    /Remove-Item|\.Delete\(|WriteAll|CreateDirectory|New-Item|Start-Process|ProcessStartInfo|Invoke-ReceiverStart|node\.exe/i,
  )
  assertNoBypass(source)
})

test('a public fake child receives spaced/unicode directory arguments without a shell', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-receiver-entry-')
  try {
    const directory = join(root, 'public receiver 中文')
    const marker = join(directory, 'fake marker.txt')
    const child = join(root, 'fake-child.mjs')
    mkdirSync(directory)
    writeFileSync(
      child,
      [
        "import { writeFileSync } from 'node:fs'",
        'const [mode, flag, value] = process.argv.slice(2)',
        "if (mode !== 'run' || flag !== '--directory' || value !== process.env.RDWEB_FAKE_EXPECTED) process.exit(2)",
        "writeFileSync(process.env.RDWEB_FAKE_MARKER, 'public_receiver_fake_child')",
        "console.log('receiver_fake_child_observed')",
      ].join('\n'),
      'utf8',
    )
    const env = {
      ...process.env,
      RDWEB_FAKE_EXPECTED: directory,
      RDWEB_FAKE_MARKER: marker,
    }
    const accepted = spawnSync(process.execPath, [child, 'run', '--directory', directory], {
      encoding: 'utf8',
      env,
      timeout: 10000,
    })
    assert.equal(accepted.status, 0)
    assert.match(accepted.stdout, /^receiver_fake_child_observed$/m)
    assert.equal(readFileSync(marker, 'utf8'), 'public_receiver_fake_child')
    const rejected = spawnSync(process.execPath, [child, 'run', '--directory', root], {
      encoding: 'utf8',
      env,
      timeout: 10000,
    })
    assert.equal(rejected.status, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// 來源契約只驗兩個拒絕邊界不再共用分類；不執行PS或宣稱main已原生到達。
test('load-boundary emits a distinct fixed code while retaining main rejection and dot-source throw', () => {
  const source = read('start-windows-test-receiver.ps1')
  const load = source.slice(source.indexOf('# 先驗程式目錄'), source.indexOf('# main先驗私有來源'))
  assert.match(
    load,
    /if \(\$MyInvocation\.InvocationName -ne '\.'\) \{ \[Console\]::Error.WriteLine\('receiver_entry_load_unavailable'\); exit 2 \}\s+throw/,
  )
  assert.doesNotMatch(load, /WriteLine\('receiver_unavailable'\)/)
  const main = source.slice(source.indexOf('# dot-source只定義'))
  assert.match(
    main,
    /catch \{ \[Console\]::Error.WriteLine\('receiver_unavailable'\); \$code = 2 \}\s+exit \$code/,
  )
  assert.doesNotMatch(main, /receiver_entry_load_unavailable/)
  assertNoBypass(source)
})

// 反向還原唯一分類與註解後須逐byte重建am舊入口；同時保留接手測試prefix。
test('load-boundary changes only the load failure literal and its explanation from preserved source', async () => {
  const { createHash } = await import('node:crypto')
  const previous = readFileSync(
    new URL(
      '../../.cache/receiver-exit-channel-validation-20261026-01/start-windows-test-receiver.ps1',
      import.meta.url,
    ),
  )
  assert.equal(previous.length, 7637)
  assert.equal(
    createHash('sha256').update(previous).digest('hex'),
    '8d07ea5ac6b2b364bca0389b76aa5b0929c25d36a6b7ebcbd8fcd8e43510c392',
  )
  const current = readFileSync(new URL('start-windows-test-receiver.ps1', scripts), 'utf8')
  assert.equal(
    current.split("[Console]::Error.WriteLine('receiver_entry_load_unavailable')").length,
    2,
  )
  const restored = current
    .replace(
      "[Console]::Error.WriteLine('receiver_entry_load_unavailable')",
      "[Console]::Error.WriteLine('receiver_unavailable')",
    )
    .replace(
      '# 載入失敗使用獨立固定分類，與main拒絕分開；dot-source仍拋出例外。',
      '# 正式入口只回固定分類；公開測試dot-source時保留例外以便定位。',
    )
  assert.deepEqual(Buffer.from(restored), previous)
  const prefix = readFileSync(new URL('test-receiver-entry.mjs', scripts)).subarray(0, 9792)
  assert.equal(
    createHash('sha256').update(prefix).digest('hex'),
    'fbafb23e3dbf9cdd7ba0e8a066db3eb03123b90883d37d1c6ed1fd7bfd80cd96',
  )
})
