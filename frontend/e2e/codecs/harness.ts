import { CanvasRenderer } from '../../src/rdweb/renderer'
import type { FrameTag, Presented } from '../../src/rdweb/video-types'
const worker = new Worker(new URL('./harness.worker.ts', import.meta.url), { type: 'module' })
const canvas = document.querySelector<HTMLCanvasElement>('#video')!
const codec = new URL(location.href).searchParams.get('codec')!
let frames = 0,
  valid = true,
  changed = false,
  previous: number | null = null,
  done = false
let probeReturned = false
const deadline = setTimeout(
  () => result({ outcome: 'error', frames, code: 'video_timeout' }),
  15000,
)
// 只在獨立publichtml放安全結果，任何pixels/hash都不回傳report。
function result(value: object): void {
  if (done) return
  done = true
  clearTimeout(deadline)
  ;(window as unknown as { __codecResult: object }).__codecResult = { ...value, done: true }
  renderer.dispose()
  worker.postMessage({ type: 'dispose' })
  worker.terminate()
}
const renderer = new CanvasRenderer(
  canvas,
  // 真draw與close後才以native影像檢查pixel；資料只留此短命closure。
  (value: Presented) => {
    if (value.drawn) {
      frames++
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let checksum = 2166136261
      const colors = new Set<number>()
      for (let index = 0; index < pixels.length; index += 4) {
        const rgb = pixels[index]! * 65536 + pixels[index + 1]! * 256 + pixels[index + 2]!
        if (colors.size < 8) colors.add(rgb)
        checksum = Math.imul(checksum ^ rgb, 16777619) >>> 0
      }
      valid = valid && colors.size >= 4
      if (previous !== null && previous !== checksum) changed = true
      previous = checksum
    }
    worker.postMessage({ type: 'presented', ...value })
    if (frames === 2)
      result({
        outcome: 'decoded',
        frames,
        width: canvas.width,
        height: canvas.height,
        pixelsValid: valid,
        changed,
        probeReturned,
        code: '',
      })
  },
  // Native/Canvas故障不能改稱unsupported。
  (code) => result({ outcome: 'error', frames, code }),
)
// Real transfer及generation共享正式renderer，不用ImageDecoder替代video。
worker.onmessage = (event): void => {
  const value = event.data
  if (done) {
    if (value.type === 'frame' || value.type === 'probe') value.frame.close()
    return
  }
  if (value.type === 'probe') {
    probeReturned = value.frame instanceof VideoFrame
    value.frame.close()
    return
  }
  if (value.type === 'result') result(value)
  else if (value.type === 'format')
    renderer.setFormat(value.revision, value.generation, value.display)
  else if (value.type === 'frame') renderer.accept(value.frame as VideoFrame, value as FrameTag)
}
// 專用harness沒有ticket或JWT，URL只有公開codec selector。
// 公開1×1frame往返同源bundled Worker，不複製先前遠端Canvas。
const blank = document.createElement('canvas')
blank.width = 1
blank.height = 1
const probe = new VideoFrame(blank, { timestamp: 0 })
worker.postMessage({ codec, probe }, [probe])
// Worker例外只送固定分類，不能記錄URL或原生訊息。
worker.onerror = () => result({ outcome: 'error', frames, code: 'video_decode_failed' })
