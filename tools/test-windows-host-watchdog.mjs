import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// 真編譯fixture／worker；Linux只替換Win32邊界，不呼原生Sleep或讀Windows thread。
test('native watchdog fixture requires observed delay on the unique worker', () => {
  assert.ok(existsSync('tools/windows-host-watchdog-fixture.cs'), 'watchdog fixture unavailable')
  const root = mkdtempSync('/tmp/opencode/rdweb-host-watchdog-core-')
  try {
    for (const name of ['windows-host-watchdog-fixture.cs', 'test-windows-host-watchdog.cs'])
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
    assert.equal(result.stdout.trim(), 'host_watchdog_fixture_observed,windowsNative=false')
    assert.equal(result.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
