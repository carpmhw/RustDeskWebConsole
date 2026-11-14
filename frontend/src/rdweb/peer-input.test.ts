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
    x11: false,
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
// 上游 Linux 只在 Wayland 時於 platformAdditions 放 is_wayland:true；缺欄位或格式不明一律不視為 X11。
it.each<readonly [string, string | undefined, boolean]>([
  ['Linux', '{"support_view_camera":true}', true],
  ['Linux', '{"is_wayland":false}', true],
  ['Linux', '{"is_wayland":true,"support_view_camera":true}', false],
  ['Linux', '{"is_wayland":"yes"}', false],
  ['Linux', '', false],
  ['Linux', undefined, false],
  ['Linux', 'not json', false],
  ['Linux', '[]', false],
  ['Linux', 'null', false],
  ['Windows', '{"support_view_camera":true}', false],
])('derives X11 from %s platformAdditions %j', (platform, platformAdditions, x11) => {
  const cache = new PeerInputMetadataCache()
  expect(
    cache.accept({ platform, platformAdditions, displays: [{ width: 1, height: 1 }] }, true).x11,
  ).toBe(x11)
})
// 部分 PeerInfo 未重送 platform 時保留原 X11 判定，重送 platform 才重新判定。
it('retains X11 across partial updates and recomputes with platform', () => {
  const cache = new PeerInputMetadataCache()
  const displays = [{ width: 1, height: 1 }]
  cache.accept({ platform: 'Linux', platformAdditions: '{}', displays }, true)
  expect(cache.accept({ displays }, false).x11).toBe(true)
  expect(
    cache.accept({ platform: 'Linux', platformAdditions: '{"is_wayland":true}', displays }, false)
      .x11,
  ).toBe(false)
})
