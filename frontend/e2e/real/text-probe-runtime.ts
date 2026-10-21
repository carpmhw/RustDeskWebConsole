export type Environment = Readonly<Record<string, string | undefined>>
export interface TextProbeRuntime {
  transport: 'tcp'
  channel: 'chromium'
  observationMs: 120000
}
const runtimeEnv = (globalThis as { process?: { env: Environment } }).process?.env ?? {}
// 僅單次WindowsTCP公開scope可啟動；本reader不讀連線秘密。
export function readTextProbeRuntime(env: Environment = runtimeEnv): TextProbeRuntime {
  if (
    env.RDWEB_WINDOWS_TEXT_PROBE !== '1' ||
    env.CI ||
    env.GITHUB_ACTIONS ||
    env.RDWEB_INPUT_PLATFORMS !== 'windows' ||
    (env.RDWEB_INPUT_CHANNELS ?? 'chromium') !== 'chromium' ||
    (env.RDWEB_INPUT_CHANNEL ?? 'chromium') !== 'chromium' ||
    env.RDWEB_B3_BASES !== '/' ||
    env.RDWEB_B3_MODES !== 'preserve' ||
    (env.RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG ?? '0') !== '0'
  ) {
    throw new Error('text_probe_control_unavailable')
  }
  return { transport: 'tcp', channel: 'chromium', observationMs: 120000 }
}
