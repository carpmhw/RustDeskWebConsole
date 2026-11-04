import { inspect } from 'node:util'
import { request } from '@playwright/test'
import { afterEach, expect, it } from 'vitest'
import { createReconnectSecurityProbe } from '../real/reconnect-security-probe'
import { createLoopbackProxy } from '../real/reconnect-proxy.ts'
import { serve, PUBLIC_TARGET } from './public-fixtures.ts'

const cleanups: Array<() => Promise<void>> = []
const csrf = 'c'.repeat(43),
  ticket = 't'.repeat(43)
const grant = { access_token: 'PublicAccessSentinel', csrf_token: csrf }
// 公開endpoint／context／proxy均只清本case所有者，不承接操作者env。
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

// 真HTTP與cookie jar共同驗原origin、subpath、CSRF綁定，不檢查mock成功。
it('keeps auth grants private while forwarding origin cookie and CSRF', async () => {
  let calls = 0,
    matched = true
  const endpoint = await serve((req, res) => {
    calls++
    matched &&= req.method === 'POST' && req.headers.origin === 'http://127.0.0.1:' + proxy.port
    if (req.url?.endsWith('/login')) {
      matched &&= req.url === '/rdweb/api/v1/auth/login'
      res.setHeader(
        'Set-Cookie',
        'rdweb_refresh=PublicCookieSentinel; HttpOnly; SameSite=Strict; Path=/rdweb/api/v1/auth',
      )
    } else
      matched &&=
        req.url === '/rdweb/api/v1/auth/refresh' &&
        req.headers['x-rdweb-csrf'] === csrf &&
        req.headers.cookie === 'rdweb_refresh=PublicCookieSentinel'
    let body = ''
    req.on(
      'data',
      /* 僅固定公開POST fixture進RAM，最多1KiB。 */ (part: Buffer) => {
        body += part.toString()
        if (body.length > 1024) req.destroy()
      },
    )
    req.on('end', () => {
      try {
        const value = JSON.parse(body)
        matched &&= req.url?.endsWith('/login')
          ? value.username === 'public-user' && value.password === 'public-password'
          : body === '{}'
      } catch {
        matched = false
      }
      body = ''
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(grant))
    })
  })
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const context = await request.newContext()
  cleanups.push(/* API body buffers由原context owner收尾。 */ () => context.dispose())
  const probe = createReconnectSecurityProbe(context, { base: '/rdweb', port: proxy.port })
  expect(await probe.login('public-user', 'public-password')).toEqual({ status: 200, code: 'none' })
  expect(await probe.cookiePolicy()).toEqual({
    present: true,
    httpOnly: true,
    sameSiteStrict: true,
    pathMatches: true,
  })
  expect(await probe.refresh()).toEqual({ status: 200, code: 'none' })
  expect({ calls, matched }).toEqual({ calls: 2, matched: true })
  expect(inspect(probe, { depth: 5 }).includes('PublicAccessSentinel')).toBe(false)
  probe.close()
  await expect(probe.refresh()).rejects.toThrow('reconnect_security_closed')
  expect(calls).toBe(2)
})

// 真proxy轉送公開拒絕status／body；ticket／Origin只在endpoint RAM比對，結果不附原值。
it('forwards wrong origin mutation and upgrade without claiming an accepted tunnel', async () => {
  let mutationMatched = false,
    upgradeMatched = false,
    ticketMatched = false
  const endpoint = await serve(
    (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url?.endsWith('/login')) res.end(JSON.stringify(grant))
      else if (req.url?.endsWith('/connect-ticket')) {
        ticketMatched =
          req.method === 'POST' && req.headers.authorization === 'Bearer PublicAccessSentinel'
        res.writeHead(201)
        res.end(JSON.stringify({ ticket, expires_in: 30 }))
      } else {
        mutationMatched =
          req.method === 'POST' &&
          req.url === '/rdweb/api/v1/auth/refresh' &&
          req.headers.origin === 'http://public.invalid' &&
          req.headers['x-rdweb-csrf'] === csrf
        res.writeHead(403)
        res.end('{"code":"invalid_origin"}')
      }
    },
    (req, socket) => {
      upgradeMatched =
        req.url === '/rdweb/api/v1/targets/' + PUBLIC_TARGET + '/connect' &&
        req.headers.origin === 'http://public.invalid' &&
        req.headers['sec-websocket-version'] === '13' &&
        req.headers['sec-websocket-protocol'] === 'rdweb.v1, rdweb.ticket.' + ticket
      socket.end(
        'HTTP/1.1 403 Forbidden\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n19\r\n{"code":"invalid_origin"}\r\n0\r\n\r\n',
      )
    },
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const lease = proxy.beginCase('/rdweb', PUBLIC_TARGET)
  const context = await request.newContext()
  cleanups.push(/* 固定public context不持有操作者credentials。 */ () => context.dispose())
  const probe = createReconnectSecurityProbe(context, { base: '/rdweb', port: proxy.port })
  await probe.login('public-user', 'public-password')
  expect(await probe.refresh('wrong-origin')).toEqual({ status: 403, code: 'invalid_origin' })
  expect(await probe.wrongOriginUpgrade(PUBLIC_TARGET)).toEqual({
    status: 403,
    code: 'invalid_origin',
  })
  expect({ mutationMatched, upgradeMatched, ticketMatched }).toEqual({
    mutationMatched: true,
    upgradeMatched: true,
    ticketMatched: true,
  })
  expect(lease.summary().accepted).toBe(0)
  probe.close()
})

// 缺header的拒絕不應作廢既有CSRF，正常後續request必須沿用closure。
it('omits CSRF only on the requested probe and recovers with the real header', async () => {
  const seen: boolean[] = []
  const endpoint = await serve((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url?.endsWith('/refresh')) {
      const present = req.headers['x-rdweb-csrf'] === csrf
      seen.push(present)
      if (!present) {
        res.writeHead(403)
        res.end('{"code":"invalid_csrf"}')
        return
      }
    }
    res.end(JSON.stringify(grant))
  })
  cleanups.push(endpoint.close)
  const context = await request.newContext()
  cleanups.push(/* 只回收自有cookie jar。 */ () => context.dispose())
  const probe = createReconnectSecurityProbe(context, { base: '', port: endpoint.port })
  await probe.login('public-user', 'public-password')
  expect(await probe.refresh('missing-csrf')).toEqual({ status: 403, code: 'invalid_csrf' })
  expect(await probe.refresh()).toEqual({ status: 200, code: 'none' })
  expect(seen).toEqual([false, true])
  probe.close()
})

// Public200故意不是grant JSON；quota流量助手不得因想解析成功內容而失敗或發額外request。
it('quota requests never parse grant bodies or issue extra logins', async () => {
  let calls = 0,
    matched = true
  const endpoint = await serve((req, res) => {
    calls++
    matched &&= req.url === '/api/v1/auth/login'
    res.end('Public non-grant body')
  })
  cleanups.push(endpoint.close)
  const context = await request.newContext()
  cleanups.push(/* 沒有查看本context的cookie值。 */ () => context.dispose())
  const probe = createReconnectSecurityProbe(context, { base: '', port: endpoint.port })
  for (let i = 0; i < 6; i++)
    expect(await probe.loginStatus('public-user', 'public-password')).toEqual({
      status: 200,
      code: 'none',
    })
  expect({ calls, matched }).toEqual({ calls: 6, matched: true })
  probe.close()
})

// 任意原生body不能成為code或error，否則一般report會洩漏credential sentinel。
it('returns only fixed error codes without raw response bodies', async () => {
  const endpoint = await serve((_req, res) => {
    res.writeHead(503)
    res.end('{"code":"PublicSensitiveSentinel"}')
  })
  cleanups.push(endpoint.close)
  const context = await request.newContext()
  cleanups.push(/* 錯誤body不保留至下一case。 */ () => context.dispose())
  const probe = createReconnectSecurityProbe(context, { base: '', port: endpoint.port })
  expect(await probe.loginStatus('public-user', 'public-password')).toEqual({
    status: 503,
    code: 'unexpected',
  })
  expect(inspect(probe).includes('PublicSensitiveSentinel')).toBe(false)
  probe.close()
})

// 公開factory亦只能數字loopback port／固定base，不能當任意目的地scanner。
it('rejects invalid scope before any HTTP request', async () => {
  const context = await request.newContext()
  cleanups.push(/* 這個空context不能留下資源。 */ () => context.dispose())
  for (const port of [0, -1, 1.5, NaN, 65536])
    expect(() => createReconnectSecurityProbe(context, { base: '', port })).toThrow(
      'reconnect_security_invalid_config',
    )
  expect(() => createReconnectSecurityProbe(context, { base: '/unknown' as '' })).toThrow(
    'reconnect_security_invalid_config',
  )
})

// Cookie oracle不能硬報全true；缺cookie或錯旗標／Path必須各自反映。
it('cookie policy exposes missing or unsafe flags only as booleans', async () => {
  const endpoint = await serve((_req, res) => {
    res.setHeader('Set-Cookie', 'rdweb_refresh=PublicCookieSentinel; SameSite=Lax; Path=/')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(grant))
  })
  cleanups.push(endpoint.close)
  const context = await request.newContext()
  cleanups.push(/* 不讓錯policy cookie流入其他case。 */ () => context.dispose())
  const probe = createReconnectSecurityProbe(context, { base: '/rdweb', port: endpoint.port })
  expect(await probe.cookiePolicy()).toEqual({
    present: false,
    httpOnly: false,
    sameSiteStrict: false,
    pathMatches: false,
  })
  await probe.login('public-user', 'public-password')
  expect(await probe.cookiePolicy()).toEqual({
    present: true,
    httpOnly: false,
    sameSiteStrict: false,
    pathMatches: false,
  })
  probe.close()
})

// 真非預期101不能被隱藏成403，也不能留下opaque stream或讀取它的後續內容。
it('unexpected upgrade is reported as failure and its socket is closed', async () => {
  let active = 0
  const endpoint = await serve(
    (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url?.endsWith('/connect-ticket')) {
        res.writeHead(201)
        res.end(JSON.stringify({ ticket, expires_in: 30 }))
      } else res.end(JSON.stringify(grant))
    },
    (_req, socket) => {
      active++
      socket.once('close', /* Native close才解除公開endpoint計數。 */ () => active--)
      // 與公開WS endpoint相同地消化FIN；paused reader本身不能用來判本地destroy是否成功。
      socket.on('end', () => socket.end())
      socket.resume()
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nPublic opaque bytes',
      )
    },
  )
  cleanups.push(endpoint.close)
  const context = await request.newContext()
  cleanups.push(/* 每個public context有自己的cookie jar。 */ () => context.dispose())
  const probe = createReconnectSecurityProbe(context, { base: '', port: endpoint.port })
  await probe.login('public-user', 'public-password')
  expect(await probe.wrongOriginUpgrade(PUBLIC_TARGET)).toEqual({ status: 101, code: 'unexpected' })
  await expect.poll(/* 不能只把socket.destroy回傳當已釋放。 */ () => active).toBe(0)
  probe.close()
})
