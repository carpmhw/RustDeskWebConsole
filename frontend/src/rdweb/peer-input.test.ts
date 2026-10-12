import { expect, it } from 'vitest'
import { PeerInputMetadataCache } from './peer-input'
// 部分 metadata 不得以 currentDisplay 預設零偷換目前所選螢幕。
it('retains platform, SAS and selected display across partial updates', () => {
  const cache = new PeerInputMetadataCache()
  cache.accept(
    {
      platform: 'Windows',
      sasEnabled: true,
      currentDisplay: 1,
      displays: [
        { width: 320, height: 240 },
        { width: 640, height: 480, x: -640 },
      ],
    },
    true,
  )
  const next = cache.accept(
    {
      displays: [
        { width: 320, height: 240 },
        { width: 640, height: 480, x: -1280 },
      ],
    },
    false,
  )
  expect(next).toEqual({
    platform: 'windows',
    sas: true,
    geometry: { display: 1, width: 640, height: 480, x: -1280, y: 0 },
  })
  next.geometry.x = 100
  expect(cache.snapshot().geometry.x).toBe(-1280)
  expect(
    cache.accept(
      {
        sasEnabled: false,
        displays: [
          { width: 320, height: 240 },
          { width: 640, height: 480 },
        ],
      },
      false,
    ).sas,
  ).toBe(false)
})
// 原點更新不要求 media 重配，但只能選已經驗明的 display index。
it('switches only to admitted indices and checks signed origin overflow', () => {
  const cache = new PeerInputMetadataCache()
  cache.accept({ platform: 'Linux', displays: [{ width: 320, height: 240 }] }, true)
  expect(
    cache.switchDisplay({ display: 0, width: 320, height: 240, x: -320, y: -240 }).geometry,
  ).toEqual({ display: 0, width: 320, height: 240, x: -320, y: -240 })
  expect(() => cache.switchDisplay({ display: 1, width: 320, height: 240 })).toThrow(
    'peer_display_invalid',
  )
  expect(() => cache.switchDisplay({ width: 320, height: 240, x: 2147483647 })).toThrow(
    'protocol_error',
  )
  expect(cache.snapshot().geometry.x).toBe(-320)
})
// display cap 與精確 index 在配置 private cache 之前驗證。
it('rejects empty, excessive or malformed metadata without mutating valid cache', () => {
  const cache = new PeerInputMetadataCache()
  expect(() => cache.snapshot()).toThrow('peer_display_invalid')
  expect(() => cache.accept({}, true)).toThrow('peer_display_invalid')
  expect(() =>
    cache.accept({ displays: Array.from({ length: 33 }, () => ({ width: 1, height: 1 })) }, true),
  ).toThrow('peer_display_invalid')
  expect(() =>
    cache.accept({ displays: [{ width: 1, height: 1 }], currentDisplay: 0.5 }, true),
  ).toThrow('peer_display_invalid')
  expect(() => cache.accept({ displays: [{ width: 1, height: 1, x: -2147483649 }] }, true)).toThrow(
    'protocol_error',
  )
  expect(
    cache.accept({ platform: 'Mac OS', displays: [{ width: 1, height: 1 }] }, true).platform,
  ).toBe('unsupported')
})
