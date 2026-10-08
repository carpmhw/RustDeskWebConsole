import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const compose = ['compose', '-f', 'deploy/dev/docker-compose.spikes.yml']
const marker = 'rdweb_log_probe_' + Date.now()
const base = (process.env.APP_BASE_PATH ?? '/').replace(/\/$/, '')

// 使用無敏感內容的 query marker 製造 upstream 失敗，確認 nginx 不洩漏完整 URL。
try {
  execFileSync('docker', [...compose, 'stop', 'backend'], { stdio: 'pipe' })
  const response = await fetch(
    `http://127.0.0.1:18080${base}/api/v1/health?review_marker=${marker}`,
  )
  assert.equal(response.status, 502)
  const logs = execFileSync('docker', [...compose, 'logs', '--no-color', 'web', 'ingress'], {
    encoding: 'utf8',
  })
  assert.equal(logs.includes(marker), false, 'nginx 錯誤日誌不能包含 query marker')
  console.log('nginx upstream 失敗的請求內容保護：PASS')
} finally {
  execFileSync('docker', [...compose, 'start', 'backend'], { stdio: 'pipe' })
}
