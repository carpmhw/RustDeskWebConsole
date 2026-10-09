import { expect, it, vi } from 'vitest'
import { ConsoleHost, type WorkerPort } from './host'
import type { MainEvent, Phase, WorkerEvent } from './types'
// 可控Worker只收集安全測試事件，不植入或mock真正browser認證。
class Port implements WorkerPort {
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null = null
  onerror: (() => void) | null = null
  messages: MainEvent[] = []
  terminate = vi.fn()
  // 記錄host傳入的fixture事件以驗operation清理。
  postMessage(value: MainEvent): void {
    this.messages.push(value)
  }
}
// 舊Worker已取消後的錯誤不可終止更新中的新session。
it('ignores stale worker errors after a new operation starts', async () => {
  vi.stubGlobal('location', { origin: 'http://localhost' })
  const ports: Port[] = []
  const phases: Phase[] = []
  const host = new ConsoleHost(
    { request: async <T>() => ({ ticket: 'a'.repeat(43), expires_in: 30 }) as T },
    (phase) => phases.push(phase),
    () => {
      const port = new Port()
      ports.push(port)
      return port
    },
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
  const host = new ConsoleHost({ request: async <T>() => (await promise) as T }, () => {}, create)
  const running = host.start('target', '123456789')
  host.dispose()
  complete({ ticket: 'a'.repeat(43), expires_in: 30 })
  await running
  expect(create).not.toHaveBeenCalled()
})
