import { HttpError } from '../api/client'

export interface RevealPayload {
  password: string
  expires_in: number
}

export class RevealLease {
  #value = ''
  #deadline = 0
  #revision = 0
  // 新操作清舊明文並取得不可沿用的revision。
  begin(): number {
    this.clear()
    return this.#revision
  }
  // 只接受當次回應與最多30秒期限，損壞payload不寫入RAM。
  accept(revision: number, payload: RevealPayload, now = Date.now()): boolean {
    if (revision !== this.#revision) return false
    if (
      !payload ||
      typeof payload.password !== 'string' ||
      payload.password.length < 1 ||
      payload.password.length > 1024 ||
      !Number.isFinite(payload.expires_in) ||
      payload.expires_in <= 0 ||
      payload.expires_in > 30
    )
      throw new HttpError('service_unavailable', 503)
    this.#value = payload.password
    this.#deadline = now + payload.expires_in * 1000
    return true
  }
  // 讀取時再檢查實際期限，背景timer節流也不延長顯示。
  read(now = Date.now()): string {
    if (this.#deadline && now >= this.#deadline) this.clear()
    return this.#value
  }
  // 任何退出／換目標都使延遲回應作廢。
  clear(): void {
    this.#revision++
    this.#value = ''
    this.#deadline = 0
  }
  // 倒數只以deadline計算，不以callback執行次數計算。
  remaining(now = Date.now()): number {
    this.read(now)
    return this.#deadline ? Math.max(0, Math.ceil((this.#deadline - now) / 1000)) : 0
  }
}
