import type { FrameResource, FrameTag, Presented } from './video-types'
export class PresentationGate {
  #generation = 0
  #sequence = 0
  #closed = false
  #inflight: (FrameTag & { sentAt: number }) | null = null
  #latest: { frame: FrameResource; generation: number } | null = null
  // 只管ownership與credit，不處理DOM或secretbox。
  constructor(
    private readonly revision: number,
    private readonly now: () => number,
    private readonly send: (frame: FrameResource, tag: FrameTag) => void,
    private readonly failed: (code: string) => void,
  ) {}
  // 一個operation至多一張在途，generation切換不會增加credit。
  get hasCredit(): boolean {
    return !this.#closed && !this.#inflight
  }
  // 先作廢pending，保留原inflight tag供舊generation正確釋放。
  reset(generation: number): void {
    this.#generation = generation
    this.#latest?.frame.close()
    this.#latest = null
  }
  // 舊output立即close，最新pending取代時亦立即close。
  offer(frame: FrameResource, generation: number): void {
    if (this.#closed || generation !== this.#generation) {
      frame.close()
      return
    }
    this.#latest?.frame.close()
    this.#latest = { frame, generation }
    this.drain()
  }
  // 只有精確tag還credit，active generation／drawn由上層判斷。
  presented(value: Presented): boolean {
    const tag = this.#inflight
    if (
      !tag ||
      value.revision !== tag.revision ||
      value.generation !== tag.generation ||
      value.frame_id !== tag.frame_id
    )
      return false
    this.#inflight = null
    return true
  }
  // 明確drain讓caller可先送ACK，再移交最新一張。
  drain(): void {
    if (!this.hasCredit || !this.#latest) return
    const value = this.#latest
    this.#latest = null
    const tag = {
      revision: this.revision,
      generation: value.generation,
      frame_id: ++this.#sequence,
    }
    try {
      this.send(value.frame, tag)
      this.#inflight = { ...tag, sentAt: this.now() }
    } catch {
      value.frame.close()
      this.failed('video_decode_failed')
      this.dispose()
    }
  }
  // 單張在途有自己的30秒deadline，不由後續output延長。
  tick(): void {
    if (this.#inflight && this.now() - this.#inflight.sentAt >= 30000) {
      this.failed('video_timeout')
      this.dispose()
    }
  }
  // Main負責close已移交frame，這裡只能清Worker尚持有的latest。
  dispose(): void {
    this.#closed = true
    this.#latest?.frame.close()
    this.#latest = null
    this.#inflight = null
  }
}
