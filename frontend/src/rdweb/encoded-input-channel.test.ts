import { afterEach, expect, it, vi } from 'vitest'
import {
  installEncodedInputDiagnostics,
  installWorkerEncodedInputDiagnostics,
  prepareEncodedInputWorker,
  type EncodedWorkerScope,
} from '../../e2e/real/encoded-input-diagnostics'
import { encodeMessage } from './codec'
import { observeEncodedInput } from './encoded-input-observer'
const enums = { control: 4, capsLock: 3, numLock: 63, legacy: 0, translate: 2 }
// 自有port只模擬兩端配送及close，計時與collector保持真實產品測試程式。
class Port {
  peer!: Port
  onmessage: ((event: { data: unknown }) => void) | null = null
  onmessageerror: (() => void) | null = null
  closed = false
  // 同步配送讓測試精確控制晚到與錯誤欄位。
  postMessage(data: unknown): void {
    if (!this.closed) this.peer.onmessage?.({ data })
  }
  // 不留下轉送listener。
  close(): void {
    this.closed = true
    this.onmessage = null
    this.onmessageerror = null
  }
  // 與原生port同介面，沒有隱式資料。
  start(): void {}
}
class Channel {
  port1 = new Port()
  port2 = new Port()
  // 兩端只持有本scope自有引用。
  constructor() {
    this.port1.peer = this.port2
    this.port2.peer = this.port1
  }
}
// Worker constructor本身不更換URL、參數或產品dispatch。
class WorkerFixture extends EventTarget {
  static all: WorkerFixture[] = []
  target = new EventTarget() as EventTarget & EncodedWorkerScope
  commands: unknown[] = []
  diagnosticPort: Port | undefined
  terminated = false
  // bootstrap只在這個測試Worker的self安裝。
  constructor(
    readonly url: string,
    readonly options?: WorkerOptions,
  ) {
    super()
    WorkerFixture.all.push(this)
    vi.stubGlobal('self', this.target)
    this.target.addEventListener(
      'message',
      /* NodeEventTarget配送到WorkerGlobalScope式onmessage。 */ (event) =>
        this.target.onmessage?.call(this.target, event as MessageEvent),
    )
    installWorkerEncodedInputDiagnostics(enums)
  }
  // 原postMessage僅配送一次；bootstrap攔自己的控制，不產生input。
  postMessage(data: unknown, ports: Port[] = []): void {
    if (ports.length) this.diagnosticPort = ports[0]
    this.commands.push(data)
    const event = new Event('message')
    Object.defineProperties(event, { data: { value: data }, ports: { value: ports } })
    this.target.dispatchEvent(event)
  }
  // 原始terminate仍只作用這個instance。
  terminate(): void {
    this.terminated = true
  }
  // 以正式safe state挑選同一owner，非name猜測。
  ready(revision = 1): void {
    this.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'input-state',
          revision,
          input_generation: 1,
          ready: true,
          keyboard: true,
          platform: 'windows',
        },
      }),
    )
  }
}
// Main collector和真Worker bootstrap經可控transport串接；沒有OS或socket。
function fixture() {
  WorkerFixture.all = []
  vi.stubGlobal('window', { Worker: WorkerFixture })
  vi.stubGlobal('MessageChannel', Channel)
  installEncodedInputDiagnostics()
  const worker = new window.Worker('/rdweb/assets/protocol.worker-public.js', {
    type: 'module',
  }) as unknown as WorkerFixture
  worker.ready()
  return { worker, port: window.__rdwebEncodedInputDiagnostics! }
}
// 經真編碼helper供應獨立public seq，若改存expected這個mismatch案會抓到。
function emitText(worker: WorkerFixture, text = 'Public test'): void {
  observeEncodedInput(
    encodeMessage({ keyEvent: { seq: text, down: true, mode: 0 } }),
    worker.target.__rdwebEncodedInputObserver!,
  )
}
// 白名單回覆的公開literal；僅不良transport測試使用，不當正向decoder oracle。
function captureReply() {
  return {
    preEncryptInput: {
      observed: true,
      textExact: true,
      textSingle: true,
      initialSelectComplete: true,
      receiveSelectComplete: true,
      receiveCopyComplete: true,
      sequenceComplete: true,
      sequenceInvalid: false,
      overflow: false,
      unavailable: false,
    },
    preEncryptText: 'Public test',
  }
}
// 只恢復本案globals／clock，未觸及外部runtime。
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// 沒有matching owner時不送診斷控制，非法scope不能啟用。
it('requires one live Windows owner and bounded public expected', () => {
  const f = fixture()
  expect(() => f.port.begin('private')).toThrow('encoded_input_diagnostics_unavailable')
  const second = new window.Worker('public-second') as unknown as WorkerFixture
  second.ready()
  expect(() => f.port.begin('Public test')).toThrow('encoded_input_diagnostics_unavailable')
})
// 缺少正式bootstrap回覆不可報wire成功；超時只在oracle之後的take。
it('takes an owned snapshot without changing constructor or input dispatch', async () => {
  const f = fixture()
  f.port.begin('Public test')
  expect(f.worker.url).toBe('/rdweb/assets/protocol.worker-public.js')
  expect(f.worker.options).toEqual({ type: 'module' })
  f.worker.target.__rdwebEncodedInputObserver!.record({ kind: 'mouse', mask: 0 })
  const result = await f.port.take()
  expect(result).toMatchObject({ observed: true, unavailable: false, sequenceComplete: false })
  expect(f.worker.commands).toHaveLength(2)
  expect((await f.port.take()).unavailable).toBe(true)
})
// 明確opt-in才由同scope channel回真正seq；新舊take共用一次消費。
it('takes the actual public seq atomically with the ten booleans', async () => {
  const f = fixture()
  f.port.begin('Public test', true)
  emitText(f.worker)
  const result = await f.port.takeWithText()
  expect(result.preEncryptText).toBe('Public test')
  expect(result.preEncryptInput).toMatchObject({
    observed: true,
    textExact: true,
    textSingle: true,
    unavailable: false,
  })
  expect(Object.keys(result.preEncryptInput)).toHaveLength(10)
  expect((await f.port.take()).unavailable).toBe(true)
  expect((await f.port.takeWithText()).preEncryptText).toBeNull()
})
// 預設不保存，且不以expected補缺少觀察的文字。
it.each(['default', 'missing', 'mismatch', 'cancel'])(
  'returns null for %s text capture',
  async (mode) => {
    const f = fixture()
    f.port.begin('Public test', mode !== 'default')
    if (mode !== 'missing')
      emitText(f.worker, mode === 'mismatch' ? 'Public unknown' : 'Public test')
    if (mode === 'cancel') f.port.cancel()
    const result = await f.port.takeWithText()
    expect(result.preEncryptText).toBeNull()
    expect(JSON.stringify(result)).not.toContain('Public unknown')
  },
)
// Main在DTO到達即驗同expected、bounds及own schema，getter故障不洩漏原值。
it.each([
  'wrong',
  'extra',
  'missing',
  'nonboolean',
  'prototype',
  'getter',
  'no-evidence',
  'overflow',
  'unavailable',
])('rejects unsafe %s text capture reply', async (mode) => {
  const f = fixture()
  f.port.begin('Public test', true)
  f.worker.postMessage = /* 僅替代獨立診斷transport，不改正式input。 */ () => {
    const result = captureReply()
    if (mode === 'wrong') result.preEncryptText = 'Public unknown'
    if (mode === 'extra') Object.assign(result, { bytes: [65] })
    if (mode === 'missing') Reflect.deleteProperty(result, 'preEncryptText')
    if (mode === 'nonboolean') Object.assign(result.preEncryptInput, { textExact: 1 })
    if (mode === 'prototype')
      result.preEncryptInput = Object.assign(Object.create(result.preEncryptInput), {
        a: true,
        b: true,
        c: true,
        d: true,
        e: true,
        f: true,
        g: true,
        h: true,
        i: true,
        j: true,
      })
    if (mode === 'getter')
      Object.defineProperty(result, 'preEncryptText', {
        get: /* 不良DTO只能作廢。 */ () => {
          throw new Error('public_bad_getter')
        },
      })
    if (mode === 'no-evidence') result.preEncryptInput.observed = false
    if (mode === 'overflow') result.preEncryptInput.overflow = true
    if (mode === 'unavailable') result.preEncryptInput.unavailable = true
    f.worker.diagnosticPort!.postMessage(result)
  }
  const result = await f.port.takeWithText()
  expect(result.preEncryptText).toBeNull()
  expect(result.preEncryptInput.unavailable).toBe(true)
  expect(JSON.stringify(result)).not.toContain('Public unknown')
})
// timeout晚到capture不能恢復或填下一scope；缺hook只有null及不可用。
it('bounds text capture take to 2000ms and refuses late replies', async () => {
  vi.useFakeTimers()
  const f = fixture()
  f.port.begin('Public test', true)
  f.worker.postMessage = /* 暫停自有診斷transport。 */ () => undefined
  const pending = f.port.takeWithText(),
    late = f.worker.diagnosticPort!.peer.onmessage!
  await vi.advanceTimersByTimeAsync(2000)
  expect(await pending).toMatchObject({
    preEncryptText: null,
    preEncryptInput: { unavailable: true },
  })
  late({ data: captureReply() })
  expect((await f.port.takeWithText()).preEncryptText).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
// 公開expected仍拒絕NUL與非法Unicode，不新增含私密內容的control message。
it.each(['Public \0bad', 'Public \uD800', 'Public ' + '中'.repeat(1400)])(
  'refuses unsafe capture fixture before begin: %#',
  (expected) => {
    const f = fixture()
    expect(() => f.port.begin(expected, true)).toThrow('encoded_input_diagnostics_unavailable')
    expect(f.worker.commands).toEqual([])
  },
)
// timeout後晚到不復活；terminate須收尾但不改原Worker動作。
it('settles missing hooks after 2000ms and ignores late replies', async () => {
  vi.useFakeTimers()
  const f = fixture()
  f.worker.postMessage = /* 模擬未注入bootstrap，不改產品輸入。 */ () => {}
  f.port.begin('Public test')
  const promise = f.port.take()
  await vi.advanceTimersByTimeAsync(1999)
  let done = false
  void promise.then(
    /* 只觀察settlement。 */ () => {
      done = true
    },
  )
  await Promise.resolve()
  expect(done).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect((await promise).unavailable).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  f.worker.terminate()
  expect(f.worker.terminated).toBe(true)
})
// 原生錯誤或scope replacement不能把舊資料填入新scope。
it('cancels pending diagnostics when the worker scope changes', async () => {
  const f = fixture()
  f.port.begin('Public test')
  f.worker.ready(2)
  expect((await f.port.take()).unavailable).toBe(true)
  expect(() => f.port.begin('Public next')).not.toThrow()
  f.port.cancel()
  expect((await f.port.take()).unavailable).toBe(true)
})
// reply嚴格schema不能夾帶rawbytes／hash／tag或非boolean；只回固定不可用。
it.each(['extra', 'nonboolean', 'missing'])(
  'rejects %s diagnostic response without retaining it',
  /* 只模擬診斷port，不改原input。 */ async (mutation) => {
    const f = fixture()
    f.port.begin('Public test')
    f.worker.postMessage = /* 在take送一份非法同port摘要。 */ () => {
      const result: Record<string, unknown> = {
        observed: true,
        textExact: true,
        textSingle: true,
        initialSelectComplete: true,
        receiveSelectComplete: true,
        receiveCopyComplete: true,
        sequenceComplete: true,
        sequenceInvalid: false,
        overflow: false,
        unavailable: false,
      }
      if (mutation === 'extra') result.seq = 'Public must not escape'
      if (mutation === 'nonboolean') result.textExact = 1
      if (mutation === 'missing') delete result.textExact
      f.worker.diagnosticPort!.postMessage(result)
    }
    const result = await f.port.take()
    expect(result.unavailable).toBe(true)
    expect(
      Object.values(result).every(/* 不回傳未知payload。 */ (value) => typeof value === 'boolean'),
    ).toBe(true)
    expect(JSON.stringify(result)).not.toContain('Public')
  },
)
// 舊port callback或錯revision不能填入新scope；terminate只收尾當前取證。
it('does not revive completed snapshots with late replies or stale state', async () => {
  vi.useFakeTimers()
  const f = fixture()
  f.port.begin('Public test')
  const oldPort = f.worker.diagnosticPort!,
    oldPost = f.worker.postMessage.bind(f.worker)
  f.worker.postMessage = /* 暫停診斷回覆，但不持有文字。 */ () => {}
  const waiting = f.port.take(),
    late = oldPort.peer.onmessage!
  await vi.advanceTimersByTimeAsync(2000)
  const ended = await waiting
  f.worker.postMessage = oldPost
  f.port.begin('Public second')
  late({ data: { observed: true } })
  f.worker.ready(0)
  f.worker.target.__rdwebEncodedInputObserver!.record({ kind: 'mouse', mask: 0 })
  expect((await f.port.take()).observed).toBe(true)
  expect(ended.unavailable).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  f.port.begin('Public third')
  f.worker.terminate()
  expect((await f.port.take()).unavailable).toBe(true)
})
// 已終止owner不能在未取得新safe ready前重新begin。
it('does not select a failed worker and bounds constructor bookkeeping', () => {
  const f = fixture()
  f.worker.dispatchEvent(new MessageEvent('message', { data: { type: 'failure', revision: 1 } }))
  expect(() => f.port.begin('Public test')).toThrow('encoded_input_diagnostics_unavailable')
  f.worker.ready(2)
  for (let i = 0; i < 17; i++) new window.Worker('public-unready')
  expect(() => f.port.begin('Public test')).toThrow('encoded_input_diagnostics_unavailable')
})
// setup只在同源單一正式Worker中安裝，不建立替代Worker或攔截資產。
it('installs through the existing worker and refuses foreign or ambiguous workers', async () => {
  const f = fixture()
  const selected = {
    url: /* 原Worker URL原樣讀取。 */ () =>
      'http://localhost/rdweb/assets/protocol.worker-public.js',
    evaluate: /* 只在原Workerglobal安裝bootstrap。 */ async (
      install: typeof installWorkerEncodedInputDiagnostics,
      values: typeof enums,
    ) => {
      vi.stubGlobal('self', f.worker.target)
      install(values)
    },
  }
  let workers = [selected]
  const page = {
    url: /* public同源page。 */ () => 'http://localhost/rdweb/console/public',
    workers: /* 當頁原Worker列表。 */ () => workers,
  }
  await prepareEncodedInputWorker(page as unknown as import('@playwright/test').Page)
  f.port.begin('Public test')
  f.worker.target.__rdwebEncodedInputObserver!.record({ kind: 'mouse', mask: 0 })
  await prepareEncodedInputWorker(page as unknown as import('@playwright/test').Page)
  expect((await f.port.take()).observed).toBe(true)
  workers = [selected, selected]
  await expect(
    prepareEncodedInputWorker(page as unknown as import('@playwright/test').Page),
  ).rejects.toThrow('encoded_input_diagnostics_unavailable')
  workers = [
    {
      ...selected,
      url: /* 異源Worker不允許注入。 */ () =>
        'http://foreign.test/assets/protocol.worker-public.js',
    },
  ]
  await expect(
    prepareEncodedInputWorker(page as unknown as import('@playwright/test').Page),
  ).rejects.toThrow('encoded_input_diagnostics_unavailable')
})
