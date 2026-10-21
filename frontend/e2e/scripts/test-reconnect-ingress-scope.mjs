import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertIngressScope,
  assertIngressEntry,
  readIngressOwner,
} from './reconnect-ingress-scope.mjs'

const exact = {
  RDWEB_INPUT_PLATFORMS: 'linux',
  RDWEB_INPUT_CHANNELS: 'chromium',
  RDWEB_B3_BASES: '/rdweb',
  RDWEB_B3_MODES: 'preserve',
}
// 合法scope不可被誤拒，亦不承接其他矩陣預設。
test('ingress accepts exact scope and private runtime capability', () => {
  assert.doesNotThrow(() => assertIngressEntry(exact))
  assert.equal(
    readIngressOwner({
      ...exact,
      RDWEB_B3_SUITE_CONFIG: 'playwright.reconnect-ingress.config.ts',
      RDWEB_E2E_COMPOSE_OVERRIDE: 'frontend/e2e/docker/docker-compose.reconnect-test.yml',
      RDWEB_DEV_PORT: '18081',
      RDWEB_RECONNECT_INGRESS_OWNER: 'a'.repeat(64),
    }),
    'a'.repeat(64),
  )
})
// 缺值、衝突與外部能力值必須先於任何runtime副作用拒絕。
test('ingress rejects missing mixed widened and foreign owner scope', () => {
  const invalid = [
    {},
    ...Object.keys(exact).map(/* 每個必填值獨立缺少。 */ (key) => ({ ...exact, [key]: undefined })),
    { ...exact, RDWEB_INPUT_PLATFORMS: 'windows' },
    { ...exact, RDWEB_INPUT_CHANNEL: 'chrome' },
    { ...exact, APP_BASE_PATH: '/' },
    { ...exact, PREFIX_MODE: 'strip' },
    { ...exact, COMPOSE_PROJECT_NAME: 'foreign' },
    { ...exact, RDWEB_E2E_COMPOSE_OVERRIDE: 'unknown' },
    { ...exact, RDWEB_WINDOWS_HOST_OBSERVE: '1' },
  ]
  for (const env of invalid)
    assert.throws(() => assertIngressScope(env), /ingress_scope_unavailable/)
  for (const owner of ['', 'a'.repeat(64)])
    assert.throws(
      () => assertIngressEntry({ ...exact, RDWEB_RECONNECT_INGRESS_OWNER: owner }),
      /ingress_scope_unavailable/,
    )
  for (const owner of [undefined, '', 'A'.repeat(64), 'a'.repeat(63)])
    assert.throws(
      () => readIngressOwner({ ...exact, RDWEB_RECONNECT_INGRESS_OWNER: owner }),
      /ingress_owner_unavailable/,
    )
})
