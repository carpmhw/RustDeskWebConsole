import { afterEach, expect, it, vi } from 'vitest'
import { InputController } from './input-controller'
import { InputChannel } from './input-channel'
import type { InputState } from './interaction-types'
const state: InputState = {
  revision: 1,
  input_generation: 1,
  display: { display: 0, width: 320, height: 240 },
  platform: 'linux',
  sas: false,
  ready: true,
  keyboard: true,
  clipboard: true,
}
// 用原生 EventTarget 與最小 rect／focus ports，不新增 DOM framework。
function fixture() {
  const doc = Object.assign(new EventTarget(), {
    activeElement: null as EventTarget | null,
    visibilityState: 'visible',
  })
  const win = new EventTarget()
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', win)
  class Surface extends EventTarget {
    value = ''
    style = { left: '', top: '' }
    rect = { left: 20, top: 30, width: 160, height: 120 }
    captures = new Set<number>()
    offsetLeft = 0
    offsetTop = 0
    // 假 focus port 僅驗 controller，不能冒充原生 browser behavior。
    focus(): void {
      doc.activeElement = this
    }
    // 失焦同步派發 scope 事件。
    blur(): void {
      if (doc.activeElement === this) {
        doc.activeElement = null
        this.dispatchEvent(new Event('blur'))
      }
    }
    // 回傳可控縮放及 scroll 結果。
    getBoundingClientRect() {
      return this.rect
    }
    // 模擬已取得 pointer capture 的 ownership。
    setPointerCapture(id: number): void {
      this.captures.add(id)
    }
    // 只檢查此 surface 的 capture。
    hasPointerCapture(id: number): boolean {
      return this.captures.has(id)
    }
    // 正常 up 派發 lostcapture，與取消路徑分開。
    releasePointerCapture(id: number): void {
      this.captures.delete(id)
      this.dispatchEvent(new Event('lostpointercapture'))
    }
  }
  const canvas = new Surface(),
    ime = new Surface(),
    release = vi.fn(),
    issue = vi.fn()
  const fail = vi.fn()
  const channel = new InputChannel(vi.fn(), release, fail, /* 可控port clock。 */ () => 0)
  const enqueue = vi.spyOn(channel, 'enqueue')
  const controller = new InputController(
    canvas as unknown as HTMLCanvasElement,
    ime as unknown as HTMLTextAreaElement,
    channel,
    issue,
  )
  controller.setState(state)
  controller.bind()
  return { doc, win, canvas, ime, channel, controller, enqueue, release, issue, fail }
}
// 每案復原宿主 globals，避免 scope 跨測試洩漏。
afterEach(() => vi.unstubAllGlobals())
// 合成安全事件資料，測試 listener 的精確作用域。
function dispatch(target: EventTarget, type: string, patch: Record<string, unknown> = {}): Event {
  const e = new Event(type, { cancelable: true })
  Object.assign(e, {
    pointerId: 1,
    clientX: 100,
    clientY: 90,
    button: 0,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...patch,
  })
  target.dispatchEvent(e)
  return e
}
// 點畫面才啟用，CSS fit／scroll 只換算 local 點，不含 private 原點。
it('acquires focus only from the canvas and scales captured pointer coordinates', () => {
  const f = fixture()
  dispatch(f.canvas, 'pointermove')
  expect(f.enqueue).not.toHaveBeenCalled()
  dispatch(f.canvas, 'pointerdown')
  expect(f.controller.focused).toBe(true)
  expect(f.enqueue).toHaveBeenLastCalledWith({
    kind: 'button',
    x: 160,
    y: 120,
    button: 'left',
    down: true,
    modifiers: [],
  })
  dispatch(f.canvas, 'pointermove', { clientX: 1000, clientY: -100 })
  expect(f.enqueue).toHaveBeenLastCalledWith({ kind: 'move', x: 319, y: 0 })
  dispatch(f.canvas, 'pointerup', { clientX: 1000, clientY: -100 })
  expect(f.enqueue).toHaveBeenLastCalledWith({
    kind: 'button',
    x: 319,
    y: 0,
    button: 'left',
    down: false,
    modifiers: [],
  })
  expect(f.controller.focused).toBe(true)
  expect(f.release).not.toHaveBeenCalled()
  f.canvas.rect = { left: -100, top: -50, width: 640, height: 480 }
  dispatch(f.canvas, 'pointermove', { clientX: 60, clientY: 70 })
  expect(f.enqueue).toHaveBeenLastCalledWith({ kind: 'move', x: 80, y: 60 })
  const count = f.enqueue.mock.calls.length
  dispatch(f.canvas, 'pointermove', { clientX: -101 })
  expect(f.enqueue).toHaveBeenCalledTimes(count)
  f.controller.dispose()
})

// 滿載queue失焦只丟棄pending並derive Worker held release，不把keyup塞成65筆fatal。
it('releases focus safely when pending input is already at its count limit', () => {
  const f = fixture()
  dispatch(f.canvas, 'pointerdown')
  dispatch(f.ime, 'keydown', {
    key: 'Enter',
    code: 'Enter',
    getModifierState: /* 公開功能鍵fixture。 */ () => false,
  })
  for (let i = 0; i < 63; i++)
    f.channel.enqueue({ kind: 'key', key: 'Return', down: true, modifiers: [] })
  expect(f.channel.count).toBe(64)
  dispatch(f.win, 'blur')
  expect(f.fail).not.toHaveBeenCalled()
  expect(f.channel.count).toBe(0)
  expect(f.release).toHaveBeenCalledOnce()
  f.controller.dispose()
})
// 百分比縮放置中canvas的caret亦須包含content offset，而不是只用canvas-local點。
it('anchors the local IME caret at the actual centered canvas content position', () => {
  const f = fixture()
  f.canvas.offsetLeft = 50
  f.canvas.offsetTop = 10
  dispatch(f.canvas, 'pointerdown', { clientX: 100, clientY: 90 })
  expect(f.ime.style.left).toBe('130px')
  expect(f.ime.style.top).toBe('70px')
  f.controller.dispose()
})
// toolbar／非 active IME 不能攔截快捷鍵，文字元素取消後要清。
it('scopes keyboard and composition to the active input surface', () => {
  const f = fixture()
  dispatch(f.canvas, 'pointerdown')
  f.enqueue.mockClear()
  dispatch(f.ime, 'compositionstart')
  dispatch(f.ime, 'compositionend', { data: '中文' })
  dispatch(f.ime, 'beforeinput', { inputType: 'insertText', data: '中文', isComposing: false })
  expect(f.enqueue).toHaveBeenCalledExactlyOnceWith({ kind: 'text', text: '中文', modifiers: [] })
  f.ime.blur()
  f.enqueue.mockClear()
  f.ime.value = 'local text'
  const e = dispatch(f.ime, 'keydown', {
    key: 'Enter',
    code: 'Enter',
    getModifierState: () => false,
  })
  expect(e.defaultPrevented).toBe(false)
  dispatch(f.ime, 'compositionstart')
  dispatch(f.ime, 'compositionend', { data: 'late' })
  dispatch(f.ime, 'beforeinput', { inputType: 'insertText', data: 'late', isComposing: false })
  expect(f.enqueue).not.toHaveBeenCalled()
  expect(f.ime.value).toBe('')
  f.controller.dispose()
})
// 同值每 frame 不失焦，真世代／權限撤銷才釋放並停止捕捉。
it('invalidates focus on generation and permission changes without per-frame release', () => {
  const f = fixture()
  dispatch(f.canvas, 'pointerdown')
  f.controller.setState({ ...state })
  expect(f.controller.focused).toBe(true)
  expect(f.release).not.toHaveBeenCalled()
  f.controller.setState({ ...state, input_generation: 2 })
  expect(f.controller.focused).toBe(false)
  f.enqueue.mockClear()
  dispatch(f.ime, 'compositionend', { data: 'cancelled' })
  f.controller.setState({ ...state, keyboard: false })
  dispatch(f.canvas, 'pointerdown')
  expect(f.enqueue).not.toHaveBeenCalled()
  f.controller.dispose()
})
// wheel 僅畫面焦點時防預設，每軸 8 步及有限 fraction。
it('normalizes wheel modes and retains fractions without unbounded backlog', () => {
  const f = fixture()
  expect(
    dispatch(f.canvas, 'wheel', { deltaMode: 0, deltaX: 40, deltaY: 40 }).defaultPrevented,
  ).toBe(false)
  dispatch(f.canvas, 'pointerdown')
  f.enqueue.mockClear()
  dispatch(f.canvas, 'wheel', { deltaMode: 0, deltaX: 20, deltaY: 20 })
  expect(f.enqueue).not.toHaveBeenCalled()
  dispatch(f.canvas, 'wheel', { deltaMode: 0, deltaX: 20, deltaY: 20 })
  expect(f.enqueue).toHaveBeenLastCalledWith({ kind: 'wheel', dx: 1, dy: 1, modifiers: [] })
  dispatch(f.canvas, 'wheel', { deltaMode: 1, deltaX: -25, deltaY: 25 })
  expect(f.enqueue).toHaveBeenLastCalledWith({ kind: 'wheel', dx: -8, dy: 8, modifiers: [] })
  dispatch(f.canvas, 'wheel', { deltaMode: 0, deltaX: 0, deltaY: 0 })
  expect(f.enqueue).toHaveBeenCalledTimes(2)
  dispatch(f.canvas, 'wheel', { deltaMode: 2, deltaX: 1, deltaY: 1 })
  expect(f.enqueue).toHaveBeenLastCalledWith({ kind: 'wheel', dx: 8, dy: 6, modifiers: [] })
  f.controller.dispose()
})
// 全部取消路徑清 ledger，listeners 與 bind／dispose 都冪等。
it('cleans listeners, composition and buttons for cancellation, hidden and disposal', () => {
  const f = fixture()
  f.controller.bind()
  dispatch(f.canvas, 'pointerdown', { button: 1 })
  expect(f.enqueue).toHaveBeenCalledOnce()
  dispatch(f.ime, 'compositionstart')
  dispatch(f.canvas, 'pointercancel')
  dispatch(f.ime, 'compositionend', { data: 'cancelled' })
  expect(f.enqueue).toHaveBeenCalledOnce()
  dispatch(f.canvas, 'pointerdown', { button: 2 })
  f.doc.visibilityState = 'hidden'
  dispatch(f.doc, 'visibilitychange')
  const count = f.enqueue.mock.calls.length
  f.controller.dispose()
  f.controller.dispose()
  dispatch(f.canvas, 'pointerdown')
  dispatch(f.win, 'blur')
  expect(f.enqueue).toHaveBeenCalledTimes(count)
  expect(f.ime.value).toBe('')
})
