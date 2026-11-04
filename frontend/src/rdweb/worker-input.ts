import type { hbb } from './codec'
import type {
  InputState,
  InputAck,
  InputBatch,
  PeerInputMetadata,
  RemotePermissions,
  OperationCode,
  InputIntent,
  ControlName,
  Modifier,
} from './interaction-types'
import { encodeInput, remotePoint } from './input-codec'
import { utf8, INTERACTION_LIMITS as L } from './interaction-limits'
type HeldKey = Extract<InputIntent, { kind: 'key' | 'shortcut' }>
type HeldButton = Extract<InputIntent, { kind: 'button' }>
const HOT_KEYS = new Set<ControlName>(['Control', 'RControl', 'Alt', 'RAlt', 'Meta', 'RWin'])
// 純語意 id，不接受 Main 自訂任意 ledger key。
function keyId(value: InputIntent): string | null {
  return value.kind === 'key'
    ? 'key:' + value.key
    : value.kind === 'shortcut'
      ? 'shortcut:' + value.char
      : null
}
export class WorkerInputSender {
  private meta: PeerInputMetadata | null = null
  private permissions: RemotePermissions = { keyboard: true, clipboard: true }
  private decoderGeneration = 0
  private inputGeneration = 0
  private mediaReady = false
  private closed = false
  private lastBatch = 0
  private lastState = ''
  private keys = new Map<string, HeldKey>()
  private buttons = new Map<HeldButton['button'], HeldButton>()
  // Worker 獨占已送 ledger，所有 wire 共用原本同步 sender。
  constructor(
    private readonly revision: number,
    private readonly send: (m: hbb.IMessage) => void,
    private readonly state: (s: InputState) => void,
    private readonly ack: (a: InputAck) => void,
    private readonly issue: (c: OperationCode) => void,
  ) {}
  // 原點／index／尺寸／platform／SAS 改變先 release 舊幾何，再作廢輸入世代。
  setPeer(value: PeerInputMetadata): void {
    if (this.closed) return
    remotePoint(value, 0, 0)
    if (
      !['windows', 'linux', 'unsupported'].includes(value.platform) ||
      typeof value.sas !== 'boolean'
    )
      throw new Error('protocol_error')
    const a = this.meta,
      b = value.geometry
    if (
      a &&
      a.platform === value.platform &&
      a.sas === value.sas &&
      a.geometry.display === b.display &&
      a.geometry.width === b.width &&
      a.geometry.height === b.height &&
      a.geometry.x === b.x &&
      a.geometry.y === b.y
    )
      return
    this.release()
    this.nextGeneration()
    this.meta = { ...value, geometry: { ...b } }
    this.publish()
  }
  // metadata 不能重設先前明確否定的權限；clipboard 不改鍵盤世代。
  permission(value: RemotePermissions): void {
    if (this.closed) return
    if (typeof value.keyboard !== 'boolean' || typeof value.clipboard !== 'boolean')
      throw new Error('protocol_error')
    if (this.permissions.keyboard !== value.keyboard) {
      this.release()
      this.nextGeneration()
    }
    this.permissions = { ...value }
    this.publish()
  }
  // decoder 重配獨立增加輸入世代，同值 frame callback 不反覆 release。
  media(generation: number, ready: boolean): void {
    if (this.closed) return
    if (!Number.isSafeInteger(generation) || generation < 0 || typeof ready !== 'boolean')
      throw new Error('protocol_error')
    if (generation !== this.decoderGeneration) {
      this.release()
      this.nextGeneration()
    } else if (this.mediaReady && !ready) this.release()
    this.decoderGeneration = generation
    this.mediaReady = ready
    this.publish()
  }
  // 整批預驗，舊世代回 dropped credit，sender 故障不混成操作提示。
  receive(batch: InputBatch): void {
    if (this.closed || batch.revision !== this.revision) return
    if (
      !Number.isSafeInteger(batch.batch_id) ||
      batch.batch_id < 1 ||
      batch.batch_id <= this.lastBatch ||
      !Number.isSafeInteger(batch.input_generation) ||
      batch.input_generation < 0
    )
      throw new Error('protocol_error')
    this.lastBatch = batch.batch_id
    const tag = {
      revision: batch.revision,
      input_generation: batch.input_generation,
      batch_id: batch.batch_id,
    }
    if (batch.input_generation !== this.inputGeneration || !this.ready || !this.meta) {
      this.ack({ ...tag, sent: false })
      return
    }
    if (!Array.isArray(batch.events) || !batch.events.length || batch.events.length > L.batch)
      throw new Error('protocol_error')
    let bytes = 0
    const projected = new Map(this.keys)
    try {
      for (const event of batch.events) {
        encodeInput(event, this.meta)
        if (event.kind === 'text') {
          const data = utf8(event.text, L.text, 'input_text_too_large')
          try {
            bytes += data.length
          } finally {
            data.fill(0)
          }
          for (const [id, key] of projected)
            if (key.kind === 'key' && HOT_KEYS.has(key.key)) projected.delete(id)
        }
        const id = keyId(event)
        if (id && (event.kind === 'key' || event.kind === 'shortcut')) {
          if (event.down) {
            if (!projected.has(id) && projected.size >= L.held)
              throw new Error('input_backpressure')
            projected.set(id, event)
          } else projected.delete(id)
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        ['input_unsupported', 'input_text_too_large'].includes(error.message)
      ) {
        this.issue(error.message as OperationCode)
        this.ack({ ...tag, sent: false })
        return
      }
      throw error
    }
    if (bytes > L.batchBytes) throw new Error('protocol_error')
    for (const event of batch.events) this.deliver(event)
    this.ack({ ...tag, sent: true })
  }
  // 只有成功提交的 down 進 ledger；text／wheel／SAS 不產虛假的 up。
  private deliver(event: InputIntent): void {
    const meta = this.meta!
    if (event.kind === 'text') {
      for (const [id, key] of this.keys)
        if (key.kind === 'key' && HOT_KEYS.has(key.key)) {
          for (const message of encodeInput({ ...key, down: false, modifiers: [] }, meta))
            this.send(message)
          this.keys.delete(id)
        }
    }
    if (event.kind === 'shortcut' && meta.platform === 'windows') this.chord(event)
    else for (const message of encodeInput(event, meta)) this.send(message)
    const id = keyId(event)
    if (id && (event.kind === 'key' || event.kind === 'shortcut')) {
      if (event.down) this.keys.set(id, { ...event, modifiers: [...event.modifiers] })
      else this.keys.delete(id)
    }
    if (event.kind === 'button') {
      if (event.down) this.buttons.set(event.button, { ...event, modifiers: [...event.modifiers] })
      else this.buttons.delete(event.button)
    }
  }
  // Translate 不讀 modifiers，顯式補缺少家族並在同 sender 最佳努力放開。
  private chord(event: Extract<InputIntent, { kind: 'shortcut' }>): void {
    const held = new Set<Modifier>()
    for (const value of this.keys.values())
      if (value.kind === 'key') {
        const family = this.modifierFamily(value.key)
        if (family) held.add(family)
      }
    const temporary = event.down
      ? event.modifiers.filter(
          /* 只補足尚未按下的 hot modifier 家族。 */ (m) =>
            ['Alt', 'Control', 'Shift', 'Meta'].includes(m) && !held.has(m),
        )
      : []
    const sent: Modifier[] = []
    try {
      for (const key of temporary) {
        for (const message of encodeInput(
          { kind: 'key', key, down: true, modifiers: event.modifiers },
          this.meta!,
        ))
          this.send(message)
        sent.push(key)
      }
      for (const message of encodeInput(event, this.meta!)) this.send(message)
    } finally {
      for (const key of sent.reverse())
        for (const message of encodeInput(
          { kind: 'key', key, down: false, modifiers: [] },
          this.meta!,
        ))
          this.send(message)
    }
  }
  // 左右修飾鍵合回安全家族，只供 Windows shortcut 補足判斷。
  private modifierFamily(key: ControlName): Modifier | null {
    const map: Partial<Record<ControlName, Modifier>> = {
      RControl: 'Control',
      RShift: 'Shift',
      RAlt: 'Alt',
      RWin: 'Meta',
      Control: 'Control',
      Shift: 'Shift',
      Alt: 'Alt',
      Meta: 'Meta',
    }
    return map[key] ?? null
  }
  // release 只派生已送 ledger，button up 不把 drag 游標移回舊位置。
  release(): void {
    const keys = [...this.keys.values()],
      buttons = [...this.buttons.values()]
    this.keys.clear()
    this.buttons.clear()
    if (!this.meta) return
    for (const event of keys) {
      try {
        for (const message of encodeInput({ ...event, down: false, modifiers: [] }, this.meta))
          this.send(message)
      } catch {
        /* 已斷網只最佳努力，不重播至新 session。 */
      }
    }
    for (const event of buttons) {
      const bit = { left: 1, right: 2, middle: 4 }[event.button]
      try {
        this.send({ mouseEvent: { mask: bit * 8 + 2, modifiers: [] } })
      } catch {
        /* 舊 Socket 失效仍清本機 ledger。 */
      }
    }
  }
  // 已驗 peer／media／keyboard 三者皆有效才允許發一般輸入。
  private get ready(): boolean {
    return (
      this.mediaReady &&
      this.permissions.keyboard &&
      !!this.meta &&
      this.meta.platform !== 'unsupported'
    )
  }
  // 精確世代不得在 Number 安全範圍外繼續比較。
  private nextGeneration(): void {
    if (this.inputGeneration >= Number.MAX_SAFE_INTEGER) throw new Error('input_backpressure')
    this.inputGeneration++
  }
  // 安全 DTO 刻意不含 origin、按鍵 ledger 或文字；同值不重送。
  private publish(): void {
    if (!this.meta || this.closed) return
    const g = this.meta.geometry
    const value: InputState = {
      revision: this.revision,
      input_generation: this.inputGeneration,
      display: { display: g.display, width: g.width, height: g.height },
      platform: this.meta.platform,
      sas: this.meta.sas,
      ready: this.ready,
      ...this.permissions,
    }
    const signature = JSON.stringify(value)
    if (signature === this.lastState) return
    this.lastState = signature
    this.state(value)
  }
  // ledger 在 crypto sender 尚存時 release 一次，再斷所有 metadata 引用。
  dispose(): void {
    if (this.closed) return
    this.release()
    this.closed = true
    this.meta = null
    this.mediaReady = false
    this.lastState = ''
  }
}
