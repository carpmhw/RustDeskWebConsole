import { expect, it } from 'vitest'
import { readTextProbeRuntime } from '../../e2e-real/text-probe-runtime'
const enabled = {
  RDWEB_WINDOWS_TEXT_PROBE: '1',
  RDWEB_INPUT_PLATFORMS: 'windows',
  RDWEB_B3_BASES: '/',
  RDWEB_B3_MODES: 'preserve',
}
// 明確scope才接受，回傳不含runtime秘密或任意環境值。
it('accepts only the single explicit Windows diagnostic scope', () => {
  expect(readTextProbeRuntime(enabled)).toEqual({
    transport: 'tcp',
    channel: 'chromium',
    observationMs: 120000,
  })
})
// 漏flag或擴展scope須在任何副作用之前拒絕。
it.each([
  { RDWEB_WINDOWS_TEXT_PROBE: undefined },
  { RDWEB_WINDOWS_TEXT_PROBE: '0' },
  { CI: 'true' },
  { GITHUB_ACTIONS: 'true' },
  { RDWEB_INPUT_PLATFORMS: 'linux' },
  { RDWEB_INPUT_PLATFORMS: 'windows,linux' },
  { RDWEB_INPUT_CHANNELS: 'msedge' },
  { RDWEB_INPUT_CHANNEL: 'chrome' },
  { RDWEB_INPUT_CHANNELS: 'chromium,chromium' },
  { RDWEB_B3_BASES: '/ /rdweb' },
  { RDWEB_B3_MODES: 'preserve strip' },
  { RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' },
  { RDWEB_B3_BASES: undefined },
])('rejects ambiguous or unsafe diagnostic runtime: %#', (override) => {
  expect(() => readTextProbeRuntime({ ...enabled, ...override })).toThrow(
    'text_probe_control_unavailable',
  )
})
