import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// 真編譯原fixture及新分類，只有Win32邊界替換，不把managed lease當Windows驗收。
test('lease expiry requires release before stop and complete owned resources', () => {
  assert.ok(
    existsSync('tools/windows-clipboard-lease-calibration.cs'),
    'lease calibration core unavailable',
  )
  const root = mkdtempSync('/tmp/opencode/rdweb-clipboard-lease-core-')
  try {
    for (const name of [
      'windows-host-observer-native.cs',
      'windows-clipboard-busy-calibration.cs',
      'windows-clipboard-lease-calibration.cs',
      'test-windows-clipboard-lease-calibration.cs',
    ])
      copyFileSync(join('tools', name), join(root, name))
    writeFileSync(
      join(root, 'check.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>disable</ImplicitUsings><Nullable>disable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>\n',
      { mode: 0o600 },
    )
    const result = spawnSync('dotnet', ['run', '--project', join(root, 'check.csproj')], {
      encoding: 'utf8',
      timeout: 60000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DOTNET_CLI_TELEMETRY_OPTOUT: '1',
        DOTNET_NOLOGO: '1',
      },
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(result.stdout.trim(), 'clipboard_lease_core_observed,windowsNative=false')
    assert.equal(result.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
