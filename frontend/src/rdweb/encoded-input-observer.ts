import { decodeMessage, hbb } from './codec'

export type EncodedInputSnapshot =
  | { kind: 'mouse'; mask: number }
  | {
      kind: 'key'
      union: string
      mode: number
      down: boolean
      press: boolean
      controlKey: number
      chr: number
      seq: string
      modifiers: number[]
    }
export interface EncodedInputObserver {
  // 只同步借用獨立primitive；不保留文字或取得原bytes。
  record(value: EncodedInputSnapshot): void
  // 診斷失敗只標不可用，不改原加密或輸入結果。
  unavailable(): void
}
export type EncodedInputObserverSource =
  EncodedInputObserver | (() => EncodedInputObserver | undefined)
// 同步解讀即將加密的bytes，只給獨立鍵鼠primitive；診斷故障不能阻止原send。
export function observeEncodedInput(bytes: Uint8Array, observer: EncodedInputObserver): void {
  try {
    if (bytes.length > 8192) throw new Error()
    const message = decodeMessage(bytes)
    if (message.union === 'mouseEvent')
      observer.record({ kind: 'mouse', mask: message.mouseEvent!.mask ?? 0 })
    else if (message.union === 'keyEvent') {
      const key = message.keyEvent!
      observer.record({
        kind: 'key',
        union: key.union ?? '',
        mode: key.mode ?? hbb.KeyboardMode.Legacy,
        down: key.down ?? false,
        press: key.press ?? false,
        controlKey: key.controlKey ?? 0,
        chr: key.chr ?? 0,
        seq: key.seq ?? '',
        modifiers: [...(key.modifiers ?? [])],
      })
    }
  } catch {
    try {
      observer.unavailable()
    } catch {
      /* 不把診斷例外轉為產品錯誤。 */
    }
  }
}
