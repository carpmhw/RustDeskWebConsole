import { hbb } from './codec'
import type { ClipboardReply, ClipboardTag, RemotePermissions } from './interaction-types'
import { decodeTextClipboard, encodeTextClipboard, clipboardError } from './clipboard-codec'
import { INTERACTION_LIMITS as L } from './interaction-limits'
import {
  observeIncomingClipboard,
  type IncomingClipboardObserverSource,
} from './incoming-clipboard-observer'
export class WorkerClipboard {
  private active: (ClipboardTag & { deadline: number }) | null = null
  private permissions: RemotePermissions = { keyboard: true, clipboard: true }
  private lastRequest = 0
  private closed = false
  // 所有 option／clipboard 共用原同步加密 sender，不持有 DOM 或 OS clipboard。
  constructor(
    private readonly revision: number,
    private readonly send: (m: hbb.IMessage) => void,
    private readonly reply: (r: ClipboardReply, t?: Transferable[]) => void,
    private readonly now: () => number,
    private readonly incomingObserver?: IncomingClipboardObserverSource,
  ) {}
  // tag 只含精確安全整數，不能 replay 或覆寫目前的訂閱。
  private admit(tag: ClipboardTag): boolean {
    if (this.closed || tag.revision !== this.revision) return false
    if (
      !Number.isSafeInteger(tag.request_id) ||
      tag.request_id < 1 ||
      tag.request_id <= this.lastRequest
    )
      throw new Error('protocol_error')
    this.lastRequest = tag.request_id
    return true
  }
  // 每次手動 pull 才短訂閱；busy 不建立 queue，peer 否定不能被 Main 升權。
  pull(tag: ClipboardTag): void {
    this.tick()
    if (!this.admit(tag)) return
    if (this.active) {
      this.reply({ ...tag, type: 'clipboard-error', code: 'clipboard_busy' })
      return
    }
    if (!this.permissions.keyboard || !this.permissions.clipboard) {
      this.reply({ ...tag, type: 'clipboard-error', code: 'clipboard_unavailable' })
      return
    }
    this.active = { ...tag, deadline: this.now() + L.clipboardMs }
    this.send({ misc: { option: { disableClipboard: hbb.OptionMessage.BoolOption.No } } })
  }
  // 官方gate共用兩方向，單次傳送短暫開啟但不建立pull；移交bytes在所有終態清除。
  push(tag: ClipboardTag, bytes: Uint8Array): void {
    try {
      this.tick()
      if (!this.admit(tag)) return
      if (!(bytes instanceof Uint8Array)) throw new Error('protocol_error')
      if (this.active) {
        this.reply({ ...tag, type: 'clipboard-error', code: 'clipboard_busy' })
        return
      }
      if (!this.permissions.clipboard) {
        this.reply({ ...tag, type: 'clipboard-error', code: 'clipboard_unavailable' })
        return
      }
      let message: hbb.IMessage
      try {
        message = encodeTextClipboard(bytes)
      } catch (error) {
        this.reply({ ...tag, type: 'clipboard-error', code: clipboardError(error) })
        return
      }
      try {
        this.send({ misc: { option: { disableClipboard: hbb.OptionMessage.BoolOption.No } } })
        this.send(message)
      } finally {
        // 即使開啟或文字提交失敗也嘗試關閉；失效sender由原session收尾，不重播。
        this.send({ misc: { option: { disableClipboard: hbb.OptionMessage.BoolOption.Yes } } })
      }
      this.reply({ ...tag, type: 'clipboard-sent' })
    } finally {
      if (bytes instanceof Uint8Array && bytes.byteLength) bytes.fill(0)
    }
  }
  // 原 plaintext 清除之前作 owned copy；decode 與 sender／transfer 故障分開。
  receive(message: hbb.Message): void {
    this.tick()
    if (!this.active || this.closed) return
    // 真active gate後、原文字解碼前；接點預設關閉且不接觸crypto／Main。
    observeIncomingClipboard(message, this.active, this.incomingObserver)
    let bytes: Uint8Array | null = null
    try {
      try {
        bytes = decodeTextClipboard(message)
      } catch (error) {
        if (error instanceof Error && error.message === 'protocol_error') throw error
        const tag = this.finish()
        if (tag) this.reply({ ...tag, type: 'clipboard-error', code: clipboardError(error) })
        return
      }
      if (bytes === null) return
      const tag = this.finish()
      if (!tag) return
      this.reply({ ...tag, type: 'clipboard-data', bytes }, [bytes.buffer as ArrayBuffer])
      bytes = null
    } finally {
      if (bytes?.byteLength) bytes.fill(0)
    }
  }
  // 關閉 option 必須先於回覆；失敗交同一 session 收尾，不假成功。
  private finish(): ClipboardTag | null {
    const tag = this.active
    this.active = null
    if (!tag) return null
    this.send({ misc: { option: { disableClipboard: hbb.OptionMessage.BoolOption.Yes } } })
    return { revision: tag.revision, request_id: tag.request_id }
  }
  // session 唯一 ticker 驗期限，沒有每 packet 的新 timer。
  tick(): void {
    if (!this.closed && this.active && this.now() >= this.active.deadline) {
      const tag = this.finish()!
      this.reply({ ...tag, type: 'clipboard-error', code: 'clipboard_timeout' })
    }
  }
  // 舊 tag 不關新訂閱；已完成 tag 亦可確認，避免 timeout／cancel 競態假逾時。
  cancel(tag: ClipboardTag): void {
    if (this.closed || tag.revision !== this.revision) return
    if (!Number.isSafeInteger(tag.request_id) || tag.request_id < 1)
      throw new Error('protocol_error')
    if (this.active?.request_id === tag.request_id) this.finish()
    if (tag.request_id <= this.lastRequest) this.reply({ ...tag, type: 'clipboard-cancelled' })
  }
  // 上游需要 keyboard／clipboard 才能 pull；outbound 只依 clipboard。
  permission(value: RemotePermissions): void {
    if (this.closed) return
    if (typeof value.keyboard !== 'boolean' || typeof value.clipboard !== 'boolean')
      throw new Error('protocol_error')
    this.permissions = { ...value }
    if (this.active && (!value.keyboard || !value.clipboard)) {
      const tag = this.finish()!
      this.reply({ ...tag, type: 'clipboard-error', code: 'clipboard_unavailable' })
    }
  }
  // 仍有 sender 時最佳努力關訂閱，之後不能再發 reply 或保存 bytes。
  dispose(): void {
    if (this.closed) return
    try {
      this.finish()
    } catch {
      /* 失效 socket 只清 ownership，不重送至新 session。 */
    }
    this.closed = true
    this.active = null
  }
}
