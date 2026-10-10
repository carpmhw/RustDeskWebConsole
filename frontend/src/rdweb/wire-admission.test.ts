import { expect, it } from 'vitest'
import { hbb } from './codec'
import { admitEnvelope } from './wire-admission'

const publicVideo = new Uint8Array([0x32, 12, 0x32, 10, 0x0a, 8, 0x0a, 2, 1, 2, 0x10, 1, 0x18, 1])
// 使用Google.Protobuf公開fixture，確認影像分類與可接受control。
it('admits independent video and small control envelopes', () => {
  expect(admitEnvelope(publicVideo)).toBe('video')
  expect(admitEnvelope(hbb.Message.encode({ testDelay: { time: 1 } }).finish())).toBe('control')
})
// 生成decode前先拒絕17筆資料，不先配置大量repeated物件。
it('rejects excess or empty repeated frames', () => {
  const frames = Array.from({ length: 17 }, () => ({ data: new Uint8Array([1]), key: true }))
  expect(() =>
    admitEnvelope(hbb.Message.encode({ videoFrame: { vp9s: { frames } } }).finish()),
  ).toThrow('protocol_error')
  expect(() =>
    admitEnvelope(hbb.Message.encode({ videoFrame: { vp9s: { frames: [{}] } } }).finish()),
  ).toThrow('protocol_error')
})
// Control不能因影像上限放大，超大影像與不支援wire分類均固定拒絕。
it('keeps separate control and image limits', () => {
  const control = hbb.Message.encode({ signedId: { id: new Uint8Array(65536) } }).finish()
  expect(() => admitEnvelope(control)).toThrow('protocol_error')
  expect(() => admitEnvelope(new Uint8Array(8388609))).toThrow('protocol_error')
  expect(() =>
    admitEnvelope(
      hbb.Message.encode({
        videoFrame: { h265s: { frames: [{ data: new Uint8Array([1]) }] } },
      }).finish(),
    ),
  ).toThrow('codec_unsupported')
})
// 同一oneof不允許兩種member，生成decoder的最後值覆蓋不能當驗證。
it('rejects contradictory unions and truncated fields', () => {
  const control = hbb.Message.encode({ testDelay: { time: 1 } }).finish()
  expect(() => admitEnvelope(new Uint8Array([...publicVideo, ...control]))).toThrow(
    'protocol_error',
  )
  expect(() => admitEnvelope(new Uint8Array([0x32, 3, 0x80]))).toThrow('protocol_error')
  expect(() => admitEnvelope(new Uint8Array([0x32, 0xff, 0xff]))).toThrow('protocol_error')
  expect(() =>
    admitEnvelope(
      hbb.Message.encode({ misc: { permissionInfo: {}, closeReason: 'public' } }).finish(),
    ),
  ).toThrow('protocol_error')
})

// LoginResponse也必須驗原始oneof，不能以decode覆蓋error後冒稱PeerInfo登入成功。
it('rejects conflicting login response members', () => {
  const bytes = hbb.Message.encode({
    loginResponse: { error: 'public-error', peerInfo: { platform: 'Linux', version: '1.4.2' } },
  }).finish()
  expect(() => admitEnvelope(bytes)).toThrow('protocol_error')
})
