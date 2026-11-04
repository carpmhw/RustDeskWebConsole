import { expect, it, vi } from 'vitest'
import { CanvasRenderer, imageScale } from './renderer'
// 本機比例不改遠端pixel幾何，fit保持比例。
it('calculates fit and fixed zoom without changing image geometry', () => {
  expect(imageScale(1280, 720, 640, 500, 'fit')).toBe(0.5)
  expect(imageScale(1280, 720, 640, 500, 'original')).toBe(1)
  expect(imageScale(1280, 720, 640, 500, 1.5)).toBe(1.5)
})
// Main每draw一張finally close並精確ack，不依賴mockDOM套件。
it('closes a rendered frame and clears ownership on disposal', () => {
  let render!: FrameRequestCallback
  const context = { drawImage: vi.fn(), clearRect: vi.fn() }
  const canvas = {
    width: 320,
    height: 240,
    getContext: () => context,
  } as unknown as HTMLCanvasElement
  const ack = vi.fn(),
    fail = vi.fn(),
    cancel = vi.fn()
  const schedule = vi.fn((callback: FrameRequestCallback) => {
    render = callback
    return 1
  })
  const renderer = new CanvasRenderer(canvas, ack, fail, schedule, cancel)
  renderer.setFormat(2, 1, { display: 0, width: 320, height: 240 })
  const frame = {
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  }
  renderer.accept(frame as unknown as VideoFrame, { revision: 2, generation: 1, frame_id: 1 })
  expect(ack).not.toHaveBeenCalled()
  expect(schedule).toHaveBeenCalledOnce()
  render(0)
  expect(frame.close).toHaveBeenCalledOnce()
  expect(ack).toHaveBeenCalledWith({ revision: 2, generation: 1, frame_id: 1, drawn: true })
  renderer.dispose()
  renderer.dispose()
  expect(context.clearRect).toHaveBeenCalled()
  expect(fail).not.toHaveBeenCalled()
})

// 新format或離頁釋放未draw影格，不讓晚RAF更新已清空畫面。
it('releases a pending old generation without claiming a draw', () => {
  const context = { drawImage: vi.fn(), clearRect: vi.fn() }
  const canvas = {
    width: 320,
    height: 240,
    getContext: () => context,
  } as unknown as HTMLCanvasElement
  const ack = vi.fn(),
    cancel = vi.fn()
  const renderer = new CanvasRenderer(canvas, ack, vi.fn(), () => 1, cancel)
  renderer.setFormat(1, 1, { display: 0, width: 320, height: 240 })
  const frame = {
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  }
  renderer.accept(frame as unknown as VideoFrame, { revision: 1, generation: 1, frame_id: 1 })
  renderer.setFormat(1, 2, { display: 0, width: 320, height: 240 })
  expect(frame.close).toHaveBeenCalledOnce()
  expect(ack).toHaveBeenCalledWith({ revision: 1, generation: 1, frame_id: 1, drawn: false })
  expect(cancel).toHaveBeenCalledWith(1)
  expect(context.drawImage).not.toHaveBeenCalled()
  renderer.dispose()
})

// Native Window方法不能綁成renderer的this，否則browser會Illegal invocation。
it('does not bind the frame scheduler to the renderer instance', () => {
  const context = { drawImage: vi.fn(), clearRect: vi.fn() }
  const canvas = {
    width: 320,
    height: 240,
    getContext: () => context,
  } as unknown as HTMLCanvasElement
  // 以spy的呼叫接收者驗證native receiver限制，不mock解碼成功。
  const schedule = vi.fn(() => 1)
  const renderer = new CanvasRenderer(canvas, vi.fn(), vi.fn(), schedule, vi.fn())
  renderer.setFormat(1, 1, { display: 0, width: 320, height: 240 })
  const frame = {
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  }
  renderer.accept(frame as unknown as VideoFrame, { revision: 1, generation: 1, frame_id: 1 })
  expect(schedule.mock.contexts).toEqual([undefined])
  renderer.dispose()
})
// Worker message含frame欄位，但presented只可回primitive tag，closed frame不可clone。
it('does not echo transferred resource fields in presentation acknowledgements', () => {
  let draw!: FrameRequestCallback
  const context = { drawImage: vi.fn(), clearRect: vi.fn() }
  const canvas = {
    width: 320,
    height: 240,
    getContext: () => context,
  } as unknown as HTMLCanvasElement
  const ack = vi.fn()
  const renderer = new CanvasRenderer(
    canvas,
    ack,
    vi.fn(),
    (callback) => {
      draw = callback
      return 1
    },
    vi.fn(),
  )
  renderer.setFormat(1, 1, { display: 0, width: 320, height: 240 })
  const frame = {
    codedWidth: 320,
    codedHeight: 240,
    displayWidth: 320,
    displayHeight: 240,
    close: vi.fn(),
  }
  const message = { revision: 1, generation: 1, frame_id: 1, frame }
  renderer.accept(frame as unknown as VideoFrame, message)
  draw(0)
  expect(Object.keys(ack.mock.calls[0]![0]).sort()).toEqual([
    'drawn',
    'frame_id',
    'generation',
    'revision',
  ])
  renderer.dispose()
})
