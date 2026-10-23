import {
  publicReceiverText,
  receiverUnavailable,
  validateReceiverBinding,
  type ReceiverBinding,
  type ReceiverEvidence,
} from './contract.ts'

export type ReceiverInputSnapshot = Pick<
  ReceiverEvidence,
  | 'received'
  | 'parsed'
  | 'textSingle'
  | 'textExact'
  | 'sequenceComplete'
  | 'sequenceValid'
  | 'windowComplete'
  | 'overflow'
  | 'unavailable'
>

export interface ReceiverInput {
  record(message: unknown): void
  snapshot(): ReceiverInputSnapshot
  dispose(): void
}

const CONTROL = 4,
  CAPS_LOCK = 3,
  NUM_LOCK = 63,
  ALT = 1,
  SHIFT = 29,
  META = 23,
  A_KEY = 65 * 65536,
  LEGACY = 0,
  TRANSLATE = 2,
  MAX_INPUTS = 64,
  MAX_TEXT_BYTES = 4096,
  WINDOW_MS = 5000,
  ALLOWED_MODIFIERS = new Set([ALT, CAPS_LOCK, CONTROL, META, NUM_LOCK, SHIFT])

// 只回own data property，避免未知物件以accessor或原型鏈偷改判定。
function own(value: unknown, name: string): unknown {
  try {
    if (!value || typeof value !== 'object') return undefined
    const descriptor = Object.getOwnPropertyDescriptor(value, name)
    return descriptor && 'value' in descriptor ? descriptor.value : undefined
  } catch {
    return undefined
  }
}

// 固定modifier白名單、整數、去重及上限；未知或重複值直接拒絕。
function modifiers(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > ALLOWED_MODIFIERS.size) return null
  const copy: number[] = []
  for (const item of value) {
    if (
      typeof item !== 'number' ||
      !Number.isInteger(item) ||
      !ALLOWED_MODIFIERS.has(item) ||
      copy.includes(item)
    )
      return null
    copy.push(item)
  }
  return copy
}

// 只允許CapsLock／NumLock作附帶lock，hot modifier必須精確符合該鍵語意。
function passiveLocks(value: number[]): boolean {
  return value.every((m) => m === CAPS_LOCK || m === NUM_LOCK)
}

// 文字必須非空、合法Unicode純量、無NUL且不超過4096 UTF-8 bytes，不trim。
function validText(value: unknown): value is string {
  try {
    if (typeof value !== 'string' || !value || value.includes('\0')) return false
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i)
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++i)
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      } else if (code >= 0xdc00 && code <= 0xdfff) return false
    }
    return Buffer.byteLength(value, 'utf8') <= MAX_TEXT_BYTES
  } catch {
    return false
  }
}

// 手寫pinned事件語意；只接受keyEvent／mouseEvent的單一union。
type ParsedInput =
  | { kind: 'mouse'; mask: number; x: number; y: number; modifiers: number[] }
  | {
      kind: 'key'
      down: boolean
      press: boolean
      mode: number
      modifiers: number[]
      controlKey: number | null
      chr: number | null
      seq: string | null
    }

// 解析未受信任的Message；任何缺值、額外oneof或型別錯誤都不可恢復。
function parseInput(message: unknown): ParsedInput {
  const union = own(message, 'union')
  if (union === 'mouseEvent') {
    const event = own(message, 'mouseEvent')
    const mask = own(event, 'mask'),
      x = own(event, 'x'),
      y = own(event, 'y'),
      mods = modifiers(own(event, 'modifiers'))
    if (!Number.isInteger(mask) || !Number.isInteger(x) || !Number.isInteger(y) || !mods)
      return receiverUnavailable()
    return { kind: 'mouse', mask: mask as number, x: x as number, y: y as number, modifiers: mods }
  }
  if (union !== 'keyEvent') return receiverUnavailable()
  const event = own(message, 'keyEvent')
  const down = own(event, 'down'),
    press = own(event, 'press'),
    mode = own(event, 'mode'),
    mods = modifiers(own(event, 'modifiers')),
    values = {
      controlKey: own(event, 'controlKey'),
      chr: own(event, 'chr'),
      seq: own(event, 'seq'),
      unicode: own(event, 'unicode'),
      win2winHotkey: own(event, 'win2winHotkey'),
    }
  if (
    typeof down !== 'boolean' ||
    typeof press !== 'boolean' ||
    !Number.isInteger(mode) ||
    ![LEGACY, 1, TRANSLATE, 3].includes(mode as number) ||
    !mods
  )
    return receiverUnavailable()
  const present = Object.entries(values).filter(
    /* 只接受恰好一個oneof成員。 */ ([, v]) => v != null,
  )
  if (present.length !== 1) return receiverUnavailable()
  const [name, value] = present[0]!
  if (name === 'seq') {
    if (!validText(value)) return receiverUnavailable()
    return {
      kind: 'key',
      down,
      press,
      mode: mode as number,
      modifiers: mods,
      controlKey: null,
      chr: null,
      seq: value,
    }
  }
  if (name !== 'controlKey' && name !== 'chr') return receiverUnavailable()
  if (typeof value !== 'number' || !Number.isInteger(value)) return receiverUnavailable()
  return {
    kind: 'key',
    down,
    press,
    mode: mode as number,
    modifiers: mods,
    controlKey: name === 'controlKey' ? value : null,
    chr: name === 'chr' ? value : null,
    seq: null,
  }
}

// 建立單輪RAM事件守衛；expected只由Task24產生，收到文字不保留。
export function createReceiverInput(binding: ReceiverBinding, now: () => number): ReceiverInput {
  const b = validateReceiverBinding(binding)
  if (typeof now !== 'function') return receiverUnavailable()
  let expected: string = publicReceiverText(b),
    completedAt: number | null = null,
    count = 0,
    lastClock = -Infinity,
    seqCount = 0,
    phase = 0,
    mouseDown = false,
    disposed = false,
    stopped = false,
    clockFailed = false,
    invalid = false,
    overflow = false,
    unavailable = false,
    received = false,
    parsed = false,
    textSingle = false,
    textExact = false,
    windowReached = false
  const seen = { ctrlDown: false, aDown: false, aUp: false, ctrlUp: false, seq: false }

  // 每次讀時鐘都驗有限與不可回退；失敗永久作廢整輪。
  function clock(): number {
    if (clockFailed) return Number.NaN
    try {
      const value = now()
      if (typeof value !== 'number' || !Number.isFinite(value) || value < lastClock) {
        clockFailed = true
        invalid = true
        unavailable = true
        windowReached = false
        return Number.NaN
      }
      lastClock = value
      return value
    } catch {
      clockFailed = true
      invalid = true
      unavailable = true
      windowReached = false
      return Number.NaN
    }
  }

  // 五類訊息都出現才開始獨立5000ms窗；時間戳只取一次。
  function completeIfReady(): void {
    if (completedAt !== null || !Object.values(seen).every(Boolean)) return
    const value = clock()
    if (Number.isFinite(value)) completedAt = value
  }

  // 合法但位置／語意錯誤的輸入只毒化序列，不更改已收到的證據。
  function poison(): void {
    invalid = true
  }

  // 任意下滑鼠只允許Ctrl前、固定座標(20,30)及left down/up。
  function recordMouse(input: Extract<ParsedInput, { kind: 'mouse' }>): void {
    if (
      phase !== 0 ||
      ![0, 9, 10].includes(input.mask) ||
      input.x !== 20 ||
      input.y !== 30 ||
      input.modifiers.length !== 0
    ) {
      poison()
      return
    }
    if (input.mask === 9) {
      if (mouseDown) poison()
      mouseDown = true
    } else if (input.mask === 10) {
      if (!mouseDown) poison()
      mouseDown = false
    }
  }

  // 五鍵身份只由pinned欄位判定；錯誤mode仍算同類訊息但毒化序列。
  function recordKey(input: Extract<ParsedInput, { kind: 'key' }>): void {
    let kind: keyof typeof seen | null = null
    if (input.controlKey === CONTROL && input.down) kind = 'ctrlDown'
    else if (input.controlKey === CONTROL && !input.down) kind = 'ctrlUp'
    else if (input.chr === A_KEY && input.down) kind = 'aDown'
    else if (input.chr === A_KEY && !input.down) kind = 'aUp'
    else if (input.seq !== null) kind = 'seq'
    if (!kind) {
      poison()
      return
    }
    const first = !seen[kind]
    if (!first) poison()
    seen[kind] = true
    if (input.press) poison()
    if (kind === 'seq') {
      seqCount++
      textSingle = seqCount === 1
      textExact = textSingle && input.seq === expected
      if (!textExact || input.mode !== LEGACY || input.modifiers.length !== 0) poison()
    } else {
      // Ctrl鍵不得宣告自己；A鍵必須帶Ctrl；只允許被動lock。
      const wantsControl = kind === 'aDown' || kind === 'aUp',
        hasControl = input.modifiers.includes(CONTROL),
        locks = passiveLocks(
          input.modifiers.filter(/* 分開hot modifier與lock。 */ (m) => m !== CONTROL),
        )
      if (
        (wantsControl ? !hasControl : hasControl) ||
        !locks ||
        input.mode !== (wantsControl ? TRANSLATE : LEGACY)
      )
        poison()
    }
    const expectedPhase = { ctrlDown: 0, aDown: 1, aUp: 2, ctrlUp: 3, seq: 4 }[kind]
    if (phase !== expectedPhase) poison()
    else phase++
    completeIfReady()
  }

  return {
    // 每個事件先驗schema再進狀態機；非法或超限後永久停止。
    record(message: unknown): void {
      if (disposed || stopped) return
      if (++count > MAX_INPUTS) {
        overflow = true
        invalid = true
        unavailable = true
        stopped = true
        return
      }
      received = true
      let input: ParsedInput
      try {
        input = parseInput(message)
      } catch {
        parsed = false
        invalid = true
        unavailable = true
        stopped = true
        return
      }
      parsed = true
      if (input.kind === 'mouse') recordMouse(input)
      else recordKey(input)
    },
    // 只回固定九個布林；文字與事件原文不離開閉包。
    snapshot(): ReceiverInputSnapshot {
      if (!disposed) {
        const value = clock()
        if (Number.isFinite(value) && completedAt !== null && value - completedAt >= WINDOW_MS)
          windowReached = true
      } else if (!seen.seq) {
        unavailable = true
      }
      const complete = Object.values(seen).every(Boolean)
      return {
        received,
        parsed,
        textSingle,
        textExact,
        sequenceComplete: complete,
        sequenceValid:
          complete &&
          !invalid &&
          !overflow &&
          !unavailable &&
          !clockFailed &&
          textSingle &&
          textExact,
        windowComplete: windowReached && !clockFailed,
        overflow,
        unavailable,
      }
    },
    // 終態釋放expected與可變狀態，晚到事件不再改寫已取得結果。
    dispose(): void {
      disposed = true
      stopped = true
      expected = ''
    },
  }
}
