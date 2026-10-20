import { connect, Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { createLoopbackProxy } from '../e2e-real/reconnect-proxy.ts'
import { LoopbackAgent } from '../e2e-real/reconnect-proxy-agent.ts'
import { ProxyLease } from '../e2e-real/reconnect-proxy-lease.ts'
import { PUBLIC_CONNECT, PUBLIC_TARGET, rawTunnel, readHttp, serve } from './public-fixtures.ts'

const cleanups: Array<() => Promise<void>> = []
// 恢復clock後才等待native close，避免假timer阻止真資源回收。
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  while (cleanups.length) await cleanups.pop()!()
})

// 真echo endpoint只轉固定公開stream，不解析RustDesk或私有bytes。
async function setupEcho() {
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
  const lease = proxy.beginCase('', PUBLIC_TARGET)
  return { proxy, lease }
}

// close必須取消pending resolver，晚101或下一lease不得復活舊等待者。
it('cancels accepted waiter and refuses late completion after close', async () => {
  const { proxy, lease } = await setupEcho()
  const abort = new AbortController()
  const cancelled = lease
    .nextAccepted(abort.signal)
    .catch(/* 只回安全code。 */ (error: Error) => error.message)
  abort.abort()
  expect(await cancelled).toBe('proxy_cancelled')
  const pending = lease
    .nextAccepted(new AbortController().signal)
    .catch(/* 關閉應明確拒絕。 */ (error: Error) => error.message)
  await lease.close()
  expect(await pending).toBe('proxy_closed')
  expect(lease.summary()).toMatchObject({ waiters: 0, active: 0, closed: true })
  expect(() => proxy.beginCase('/invalid' as '', PUBLIC_TARGET)).toThrow('proxy_invalid_config')
  await proxy.close()
  expect(() => proxy.beginCase('', PUBLIC_TARGET)).toThrow('proxy_closed')
})

// HTTP／握手仍pending時close，也必須關掉前後端而非只關listener。
for (const upgrade of [false, true]) {
  it('closes pending ' + (upgrade ? 'handshake' : 'HTTP'), async () => {
    let arrived = false
    const endpoint = await serve(
      () => {
        arrived = true
      },
      () => {
        arrived = true
      },
    )
    cleanups.push(endpoint.close)
    const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
    cleanups.push(proxy.close)
    const lease = proxy.beginCase('', PUBLIC_TARGET)
    const pending = upgrade
      ? rawTunnel(proxy.port)
      : readHttp(proxy.port).catch(/* 預期取消不輸出native error。 */ () => null)
    await expect.poll(() => arrived).toBe(true)
    await proxy.close()
    await pending
    expect(proxy.summary()).toMatchObject({
      sockets: 0,
      http: 0,
      upgrades: 0,
      waiters: 0,
      timers: 0,
      closed: true,
    })
    expect(lease.summary()).toMatchObject({
      sockets: 0,
      http: 0,
      upgrades: 0,
      waiters: 0,
      timers: 0,
      closed: true,
    })
    await proxy.close()
  })
}

// 超active上限不得踢掉已成功的tunnel。
it('capacity refuses fifth pair without closing existing', async () => {
  const { lease, proxy } = await setupEcho()
  const clients = []
  for (let i = 0; i < 4; i++) {
    const client = await rawTunnel(proxy.port)
    cleanups.push(client.close)
    clients.push(client)
    await lease.nextAccepted(new AbortController().signal)
  }
  const fifth = await rawTunnel(proxy.port)
  cleanups.push(fifth.close)
  expect(fifth.status).toBe(400)
  for (const client of clients) {
    client.write('public retained')
    await expect.poll(() => client.received().toString()).toBe('public retained')
  }
  expect(lease.summary().active).toBe(4)
})

// 自然關閉不重置每case總配額，不能無限重建upgrade資源。
it('refuses seventeenth upgrade in one case', async () => {
  const { lease, proxy } = await setupEcho()
  for (let i = 0; i < 16; i++) {
    const client = await rawTunnel(proxy.port)
    await lease.nextAccepted(new AbortController().signal)
    await client.close()
    await expect.poll(() => lease.summary().active).toBe(0)
  }
  const last = await rawTunnel(proxy.port)
  cleanups.push(last.close)
  expect(last.status).toBe(400)
  expect(lease.summary().accepted).toBe(16)
})

// 接受端TCP與header上限都不應透傳無界request。
it('caps accepted TCP and header size', async () => {
  let upstreamCalls = 0
  const endpoint = await serve((_req, res) => {
    upstreamCalls++
    res.end('public')
  })
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const clients: Socket[] = []
  for (let i = 0; i < 65; i++) {
    const client = connect({ host: '127.0.0.1', port: proxy.port })
    client.on('error', /* 公開拒絕不輸出原生訊息。 */ () => {})
    clients.push(client)
    await new Promise<void>(
      /* native connect後才繼續建立下一個。 */ (resolve) => client.once('connect', resolve),
    )
  }
  cleanups.push(
    /* 僅清這65個自有client。 */ async () => {
      for (const client of clients) client.destroy()
    },
  )
  await expect.poll(() => clients[64]!.closed).toBe(true)
  expect(proxy.summary().sockets).toBe(64)
  for (const client of clients) client.destroy()
  await expect.poll(() => proxy.summary().sockets).toBe(0)
  const oversized = await rawTunnel(proxy.port, '/' + 'p'.repeat(17000))
  cleanups.push(oversized.close)
  await expect.poll(oversized.closed).toBe(true)
  expect(upstreamCalls).toBe(0)
})

// 上游正常FIN必須排送所有已緩衝bytes，不能用destroy截斷尾端。
it('normal FIN delivers buffered bytes', async () => {
  const payload = Buffer.alloc(1024 * 1024, 37)
  const endpoint = await serve(
    (_req, res) => res.end(),
    (_req, socket) => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
      )
      socket.end(payload)
    },
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  proxy.beginCase('', PUBLIC_TARGET)
  const client = await rawTunnel(proxy.port)
  cleanups.push(client.close)
  await expect.poll(client.closed).toBe(true)
  expect(client.received().equals(payload)).toBe(true)
})

// 兩方向分開控制慢端，固定公開1MiB序列重送16份以超過宿主kernel buffer。
for (const direction of ['upload', 'download']) {
  it('bounds slow peer ' + direction + ' without dropping bytes', async () => {
    const payload = Buffer.alloc(16 * 1024 * 1024)
    for (let i = 0; i < payload.length; i++) payload[i] = i % 251
    let peer: Duplex | undefined
    let received = 0,
      matched = true
    const endpoint = await serve(
      (_req, res) => res.end(),
      (_req, socket) => {
        peer = socket
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
        )
        if (direction === 'download') socket.write(payload)
        else {
          // 只在公開endpoint增量驗fixture，不把上傳資料回report。
          socket.on('data', (part: Buffer) => {
            for (let i = 0; i < part.length; i++)
              if (part[i] !== (received + i) % 251) matched = false
            received += part.length
          })
          socket.pause()
        }
      },
    )
    cleanups.push(endpoint.close)
    const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
    cleanups.push(proxy.close)
    const lease = proxy.beginCase('', PUBLIC_TARGET)
    const client = await rawTunnel(proxy.port)
    cleanups.push(client.close)
    await lease.nextAccepted(new AbortController().signal)
    if (direction === 'upload') client.write(payload)
    else client.pause()
    await expect.poll(() => lease.summary().pauses).toBeGreaterThan(0)
    if (direction === 'upload') {
      peer!.resume()
      await expect.poll(() => received).toBe(payload.length)
      expect(matched).toBe(true)
    } else {
      client.resume()
      await expect.poll(() => client.received().equals(payload)).toBe(true)
    }
    const state = lease.summary()
    expect(state.drains).toBeGreaterThan(0)
    expect(state.peakReadable).toBeLessThanOrEqual(131072)
    expect(state.peakWritable).toBeLessThanOrEqual(131072)
    expect(proxy.summary().pauses).toBeGreaterThan(0)
  })
}

// 30秒guard驗真已到上游但永不回覆的request；不假造連線成功。
it('expires a pending upgrade at thirty seconds', async () => {
  let arrived = false
  const endpoint = await serve(
    (_req, res) => res.end(),
    () => {
      arrived = true
    },
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  proxy.beginCase('', PUBLIC_TARGET)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const pending = rawTunnel(proxy.port)
  for (let i = 0; i < 200 && !arrived; i++)
    await new Promise<void>(/* 不推進timeout但讓真IO處理。 */ (resolve) => setImmediate(resolve))
  expect(arrived).toBe(true)
  await vi.advanceTimersByTimeAsync(30000)
  vi.useRealTimers()
  const client = await pending
  cleanups.push(client.close)
  expect(client.closed()).toBe(true)
  await expect.poll(() => proxy.summary().timers).toBe(0)
})

// 不合法URL或header／exception不能被保留於安全摘要。
it('fixed errors and summary never retain public sensitive sentinel', async () => {
  const { proxy, lease } = await setupEcho()
  const client = await rawTunnel(proxy.port, PUBLIC_CONNECT + '?PublicSensitiveSentinel')
  cleanups.push(client.close)
  expect(client.status).toBe(400)
  expect(JSON.stringify(proxy.summary()).includes('PublicSensitiveSentinel')).toBe(false)
  expect(JSON.stringify(lease.summary()).includes('PublicSensitiveSentinel')).toBe(false)
  try {
    lease.interrupt({ index: 1, acceptedAt: 1 })
  } catch (error) {
    expect(
      error instanceof Error &&
        error.message === 'proxy_invalid_handle' &&
        error.cause === undefined,
    ).toBe(true)
  }
})

// 只替換永不完成的native socket負向來源，不mock任何HTTP／WS成功。
it('aborts a stalled upstream TCP connect at five seconds', async () => {
  const { proxy } = await setupEcho()
  let stalled: Socket | undefined
  vi.spyOn(LoopbackAgent.prototype, 'createConnection').mockImplementation(() => {
    stalled = new Socket()
    // readonly TS屬性僅在這個負向socket fixture覆寫，沒有假connect成功。
    Object.defineProperty(stalled, 'connecting', {
      value: true,
      writable: true,
      configurable: true,
    })
    return stalled
  })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const pending = readHttp(proxy.port)
  for (let i = 0; i < 200 && !stalled; i++)
    await new Promise<void>(/* 不假造connect事件。 */ (resolve) => setImmediate(resolve))
  expect(!!stalled).toBe(true)
  await vi.advanceTimersByTimeAsync(4999)
  expect(stalled!.destroyed).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(stalled!.destroyed).toBe(true)
  vi.useRealTimers()
  expect((await pending).status).toBe(503)
})

// 一般HTTP同樣必須有30秒總guard，不能以socket持續activity無限延長。
it('expires a pending HTTP response at thirty seconds', async () => {
  let arrived = false
  const endpoint = await serve(() => {
    arrived = true
  })
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const pending = readHttp(proxy.port)
  for (let i = 0; i < 200 && !arrived; i++)
    await new Promise<void>(/* 讓真loopback IO進行。 */ (resolve) => setImmediate(resolve))
  expect(arrived).toBe(true)
  await vi.advanceTimersByTimeAsync(30000)
  vi.useRealTimers()
  expect((await pending).status).toBe(503)
})

// 不能正常完成的resource必須回cleanup_timeout，不能清空追蹤表偽造成功。
it('rejects cleanup after five seconds instead of claiming a stuck resource closed', async () => {
  const lease = new ProxyLease('', PUBLIC_TARGET)
  let release!: () => void
  const done = new Promise<void>(
    /* 測試producer只控制負向資源完成點。 */ (resolve) => {
      release = resolve
    },
  )
  lease.track({}, { done, stop: /* 刻意不完成以校準deadline。 */ () => {}, kind: 'http' })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const pending = lease.close().catch(/* 只收固定安全分類。 */ (error: Error) => error.message)
  await vi.advanceTimersByTimeAsync(4999)
  expect(lease.summary().http).toBe(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(await pending).toBe('proxy_cleanup_timeout')
  expect(lease.summary().http).toBe(1)
  release()
  await done
})

// Header parser尚未完成時，Node內建掃描週期不能把30秒期限拖到下一輪。
it('closes incomplete incoming headers within thirty seconds', async () => {
  const { proxy } = await setupEcho()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const client = connect({ host: '127.0.0.1', port: proxy.port })
  client.on('error', /* 公開取消不輸出原生資料。 */ () => {})
  cleanups.push(
    /* 僅回收這個自有raw client。 */ async () => {
      client.destroy()
    },
  )
  await new Promise<void>(
    /* 保留半個header，不能觸發request callback。 */ (resolve) =>
      client.once('connect', () => {
        client.write('GET /public HTTP/1.1\r\nHost:')
        resolve()
      }),
  )
  await vi.advanceTimersByTimeAsync(29999)
  expect(client.closed).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  vi.useRealTimers()
  await expect.poll(() => client.closed).toBe(true)
})

// 一條HTTP pipeline不能繞過TCP上限建立無界上游request／timer。
it('bounds HTTP pipeline work without an unbounded upstream fanout', async () => {
  let calls = 0
  const replies: import('node:http').ServerResponse[] = []
  const endpoint = await serve((_req, response) => {
    calls++
    replies.push(response)
  })
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const client = connect({ host: '127.0.0.1', port: proxy.port })
  client.on('error', /* 無私有資料的公開pipeline probe。 */ () => {})
  client.on('data', /* 只讀去固定公開回覆以允許native FIN，不保存內容。 */ () => {})
  cleanups.push(
    /* 僅關本probe的client。 */ async () => {
      client.destroy()
    },
  )
  await new Promise<void>(
    /* 一次寫完整65筆固定公開GET。 */ (resolve) =>
      client.once('connect', () => {
        client.write(
          Array.from(
            { length: 65 },
            () => 'GET /public HTTP/1.1\r\nHost: public.example\r\n\r\n',
          ).join(''),
        )
        resolve()
      }),
  )
  await expect.poll(() => calls).toBeGreaterThanOrEqual(64)
  for (let i = 0; i < 20; i++)
    await new Promise<void>(/* 讓同packet剩餘的真IO都到上游。 */ (resolve) => setImmediate(resolve))
  expect(calls).toBe(64)
  expect(proxy.summary().http).toBe(64)
  for (const response of replies) response.end('public')
  await proxy.close()
})

// HTTP絕對header guard在真upgrade後必須消失，不能30秒後誤切正常tunnel。
it('removes header deadline once the stream upgrades', async () => {
  const { proxy, lease } = await setupEcho()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const client = await rawTunnel(proxy.port)
  cleanups.push(client.close)
  await lease.nextAccepted(new AbortController().signal)
  expect(proxy.summary().timers).toBe(0)
  await vi.advanceTimersByTimeAsync(30001)
  expect(client.closed()).toBe(false)
  vi.useRealTimers()
  client.write('public no WS lifetime timer')
  await expect.poll(() => client.received().toString()).toBe('public no WS lifetime timer')
})
