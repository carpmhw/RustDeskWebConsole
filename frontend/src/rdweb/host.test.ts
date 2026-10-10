import { expect, it, vi } from 'vitest'
import { ConsoleHost, type WorkerPort } from './host'
import type { Phase } from './types'
import type {
  VideoMainEvent as MainEvent,
  VideoWorkerEvent as WorkerEvent,
  RenderPort,
  ConsoleState,
} from './video-types'
const renderer: RenderPort = { setFormat: vi.fn(), accept: vi.fn(), dispose: vi.fn() }
// 公開probe的fake只用來測transfer生命週期，不當作native解碼證據。
function probe(): VideoFrame {
  return { close: vi.fn() } as unknown as VideoFrame
}
// 可控Worker只收集安全測試事件，不植入或mock真正browser認證。
class Port implements WorkerPort {
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null = null
  onerror: (() => void) | null = null
  messages: MainEvent[] = []
  terminate = vi.fn()
  // 記錄host傳入的fixture事件以驗operation清理。
  postMessage(value: MainEvent): void {
    this.messages.push(value)
    if (value.type === 'probe') {
      // 可控capabilities回覆保持同一revision/publicframe，沒有JWT。
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            type: 'capabilities',
            revision: value.revision,
            frame: value.frame,
            capabilities: { profiles: { vp9: ['vp09.00.10.08'] } },
          },
        } as MessageEvent<WorkerEvent>),
      )
    }
  }
}
// 舊Worker已取消後的錯誤不可終止更新中的新session。
it('ignores stale worker errors after a new operation starts', async () => {
  vi.stubGlobal('location', { origin: 'http://localhost' })
  const ports: Port[] = []
  const phases: Phase[] = []
  const host = new ConsoleHost(
    { request: async <T>() => ({ ticket: 'a'.repeat(43), expires_in: 30 }) as T },
    (state: ConsoleState) => phases.push(state.phase as Phase),
    () => renderer,
    () => {
      const port = new Port()
      ports.push(port)
      return port
    },
    probe,
  )
  await host.start('target', '123456789')
  const previousError = ports[0]!.onerror!
  host.dispose()
  await host.start('target', '123456789')
  previousError()
  expect(phases.at(-1)).toBe('connecting')
  expect(ports[1]!.messages.filter((message) => message.type === 'dispose')).toHaveLength(0)
  host.dispose()
  vi.unstubAllGlobals()
})
// Ticket尚未完成即取消时，不可创建Worker或把票证传入新operation。
it('does not start a worker from a cancelled ticket request', async () => {
  let complete!: (value: unknown) => void
  const promise = new Promise((resolve) => {
    complete = resolve
  })
  const create = vi.fn(() => new Port())
  const host = new ConsoleHost(
    { request: async <T>() => (await promise) as T },
    () => {},
    () => renderer,
    create,
    probe,
  )
  const running = host.start('target', '123456789')
  host.dispose()
  complete({ ticket: 'a'.repeat(43), expires_in: 30 })
  await running
  expect(create).toHaveBeenCalledOnce()
  expect(
    create.mock.results[0]!.value.messages.some((message: MainEvent) => message.type === 'start'),
  ).toBe(false)
})

// 未收到實際capabilities前禁止取ticket；取消probe也不能後續取票。
it('does not request a ticket before preflight completes', async () => {
  const port = new Port()
  port.postMessage = (value) => {
    port.messages.push(value)
  }
  const request = vi.fn(async <T>() => ({ ticket: 'a'.repeat(43), expires_in: 30 }) as T)
  // 過渡fixture同時符合舊factory位置，RED只反映取票順序而非型別錯誤。
  const host = new ConsoleHost(
    { request: async <T>() => (await request()) as T },
    () => {},
    () => Object.assign(port, renderer),
    () => port,
    probe,
  )
  const running = host.start('target', '123456789')
  await Promise.resolve()
  expect(request).not.toHaveBeenCalled()
  host.dispose()
  await running
  expect(request).not.toHaveBeenCalled()
})
// 無法建立原生probe時不得留下未處理的waiter rejection或取ticket。
it('cleans up without an unhandled waiter when creating the probe fails', async () => {
  const request = vi.fn()
  const states: ConsoleState[] = []
  const port = new Port()
  const host = new ConsoleHost(
    { request },
    (state) => states.push(state),
    () => renderer,
    () => port,
    () => {
      throw new Error('public probe failure')
    },
  )
  await host.start('target', '123456789')
  expect(request).not.toHaveBeenCalled()
  expect(states.at(-1)?.phase).toBe('failed')
  await new Promise((resolve) => setTimeout(resolve, 0))
  host.dispose()
})
// 探測掛住5秒必須fail-closed，不讓HTTP取票或WS開始。
it('expires a stalled preflight before requesting a ticket', async () => {
  vi.useFakeTimers()
  const port = new Port()
  port.postMessage = (value) => {
    port.messages.push(value)
  }
  const request = vi.fn()
  const states: ConsoleState[] = []
  const host = new ConsoleHost(
    { request },
    (state) => states.push(state),
    () => renderer,
    () => port,
    probe,
  )
  try {
    const running = host.start('target', '123456789')
    await vi.advanceTimersByTimeAsync(5000)
    await running
    expect(request).not.toHaveBeenCalled()
    expect(states.at(-1)?.error).toBe('video_unsupported')
    await vi.advanceTimersByTimeAsync(250)
    expect(port.terminate).toHaveBeenCalledOnce()
  } finally {
    host.dispose()
    vi.useRealTimers()
  }
})
