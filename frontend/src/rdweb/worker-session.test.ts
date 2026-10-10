import { expect, it, vi } from 'vitest'
import { ProtocolWorkerSession, type WorkerDependencies } from './worker-session'
import type { VideoWorkerEvent } from './video-types'
// Publicprobe fake只測生命週期，不當作native支持證據。
class ProbeFrame {
  codedWidth = 1
  codedHeight = 1
  displayWidth = 1
  displayHeight = 1
  close = vi.fn()
}
// 注入可控query與未連線socket，JWT沒有參數可傳入。
function fixture() {
  const messages: VideoWorkerEvent[] = []
  const deps: WorkerDependencies = {
    query: async (config) => ({ supported: config.codec === 'vp8', config }),
    factory: vi.fn(),
    socket: vi.fn(),
    now: () => 0,
    isFrame: (value): value is VideoFrame => value instanceof ProbeFrame,
  }
  return {
    session: new ProtocolWorkerSession((value) => messages.push(value), deps),
    messages,
    deps,
  }
}
// Probe成功返還同一publicframe及實測profiles，尚未取ticket或開WS。
it('returns proven capabilities and a transferred public probe frame', async () => {
  const value = fixture()
  const frame = new ProbeFrame()
  value.session.handle({ type: 'probe', revision: 1, frame: frame as unknown as VideoFrame })
  await vi.waitFor(() =>
    expect(value.messages.some((message) => message.type === 'capabilities')).toBe(true),
  )
  const result = value.messages.find((message) => message.type === 'capabilities')!
  expect(result.capabilities.profiles).toEqual({ vp8: ['vp8'] })
  expect(result.frame).toBe(frame)
  expect(value.deps.socket).not.toHaveBeenCalled()
  value.session.dispose()
})
// 缺probe不得開始WS；取消後晚probe也不能返capability並復活。
it('fails closed when starting without a completed probe', () => {
  const value = fixture()
  value.session.handle({
    type: 'start',
    revision: 1,
    target: 'target',
    peer: 'peer',
    origin: 'http://localhost',
    base: '/',
    ticket: 'public',
  })
  expect(value.messages.some((message) => message.type === 'failure')).toBe(true)
  expect(value.deps.socket).not.toHaveBeenCalled()
  value.session.dispose()
})
// Transfer失敗時frame仍屬Worker，必須close並中止，而不是遺失ownership。
it('closes the public probe when returning capabilities cannot transfer it', async () => {
  const value = fixture()
  const frame = new ProbeFrame()
  const failures: VideoWorkerEvent[] = []
  const session = new ProtocolWorkerSession((message) => {
    if (message.type === 'capabilities') throw new Error('public transfer failure')
    failures.push(message)
  }, value.deps)
  session.handle({ type: 'probe', revision: 1, frame: frame as unknown as VideoFrame })
  await vi.waitFor(() => expect(failures.some((message) => message.type === 'failure')).toBe(true))
  expect(frame.close).toHaveBeenCalledOnce()
  expect(value.deps.socket).not.toHaveBeenCalled()
  session.dispose()
})
