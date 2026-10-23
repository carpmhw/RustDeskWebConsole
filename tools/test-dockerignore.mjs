import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = fileURLToPath(new URL('../', import.meta.url))
const cacheLeaves = [
  '.cache/public-sentinel.txt',
  'frontend/.cache/public-sentinel.txt',
  'frontend/e2e/nested/.cache/public-sentinel.txt',
]
const sourceLeaves = [
  'frontend/src/main.ts',
  'frontend/scripts/generate-rustdesk-proto.mjs',
  'frontend/e2e/real/host-observation-control.ts',
  'frontend/src/rdweb/host-input-only-scenario.test.ts',
  'frontend/package.json',
  'frontend/pnpm-lock.yaml',
  'frontend/pnpm-workspace.yaml',
  'frontend/patches/public-fixture.patch',
  'deploy/dev/nginx.conf.template',
  'LICENSE',
]
let exported

// 只使用操作者另行建立的私有fixture根，不自動建立路徑或讀live cache。
function fixtureRoot() {
  assert.equal(process.argv.length, 3, '需指定已授權的私有公開fixture根目錄')
  const root = resolve(process.argv[2])
  for (let path = root; ; path = dirname(path)) {
    const stat = lstatSync(path)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'fixture祖先須為普通目錄')
    if (path === dirname(path)) break
  }
  const stat = lstatSync(root)
  assert.equal(stat.uid, process.getuid())
  assert.equal(stat.mode & 0o777, 0o700)
  return root
}

// 僅建立全公開stand-in context，用真正Docker ignore引擎驗證，不實作另一套glob比對器。
before(() => {
  const fixture = mkdtempSync(join(fixtureRoot(), 'dockerignore-public-'))
  const context = join(fixture, 'context')
  exported = join(fixture, 'exported')
  mkdirSync(context, { mode: 0o700 })
  copyFileSync(join(repo, '.dockerignore'), join(context, '.dockerignore'))
  for (const leaf of [...cacheLeaves, ...sourceLeaves]) {
    const path = join(context, leaf)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path, 'PUBLIC_DOCKER_CONTEXT_FIXTURE\n', { mode: 0o600 })
  }
  writeFileSync(join(context, 'Dockerfile'), 'FROM scratch\nCOPY . /\n', { mode: 0o600 })
  const result = spawnSync(
    'docker',
    ['build', '--progress=plain', '--output', `type=local,dest=${exported}`, context],
    {
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    },
  )
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

// 移除cache排除規則會讓公開sentinel進入輸出，必須實際失敗。
test('Docker context excludes cache directories at every tested depth', () => {
  for (const leaf of cacheLeaves) {
    assert.equal(existsSync(join(exported, leaf)), false, `cache不應進入Docker context：${leaf}`)
  }
})

// 過度排除frontend／E2E會移除必要公開來源，不能以隱藏檢查範圍換取建置通過。
test('Docker context preserves required public build and typecheck sources', () => {
  for (const leaf of sourceLeaves) {
    assert.equal(existsSync(join(exported, leaf)), true, `必要來源應保留於Docker context：${leaf}`)
  }
})
