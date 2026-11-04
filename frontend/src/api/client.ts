import { runtimeBase, withBase } from '../utils/basePath'

// 錯誤只保存安全分類，票證資料不放進 message 或可列舉欄位。
export class HttpError extends Error {
  #retryToken: string | undefined
  // 僅私有 RAM 可保存替代票證，供 MFA 流程接續。
  constructor(
    public readonly code: string,
    public readonly status: number,
    retryToken?: string,
  ) {
    super(code)
    this.#retryToken = retryToken
  }
  // 一次取出票證，例外本身不保留可重複讀取的祕密。
  takeRetryToken(): string | undefined {
    const value = this.#retryToken
    this.#retryToken = undefined
    return value
  }
}

export class HttpClient {
  // 測試可注入 fetch；產品沿用執行期 base，沒有跨來源目的地。
  constructor(
    public readonly base = runtimeBase(),
    private readonly fetcher?: typeof fetch,
  ) {}
  // HTTP 呼叫全經 basePath，錯誤不回顯 response body 或憑證。
  async send<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
    csrf?: string,
    signal?: AbortSignal,
    format: 'json' | 'text' = 'json',
  ): Promise<T> {
    const separator = path.indexOf('?')
    const relative = separator < 0 ? path : path.slice(0, separator)
    const query = separator < 0 ? '' : path.slice(separator + 1)
    if (path.includes('#') || query.length > 4096) throw new HttpError('invalid_request', 400)
    const url =
      withBase(relative, this.base) + (query ? '?' + new URLSearchParams(query).toString() : '')
    const headers = new Headers({ Accept: format === 'text' ? 'text/csv' : 'application/json' })
    if (method !== 'GET') headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', 'Bearer ' + token)
    if (csrf) headers.set('X-Rdweb-CSRF', csrf)
    if (signal?.aborted) throw new HttpError('cancelled', 0)
    const controller = new AbortController()
    // 外部取消與有限期限都會結束fetch及body讀取，不永久持有refresh鎖。
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, 15000)
    try {
      const response = await (this.fetcher ?? globalThis.fetch)(url, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      })
      if (response.status === 204) return undefined as T
      if (response.ok && format === 'text') return (await response.text()) as T
      let value: unknown
      try {
        value = await response.json()
      } catch {
        if (controller.signal.aborted)
          throw new HttpError(signal?.aborted ? 'cancelled' : 'network_error', 0)
        throw new HttpError('service_unavailable', response.status)
      }
      if (!response.ok) {
        const object = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
        const code =
          typeof object.code === 'string' && /^[a-z_]{1,64}$/.test(object.code)
            ? object.code
            : 'service_unavailable'
        const retry =
          typeof object.mfa_token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(object.mfa_token)
            ? object.mfa_token
            : undefined
        throw new HttpError(code, response.status, retry)
      }
      return value as T
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(signal?.aborted ? 'cancelled' : 'network_error', 0)
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }
}
