import { afterEach, expect, it, vi } from 'vitest'
import { ConsoleHost, type WorkerPort } from './host'
import type { Phase } from './types'
import type {
  VideoMainEvent as MainEvent,
  VideoWorkerEvent as WorkerEvent,
  RenderPort,
  ConsoleState,
} from './video-types'
import type { InputState } from './interaction-types'
import { HttpError } from '../api/client'

// 每案恢復 host 的全域ports與timer，不遺留至其它測試。
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
// observation永不reject，早期行為RED也不會遺留未await的assertion rejection。
function observe<T>(promise: Promise<T>) {
  return promise.then(
    /* 保留成功狀態供稍後assert。 */ (value) => ({ ok: true as const, value }),
    /* 捕捉固定錯誤而不輸出內容。 */ (error: unknown) => ({ ok: false as const, error }),
  )
}
// deadline／事件送完後才進行awaited assertion，錯誤不另建懸空promise。
async function failed<T>(result: ReturnType<typeof observe<T>>, code: string): Promise<void> {
  const value = await result
  expect(value.ok).toBe(false)
  if (!value.ok) {
    expect(value.error).toBeInstanceOf(Error)
    expect((value.error as Error).message).toBe(code)
  }
}
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

// 新同步handle須在probe與HTTP之前可取消，prepared與finished都不能reject。
it('returns a cancellable attempt before preflight and settles it once', async () => {
  const port = new Port(),
    request = vi.fn()
  // 不回probe，取消不能取ticket或靠timeout完成。
  port.postMessage = (m) => {
    port.messages.push(m)
  }
  const host = new ConsoleHost(
    { request },
    vi.fn(),
    () => renderer,
    () => port,
    probe,
  )
  const attempt = host.open('target', '123456789')
  attempt.cancel()
  attempt.cancel()
  await expect(attempt.prepared).resolves.toBeUndefined()
  await expect(attempt.finished).resolves.toEqual({ cause: 'stopped', code: 'connection_failed' })
  expect(request).not.toHaveBeenCalled()
  host.dispose()
})
// 已abort的outer signal不得建worker，更不建立native probe／HTTP。
it('does not prepare a cancelled outer attempt', async () => {
  const create = vi.fn(() => new Port()),
    request = vi.fn(),
    abort = new AbortController()
  abort.abort()
  const host = new ConsoleHost({ request }, vi.fn(), () => renderer, create, probe)
  const attempt = host.open('target', '123456789', abort.signal)
  await expect(attempt.finished).resolves.toMatchObject({ cause: 'stopped' })
  expect(create).not.toHaveBeenCalled()
  expect(request).not.toHaveBeenCalled()
  host.dispose()
})
// 用既有probe port準備一個有完整safe input snapshot的operation，沒有假auth/WS。
async function interactionFixture() {
  vi.stubGlobal('location', { origin: 'http://localhost' })
  const port = new Port(),
    states: ConsoleState[] = []
  const inputAck = vi.fn(),
    inputState = vi.fn(),
    activity = vi.fn(),
    issue = vi.fn()
  const request = vi.fn(async <T>() => ({ ticket: 'a'.repeat(43), expires_in: 30 }) as T)
  const host = new ConsoleHost(
    { request: /* 模擬泛型只在受控DTO邊界轉型。 */ async <T>() => (await request()) as T },
    /* 僅收安全DTO。 */ (s) => states.push(s),
    () => renderer,
    () => port,
    probe,
    { inputAck, inputState, activity, issue },
    /* deadline與fake clock同源。 */ () => Date.now(),
  )
  await host.start('target', '123456789')
  const start = port.messages.find(/* start只在probe成功後。 */ (m) => m.type === 'start')
  expect(start?.type).toBe('start')
  if (!start) throw new Error('public_fixture_failed')
  const revision = start.revision
  // 假port只派送typed事件，native crypto證據在Protocol tests與後續真機另驗。
  const emit = (data: WorkerEvent): void => port.onmessage?.({ data } as MessageEvent<WorkerEvent>)
  const state: InputState = {
    revision,
    input_generation: 2,
    display: { display: 0, width: 320, height: 240 },
    platform: 'linux',
    sas: false,
    ready: true,
    keyboard: true,
    clipboard: true,
  }
  emit({ type: 'activity', revision, open: true })
  emit({ type: 'phase', revision, phase: 'streaming' })
  emit({ type: 'input-state', ...state })
  return {
    host,
    port,
    states,
    emit,
    revision,
    state,
    request,
    inputAck,
    inputState,
    activity,
    issue,
  }
}
// 內部控制事件只轉給matching operation，不把文字／origin傳進Vue snapshot。
it('dispatches safe interaction state, ACK and socket health separately', async () => {
  const f = await interactionFixture()
  expect(f.inputState).toHaveBeenCalledWith(f.state)
  expect(f.states.at(-1)?.input).toEqual(f.state)
  expect(f.activity).toHaveBeenCalledWith(f.revision, true)
  f.emit({ type: 'input-ack', revision: f.revision, input_generation: 2, batch_id: 1, sent: false })
  expect(f.inputAck).toHaveBeenCalledExactlyOnceWith({
    revision: f.revision,
    input_generation: 2,
    batch_id: 1,
    sent: false,
  })
  f.emit({ type: 'operation-error', revision: f.revision, code: 'input_unsupported' })
  expect(f.issue).toHaveBeenLastCalledWith('input_unsupported')
  f.host.dispose()
})
// Host保留worker的typed來源，normalgeneric UI code不能自行改為network。
it('settles typed worker terminal and HTTP rate limiting on the matching attempt', async () => {
  vi.stubGlobal('location', { origin: 'http://localhost' })
  const port = new Port(),
    states: ConsoleState[] = []
  const host = new ConsoleHost(
    { request: async <T>() => ({ ticket: 'a'.repeat(43), expires_in: 30 }) as T },
    /* 安全終態觀察。 */ (s) => states.push(s),
    () => renderer,
    () => port,
    probe,
  )
  const attempt = host.open('target', '123456789')
  await attempt.prepared
  port.onmessage?.({
    data: {
      type: 'failure',
      revision: attempt.revision,
      code: 'connection_failed',
      cause: 'network',
    },
  } as MessageEvent<WorkerEvent>)
  await expect(attempt.finished).resolves.toEqual({ cause: 'network', code: 'connection_failed' })
  expect(states.at(-1)?.revision).toBe(attempt.revision)
  expect(states.at(-1)?.terminal?.cause).toBe('network')
  host.dispose()
  const denied = new ConsoleHost(
    {
      request: /* 原HttpError只保留safe status/code。 */ async () => {
        throw new HttpError('rate_limited', 429)
      },
    },
    vi.fn(),
    () => renderer,
    () => new Port(),
    probe,
  )
  const next = denied.open('target', '123456789')
  await expect(next.finished).resolves.toEqual({ cause: 'fatal', code: 'rate_limited' })
  denied.dispose()
})
// outbound copy後transfer，caller保留自己finally清除的buffer；sent不是remote ACK。
it('copies outbound clipboard bytes and keeps text out of public state', async () => {
  const f = await interactionFixture(),
    bytes = new Uint8Array([65])
  const running = f.host.pushClipboard(bytes, new AbortController().signal)
  const message = f.port.messages.at(-1)
  expect(message?.type).toBe('clipboard-push')
  if (message?.type !== 'clipboard-push') throw new Error('public_fixture_failed')
  expect(message.bytes).not.toBe(bytes)
  bytes.fill(0)
  expect(message.bytes).toEqual(new Uint8Array([65]))
  f.emit({ type: 'clipboard-sent', revision: f.revision, request_id: message.request_id })
  await running
  expect(f.states.at(-1)).not.toHaveProperty('bytes')
  expect(f.states.at(-1)).not.toHaveProperty('text')
  message.bytes.fill(0)
  f.host.dispose()
})
// inbound只resolvematching owned buffer，wrongtag與cleanup listener都須清遲到資料。
it('wipes unmatched and old-operation clipboard data while resolving the active tag', async () => {
  const f = await interactionFixture(),
    running = f.host.pullClipboard(new AbortController().signal)
  const message = f.port.messages.at(-1)
  expect(message?.type).toBe('clipboard-pull')
  if (message?.type !== 'clipboard-pull') throw new Error('public_fixture_failed')
  const wrong = new Uint8Array([65])
  f.emit({
    type: 'clipboard-data',
    revision: f.revision,
    request_id: message.request_id + 1,
    bytes: wrong,
  })
  expect(wrong).toEqual(new Uint8Array([0]))
  const owned = new Uint8Array([66])
  f.emit({
    type: 'clipboard-data',
    revision: f.revision,
    request_id: message.request_id,
    bytes: owned,
  })
  await expect(running).resolves.toBe(owned)
  owned.fill(0)
  const previous = f.port.onmessage!
  f.host.dispose()
  const late = new Uint8Array([67])
  previous({
    data: {
      type: 'clipboard-data',
      revision: f.revision,
      request_id: message.request_id,
      bytes: late,
    },
  } as MessageEvent<WorkerEvent>)
  expect(late).toEqual(new Uint8Array([0]))
  const cleanupLate = new Uint8Array([68])
  f.port.onmessage?.({
    data: {
      type: 'clipboard-data',
      revision: f.revision,
      request_id: message.request_id,
      bytes: cleanupLate,
    },
  } as MessageEvent<WorkerEvent>)
  expect(cleanupLate).toEqual(new Uint8Array([0]))
})
// 五秒後要求cancel，250ms未確認視為worker可能阻塞，fatal關operation而不retry。
it('terminates a blocked worker after the clipboard deadline and cleanup bound', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const f = await interactionFixture()
  try {
    const running = f.host.pullClipboard(new AbortController().signal)
    // 在timer之前附rejection handler，驗的是deadline而非unhandled事件。
    const rejected = observe(running)
    await vi.advanceTimersByTimeAsync(5000)
    await failed(rejected, 'clipboard_timeout')
    expect(f.port.messages.at(-1)?.type).toBe('clipboard-cancel')
    await vi.advanceTimersByTimeAsync(249)
    expect(f.states.at(-1)?.phase).not.toBe('failed')
    await vi.advanceTimersByTimeAsync(1)
    expect(f.states.at(-1)?.terminal).toEqual({ cause: 'fatal', code: 'connection_timeout' })
    expect(f.issue).toHaveBeenCalledWith('clipboard_timeout')
    await vi.advanceTimersByTimeAsync(250)
    expect(f.port.terminate).toHaveBeenCalledOnce()
  } finally {
    f.host.dispose()
  }
})
// cancel gate仍busy，late wrong cancel不能解除；精確確認後才可新操作。
it('keeps cancellation busy until exact confirmation and never cancels a newer tag', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const f = await interactionFixture(),
    controller = new AbortController()
  try {
    const first = f.host.pullClipboard(controller.signal),
      rejected = observe(first)
    const tag = f.port.messages.at(-1)!
    expect(tag.type).toBe('clipboard-pull')
    if (tag.type !== 'clipboard-pull') throw new Error('public_fixture_failed')
    controller.abort()
    await failed(rejected, 'clipboard_unavailable')
    await expect(f.host.pullClipboard(new AbortController().signal)).rejects.toThrow(
      'clipboard_busy',
    )
    f.emit({ type: 'clipboard-cancelled', revision: f.revision, request_id: tag.request_id + 1 })
    await expect(f.host.pullClipboard(new AbortController().signal)).rejects.toThrow(
      'clipboard_busy',
    )
    f.emit({ type: 'clipboard-cancelled', revision: f.revision, request_id: tag.request_id })
    const next = f.host.pullClipboard(new AbortController().signal),
      nextTag = f.port.messages.at(-1)!
    if (nextTag.type !== 'clipboard-pull') throw new Error('public_fixture_failed')
    expect(nextTag.request_id).toBeGreaterThan(tag.request_id)
    f.emit({ type: 'clipboard-cancelled', revision: f.revision, request_id: tag.request_id })
    f.emit({
      type: 'clipboard-data',
      revision: f.revision,
      request_id: nextTag.request_id,
      bytes: new Uint8Array(),
    })
    await next
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.states.at(-1)?.phase).toBe('streaming')
  } finally {
    f.host.dispose()
  }
})
// deadline在response入口也驗，背景晚data不能在ticker前成功寫本機。
it('rejects a late clipboard response before its timer fires and wipes its bytes', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const f = await interactionFixture()
  try {
    const pending = f.host.pullClipboard(new AbortController().signal),
      rejected = observe(pending)
    const tag = f.port.messages.at(-1)!
    expect(tag.type).toBe('clipboard-pull')
    if (tag.type !== 'clipboard-pull') throw new Error('public_fixture_failed')
    vi.setSystemTime(5000)
    const bytes = new Uint8Array([65])
    f.emit({ type: 'clipboard-data', revision: f.revision, request_id: tag.request_id, bytes })
    await failed(rejected, 'clipboard_timeout')
    expect(bytes).toEqual(new Uint8Array([0]))
    f.emit({ type: 'clipboard-cancelled', revision: f.revision, request_id: tag.request_id })
  } finally {
    f.host.dispose()
  }
})
// matching waiter的資料種類不能由錯誤sent/data回覆互換，亦不洩漏未採納buffer。
it('fails closed for a mismatched clipboard reply kind or transfer failure', async () => {
  const f = await interactionFixture()
  try {
    const pending = f.host.pushClipboard(new Uint8Array([65]), new AbortController().signal),
      rejected = observe(pending)
    const tag = f.port.messages.at(-1)!
    expect(tag.type).toBe('clipboard-push')
    if (tag.type !== 'clipboard-push') throw new Error('public_fixture_failed')
    const bad = new Uint8Array([66])
    f.emit({ type: 'clipboard-data', revision: f.revision, request_id: tag.request_id, bytes: bad })
    await failed(rejected, 'clipboard_unavailable')
    await Promise.resolve()
    expect(bad).toEqual(new Uint8Array([0]))
    expect(f.states.at(-1)?.terminal?.cause).toBe('fatal')
  } finally {
    f.host.dispose()
  }
})
// 先關新的operation之前不得讓舊cleanup/error/dispose覆蓋其renderer或probe waiter。
it('isolates stale attempt cleanup and expired clipboard cancellation from a new operation', async () => {
  vi.stubGlobal('location', { origin: 'http://localhost' })
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const ports: Port[] = [],
    states: ConsoleState[] = []
  const host = new ConsoleHost(
    { request: async <T>() => ({ ticket: 'a'.repeat(43), expires_in: 30 }) as T },
    /* 只收安全snapshot。 */ (s) => states.push(s),
    () => renderer,
    /* 每attempt新port。 */ () => {
      const p = new Port()
      ports.push(p)
      return p
    },
    probe,
  )
  const first = host.open('target', '123456789')
  await first.prepared
  expect(ports).toHaveLength(1)
  const oldError = ports[0]!.onerror!,
    second = host.open('target', '123456789')
  await second.prepared
  first.cancel()
  oldError()
  await vi.advanceTimersByTimeAsync(250)
  expect(states.at(-1)?.revision).toBe(second.revision)
  expect(states.at(-1)?.phase).toBe('connecting')
  expect(
    ports[1]!.messages.filter(/* 新operation沒有被舊cleanup取消。 */ (m) => m.type === 'dispose'),
  ).toHaveLength(0)
  second.cancel()
  await second.finished
  host.dispose()
})

// cleanup確認的入口也要驗250ms原期限，背景timer停頓不能延長存活。
it('does not accept a cleanup confirmation after the elapsed cleanup deadline', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const f = await interactionFixture(),
    controller = new AbortController()
  try {
    const result = observe(f.host.pullClipboard(controller.signal)),
      tag = f.port.messages.at(-1)!
    expect(tag.type).toBe('clipboard-pull')
    if (tag.type !== 'clipboard-pull') throw new Error('public_fixture_failed')
    controller.abort()
    await failed(result, 'clipboard_unavailable')
    vi.setSystemTime(250)
    f.emit({ type: 'clipboard-cancelled', revision: f.revision, request_id: tag.request_id })
    await Promise.resolve()
    expect(f.states.at(-1)?.terminal).toEqual({ cause: 'fatal', code: 'connection_timeout' })
    expect(f.issue).toHaveBeenCalledWith('clipboard_timeout')
  } finally {
    f.host.dispose()
  }
})
// caller傳入非法文字屬操作錯誤，不應因admission失敗中止本來正常的影像。
it('rejects invalid outbound text without posting or terminating the live stream', async () => {
  const f = await interactionFixture(),
    count = f.port.messages.length
  try {
    await expect(
      f.host.pushClipboard(new Uint8Array([65, 0]), new AbortController().signal),
    ).rejects.toThrow('clipboard_invalid')
    expect(f.port.messages).toHaveLength(count)
    expect(f.states.at(-1)?.phase).toBe('streaming')
  } finally {
    f.host.dispose()
  }
})
// 複製的transfer buffer若post失敗仍須清零，原caller buffer不被奪走。
it('clears the copied transfer buffer on post failure and closes the attempt safely', async () => {
  const f = await interactionFixture(),
    bytes = new Uint8Array([65])
  let transferred: Uint8Array | null = null
  const post = f.port.postMessage.bind(f.port)
  // 只模擬當次native post／clone故障，dispose仍沿既有清理port。
  f.port.postMessage = (message) => {
    if (message.type === 'clipboard-push') {
      transferred = message.bytes
      throw new Error('private clone detail')
    }
    post(message)
  }
  try {
    await expect(f.host.pushClipboard(bytes, new AbortController().signal)).rejects.toThrow(
      'clipboard_unavailable',
    )
    await Promise.resolve()
    expect(
      (transferred as Uint8Array | null)?.every(/* 未轉移owned copy清零。 */ (b) => b === 0),
    ).toBe(true)
    expect(bytes).toEqual(new Uint8Array([65]))
    expect(f.states.at(-1)?.terminal?.cause).toBe('fatal')
  } finally {
    bytes.fill(0)
    f.host.dispose()
  }
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
