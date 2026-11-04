import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// 真.NET950／936／1252 reader驗public PS5.1交付位元，不將字元編碼通過當成parser／native PASS。
test('host PowerShell sources preserve Unicode and line breaks under legacy default readers', () => {
  const root = mkdtempSync('/tmp/opencode/rdweb-host-encoding-')
  try {
    copyFileSync('frontend/e2e/scripts/test-windows-host-encoding.cs', join(root, 'Program.cs'))
    writeFileSync(
      join(root, 'check.csproj'),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>disable</ImplicitUsings><Nullable>disable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>\n',
      { mode: 0o600 },
    )
    const value = spawnSync(
      'dotnet',
      ['run', '--project', join(root, 'check.csproj'), '--', resolve('frontend/e2e/scripts')],
      {
        encoding: 'utf8',
        timeout: 60000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          DOTNET_CLI_TELEMETRY_OPTOUT: '1',
          DOTNET_NOLOGO: '1',
        },
      },
    )
    assert.equal(value.status, 0, value.stdout + value.stderr)
    assert.equal(value.stdout.trim(), 'host_source_encoding_preserved,windowsParser=false')
    assert.equal(value.stderr, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
