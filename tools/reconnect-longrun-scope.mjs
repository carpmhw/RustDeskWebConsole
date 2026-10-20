// 精確四個顯式scope值必須齊備，衝突alias或runtime prefix同樣fail closed。
export function assertLongrunScope(env) {
  if (
    env.RDWEB_INPUT_PLATFORMS !== 'linux' ||
    env.RDWEB_INPUT_CHANNELS !== 'chromium' ||
    env.RDWEB_B3_BASES !== '/rdweb' ||
    env.RDWEB_B3_MODES !== 'preserve' ||
    (env.RDWEB_INPUT_CHANNEL !== undefined && env.RDWEB_INPUT_CHANNEL !== 'chromium') ||
    (env.APP_BASE_PATH !== undefined && env.APP_BASE_PATH !== '/rdweb') ||
    (env.PREFIX_MODE !== undefined && env.PREFIX_MODE !== 'preserve')
  )
    throw new Error('longrun_scope_unavailable')
}
