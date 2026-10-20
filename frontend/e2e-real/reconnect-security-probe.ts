import type { APIRequestContext, APIResponse } from '@playwright/test'
import { request as httpRequest } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { ProxyBase } from './reconnect-proxy-types'

export type SecurityCode =
  'none' | 'invalid_origin' | 'invalid_csrf' | 'rate_limited' | 'unexpected'
export interface SecurityStatus {
  status: number
  code: SecurityCode
}
export interface CookiePolicy {
  present: boolean
  httpOnly: boolean
  sameSiteStrict: boolean
  pathMatches: boolean
}
export interface SecurityProbe {
  // 完整grant只留Node closure，結果僅status與固定code。
  login(username: string, password: string): Promise<SecurityStatus>
  // 配額測試不能解析或採納成功grant，也不能查看cookie值。
  loginStatus(username: string, password: string): Promise<SecurityStatus>
  // 明確省略CSRF或使用固定錯Origin，不改正式backend規則。
  refresh(mode?: 'normal' | 'missing-csrf' | 'wrong-origin'): Promise<SecurityStatus>
  // 只回cookie旗標，值從不進入assertion或report。
  cookiePolicy(): Promise<CookiePolicy>
  // 先用本案grant取真ticket，再以錯Origin嘗試upgrade；不解析WS frame。
  wrongOriginUpgrade(target: string): Promise<SecurityStatus>
  // 作廢closure中的敏感字串，不代替外層context owner收尾。
  close(): void
}

// 任意server內容只能對應固定code，未知字串不可成為錯誤原文。
function safeCode(value: unknown): SecurityCode {
  return value === 'invalid_origin' || value === 'invalid_csrf' || value === 'rate_limited'
    ? value
    : 'unexpected'
}

// 失敗body僅在RAM解析固定分類，不回傳header、JSON或原生exception。
async function safeStatus(response: APIResponse): Promise<SecurityStatus> {
  const status = response.status()
  if (status >= 200 && status < 300) return { status, code: 'none' }
  try {
    return { status, code: safeCode((await response.json())?.code) }
  } catch {
    return { status, code: 'unexpected' }
  }
}

// Node-only probe限定loopback數字port，runtime預設18080；credentials只留不可inspect的closure。
export function createReconnectSecurityProbe(
  context: APIRequestContext,
  options: { base: ProxyBase; port?: number },
): SecurityProbe {
  const port = options.port ?? 18080
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !['', '/rdweb', '/a/b/c'].includes(options.base)
  )
    throw new Error('reconnect_security_invalid_config')
  const origin = 'http://127.0.0.1:' + port
  const prefix = origin + options.base + '/api/v1/'
  let access = '',
    csrf = '',
    closed = false
  // 關閉後不允許任何晚到新操作，避免重用舊grant。
  function live(): void {
    if (closed) throw new Error('reconnect_security_closed')
  }
  // 明確需要後續auth的case才採納grant；配額案不能走此函數。
  async function adopt(response: APIResponse): Promise<void> {
    const value = await response.json()
    if (
      typeof value?.access_token !== 'string' ||
      value.access_token.length < 1 ||
      value.access_token.length > 8192 ||
      typeof value.csrf_token !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.csrf_token)
    )
      throw new Error('reconnect_security_request_failed')
    live()
    access = value.access_token
    csrf = value.csrf_token
  }
  // 每次真HTTP完成即釋放body buffer，任何request失敗只回固定安全分類。
  async function auth(
    kind: 'login' | 'refresh',
    data: object,
    mode: 'normal' | 'missing-csrf' | 'wrong-origin',
    adoptGrant: boolean,
  ): Promise<SecurityStatus> {
    live()
    try {
      const response = await context.fetch(prefix + 'auth/' + kind, {
        method: 'POST',
        data,
        maxRedirects: 0,
        timeout: 5000,
        headers: {
          Origin: mode === 'wrong-origin' ? 'http://public.invalid' : origin,
          ...(kind === 'refresh' && mode !== 'missing-csrf' ? { 'X-Rdweb-CSRF': csrf } : {}),
        },
      })
      try {
        const result = await safeStatus(response)
        if (adoptGrant && result.status === 200) await adopt(response)
        return result
      } finally {
        await response.dispose()
      }
    } catch {
      throw new Error('reconnect_security_request_failed')
    }
  }
  return Object.freeze({
    login: /* 此grant只用於本case後續cookie／CSRF／ticket操作。 */ (
      username: string,
      password: string,
    ) => auth('login', { username, password }, 'normal', true),
    loginStatus: /* 不解析200的grant，亦不查cookie值。 */ (username: string, password: string) =>
      auth('login', { username, password }, 'normal', false),
    refresh: /* 只改一個明確安全輸入，其他認證條件保持。 */ (
      mode: 'normal' | 'missing-csrf' | 'wrong-origin' = 'normal',
    ) => auth('refresh', {}, mode, mode === 'normal'),
    cookiePolicy: async () => {
      live()
      try {
        const cookie = (await context.storageState()).cookies.find(
          /* 只選正式cookie名，不查看value。 */ (item) => item.name === 'rdweb_refresh',
        )
        return {
          present: !!cookie,
          httpOnly: cookie?.httpOnly === true,
          sameSiteStrict: cookie?.sameSite === 'Strict',
          pathMatches: cookie?.path === options.base + '/api/v1/auth',
        }
      } catch {
        throw new Error('reconnect_security_request_failed')
      }
    },
    wrongOriginUpgrade: async (target: string) => {
      live()
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(target))
        throw new Error('reconnect_security_invalid_config')
      let ticket = ''
      try {
        const response = await context.fetch(prefix + 'targets/' + target + '/connect-ticket', {
          method: 'POST',
          data: {},
          headers: { Origin: origin, Authorization: 'Bearer ' + access },
          maxRedirects: 0,
          timeout: 5000,
        })
        try {
          if (response.status() !== 201) throw new Error()
          const grant = await response.json()
          if (!/^[A-Za-z0-9_-]{43}$/.test(grant?.ticket ?? '') || grant.expires_in !== 30)
            throw new Error()
          ticket = grant.ticket
        } finally {
          await response.dispose()
        }
        live()
        return await new Promise<SecurityStatus>((resolve, reject) => {
          const outgoing = httpRequest({
            host: '127.0.0.1',
            port,
            method: 'GET',
            path: options.base + '/api/v1/targets/' + target + '/connect',
            agent: false,
            signal: AbortSignal.timeout(5000),
            headers: {
              Origin: 'http://public.invalid',
              Connection: 'Upgrade',
              Upgrade: 'websocket',
              'Sec-WebSocket-Version': '13',
              'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
              'Sec-WebSocket-Protocol': 'rdweb.v1, rdweb.ticket.' + ticket,
            },
          })
          // 只收有界HTTP拒絕body，不裝WS frame listener或印request options。
          outgoing.on('response', (response) => {
            let body = ''
            response.on('data', (part: Buffer) => {
              body += part.toString()
              if (body.length > 2048) outgoing.destroy()
            })
            response.on(
              'error',
              /* 原生HTTP error可能含認證，固定分類取代。 */ () =>
                reject(new Error('reconnect_security_request_failed')),
            )
            response.on('end', () => {
              let code: SecurityCode = 'unexpected'
              try {
                code = safeCode(JSON.parse(body)?.code)
              } catch {
                /* 非JSON仍只回unexpected。 */
              }
              body = ''
              resolve({ status: response.statusCode ?? 0, code })
            })
          })
          // 非預期101必須立即關閉；不把真升級當拒絕成功、不讀後續frames。
          outgoing.on('upgrade', (_response, socket) => {
            socket.destroy()
            resolve({ status: 101, code: 'unexpected' })
          })
          outgoing.on(
            'error',
            /* 不回傳包含ticket subprotocol的native error。 */ () =>
              reject(new Error('reconnect_security_request_failed')),
          )
          outgoing.end()
        })
      } catch {
        throw new Error('reconnect_security_request_failed')
      } finally {
        ticket = ''
      }
    },
    close: /* 不持有context所有權，只作廢private grant。 */ () => {
      closed = true
      access = ''
      csrf = ''
    },
  })
}
