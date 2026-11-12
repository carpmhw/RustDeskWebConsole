// 主控台閒置計時：只由本機輸入重設，遠端畫面更新與協定保活不算活動。到期前 60 秒進入警告。
export interface IdleState {
  phase: 'off' | 'active' | 'warning' | 'expired'
  // 剩餘秒數（無條件進位）；off 與 expired 為 0。
  remaining: number
}

const WARNING_SECONDS = 60

export class IdleWatch {
  private last: number
  private expired = false

  // minutes 為 0 時停用；now 由呼叫端提供，與主控台 ticker 同源。
  constructor(
    private minutes: number,
    private readonly now: () => number,
  ) {
    this.last = now()
  }

  // 套用設定並從現在開始新的一段計時（新連線或設定載入時使用），清除先前的到期狀態。
  configure(minutes: number): void {
    this.minutes = minutes
    this.last = this.now()
    this.expired = false
  }

  // 本機活動重新計時；到期後不再復活。
  activity(): void {
    if (!this.expired) this.last = this.now()
  }

  // 依目前時間回報狀態；到期只會發生一次且之後固定為 expired。
  tick(): IdleState {
    if (this.expired) return { phase: 'expired', remaining: 0 }
    if (this.minutes <= 0) return { phase: 'off', remaining: 0 }
    const remaining = Math.ceil((this.last + this.minutes * 60_000 - this.now()) / 1000)
    if (remaining <= 0) {
      this.expired = true
      return { phase: 'expired', remaining: 0 }
    }
    return { phase: remaining <= WARNING_SECONDS ? 'warning' : 'active', remaining }
  }
}
