import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// 真compiled state與ObserveClipboard早拒絕；不可執行Windows通知／clipboard邊界才替換。
test('queued clipboard race preserves first notice and rejects stale version before open', () => {
  assert.ok(
    existsSync('tools/windows-clipboard-race-calibration.cs'),
    'race calibration core unavailable',
  )
  const root = mkdtempSync('/tmp/opencode/rdweb-clipboard-race-core-')
  try {
    for (const name of [
      'windows-host-observer-native.cs',
      'windows-editor-geometry-native.cs',
      'windows-host-editor-calibration.cs',
      'windows-clipboard-calibration.cs',
      'windows-clipboard-notification-calibration.cs',
      'windows-clipboard-race-calibration.cs',
      'test-windows-clipboard-race-calibration.cs',
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
    assert.equal(result.stdout.trim(), 'clipboard_race_core_observed,windowsNative=false')
    assert.equal(result.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
