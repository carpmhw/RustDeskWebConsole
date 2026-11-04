import { createServer, request as forward, ServerResponse, type ClientRequest } from 'node:http'
import type { Socket } from 'node:net'
import { newProxySummary, type ReconnectProxy, type TunnelHandle } from './reconnect-proxy-types.ts'
import { ProxyLease } from './reconnect-proxy-lease.ts'
import { LoopbackAgent } from './reconnect-proxy-agent.ts'
import {
  routeClass,
  countRequest,
  countResponse,
  requestTiming,
} from './reconnect-proxy-metrics.ts'

// 測試factory只允許程式固定loopback與有限數字port，無任意URL／host入口。
export async function createLoopbackProxy(
  options: Readonly<{ listenPort: number; upstreamPort: number }>,
): Promise<ReconnectProxy> {
  if (
    !Number.isInteger(options.listenPort) ||
    options.listenPort < 0 ||
    options.listenPort > 65535 ||
    !Number.isInteger(options.upstreamPort) ||
    options.upstreamPort < 1 ||
    options.upstreamPort > 65535
  ) {
    throw new Error('proxy_invalid_config')
  }
  const sockets = new Map<Socket, Promise<void>>()
  const requests = new Set<ClientRequest>()
  const upgrades = new Set<ClientRequest>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const state = newProxySummary()
  const agent = new LoopbackAgent(options.upstreamPort)
  let closing: Promise<void> | undefined
  let lease: ProxyLease | undefined
  const scopes = new Set<ProxyLease>()
  const headerGuards = new Map<Socket, () => void>()
  const upgradedSockets = new WeakSet<Socket>()
  // Timer由owner追蹤，執行或取消後皆須移除。
  function deadline(ms: number, action: () => void, scope?: ProxyLease): () => void {
    const timer = setTimeout(
      /* 不保留已觸發的timer。 */ () => {
        timers.delete(timer)
        scope?.timers.delete(timer)
        action()
      },
      ms,
    )
    timers.add(timer)
    scope?.timers.add(timer)
    return /* 可重入地清除同一timer。 */ () => {
      clearTimeout(timer)
      timers.delete(timer)
      scope?.timers.delete(timer)
    }
  }
  // Header完成／upgrade或native close時，必須移除最初的絕對期限。
  function clearHeaders(socket: Socket): void {
    headerGuards.get(socket)?.()
    headerGuards.delete(socket)
  }
  // 不依Node每30秒掃描而延後到60秒；絕不把此timer套到已升級WS。
  function guardHeaders(socket: Socket): void {
    clearHeaders(socket)
    if (closing || socket.destroyed || upgradedSockets.has(socket)) return
    headerGuards.set(
      socket,
      deadline(30000, () => {
        headerGuards.delete(socket)
        socket.destroy()
      }),
    )
  }
  // 接受端與上游socket皆等待真正close，不以清空集合冒充釋放。
  function own(socket: Socket, scope?: ProxyLease): Promise<void> {
    const existing = sockets.get(socket)
    if (existing) {
      scope?.track(socket, { done: existing, stop: () => socket.destroy(), kind: 'socket' })
      return existing
    }
    sockets.set(
      socket,
      new Promise<void>(
        /* 只在native close完成resolver。 */ (resolve) => {
          socket.once('close', () => {
            clearHeaders(socket)
            sockets.delete(socket)
            resolve()
          })
        },
      ),
    )
    // 相關request另做固定安全分類，原生例外永不輸出。
    socket.on('error', () => {})
    const done = sockets.get(socket)!
    scope?.track(socket, { done, stop: () => socket.destroy(), kind: 'socket' })
    return done
  }
  const server = createServer(
    { maxHeaderSize: 16384, highWaterMark: 65536 },
    (request, response) => {
      clearHeaders(request.socket)
      // HTTP keepalive可等待下一個header，但WS與已終止socket不再裝timer。
      response.once('finish', () => {
        if (response.shouldKeepAlive) guardHeaders(request.socket)
      })
      if (
        closing ||
        !request.url?.startsWith('/') ||
        request.url.startsWith('//') ||
        !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method ?? '')
      ) {
        response.writeHead(400)
        response.end()
        return
      }
      // TCP數量不足以限制同connection的pipeline，另限同時上游HTTP工作64筆。
      if (requests.size >= 64) {
        response.writeHead(503)
        response.end()
        return
      }
      const scope = lease?.closed ? undefined : lease
      const kind = routeClass(request.method!, request.url, scope)
      const now = performance.now()
      if (scope && !requestTiming(scope.state, kind, now)) {
        response.writeHead(503)
        response.end()
        return
      }
      countRequest(state, kind, now)
      if (scope) countRequest(scope.state, kind, now)
      const outgoing = forward({
        hostname: '127.0.0.1',
        port: options.upstreamPort,
        path: request.url,
        method: request.method,
        headers: request.headers,
        agent,
      })
      own(request.socket, scope)
      requests.add(outgoing)
      const done = new Promise<void>(
        /* request亦有native完成點。 */ (resolve) => outgoing.once('close', () => resolve()),
      )
      scope?.track(outgoing, { done, stop: () => outgoing.destroy(), kind: 'http' })
      const clearGuard = deadline(
        30000,
        /* 原一般HTTPguard不能無限持有資源。 */ () => outgoing.destroy(),
        scope,
      )
      // TCP connect guard不同於上游HTTP／RustDesk期限。
      outgoing.on('socket', (socket) => {
        own(socket, scope)
        const clearConnect = deadline(5000, () => outgoing.destroy(), scope)
        socket.once('connect', clearConnect)
        socket.once('close', clearConnect)
      })
      // 逐欄保留多Set-Cookie，不讀HTTP body。
      outgoing.on('response', (incoming) => {
        countResponse(state, kind, incoming.statusCode!)
        if (scope) countResponse(scope.state, kind, incoming.statusCode!)
        response.writeHead(incoming.statusCode!, incoming.rawHeaders)
        incoming.pipe(response)
        // 回應截斷不能回假成功。
        incoming.on('error', () => response.destroy())
      })
      // 移除資源與timer只由真request close完成。
      outgoing.once('close', () => {
        requests.delete(outgoing)
        clearGuard()
      })
      // 下游取消即作廢未完成上游。
      request.once('aborted', () => outgoing.destroy())
      response.once('close', () => {
        if (!response.writableFinished) outgoing.destroy()
      })
      // 固定分類不附原生exception或request options。
      outgoing.once('error', () => {
        if (!response.headersSent) {
          response.writeHead(503)
          response.end()
        } else response.destroy()
      })
      request.pipe(outgoing)
    },
  )
  server.maxConnections = 64
  server.requestTimeout = 30000
  server.headersTimeout = 30000
  server.on(
    'connection',
    /* 新TCP尚無request／lease歸屬。 */ (socket) => {
      own(socket)
      guardHeaders(socket)
    },
  )
  // 握手使用Node parser取得真101；之後只有opaque pipe，不讀WS message。
  server.on('upgrade', (request, rawClient, clientHead) => {
    const client = rawClient as Socket
    clearHeaders(client)
    upgradedSockets.add(client)
    const scope = lease
    if (
      closing ||
      !scope ||
      scope.closed ||
      request.method !== 'GET' ||
      request.url !== scope.base + '/api/v1/targets/' + scope.target + '/connect' ||
      !scope.reserve()
    ) {
      client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }
    client.pause()
    own(client, scope)
    const outgoing = forward({
      hostname: '127.0.0.1',
      port: options.upstreamPort,
      path: request.url,
      method: 'GET',
      headers: request.headers,
      agent,
    })
    upgrades.add(outgoing)
    const requestDone = new Promise<void>(
      /* detached request也要等native close。 */ (resolve) =>
        outgoing.once('close', () => resolve()),
    )
    scope.track(outgoing, { done: requestDone, stop: () => outgoing.destroy(), kind: 'upgrade' })
    const clearGuard = deadline(
      30000,
      () => {
        outgoing.destroy()
        client.destroy()
      },
      scope,
    )
    // 握手失敗與取消都只收當前pair。
    outgoing.once('error', () => client.destroy())
    outgoing.once('socket', (socket) => {
      own(socket, scope)
      const clearConnect = deadline(
        5000,
        () => {
          outgoing.destroy()
          client.destroy()
        },
        scope,
      )
      socket.once('connect', clearConnect)
      socket.once('close', clearConnect)
    })
    // 刪除pending分類不表示WS已結束，socket仍由owner持有。
    outgoing.once('close', () => {
      upgrades.delete(outgoing)
      clearGuard()
    })
    // 下游取消不得留下pending HTTP或detached upstream。
    client.once('close', () => outgoing.destroy())
    // 原status與raw headers完整轉送，不合成成功。
    function header(response: import('node:http').IncomingMessage): string {
      let value = `HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}\r\n`
      for (let i = 0; i < response.rawHeaders.length; i += 2)
        value += response.rawHeaders[i] + ': ' + response.rawHeaders[i + 1] + '\r\n'
      return value + '\r\n'
    }
    // 非101是backend本來的HTTP拒絕，body亦不讀取。
    outgoing.once('response', (response) => {
      if (scope.closed || client.destroyed) {
        response.destroy()
        return
      }
      // IncomingMessage已移除chunk framing；交Node重新編碼HTTP而非將解碼body裸pipe。
      const rejected = new ServerResponse(request)
      rejected.assignSocket(client)
      rejected.writeHead(response.statusCode!, response.statusMessage, response.rawHeaders)
      response.pipe(rejected)
      // 仍只回固定失敗路徑，不保存body或原生例外。
      rejected.once('error', () => client.destroy())
      response.once('error', () => client.destroy())
    })
    // 只有真101才登記accepted，兩端head各一次後pipe。
    outgoing.once('upgrade', (response, rawUpstream, serverHead) => {
      const upstream = rawUpstream as Socket
      const upstreamDone = own(upstream, scope)
      if (scope.closed || client.destroyed) {
        upstream.destroy()
        return
      }
      clearGuard()
      upgrades.delete(outgoing)
      // 明確cut或native error才兩端destroy，正常FIN交pipe排完資料。
      const stop = (): void => {
        client.destroy()
        upstream.destroy()
      }
      client.once('error', stop)
      upstream.once('error', stop)
      client.once('close', () => upstream.destroy())
      upstream.once('close', () => client.end())
      const pairDone = Promise.all([own(client, scope), upstreamDone]).then(
        /* 只回完成，不回socket。 */ () => undefined,
      )
      scope.accept(stop, pairDone)
      const scopedState = scope.state
      state.accepted++
      state.active++
      void pairDone.then(
        /* owner總量包含跨epoch尚未完成的pair。 */ () => {
          state.active--
        },
      )
      client.write(header(response))
      if (serverHead.length) client.write(serverHead)
      if (clientHead.length) upstream.write(clientHead)
      // 只觀察stream事件與queue長度，不安裝自己的data／frame listener。
      function watch(source: Socket, destination: Socket): void {
        // peek只回計數，不複製stream內容。
        const sample = (): void => {
          for (const stats of [state, scopedState]) {
            stats.peakReadable = Math.max(stats.peakReadable, source.readableLength)
            stats.peakWritable = Math.max(stats.peakWritable, destination.writableLength)
          }
        }
        // 只有writer真需要drain才算背壓，不計初始手動pause或正常unpipe。
        const paused = (): void => {
          sample()
          if (destination.writableNeedDrain) {
            state.pauses++
            scopedState.pauses++
          }
        }
        // 真drain後才可讓pipe繼續，不以timer當恢復。
        const drained = (): void => {
          sample()
          state.drains++
          scopedState.drains++
        }
        source.on('pause', paused)
        destination.on('drain', drained)
        // 關閉後移除本pair的觀測closure。
        source.once('close', () => {
          source.off('pause', paused)
          destination.off('drain', drained)
        })
      }
      watch(client, upstream)
      watch(upstream, client)
      client.pipe(upstream)
      upstream.pipe(client)
    })
    outgoing.end()
  })
  // CONNECT一律拒絕，不建立任意tunnel。
  server.on('connect', (_request, socket) =>
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'),
  )
  // parser錯誤不回原始request或native訊息。
  server.on('clientError', (_error, socket) => socket.destroy())
  await new Promise<void>(
    /* 綁定失敗不能關閉占用者。 */ (resolve, reject) => {
      server.once('error', () => reject(new Error('proxy_bind_failed')))
      server.listen(options.listenPort, '127.0.0.1', resolve)
    },
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('proxy_bind_failed')
  return {
    port: address.port,
    // 單一active lease且固定UUID，closed epoch不能復活。
    beginCase: (base, target) => {
      if (closing) throw new Error('proxy_closed')
      if (lease && !lease.closed) throw new Error('proxy_capacity')
      if (
        !['', '/rdweb', '/a/b/c'].includes(base) ||
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(target)
      )
        throw new Error('proxy_invalid_config')
      for (const previous of scopes) {
        if (
          previous.closed &&
          previous.resources.size === 0 &&
          previous.summary().waiters === 0 &&
          previous.timers.size === 0
        )
          scopes.delete(previous)
      }
      lease = new ProxyLease(base, target)
      scopes.add(lease)
      const active = lease
      // Public control只含closure methods，inspect亦不能展開ClientRequest／headers。
      return Object.freeze({
        nextAccepted: /* 不暴露內部class或queue。 */ (signal: AbortSignal) =>
          active.nextAccepted(signal),
        interrupt: /* identity驗證仍由同scope執行。 */ (handle: TunnelHandle) =>
          active.interrupt(handle),
        summary: /* Scalar copy不保留原生資源。 */ () => active.summary(),
        close: /* 舊closure只能關舊epoch。 */ () => active.close(),
      })
    },
    // 深層copy不讓呼叫端修改owner；socket與timer只回實際計數。
    summary: () =>
      structuredClone({
        ...state,
        attempts: lease?.summary().attempts ?? [],
        sockets: sockets.size,
        http: requests.size,
        upgrades: upgrades.size,
        waiters: [...scopes].reduce(
          /* 不能讓worker摘要把真waiter誤報0。 */ (count, scope) => count + scope.summary().waiters,
          0,
        ),
        timers: new Set([
          ...timers,
          ...[...scopes].flatMap(/* timer跨owner／lease只計一次。 */ (scope) => [...scope.timers]),
        ]).size,
        closed: !!closing,
      }),
    // 成功等待listener與所有自有socket真正結束。
    close: () => {
      if (!closing) {
        closing = new Promise<void>((resolve, reject) => {
          const cancel = deadline(5000, () => reject(new Error('proxy_cleanup_timeout')))
          const stopped = new Promise<void>(
            /* Node listener終止亦須等待。 */ (done) => server.close(() => done()),
          )
          for (const outgoing of requests) outgoing.destroy()
          for (const outgoing of upgrades) outgoing.destroy()
          for (const socket of sockets.keys()) socket.destroy()
          agent.destroy()
          void Promise.all([
            stopped,
            ...[...scopes].map(/* 全部尚未釋放epoch都必須結束。 */ (scope) => scope.close()),
            ...sockets.values(),
          ]).then(
            /* 真close後才完成清理。 */ () => {
              cancel()
              resolve()
            },
            /* 不傳遞原生物件。 */ () => {
              cancel()
              reject(new Error('proxy_cleanup_timeout'))
            },
          )
        })
      }
      return closing
    },
  }
}

// 正式測試入口不讀任意目的地或外部URL設定。
export function startReconnectProxy(): Promise<ReconnectProxy> {
  return createLoopbackProxy({ listenPort: 18080, upstreamPort: 18081 })
}
