import { ProtocolWorkerSession, type SocketPort } from './worker-session'
import { createNativeDecoder } from './decoder'
import type { VideoMainEvent, VideoWorkerEvent } from './video-types'
import { interactionClock } from './interaction-limits'
import type { EncodedInputObserver } from './encoded-input-observer'
import type { IncomingClipboardObserver } from './incoming-clipboard-observer'

const scope = self as unknown as {
  postMessage(value: VideoWorkerEvent, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<VideoMainEvent>) => void) | null
  __rdwebEncodedInputObserver?: EncodedInputObserver
  __rdwebIncomingClipboardObserver?: IncomingClipboardObserver
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
    // 測試可在原Worker啟動後安裝；未啟用僅讀可選接點，不解碼或建port。
    encodedInputObserver: () => scope.__rdwebEncodedInputObserver,
    // 原Worker可晚安裝；正式沒有collector，缺接點不額外讀clipboard payload。
    incomingClipboardObserver: () => scope.__rdwebIncomingClipboardObserver,
    // 公開probe及nativeoutput都必須是真VideoFrame。
    isFrame: (value): value is VideoFrame =>
      typeof VideoFrame !== 'undefined' && value instanceof VideoFrame,
  },
)
// 薄入口只接typed控制，operation與資源邏輯由session處理。
scope.onmessage = (event): void => session.handle(event.data)
