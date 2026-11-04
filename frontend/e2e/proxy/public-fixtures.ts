import {
  createServer,
  request,
  type RequestListener,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from 'node:http'
import { connect, type Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { createHash } from 'node:crypto'
import type { Page } from '@playwright/test'
import type { ProxyBase } from '../real/reconnect-proxy-types.ts'

export const PUBLIC_TARGET = '00000000-0000-0000-0000-000000000001'
export const PUBLIC_CONNECT = '/api/v1/targets/' + PUBLIC_TARGET + '/connect'

// 只啟動本輪自有loopback endpoint；callback只服務固定公開fixture。
export async function serve(
  handler: RequestListener,
  upgrade?: (request: IncomingMessage, socket: Duplex, head: Buffer) => void,
) {
  const sockets = new Set<Socket>()
  const server = createServer(handler)
  if (upgrade) server.on('upgrade', upgrade)
  // HTTP／升級後的socket一律由此函數owner回收。
  server.on('connection', (socket) => {
    sockets.add(socket)
    // 不保留已關閉的公開socket。
    socket.on('close', () => sockets.delete(socket))
    // 原生任意例外不能進report。
    socket.on('error', () => {})
  })
  await new Promise<void>(
    /* 本機port由OS選定。 */ (resolve) => server.listen(0, '127.0.0.1', resolve),
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('public_endpoint_unavailable')
  return {
    port: address.port,
    // 只清此fixture建立的socket與listener。
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(
        /* 等待native listener結束。 */ (resolve) => server.close(() => resolve()),
      )
    },
  }
}

// Raw tunnel僅驗公開bytes與HTTP upgrade邊界，不能用於真認證或RustDesk資料。
export async function rawTunnel(port: number, path = PUBLIC_CONNECT, early = '') {
  const socket = connect({ host: '127.0.0.1', port })
  let bytes = Buffer.alloc(0)
  let status: number | undefined
  let header = ''
  let settle!: () => void
  const ready = new Promise<void>(
    /* 只等待真header或關閉。 */ (resolve) => {
      settle = resolve
    },
  )
  // 固定公開資料可在測試RAM比對，不印任意native error。
  socket.on('error', () => {})
  socket.on('close', () => settle())
  socket.on('data', (part: Buffer) => {
    bytes = Buffer.concat([bytes, part])
    if (bytes.length > 32 * 1024 * 1024) {
      socket.destroy()
      return
    }
    if (status === undefined) {
      const end = bytes.indexOf('\r\n\r\n')
      if (end >= 0) {
        header = bytes.subarray(0, end).toString()
        status = Number(header.split(' ')[1])
        bytes = bytes.subarray(end + 4)
        settle()
      }
    }
  })
  // 一次write把request與首bytes合併，以驗head不被遺漏。
  socket.on('connect', () =>
    socket.write(
      'GET ' +
        path +
        ' HTTP/1.1\r\nHost: public.example\r\nOrigin: http://public.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Protocol: public-probe\r\n\r\n' +
        early,
    ),
  )
  await ready
  return {
    status,
    header,
    // 真socket寫入固定公開資料，不伪造接收成功。
    write: (value: string | Buffer) => socket.write(value),
    // 只在公開probe中回bytes作獨立oracle，不用於產品觀測。
    received: () => Buffer.from(bytes),
    // native close而不是控制函數回傳才算斷線。
    closed: () => socket.closed,
    // 公開慢端fixture明確pause／resume，不修改proxy或產品。
    pause: () => socket.pause(),
    // 恢復原生讀取，不能以丟棄資料降低背壓。
    resume: () => socket.resume(),
    // 測試owned client結束可重入。
    close: async () => {
      if (socket.closed) return
      const closed = new Promise<void>(
        /* 等待真的close。 */ (resolve) => socket.once('close', () => resolve()),
      )
      socket.destroy()
      await closed
    },
  }
}

// 公開HTTP測試只收固定fixture body，不載runtime或操作者認證。
export function readHttp(
  port: number,
  path = '/',
  method = 'GET',
  headers: IncomingHttpHeaders = {},
  body = '',
) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>(
    /* 真HTTP client用來驗轉送而非mock framework。 */ (resolve, reject) => {
      const outgoing = request(
        { host: '127.0.0.1', port, path, method, headers, agent: false },
        (response) => {
          let value = ''
          // 固定公開body嚴格限制大小，不累積任意回應。
          response.on('data', (part: Buffer) => {
            value += part.toString()
            if (value.length > 4096) outgoing.destroy()
          })
          // 原生成功後才回公開fixture結果。
          response.on('end', () =>
            resolve({ status: response.statusCode!, headers: response.headers, body: value }),
          )
          // 公開fixture失敗也只回固定分類。
          response.on('error', () => reject(new Error('public_http_failed')))
        },
      )
      // 有界等待不能讓缺實作變成懸空程序。
      outgoing.setTimeout(2000, () => outgoing.destroy())
      // 不把包含request options的native error輸出。
      outgoing.on('error', () => reject(new Error('public_http_failed')))
      // Node的CONNECT回覆走專用事件，不會觸發response callback。
      outgoing.on('connect', (response, socket) => {
        socket.destroy()
        resolve({ status: response.statusCode!, headers: response.headers, body: '' })
      })
      outgoing.end(body)
    },
  )
}

const PUBLIC_TEXT = 'Public transparent Worker'
const workerScript = `
const sockets = new Map();
// 公開Worker持有真正WebSocket，Main只接相等布林與close code。
self.onmessage = ({data}) => {
  if (data.action === 'send') { sockets.get(data.id)?.send(${JSON.stringify(PUBLIC_TEXT)}); return; }
  const base = location.pathname.slice(0, -'/worker.js'.length);
  const socket = new WebSocket('ws://' + location.host + base + ${JSON.stringify(PUBLIC_CONNECT)}, 'public-probe');
  sockets.set(data.id, socket); socket.binaryType = 'arraybuffer';
  // 只傳固定公開文字或64KiB序列，不讀真runtime。
  socket.onopen = () => {
    if (!data.binary) socket.send(${JSON.stringify(PUBLIC_TEXT)});
    else { const bytes=new Uint8Array(65536); for(let i=0;i<bytes.length;i++) bytes[i]=i%251; socket.send(bytes); }
  };
  // 先在Worker RAM內驗全相等，不能讓Main收到原文。
  socket.onmessage = ({data:value}) => {
    let matched = value === ${JSON.stringify(PUBLIC_TEXT)};
    if(value instanceof ArrayBuffer) { const bytes=new Uint8Array(value); matched=bytes.length===65536;
      for(let i=0;i<bytes.length && matched;i++) matched=bytes[i]===i%251; }
    postMessage({id:data.id, matched, protocol:socket.protocol});
  };
  // 原生事件直接回安全分類，不改close code。
  socket.onclose = ({code,wasClean}) => { sockets.delete(data.id); postMessage({id:data.id, code,wasClean}); };
  // 不把原生error原文帶入report。
  socket.onerror = () => postMessage({id:data.id, error:true});
};`

// 公開RFC6455 server frame僅屬fixture，不能載入proxy或產品。
function publicFrame(opcode: number, fin: number, body: Buffer): Buffer {
  const header = Buffer.alloc(body.length < 126 ? 2 : body.length <= 65535 ? 4 : 10)
  header[0] = fin | opcode
  if (header.length === 2) header[1] = body.length
  else if (header.length === 4) {
    header[1] = 126
    header.writeUInt16BE(body.length, 2)
  } else {
    header[1] = 127
    header.writeBigUInt64BE(BigInt(body.length), 2)
  }
  return Buffer.concat([header, body])
}

// 真公開WS endpoint僅echo固定fixture，與opaque proxy嚴格分離。
export async function startPublicEndpoint() {
  const peers = new Map<number, Duplex>()
  let upgrades = 0,
    messages = 0
  const endpoint = await serve(
    (request, response) => {
      if (request.url?.endsWith('/worker.js')) {
        response.setHeader('Content-Type', 'application/javascript')
        response.end(workerScript)
      } else {
        response.setHeader('Content-Type', 'text/html')
        response.end('<!doctype html><title>Public Worker proxy probe</title>')
      }
    },
    (request, socket, head) => {
      const key = request.headers['sec-websocket-key']
      if (typeof key !== 'string' || request.headers['sec-websocket-protocol'] !== 'public-probe') {
        socket.destroy()
        return
      }
      const accept = createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64')
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
          accept +
          '\r\nSec-WebSocket-Protocol: public-probe\r\n\r\n',
      )
      const index = upgrades++
      peers.set(index, socket)
      let pending = Buffer.alloc(0)
      // 固定公開parser有256KiB buffer與128KiB frame上限，不讀真協定。
      function receive(part: Buffer): void {
        if (pending.length + part.length > 262144) {
          socket.destroy()
          return
        }
        pending = Buffer.concat([pending, part])
        while (pending.length >= 2) {
          let length = pending[1] & 127,
            offset = 2
          if (length === 126) {
            if (pending.length < 4) return
            length = pending.readUInt16BE(2)
            offset = 4
          } else if (length === 127) {
            if (pending.length < 10) return
            const wide = pending.readBigUInt64BE(2)
            if (wide > 131072n) {
              socket.destroy()
              return
            }
            length = Number(wide)
            offset = 10
          }
          const opcode = pending[0] & 15,
            fin = pending[0] & 128
          if (!(pending[1] & 128) || ![0, 1, 2, 8, 9].includes(opcode)) {
            socket.destroy()
            return
          }
          if (pending.length < offset + 4 + length) return
          const body = Buffer.from(pending.subarray(offset + 4, offset + 4 + length))
          for (let i = 0; i < body.length; i++) body[i] ^= pending[offset + (i % 4)]
          pending = pending.subarray(offset + 4 + length)
          if (opcode === 8) {
            socket.end(publicFrame(8, 128, body))
            return
          }
          if (opcode === 9) {
            socket.write(publicFrame(10, 128, body))
            continue
          }
          if (fin) messages++
          socket.write(publicFrame(opcode, fin, body))
        }
      }
      socket.on('data', receive)
      if (head.length) receive(head)
      // 正常FIN不能留half-open fixture。
      socket.on('end', () => socket.end())
      // Native close才釋放active計數。
      socket.on('close', () => peers.delete(index))
    },
  )
  return {
    ...endpoint,
    // 只回安全計數，無URL／frame或Socket物件。
    counts: () => ({ upgrades, messages, active: peers.size }),
    // Native上游主動close，不由proxy偽造code。
    end: (index: number, code: 1000 | 1012) => {
      const peer = peers.get(index)
      if (!peer || ![1000, 1012].includes(code)) throw new Error('public_invalid_close')
      const body = Buffer.alloc(2)
      body.writeUInt16BE(code)
      peer.end(publicFrame(8, 128, body))
    },
  }
}

export interface PublicWorkerResult {
  matches: number
  matched?: boolean
  code?: number
  wasClean?: boolean
  protocol?: string
}
type PublicWindow = Window & {
  publicProxyWorker?: Worker
  publicProxyResults?: Record<number, PublicWorkerResult>
}

// 公開頁面與Worker由同一proxy入口提供，不mock Main WebSocket。
export async function startPublicWorker(page: Page, port: number, base: ProxyBase): Promise<void> {
  await page.goto('http://127.0.0.1:' + port + base + '/')
  await page.evaluate((prefix) => {
    const state = window as PublicWindow
    const results: Record<number, PublicWorkerResult> = {}
    state.publicProxyResults = results
    state.publicProxyWorker = new Worker(prefix + '/worker.js')
    // 只存布林、次數、protocol literal與close code。
    state.publicProxyWorker.onmessage = ({ data }) => {
      const previous = results[data.id] ?? { matches: 0 }
      results[data.id] = {
        ...previous,
        ...data,
        matches: previous.matches + (data.matched === true ? 1 : 0),
      }
    }
  }, base)
}

// 真Worker每次明確建立新socket，不自動重播舊公開資料。
export async function openPublicWorkerSocket(
  page: Page,
  id: number,
  binary = false,
): Promise<void> {
  await page.evaluate(
    (data) => {
      const worker = (window as PublicWindow).publicProxyWorker
      if (!worker) throw new Error('public_worker_unavailable')
      worker.postMessage(data)
    },
    { id, binary },
  )
  await page.waitForFunction(
    (key) => (window as PublicWindow).publicProxyResults?.[key]?.matches === 1,
    id,
  )
}

// Snapshot只回公開安全結果，不回native socket／frame。
export function publicWorkerResult(
  page: Page,
  id: number,
): Promise<PublicWorkerResult | undefined> {
  return page.evaluate((key) => (window as PublicWindow).publicProxyResults?.[key], id)
}

// 只向現有Worker送公開控制訊息，不從Main接管WS。
export function sendPublicWorkerText(page: Page, id: number): Promise<void> {
  return page.evaluate((key) => {
    const worker = (window as PublicWindow).publicProxyWorker
    if (!worker) throw new Error('public_worker_unavailable')
    worker.postMessage({ action: 'send', id: key })
  }, id)
}

// 收尾只關本fixture的Worker，無產品或其他分頁副作用。
export function closePublicWorker(page: Page): Promise<void> {
  return page.evaluate(() => (window as Partial<PublicWindow>).publicProxyWorker?.terminate())
}
