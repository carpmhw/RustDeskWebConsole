import { expect, it, vi } from 'vitest'
import samples from './__fixtures__/codec-samples.json'
import { MediaDecoder, type MediaHooks } from './media-decoder'
import type { DecoderCallbacks, DecoderPort } from './decoder'
import type { FrameTag, VideoPacket } from './video-types'
// 固定公開frame只用於狀態機，真native解碼另由browser矩陣驗證。
function packet(): VideoPacket {
  const sample = samples.find((value) => value.codec === 'vp9')!
  return {
    display: 0,
    codec: 'vp9',
    frames: sample.frames.map((input) => ({
      codec: 'vp9',
      key: input.key,
      pts: input.pts,
      data: Uint8Array.from(atob(input.data), (c) => c.charCodeAt(0)),
    })),
  }
}
// 可控query／native callback與時間，沒有fakeHTTP／peer成功。
function fixture() {
  let now = 0
  let callbacks!: DecoderCallbacks
  const tags: FrameTag[] = []
  const hooks: MediaHooks = {
    revision: 1,
    frame: (_frame, tag) => tags.push(tag),
    format: vi.fn(),
    phase: vi.fn(),
    refresh: vi.fn(),
    ack: vi.fn(),
    failure: vi.fn(),
    stats: vi.fn(),
  }
  const port: DecoderPort = {
    decodeQueueSize: 0,
    configure: vi.fn(),
    decode: vi.fn(),
    close: vi.fn(),
  }
  const engine = new MediaDecoder(
    { profiles: { vp9: ['vp09.00.10.08'] } },
    hooks,
    async (config) => ({ supported: true, config }),
    (value) => {
      callbacks = value
      return port
    },
    () => now,
  )
  return {
    engine,
    hooks,
    port,
    tags,
    callbacks: () => callbacks,
    advance: (value: number) => {
      now = value
    },
  }
}
// 等key的合法delta要歸還boolean ACK，不能讓上游等待阻塞已送出的refresh。
it('acknowledges safely ignored deltas while waiting for the first keyframe', () => {
  const value = fixture()
  value.engine.updateDisplay({ display: 0, width: 320, height: 240 })
  const delta = packet()
  delta.frames = delta.frames.slice(1)
  value.engine.receive(delta)
  value.engine.receive(delta)
  expect(value.hooks.refresh).toHaveBeenCalledOnce()
  expect(value.hooks.ack).toHaveBeenCalledTimes(2)
  expect(value.port.decode).not.toHaveBeenCalled()
  value.engine.dispose()
})
// 即使等待key而不decode，timestamp也不得繞過精確整數檢查。
it('rejects overflowing timestamps in ignored deltas', () => {
  const value = fixture()
  value.engine.updateDisplay({ display: 0, width: 320, height: 240 })
  const delta = packet()
  delta.frames = delta.frames.slice(1)
  delta.frames[0]!.pts = '9007199254741'
  value.engine.receive(delta)
  expect(value.hooks.failure).toHaveBeenCalledWith('protocol_error')
  expect(value.hooks.ack).not.toHaveBeenCalled()
  value.engine.dispose()
})
// 背景恢復時presented可能先於ticker，不能復活已到期的在途frame。
it('rejects a late presentation before the next watchdog tick', async () => {
  const value = fixture()
  value.engine.updateDisplay({ display: 0, width: 320, height: 240 })
  value.engine.receive(packet())
  await Promise.resolve()
  const native = value.callbacks()
  const frame = {
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  }
  native.output(frame)
  value.engine.presented({ ...value.tags[0]!, drawn: true })
  native.output({ ...frame, close: vi.fn() })
  value.advance(30000)
  value.engine.presented({ ...value.tags[1]!, drawn: true })
  expect(value.hooks.failure).toHaveBeenCalledWith('video_timeout')
  expect(value.hooks.phase).toHaveBeenCalledWith('streaming')
  expect(
    vi.mocked(value.hooks.phase).mock.calls.filter(([phase]) => phase === 'streaming'),
  ).toHaveLength(1)
  value.engine.dispose()
})
// 無pending的靜止桌面不是故障，不依賴持續收到影像延長deadline。
it('keeps an idle connected desktop alive when there is no pending work', async () => {
  const value = fixture()
  value.engine.updateDisplay({ display: 0, width: 320, height: 240 })
  value.engine.receive(packet())
  await Promise.resolve()
  value.callbacks().output({
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  })
  value.engine.presented({ ...value.tags[0]!, drawn: true })
  value.advance(60000)
  value.engine.tick()
  expect(value.hooks.failure).not.toHaveBeenCalled()
  value.engine.dispose()
})
// PeerInfo與nativeoutput都不足以成功，只有精確Main draw回覆能streaming。
it('requires a current presented frame before reporting streaming', async () => {
  const value = fixture()
  value.engine.updateDisplay({ display: 0, width: 320, height: 240 })
  value.engine.receive(packet())
  await Promise.resolve()
  await Promise.resolve()
  expect(value.port.decode).toHaveBeenCalledTimes(2)
  expect(value.hooks.phase).not.toHaveBeenCalledWith('streaming')
  const native = value.callbacks()
  native.output({
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  })
  value.engine.presented({ ...value.tags[0]!, drawn: true })
  expect(value.hooks.phase).toHaveBeenCalledWith('streaming')
  value.engine.dispose()
})
// 合法首畫面與Main stall各有固定期限，不能被heartbeat假延長。
it('expires missing first video with a fixed deadline', () => {
  const value = fixture()
  value.engine.updateDisplay({ display: 0, width: 320, height: 240 })
  value.advance(15000)
  value.engine.tick()
  expect(value.hooks.failure).toHaveBeenCalledWith('video_timeout')
  value.engine.dispose()
})

// Render credit與RustDesk ACK各自限制，duplicate presented不能重複ACK。
it('coalesces ACKs while the main thread is blocked', async () => {
  const value = fixture()
  value.engine.updateDisplay({ display: 0, width: 320, height: 240 })
  value.engine.receive(packet())
  await Promise.resolve()
  await Promise.resolve()
  const native = value.callbacks()
  native.output({
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  })
  value.engine.receive(packet())
  value.engine.receive(packet())
  expect(value.hooks.ack).toHaveBeenCalledTimes(1)
  value.engine.presented({ ...value.tags[0]!, drawn: true })
  expect(value.hooks.ack).toHaveBeenCalledTimes(2)
  value.engine.presented({ ...value.tags[0]!, drawn: true })
  expect(value.hooks.ack).toHaveBeenCalledTimes(2)
  value.engine.dispose()
})
// 新output仍持續時，Main單張30秒不回覆也必須失敗。
it('does not let fresh native output extend in-flight presentation timeout', async () => {
  const value = fixture()
  value.engine.updateDisplay({ display: 0, width: 320, height: 240 })
  value.engine.receive(packet())
  await Promise.resolve()
  await Promise.resolve()
  const native = value.callbacks()
  const output = {
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  }
  native.output(output)
  value.engine.presented({ ...value.tags[0]!, drawn: true })
  native.output({ ...output, close: vi.fn() })
  value.advance(30000)
  native.output({ ...output, close: vi.fn() })
  value.engine.tick()
  expect(value.hooks.failure).toHaveBeenCalledWith('video_timeout')
  value.engine.dispose()
})
// 舊query晚完成不可清掉新generation的key／queue或建立舊decoder。
it('serializes queries without destroying newer-generation inputs', async () => {
  const completions: ((value: VideoDecoderSupport) => void)[] = []
  const configs: VideoDecoderConfig[] = []
  const hooks: MediaHooks = {
    revision: 1,
    frame: vi.fn(),
    format: vi.fn(),
    phase: vi.fn(),
    refresh: vi.fn(),
    ack: vi.fn(),
    failure: vi.fn(),
    stats: vi.fn(),
  }
  const port: DecoderPort = {
    decodeQueueSize: 0,
    configure: vi.fn(),
    decode: vi.fn(),
    close: vi.fn(),
  }
  const factory = vi.fn(() => port)
  const engine = new MediaDecoder(
    { profiles: { vp9: ['vp09.00.10.08'] } },
    hooks,
    // 每次query可由測試獨立完成，驗證同時只有一個。
    (config) => {
      configs.push(config)
      return new Promise((resolve) => completions.push(resolve))
    },
    factory,
    () => 0,
  )
  engine.updateDisplay({ display: 0, width: 320, height: 240 })
  engine.receive(packet())
  engine.updateDisplay({ display: 1, width: 320, height: 240 })
  engine.receive({ ...packet(), display: 1 })
  expect(completions).toHaveLength(1)
  completions[0]!({ supported: true, config: configs[0]! })
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(factory).not.toHaveBeenCalled()
  expect(completions).toHaveLength(2)
  completions[1]!({ supported: true, config: configs[1]! })
  await Promise.resolve()
  await Promise.resolve()
  expect(factory).toHaveBeenCalledOnce()
  expect(port.decode).toHaveBeenCalledTimes(2)
  expect(hooks.failure).not.toHaveBeenCalled()
  engine.dispose()
})
