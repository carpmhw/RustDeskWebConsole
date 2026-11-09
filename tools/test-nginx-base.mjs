import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// 列出 deploy 底下所有 Dockerfile 的 nginx 基底（含 digest），供確認各部署方式使用同一個 nginx。
function nginxBases(root) {
  const bases = []
  for (const entry of readdirSync(join(root, 'deploy'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith('Dockerfile')) continue
    const path = join(entry.parentPath, entry.name)
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^FROM\s+(nginx:\S+)/.exec(line)
      if (match) bases.push({ path, image: match[1] })
    }
  }
  return bases
}

// 每個 nginx 基底都須以 digest 鎖定，且所有 Dockerfile 使用同一個映像。
function assertSingleNginxBase(root) {
  const bases = nginxBases(root)
  assert.ok(bases.length > 0, '找不到 nginx 基底')
  for (const { path, image } of bases) assert.match(image, /@sha256:[0-9a-f]{64}$/, path)
  assert.equal(new Set(bases.map((base) => base.image)).size, 1, 'nginx 基底不一致')
}

// 在暫存目錄建立假 Dockerfile，驗證檢查本身會抓到不一致與未鎖 digest。
function withDockerfiles(files, action) {
  const root = mkdtempSync(join(tmpdir(), 'rdweb-nginx-base-'))
  try {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(root, 'deploy', name, '..'), { recursive: true })
      writeFileSync(join(root, 'deploy', name), content)
    }
    return action(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const digestA = 'nginx:stable-trixie@sha256:' + 'a'.repeat(64)
const digestB = 'nginx:stable-trixie@sha256:' + 'b'.repeat(64)

// 兩容器 web 與單容器映像必須跑同一個 nginx。
test('all deploy images share one digest-pinned nginx base', () => {
  assertSingleNginxBase(process.cwd())
})

// 檢查在 digest 不同或未鎖定時必須失敗，避免檢查永遠通過。
test('mismatched or unpinned nginx bases are rejected', () => {
  withDockerfiles(
    { 'dev/Dockerfile.web': `FROM ${digestA}\n`, 'single/Dockerfile.single': `FROM ${digestB}\n` },
    (root) => assert.throws(() => assertSingleNginxBase(root), /nginx 基底不一致/),
  )
  withDockerfiles({ 'dev/Dockerfile.web': 'FROM nginx:stable-trixie\n' }, (root) =>
    assert.throws(() => assertSingleNginxBase(root)),
  )
  withDockerfiles(
    { 'dev/Dockerfile.web': `FROM ${digestA}\n`, 'single/Dockerfile.single': `FROM ${digestA}\n` },
    (root) => assert.doesNotThrow(() => assertSingleNginxBase(root)),
  )
})
