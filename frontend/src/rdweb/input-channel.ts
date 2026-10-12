import type { InputBatch, InputIntent, InputAck, InputState, InputTag } from './interaction-types'
import { INTERACTION_LIMITS as L, utf8 } from './interaction-limits'
// 文字 byte 計數暫存一律清除，不保留第二份待送 payload。
function eventBytes(value: InputIntent): number {
  if (value.kind !== 'text') return 0
  const bytes = utf8(value.text, L.text, 'input_text_too_large')
  try {
    return bytes.length
  } finally {
    bytes.fill(0)
  }
}
export class InputChannel {
  private state: InputState | null = null
  private focused = false
  private queue: InputIntent[] = []
  private latest: Extract<InputIntent, { kind: 'move' }> | null = null
  private size = 0
  private sequence = 0
  private waiting: (InputTag & { deadline: number }) | null = null
  private movedAt = -Infinity
  private closed = false
  // Main 僅持有 ports 與有限待送資料，不持有 protobuf 或遠端原點。
  constructor(
    private readonly send: (b: InputBatch) => void,
    private readonly release: (r: number) => void,
    private readonly fail: (c: 'input_backpressure') => void,
    private readonly now: () => number,
  ) {}
  // 舊世代作廢 pending，但只有不同 revision 才可清原本在途 credit。
  setState(value: InputState): void {
    if (this.closed) return
    const a = this.state
    if (
      a &&
      (a.revision !== value.revision ||
        a.input_generation !== value.input_generation ||
        !value.ready ||
        !value.keyboard ||
        a.platform !== value.platform ||
        a.sas !== value.sas)
    ) {
      this.blur()
      if (a.revision !== value.revision) {
        this.waiting = null
        this.movedAt = -Infinity
      }
    }
    this.state = { ...value, display: { ...value.display } }
  }
  // 只有使用者明確取焦且 safe ready 時才接收一般輸入。
  focus(): void {
    this.focused = !!this.state?.ready && this.state.keyboard && !this.closed
  }
  // 清 pending 與焦點，release 只針對目前仍存活 revision。
  blur(): void {
    const active = this.focused || this.queue.length > 0 || this.latest !== null
    this.focused = false
    this.queue = []
    this.latest = null
    this.size = 0
    if (active && this.state && !this.closed) this.release(this.state.revision)
  }
  // hover 只留 latest，離散動作前保留順序且含 move 的總數仍有界。
  enqueue(value: InputIntent): void {
    if (!this.focused || !this.state?.ready || !this.state.keyboard || this.closed) return
    const bytes = eventBytes(value)
    if (value.kind === 'move') {
      if (!this.latest && this.count >= L.pending) {
        this.overflow()
        return
      }
      this.latest = { ...value }
    } else {
      if (this.count + 1 > L.pending || this.size + bytes > L.pendingBytes) {
        this.overflow()
        return
      }
      if (this.latest) {
        this.queue.push(this.latest)
        this.latest = null
      }
      this.queue.push(structuredClone(value))
      this.size += bytes
    }
    this.flush()
  }
  // 每次至多一個 batch，inflight 只存 tag／deadline 而不再保留文字。
  private flush(): void {
    if (this.closed || this.waiting || !this.focused || !this.state?.ready) return
    if (!this.queue.length && this.latest && this.now() - this.movedAt >= 1000 / L.moveHz) {
      this.queue.push(this.latest)
      this.latest = null
    }
    const events: InputIntent[] = []
    let bytes = 0,
      moved = false
    while (this.queue.length && events.length < L.batch) {
      const next = this.queue[0]!,
        n = eventBytes(next)
      if (bytes + n > L.batchBytes) break
      if (next.kind === 'move' && (moved || this.now() - this.movedAt < 1000 / L.moveHz)) break
      events.push(this.queue.shift()!)
      bytes += n
      this.size -= n
      if (next.kind === 'move') {
        moved = true
        this.movedAt = this.now()
      }
    }
    if (!events.length) return
    if (this.sequence >= Number.MAX_SAFE_INTEGER) {
      this.overflow()
      return
    }
    const tag = {
      revision: this.state.revision,
      input_generation: this.state.input_generation,
      batch_id: ++this.sequence,
    }
    this.waiting = { ...tag, deadline: this.now() + L.inputAckMs }
    try {
      this.send({ ...tag, events })
    } catch {
      this.overflow()
    }
  }
  // 精確舊世代 dropped ACK 可歸還原 credit，不得復活舊 pending。
  ack(value: InputAck): void {
    this.tick()
    const tag = this.waiting
    if (
      !tag ||
      tag.revision !== value.revision ||
      tag.input_generation !== value.input_generation ||
      tag.batch_id !== value.batch_id
    )
      return
    this.waiting = null
    this.flush()
  }
  // 背景恢復與 ACK 都先驗實際 deadline，過期不再送出事件。
  tick(): void {
    if (this.closed) return
    if (this.waiting && this.now() >= this.waiting.deadline) {
      this.overflow()
      return
    }
    this.flush()
  }
  // 超額或提交失敗由單次 terminal port 收尾，不繼續半套輸入。
  private overflow(): void {
    if (this.closed) return
    this.dispose()
    this.fail('input_backpressure')
  }
  // 冪等清理，不將舊輸入或 release 重送到新的 session。
  dispose(): void {
    if (this.closed) return
    this.blur()
    this.closed = true
    this.waiting = null
    this.state = null
  }
  // SAS 專用 gesture 不奪一般鍵盤焦點，busy 時不排第二條。
  commandSas(): boolean {
    if (
      this.closed ||
      this.waiting ||
      this.count ||
      !this.state?.ready ||
      !this.state.keyboard ||
      !this.state.sas ||
      this.state.platform !== 'windows'
    )
      return false
    const focused = this.focused
    this.focused = true
    this.enqueue({ kind: 'sas' })
    this.focused = focused
    return this.waiting !== null
  }
  // 安全計數只含 application-owned pending，不是 native 記憶體量測。
  get count(): number {
    return this.queue.length + (this.latest ? 1 : 0)
  }
  // 純文字待送 bytes 不含已提交 payload。
  get bytes(): number {
    return this.size
  }
  // 供專用工具列命令 busy gate，不交出 tag 或 ledger。
  get inflight(): boolean {
    return this.waiting !== null
  }
}
