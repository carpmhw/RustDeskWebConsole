import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

// 純Compose parser不連daemon，不輸出完整config、不載.env或操作者敏感環境。
for (const base of ['/', '/rdweb', '/a/b/c']) {
  for (const mode of ['preserve', 'strip']) {
    test('reconnect compose keeps public origin and private upstream: ' + base + '/' + mode, () => {
      const value = spawnSync(
        'docker',
        [
          'compose',
          '--env-file',
          '/dev/null',
          '-f',
          'deploy/dev/docker-compose.spikes.yml',
          '-f',
          'frontend/e2e/docker/docker-compose.browser-login-test.yml',
          '-f',
          'frontend/e2e/docker/docker-compose.reconnect-test.yml',
          'config',
          '--format',
          'json',
        ],
        {
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            APP_BASE_PATH: base,
            PREFIX_MODE: mode,
            RDWEB_DEV_PORT: '18081',
            RDWEB_RECONNECT_INGRESS_OWNER: '0'.repeat(64),
          },
          encoding: 'utf8',
          timeout: 10000,
        },
      )
      assert.equal(value.status, 0, 'Compose configuration parse failed')
      let configuration
      try {
        configuration = JSON.parse(value.stdout)
      } catch {
        throw new Error('Compose configuration unavailable')
      }
      const services = configuration.services
      assert.equal(services.ingress.labels['rdweb.test.reconnect-ingress-owner'], '0'.repeat(64))
      for (const name of ['web', 'backend'])
        assert.equal(
          Object.hasOwn(services[name].labels ?? {}, 'rdweb.test.reconnect-ingress-owner'),
          false,
        )
      assert.equal(services.backend.environment.APP_PUBLIC_URL, 'http://127.0.0.1:18080' + base)
      assert.equal(services.backend.environment.APP_BASE_PATH, base)
      assert.equal(services.backend.environment.TRUSTED_PROXIES, '172.30.70.0/24')
      assert.equal(services.ingress.ports.length, 1)
      assert.equal(String(services.ingress.ports[0].published), '18081')
      assert.equal(services.ingress.ports[0].host_ip, '127.0.0.1')
      assert.equal(services.ingress.environment.PREFIX_MODE, mode)
      assert.equal(Object.hasOwn(services.backend.networks, 'official-rustdesk'), true)
    })
  }
}
