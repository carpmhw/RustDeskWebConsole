import type { DisplayGeometry, FrameTag, Presented, RenderPort, Zoom } from './video-types'
import { checkDisplay } from './video-limits'
// 純本機比例，不改Canvas pixel或遠端解析度。
export function imageScale(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
  zoom: Zoom,
): number {
  if (
    ![width, height, availableWidth, availableHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error('protocol_error')
  if (zoom === 'fit') return Math.min(availableWidth / width, availableHeight / height)
  if (zoom === 'original') return 1
  if (![0.5, 1, 1.5, 2].includes(zoom)) throw new Error('protocol_error')
  return zoom
}
export class CanvasRenderer implements RenderPort {
  #revision = 0
  #generation = 0
  #closed = false
  #pending: { frame: VideoFrame; tag: FrameTag } | null = null
  #raf: number | null = null
  #context: CanvasRenderingContext2D
  #timer: ReturnType<typeof setInterval>
  #draws = 0
  #fpsAt = performance.now()
  // Main唯一frame owner，context／排程可注入單元測試。
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ack: (value: Presented) => void,
    private readonly fail: (code: string) => void,
    private readonly schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
    private readonly cancel: (id: number) => void = cancelAnimationFrame,
    private readonly fps: (value: number) => void = () => {},
  ) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('video_unsupported')
    this.#context = context
    // 僅成功draw計數，不能把nativeoutput或WSreceived當FPS。
    this.#timer = setInterval(() => {
      const now = performance.now(),
        elapsed = now - this.#fpsAt
      this.fps(Math.round((this.#draws * 10000) / Math.max(elapsed, 1)) / 10)
      this.#draws = 0
      this.#fpsAt = now
    }, 1000)
  }
  // 新generation清舊Canvas與pending；旧tag只能回drawn=false。
  setFormat(revision: number, generation: number, value: DisplayGeometry): void {
    if (this.#closed) return
    checkDisplay(value)
    if (revision === this.#revision && generation === this.#generation) return
    this.drop()
    this.#revision = revision
    this.#generation = generation
    this.#draws = 0
    this.#fpsAt = performance.now()
    this.#context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.canvas.width = value.width
    this.canvas.height = value.height
  }
  // 只有一張在途，錯誤／過期影格先釋放而非留在Vue。
  accept(frame: VideoFrame, tag: FrameTag): void {
    const safeTag = { revision: tag.revision, generation: tag.generation, frame_id: tag.frame_id }
    if (this.#closed || tag.revision !== this.#revision || tag.generation !== this.#generation) {
      frame.close()
      this.ack({ ...safeTag, drawn: false })
      return
    }
    if (this.#pending) {
      frame.close()
      this.fail('video_backpressure')
      return
    }
    this.#pending = { frame, tag: safeTag }
    // RAF執行前也再次驗generation與ownership。
    const schedule = this.schedule
    this.#raf = schedule(() => this.render())
  }
  // 真draw才presented，finally close後再回credit，任何例外固定分類。
  private render(): void {
    this.#raf = null
    const value = this.#pending
    this.#pending = null
    if (!value) return
    let drawn = false
    try {
      if (
        !this.#closed &&
        value.tag.revision === this.#revision &&
        value.tag.generation === this.#generation
      ) {
        checkDisplay({ display: 0, width: value.frame.codedWidth, height: value.frame.codedHeight })
        checkDisplay({
          display: 0,
          width: value.frame.displayWidth,
          height: value.frame.displayHeight,
        })
        if (this.canvas.width !== value.frame.displayWidth)
          this.canvas.width = value.frame.displayWidth
        if (this.canvas.height !== value.frame.displayHeight)
          this.canvas.height = value.frame.displayHeight
        this.#context.drawImage(value.frame, 0, 0, this.canvas.width, this.canvas.height)
        this.#draws++
        drawn = true
      }
    } catch {
      this.fail('video_decode_failed')
    } finally {
      value.frame.close()
      this.ack({ ...value.tag, drawn })
    }
  }
  // 取消RAF與Main尚持有的frame，仍有效tag回drawn=false。
  private drop(): void {
    if (this.#raf !== null) {
      const cancel = this.cancel
      cancel(this.#raf)
    }
    this.#raf = null
    const value = this.#pending
    this.#pending = null
    if (value) {
      value.frame.close()
      this.ack({ ...value.tag, drawn: false })
    }
  }
  // 收尾冪等，清圖而非保留最後遠端桌面。
  dispose(): void {
    if (this.#closed) return
    this.#closed = true
    this.drop()
    clearInterval(this.#timer)
    this.#context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.#draws = 0
  }
}
