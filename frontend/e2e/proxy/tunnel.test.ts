import { afterEach, expect, it } from 'vitest'
import { createLoopbackProxy } from '../real/reconnect-proxy.ts'
import { PUBLIC_CONNECT, PUBLIC_TARGET, rawTunnel, readHttp, serve } from './public-fixtures.ts'

const cleanups: Array<() => Promise<void>> = []
// 失敗也不遺留公開tunnel或upstream。
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

// 兩方向head或後續pipe任何一次丟失／重複都會破壞完整相等。
it('passes both upgrade heads once', async () => {
  let clientBytes = ''
  const endpoint = await serve(
    (_req, res) => res.end(),
    (_request, socket, head) => {
      clientBytes = head.toString()
      // proxy收到101後才轉client head，backend可在下一個TCP chunk接到它。
      socket.on('data', (part) => {
        clientBytes += part.toString()
      })
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Protocol: public-probe\r\n\r\nserver-head',
      )
      if (head.length) socket.write(head)
      socket.pipe(socket)
    },
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const lease = proxy.beginCase('', PUBLIC_TARGET)
  const accepted = lease.nextAccepted(new AbortController().signal)
  const client = await rawTunnel(proxy.port, PUBLIC_CONNECT, 'client-head')
  cleanups.push(client.close)
  await accepted
  client.write('client-tail')
  await expect.poll(() => client.received().toString()).toBe('server-headclient-headclient-tail')
  await expect.poll(() => clientBytes).toBe('client-headclient-tail')
  expect(client.header.includes('Sec-WebSocket-Protocol: public-probe')).toBe(true)
  expect(lease.summary().accepted).toBe(1)
})

// 非101必須由真upstream拒絕，不能被代理當已連線。
for (const status of [200, 401, 403, 429]) {
  it('forwards non101 status ' + status, async () => {
    const endpoint = await serve(
      (_req, res) => res.end(),
      (_req, socket) =>
        socket.end(
          'HTTP/1.1 ' +
            status +
            ' Public\r\nContent-Length: 6\r\nConnection: close\r\nX-Public: retained\r\n\r\npublic',
        ),
    )
    cleanups.push(endpoint.close)
    const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
    cleanups.push(proxy.close)
    const lease = proxy.beginCase('', PUBLIC_TARGET)
    const client = await rawTunnel(proxy.port)
    cleanups.push(client.close)
    expect(client.status).toBe(status)
    await expect.poll(() => client.received().toString()).toBe('public')
    expect(client.header.includes('X-Public: retained')).toBe(true)
    expect(lease.summary().accepted).toBe(0)
  })
}

// IncomingMessage已解chunk，轉給raw socket時仍必須保留合法HTTP framing與原拒絕body。
it('forwards a chunked upgrade rejection as valid HTTP', async () => {
  const endpoint = await serve(
    /* 一般HTTP不構成此upgrade反例。 */ (_request, response) => response.end(),
    /* 固定公開raw chunks讓Node client獨立解析轉送結果。 */ (_request, socket) =>
      socket.end(
        'HTTP/1.1 429 Public\r\nTransfer-Encoding: chunked\r\nConnection: close\r\nX-Public: retained\r\n\r\n3\r\npub\r\n3\r\nlic\r\n0\r\n\r\n',
      ),
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const lease = proxy.beginCase('', PUBLIC_TARGET)
  const result = await readHttp(proxy.port, PUBLIC_CONNECT, 'GET', {
    Connection: 'Upgrade',
    Upgrade: 'websocket',
  })
  expect(result.status).toBe(429)
  expect(result.headers['x-public']).toBe('retained')
  expect(result.body).toBe('public')
  expect(lease.summary().accepted).toBe(0)
})

// 同scope sibling與跨scope handle都必須隔離，index相同也不能切錯。
it('cuts one pair not its sibling and rejects stale foreign or forged handles', async () => {
  const endpoint = await serve(
    (_req, res) => res.end(),
    (_req, socket, head) => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
      )
      if (head.length) socket.write(head)
      socket.pipe(socket)
    },
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const first = proxy.beginCase('', PUBLIC_TARGET)
  const one = await rawTunnel(proxy.port)
  cleanups.push(one.close)
  const h1 = await first.nextAccepted(new AbortController().signal)
  const two = await rawTunnel(proxy.port)
  cleanups.push(two.close)
  const h2 = await first.nextAccepted(new AbortController().signal)
  expect(() => first.interrupt({ ...h1 })).toThrow('proxy_invalid_handle')
  first.interrupt(h1)
  expect(() => first.interrupt(h1)).toThrow('proxy_invalid_handle')
  await expect.poll(one.closed).toBe(true)
  two.write('public sibling')
  await expect.poll(() => two.received().toString()).toBe('public sibling')
  await first.close()
  const next = proxy.beginCase('', PUBLIC_TARGET)
  const third = await rawTunnel(proxy.port)
  cleanups.push(third.close)
  const h3 = await next.nextAccepted(new AbortController().signal)
  expect(() => next.interrupt(h2)).toThrow('proxy_invalid_handle')
  expect(() => first.interrupt(h3)).toThrow('proxy_invalid_handle')
  third.write('public next')
  await expect.poll(() => third.received().toString()).toBe('public next')
})

// 路徑白名單與lease狀態不能由query／錯target繞過。
it('rejects upgrades without lease or matching base UUID', async () => {
  let upgrades = 0
  const endpoint = await serve(
    (_req, res) => res.end(),
    (_req, socket) => {
      upgrades++
      socket.destroy()
    },
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const before = await rawTunnel(proxy.port)
  cleanups.push(before.close)
  expect(before.status).toBe(400)
  proxy.beginCase('/rdweb', PUBLIC_TARGET)
  for (const path of [
    PUBLIC_CONNECT,
    '/rdweb' + PUBLIC_CONNECT + '?probe=public',
    '/rdweb/api/v1/targets/not-saved/connect',
  ]) {
    const client = await rawTunnel(proxy.port, path)
    cleanups.push(client.close)
    expect(client.status).toBe(400)
  }
  expect(upgrades).toBe(0)
})
