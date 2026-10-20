import { assertReconnectEnvironment } from './reconnect-preflight.mjs'
// 固定四scope值及alias必須一致，不容跨suite診斷副作用。
export function assertIngressScope(env) {
  try {
    assertReconnectEnvironment(env)
    if (
      env.RDWEB_INPUT_PLATFORMS !== 'linux' ||
      env.RDWEB_INPUT_CHANNELS !== 'chromium' ||
      env.RDWEB_B3_BASES !== '/rdweb' ||
      env.RDWEB_B3_MODES !== 'preserve' ||
      (env.RDWEB_INPUT_CHANNEL !== undefined && env.RDWEB_INPUT_CHANNEL !== 'chromium') ||
      (env.APP_BASE_PATH !== undefined && env.APP_BASE_PATH !== '/rdweb') ||
      (env.PREFIX_MODE !== undefined && env.PREFIX_MODE !== 'preserve') ||
      (env.COMPOSE_PROJECT_NAME !== undefined && env.COMPOSE_PROJECT_NAME !== 'rdweb-m0')
    )
      throw new Error()
  } catch {
    throw new Error('ingress_scope_unavailable')
  }
}
// 能力只能由取得所有權的runner新產生，空值也不例外。
export function assertIngressEntry(env) {
  assertIngressScope(env)
  if (Object.hasOwn(env, 'RDWEB_RECONNECT_INGRESS_OWNER'))
    throw new Error('ingress_scope_unavailable')
}
// Runtime在reset前驗完整接線，token不進browser或錯誤。
export function readIngressOwner(env) {
  assertIngressScope(env)
  if (
    env.RDWEB_B3_SUITE_CONFIG !== 'playwright.reconnect-ingress.config.ts' ||
    env.RDWEB_E2E_COMPOSE_OVERRIDE !== 'deploy/dev/docker-compose.reconnect-test.yml' ||
    env.RDWEB_DEV_PORT !== '18081' ||
    !/^[a-f0-9]{64}$/.test(env.RDWEB_RECONNECT_INGRESS_OWNER ?? '')
  )
    throw new Error('ingress_owner_unavailable')
  return env.RDWEB_RECONNECT_INGRESS_OWNER
}
