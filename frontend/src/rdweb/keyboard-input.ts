import type { InputIntent, OperationCode, Modifier, ControlName } from './interaction-types'
import { utf8, INTERACTION_LIMITS as L } from './interaction-limits'
const DOM_KEYS: Record<string, ControlName> = {
  ArrowLeft: 'LeftArrow',
  ArrowRight: 'RightArrow',
  ArrowUp: 'UpArrow',
  ArrowDown: 'DownArrow',
  Enter: 'Return',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Tab: 'Tab',
  Shift: 'Shift',
  Control: 'Control',
  Alt: 'Alt',
  Meta: 'Meta',
  CapsLock: 'CapsLock',
  NumLock: 'NumLock',
}
const CODE_KEYS: Record<string, ControlName> = {
  Space: 'Space',
  NumpadEnter: 'NumpadEnter',
  NumpadMultiply: 'Multiply',
  NumpadAdd: 'Add',
  NumpadSubtract: 'Subtract',
  NumpadDecimal: 'Decimal',
  NumpadDivide: 'Divide',
  NumpadEqual: 'Equals',
  ShiftRight: 'RShift',
  ControlRight: 'RControl',
  AltRight: 'RAlt',
  MetaRight: 'RWin',
}
export interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  repeat: boolean
  isComposing: boolean
  // 原生來源為 KeyboardEvent，單元只注入安全 lock／AltGraph 狀態。
  getModifierState(name: string): boolean
}
export interface KeyboardEmissionSnapshot {
  eventId: number
  phase: 'before' | 'after'
  type: string
  composing: boolean
  internalComposing: boolean
  confirmed: 'null' | 'same_as_data' | 'other'
}
export interface KeyboardEmissionObserver {
  // 原文只借用於同步產生摘要，observer不得改變產品輸入或保存原文。
  record(snapshot: KeyboardEmissionSnapshot, data: string): void
}
export class KeyboardInput {
  private composing = false
  private confirmed: string | null = null
  private held = new Map<string, Extract<InputIntent, { kind: 'key' | 'shortcut' }>>()
  private textModifiers: Modifier[] = []
  private emissionId = 0
  // 無 DOM 相依，只納入已明確取焦的安全 primitive。
  constructor(
    private readonly emit: (v: InputIntent) => void,
    private readonly issue: (v: OperationCode) => void,
    private readonly observer?: KeyboardEmissionObserver,
  ) {}
  // 功能鍵與快捷鍵有 down/up，普通文字只走 beforeinput。
  keyDown(e: KeyLike): boolean {
    if (this.composing || e.isComposing) return false
    this.confirmed = null
    const mods = this.modifiers(e)
    this.textModifiers = mods.filter(
      /* 只保留普通文字狀態。 */ (m) => ['Shift', 'CapsLock', 'NumLock'].includes(m),
    )
    if (e.getModifierState('AltGraph')) {
      this.releaseHotModifiers()
      return false
    }
    let name = Object.hasOwn(CODE_KEYS, e.code)
      ? CODE_KEYS[e.code]
      : Object.hasOwn(DOM_KEYS, e.key)
        ? DOM_KEYS[e.key]
        : undefined
    if (/^F([1-9]|1[0-2])$/.test(e.key)) name = e.key as ControlName
    if (/^Numpad[0-9]$/.test(e.code)) name = e.code as ControlName
    let value: Extract<InputIntent, { kind: 'key' | 'shortcut' }> | undefined = this.held.get(
      e.code,
    )
    if (!value) {
      if (name) value = { kind: 'key', key: name, down: true, modifiers: mods }
      else if (
        mods.some(
          /* 明確 hot modifier 才轉成快捷鍵。 */ (m) => ['Alt', 'Control', 'Meta'].includes(m),
        ) &&
        /^[\x20-\x7e]$/.test(e.key)
      )
        value = { kind: 'shortcut', char: e.key.toLowerCase(), down: true, modifiers: mods }
    }
    if (!value) return false
    if (!this.held.has(e.code) && this.held.size >= L.held) {
      this.issue('input_unsupported')
      return true
    }
    value = { ...value, modifiers: mods }
    this.held.set(e.code, value)
    this.emit(value)
    return true
  }
  // up 按 code 找原 down 語意，不依 Shift／layout 變化換字元。
  keyUp(e: KeyLike): boolean {
    const value = this.held.get(e.code)
    if (!value) return false
    this.held.delete(e.code)
    this.emit({ ...value, down: false, modifiers: this.modifiers(e) })
    return true
  }
  // paste 不讀取本機剪貼簿，composition 確認後的重複文字只吃一次。
  beforeInput(type: string, data: string | null, composing: boolean): void {
    if (
      this.composing ||
      composing ||
      !data ||
      !['insertText', 'insertFromComposition'].includes(type)
    )
      return
    if (this.confirmed === data) {
      this.confirmed = null
      return
    }
    const eventId = ++this.emissionId
    this.observeEmission('before', eventId, type, data, composing)
    this.confirmed = null
    try {
      this.emitText(data)
    } finally {
      this.observeEmission('after', eventId, type, data, composing)
    }
  }
  // 前後同步取狀態；可選observer故障不得阻斷輸入或變成產品提示。
  private observeEmission(
    phase: 'before' | 'after',
    eventId: number,
    type: string,
    data: string,
    composing: boolean,
  ): void {
    if (!this.observer) return
    try {
      this.observer.record(
        {
          eventId,
          phase,
          type,
          composing,
          internalComposing: this.composing,
          confirmed:
            this.confirmed === null ? 'null' : this.confirmed === data ? 'same_as_data' : 'other',
        },
        data,
      )
    } catch {
      /* 被動診斷不改寫輸入結果，也不輸出例外內容。 */
    }
  }
  // 只有已開始的 composition 才能稍後確認。
  compositionStart(): void {
    this.composing = true
    this.confirmed = null
  }
  // 不送中間結果，最後文字原子送一次。
  compositionEnd(text: string): void {
    if (!this.composing) return
    this.composing = false
    this.confirmed = null
    if (text && this.emitText(text)) this.confirmed = text
  }
  // 取消組字與待送 ledger，單次派生已知 up。
  reset(): void {
    this.composing = false
    this.confirmed = null
    for (const value of this.held.values()) this.emit({ ...value, down: false, modifiers: [] })
    this.held.clear()
    this.textModifiers = []
  }
  // UTF-8 驗額後才提交，原生 exception 只轉固定操作提示。
  private emitText(text: string): boolean {
    let bytes: Uint8Array | undefined
    try {
      bytes = utf8(text, L.text, 'input_text_too_large')
      this.emit({ kind: 'text', text, modifiers: [...this.textModifiers] })
      return true
    } catch (error) {
      this.issue(
        error instanceof Error && error.message === 'input_text_too_large'
          ? 'input_text_too_large'
          : 'input_unsupported',
      )
      return false
    } finally {
      bytes?.fill(0)
    }
  }
  // AltGraph 排除 CtrlAlt，lock 狀態只使用安全家族 enum。
  private modifiers(e: KeyLike): Modifier[] {
    const out: Modifier[] = [],
      graph = e.getModifierState('AltGraph')
    if (e.ctrlKey && !graph) out.push('Control')
    if (e.altKey && !graph) out.push('Alt')
    if (e.shiftKey) out.push('Shift')
    if (e.metaKey) out.push('Meta')
    if (e.getModifierState('CapsLock')) out.push('CapsLock')
    if (e.getModifierState('NumLock')) out.push('NumLock')
    return out
  }
  // 本機 AltGraph 組字前先釋放已送 hot modifier。
  private releaseHotModifiers(): void {
    for (const [code, value] of this.held) {
      if (
        value.kind === 'key' &&
        ['Control', 'RControl', 'Alt', 'RAlt', 'Meta', 'RWin'].includes(value.key)
      ) {
        this.emit({ ...value, down: false, modifiers: [] })
        this.held.delete(code)
      }
    }
  }
}
