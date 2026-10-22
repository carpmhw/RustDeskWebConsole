import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  changedPaths,
  checkDocumentLinks,
  documentationOnly,
  verificationPassed,
  verificationScope,
  affectsTestTools,
} from './ci.mjs'

// fixture 僅使用臨時目錄；完成或失敗皆清理本測試擁有的檔案。
function fixture(action) {
  const root = mkdtempSync(join(tmpdir(), 'rdweb-ci-'))
  try {
    action(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// 測試 git 指令固定參數，不透過 shell 展開測試路徑。
function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

// 建立固定測試身份的提交，不讀取或更動使用者的 git 設定。
function commit(root) {
  git(root, 'add', '.')
  git(
    root,
    '-c',
    'user.name=CI test',
    '-c',
    'user.email=ci@example.invalid',
    'commit',
    '-qm',
    'fixture',
  )
  return git(root, 'rev-parse', 'HEAD')
}

test('只有明確的使用文件變更可略過應用測試', () => {
  assert.equal(
    documentationOnly(['README.md', 'AGENTS.md', 'frontend/e2e/README.md', 'docs/guide.md']),
    true,
  )
  for (const paths of [
    [],
    ['README.md', 'src/app.cs'],
    ['THIRD_PARTY_NOTICES.md'],
    ['LICENSE'],
    ['src/RdWeb.Api/RustDesk/Protos/UPSTREAM.md'],
    ['frontend/src/rdweb/__fixtures__/CODEC_FIXTURES.md'],
    ['.github/workflows/ci.yml'],
    ['frontend/package.json'],
    ['docs/../tools/code.md'],
    ['unknown.md'],
  ])
    assert.equal(documentationOnly(paths), false)
})

test('PR 使用共同祖先，push 使用 before；不可用的來源不略過測試', () =>
  fixture((root) => {
    git(root, 'init', '-q')
    writeFileSync(join(root, 'README.md'), 'base\n')
    const base = commit(root)
    git(root, 'checkout', '-qb', 'feature')
    writeFileSync(join(root, 'README.md'), 'feature\n')
    commit(root)
    git(root, 'checkout', '-qb', 'target', base)
    writeFileSync(join(root, 'app.cs'), 'target\n')
    const target = commit(root)
    git(root, 'checkout', '-q', 'feature')
    assert.deepEqual(changedPaths('pull_request', target, root), ['README.md'])
    assert.equal(documentationOnly(changedPaths('push', target, root)), false)
    for (const sha of [undefined, '', '0'.repeat(40), 'f'.repeat(40), '--help'])
      assert.equal(changedPaths('pull_request', sha, root), null)
    assert.equal(changedPaths('workflow_dispatch', base, root), null)
  }))

test('程式改名為 README 仍偵測刪除的程式；刪除及特殊檔名不會遺漏', () =>
  fixture((root) => {
    git(root, 'init', '-q')
    writeFileSync(join(root, 'app.cs'), 'code\n')
    const base = commit(root)
    git(root, 'mv', 'app.cs', 'README.md')
    commit(root)
    assert.deepEqual(changedPaths('push', base, root), ['README.md', 'app.cs'])
    assert.equal(documentationOnly(changedPaths('push', base, root)), false)
    git(root, 'reset', '--hard', base)
    rmSync(join(root, 'app.cs'))
    commit(root)
    assert.deepEqual(changedPaths('push', base, root), ['app.cs'])
    writeFileSync(join(root, 'two\nlines.md'), 'test\n')
    git(root, 'add', '.')
    commit(root)
    assert.deepEqual(changedPaths('push', base, root), ['app.cs', 'two\nlines.md'])
  }))

test('文件引用驗證本機檔案及 HTML 圖片，拒絕失效與越界引用', () =>
  fixture((root) => {
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'AGENTS.md'), 'guide\n')
    writeFileSync(
      join(root, 'docs', 'guide.md'),
      '[guide](../AGENTS.md#section)\n<img src="../AGENTS.md" />\n[web](https://example.invalid)\n',
    )
    checkDocumentLinks('docs/guide.md', root)
    for (const link of ['missing.md', '../../outside.md', '%2e%2e/%2e%2e/outside.md']) {
      writeFileSync(join(root, 'docs', 'guide.md'), `[bad](${link})\n`)
      assert.throws(() => checkDocumentLinks('docs/guide.md', root))
    }
  }))

// 一般 dev 開發不啟動 Docker E2E；main PR 包含文件變更也必須發布前驗證。
test('verification policy separates daily work from main promotion and manual acceptance', () => {
  assert.deepEqual(verificationScope(['README.md'], 'pull_request', 'dev'), {
    mode: 'docs',
    tools: false,
  })
  assert.deepEqual(verificationScope(['frontend/src/views/Login.vue'], 'pull_request', 'dev'), {
    mode: 'basic',
    tools: false,
  })
  assert.deepEqual(verificationScope(['frontend/e2e/scripts/test-a.mjs'], 'push'), {
    mode: 'basic',
    tools: true,
  })
  for (const paths of [['README.md'], ['src/app.cs'], null, []])
    assert.deepEqual(verificationScope(paths, 'pull_request', 'main'), {
      mode: 'full',
      tools: true,
    })
  for (const event of ['push', 'pull_request', 'workflow_dispatch', 'unknown'])
    assert.deepEqual(verificationScope(null, event, 'dev'), { mode: 'full', tools: true })
  assert.deepEqual(verificationScope(['src/app.cs'], 'push', 'main'), {
    mode: 'basic',
    tools: false,
  })
  assert.deepEqual(verificationScope(['README.md'], 'workflow_dispatch'), {
    mode: 'full',
    tools: true,
  })
  assert.deepEqual(verificationScope(['src/app.cs'], 'pull_request'), { mode: 'full', tools: true })
})

// 依賴、協定 helper、部署與 SDK 的變更不能漏掉診斷工具回歸。
test('tool regressions follow tool and shared dependency changes', () => {
  for (const path of [
    'tools/a.mjs',
    'frontend/e2e/scripts/a.cs',
    'frontend/src/rdweb/host.ts',
    '.github/workflows/ci.yml',
    'deploy/dev/Dockerfile.web',
    'frontend/package.json',
    'frontend/pnpm-lock.yaml',
    'frontend/patches/fzstd.patch',
    'global.json',
    'src/RdWeb.Api/packages.lock.json',
    '.editorconfig',
  ])
    assert.equal(affectsTestTools(path), true)
  for (const path of [
    'frontend/src/views/Login.vue',
    'src/RdWeb.Api/Targets/TargetService.cs',
    'README.md',
  ])
    assert.equal(affectsTestTools(path), false)
})

// 彙總依本次明確範圍檢查所有 job，不能將取消、漏跑或 main 的降級當成成功。
test('fixed gate rejects failed cancelled missing and unexpectedly skipped jobs', () => {
  for (const [mode, tools] of [
    ['docs', 'false'],
    ['basic', 'false'],
    ['basic', 'true'],
    ['full', 'true'],
  ]) {
    const needs = {
      changes: { result: 'success', outputs: { mode, tools } },
      docs: { result: 'success' },
      checks: { result: mode === 'docs' ? 'skipped' : 'success' },
      tools: { result: tools === 'true' ? 'success' : 'skipped' },
    }
    for (const job of ['runtime', 'browser', 'e2e', 'rustdesk-desktop'])
      needs[job] = { result: mode === 'full' ? 'success' : 'skipped' }
    assert.equal(verificationPassed(needs), true)
    assert.equal(verificationPassed(needs, 'pull_request', 'main'), mode === 'full')
    for (const job of Object.keys(needs)) {
      for (const result of ['failure', 'cancelled', 'success', 'skipped']) {
        const bad = JSON.parse(JSON.stringify(needs))
        bad[job].result = result
        if (bad[job].result !== needs[job].result) assert.equal(verificationPassed(bad), false)
      }
      const missing = JSON.parse(JSON.stringify(needs))
      delete missing[job]
      assert.equal(verificationPassed(missing), false)
    }
    needs.changes.outputs.mode = ''
    assert.equal(verificationPassed(needs), false)
  }
})
