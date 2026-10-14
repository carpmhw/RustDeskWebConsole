import type { InputChannel } from './input-channel'
import type { InputState, OperationCode, Modifier } from './interaction-types'
import { KeyboardInput, type KeyboardEmissionObserver } from './keyboard-input'
export class InputController {
  private off: Array<() => void> = []
  private alive = true
  private bound = false
  private active = false
  private state: InputState | null = null
  private wheelX = 0
  private wheelY = 0
  private buttons = new Set<number>()
  private pointerId: number | null = null
  private keyboard: KeyboardInput
  // DOM 只由此 scope owner 引用，協定及 Main queue 不持有原始事件。
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ime: HTMLTextAreaElement,
    private readonly channel: InputChannel,
    private readonly issue: (code: OperationCode) => void,
  ) {
    // 非活躍 scope 不得提交晚到組字結果。
    this.keyboard = new KeyboardInput(
      /* 非活躍scope不提交晚到的輸入。 */ (intent) => {
        if (this.focused) this.channel.enqueue(intent)
      },
      issue,
      // 只有測試init script顯式安裝的被動port才觀察；正式頁面不建立logger或hash。
      (window as Window & { __rdwebKeyboardEmissionObserver?: KeyboardEmissionObserver })
        .__rdwebKeyboardEmissionObserver,
    )
  }
  // 成對註冊與移除，每個原生事件錯誤只發固定提示。
  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    // 原生 DOM 例外不附帶事件／文字，並關閉此輸入焦點。
    const safe: EventListener = (e) => {
      try {
        listener(e)
      } catch {
        this.release()
        this.issue('input_unsupported')
      }
    }
    target.addEventListener(type, safe, options)
    // disposer 與 listener 使用同一引用，防止重掛洩漏。
    this.off.push(() => target.removeEventListener(type, safe, options))
  }
  // 只綁 canvas／IME 的輸入，全域 listener 僅處理資源釋放。
  bind(): void {
    if (this.bound || !this.alive) return
    this.bound = true
    // 使用者點畫面才取得鍵盤焦點與 pointer capture。
    this.listen(this.canvas, 'pointerdown', (raw) => {
      const e = raw as PointerEvent
      if (
        !this.state?.ready ||
        !this.state.keyboard ||
        !this.alive ||
        document.visibilityState === 'hidden' ||
        ![0, 1, 2].includes(e.button) ||
        (this.pointerId !== null && this.pointerId !== e.pointerId)
      )
        return
      this.ime.focus({ preventScroll: true })
      this.active = true
      this.channel.focus()
      this.canvas.setPointerCapture(e.pointerId)
      this.pointerId = e.pointerId
      const r = this.canvas.getBoundingClientRect()
      this.ime.style.left = `${this.canvas.offsetLeft + Math.max(0, Math.min(r.width, e.clientX - r.left))}px`
      this.ime.style.top = `${this.canvas.offsetTop + Math.max(0, Math.min(r.height, e.clientY - r.top))}px`
      this.pointer(e, true)
      e.preventDefault()
    })
    // hover 限在本畫面，drag 可 clamp 至邊界。
    this.listen(this.canvas, 'pointermove', (raw) => this.pointer(raw as PointerEvent))
    // 最後一個 button up 才釋放 capture，正常 lostcapture 不 blur 鍵盤。
    this.listen(this.canvas, 'pointerup', (raw) => {
      const e = raw as PointerEvent
      this.pointer(e, false)
      if (!this.buttons.size && this.canvas.hasPointerCapture(e.pointerId)) {
        this.pointerId = null
        this.canvas.releasePointerCapture(e.pointerId)
      }
    })
    // 取消 drag 同時釋放鍵盤及 pending。
    this.listen(this.canvas, 'pointercancel', () => this.release())
    // 非預期 capture 遺失才觸發整個 scope release。
    this.listen(this.canvas, 'lostpointercapture', () => {
      if (this.buttons.size) this.release()
    })
    // 工具列與非活躍元素不攔截快捷鍵。
    this.listen(this.ime, 'keydown', (raw) => {
      if (this.focused && this.keyboard.keyDown(raw as KeyboardEvent)) raw.preventDefault()
    })
    // up 使用 KeyboardInput 的原 down ledger。
    this.listen(this.ime, 'keyup', (raw) => {
      if (this.focused && this.keyboard.keyUp(raw as KeyboardEvent)) raw.preventDefault()
    })
    // 非活躍 composition 只清本機 DOM 文字。
    this.listen(this.ime, 'compositionstart', () => {
      if (this.focused) this.keyboard.compositionStart()
      else this.ime.value = ''
    })
    // 確認結果只在仍活躍 scope 提交一次。
    this.listen(this.ime, 'compositionend', (raw) => {
      if (this.focused) this.keyboard.compositionEnd((raw as CompositionEvent).data)
      this.ime.value = ''
    })
    // 普通文字單一路徑，IME 中間值不 preventDefault。
    this.listen(this.ime, 'beforeinput', (raw) => {
      const e = raw as InputEvent
      if (this.focused) this.keyboard.beforeInput(e.inputType, e.data, e.isComposing)
      if (!this.focused || !e.isComposing) {
        if (this.focused) e.preventDefault()
        this.ime.value = ''
      }
    })
    // 本機焦點移至工具列即停止遠端輸入。
    this.listen(this.ime, 'blur', () => this.release())
    // OS 視窗失焦只釋放，不捕捉任何全域鍵盤資料。
    this.listen(window, 'blur', () => this.release())
    // hidden 立即清組字及待送 ledger。
    this.listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.release()
    })
    // wheel 只在活躍畫面防預設行為。
    this.listen(this.canvas, 'wheel', (raw) => this.wheel(raw as WheelEvent), { passive: false })
    // 非活躍時保留本機右鍵選單。
    this.listen(this.canvas, 'contextmenu', (e) => {
      if (this.focused) e.preventDefault()
    })
  }
  // 同值 snapshot 不失焦，真正 state 變動才停止輸入。
  setState(value: InputState): void {
    if (!this.alive) return
    const a = this.state
    if (
      a &&
      (a.revision !== value.revision ||
        a.input_generation !== value.input_generation ||
        !value.ready ||
        !value.keyboard ||
        a.platform !== value.platform ||
        a.sas !== value.sas)
    ) {
      this.release()
      this.ime.blur()
    }
    this.state = { ...value, display: { ...value.display } }
    this.channel.setState(value)
  }
  // 畫面縮放及 scroll 只影響 client rect，Main 不接觸遠端原點。
  private pointer(e: PointerEvent, down?: boolean): void {
    if (!this.focused || !this.state || (this.pointerId !== null && this.pointerId !== e.pointerId))
      return
    const r = this.canvas.getBoundingClientRect(),
      g = this.state.display
    if (
      ![r.left, r.top, r.width, r.height, e.clientX, e.clientY].every(Number.isFinite) ||
      r.width <= 0 ||
      r.height <= 0
    )
      return
    let x = Math.floor(((e.clientX - r.left) * g.width) / r.width),
      y = Math.floor(((e.clientY - r.top) * g.height) / r.height)
    if (x < 0 || x >= g.width || y < 0 || y >= g.height) {
      if (!this.canvas.hasPointerCapture(e.pointerId)) return
      x = Math.max(0, Math.min(g.width - 1, x))
      y = Math.max(0, Math.min(g.height - 1, y))
    }
    if (down === undefined) {
      this.channel.enqueue({ kind: 'move', x, y })
      return
    }
    const name = ({ 0: 'left', 1: 'middle', 2: 'right' } as const)[e.button as 0 | 1 | 2]
    if (!name || (!down && !this.buttons.has(e.button))) return
    if (down) this.buttons.add(e.button)
    else this.buttons.delete(e.button)
    this.channel.enqueue({
      kind: 'button',
      x,
      y,
      button: name,
      down,
      modifiers: this.mouseModifiers(e),
    })
  }
  // 每軸至多八步，只保留不足一步的 fraction，不堆積超額 backlog。
  private wheel(e: WheelEvent): void {
    if (
      !this.focused ||
      !this.state ||
      ![0, 1, 2].includes(e.deltaMode) ||
      ![e.deltaX, e.deltaY].every(Number.isFinite)
    )
      return
    e.preventDefault()
    const g = this.state.display
    const fx = e.deltaMode === 0 ? 1 / 40 : e.deltaMode === 1 ? 16 / 40 : g.width / 40
    const fy = e.deltaMode === 0 ? 1 / 40 : e.deltaMode === 1 ? 16 / 40 : g.height / 40
    const x = this.wheelX + e.deltaX * fx,
      y = this.wheelY + e.deltaY * fy
    if (![x, y].every(Number.isFinite)) return
    const ix = Math.trunc(x),
      iy = Math.trunc(y)
    this.wheelX = x - ix
    this.wheelY = y - iy
    const dx = Math.max(-8, Math.min(8, ix)),
      dy = Math.max(-8, Math.min(8, iy))
    if (dx || dy) this.channel.enqueue({ kind: 'wheel', dx, dy, modifiers: this.mouseModifiers(e) })
  }
  // 修飾鍵只取布林 primitive，不讓 DOM event 穿越 Worker 邊界。
  private mouseModifiers(e: MouseEvent): Modifier[] {
    const out: Modifier[] = []
    if (e.ctrlKey) out.push('Control')
    if (e.altKey) out.push('Alt')
    if (e.shiftKey) out.push('Shift')
    if (e.metaKey) out.push('Meta')
    return out
  }
  // release 先清 Main ledger／pending，再停止 scope；capture 失效只最佳努力。
  private release(): void {
    this.channel.blur()
    this.keyboard.reset()
    this.active = false
    this.ime.value = ''
    this.wheelX = 0
    this.wheelY = 0
    this.buttons.clear()
    const id = this.pointerId
    this.pointerId = null
    if (id !== null) {
      try {
        if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
      } catch {
        /* 已失效的原生 capture 不重送。 */
      }
    }
  }
  // 冪等解除 DOM listeners，Host 仍是 operation 資源唯一 owner。
  dispose(): void {
    if (!this.alive) return
    this.release()
    this.alive = false
    for (const off of this.off) off()
    this.off = []
    this.state = null
  }
  // 安全徽章只代表本機作用域，不宣稱遠端 OS 已釋放。
  get focused(): boolean {
    return (
      this.alive &&
      this.active &&
      !!this.state?.ready &&
      this.state.keyboard &&
      document.activeElement === this.ime &&
      document.visibilityState !== 'hidden'
    )
  }
}
