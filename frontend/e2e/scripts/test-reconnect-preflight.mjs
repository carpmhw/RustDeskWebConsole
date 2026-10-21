import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { assertReconnectEnvironment, checkReconnectPorts } from './reconnect-preflight.mjs'

// 所有scope皆從公開環境起建，不讀操作者runtime。
test('reconnect accepts only expected environment and rejects foreign diagnostic gates', () => {
  assert.doesNotThrow(() => assertReconnectEnvironment({}))
  assert.doesNotThrow(() =>
    assertReconnectEnvironment({ RDWEB_DEV_PORT: '18081', RDWEB_WINDOWS_HOST_OBSERVE: '0' }),
  )
  for (const env of [
    { RDWEB_DEV_PORT: '12345' },
    { RDWEB_E2E_COMPOSE_OVERRIDE: '/arbitrary/file.yml' },
    { RDWEB_WINDOWS_HOST_OBSERVE: '1' },
    { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' },
    { RDWEB_WINDOWS_TEXT_PROBE: '1' },
  ])
    assert.throws(() => assertReconnectEnvironment(env), { message: 'reconnect_preflight_failed' })
})

// 用OS選出的公開port驗真bind，不能清理既有listener。
test('reconnect bind preflight rejects occupied port and releases its own probes', async () => {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    await assert.rejects(checkReconnectPorts([port]), { message: 'reconnect_preflight_failed' })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  await checkReconnectPorts([port])
  const next = createServer()
  await new Promise((resolve, reject) => {
    next.once('error', reject)
    next.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve) => next.close(resolve))
})

// 不接受奇怪port參數把preflight變成外部scanner。
test('reconnect rejects invalid preflight port lists', async () => {
  for (const ports of [[], [0], [-1], [1.5], [65536], [1, 1]]) {
    await assert.rejects(checkReconnectPorts(ports), { message: 'reconnect_preflight_failed' })
  }
})

// Runtime wrapper不能接受任意config路徑以繞過固定suite選擇。
test('reconnect wrapper rejects unknown configuration without starting Playwright', () => {
  for (const value of ['unknown.config.ts', '/arbitrary/path.ts']) {
    const result = spawnSync(
      process.execPath,
      ['frontend/e2e/scripts/run-reconnect-playwright.mjs', value],
      {
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        encoding: 'utf8',
        timeout: 5000,
      },
    )
    assert.equal(result.status, 2)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), 'Reconnect suite unavailable')
  }
})
