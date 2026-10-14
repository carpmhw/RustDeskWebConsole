import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
// .NET10 SDK純core校準：無新NuGet包、無Windows原生操作，只殺自己建立的blocking child。
test('native helper pure text and bounded pipe contracts do not require Windows', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-host-core-')
  try {
    for (const name of ['windows-host-observer-native.cs', 'test-windows-host-observer-core.cs'])
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
    assert.equal(
      value.stdout.trim(),
      'public_pipe_contracts=4,public_text_contracts=4,windowsNative=false',
    )
    assert.equal(value.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
