import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// 真編譯／pure consumer；任何平台均不執行Win32 delayed owner。
test('read race calibration requires fixed payload and complete single-registration evidence', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-clipboard-read-race-')
  try {
    for (const name of [
      'windows-host-observer-native.cs',
      'windows-editor-geometry-native.cs',
      'windows-host-editor-calibration.cs',
      'windows-clipboard-read-race-core.cs',
      'windows-clipboard-read-race-fixture.cs',
      'test-windows-clipboard-read-race.cs',
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
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(
      result.stdout.trim().replaceAll('\r\n', '\n'),
      process.platform === 'win32'
        ? 'read_race_native_factory_guard_not_run,windowsNative=false\nclipboard_read_race_core_observed,windowsNative=false'
        : 'clipboard_read_race_core_observed,windowsNative=false',
    )
    assert.equal(result.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
