import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const cases = [
  ['UTC', 'Pacific/Honolulu', '2026-10-07T16:00:00.0000000+00:00'],
  ['Asia/Taipei', 'UTC', '2026-10-08T00:00:00.0000000+08:00'],
  ['America/New_York', 'UTC', '2026-10-07T12:00:00.0000000-04:00'],
]

// 在同一個非 root aspnet 映像中實跑原生相依及明確的 log 時區轉換。
for (const [zone, containerZone, expected] of cases) {
  const text = execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-e',
      `TZ=${containerZone}`,
      '-e',
      `LOG_TIME_ZONE=${zone}`,
      'rdweb-m0-api',
      'spikes',
    ],
    { encoding: 'utf8', timeout: 60000 },
  )
  const [spikes, log] = text.trim().split('\n').map(JSON.parse)
  assert.equal(spikes.status, 'ok')
  assert.equal(spikes.ed25519, true)
  assert.equal(spikes.protobuf, true)
  assert.equal(spikes.sqliteRows, 20)
  assert.equal(log.Timestamp, expected)
  assert.equal(log.Properties.LogTimeZone, zone)
  console.log(
    `${zone}（容器 TZ=${containerZone}）：PASS，Argon2id ${spikes.argon2idMilliseconds} ms`,
  )
}
const user = execFileSync(
  'docker',
  ['image', 'inspect', 'rdweb-m0-api', '--format', '{{.Config.User}}'],
  { encoding: 'utf8' },
).trim()
assert.equal(user, 'app')
