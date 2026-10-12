import { ProtocolWorkerSession, type SocketPort } from './worker-session'
import { createNativeDecoder } from './decoder'
import type { VideoMainEvent, VideoWorkerEvent } from './video-types'
import { interactionClock } from './interaction-limits'

const scope = self as unknown as {
  postMessage(value: VideoWorkerEvent, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<VideoMainEvent>) => void) | null
}
const now = interactionClock()
const session = new ProtocolWorkerSession(
  // Native轉移始終同源，不記錄payload或key。
  (value, transfer) => scope.postMessage(value, transfer),
  {
    // 真Worker能力由原生API判定。
    query: (config) => VideoDecoder.isConfigSupported(config),
    factory: createNativeDecoder,
    // 保存endpoint只能由backend選，browser只連站內bridge。
    socket: (url, protocols) => new WebSocket(url, protocols) as unknown as SocketPort,
    // 防背景／休眠恢復後舊期限被忽略，wall回撥則以monotonic為準。
    now,
    // 公開probe及nativeoutput都必須是真VideoFrame。
    isFrame: (value): value is VideoFrame =>
      typeof VideoFrame !== 'undefined' && value instanceof VideoFrame,
  },
)
// 薄入口只接typed控制，operation與資源邏輯由session處理。
scope.onmessage = (event): void => session.handle(event.data)
