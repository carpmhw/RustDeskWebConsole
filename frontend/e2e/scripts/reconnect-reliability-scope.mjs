// 可靠性50次run只接受單一已驗平台、channel與prefix；混合suite能力一律fail closed。
export function assertReliabilityScope(env) {
  const platform = env.RDWEB_RELIABILITY_PLATFORM
  const channel = env.RDWEB_INPUT_CHANNELS ?? env.RDWEB_INPUT_CHANNEL
  if (
    (platform !== 'linux' && platform !== 'windows') ||
    env.RDWEB_INPUT_PLATFORMS !== platform ||
    channel === undefined ||
    !['chromium', 'msedge', 'chrome'].includes(channel) ||
    (env.RDWEB_INPUT_CHANNEL !== undefined && env.RDWEB_INPUT_CHANNEL !== channel) ||
    env.RDWEB_B3_BASES !== '/rdweb' ||
    env.RDWEB_B3_MODES !== 'preserve' ||
    (env.APP_BASE_PATH !== undefined && env.APP_BASE_PATH !== '/rdweb') ||
    (env.PREFIX_MODE !== undefined && env.PREFIX_MODE !== 'preserve') ||
    [
      'RDWEB_WINDOWS_TEXT_PROBE',
      'RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG',
      'RDWEB_WINDOWS_HOST_OBSERVE',
    ].some(
      /* 未啟用的診斷值可為0，其他值不得混入可靠性run。 */ (key) =>
        env[key] !== undefined && env[key] !== '0',
    ) ||
    env.RDWEB_RECONNECT_INGRESS_OWNER !== undefined
  )
    throw new Error('reliability_scope_unavailable')
}
