import type { DisplayGeometry } from './video-types'
import type { FailureCode } from './types'

export const CONTROL_NAMES = [
  'Alt',
  'Backspace',
  'CapsLock',
  'Control',
  'Delete',
  'DownArrow',
  'End',
  'Escape',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'Home',
  'LeftArrow',
  'Meta',
  'PageDown',
  'PageUp',
  'Return',
  'RightArrow',
  'Shift',
  'Space',
  'Tab',
  'UpArrow',
  'Numpad0',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'Numpad7',
  'Numpad8',
  'Numpad9',
  'Insert',
  'Multiply',
  'Add',
  'Subtract',
  'Decimal',
  'Divide',
  'Equals',
  'NumpadEnter',
  'RShift',
  'RControl',
  'RAlt',
  'RWin',
  'NumLock',
] as const
export type ControlName = (typeof CONTROL_NAMES)[number]
export type Modifier = 'Alt' | 'Control' | 'Shift' | 'Meta' | 'CapsLock' | 'NumLock'
export type PeerPlatform = 'windows' | 'linux' | 'unsupported'
export interface RemoteInputGeometry extends DisplayGeometry {
  x: number
  y: number
}
export interface RemotePermissions {
  keyboard: boolean
  clipboard: boolean
}
export interface PeerInputMetadata {
  geometry: RemoteInputGeometry
  platform: PeerPlatform
  sas: boolean
}
export interface InputState extends RemotePermissions {
  revision: number
  input_generation: number
  display: DisplayGeometry
  platform: PeerPlatform
  sas: boolean
  ready: boolean
}
export type InputIntent =
  | { kind: 'move'; x: number; y: number }
  | {
      kind: 'button'
      x: number
      y: number
      button: 'left' | 'middle' | 'right'
      down: boolean
      modifiers: Modifier[]
    }
  | { kind: 'wheel'; dx: number; dy: number; modifiers: Modifier[] }
  | { kind: 'key'; key: ControlName; down: boolean; modifiers: Modifier[] }
  | { kind: 'shortcut'; char: string; down: boolean; modifiers: Modifier[] }
  | { kind: 'text'; text: string; modifiers: Modifier[] }
  | { kind: 'sas' }
export interface InputTag {
  revision: number
  input_generation: number
  batch_id: number
}
export interface InputBatch extends InputTag {
  events: InputIntent[]
}
export interface InputAck extends InputTag {
  sent: boolean
}
export const OPERATION_CODES = [
  'input_text_too_large',
  'input_unsupported',
  'clipboard_unavailable',
  'clipboard_permission_denied',
  'clipboard_empty',
  'clipboard_busy',
  'clipboard_timeout',
  'clipboard_too_large',
  'clipboard_invalid',
  'clipboard_unsupported',
] as const
export type OperationCode = (typeof OPERATION_CODES)[number]
export interface ClipboardTag {
  revision: number
  request_id: number
}
export interface ClipboardPort {
  // 僅由 Main 使用者手勢讀取本機剪貼簿。
  readText(): Promise<string>
  // 原生寫入開始後無法可靠撤回。
  writeText(value: string): Promise<void>
}
export interface ClipboardBridge {
  // 複製 owned bytes 至 Worker，保留呼叫端清除原資料的權利。
  push(bytes: Uint8Array, signal: AbortSignal): Promise<void>
  // Main 獨占五秒期限及取消確認。
  pull(signal: AbortSignal): Promise<Uint8Array>
  // 僅取消本次活躍操作。
  cancel(): void
}
export interface ClipboardUi {
  busy: boolean
  receiving: boolean
  fallback: 'none' | 'send' | 'copy'
  code?: OperationCode
}
export interface InteractionHostHooks {
  // 輸入 ACK 僅表示 Worker 提交，不代表遠端執行。
  inputAck(value: InputAck): void
  // 發布當前連線的安全活動證據。
  activity(revision: number, open: boolean): void
  // 操作錯誤與連線終態分開。
  issue(code: OperationCode): void
  // 安全摘要不包含原點、文字或按鍵 ledger。
  inputState(value: InputState): void
}
export type ClipboardReply =
  | (ClipboardTag & { type: 'clipboard-sent' })
  | (ClipboardTag & { type: 'clipboard-data'; bytes: Uint8Array })
  | (ClipboardTag & { type: 'clipboard-error'; code: OperationCode })
  | (ClipboardTag & { type: 'clipboard-cancelled' })
export type TerminalCause = 'network' | 'temporary' | 'fatal' | 'stopped'
export interface Terminal {
  cause: TerminalCause
  code: FailureCode
}
export interface HostAttempt {
  revision: number
  prepared: Promise<void>
  finished: Promise<Terminal>
  // 僅取消這次 attempt，不取消新的外層 session。
  cancel(): void
}
export type RetryPhase = 'idle' | 'connecting' | 'waiting' | 'restored' | 'exhausted' | 'stopped'
export interface RetryState {
  phase: RetryPhase
  attempt: number
  enabled: boolean
  code?: FailureCode
}
export type InteractionMainEvent =
  | ({ type: 'input-batch' } & InputBatch)
  | { type: 'input-release'; revision: number }
  | ({ type: 'clipboard-push'; bytes: Uint8Array } & ClipboardTag)
  | ({ type: 'clipboard-pull' } & ClipboardTag)
  | ({ type: 'clipboard-cancel' } & ClipboardTag)
export type InteractionWorkerEvent =
  | ({ type: 'input-state' } & InputState)
  | ({ type: 'input-ack' } & InputAck)
  | ClipboardReply
  | { type: 'operation-error'; revision: number; code: OperationCode }
  | { type: 'activity'; revision: number; open: boolean }
