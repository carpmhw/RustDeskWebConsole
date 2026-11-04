import { runtimeBase } from '../utils/basePath'
import { base64Bytes, failureCode } from './types'
import { HttpError } from '../api/client'
import { AttemptLifecycle } from './attempt-lifecycle'
import { httpTerminal } from './terminal'
import { interactionClock, INTERACTION_LIMITS as L, textFromBytes } from './interaction-limits'
import { checkDisplay } from './video-limits'
import { OPERATION_CODES } from './interaction-types'
import { clipboardError } from './clipboard-errors'
import type {
  HostAttempt,
  InteractionHostHooks,
  InputBatch,
  InputState,
  ClipboardReply,
  ClipboardTag,
  OperationCode,
  Terminal,
} from './interaction-types'
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
  // 所有授權HTTP留在Main，不將access／refresh傳給Worker。
  request<T>(path: string, method?: string, body?: unknown, signal?: AbortSignal): Promise<T>
}
export interface WorkerPort {
  postMessage: (value: VideoMainEvent, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<VideoWorkerEvent>) => void) | null
  onerror: (() => void) | null
  terminate: () => void
}
interface ClipboardPending extends ClipboardTag {
  deadline: number
  // 結束當次匹配的owned reply，不能碰新的operation。
  finish(reply: ClipboardReply): void
  // 取消原訂閱並等待最多250ms的清理確認。
  cancel(code: OperationCode): void
  // 整個attempt結束時只拒絕waiter，不再送新控制。
  stop(): void
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
const NO_HOOKS: InteractionHostHooks = {
  // 舊B2 caller不使用input owner，仍保留安全dispatcher。
  inputAck: () => {},
  // 活動不被舊caller當作實際操作成功。
  activity: () => {},
  // 操作訊息不提升為連線成功。
  issue: () => {},
  // 未使用互動caller不保留任何文字或origin。
  inputState: () => {},
}
// 真同源module Worker，沒有runtime測試成功旗標。
function nativeWorker(): WorkerPort {
  return new Worker(new URL('./protocol.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerPort
}
// Public blank canvas不複製舊桌面，僅供native frame往返驗證。
export function publicProbeFrame(): VideoFrame {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return new VideoFrame(canvas, { timestamp: 0 })
}
// 單次waiter有deadline／abort，既有dispatcher不被短操作覆寫。
export function boundedWait<T>(
  signal: AbortSignal,
  timeoutMs: number,
  subscribe: (resolve: (value: T) => void, reject: () => void) => () => void,
): Promise<T> {
  // 只在此bounded promise保存resolve/reject，終態清所有listener。
  return new Promise((resolve, reject) => {
    let done = false
    // 尚未完成subscribe時的安全空disposer。
    let unsubscribe = (): void => {}
    // 所有路徑先清timer／listener，再完成一次promise。
    const finish = (value?: T, failed = false): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      unsubscribe()
      if (failed) reject(new Error('video_unsupported'))
      else resolve(value as T)
    }
    // 未通過probe只能固定fail-closed。
    const abort = (): void => finish(undefined, true)
    const timer = setTimeout(abort, timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    try {
      unsubscribe = subscribe(/* 限定這次waiter的結果。 */ (value) => finish(value), abort)
    } catch {
      abort()
    }
    if (done) unsubscribe()
  })
}
// 遲到資源仍由receiver清理，不能把payload spread到公開state。
function discard(value: VideoWorkerEvent): void {
  if (value.type === 'frame' || value.type === 'capabilities') value.frame.close()
  if (
    value.type === 'clipboard-data' &&
    value.bytes instanceof Uint8Array &&
    value.bytes.byteLength
  )
    value.bytes.fill(0)
}
// input安全snapshot只採白名單scalar，忽略任何extra origin／文字欄位。
function inputSnapshot(v: InputState): InputState {
  checkDisplay(v.display)
  if (
    !Number.isSafeInteger(v.input_generation) ||
    v.input_generation < 0 ||
    !['windows', 'linux', 'unsupported'].includes(v.platform) ||
    [v.sas, v.ready, v.keyboard, v.clipboard].some(
      /* bool不能被truthy字串升權。 */ (b) => typeof b !== 'boolean',
    )
  )
    throw new Error('protocol_error')
  return {
    revision: v.revision,
    input_generation: v.input_generation,
    display: { display: v.display.display, width: v.display.width, height: v.display.height },
    platform: v.platform,
    sas: v.sas,
    ready: v.ready,
    keyboard: v.keyboard,
    clipboard: v.clipboard,
  }
}
export class ConsoleHost {
  #revision = 0
  #worker: WorkerPort | null = null
  #renderer: RenderPort | null = null
  #life: AttemptLifecycle | null = null
  #resolveProbe: ((v: Extract<VideoWorkerEvent, { type: 'capabilities' }>) => void) | null = null
  #rejectProbe: (() => void) | null = null
  #state: ConsoleState = { revision: 0, phase: 'closed' }
  #socketOpen = false
  #clipboardSequence = 0
  #clipboardPending: ClipboardPending | null = null
  #clipboardCancelling: (ClipboardTag & { deadline: number }) | null = null
  #clipboardCleanup: ReturnType<typeof setTimeout> | null = null
  // Main唯一持有AuthSession／renderer，跨Worker只送ticket／最終proof／typed控制。
  constructor(
    private readonly auth: AuthClient,
    private readonly update: (state: ConsoleState) => void,
    private readonly createRenderer: RendererFactory,
    private readonly createWorker: () => WorkerPort = nativeWorker,
    private readonly createProbe: () => VideoFrame = publicProbeFrame,
    private readonly hooks: InteractionHostHooks = NO_HOOKS,
    private readonly now: () => number = interactionClock(),
  ) {}
  // 唯有當前未結束attempt可變更state或派送新的控制。
  private live(revision: number): boolean {
    return revision === this.#revision && this.#life?.handle.revision === revision
  }
  // 公開state只copy安全summary，沒有原始frame／clipboard／按鍵ledger。
  private publish(patch: Partial<ConsoleState>): void {
    this.#state = { ...this.#state, ...patch }
    this.update({
      ...this.#state,
      input: this.#state.input ? inputSnapshot(this.#state.input) : undefined,
    })
  }
  // 同步取得handle，準備工作與終態分開，不以prepared假裝streaming。
  open(target: string, peer: string, signal?: AbortSignal): HostAttempt {
    this.dispose()
    const revision = ++this.#revision,
      life = new AttemptLifecycle(
        revision,
        /* cleanup只可清匹配的owner。 */ () => this.cleanupOperation(revision),
      )
    this.#life = life
    this.#socketOpen = false
    this.#state = { revision, phase: 'connecting' }
    // outer取消只取消這個life，不能終止其後的新operation。
    const abort = (): void => life.handle.cancel()
    signal?.addEventListener('abort', abort, { once: true })
    // lifecycle先完成cleanup再resolve，未知cleanupfault仍由其固定fatal分類。
    void life.handle.finished.then((terminal) => {
      signal?.removeEventListener('abort', abort)
      if (this.#state.revision !== revision) return
      this.publish({
        revision,
        phase: terminal.cause === 'stopped' ? 'closed' : 'failed',
        error: terminal.cause === 'stopped' ? undefined : terminal.code,
        terminal,
      })
    })
    this.publish({})
    if (signal?.aborted || !this.live(revision)) life.handle.cancel()
    else void this.prepare(target, peer, life)
    return life.handle
  }
  // 保留B2 caller語意，等待bounded準備工作，不等長連線finished。
  async start(target: string, peer: string): Promise<void> {
    await this.open(target, peer).prepared
  }
  // 真native probe成功且matchingepoch後才取ticket；所有catch在此固定分類。
  private async prepare(target: string, peer: string, life: AttemptLifecycle): Promise<void> {
    const revision = life.handle.revision,
      controller = life.controller
    try {
      if (!this.live(revision) || controller.signal.aborted) return
      const worker = this.createWorker()
      this.#worker = worker
      this.#renderer = this.createRenderer(
        /* presented只回精確原revision。 */ (v) => {
          if (this.live(revision) && v.revision === revision)
            this.post(worker, { type: 'presented', ...v })
        },
        /* renderer／clone不是network。 */ (code) => {
          if (this.live(revision)) this.failure({ cause: 'fatal', code: failureCode(code) })
        },
        /* FPS只在matching renderer發布安全数字。 */ (fps) => {
          if (this.live(revision) && this.#state.stats)
            this.publish({ stats: { ...this.#state.stats, fps } })
        },
      )
      // 所有typed事件共用dispatcher，短waiter只保存匹配的tag。
      worker.onmessage = (event): void => {
        const value = event.data
        if (!this.live(revision) || value.revision !== revision) {
          discard(value)
          return
        }
        try {
          this.dispatch(value, target, worker, life)
        } catch {
          discard(value)
          this.failure({ cause: 'fatal', code: 'protocol_error' })
        }
      }
      // 舊worker exception不能影響新life；native crash一律fatal。
      worker.onerror = (): void => {
        if (this.live(revision)) this.failure({ cause: 'fatal', code: 'connection_failed' })
      }
      const publicFrame = this.createProbe()
      const pending = boundedWait<Extract<VideoWorkerEvent, { type: 'capabilities' }>>(
        controller.signal,
        5000,
        /* listener與old operation綁定，不清新waiter。 */ (resolve, reject) => {
          this.#resolveProbe = resolve
          this.#rejectProbe = reject
          // 精確引用防舊waiter清理覆蓋新probe。
          return () => {
            if (this.#resolveProbe === resolve) this.#resolveProbe = null
            if (this.#rejectProbe === reject) this.#rejectProbe = null
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
      if (!this.live(revision) || controller.signal.aborted) return
      if (
        !Object.values(capability.capabilities.profiles).some(
          /* 至少一個實測profile。 */ (v) => v?.length,
        )
      )
        throw new Error('video_unsupported')
      const grant = await this.auth.request<{ ticket: string; expires_in: number }>(
        `api/v1/targets/${target}/connect-ticket`,
        'POST',
        {},
        controller.signal,
      )
      try {
        if (!this.live(revision) || controller.signal.aborted) return
        if (grant.expires_in !== 30 || !/^[A-Za-z0-9_-]{43}$/.test(grant.ticket))
          throw new Error('protocol_error')
        worker.postMessage({
          type: 'start',
          revision,
          target,
          peer,
          origin: location.origin,
          base: runtimeBase(),
          ticket: grant.ticket,
        })
      } finally {
        grant.ticket = ''
      }
    } catch (error) {
      if (this.live(revision) && !controller.signal.aborted)
        this.failure(
          error instanceof HttpError
            ? httpTerminal(error.status, error.code)
            : {
                cause: 'fatal',
                code:
                  error instanceof Error && error.message === 'video_unsupported'
                    ? 'video_unsupported'
                    : 'connection_failed',
              },
        )
    } finally {
      life.prepared()
    }
  }
  // dispatcher不將event展開進Vue，只轉送安全scalar或交唯一owned receiver。
  private dispatch(
    value: VideoWorkerEvent,
    target: string,
    worker: WorkerPort,
    life: AttemptLifecycle,
  ): void {
    const revision = life.handle.revision
    if (value.type === 'capabilities') {
      if (this.#resolveProbe) this.#resolveProbe(value)
      else value.frame.close()
    } else if (value.type === 'phase') {
      if (!phases.includes(value.phase)) throw new Error('protocol_error')
      this.publish({ phase: value.phase })
    } else if (value.type === 'assist') void this.assist(target, value, worker, life)
    else if (value.type === 'peer') this.publish({ peer: value.peer })
    else if (value.type === 'format') {
      this.#renderer?.setFormat(revision, value.generation, value.display)
      if (this.#state.peer) this.publish({ peer: { ...this.#state.peer, ...value.display } })
    } else if (value.type === 'frame') {
      if (this.#renderer) this.#renderer.accept(value.frame, value)
      else value.frame.close()
    } else if (value.type === 'stats')
      this.publish({ stats: { ...value.stats, fps: this.#state.stats?.fps ?? 0 } })
    else if (value.type === 'failure') {
      if (!['network', 'temporary', 'fatal', 'stopped'].includes(value.cause))
        throw new Error('protocol_error')
      this.failure({ code: failureCode(value.code), cause: value.cause })
    } else if (value.type === 'disposed')
      this.failure({ cause: 'stopped', code: 'connection_failed' })
    else if (value.type === 'input-state') {
      const input = inputSnapshot(value)
      this.publish({ input })
      if (this.live(revision)) this.hooks.inputState(input)
    } else if (value.type === 'input-ack') {
      if (
        ![value.input_generation, value.batch_id].every(
          /* 精確primitive tag才能還credit。 */ (n) => Number.isSafeInteger(n) && n >= 0,
        ) ||
        value.batch_id < 1 ||
        typeof value.sent !== 'boolean'
      )
        throw new Error('protocol_error')
      this.hooks.inputAck({
        revision,
        input_generation: value.input_generation,
        batch_id: value.batch_id,
        sent: value.sent,
      })
    } else if (value.type === 'activity') {
      if (typeof value.open !== 'boolean') throw new Error('protocol_error')
      this.#socketOpen = value.open
      this.hooks.activity(revision, value.open)
    } else if (value.type === 'operation-error') {
      if (!OPERATION_CODES.includes(value.code)) throw new Error('protocol_error')
      this.hooks.issue(value.code)
    } else this.clipboardReply(value)
  }
  // 主動終止只settle当前life；終態發布讀lifecycle的最終固定分類。
  private failure(terminal: Terminal): void {
    this.#life?.finish(terminal)
  }
  // 未知post/clone故障固定fatal，沒有native文字或network猜測。
  private post(worker: WorkerPort, value: VideoMainEvent): void {
    try {
      worker.postMessage(value)
    } catch {
      this.failure({ cause: 'fatal', code: 'connection_failed' })
    }
  }
  // assist的HTTP分類留Main，proof只移交matching worker且所有未轉移bytes清零。
  private async assist(
    target: string,
    value: Extract<VideoWorkerEvent, { type: 'assist' }>,
    worker: WorkerPort,
    life: AttemptLifecycle,
  ): Promise<void> {
    const revision = life.handle.revision
    let proof: Uint8Array | null = null
    try {
      const result = await this.auth.request<{ proof: string }>(
        `api/v1/targets/${target}/login-assist`,
        'POST',
        { connection_id: value.connection, salt: value.salt, challenge: value.challenge },
        life.controller.signal,
      )
      try {
        proof = base64Bytes(result.proof)
      } finally {
        result.proof = ''
      }
      if (!this.live(revision) || life.controller.signal.aborted) return
      if (proof.length !== 32) throw new Error('protocol_error')
      worker.postMessage({ type: 'assist-result', revision, proof }, [proof.buffer as ArrayBuffer])
      proof = null
    } catch (error) {
      if (this.live(revision) && !life.controller.signal.aborted)
        this.failure(
          error instanceof HttpError
            ? httpTerminal(error.status, error.code)
            : { cause: 'fatal', code: 'login_assist_failed' },
        )
    } finally {
      if (proof?.byteLength) proof.fill(0)
    }
  }
  // input只傳primitive，真正admission／remote permission由同Worker sender再驗。
  sendInput(batch: InputBatch): void {
    if (this.live(batch.revision) && this.#worker)
      this.post(this.#worker, { type: 'input-batch', ...batch })
  }
  // release只派生當前仍有效revision的held ledger，不能重送到新session。
  releaseInput(revision: number): void {
    if (this.live(revision) && this.#worker)
      this.post(this.#worker, { type: 'input-release', revision })
  }
  // Main queue超額與ACK過期是本機資源fatal，不啟動network重試。
  failInput(revision: number): void {
    if (this.live(revision)) this.failure({ cause: 'fatal', code: 'input_backpressure' })
  }
  // clipboard UI只在完整登入的live crypto／peer权限允許時建立單次request。
  private clipboardRequest(
    kind: 'clipboard-push' | 'clipboard-pull',
    signal: AbortSignal,
    bytes?: Uint8Array,
  ): Promise<Uint8Array | void> {
    const revision = this.#revision,
      worker = this.#worker,
      input = this.#state.input
    if (
      !worker ||
      !this.live(revision) ||
      !this.#socketOpen ||
      !['awaiting_video', 'streaming'].includes(this.#state.phase) ||
      !input?.clipboard ||
      (kind === 'clipboard-pull' && !input.keyboard)
    )
      return Promise.reject(new Error('clipboard_unavailable'))
    if (this.#clipboardPending || this.#clipboardCancelling)
      return Promise.reject(new Error('clipboard_busy'))
    if (signal.aborted) return Promise.reject(new Error('clipboard_unavailable'))
    if (kind === 'clipboard-push') {
      try {
        textFromBytes(bytes!)
      } catch (error) {
        return Promise.reject(new Error(clipboardError(error)))
      }
    }
    if (this.#clipboardSequence >= Number.MAX_SAFE_INTEGER) {
      this.failure({ cause: 'fatal', code: 'protocol_error' })
      return Promise.reject(new Error('clipboard_unavailable'))
    }
    const tag = { revision, request_id: ++this.#clipboardSequence }
    // 一個slot只握這次的tag／waiter／timer，不保存第二份clipboard文字。
    return new Promise<Uint8Array | void>((resolve, reject) => {
      let done = false
      const deadline = this.now() + L.clipboardMs
      // listener與timer都屬本request，old callback不清新slot。
      const clear = (): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        if (this.#clipboardPending === slot) this.#clipboardPending = null
      }
      // 收到terminal時只拒絕waiter，後續reply由常駐清理listener清ownedbytes。
      const stop = (): void => {
        if (done) return
        done = true
        clear()
        reject(new Error('clipboard_unavailable'))
      }
      // 清理確認之前gate仍busy，阻塞Worker超過250ms就終止整個attempt。
      const cancel = (code: OperationCode): void => {
        if (done) return
        done = true
        clear()
        if (this.live(revision)) {
          this.#clipboardCancelling = { ...tag, deadline: this.now() + L.cleanupMs }
          this.#clipboardCleanup = setTimeout(
            /* 原deadline不延長。 */ () => {
              if (this.live(revision) && this.#clipboardCancelling?.request_id === tag.request_id) {
                this.hooks.issue('clipboard_timeout')
                this.failure({ cause: 'fatal', code: 'connection_timeout' })
              }
            },
            L.cleanupMs,
          )
          try {
            worker.postMessage({ type: 'clipboard-cancel', ...tag })
          } catch {
            this.failure({ cause: 'fatal', code: 'connection_failed' })
          }
        }
        reject(new Error(code))
      }
      // signal的任意reason不洩漏，只接受已知timeout或固定cancel。
      const abort = (): void =>
        cancel(
          signal.reason instanceof Error && signal.reason.message === 'clipboard_timeout'
            ? 'clipboard_timeout'
            : 'clipboard_unavailable',
        )
      const timer = setTimeout(
        /* 五秒後先要求關訂閱，不假稱可中斷同步解壓。 */ () => cancel('clipboard_timeout'),
        L.clipboardMs,
      )
      const slot: ClipboardPending = {
        ...tag,
        deadline,
        cancel,
        stop,
        // receiver先匹配tag，reply種類不得互換或任意code滲入UI。
        finish: (reply) => {
          if (done) {
            discard(reply)
            return
          }
          if (this.now() >= deadline) {
            cancel('clipboard_timeout')
            discard(reply)
            return
          }
          const invalid =
            (reply.type === 'clipboard-data' && kind !== 'clipboard-pull') ||
            (reply.type === 'clipboard-sent' && kind !== 'clipboard-push') ||
            (reply.type === 'clipboard-error' &&
              (!OPERATION_CODES.includes(reply.code) || !reply.code.startsWith('clipboard_')))
          if (invalid) {
            discard(reply)
            stop()
            this.failure({ cause: 'fatal', code: 'protocol_error' })
            return
          }
          done = true
          clear()
          if (reply.type === 'clipboard-data') {
            if (
              !(reply.bytes instanceof Uint8Array) ||
              !(reply.bytes.buffer instanceof ArrayBuffer) ||
              reply.bytes.length > L.clipboard
            ) {
              discard(reply)
              reject(new Error('clipboard_invalid'))
              this.failure({ cause: 'fatal', code: 'protocol_error' })
              return
            }
            resolve(reply.bytes)
          } else if (reply.type === 'clipboard-sent') resolve()
          else
            reject(
              new Error(reply.type === 'clipboard-error' ? reply.code : 'clipboard_unavailable'),
            )
        },
      }
      this.#clipboardPending = slot
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) {
        abort()
        return
      }
      let owned: Uint8Array | null = null
      try {
        if (kind === 'clipboard-push') {
          owned = new Uint8Array(bytes!)
          worker.postMessage({ type: kind, ...tag, bytes: owned }, [owned.buffer as ArrayBuffer])
          owned = null
        } else worker.postMessage({ type: kind, ...tag })
      } catch {
        if (owned?.byteLength) owned.fill(0)
        cancel('clipboard_unavailable')
        this.failure({ cause: 'fatal', code: 'connection_failed' })
      }
    })
  }
  // outbound caller原buffer仍可finally清除，transfer使用另一份owned copy。
  async pushClipboard(bytes: Uint8Array, signal: AbortSignal): Promise<void> {
    await this.clipboardRequest('clipboard-push', signal, bytes)
  }
  // inbound只交回當次owned bytes，Main controller負責strictdecode及清零。
  async pullClipboard(signal: AbortSignal): Promise<Uint8Array> {
    return (await this.clipboardRequest('clipboard-pull', signal)) as Uint8Array
  }
  // 只取消本host目前的活躍request，不解除已在等待的confirmation gate。
  cancelClipboard(): void {
    this.#clipboardPending?.cancel('clipboard_unavailable')
  }
  // late data先清，cancelled只有matchingtag才解除當次watchdog。
  private clipboardReply(reply: ClipboardReply): void {
    if (!Number.isSafeInteger(reply.request_id) || reply.request_id < 1) {
      discard(reply)
      throw new Error('protocol_error')
    }
    if (
      reply.type === 'clipboard-cancelled' &&
      this.#clipboardCancelling?.revision === reply.revision &&
      this.#clipboardCancelling.request_id === reply.request_id
    ) {
      if (this.now() >= this.#clipboardCancelling.deadline) {
        this.hooks.issue('clipboard_timeout')
        this.failure({ cause: 'fatal', code: 'connection_timeout' })
        return
      }
      if (this.#clipboardCleanup !== null) clearTimeout(this.#clipboardCleanup)
      this.#clipboardCleanup = null
      this.#clipboardCancelling = null
      return
    }
    const pending = this.#clipboardPending
    if (
      !pending ||
      pending.revision !== reply.revision ||
      pending.request_id !== reply.request_id
    ) {
      discard(reply)
      return
    }
    pending.finish(reply)
  }
  // 畫質只交已登入的活躍sender，不在候選closed socket排另一份control。
  setQuality(quality: Quality): void {
    if (
      this.#worker &&
      this.#socketOpen &&
      ['awaiting_video', 'streaming'].includes(this.#state.phase) &&
      ['low', 'balanced', 'high'].includes(quality)
    )
      this.post(this.#worker, { type: 'quality', revision: this.#revision, quality })
  }
  // Main呈現credit仍只屬對應revision／generation／frame_id。
  presented(value: Presented): void {
    if (this.live(value.revision) && this.#worker)
      this.post(this.#worker, { type: 'presented', ...value })
  }
  // publicdispose只取消目前life；old handle.cancel不可能關新operation。
  dispose(): void {
    this.#life?.handle.cancel()
  }
  // 作廢revision先於任何nativecallback，釋放順序與old waiter引用都固定。
  private cleanupOperation(revision: number): void {
    if (!this.live(revision)) return
    this.#revision++
    this.#life = null
    this.#socketOpen = false
    this.#rejectProbe?.()
    this.#resolveProbe = null
    this.#rejectProbe = null
    const pending = this.#clipboardPending
    this.#clipboardPending = null
    pending?.stop()
    if (this.#clipboardCleanup !== null) clearTimeout(this.#clipboardCleanup)
    this.#clipboardCleanup = null
    this.#clipboardCancelling = null
    const renderer = this.#renderer
    this.#renderer = null
    const worker = this.#worker
    this.#worker = null
    this.#state = { revision, phase: 'closed' }
    let failed = false
    try {
      renderer?.dispose()
    } catch {
      failed = true
    }
    if (worker) {
      let done = false
      // timer先建立，sync disposed與throw路徑都清同一個fallback。
      const timer = setTimeout(/* 沒有確認也必須有限terminate。 */ () => finish(), L.cleanupMs)
      // 關閉特定old worker一次，不再引用新renderer／globalwaiter。
      const finish = (): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        worker.onmessage = null
        worker.onerror = null
        try {
          worker.terminate()
        } catch {
          /* 原生失效不暴露例外內容。 */
        }
      }
      // oldworker只有清owned資源與matchingdisposed確認權。
      worker.onmessage = (event): void => {
        discard(event.data)
        if (event.data.type === 'disposed' && event.data.revision === revision) finish()
      }
      worker.onerror = null
      try {
        worker.postMessage({ type: 'dispose', revision })
      } catch {
        finish()
      }
    }
    if (failed) throw new Error('connection_failed')
  }
}
