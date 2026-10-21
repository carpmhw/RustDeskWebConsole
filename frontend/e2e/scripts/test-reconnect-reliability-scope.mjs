import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertReliabilityScope } from './reconnect-reliability-scope.mjs'

// 可靠性suite只接受單一平台、單一channel與已驗prefix，避免50次run被擴大。
const linuxScope = {
  RDWEB_RELIABILITY_PLATFORM: 'linux',
  RDWEB_INPUT_PLATFORMS: 'linux',
  RDWEB_INPUT_CHANNELS: 'chromium',
  RDWEB_B3_BASES: '/rdweb',
  RDWEB_B3_MODES: 'preserve',
}

// 合法scope可帶等值alias；Windows仍由runtime reader另行fail closed。
test('reliability accepts exact linux and windows scopes', () => {
  assert.doesNotThrow(() => assertReliabilityScope(linuxScope))
  assert.doesNotThrow(() =>
    assertReliabilityScope({
      ...linuxScope,
      RDWEB_INPUT_CHANNEL: 'chromium',
      APP_BASE_PATH: '/rdweb',
      PREFIX_MODE: 'preserve',
    }),
  )
  assert.doesNotThrow(() =>
    assertReliabilityScope({
      ...linuxScope,
      RDWEB_RELIABILITY_PLATFORM: 'windows',
      RDWEB_INPUT_PLATFORMS: 'windows',
      RDWEB_INPUT_CHANNELS: 'msedge',
      RDWEB_INPUT_CHANNEL: 'msedge',
    }),
  )
})

// 缺少、平台衝突、多channel、root/strip或混合suite旗標必須在任何副作用前拒絕。
test('reliability rejects missing mixed and widened scopes', () => {
  const bad = [
    {},
    { ...linuxScope, RDWEB_RELIABILITY_PLATFORM: undefined },
    { ...linuxScope, RDWEB_INPUT_PLATFORMS: undefined },
    { ...linuxScope, RDWEB_INPUT_CHANNELS: undefined },
    { ...linuxScope, RDWEB_B3_BASES: undefined },
    { ...linuxScope, RDWEB_B3_MODES: undefined },
    { ...linuxScope, RDWEB_RELIABILITY_PLATFORM: 'windows' },
    { ...linuxScope, RDWEB_INPUT_PLATFORMS: 'linux,windows' },
    { ...linuxScope, RDWEB_INPUT_PLATFORMS: 'linux,linux' },
    { ...linuxScope, RDWEB_INPUT_CHANNELS: '' },
    { ...linuxScope, RDWEB_INPUT_CHANNELS: 'chromium,msedge' },
    { ...linuxScope, RDWEB_INPUT_CHANNELS: 'firefox' },
    { ...linuxScope, RDWEB_INPUT_CHANNEL: 'msedge' },
    { ...linuxScope, RDWEB_B3_BASES: '/' },
    { ...linuxScope, RDWEB_B3_MODES: 'strip' },
    { ...linuxScope, APP_BASE_PATH: '/' },
    { ...linuxScope, PREFIX_MODE: 'strip' },
    { ...linuxScope, RDWEB_WINDOWS_TEXT_PROBE: '1' },
    { ...linuxScope, RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' },
    { ...linuxScope, RDWEB_WINDOWS_HOST_OBSERVE: '1' },
    { ...linuxScope, RDWEB_RECONNECT_INGRESS_OWNER: 'a'.repeat(64) },
  ]
  for (const env of bad)
    assert.throws(/* 固定錯誤碼不可帶原環境值。 */ () => assertReliabilityScope(env), {
      message: 'reliability_scope_unavailable',
    })
})
