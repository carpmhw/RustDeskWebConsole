import type { RetryState, Terminal } from './interaction-types'
import { INTERACTION_LIMITS as L } from './interaction-limits'
export interface RetryPorts {
  // 每次由 Main 執行完整新 attempt，不復用 ticket 或 crypto。
  run(signal: AbortSignal): Promise<Terminal>
  // 由目前 operation 的已驗 activity 證明健康，不靠影格頻率。
  healthy(): boolean
  // 公開 UI 只接安全 literal 與有限次數。
  changed(value: RetryState): void
}
export class RetryController {
  private epoch = 0
  private permit = true
  private visible = true
  private controller: AbortController | null = null
  private started = false
  private hadStreaming = false
  private streamingNow = false
  private used = 0
  private deadline: number | null = null
  private due: number | null = null
  private stable: number | null = null
  private phase: RetryState['phase'] = 'idle'
  private code: RetryState['code']
  private closed = false
  // 純排程器不自建 timer，唯一 Main owner ticker 驅動實際期限。
  constructor(
    private readonly ports: RetryPorts,
    private readonly now: () => number,
  ) {}
  // 明確手動重試才重設外層 epoch／cycle；背景不得建立新 attempt。
  start(): void {
    if (this.closed) return
    this.stop()
    if (!this.visible) return
    this.epoch++
    this.started = true
    this.hadStreaming = false
    this.used = 0
    this.deadline = null
    this.code = undefined
    this.launch()
  }
  // 只有真 presented 才進來，晚到 recovered frame 不得蓋過已到期 cycle。
  streaming(value: boolean): void {
    if (!this.started || this.closed) return
    if (value && !this.streamingNow && this.deadline !== null && this.now() >= this.deadline) {
      this.end('reconnect_timeout')
      return
    }
    if (value && !this.streamingNow) {
      this.hadStreaming = true
      this.stable = this.deadline !== null ? this.now() + L.stableMs : null
      this.phase = this.used ? 'restored' : 'connecting'
    } else if (!value) this.stable = null
    this.streamingNow = value
    this.publish()
  }
  // streaming 可跨原 cycle deadline；連續健康60秒後才補足新 budget。
  tick(): void {
    if (!this.started || this.closed) return
    if (this.streamingNow) {
      if (this.stable !== null && this.now() >= this.stable && this.ports.healthy()) {
        this.used = 0
        this.deadline = null
        this.stable = null
        this.publish()
      }
      return
    }
    if (this.deadline !== null && this.now() >= this.deadline) {
      this.end('reconnect_timeout')
      return
    }
    if (this.due !== null && this.now() >= this.due) {
      this.due = null
      if (this.permit && this.visible && this.used < 3) {
        this.used++
        this.launch()
      } else this.end('reconnect_exhausted')
    }
  }
  // 同一 session 最多一個 attempt；同步或非預期非同步 fault 都固定 fatal。
  private launch(): void {
    if (this.controller || !this.started || this.closed || !this.visible) return
    const epoch = this.epoch,
      controller = new AbortController()
    this.controller = controller
    this.phase = 'connecting'
    this.publish()
    if (epoch !== this.epoch || !this.started || controller.signal.aborted) return
    try {
      void this.ports
        .run(controller.signal)
        .then(
          /* 匹配外層 epoch 才處理終態。 */ (terminal) => {
            if (epoch !== this.epoch || !this.started || this.closed) return
            this.controller = null
            this.streamingNow = false
            this.stable = null
            this.failure(terminal)
          },
        )
        .catch(
          /* 本機未知失敗不能冒充 transport error。 */ () => {
            if (epoch !== this.epoch || !this.started || this.closed) return
            this.controller = null
            this.streamingNow = false
            this.stable = null
            this.failure({ cause: 'fatal', code: 'connection_failed' })
          },
        )
    } catch {
      this.controller = null
      this.failure({ cause: 'fatal', code: 'connection_failed' })
    }
  }
  // 只曾 streaming 的 network 可開 cycle，temporary 只沿用既有 cycle。
  private failure(value: Terminal): void {
    if (
      !this.hadStreaming ||
      !this.permit ||
      !this.visible ||
      !['network', 'temporary'].includes(value.cause)
    ) {
      this.end(value.cause === 'stopped' ? undefined : value.code)
      return
    }
    if (value.cause === 'temporary' && this.deadline === null) {
      this.end(value.code)
      return
    }
    if (this.deadline === null) this.deadline = this.now() + L.retryMs
    if (this.now() >= this.deadline) {
      this.end('reconnect_timeout')
      return
    }
    if (this.used >= 3) {
      this.end('reconnect_exhausted')
      return
    }
    this.due = this.now() + [2000, 5000, 10000][this.used]!
    this.phase = 'waiting'
    this.code = undefined
    this.publish()
  }
  // 關 auto 只取消 waiting／自動 attempt，已 streaming 的現有連線維持。
  enabled(value: boolean): void {
    if (this.closed) return
    this.permit = value
    if (!value && (this.due !== null || (this.used > 0 && !this.streamingNow))) this.stop()
    this.publish()
  }
  // visible 不會復活已取消 cycle；既有 streaming 維持 B2 ownership。
  visibility(value: boolean): void {
    if (this.closed) return
    this.visible = value
    if (!value && (this.due !== null || (this.used > 0 && !this.streamingNow))) this.stop()
  }
  // 作廢先於 abort，late promise 不能排新 due 或清掉另一個 attempt。
  stop(): void {
    if (this.closed) return
    this.epoch++
    this.started = false
    this.controller?.abort()
    this.controller = null
    this.due = null
    this.stable = null
    this.streamingNow = false
    this.phase = 'stopped'
    this.code = undefined
    this.publish()
  }
  // 保留固定 terminal code 供手動重試；沒有暗中重啟 failed session。
  private end(code?: RetryState['code']): void {
    this.stop()
    this.code = code
    this.phase = code ? 'exhausted' : 'stopped'
    this.publish()
  }
  // 安全 literal 摘要與 Protocol Worker phase 獨立，不包含 private payload。
  private publish(): void {
    this.ports.changed({
      phase: this.phase,
      attempt: this.used,
      enabled: this.permit,
      code: this.code,
    })
  }
  // 永久 disposed owner 不能被 stale DOM／auth callback 重啟。
  dispose(): void {
    if (this.closed) return
    this.stop()
    this.closed = true
  }
}
