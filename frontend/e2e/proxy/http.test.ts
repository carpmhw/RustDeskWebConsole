import { afterEach, expect, it } from 'vitest'
import { createLoopbackProxy } from '../real/reconnect-proxy.ts'
import { readHttp, serve } from './public-fixtures.ts'

const cleanups: Array<() => Promise<void>> = []
// 先關proxy再關上游，失敗亦只回收本案owner。
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

// 修改路徑／headers／body或折疊Set-Cookie時這個真往返必須失敗。
it('preserves HTTP path status body and duplicate cookies', async () => {
  let matched = false
  const endpoint = await serve((request, response) => {
    let body = ''
    // 僅固定公開POST fixture在RAM內比對。
    request.on('data', (part) => {
      body += part
    })
    // 上游獨立oracle，不使用proxy builder生成預期。
    request.on('end', () => {
      matched =
        request.method === 'POST' &&
        request.url === '/rdweb/public?q=a%2Fb' &&
        body === 'Public body' &&
        request.headers.host === 'public.example' &&
        request.headers.origin === 'http://public.example' &&
        request.headers['x-forwarded-for'] === '192.0.2.1'
      response.writeHead(201, [
        'Set-Cookie',
        'public-one=one; HttpOnly; SameSite=Strict; Path=/rdweb/api/v1/auth',
        'Set-Cookie',
        'public-two=two; Path=/rdweb/',
      ])
      response.end('Public response')
    })
  })
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const result = await readHttp(
    proxy.port,
    '/rdweb/public?q=a%2Fb',
    'POST',
    { Host: 'public.example', Origin: 'http://public.example', 'X-Forwarded-For': '192.0.2.1' },
    'Public body',
  )
  expect(matched).toBe(true)
  expect(result.status).toBe(201)
  expect(result.headers['set-cookie']).toEqual([
    'public-one=one; HttpOnly; SameSite=Strict; Path=/rdweb/api/v1/auth',
    'public-two=two; Path=/rdweb/',
  ])
  expect(result.body).toBe('Public response')
  await proxy.close()
  expect(proxy.summary()).toMatchObject({ sockets: 0, http: 0, timers: 0, closed: true })
})

// 無效port不能觸及任何listener或任意目的地。
it('rejects malformed ports', async () => {
  for (const port of [NaN, 1.5, -1, 65536]) {
    await expect(createLoopbackProxy({ listenPort: port, upstreamPort: 1 })).rejects.toThrow(
      'proxy_invalid_config',
    )
    await expect(createLoopbackProxy({ listenPort: 0, upstreamPort: port })).rejects.toThrow(
      'proxy_invalid_config',
    )
  }
})

// absolute form與CONNECT不可以把固定上游代理變成forward proxy。
it('rejects absolute form and CONNECT before upstream', async () => {
  let calls = 0
  const endpoint = await serve(
    /* 任何上游呼叫都必須被看見。 */ (_request, response) => {
      calls++
      response.end('public')
    },
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  expect((await readHttp(proxy.port, 'http://example.invalid/')).status).toBe(400)
  expect((await readHttp(proxy.port, 'example.invalid:443', 'CONNECT')).status).toBe(400)
  expect(calls).toBe(0)
})

// bind衝突不能接管或關閉既有服務。
it('bind conflict preserves existing listener', async () => {
  const endpoint = await serve(
    /* 占用者仍應能正常服務。 */ (_request, response) => response.end('public existing'),
  )
  cleanups.push(endpoint.close)
  await expect(
    createLoopbackProxy({ listenPort: endpoint.port, upstreamPort: endpoint.port }),
  ).rejects.toThrow('proxy_bind_failed')
  expect((await readHttp(endpoint.port)).body).toBe('public existing')
})
