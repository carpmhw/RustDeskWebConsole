import { runtimeBase } from '../utils/basePath'
import {
  base64Bytes,
  type Phase,
  type PeerSummary,
  type MainEvent,
  type WorkerEvent,
} from './types'
interface AuthClient {
  request<T>(path: string, method?: string, body?: unknown, signal?: AbortSignal): Promise<T>
}
export interface WorkerPort {
  postMessage: (value: MainEvent, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null
  onerror: (() => void) | null
  terminate: () => void
}
export class ConsoleHost {
  #revision = 0
  #worker: WorkerPort | null = null
  #abort: AbortController | null = null
  // Main host獨佔HTTP auth，Worker只接短效ticket及最終proof。
  constructor(
    private readonly auth: AuthClient,
    private readonly update: (phase: Phase, summary?: PeerSummary, error?: string) => void,
    private readonly createWorker: () => WorkerPort = () =>
      new Worker(new URL('./protocol.worker.ts', import.meta.url), {
        type: 'module',
      }) as unknown as WorkerPort,
  ) {}
  // 新操作先取消舊session，async回應需匹配revision。
  async start(target: string, peer: string): Promise<void> {
    this.dispose()
    const revision = ++this.#revision
    const controller = new AbortController()
    this.#abort = controller
    this.update('connecting')
    try {
      const grant = await this.auth.request<{ ticket: string; expires_in: number }>(
        `api/v1/targets/${target}/connect-ticket`,
        'POST',
        {},
        controller.signal,
      )
      if (revision !== this.#revision) return
      if (grant.expires_in !== 30 || !/^[A-Za-z0-9_-]{43}$/.test(grant.ticket)) throw new Error()
      const worker = this.createWorker()
      this.#worker = worker
      // 每個事件都驗operation revision，舊Worker不可更新新頁。
      worker.onmessage = (event): void => {
        const value = event.data
        if (revision !== this.#revision || value.revision !== revision) return
        if (value.type === 'phase') this.update(value.phase)
        else if (value.type === 'assist')
          void this.assist(target, value, worker, controller, revision)
        else if (value.type === 'verified') {
          this.update('verified', value.summary)
          controller.abort()
        } else if (value.type === 'failure') {
          this.update('failed', undefined, value.code)
          this.dispose()
        } else if (value.type === 'disposed') {
          worker.terminate()
          if (this.#worker === worker) this.#worker = null
        }
      }
      // Worker執行錯誤僅固定分類。
      worker.onerror = (): void => {
        if (revision !== this.#revision) return
        this.update('failed', undefined, 'connection_failed')
        this.dispose()
      }
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
    } catch {
      if (revision === this.#revision) {
        this.update('failed', undefined, 'connection_failed')
        this.dispose()
      }
    }
  }
  // RPC完畢僅將proof bytes transfer給當次Worker，不存public state。
  private async assist(
    target: string,
    value: Extract<WorkerEvent, { type: 'assist' }>,
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
      worker.postMessage({ type: 'assist-result', revision, proof }, [proof.buffer as ArrayBuffer])
    } catch {
      if (revision === this.#revision && !controller.signal.aborted)
        worker.postMessage({ type: 'assist-failed', revision })
    }
  }
  // Abort與revision先作廢舊HTTP；Worker清RAM後terminate，最遲250ms fallback。
  dispose(): void {
    const revision = this.#revision++
    this.#abort?.abort()
    this.#abort = null
    const worker = this.#worker
    this.#worker = null
    if (worker) {
      // 舊Worker只可ack清理，不能再改UI或要求assist。
      worker.onmessage = (event) => {
        if (event.data.type === 'disposed') worker.terminate()
      }
      worker.onerror = null
      worker.postMessage({ type: 'dispose', revision })
      setTimeout(() => {
        worker.onmessage = null
        worker.terminate()
      }, 250)
    }
  }
}
