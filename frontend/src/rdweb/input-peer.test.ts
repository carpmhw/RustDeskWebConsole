import { expect, it } from 'vitest'
import { assertInputPeer } from '../../e2e-real/input-peer'

// 兩平台皆依最新核准基準驗收，不以子字串或版本缺省冒充匹配。
it.each([
  ['linux', 'Linux · 1.5.0'],
  ['windows', 'Windows · 1.5.0'],
  ['windows', '  Windows · 1.5.0\n'],
] as const)('accepts only the approved peer for %s', (platform, metadata) => {
  expect(() => assertInputPeer(metadata, platform)).not.toThrow()
})

// 誤分派另一平台或unknown peer時必須先拒絕，不能用版本匹配掩蓋。
it.each([
  ['linux', 'Windows · 1.5.0'],
  ['windows', 'Linux · 1.5.0'],
  ['windows', 'NotWindows · 1.5.0'],
  ['linux', 'linux · 1.5.0'],
] as const)('rejects a mismatched platform for %s', (platform, metadata) => {
  expect(() => assertInputPeer(metadata, platform)).toThrow('input_peer_platform_mismatch')
})

// 舊版、任意新版、前後綴及重複欄位不得藉includes條件通過。
it.each(['1.4.2', '1.6.0', '1.5.00', '11.5.0', '1.5.0-rc', '1.5.0+custom', '1.5.0 · extra'])(
  'rejects an unapproved or ambiguous version %s',
  (version) => {
    for (const platform of ['linux', 'windows'] as const) {
      const label = platform === 'linux' ? 'Linux' : 'Windows'
      expect(() => assertInputPeer(label + ' · ' + version, platform)).toThrow(
        'input_peer_version_mismatch',
      )
    }
  },
)

// 未取得完整安全摘要屬獨立固定診斷，不猜平台、版本或繼續點擊。
it.each([null, '', ' ', 'Windows', 'Windows · ', 'Windows ·1.5.0'])(
  'rejects an unavailable peer summary',
  (metadata) => {
    expect(() => assertInputPeer(metadata, 'windows')).toThrow('input_peer_summary_unavailable')
  },
)

// Peer自報字串可能惡意夾private內容，錯誤只允許固定代碼。
it('does not echo remote metadata in its failure', () => {
  let message = ''
  try {
    assertInputPeer('Windows · private-fixture-value', 'windows')
  } catch (error) {
    message = error instanceof Error ? error.message : ''
  }
  expect(message).toBe('input_peer_version_mismatch')
  expect(message.includes('private-fixture-value')).toBe(false)
})
