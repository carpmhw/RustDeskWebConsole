import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as nextTick } from 'node:timers/promises'
import { after, before, test } from 'node:test'

// 單容器映像的監督行為驗收：需先以 deploy/single/Dockerfile.single 建置並以 RDWEB_SINGLE_IMAGE 指定。
const image = process.env.RDWEB_SINGLE_IMAGE
const startDeadlineMs = 90_000
let secretsDir = ''
let secretKey = ''
let vaultKey = ''
const containers = new Set()

// 執行 docker 指令並回傳結果；不把秘密放進參數。
function docker(args, options = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', ...options })
}

// 依條件輪詢直到成立或逾時；只用於等待容器狀態，不以固定時間判定結果。
async function waitFor(check, message, deadlineMs = startDeadlineMs) {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if (await check()) return
    await nextTick()
  }
  assert.fail(message)
}

// 以正式強化選項啟動單容器（唯讀根目錄、移除 capability、禁止提權），秘密只以檔案掛入。
function start(extraEnv = []) {
  const args = [
    'run',
    '-d',
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--tmpfs',
    '/app/data:uid=1654,gid=1654,mode=0700',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '-p',
    '127.0.0.1::8000',
    '-v',
    `${secretsDir}:/run/secrets:ro`,
    '-e',
    'SECRET_KEY_FILE=/run/secrets/secret_key',
    '-e',
    'VAULT_KEY_FILE=/run/secrets/vault_key',
    '-e',
    'APP_PUBLIC_URL=https://rdweb.example.test/rdweb/',
    '-e',
    'APP_BASE_PATH=/rdweb',
    '-e',
    'DATA_PATH=/app/data/app.db',
    '-e',
    'OUTER_PROXY_ADDRESSES=172.31.81.10',
    ...extraEnv.flatMap((item) => ['-e', item]),
    image,
  ]
  const result = docker(args)
  assert.equal(result.status, 0, result.stderr)
  const id = result.stdout.trim()
  containers.add(id)
  return id
}

// 以容器內健康腳本判定兩個程序皆可用。
function healthy(id) {
  return docker(['exec', id, '/usr/local/bin/rdweb-healthcheck.sh']).status === 0
}

// 讀取容器是否仍在執行。
function running(id) {
  return docker(['inspect', '-f', '{{.State.Running}}', id]).stdout.trim() === 'true'
}

// 列出容器內符合指令列的程序 PID（容器內無 procps，直接讀 /proc）。
function pids(id, pattern) {
  const script = `for d in /proc/[0-9]*; do c=$(tr '\\0' ' ' < "$d/cmdline" 2>/dev/null) || continue; case "$c" in ${pattern}) echo "\${d#/proc/}" ;; esac; done`
  return docker(['exec', id, 'sh', '-c', script]).stdout.split('\n').filter(Boolean)
}

const backendPattern = "'dotnet /app/RdWeb.Api.dll '"
const nginxPattern = "'nginx: master process'*"

// 取得發布到主機的 port。
function hostPort(id) {
  const port = docker(['port', id, '8000/tcp']).stdout.trim().split('\n')[0]
  return port.slice(port.lastIndexOf(':') + 1)
}

// 等待容器結束並回傳結束碼。
function exitCode(id) {
  return Number(docker(['wait', id]).stdout.trim())
}

before(() => {
  assert.ok(image, '需以 RDWEB_SINGLE_IMAGE 指定已建置的單容器映像')
  // 測試專用隨機秘密；目錄需讓容器 app uid 讀取，結束即刪除。
  secretsDir = mkdtempSync(join(tmpdir(), 'rdweb-single-secrets-'))
  secretKey = randomBytes(32).toString('base64')
  vaultKey = randomBytes(32).toString('base64')
  writeFileSync(join(secretsDir, 'secret_key'), secretKey)
  writeFileSync(join(secretsDir, 'vault_key'), vaultKey)
  chmodSync(join(secretsDir, 'secret_key'), 0o644)
  chmodSync(join(secretsDir, 'vault_key'), 0o644)
  chmodSync(secretsDir, 0o755)
})

after(() => {
  for (const id of containers) docker(['rm', '-f', id])
  if (secretsDir) rmSync(secretsDir, { recursive: true, force: true })
})

// 有參數時直接執行後端 CLI 並以其結束碼結束，不進入監督模式。
test('arguments run the backend CLI without starting the gateway', () => {
  const result = docker(['run', '--rm', '--read-only', image, 'healthcheck'], { timeout: 60_000 })
  assert.equal(result.status, 1)
})

// 後端健康後才對外服務；只發布 nginx 的 port，inspect 不含秘密值，安全標頭存在。
test('serves through nginx after backend is healthy and keeps secrets out of inspect', async () => {
  const id = start()
  await waitFor(() => healthy(id), '服務未在時限內健康')
  const ports = docker(['port', id]).stdout.trim().split('\n')
  assert.equal(ports.length, 1)
  assert.match(ports[0], /^8000\/tcp -> 127\.0\.0\.1:\d+$/)
  const port = hostPort(id)
  const page = await fetch(`http://127.0.0.1:${port}/rdweb/`)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-security-policy') ?? '', /default-src 'self'/)
  assert.match(await page.text(), /<base href="\/rdweb\/" \/>/)
  const health = await fetch(`http://127.0.0.1:${port}/rdweb/api/v1/health`)
  assert.equal(health.status, 200)
  const inspect = docker(['inspect', id]).stdout
  assert.ok(!inspect.includes(secretKey) && !inspect.includes(vaultKey))
  docker(['rm', '-f', id])
})

// 後端非預期結束時，容器停止 nginx 並以非零碼結束。
test('backend exit ends the container with a non-zero status', async () => {
  const id = start()
  await waitFor(() => healthy(id), '服務未在時限內健康')
  const [pid] = pids(id, backendPattern)
  assert.ok(pid, '找不到後端程序')
  // 映像沒有獨立的 kill 執行檔，以 shell 內建指令送出訊號，並確認確實送達。
  assert.equal(docker(['exec', id, 'sh', '-c', `kill -KILL ${pid}`]).status, 0)
  assert.notEqual(exitCode(id), 0)
  assert.equal(running(id), false)
})

// nginx 非預期結束時，容器停止後端並以非零碼結束。
test('nginx exit ends the container with a non-zero status', async () => {
  const id = start()
  await waitFor(() => healthy(id), '服務未在時限內健康')
  const [pid] = pids(id, nginxPattern)
  assert.ok(pid, '找不到 nginx 主程序')
  // 映像沒有獨立的 kill 執行檔，以 shell 內建指令送出訊號，並確認確實送達。
  assert.equal(docker(['exec', id, 'sh', '-c', `kill -KILL ${pid}`]).status, 0)
  assert.notEqual(exitCode(id), 0)
  assert.equal(running(id), false)
})

// docker stop 轉送 SIGTERM，兩個程序在時限內結束，不被 SIGKILL（137）。
test('docker stop shuts down both processes within the grace period', async () => {
  const id = start()
  await waitFor(() => healthy(id), '服務未在時限內健康')
  const began = Date.now()
  assert.equal(docker(['stop', '-t', '10', id]).status, 0)
  assert.ok(Date.now() - began < 10_000, '停止超過時限')
  assert.equal(Number(docker(['inspect', '-f', '{{.State.ExitCode}}', id]).stdout.trim()), 0)
})

// 後端存活但未健康時，nginx 不得啟動，對外 port 不提供服務。
test('gateway stays closed while the backend is not healthy', async () => {
  // 指向不可達的 Redis，後端持續存活但健康檢查失敗，形成穩定的「未健康」狀態。
  const id = start(['REDIS_URL=127.0.0.1:1'])
  await waitFor(() => pids(id, backendPattern).length === 1, '後端程序未啟動')
  assert.notEqual(docker(['exec', id, 'dotnet', '/app/RdWeb.Api.dll', 'healthcheck']).status, 0)
  assert.equal(running(id), true)
  assert.deepEqual(pids(id, nginxPattern), [])
  await assert.rejects(fetch(`http://127.0.0.1:${hostPort(id)}/rdweb/`))
  docker(['rm', '-f', id])
})
