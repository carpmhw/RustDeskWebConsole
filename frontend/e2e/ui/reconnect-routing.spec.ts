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
    if (request.url === '/worker.js') {
      response.setHeader('content-type', 'application/javascript')
      response.end(
        'const socket=new WebSocket("ws://"+location.host+"/connect");socket.onopen=()=>socket.send("Public worker route");socket.onmessage=e=>postMessage({matched:e.data==="Public worker route"});socket.onclose=e=>postMessage({closedCode:e.code});',
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

// 保留上游限制的負向回歸：Main route 不可冒充 Worker 故障注入。
// Worker 的真 TCP 中斷另由 e2e/proxy/worker.spec.ts 驗證；上游議題 microsoft/playwright#37048。
test('Main routes cannot claim Dedicated Worker interruption', async ({ page }) => {
  const endpoint = await publicEndpoint()
  try {
    const routes = await installMainReconnectRoutes(page.context())
    await page.goto(endpoint.url)
    await page.evaluate(() => {
      const state = window as Window & { publicWorkerMatched?: boolean; publicWorkerClose?: number }
      state.publicWorkerMatched = false
      const worker = new Worker('/worker.js')
      // 公開Worker只回固定相等布林與close code，沒有私有frame。
      worker.onmessage = (event) => {
        if (event.data.matched === true) state.publicWorkerMatched = true
        if (Number.isInteger(event.data.closedCode)) {
          state.publicWorkerClose = event.data.closedCode
          worker.terminate()
        }
      }
    })
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { publicWorkerMatched?: boolean }).publicWorkerMatched,
        ),
      )
      .toBe(true)
    expect(endpoint.counts()).toMatchObject({ opened: 1, messages: 1 })
    expect(routes.opened).toBe(0)
    await expect(routes.interrupt(0)).rejects.toThrow('Invalid reconnect route')
    await routes.close()
    expect(endpoint.counts().active).toBe(1)
    // 原生 endpoint 的真中斷才可讓 Worker 收到 1006，不能以 route.close 假冒成功。
    endpoint.interrupt()
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { publicWorkerClose?: number }).publicWorkerClose),
      )
      .toBe(1006)
    await expect.poll(() => endpoint.counts().active).toBe(0)
    await routes.close()
  } finally {
    await page.close()
    await endpoint.close()
  }
})
