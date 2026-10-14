import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// 執行真C#整數外包與越界拒絕，不以Linux結果冒充cursor／UIA原生PASS。
test('editor geometry encloses public bounds and rejects invalid scope', () => {
  assert.ok(existsSync('tools/windows-editor-geometry-native.cs'), 'geometry core is unavailable')
  const root = mkdtempSync('/tmp/opencode/rdweb-editor-geometry-')
  try {
    for (const name of ['windows-editor-geometry-native.cs', 'test-windows-editor-geometry.cs'])
      copyFileSync(join('tools', name), join(root, name))
    writeFileSync(
      join(root, 'check.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>disable</ImplicitUsings><Nullable>disable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>\n',
      { mode: 0o600 },
    )
    const value = spawnSync('dotnet', ['run', '--project', join(root, 'check.csproj')], {
      encoding: 'utf8',
      timeout: 60000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DOTNET_CLI_TELEMETRY_OPTOUT: '1',
        DOTNET_NOLOGO: '1',
      },
    })
    assert.equal(value.status, 0, value.stdout + value.stderr)
    assert.equal(value.stdout.trim(), 'geometry_core_observed,windowsNative=false')
    assert.equal(value.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
