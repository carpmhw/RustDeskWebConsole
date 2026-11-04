import { HttpClient, HttpError } from './client'
import type { AuthState, SessionGrant, SessionUser, Enrollment } from './types'

type Exclusive = <T>(operation: () => Promise<T>) => Promise<T>

// 拒絕損壞的 server user，避免 truthy 字串繞過 MFA 導向。
function parseUser(value: unknown): SessionUser {
  const user = value as Partial<SessionUser> | null
  if (
    !user ||
    typeof user.id !== 'string' ||
    typeof user.username !== 'string' ||
    !['admin', 'operator', 'viewer'].includes(user.role ?? '') ||
    typeof user.totp_enabled !== 'boolean' ||
    typeof user.mfa_enrollment_required !== 'boolean'
  )
    throw new HttpError('service_unavailable', 503)
  return {
    id: user.id,
    username: user.username,
    role: user.role!,
    totp_enabled: user.totp_enabled,
    mfa_enrollment_required: user.mfa_enrollment_required,
  }
}

// 只接受當次產生的十組備援碼，祕密不進入公開 session 狀態。
function parseCodes(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length !== 10 ||
    !value.every((code) => typeof code === 'string' && /^[A-Fa-f0-9]{32}$/.test(code))
  )
    throw new HttpError('service_unavailable', 503)
  return [...value] as string[]
}

export class AuthSession {
  state: AuthState = { phase: 'unknown', user: null }
  #access: string | undefined
  #challenge: string | undefined
  #epoch = 0
  #restoring: Promise<void> | null = null
  #logoutPending = false
  #channel: BroadcastChannel | undefined
  #listeners = new Set<(state: AuthState) => void>()
  #exclusive: Exclusive
  // Native locks 依 BASE 隔離部署，Node 測試與無支援瀏覽器使用頁內 single-flight。
  constructor(
    private readonly client: HttpClient,
    exclusive?: Exclusive,
  ) {
    this.#exclusive =
      exclusive ??
      (async (operation) => {
        if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.locks)
          return navigator.locks.request('rdweb.auth:' + client.base, operation)
        return operation()
      })
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.#channel = new BroadcastChannel('rdweb.auth:' + client.base)
      // 跨分頁只傳狀態訊號，絕不傳任何憑證。
      this.#channel.onmessage = async (event: MessageEvent<unknown>) => {
        if (event.data !== 'changed' && event.data !== 'logout') return
        this.#epoch++
        this.clear(event.data === 'logout' ? 'anonymous' : 'unknown')
        if (event.data === 'changed') {
          const epoch = this.#epoch
          // 舊restore已被epoch作廢，等其釋放promise與鎖後才恢復新session。
          await this.#restoring?.catch(() => {
            /* 舊錯誤不重新顯示。 */
          })
          if (epoch === this.#epoch && this.state.phase === 'unknown')
            await this.restore().catch(() => {
              /* 失效時保持匿名。 */
            })
        }
      }
    }
  }
  // Pinia 只訂閱安全狀態，callback 不接觸私有 access／challenge。
  subscribe(listener: (state: AuthState) => void): () => void {
    this.#listeners.add(listener)
    listener(this.state)
    return () => this.#listeners.delete(listener)
  }
  // 一個頁面同時只一組 refresh；鎖內重新取csrf以配合其它分頁輪替。
  restore(force = false): Promise<void> {
    if (this.#restoring) return this.#restoring
    if (this.#logoutPending || (!force && this.state.phase !== 'unknown')) return Promise.resolve()
    const epoch = this.#epoch
    this.#restoring = this.#exclusive(async () => {
      if (epoch !== this.#epoch) return
      try {
        const csrf = await this.client.send<{ csrf_token: string }>('api/v1/auth/csrf')
        const grant = await this.client.send<SessionGrant>(
          'api/v1/auth/refresh',
          'POST',
          {},
          undefined,
          csrf.csrf_token,
        )
        if (epoch === this.#epoch) this.adopt(grant)
      } catch (error) {
        if (epoch === this.#epoch) this.clear('anonymous')
        if (!(error instanceof HttpError && error.status === 401)) throw error
      }
    }).finally(() => {
      this.#restoring = null
    })
    return this.#restoring
  }
  // 帳密結果為 challenge 或完整 session，密碼不保存為成員。
  async login(username: string, password: string, signal?: AbortSignal): Promise<void> {
    if (this.#logoutPending) await this.logout()
    const epoch = ++this.#epoch
    const result = await this.cookieOperation(epoch, () =>
      this.client.send<SessionGrant | { mfa_required: boolean; mfa_token: string }>(
        'api/v1/auth/login',
        'POST',
        { username, password },
        undefined,
        undefined,
        signal,
      ),
    )
    if (epoch !== this.#epoch) throw new HttpError('cancelled', 0)
    if ('mfa_required' in result) {
      if (result.mfa_required !== true || !/^[A-Za-z0-9_-]{43}$/.test(result.mfa_token))
        throw new HttpError('service_unavailable', 503)
      this.#access = undefined
      this.#challenge = result.mfa_token
      this.publish({ phase: 'mfa', user: null })
    } else {
      this.adopt(result)
      this.#channel?.postMessage('changed')
    }
  }
  // MFA失敗補發的票證只更新RAM，票證失效後重新登入。
  async verifyMfa(code: string): Promise<void> {
    if (!this.#challenge) throw new HttpError('expired_mfa', 401)
    const epoch = this.#epoch
    try {
      const result = await this.cookieOperation(epoch, () =>
        this.client.send<SessionGrant>('api/v1/auth/mfa/verify', 'POST', {
          mfa_token: this.#challenge,
          code,
        }),
      )
      if (epoch !== this.#epoch) throw new HttpError('cancelled', 0)
      this.adopt(result)
      this.#channel?.postMessage('changed')
    } catch (error) {
      if (epoch === this.#epoch && error instanceof HttpError && error.code === 'invalid_mfa') {
        this.#challenge = error.takeRetryToken()
        if (!this.#challenge) {
          this.clear('anonymous')
          throw new HttpError('expired_mfa', 401)
        }
      }
      throw error
    }
  }
  // 回帳密／離頁時丟棄票證，不撤銷不存在的session。
  cancelMfa(): void {
    if (this.state.phase !== 'authenticated') {
      this.#epoch++
      this.clear('anonymous')
    }
  }
  // Bearer unauthorized最多恢復及重試一次，其它敏感操作錯誤不得重試。
  async request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
    format: 'json' | 'text' = 'json',
  ): Promise<T> {
    if (!this.#access) throw new HttpError('unauthorized', 401)
    const epoch = this.#epoch
    const changesCookie = path === 'api/v1/auth/totp/confirm' || path === 'api/v1/auth/totp/disable'
    // 只有會改cookie的操作加鎖；401後restore在鎖外，避免重入deadlock。
    const send = () =>
      this.client.send<T>(path, method, body, this.#access, undefined, signal, format)
    try {
      const value = changesCookie ? await this.cookieOperation(epoch, send) : await send()
      if (epoch !== this.#epoch) throw new HttpError('cancelled', 0)
      return value
    } catch (error) {
      if (epoch !== this.#epoch) throw new HttpError('cancelled', 0)
      if (!(error instanceof HttpError) || error.code !== 'unauthorized' || signal?.aborted)
        throw error
      await this.restore(true)
      if (epoch !== this.#epoch) throw new HttpError('cancelled', 0)
      if (!this.#access) throw new HttpError('unauthorized', 401)
      const value = changesCookie ? await this.cookieOperation(epoch, send) : await send()
      if (epoch !== this.#epoch) throw new HttpError('cancelled', 0)
      return value
    }
  }
  // Enrol 回應只交給短命 Security view，不保存於session。
  async enroll(password: string, signal?: AbortSignal): Promise<Enrollment> {
    const value = await this.request<Enrollment>(
      'api/v1/auth/totp/enroll',
      'POST',
      { password },
      signal,
    )
    if (
      !value ||
      typeof value.secret !== 'string' ||
      !/^[A-Z2-7]{16,128}$/.test(value.secret) ||
      typeof value.otpauth_uri !== 'string' ||
      !value.otpauth_uri.startsWith('otpauth://totp/')
    )
      throw new HttpError('service_unavailable', 503)
    return value
  }
  // Confirm採新的工作階段，僅將一次性codes回傳給UI。
  async confirm(code: string, signal?: AbortSignal): Promise<string[]> {
    const epoch = this.#epoch
    const value = await this.request<SessionGrant>(
      'api/v1/auth/totp/confirm',
      'POST',
      { code },
      signal,
    )
    if (epoch !== this.#epoch || signal?.aborted) throw new HttpError('cancelled', 0)
    const codes = parseCodes(value.recovery_codes)
    this.#epoch++
    this.adopt(value)
    this.#channel?.postMessage('changed')
    return codes
  }
  // 重產只回當次codes，後端保證舊碼作廢與二次驗證。
  async regenerate(
    proof: { password?: string; code?: string },
    signal?: AbortSignal,
  ): Promise<string[]> {
    const result = await this.request<{ recovery_codes: string[] }>(
      'api/v1/auth/recovery-codes',
      'POST',
      proof,
      signal,
    )
    return parseCodes(result.recovery_codes)
  }
  // 停用成功清空所有本機認證，讓其它分頁重新登入。
  async disable(proof: { password?: string; code?: string }, signal?: AbortSignal): Promise<void> {
    await this.request('api/v1/auth/totp/disable', 'POST', proof, signal)
    this.#epoch++
    this.clear('anonymous')
    this.#channel?.postMessage('logout')
  }
  // 先清RAM，遠端撤銷失敗不能被當成成功或讓延遲restore復活登入。
  async logout(): Promise<void> {
    this.#epoch++
    this.#logoutPending = true
    this.clear('anonymous')
    this.#channel?.postMessage('logout')
    try {
      await this.#exclusive(async () => {
        try {
          const csrf = await this.client.send<{ csrf_token: string }>('api/v1/auth/csrf')
          await this.client.send('api/v1/auth/logout', 'POST', {}, undefined, csrf.csrf_token)
        } catch (error) {
          if (!(error instanceof HttpError && error.status === 401)) throw error
        }
      })
      this.#logoutPending = false
    } catch {
      throw new HttpError('logout_failed', 0)
    }
  }
  // 測試或應用卸載時釋放通道及RAM，不做遠端副作用。
  dispose(): void {
    this.#epoch++
    this.clear('anonymous')
    this.#channel?.close()
    this.#listeners.clear()
  }
  // 所有cookie寫入共用同源鎖，排隊中的舊身分操作不可再送出。
  private cookieOperation<T>(epoch: number, operation: () => Promise<T>): Promise<T> {
    return this.#exclusive(async () => {
      if (epoch !== this.#epoch) throw new HttpError('cancelled', 0)
      return operation()
    })
  }
  // 解析grant再寫入私有欄位，損壞user flags不可產生已登入狀態。
  private adopt(grant: SessionGrant): void {
    if (
      !grant ||
      typeof grant.access_token !== 'string' ||
      grant.access_token.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(grant.access_token) ||
      typeof grant.csrf_token !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(grant.csrf_token) ||
      typeof grant.expires_in !== 'number' ||
      grant.expires_in <= 0 ||
      grant.expires_in > 900
    )
      throw new HttpError('service_unavailable', 503)
    const user = parseUser(grant.user)
    this.#access = grant.access_token
    this.#challenge = undefined
    this.publish({ phase: 'authenticated', user })
  }
  // 清除私有票證，只留下明確的匿名或待初始化狀態。
  private clear(phase: 'unknown' | 'anonymous'): void {
    this.#access = undefined
    this.#challenge = undefined
    this.publish({ phase, user: null })
  }
  // 安全snapshot每次替換，避免Pinia意外取得私有物件。
  private publish(state: AuthState): void {
    this.state = state
    this.#listeners.forEach((listener) => listener(state))
  }
}
