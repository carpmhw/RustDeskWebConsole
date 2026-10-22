import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import type { Duplex } from 'node:stream'
import { expect, test, type Page } from '@playwright/test'
import { installMainReconnectRoutes } from '../real/reconnect-routing'

// 僅供固定公開短字串的有界WS endpoint；不載App／auth、RustDesk或系統clipboard。
async function publicEndpoint() {
  const sockets = new Set<Duplex>()
  let opened = 0
  let messages = 0
  // 每案由OS選loopback port，不重用既有服務。
  const server = createServer((request, response) => {
    if (request.url?.split('?')[0] === '/worker.js') {
      response.setHeader('content-type', 'application/javascript')
      response.end(
        'const target=new URL(location.href).searchParams.get("proxy")||("ws://"+location.host+"/connect");const socket=new WebSocket(target);socket.onopen=()=>socket.send("Public worker route");socket.onmessage=e=>postMessage({matched:e.data==="Public worker route"});socket.onclose=e=>postMessage({closedCode:e.code});',
      )
    } else response.end('<!doctype html><title>Public route calibration</title>')
  })
  // 標準RFC6455握手；只處理固定測試短frame，無任何產品協定或私有payload。
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      socket.destroy()
      return
    }
    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    )
    sockets.add(socket)
    opened++
    let pending = Buffer.alloc(0)
    // 空間嚴格有界，只回送公開frame，不印資料內容。
    socket.on('data', (data: Buffer) => {
      if (pending.length + data.length > 2048) {
        socket.destroy()
        return
      }
      pending = Buffer.concat([pending, data])
      while (pending.length >= 2) {
        const opcode = pending[0]! & 15
        const masked = !!(pending[1]! & 128)
        const length = pending[1]! & 127
        if (!masked || length > 125 || ![1, 8].includes(opcode)) {
          socket.destroy()
          return
        }
        if (pending.length < 6 + length) return
        const body = Buffer.from(pending.subarray(6, 6 + length))
        for (let i = 0; i < length; i++) body[i] = body[i]! ^ pending[2 + (i % 4)]!
        pending = pending.subarray(6 + length)
        const frame = Buffer.concat([Buffer.from([128 | opcode, length]), body])
        if (opcode === 8) {
          socket.end(frame)
          return
        }
        messages++
        socket.write(frame)
      }
    })
    // 本案僅計原生socket結束，不收集URL或frame。
    socket.on('close', () => sockets.delete(socket))
    // 對端結束時不保留half-open資源。
    socket.on('end', () => socket.end())
    // 公開fixture錯誤不輸出原生任意文字。
    socket.on('error', () => {})
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Public endpoint unavailable')
  return {
    url: 'http://127.0.0.1:' + address.port,
    // 只暴露安全計數，不回送測試原文或server物件。
    counts: () => ({ opened, messages, active: sockets.size }),
    // 只中斷本函數持有的公開 socket，與 Playwright route 計數獨立。
    interrupt: () => {
      for (const socket of sockets) socket.destroy()
    },
    // 只收回本函數建立的endpoint與socket。
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

// 公開Worker的loopback WS proxy；只轉送固定短字串，讓native dedicated Worker的連線可被網路層切斷。
async function publicWorkerProxy(upstreamUrl: string) {
  const sockets = new Set<Duplex>()
  const entries: Array<{
    socket: Duplex
    upstream: WebSocket
    queued: string[]
    closed: boolean
  }> = []
  let opened = 0
  let messages = 0
  let interrupted = 0
  let closing: Promise<void> | undefined
  const server = createServer((_request, response) => {
    response.writeHead(404)
    response.end()
  })
  // 標準RFC6455握手；只接受固定/connect路徑與公開短frame。
  server.on('upgrade', (request, socket) => {
    if (request.url !== '/connect') {
      socket.destroy()
      return
    }
    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      socket.destroy()
      return
    }
    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    )
    const upstream = new WebSocket(upstreamUrl)
    const entry = { socket, upstream, queued: [] as string[], closed: false }
    entries.push(entry)
    sockets.add(socket)
    opened++
    let pending = Buffer.alloc(0)
    // Worker→proxy只處理有界masked文字與close；不保存或輸出原文。
    socket.on('data', (data: Buffer) => {
      if (entry.closed) return
      if (pending.length + data.length > 2048) {
        socket.destroy()
        return
      }
      pending = Buffer.concat([pending, data])
      while (pending.length >= 2) {
        const opcode = pending[0]! & 15
        const masked = !!(pending[1]! & 128)
        const length = pending[1]! & 127
        if (!masked || length > 125 || ![1, 8].includes(opcode)) {
          socket.destroy()
          return
        }
        if (pending.length < 6 + length) return
        const body = Buffer.from(pending.subarray(6, 6 + length))
        for (let i = 0; i < length; i++) body[i] = body[i]! ^ pending[2 + (i % 4)]!
        pending = pending.subarray(6 + length)
        if (opcode === 8) {
          socket.end(Buffer.from([0x88, 0x00]))
          if (upstream.readyState === 0 || upstream.readyState === 1) upstream.close(1000)
          return
        }
        messages++
        const text = body.toString('utf8')
        if (upstream.readyState === 1) upstream.send(text)
        else if (entry.queued.length < 8) entry.queued.push(text)
        else socket.destroy()
      }
    })
    // Upstream echo只回傳固定文字frame；過長或不支援資料直接終止。
    upstream.onopen = () => {
      for (const text of entry.queued.splice(0)) upstream.send(text)
    }
    upstream.onmessage = (event) => {
      if (entry.closed || typeof event.data !== 'string') return
      const body = Buffer.from(event.data)
      if (body.length > 125) {
        socket.destroy()
        return
      }
      socket.write(Buffer.concat([Buffer.from([0x81, body.length]), body]))
    }
    upstream.onclose = () => {
      if (!entry.closed) socket.destroy()
    }
    upstream.onerror = () => {
      socket.destroy()
    }
    // 兩端任一結束都不保留half-open資源；不輸出原生例外文字。
    socket.on('close', () => {
      sockets.delete(socket)
      if (!entry.closed) {
        entry.closed = true
        if (upstream.readyState === 0 || upstream.readyState === 1) upstream.close()
      }
    })
    socket.on('end', () => socket.end())
    socket.on('error', () => {})
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Public worker proxy unavailable')
  // 只收本函數建立的proxy、upstream與socket；close可重入。
  return {
    url: 'ws://127.0.0.1:' + address.port + '/connect',
    counts: () => ({ opened, messages, interrupted, active: sockets.size }),
    interrupt: (index: number) => {
      if (!Number.isSafeInteger(index) || index !== 0) {
        throw new Error('Invalid public worker proxy route')
      }
      const entry = entries[index]
      if (!entry || entry.closed) return
      entry.closed = true
      interrupted++
      // 只注入固定service-restart close code，不偽造產品payload。
      entry.socket.write(Buffer.from([0x88, 0x02, 0x03, 0xf4]))
      entry.socket.end()
      if (entry.upstream.readyState === 0 || entry.upstream.readyState === 1) {
        entry.upstream.close(1000)
      }
    },
    close: () => {
      if (!closing) {
        closing = (async () => {
          for (const entry of entries) {
            entry.closed = true
            entry.socket.destroy()
            if (entry.upstream.readyState === 0 || entry.upstream.readyState === 1) {
              entry.upstream.close()
            }
          }
          for (const socket of sockets) socket.destroy()
          await new Promise<void>((resolve) => server.close(() => resolve()))
        })()
      }
      return closing
    },
  }
}

// Native browser往返公開短字串，只回相等布林與close code，不保存frame。
async function openPublicSocket(page: Page, url: string): Promise<boolean> {
  return page.evaluate(
    (address) =>
      new Promise<boolean>((resolve, reject) => {
        const state = window as Window & { publicCloseCode?: number }
        state.publicCloseCode = 0
        const socket = new WebSocket(address.replace('http:', 'ws:') + '/connect')
        // 只有已經真的open才送固定公開探針。
        socket.onopen = () => socket.send('Public transparent websocket')
        // 相等布林證明資料穿過真正endpoint，不是路由替身回成功。
        socket.onmessage = (event) => resolve(event.data === 'Public transparent websocket')
        // 原生close code只作控制流程證據。
        socket.onclose = (event) => {
          state.publicCloseCode = event.code
        }
        // 不把任意native exception寫進測試報告。
        socket.onerror = () => reject(new Error('Public native WebSocket failed'))
      }),
    url,
  )
}

// 不connectToServer／不雙向forward或錯close code，這個原生probe都必須失敗。
test('reconnect route forwards native traffic and injects restart without replacing the endpoint', async ({
  page,
}) => {
  const endpoint = await publicEndpoint()
  try {
    await page.goto(endpoint.url)
    const routes = await installMainReconnectRoutes(page.context())
    expect(await openPublicSocket(page, endpoint.url)).toBe(true)
    expect(endpoint.counts()).toMatchObject({ opened: 1, messages: 1 })
    expect(routes.opened).toBe(1)
    await routes.interrupt(0)
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { publicCloseCode?: number }).publicCloseCode),
      )
      .toBe(1012)
    await expect.poll(() => endpoint.counts().active).toBe(0)
    expect(routes.interrupted(0)).toBeGreaterThanOrEqual(routes.started(0))
    await routes.close()
  } finally {
    await endpoint.close()
  }
})

// 收尾必須釋放所有自有連線且可重入，不能由單一route的關閉漏掉其他upstream。
test('reconnect route cleanup closes every upstream and stays idempotent', async ({ page }) => {
  const endpoint = await publicEndpoint()
  try {
    await page.goto(endpoint.url)
    const routes = await installMainReconnectRoutes(page.context())
    expect(await openPublicSocket(page, endpoint.url)).toBe(true)
    expect(await openPublicSocket(page, endpoint.url)).toBe(true)
    expect(routes.opened).toBe(2)
    await routes.close()
    await routes.close()
    await expect.poll(() => endpoint.counts().active).toBe(0)
    expect(endpoint.counts().messages).toBe(2)
    await expect(routes.interrupt(9)).rejects.toThrow('Invalid reconnect route')
  } finally {
    await endpoint.close()
  }
})

// Playwright routeWebSocket只涵蓋page；改用loopback proxy切斷native dedicated Worker的網路連線。
test('reconnect proxy reaches native dedicated Worker sockets', async ({ page }) => {
  const endpoint = await publicEndpoint()
  const proxy = await publicWorkerProxy(endpoint.url.replace('http:', 'ws:') + '/connect')
  try {
    await page.goto(endpoint.url)
    await page.evaluate((proxyUrl) => {
      const state = window as Window & { publicWorkerMatched?: boolean; publicWorkerClose?: number }
      state.publicWorkerMatched = false
      const worker = new Worker('/worker.js?proxy=' + encodeURIComponent(proxyUrl))
      // 公開Worker只回固定相等布林與close code，沒有私有frame。
      worker.onmessage = (event) => {
        if (event.data.matched === true) state.publicWorkerMatched = true
        if (Number.isInteger(event.data.closedCode)) {
          state.publicWorkerClose = event.data.closedCode
          worker.terminate()
        }
      }
    }, proxy.url)
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { publicWorkerMatched?: boolean }).publicWorkerMatched,
        ),
      )
      .toBe(true)
    expect(proxy.counts()).toMatchObject({ opened: 1, messages: 1, interrupted: 0 })
    expect(endpoint.counts()).toMatchObject({ opened: 1, messages: 1 })
    proxy.interrupt(0)
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { publicWorkerClose?: number }).publicWorkerClose),
      )
      .toBe(1006)
    await expect.poll(() => endpoint.counts().active).toBe(0)
    await expect.poll(() => proxy.counts().interrupted).toBe(1)
  } finally {
    await proxy.close()
    await page.close()
    await endpoint.close()
  }
})
