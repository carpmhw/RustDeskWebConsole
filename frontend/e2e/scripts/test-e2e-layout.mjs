import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { test } from 'node:test'

const frontend = fileURLToPath(new URL('../../', import.meta.url))

// 固定公開入口的實際資源必須存在，避免搬移後 pnpm 與文件指向不存在的案例。
test('consolidated suites expose their management and harness entrypoints', () => {
  for (const path of [
    'e2e/management/auth.spec.ts',
    'e2e/management/helpers/fixtures.ts',
    'e2e/real/console-login.spec.ts',
    'e2e/ui/index.html',
    'e2e/codecs/index.html',
    'e2e/proxy/http.test.ts',
    'e2e/config/playwright.config.ts',
    'e2e/config/vite.ui.config.ts',
  ]) {
    assert.equal(existsSync(frontend + path), true, path)
  }
})

// 禁止留下會誤導測試探索的舊入口；一般 Vite 與產品 tsconfig 不在搬移範圍。
test('frontend root has no parallel E2E suites or dedicated configs', () => {
  for (const name of readdirSync(frontend)) {
    assert.equal(/^e2e-/.test(name), false, name)
    assert.equal(/^playwright.*\.config\.ts$/.test(name), false, name)
  }
  assert.equal(existsSync(frontend + 'vite.config.ts'), true)
  assert.equal(existsSync(frontend + 'tsconfig.json'), true)
})

// 專用 runner 與 Docker 來源集中管理，共用開發及 Redis 入口則維持可用。
test('dedicated runtimes resolve alongside suites without moving shared development stacks', () => {
  for (const path of [
    'e2e/scripts/test-subpaths.sh',
    'e2e/scripts/test-m3b3-reliability.sh',
    'e2e/docker/docker-compose.rustdesk-test.yml',
    'e2e/docker/Dockerfile.rustdesk-client',
    'e2e/fixtures/windows-clipboard-open-schema-operation.ps1.txt',
    '../deploy/dev/docker-compose.spikes.yml',
    '../deploy/dev/docker-compose.redis-test.yml',
  ]) {
    assert.equal(existsSync(frontend + path), true, path)
  }
})
