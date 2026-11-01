import type {
  InputBatch,
  InputIntent,
  InputAck,
  InputState,
  InputTag,
  OperationCode,
} from './interaction-types'
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
// Windows文字控速選項；textGapMs預設為INTERACTION_LIMITS.textGapMs，schedule供測試注入。
export interface InputChannelOptions {
  textGapMs?: number
  issue?: (code: OperationCode) => void
  schedule?: (wake: () => void, ms: number) => () => void
}
// 預設排程使用單次setTimeout，回傳取消函式。
function defaultSchedule(wake: () => void, ms: number): () => void {
  const timer = setTimeout(wake, ms)
  return () => clearTimeout(timer)
}
// 按鍵、快捷鍵、按鈕的身分字串，供配對按下與放開；其他事件回null。
function controlId(value: InputIntent): string | null {
  if (value.kind === 'key') return 'key:' + value.key
  if (value.kind === 'shortcut') return 'shortcut:' + value.char
  if (value.kind === 'button') return 'button:' + value.button
  return null
}
export class InputChannel {
  private state: InputState | null = null
  private focused = false
  private queue: InputIntent[] = []
  private latest: Extract<InputIntent, { kind: 'move' }> | null = null
  private size = 0
  private sequence = 0
  private waiting: (InputTag & { deadline: number; textRest: boolean }) | null = null
  private textReadyAt = -Infinity
  private busyIssued = false
  // 已送出且尚未送出放開的按下身分；有界於實際按住的鍵與按鈕，失焦時隨Worker release清空。
  private sentDowns = new Set<string>()
  private cancelWake: (() => void) | null = null
  private movedAt = -Infinity
  private closed = false
  // Main 僅持有 ports 與有限待送資料，不持有 protobuf 或遠端原點。
  constructor(
    private readonly send: (b: InputBatch) => void,
    private readonly release: (r: number) => void,
    private readonly fail: (c: 'input_backpressure') => void,
    private readonly now: () => number,
    private readonly options: InputChannelOptions = {},
  ) {}
  // 只有Windows受控端才逐code point控速。
  private get paced(): boolean {
    return this.state?.platform === 'windows'
  }
  // 佇列中仍有未送出的控速文字片。
  private get pacing(): boolean {
    return this.paced && this.queue.some((e) => e.kind === 'text')
  }
  // 控速中佇列滿：已送出按下的放開排不進去即沿用致命（避免遠端卡鍵）；按下仍在佇列且未配對時兩者一併移除；
  // 按下從未送出（例如已被拒收）時放開靜默捨棄；其他輸入拒收並在本段只提示一次。
  private rejectWhilePacing(value: InputIntent): void {
    const id = controlId(value)
    if (id && 'down' in value && !value.down) {
      if (this.sentDowns.has(id)) {
        this.overflow()
        return
      }
      let pendingUps = 0
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const queued = this.queue[i]!
        if (controlId(queued) !== id || !('down' in queued)) continue
        if (!queued.down) pendingUps++
        else if (pendingUps) pendingUps--
        else {
          this.queue.splice(i, 1)
          return
        }
      }
      return
    }
    if (this.busyIssued) return
    this.busyIssued = true
    this.options.issue?.('input_text_busy')
  }
  // 至多一個單次喚醒；喚醒後仍由tick以now()重驗期限與間隔，不靠timer漂移。
  private arm(): void {
    if (this.cancelWake) return
    const schedule = this.options.schedule ?? defaultSchedule
    this.cancelWake = schedule(
      () => {
        this.cancelWake = null
        this.tick()
      },
      Math.max(0, this.textReadyAt - this.now()),
    )
  }
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
    this.cancelWake?.()
    this.cancelWake = null
    this.busyIssued = false
    // 待送文字已清除，殘留間隔與舊片的剩餘標記都不得再影響新輸入。
    this.textReadyAt = -Infinity
    if (this.waiting) this.waiting.textRest = false
    this.sentDowns.clear()
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
        // 控速中佇列滿時hover move直接捨棄，不提示也不終止。
        if (!this.pacing) this.overflow()
        return
      }
      this.latest = { ...value }
    } else {
      if (this.count + 1 > L.pending || this.size + bytes > L.pendingBytes) {
        if (this.pacing) this.rejectWhilePacing(value)
        else this.overflow()
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
    // 上一片文字的間隔未到，任何下一批都要等；只排一次喚醒。
    if (this.paced && this.now() < this.textReadyAt) {
      if (this.queue.length || this.latest) this.arm()
      return
    }
    if (!this.queue.length && this.latest && this.now() - this.movedAt >= 1000 / L.moveHz) {
      this.queue.push(this.latest)
      this.latest = null
    }
    const events: InputIntent[] = []
    let bytes = 0,
      moved = false,
      textSlice = false,
      textRest = false
    while (this.queue.length && events.length < L.batch) {
      const next = this.queue[0]!
      // Windows控速：文字只取第一個code point單獨成批，剩餘留在佇列頭。
      if (this.paced && next.kind === 'text') {
        if (events.length) break
        const first = Array.from(next.text)[0]!
        const slice: InputIntent = { ...next, text: first, modifiers: [...next.modifiers] }
        const n = eventBytes(slice)
        const rest = next.text.slice(first.length)
        if (rest) this.queue[0] = { ...next, text: rest }
        else this.queue.shift()
        events.push(slice)
        bytes += n
        this.size -= n
        textSlice = true
        textRest = !!rest
        break
      }
      const n = eventBytes(next)
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
    if (!this.queue.some((e) => e.kind === 'text')) this.busyIssued = false
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
    for (const event of events) {
      const id = controlId(event)
      if (id && 'down' in event) {
        if (event.down) this.sentDowns.add(id)
        else this.sentDowns.delete(id)
      }
    }
    this.waiting = { ...tag, deadline: this.now() + L.inputAckMs, textRest }
    if (textSlice) this.textReadyAt = this.now() + (this.options.textGapMs ?? L.textGapMs)
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
    // 某片未送出時丟棄同段剩餘文字，不在世代切換後補送。
    if (!value.sent && tag.textRest && this.queue[0]?.kind === 'text') {
      this.size -= eventBytes(this.queue[0])
      this.queue.shift()
    }
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
      this.state.platform !== 'windows' ||
      // 文字間隔未到期時回報忙碌，不把SAS留在佇列等待之後的焦點。
      this.now() < this.textReadyAt
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
