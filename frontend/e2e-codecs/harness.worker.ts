import samples from '../src/rdweb/__fixtures__/codec-samples.json'
import { probeCodecs } from '../src/rdweb/capabilities'
import { MediaDecoder } from '../src/rdweb/media-decoder'
import { ptsMicros } from '../src/rdweb/video-limits'
import type { CodecFamily, Presented, VideoPacket } from '../src/rdweb/video-types'

let engine: MediaDecoder | null = null
let timer: ReturnType<typeof setInterval> | null = null
let closed = false
const diagnostic = { configured: 0, submitted: 0, output: 0, transferred: 0, presented: 0 }
// Public錯誤只回固定分類與native判斷，不能把任何例外當unsupported。
function fail(code: string): void {
  if (closed) return
  const unsupported = ['video_unsupported', 'codec_unsupported'].includes(code)
  self.postMessage({
    type: 'result',
    done: true,
    outcome: unsupported ? 'unsupported' : 'error',
    frames: 0,
    code,
    diagnostic,
  })
  dispose()
}
// 關閉原生decoder與pipeline，Main仍釋放自己持有的frame。
function dispose(): void {
  closed = true
  engine?.dispose()
  engine = null
  if (timer) clearInterval(timer)
  timer = null
}
// Fixture只使用真Native API；兩筆全部提交後flush一次以驗test資源回收。
self.onmessage = async (event): Promise<void> => {
  if (event.data.type === 'presented') {
    diagnostic.presented++
    engine?.presented(event.data as Presented)
    return
  }
  if (event.data.type === 'dispose') {
    dispose()
    return
  }
  if (engine || closed) return
  const codec = event.data.codec as CodecFamily
  try {
    const probe: unknown = event.data.probe
    if (!(probe instanceof VideoFrame)) {
      fail('video_unsupported')
      return
    }
    self.postMessage({ type: 'probe', frame: probe }, { transfer: [probe] })
    const caps = await probeCodecs((config) => VideoDecoder.isConfigSupported(config))
    if (closed) return
    const sample = samples.find((value) => value.codec === codec)
    if (!sample) {
      fail('protocol_error')
      return
    }
    if (!caps.profiles[codec]?.length) {
      fail('codec_unsupported')
      return
    }
    engine = new MediaDecoder(
      caps,
      {
        revision: 1,
        // Worker只能transfer真正VideoFrame，不返回pixel array或encodedbytes。
        frame: (value, tag) => {
          if (!(value instanceof VideoFrame)) throw new Error()
          diagnostic.transferred++
          self.postMessage({ type: 'frame', ...tag, frame: value }, { transfer: [value] })
        },
        // Main採同一generation／credit模型，不靠fakeoutput。
        format: (generation, display) =>
          self.postMessage({ type: 'format', revision: 1, generation, display }),
        // Publicfixture不是peer成功，Main真draw另記證據。
        phase: () => {},
        // Fixture已有完整key，不連remote來刷新。
        refresh: () => fail('protocol_error'),
        // Fixture沒有remote ACK通道，gate/limits照正式pipeline。
        ack: () => {},
        failure: fail,
        // 安全統計不作native成功oracle。
        stats: () => {},
      },
      (config) => VideoDecoder.isConfigSupported(config),
      // 此adapter直接使用真VideoDecoder，test-only末尾flush不是runtime行為。
      (callbacks) => {
        let submitted = 0
        const decoder = new VideoDecoder({
          output: (frame) => {
            diagnostic.output++
            callbacks.output(frame)
          },
          error: () => callbacks.error(),
        })
        const dequeue = (): void => callbacks.dequeue()
        decoder.addEventListener('dequeue', dequeue)
        return {
          get decodeQueueSize() {
            return decoder.decodeQueueSize
          },
          configure: (config) => {
            diagnostic.configured++
            decoder.configure(config)
          },
          decode: (input) => {
            decoder.decode(
              new EncodedVideoChunk({
                type: input.key ? 'key' : 'delta',
                timestamp: ptsMicros(input.pts),
                data: input.data,
              }),
            )
            diagnostic.submitted++
            if (++submitted === sample.frames.length)
              void decoder.flush().catch(() => fail('video_decode_failed'))
          },
          close: () => {
            decoder.removeEventListener('dequeue', dequeue)
            if (decoder.state !== 'closed') decoder.close()
          },
        }
      },
      () => performance.now(),
    )
    engine.updateDisplay({ display: 0, width: sample.width, height: sample.height })
    const packet: VideoPacket = {
      display: 0,
      codec,
      // Fixed資料解成privateownedbytes，後續Main只收到nativeframe。
      frames: sample.frames.map((input) => ({
        codec,
        key: input.key,
        pts: input.pts,
        data: Uint8Array.from(atob(input.data), (c) => c.charCodeAt(0)),
      })),
    }
    engine.receive(packet)
    for (const input of packet.frames) input.data.fill(0)
    timer = setInterval(() => engine?.tick(), 250)
  } catch {
    fail('video_decode_failed')
  }
}
