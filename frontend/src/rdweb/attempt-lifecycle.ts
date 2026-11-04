import type { HostAttempt, Terminal } from './interaction-types'
export class AttemptLifecycle {
  readonly controller = new AbortController()
  readonly handle: HostAttempt
  private ended = false
  private readyDone = false
  private resolveReady: (() => void) | null = null
  private resolveEnd: ((v: Terminal) => void) | null = null
  // 同步取得 handle，兩個 promises 都只 resolve，early cancel 也不留 rejection。
  constructor(
    revision: number,
    private readonly cleanup: () => void,
  ) {
    this.handle = {
      revision,
      prepared: new Promise<void>(
        /* prepared 只是 bounded 準備工作結束。 */ (resolve) => {
          this.resolveReady = resolve
        },
      ),
      finished: new Promise<Terminal>(
        /* finished 表示終態與 cleanup 已啟動。 */ (resolve) => {
          this.resolveEnd = resolve
        },
      ),
      // public cancel 僅結束此 attempt，不能取消新的 outer session。
      cancel: () => {
        this.finish({ cause: 'stopped', code: 'connection_failed' })
      },
    }
  }
  // prepared 不代表安全登入或畫面成功，view streaming 仍需真正 presented。
  prepared(): void {
    if (this.readyDone) return
    this.readyDone = true
    this.resolveReady?.()
    this.resolveReady = null
  }
  // 作廢先於 abort／cleanup，重入或 late close 不能蓋第一個 authoritative failure。
  finish(value: Terminal): boolean {
    if (this.ended) return false
    this.ended = true
    this.prepared()
    this.controller.abort()
    let terminal: Terminal = { ...value }
    try {
      this.cleanup()
    } catch {
      terminal = {
        cause: 'fatal',
        code: value.cause === 'fatal' ? value.code : 'connection_failed',
      }
    } finally {
      this.resolveEnd?.(terminal)
      this.resolveEnd = null
    }
    return true
  }
}
