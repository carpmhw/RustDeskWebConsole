import { buildWsUrl } from '../utils/basePath'
import { frame, WireFramer } from './framing'
import { LoginProtocol } from './protocol'
import { parseReady, type MainEvent, type WorkerEvent, type Phase } from './types'

const scope = self as unknown as {
  postMessage: (value: WorkerEvent) => void
  onmessage: ((event: MessageEvent<MainEvent>) => void) | null
}
let revision = 0
let socket: WebSocket | null = null
let protocol: LoginProtocol | null = null
let framer: WireFramer | null = null
let transport: 'tcp' | 'ws' = 'tcp'
let timer: ReturnType<typeof setTimeout> | null = null
let proofResolver: ((proof: Uint8Array) => void) | null = null
let proofReject: (() => void) | null = null
let closed = true

// Worker只傳安全phase與固定控制，不輸出票證、keys或raw payload。
function phase(value: Phase): void {
  scope.postMessage({ type: 'phase', revision, phase: value })
}
// 銷毀crypto/frame/listeners後才回disposed，main可fallback terminate。
function dispose(): void {
  if (closed) return
  closed = true
  protocol?.dispose()
  protocol = null
  framer?.clear()
  framer = null
  if (timer) clearTimeout(timer)
  timer = null
  proofReject?.()
  proofReject = null
  proofResolver = null
  if (socket) {
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    socket.close()
    socket = null
  }
  scope.postMessage({ type: 'disposed', revision })
}
// 任何錯誤先清RAM，只回固定分类。
function fail(code: string): void {
  if (!closed) {
    scope.postMessage({ type: 'failure', revision, code })
    dispose()
  }
}
// Main失敗／取消後不接受舊proof，尚未用的bytes立即清除。
scope.onmessage = (event): void => {
  const data = event.data
  if (data.type === 'start') {
    dispose()
    revision = data.revision
    closed = false
    phase('connecting')
    try {
      socket = new WebSocket(
        buildWsUrl(`api/v1/targets/${data.target}/connect`, data.origin, data.base),
        ['rdweb.v1', 'rdweb.ticket.' + data.ticket],
      )
      data.ticket = ''
      socket.binaryType = 'arraybuffer'
      timer = setTimeout(() => fail('connection_timeout'), 30000)
      // 消息處理同步，framing單次最多16包，不建立未限長promise queue。
      socket.onmessage = (message): void => {
        if (closed) return
        try {
          if (typeof message.data === 'string') {
            if (message.data.length > 4096 || protocol) throw new Error()
            const raw: unknown = JSON.parse(message.data)
            const ready = parseReady(raw, data.target, data.peer)
            transport = ready.transport
            framer = new WireFramer(transport)
            if (timer) clearTimeout(timer)
            timer = null
            protocol = new LoginProtocol(ready, {
              phase,
              // 每次send檢查browser queue，secretbox由engine同步編序。
              send: (bytes) => {
                if (
                  !socket ||
                  socket.readyState !== WebSocket.OPEN ||
                  socket.bufferedAmount > 1048576
                )
                  throw new Error()
                socket.send(frame(bytes, transport))
              },
              // JWT不交Worker，僅要求main代呼當次RPC。
              assist: (connection, salt, challenge) =>
                new Promise<Uint8Array>((resolve, reject) => {
                  if (proofResolver) {
                    reject(new Error('protocol_error'))
                    return
                  }
                  proofResolver = resolve
                  proofReject = () => reject(new Error('cancelled'))
                  scope.postMessage({ type: 'assist', revision, connection, salt, challenge })
                }),
              // 真PeerInfo到達即結束B1連線，不收集影像。
              verified: (summary) => {
                scope.postMessage({ type: 'verified', revision, summary })
                dispose()
              },
              failure: fail,
            })
          } else {
            if (!protocol || !framer || !(message.data instanceof ArrayBuffer)) throw new Error()
            for (const bytes of framer.push(new Uint8Array(message.data))) {
              if (closed) break
              protocol.receive(bytes)
            }
          }
        } catch {
          fail('protocol_error')
        }
      }
      // 錯誤事件不將瀏覽器URL/header帶進診斷。
      socket.onerror = () => fail('connection_failed')
      // 遠端未verified而斷線必須失敗。
      socket.onclose = () => fail('connection_failed')
      phase('awaiting_ready')
    } catch {
      fail('connection_failed')
    }
  } else if (data.type === 'assist-result') {
    if (closed || data.revision !== revision || !proofResolver) {
      data.proof.fill(0)
      return
    }
    const resolve = proofResolver
    proofResolver = null
    proofReject = null
    resolve(data.proof)
  } else if (data.revision === revision) {
    if (data.type === 'assist-failed') fail('login_assist_failed')
    else dispose()
  }
}
