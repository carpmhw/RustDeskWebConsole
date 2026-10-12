import type { ClipboardUi, OperationCode } from './interaction-types'
export interface ClipboardLease {
  // 僅短讀目前未過期的private文字，不回傳公開DTO。
  text(): string
  // 關框會作廢當次epoch／awaiter及lease。
  close(): void
}
export class ClipboardDialog {
  private ui: ClipboardUi = { busy: false, receiving: false, fallback: 'none' }
  private revision = 0
  private closed = false
  private clearing = false
  private blocked = false
  // 只由scope owner引用DOM；文字不放在自己的公開或reactive狀態。
  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly text: HTMLTextAreaElement,
    private readonly lease: ClipboardLease,
    private readonly issue: (code: OperationCode) => void,
  ) {}
  // snapshot變更可由getter到期同步重入，每輪render都匹配自己的revision。
  update(ui: ClipboardUi): void {
    if (this.closed) return
    if (ui.fallback !== this.ui.fallback) this.blocked = false
    this.ui = { ...ui }
    this.revision++
    this.tick()
  }
  // ticker只短讀未過期lease，不重試native Clipboard API或延長租期。
  tick(): void {
    if (this.closed || this.clearing) return
    if (this.ui.fallback === 'none') {
      this.clear()
      return
    }
    if (this.blocked) return
    const revision = this.revision,
      value = this.lease.text()
    if (this.closed || revision !== this.revision) return
    this.text.readOnly = this.ui.fallback === 'copy'
    if (this.text.value !== value) this.text.value = value
    if (!this.dialog.open) {
      try {
        this.dialog.showModal()
      } catch {
        this.blocked = true
        this.clear()
        this.lease.close()
        this.issue('clipboard_unavailable')
      }
    }
  }
  // 先清文字才關DOM，程序close不應取消仍進行的submit／native操作。
  private clear(): void {
    if (this.clearing) return
    this.clearing = true
    try {
      this.text.value = ''
      if (this.dialog.open) this.dialog.close()
    } finally {
      this.clearing = false
    }
  }
  // 明確user close／hidden／route才關lease；同步DOMclose重入只執行一次。
  close(): void {
    if (this.closed || this.clearing) return
    const active = this.ui.fallback !== 'none' || this.dialog.open || this.text.value !== ''
    this.ui = { busy: false, receiving: false, fallback: 'none' }
    this.revision++
    this.clear()
    if (active) this.lease.close()
  }
  // disposed後任何late notify不得把private文字重新寫進DOM。
  dispose(): void {
    if (this.closed) return
    this.close()
    this.closed = true
  }
}
