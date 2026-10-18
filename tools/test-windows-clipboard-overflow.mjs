import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// 真compile及策略測試，任何平台都不呼原生writer。
test('clipboard overflow requires correlated notices and sticky cleanup evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'rdweb-clipboard-overflow-'))
  try {
    for (const name of [
      'windows-host-observer-native.cs',
      'windows-editor-geometry-native.cs',
      'windows-host-editor-calibration.cs',
      'windows-clipboard-overflow-core.cs',
      'windows-clipboard-overflow-fixture.cs',
      'test-windows-clipboard-overflow.cs',
      'test-windows-clipboard-open-diagnostic.cs',
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
    const expected =
      process.platform === 'win32'
        ? 'overflow_native_factory_guard_not_run,windowsNative=false\nclipboard_overflow_core_observed,windowsNative=false'
        : 'clipboard_overflow_core_observed,windowsNative=false'
    assert.equal(result.stdout.trim().replaceAll('\r\n', '\n'), expected)
    assert.equal(result.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
