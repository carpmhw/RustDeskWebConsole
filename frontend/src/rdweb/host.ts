import { runtimeBase } from '../utils/basePath'
import { base64Bytes, failureCode } from './types'
import type {
  ConsoleState,
  RendererFactory,
  RenderPort,
  VideoMainEvent,
  VideoWorkerEvent,
  Quality,
  Presented,
} from './video-types'
interface AuthClient {
  // 授權HTTP留在Main，不將access傳Worker。
  request<T>(path: string, method?: string, body?: unknown, signal?: AbortSignal): Promise<T>
}
export interface WorkerPort {
  postMessage: (value: VideoMainEvent, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<VideoWorkerEvent>) => void) | null
  onerror: (() => void) | null
  terminate: () => void
}
const phases = [
  'connecting',
  'awaiting_ready',
  'verifying_identity',
  'awaiting_hash',
  'assisting',
  'awaiting_login',
  'awaiting_video',
  'streaming',
]

// Publicblank canvas不複製舊遠端畫面，僅測native frame移交能力。
export function publicProbeFrame(): VideoFrame {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return new VideoFrame(canvas, { timestamp: 0 })
}
// 單一operation waiter有deadline／abort與cleanup，不覆蓋dispatcher。
export function boundedWait<T>(
  signal: AbortSignal,
  timeoutMs: number,
  subscribe: (resolve: (value: T) => void, reject: () => void) => () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false
    let unsubscribe = (): void => {}
    // 所有終態先清listener與timer，再完成promise。
    const finish = (value?: T, failed = false): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      unsubscribe()
      if (failed) reject(new Error('video_unsupported'))
      else resolve(value as T)
    }
    // Abort固定分類，不附HTTP或native例外。
    const abort = (): void => finish(undefined, true)
    const timer = setTimeout(abort, timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    try {
      unsubscribe = subscribe((value) => finish(value), abort)
    } catch {
      abort()
    }
    if (done) unsubscribe()
  })
}
export class ConsoleHost {
  #revision = 0
  #worker: WorkerPort | null = null
  #renderer: RenderPort | null = null
  #abort: AbortController | null = null
  #resolveProbe: ((value: Extract<VideoWorkerEvent, { type: 'capabilities' }>) => void) | null =
    null
  #rejectProbe: (() => void) | null = null
  #state: ConsoleState = { phase: 'closed' }
  // Main獨佔AuthSession與renderer，Worker只拿ticket／最終proof。
  constructor(
    private readonly auth: AuthClient,
    private readonly update: (state: ConsoleState) => void,
    private readonly createRenderer: RendererFactory,
    private readonly createWorker: () => WorkerPort = () =>
      new Worker(new URL('./protocol.worker.ts', import.meta.url), {
        type: 'module',
      }) as unknown as WorkerPort,
    private readonly createProbe: () => VideoFrame = publicProbeFrame,
  ) {}
  // 單一安全狀態發布，不將frame／protobuf放進Vue。
  private publish(patch: Partial<ConsoleState>): void {
    this.#state = { ...this.#state, ...patch }
    this.update({ ...this.#state })
  }
  // 有證明native能力及transfer後才能取ticket，晚回覆需matching revision。
  async start(target: string, peer: string): Promise<void> {
    this.dispose()
    const revision = ++this.#revision
    const controller = new AbortController()
    this.#abort = controller
    this.#state = { phase: 'connecting' }
    this.publish({})
    try {
      const worker = this.createWorker()
      this.#worker = worker
      this.#renderer = this.createRenderer(
        // 精確presented回Worker，不由Main猜remote ACK。
        (value) => {
          if (revision === this.#revision && value.revision === revision)
            worker.postMessage({ type: 'presented', ...value })
        },
        // Renderer失敗統一清理，不輸出原生draw例外。
        (code) => {
          if (revision === this.#revision) this.failure(code)
        },
        // draw FPS由Main renderer計數而非nativeoutput數目。
        (fps) => {
          if (revision === this.#revision && this.#state.stats)
            this.publish({ stats: { ...this.#state.stats, fps } })
        },
      )
      // 常駐dispatcher兼任lateframe cleanup，probe waiter僅登記resolve。
      worker.onmessage = (event): void => {
        const value = event.data
        if (revision !== this.#revision || value.revision !== revision) {
          if (value.type === 'frame' || value.type === 'capabilities') value.frame.close()
          return
        }
        if (value.type === 'capabilities') {
          if (this.#resolveProbe) this.#resolveProbe(value)
          else value.frame.close()
        } else if (value.type === 'phase') {
          if (!phases.includes(value.phase)) {
            this.failure('protocol_error')
            return
          }
          this.publish({ phase: value.phase })
        } else if (value.type === 'assist')
          void this.assist(target, value, worker, controller, revision)
        else if (value.type === 'peer') this.publish({ peer: value.peer })
        else if (value.type === 'format') {
          this.#renderer?.setFormat(revision, value.generation, value.display)
          if (this.#state.peer) this.publish({ peer: { ...this.#state.peer, ...value.display } })
        } else if (value.type === 'frame') {
          if (this.#renderer) this.#renderer.accept(value.frame, value)
          else value.frame.close()
        } else if (value.type === 'stats')
          this.publish({ stats: { ...value.stats, fps: this.#state.stats?.fps ?? 0 } })
        else if (value.type === 'failure') this.failure(value.code)
        else if (value.type === 'disposed') {
          worker.terminate()
          if (this.#worker === worker) this.#worker = null
        }
      }
      // 舊Worker的error不可以終止新的operation。
      worker.onerror = (): void => {
        if (revision === this.#revision) this.failure('connection_failed')
      }
      // 原生frame先建立；建構失敗時尚無waiter可產生未處理的rejection。
      const publicFrame = this.createProbe()
      const pending = boundedWait<Extract<VideoWorkerEvent, { type: 'capabilities' }>>(
        controller.signal,
        5000,
        // Waiter cleanup始終屬此operation，不保存window message listener。
        (resolve, reject) => {
          this.#resolveProbe = resolve
          this.#rejectProbe = reject
          return () => {
            this.#resolveProbe = null
            this.#rejectProbe = null
          }
        },
      )
      try {
        worker.postMessage({ type: 'probe', revision, frame: publicFrame }, [publicFrame])
      } catch {
        publicFrame.close()
        this.#rejectProbe?.()
      }
      const capability = await pending
      capability.frame.close()
      if (revision !== this.#revision || controller.signal.aborted) return
      if (!Object.values(capability.capabilities.profiles).some((values) => values?.length))
        throw new Error('video_unsupported')
      const grant = await this.auth.request<{ ticket: string; expires_in: number }>(
        `api/v1/targets/${target}/connect-ticket`,
        'POST',
        {},
        controller.signal,
      )
      if (revision !== this.#revision || controller.signal.aborted) return
      if (grant.expires_in !== 30 || !/^[A-Za-z0-9_-]{43}$/.test(grant.ticket)) throw new Error()
      worker.postMessage({
        type: 'start',
        revision,
        target,
        peer,
        origin: location.origin,
        base: runtimeBase(),
        ticket: grant.ticket,
      })
      grant.ticket = ''
    } catch (error) {
      if (revision === this.#revision)
        this.failure(
          error instanceof Error && error.message === 'video_unsupported'
            ? 'video_unsupported'
            : 'connection_failed',
        )
    }
  }
  // 固定error whitelist後先清所有資源，然後只留安全failed狀態。
  private failure(code: string): void {
    this.dispose()
    this.publish({ phase: 'failed', error: failureCode(code) })
  }
  // Assist只可傳當次最終proof，cancel／late結果先清bytes。
  private async assist(
    target: string,
    value: Extract<VideoWorkerEvent, { type: 'assist' }>,
    worker: WorkerPort,
    controller: AbortController,
    revision: number,
  ): Promise<void> {
    try {
      const result = await this.auth.request<{ proof: string }>(
        `api/v1/targets/${target}/login-assist`,
        'POST',
        { connection_id: value.connection, salt: value.salt, challenge: value.challenge },
        controller.signal,
      )
      const proof = base64Bytes(result.proof)
      result.proof = ''
      if (revision !== this.#revision || controller.signal.aborted) {
        proof.fill(0)
        return
      }
      if (proof.length !== 32) {
        proof.fill(0)
        throw new Error()
      }
      try {
        worker.postMessage({ type: 'assist-result', revision, proof }, [
          proof.buffer as ArrayBuffer,
        ])
      } catch {
        proof.fill(0)
        throw new Error()
      }
    } catch {
      if (revision === this.#revision && !controller.signal.aborted)
        worker.postMessage({ type: 'assist-failed', revision })
    }
  }
  // 畫質只走同一current operation加密控制，不取新proof。
  setQuality(quality: Quality): void {
    if (['low', 'balanced', 'high'].includes(quality))
      this.#worker?.postMessage({ type: 'quality', revision: this.#revision, quality })
  }
  // Renderer可明確送credit但不能更改revision或frame_id。
  presented(value: Presented): void {
    if (value.revision === this.#revision)
      this.#worker?.postMessage({ type: 'presented', ...value })
  }
  // 作廢revision先於abort，舊worker只剩closeframe及disposed cleanup能力。
  dispose(): void {
    const revision = this.#revision++
    this.#abort?.abort()
    this.#abort = null
    this.#rejectProbe?.()
    this.#rejectProbe = null
    this.#resolveProbe = null
    this.#renderer?.dispose()
    this.#renderer = null
    const worker = this.#worker
    this.#worker = null
    if (worker) {
      let timer: ReturnType<typeof setTimeout> | null = null
      // 清timer／listener再terminate，closeframe權限保持到最後一刻。
      const finish = (): void => {
        if (timer) clearTimeout(timer)
        timer = null
        worker.onmessage = null
        worker.onerror = null
        worker.terminate()
      }
      worker.onmessage = (event): void => {
        if (event.data.type === 'frame' || event.data.type === 'capabilities')
          event.data.frame.close()
        else if (event.data.type === 'disposed') finish()
      }
      worker.onerror = null
      timer = setTimeout(finish, 250)
      try {
        worker.postMessage({ type: 'dispose', revision })
      } catch {
        finish()
      }
    }
  }
}
