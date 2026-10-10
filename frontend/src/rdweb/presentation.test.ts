import { expect, it, vi } from 'vitest'
import { PresentationGate } from './presentation'
import type { FrameTag } from './video-types'
// 公開幾何與close spy，不模拟真实peer或把fake當native證據。
function frame() {
  return {
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  }
}
// 一張在途與最新pending，重複回覆不能增加第二個credit。
it('retains one in-flight and one latest frame with exact credit', () => {
  let now = 0
  const sent: FrameTag[] = []
  const failed = vi.fn()
  const gate = new PresentationGate(
    2,
    () => now,
    (_frame, tag) => sent.push(tag),
    failed,
  )
  gate.reset(1)
  const first = frame(),
    second = frame(),
    latest = frame()
  gate.offer(first, 1)
  gate.offer(second, 1)
  gate.offer(latest, 1)
  expect(sent).toHaveLength(1)
  expect(second.close).toHaveBeenCalledOnce()
  expect(gate.presented({ ...sent[0]!, drawn: true })).toBe(true)
  expect(gate.presented({ ...sent[0]!, drawn: true })).toBe(false)
  gate.drain()
  expect(sent).toHaveLength(2)
  now = 30000
  gate.tick()
  expect(failed).toHaveBeenCalledWith('video_timeout')
  gate.dispose()
})
// Generation重設不能製造額外credit；晚output先close，舊ack可釋放原tag。
it('keeps old-generation in-flight credit and closes late output', () => {
  const sent: FrameTag[] = []
  const gate = new PresentationGate(
    1,
    () => 0,
    (_frame, tag) => sent.push(tag),
    vi.fn(),
  )
  gate.reset(1)
  gate.offer(frame(), 1)
  gate.reset(2)
  const late = frame(),
    current = frame()
  gate.offer(late, 1)
  gate.offer(current, 2)
  expect(late.close).toHaveBeenCalledOnce()
  expect(sent).toHaveLength(1)
  expect(gate.presented({ ...sent[0]!, drawn: false })).toBe(true)
  gate.drain()
  expect(sent[1]!.generation).toBe(2)
  gate.dispose()
  gate.dispose()
})
