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

test('Windows-only contract test uses a public fake child and never opens the network', () => {
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
