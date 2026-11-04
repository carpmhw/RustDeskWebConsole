import type { AuthPhase, SessionUser } from '../api/types'
import type { HostAttempt, RetryState } from './interaction-types'
import type { Phase } from './types'
import type { TargetRow } from '../api/management'
import type { Terminal } from './interaction-types'
import { HttpError } from '../api/client'
import { httpTerminal } from './terminal'
import { RetryController } from './reconnect'
import { INTERACTION_LIMITS as L } from './interaction-limits'
export interface AuthIdentity {
  phase: string
  id: string | null
  role: string | null
  mfa: boolean
}
export interface SessionAuth {
  phase: AuthPhase
  user: SessionUser | null
  // HTTP 與 refresh 全由 Main 的 AuthSession 處理，不傳 credentials 給 Worker。
  request<T>(path: string, method?: string, body?: unknown, signal?: AbortSignal): Promise<T>
}
export interface SessionHost {
  // 每次建立完整新 operation，而不是復用 crypto sender。
  open(target: string, peer: string, signal?: AbortSignal): HostAttempt
  // 只關目前 host operation，outer owner 自己作廢 epoch。
  dispose(): void
}
// 同一 actor 的正常 refresh／DTO clone 不取消，phase／role／MFA 真改變才停。
export function sameIdentity(a: AuthIdentity, b: AuthIdentity): boolean {
  return a.phase === b.phase && a.id === b.id && a.role === b.role && a.mfa === b.mfa
}
// 只取四個安全 scalar，不保存 DTO reference 或 access／family 憑證。
function identity(auth: SessionAuth): AuthIdentity {
  return {
    phase: auth.phase,
    id: auth.user?.id ?? null,
    role: auth.user?.role ?? null,
    mfa: auth.user?.mfa_enrollment_required ?? false,
  }
}
export class ConsoleSession {
  targetName = ''
  private epoch = 0
  private targetId = ''
  private attempt: HostAttempt | null = null
  private lastActivity = -Infinity
  private isStreaming = false
  private socketOpen = false
  private actor: AuthIdentity
  private retry: RetryController
  private closed = false
  // Main 串接 AuthSession 與 Host，不將 metadata／HTTP 搬至 Worker。
  constructor(
    private readonly auth: SessionAuth,
    private readonly host: SessionHost,
    changed: (s: RetryState) => void,
    private readonly now: () => number,
  ) {
    this.actor = identity(auth)
    this.retry = new RetryController(
      {
        // 每次重新取得最新 metadata／actor，再完整 native／ticket attempt。
        run: (signal) => this.run(signal),
        // 真 presented 且近期有效MAC activity 才能重設 stable budget。
        healthy: () =>
          !!this.attempt &&
          this.isStreaming &&
          this.socketOpen &&
          this.now() - this.lastActivity <= L.activityMs,
        changed,
      },
      now,
    )
  }
  // 每次 metadata／me await 入口均驗 epoch／signal與actor，不採納晚授權。
  private async run(signal: AbortSignal): Promise<Terminal> {
    const epoch = this.epoch
    try {
      if (this.closed || signal.aborted) return { cause: 'stopped', code: 'connection_failed' }
      if (
        this.auth.phase !== 'authenticated' ||
        !this.auth.user ||
        this.auth.user.mfa_enrollment_required
      )
        return { cause: 'fatal', code: 'connection_failed' }
      const target = await this.auth.request<TargetRow>(
        `api/v1/targets/${this.targetId}`,
        'GET',
        undefined,
        signal,
      )
      if (epoch !== this.epoch || signal.aborted || this.closed)
        return { cause: 'stopped', code: 'connection_failed' }
      if (!sameIdentity(this.actor, identity(this.auth)))
        return { cause: 'stopped', code: 'connection_failed' }
      if (
        target.id !== this.targetId ||
        this.auth.user?.role === 'viewer' ||
        target.permissions?.can_connect !== true
      )
        return { cause: 'fatal', code: 'connection_failed' }
      const actor = await this.auth.request<SessionUser>('api/v1/auth/me', 'GET', undefined, signal)
      if (
        epoch !== this.epoch ||
        signal.aborted ||
        this.closed ||
        !sameIdentity(this.actor, identity(this.auth))
      )
        return { cause: 'stopped', code: 'connection_failed' }
      if (
        actor.id !== this.auth.user?.id ||
        !['admin', 'operator'].includes(actor.role) ||
        actor.mfa_enrollment_required !== false ||
        actor.role !== this.auth.user?.role ||
        actor.mfa_enrollment_required !== this.auth.user?.mfa_enrollment_required
      )
        return { cause: 'fatal', code: 'connection_failed' }
      this.targetName = target.name
      const attempt = this.host.open(this.targetId, target.rustdesk_id, signal)
      this.attempt = attempt
      this.lastActivity = -Infinity
      this.socketOpen = false
      this.isStreaming = false
      try {
        return await attempt.finished
      } finally {
        if (this.attempt === attempt) {
          this.attempt = null
          this.isStreaming = false
          this.socketOpen = false
        }
      }
    } catch (error) {
      if (epoch !== this.epoch || signal.aborted || this.closed)
        return { cause: 'stopped', code: 'connection_failed' }
      return error instanceof HttpError
        ? httpTerminal(error.status, error.code)
        : { cause: 'fatal', code: 'connection_failed' }
    }
  }
  // 明確 manual start 是新 outer epoch／actor snapshot，不重用任何前次秘密。
  start(id: string): void {
    if (this.closed) return
    this.cancel()
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return
    this.epoch++
    this.targetId = id.toLowerCase()
    this.targetName = ''
    this.actor = identity(this.auth)
    this.retry.start()
  }
  // Host phase只更新matchingattempt，與RetryPhase分開且不接受old revision。
  phase(revision: number, value: Phase): void {
    if (this.closed || this.attempt?.revision !== revision) return
    this.isStreaming = value === 'streaming'
    this.retry.streaming(this.isStreaming)
  }
  // activity必須為目前已驗 operation，靜止桌面TestDelay可提供健康證據。
  activity(revision: number, open = true): void {
    if (this.closed || this.attempt?.revision !== revision) return
    this.socketOpen = open
    if (open) this.lastActivity = this.now()
  }
  // 單分頁 RAM 選擇，不寫 storage 或 Broadcast。
  setEnabled(value: boolean): void {
    if (!this.closed) this.retry.enabled(value)
  }
  // hidden只停止auto排程，visible不復活失敗session。
  setVisible(value: boolean): void {
    if (!this.closed) this.retry.visibility(value)
  }
  // 同tuple刷新不取消，真正身份／政策變動先作廢outer owner。
  authChanged(value: AuthIdentity): void {
    if (!this.closed && !sameIdentity(this.actor, value)) {
      this.actor = { ...value }
      this.cancel()
    }
  }
  // view唯一ticker驅動所有有限due／stable／cycle標量。
  tick(): void {
    if (!this.closed) this.retry.tick()
  }
  // 先作廢epoch再stop，late HTTP或attempt終態不能關新的operation。
  cancel(): void {
    if (this.closed) return
    this.epoch++
    this.retry.stop()
    this.attempt?.cancel()
    this.attempt = null
    this.host.dispose()
    this.isStreaming = false
    this.socketOpen = false
    this.lastActivity = -Infinity
  }
  // route／end／auth owner離開後永久不能重啟，caller另清DOM ticker。
  dispose(): void {
    if (this.closed) return
    this.cancel()
    this.retry.dispose()
    this.closed = true
  }
}
