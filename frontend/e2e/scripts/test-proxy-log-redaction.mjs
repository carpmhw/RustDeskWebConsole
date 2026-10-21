import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const compose = ['compose', '-f', 'deploy/dev/docker-compose.spikes.yml']
const marker = 'rdweb_log_probe_' + Date.now()
const base = (process.env.APP_BASE_PATH ?? '/').replace(/\/$/, '')
const startStack = process.argv.includes('--start')
const env = {
  ...process.env,
  SECRET_KEY: process.env.SECRET_KEY ?? randomBytes(32).toString('base64'),
  VAULT_KEY: process.env.VAULT_KEY ?? randomBytes(32).toString('base64'),
}

// 使用無敏感內容的 query marker 製造 upstream 失敗，確認 nginx 不洩漏完整 URL。
try {
  if (startStack) {
    execFileSync('docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '60'], {
      stdio: 'pipe',
      env,
    })
  }
  execFileSync('docker', [...compose, 'stop', 'backend'], { stdio: 'pipe', env })
  const response = await fetch(
    `http://127.0.0.1:18080${base}/api/v1/health?review_marker=${marker}`,
  )
  // Docker停止後可能拒絕連線或丟棄封包，兩種gateway失敗都必須維持日誌保護。
  assert.ok([502, 504].includes(response.status), '停止backend應造成gateway失敗')
  const logs = execFileSync('docker', [...compose, 'logs', '--no-color', 'web', 'ingress'], {
    encoding: 'utf8',
    env,
  })
  assert.equal(logs.includes(marker), false, 'nginx 錯誤日誌不能包含 query marker')
  console.log('nginx upstream 失敗的請求內容保護：PASS')
} finally {
  execFileSync(
    'docker',
    [...compose, startStack ? 'down' : 'start', ...(startStack ? [] : ['backend'])],
    {
      stdio: 'pipe',
      env,
    },
  )
}
