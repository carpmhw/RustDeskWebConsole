import type { ClipboardPort, ClipboardBridge, ClipboardUi } from './interaction-types'
import { OPERATION_CODES, type OperationCode } from './interaction-types'
import { utf8, textFromBytes, INTERACTION_LIMITS as L } from './interaction-limits'
import { clipboardError } from './clipboard-errors'
interface Operation {
  epoch: number
  signal: AbortSignal
}
export class ClipboardController {
  private revision = 0
  private epoch = 0
  private controller: AbortController | null = null
  private deadline = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private nativeBusy = false
  private lease = ''
  private leaseDeadline = 0
  private editedValid = true
  private state: ClipboardUi = { busy: false, receiving: false, fallback: 'none' }
  private closed = false
  // Main 唯一 native／文字 owner；公開 state 只含固定 primitive。
  constructor(
    private readonly port: ClipboardPort,
    private readonly bridge: ClipboardBridge,
    private readonly notify: (v: ClipboardUi) => void,
    private readonly now: () => number,
  ) {}
  // 明確 gesture 新建單次 epoch；重試手動框時保留原文字期限。
  private begin(preserve = false): Operation | null {
    this.tick()
    if (this.closed) return null
    if (this.state.busy) {
      this.publish({ code: 'clipboard_busy' })
      return null
    }
    const lease = preserve ? this.lease : '',
      deadline = preserve ? this.leaseDeadline : 0
    this.close()
    this.lease = lease
    this.leaseDeadline = deadline
    this.controller = new AbortController()
    this.deadline = this.now() + L.clipboardMs
    this.publish({ busy: true, receiving: false, fallback: 'none', code: undefined })
    this.arm()
    return { epoch: this.epoch, signal: this.controller.signal }
  }
  // 一個操作一個 timer；提前 wake 時只重設同一個剩餘期限。
  private arm(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    // 實際期限在 wake 入口再次驗證，不能靠 timer 漂移延長。
    this.timer = setTimeout(
      () => {
        this.timer = null
        this.tick()
        if (this.controller && this.deadline) this.arm()
      },
      Math.max(1, this.deadline - this.now()),
    )
  }
  // 晚 promise 結果只清 owned bytes，不持續握有 waiter 或更新新 UI。
  private wait<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    // awaiter 只管理這次 promise，原生 OS write 並沒有被撤回。
    return new Promise<T>((resolve, reject) => {
      let done = false
      let ok: ((v: T) => void) | null = resolve,
        bad: ((e: Error) => void) | null = reject
      // 取消／settlement 共用單一路徑，釋放 listener／resolve references。
      const finish = (value?: T, code?: OperationCode): void => {
        if (done) {
          if (value instanceof Uint8Array && value.byteLength) value.fill(0)
          return
        }
        done = true
        signal.removeEventListener('abort', abort)
        const yes = ok,
          no = bad
        ok = null
        bad = null
        if (code) {
          if (value instanceof Uint8Array && value.byteLength) value.fill(0)
          no?.(new Error(code))
        } else yes?.(value as T)
      }
      // reason 僅讀固定 clipboard code，不轉送原生任意 exception。
      const abort = (): void => finish(undefined, clipboardError(signal.reason))
      signal.addEventListener('abort', abort, { once: true })
      // 完成入口先驗實際 deadline；late buffer 即使 bridge 忽略 abort 也清零。
      operation.then(
        (value) => {
          this.tick()
          finish(value, signal.aborted ? clipboardError(signal.reason) : undefined)
        },
        /* rejection 同樣先驗期限，不留 unhandled promise。 */ (error) => {
          this.tick()
          finish(undefined, signal.aborted ? clipboardError(signal.reason) : clipboardError(error))
        },
      )
      if (signal.aborted) abort()
    })
  }
  // native 實際 promise 未 settle 前保留 busy，禁止累積另一批不可取消 OS 操作。
  private native<T>(action: () => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new Error(clipboardError(signal.reason)))
    if (this.nativeBusy) return Promise.reject(new Error('clipboard_busy'))
    this.nativeBusy = true
    let promise: Promise<T>
    try {
      promise = action()
    } catch {
      this.nativeBusy = false
      return Promise.reject(new Error('clipboard_unavailable'))
    }
    // 只有原生 promise 真正完成才解除 nativeBusy，與 awaiter timeout 分開。
    const operation = promise.then(
      (value) => {
        this.nativeBusy = false
        return value
      },
      /* browser 拒絕只回安全分類。 */ (error) => {
        this.nativeBusy = false
        const code =
          error instanceof Error &&
          OPERATION_CODES.includes(error.message as OperationCode) &&
          error.message.startsWith('clipboard_')
            ? (error.message as OperationCode)
            : 'clipboard_permission_denied'
        throw new Error(code)
      },
    )
    return this.wait(operation, signal)
  }
  // 完成只清該 epoch 的 operation timer，不解除仍 pending 的 nativeBusy。
  private done(op: Operation, patch: Partial<ClipboardUi>): void {
    if (op.epoch !== this.epoch || this.closed) return
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.deadline = 0
    this.controller = null
    this.publish({ busy: false, ...patch, receiving: false })
  }
  // 文字只在 private lease，已建立 copy lease 的失敗不能補另一個 30 秒。
  private fallback(op: Operation, kind: 'send' | 'copy', code: OperationCode): void {
    if (op.epoch !== this.epoch || this.closed) return
    if (!this.leaseDeadline) this.leaseDeadline = this.now() + L.leaseMs
    this.done(op, { fallback: kind, code })
  }
  // gesture 下 native read；失敗提供手動框，不暗中讀／貼入遠端程式。
  async sendLocal(): Promise<void> {
    const op = this.begin()
    if (!op) return
    let value = '',
      bytes: Uint8Array | undefined
    try {
      try {
        value = await this.native(
          /* 只在此使用者入口讀一次。 */ () => this.port.readText(),
          op.signal,
        )
      } catch (error) {
        this.fallback(op, 'send', clipboardError(error))
        return
      }
      if (op.epoch !== this.epoch || op.signal.aborted) return
      bytes = utf8(value, L.clipboard, 'clipboard_too_large')
      value = ''
      await this.wait(this.bridge.push(bytes, op.signal), op.signal)
      this.done(op, { fallback: 'none', code: undefined })
    } catch (error) {
      this.done(op, { code: clipboardError(error) })
    } finally {
      value = ''
      if (bytes?.byteLength) bytes.fill(0)
    }
  }
  // 先接收再由使用者遠端複製；提示只涵蓋matching epoch等待bytes，不涵蓋native寫入。
  async copyRemote(): Promise<void> {
    const op = this.begin()
    if (!op) return
    this.publish({ receiving: true })
    if (op.epoch !== this.epoch || op.signal.aborted) return
    let bytes: Uint8Array | undefined
    try {
      bytes = await this.wait(this.bridge.pull(op.signal), op.signal)
      if (op.epoch !== this.epoch || op.signal.aborted) return
      this.publish({ receiving: false })
      if (op.epoch !== this.epoch || op.signal.aborted) return
      this.lease = textFromBytes(bytes)
      bytes.fill(0)
      bytes = undefined
      this.leaseDeadline = this.now() + L.leaseMs
      try {
        await this.native(
          /* write 的 OS 副作用只能最佳努力等待。 */ () => this.port.writeText(this.lease),
          op.signal,
        )
      } catch (error) {
        this.fallback(op, 'copy', clipboardError(error))
        return
      }
      if (op.epoch === this.epoch) {
        this.lease = ''
        this.leaseDeadline = 0
      }
      this.done(op, { fallback: 'none', code: undefined })
    } catch (error) {
      this.done(op, { code: clipboardError(error) })
    } finally {
      if (bytes?.byteLength) bytes.fill(0)
    }
  }
  // revision 同值不關活躍框，真正替換先清掉晚回應的使用權。
  setRevision(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('protocol_error')
    if (!this.closed && value !== this.revision) {
      this.close()
      this.revision = value
    }
  }
  // 無效編輯不保留前次有效文字，避免 submit 意外送出舊內容。
  edit(value: string): void {
    this.tick()
    if (this.closed || this.state.fallback !== 'send' || this.state.busy) return
    let bytes: Uint8Array | undefined
    try {
      bytes = utf8(value, L.clipboard, 'clipboard_too_large')
      this.lease = value
      this.editedValid = true
      this.publish({ code: undefined })
    } catch (error) {
      this.lease = ''
      this.editedValid = false
      this.publish({ code: clipboardError(error) })
    } finally {
      if (bytes?.byteLength) bytes.fill(0)
    }
  }
  // 手動 submit 不再呼 native read，失敗保留剩餘 lease 而不重設 30 秒。
  async submit(): Promise<void> {
    this.tick()
    if (this.closed || this.state.fallback !== 'send' || !this.editedValid) return
    const op = this.begin(true)
    if (!op) return
    let bytes: Uint8Array | undefined
    try {
      bytes = utf8(this.lease, L.clipboard, 'clipboard_too_large')
      await this.wait(this.bridge.push(bytes, op.signal), op.signal)
      if (op.epoch === this.epoch) {
        this.lease = ''
        this.leaseDeadline = 0
      }
      this.done(op, { fallback: 'none', code: undefined })
    } catch (error) {
      if (op.epoch === this.epoch && this.now() < this.leaseDeadline)
        this.done(op, { fallback: 'send', code: clipboardError(error) })
      else this.done(op, { code: clipboardError(error) })
    } finally {
      if (bytes?.byteLength) bytes.fill(0)
    }
  }
  // 明確新 gesture 才可再次 write；期限保持原值，pending native 不排 queue。
  async copyFallback(): Promise<void> {
    this.tick()
    if (this.closed || this.state.fallback !== 'copy') return
    const op = this.begin(true)
    if (!op) return
    try {
      await this.native(
        /* 每次新按鈕手勢仍只呼一次 native write。 */ () => this.port.writeText(this.lease),
        op.signal,
      )
      if (op.epoch === this.epoch) {
        this.lease = ''
        this.leaseDeadline = 0
      }
      this.done(op, { fallback: 'none', code: undefined })
    } catch (error) {
      this.fallback(op, 'copy', clipboardError(error))
    }
  }
  // 所有入口驗 operation／lease 實際期限；整次操作只有原始五秒界限。
  tick(): void {
    if (this.closed) return
    if (this.leaseDeadline && this.now() >= this.leaseDeadline) {
      this.close()
      return
    }
    if (this.controller && this.deadline && this.now() >= this.deadline) {
      const epoch = this.epoch
      if (this.timer !== null) clearTimeout(this.timer)
      this.timer = null
      this.deadline = 0
      this.controller.abort(new Error('clipboard_timeout'))
      try {
        this.bridge.cancel()
      } catch {
        /* Host 自己負責 transport fatal 清理。 */
      }
      // 先取消舊operation才通知，重入新epoch不可被舊tick作廢。
      if (epoch === this.epoch && !this.closed) this.publish({ receiving: false })
    }
  }
  // safe state 不含文字，notify 不取得 clipboard 值或原生 error。
  private publish(patch: Partial<ClipboardUi>): void {
    this.state = { ...this.state, ...patch }
    if (!this.closed) this.notify({ ...this.state })
  }
  // 關框／hidden／auth／route 先作廢 epoch，再釋放文字、listener 與 timer。
  close(): void {
    if (this.closed) return
    this.epoch++
    const controller = this.controller
    this.controller = null
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.deadline = 0
    this.lease = ''
    this.leaseDeadline = 0
    this.editedValid = true
    controller?.abort(new Error('clipboard_unavailable'))
    try {
      this.bridge.cancel()
    } catch {
      /* 不因失效 transport 保留文字或 timer。 */
    }
    this.publish({ busy: false, receiving: false, fallback: 'none', code: undefined })
  }
  // 只短讀目前未過期的私有文字，不加入公開 state／storage。
  text(): string {
    this.tick()
    return this.lease
  }
  // disposed 後晚 native promise 只解除 nativeBusy，不回 UI 或第二次寫入。
  dispose(): void {
    if (this.closed) return
    this.close()
    this.closed = true
  }
}
