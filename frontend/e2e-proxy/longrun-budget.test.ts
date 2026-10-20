import { afterEach, expect, it } from 'vitest'
import { createLongrunBudget } from '../e2e-real/reconnect-longrun-budget'
import { createLoopbackProxy } from '../e2e-real/reconnect-proxy'
import { PUBLIC_TARGET, PUBLIC_CONNECT, rawTunnel, readHttp, serve } from './public-fixtures'
import type { LongrunCase } from '../e2e-real/reconnect-longrun-observer'

const cleanups: Array<() => Promise<void>> = []
// 僅清自己建立的公開endpoint／proxy／socket。
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})
// 超額或偽造handle不能切斷後續的真公開pair，也不能耗用計數。
it('cuts only accepted handles and enforces per-case and total budgets', async () => {
  const endpoint = await serve(
    /* 一般HTTP不參與cut。 */ (_req, res) => res.end(),
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
  const budget = createLongrunBudget()
  for (const id of ['S/tcp', 'S/ws', 'D/tcp', 'D/ws'] as LongrunCase[]) {
    const lease = proxy.beginCase('', PUBLIC_TARGET)
    for (let n = 0; n <= (id.startsWith('S') ? 2 : 3); n++) {
      await readHttp(proxy.port, '/api/v1/targets/' + PUBLIC_TARGET)
      const pending = lease.nextAccepted(new AbortController().signal)
      const socket = await rawTunnel(proxy.port, PUBLIC_CONNECT)
      cleanups.push(socket.close)
      const handle = await pending
      const before = budget.summary().total
      if (n < (id.startsWith('S') ? 2 : 3))
        expect(() => budget.cut(id, lease, { ...handle })).toThrow('proxy_invalid_handle')
      expect(budget.summary().total).toBe(before)
      if (n === (id.startsWith('S') ? 2 : 3)) {
        expect(() => budget.cut(id, lease, handle)).toThrow('longrun_cut_budget')
        socket.write('public alive')
        await expect
          .poll(/* 超額不應切到仍活著的pair。 */ () => socket.received().toString())
          .toBe('public alive')
      } else {
        expect(budget.cut(id, lease, handle)).toBeGreaterThanOrEqual(handle.acceptedAt)
        await expect.poll(socket.closed).toBe(true)
      }
    }
    await lease.close()
    expect(lease.summary()).toMatchObject({ sockets: 0, active: 0, closed: true })
  }
  expect(budget.summary()).toEqual({
    total: 10,
    cases: { 'S/tcp': 2, 'S/ws': 2, 'D/tcp': 3, 'D/ws': 3 },
  })
})
