import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// 真編譯共享observer策略與fake-native契約，不呼叫Windows原生owner。
test('shared observer classifies one controlled read-open gap and fake native ownership', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-read-open-gap-')
  try {
    for (const name of [
      'windows-host-observer-native.cs',
      'windows-editor-geometry-native.cs',
      'windows-host-editor-calibration.cs',
      'windows-clipboard-read-open-gap-core.cs',
      'windows-clipboard-read-open-gap-fixture.cs',
      'test-windows-clipboard-read-open-gap.cs',
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
    const markers = [
      'clipboard_read_open_gap_core_observed,windowsNative=false',
      'clipboard_read_open_gap_fixture_contracts_observed,windowsNative=false',
    ]
    if (process.platform === 'win32')
      markers.unshift('read_open_gap_native_factory_guard_not_run,windowsNative=false')
    assert.equal(result.stdout.trim().replaceAll('\r\n', '\n'), markers.join('\n'))
    assert.equal(result.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
