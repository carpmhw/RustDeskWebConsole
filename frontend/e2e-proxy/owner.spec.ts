import { createServer } from 'node:net'
import { createReconnectTest } from '../e2e-real/reconnect-fixtures.ts'
import { createLoopbackProxy } from '../e2e-real/reconnect-proxy.ts'
import { expect } from '@playwright/test'
import { PUBLIC_TARGET, readHttp, serve } from './public-fixtures.ts'
import { runOwnerChild } from './owner-child.ts'

// 公開owner probe注入OS port，不占正式80／81或啟動Docker。
const test = createReconnectTest(async () => {
  const endpoint = await serve((_request, response) => response.end('public owner'))
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port }).catch(
    async () => {
      await endpoint.close()
      throw new Error('public_proxy_failed')
    },
  )
  return {
    ...proxy,
    // Worker teardown必須同時關自己上游，外層不收其他endpoint。
    close: async () => {
      try {
        await proxy.close()
      } finally {
        await endpoint.close()
      }
    },
  }
})

// 此hook能完成真往返才代表auto worker早於beforeEach完成bind。
test.beforeEach(async ({ reconnectProxy }) => {
  expect((await readHttp(reconnectProxy.port)).body).toBe('public owner')
})

// 關lease後也不能在同test再begin，避免case重設繞過操作／quota觀測。
test('listener before beforeEach and case begins only once', async ({ reconnectCase }) => {
  const lease = reconnectCase.begin(PUBLIC_TARGET)
  await lease.close()
  expect(() => reconnectCase.begin(PUBLIC_TARGET)).toThrow('proxy_capacity')
})

// 舊scope晚回close不能取消新scope的waiter，worker摘要亦必須反映真等待數。
test('late old callback cannot affect next scope', async ({ reconnectProxy }) => {
  const old = reconnectProxy.beginCase('', PUBLIC_TARGET)
  await old.close()
  const current = reconnectProxy.beginCase('', PUBLIC_TARGET)
  const abort = new AbortController()
  const pending = current
    .nextAccepted(abort.signal)
    .catch(/* 只回安全取消分類。 */ (error: Error) => error.message)
  try {
    expect(reconnectProxy.summary().waiters).toBe(1)
    await old.close()
    expect(current.summary()).toMatchObject({ waiters: 1, closed: false })
    abort.abort()
    expect(await pending).toBe('proxy_cancelled')
  } finally {
    await current.close()
  }
})

for (const mode of ['setup', 'timeout', 'signal', 'runner-signal'] as const) {
  // 真子程序錯誤／timeout／SIGTERM後，summary、native upstream與rebind都要成立。
  test('owned child cleanup after ' + mode, async () => {
    let active = 0
    const endpoint = await serve(
      (_req, res) => res.end(),
      (_req, socket, head) => {
        active++
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
        )
        if (head.length) socket.write(head)
        socket.pipe(socket)
        // 由native close而非控制函數回傳判定上游已釋放。
        socket.once('close', () => active--)
      },
    )
    try {
      const child = await runOwnerChild(mode, endpoint.port)
      expect(child.killed, child.output).toBe(false)
      expect(child.code).not.toBe(0)
      expect(child.port).toBeGreaterThan(0)
      expect(child.summary, child.output).toMatchObject({
        active: 0,
        sockets: 0,
        waiters: 0,
        timers: 0,
        closed: true,
      })
      if (mode === 'signal' || mode === 'runner-signal') expect(child.signalled).toBe(true)
      if (mode === 'runner-signal') {
        expect(child.output.indexOf('public-owned-console-down')).toBeGreaterThan(
          child.output.indexOf('public-owner-closed='),
        )
        expect(child.output.split('public-owned-console-down').length - 1).toBe(1)
      }
      await expect.poll(() => active).toBe(0)
      const rebound = createServer()
      await new Promise<void>((resolve, reject) => {
        rebound.once('error', reject)
        rebound.listen(child.port!, '127.0.0.1', resolve)
      })
      await new Promise<void>((resolve) => rebound.close(() => resolve()))
    } finally {
      await endpoint.close()
    }
  })
}
