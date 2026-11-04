export type CodecFamily = 'vp8' | 'vp9' | 'av1' | 'h264'
export type Quality = 'low' | 'balanced' | 'high'
export type Zoom = 'fit' | 'original' | 0.5 | 1 | 1.5 | 2
export interface DisplayGeometry {
  display: number
  width: number
  height: number
}
export interface CodecCapabilities {
  profiles: Partial<Record<CodecFamily, string[]>>
}
export interface PeerVideo extends DisplayGeometry {
  platform: string
  version: string
  displayCount: number
}
export interface EncodedInput {
  codec: CodecFamily
  data: Uint8Array
  key: boolean
  pts: string
}
export interface VideoPacket {
  display: number
  codec: CodecFamily
  frames: EncodedInput[]
}
export interface FrameResource {
  codedWidth: number
  codedHeight: number
  displayWidth: number
  displayHeight: number
  // 釋放原生影像資源，所有ownership終態都要呼叫。
  close(): void
}
export interface FrameTag {
  revision: number
  generation: number
  frame_id: number
}
export interface Presented extends FrameTag {
  drawn: boolean
}
export interface VideoStats {
  codec: CodecFamily
  width: number
  height: number
}
export interface MediaStats extends VideoStats {
  fps: number
}
export interface ConsoleState {
  revision: number
  phase: Phase
  peer?: PeerVideo
  stats?: MediaStats
  error?: FailureCode
  input?: InputState
  terminal?: Terminal
}
export interface RenderPort {
  // 更新安全顯示幾何並作廢舊generation。
  setFormat(revision: number, generation: number, display: DisplayGeometry): void
  // 接收唯一在途影格，接收者負責釋放。
  accept(frame: VideoFrame, tag: FrameTag): void
  // 取消排程、釋放影格並清Canvas。
  dispose(): void
}
export type RendererFactory = (
  ack: (value: Presented) => void,
  fail: (code: string) => void,
  fps: (value: number) => void,
) => RenderPort
export type VideoOnlyMainEvent =
  | { type: 'probe'; revision: number; frame: VideoFrame }
  | {
      type: 'start'
      revision: number
      target: string
      peer: string
      origin: string
      base: string
      ticket: string
    }
  | { type: 'assist-result'; revision: number; proof: Uint8Array }
  | { type: 'assist-failed'; revision: number }
  | ({ type: 'presented' } & Presented)
  | { type: 'quality'; revision: number; quality: Quality }
  | { type: 'dispose'; revision: number }
export type VideoOnlyWorkerEvent =
  | { type: 'capabilities'; revision: number; capabilities: CodecCapabilities; frame: VideoFrame }
  | { type: 'phase'; revision: number; phase: Phase }
  | { type: 'failure'; revision: number; code: FailureCode; cause: TerminalCause }
  | { type: 'assist'; revision: number; connection: string; salt: string; challenge: string }
  | { type: 'peer'; revision: number; peer: PeerVideo }
  | { type: 'format'; revision: number; generation: number; display: DisplayGeometry }
  | ({ type: 'frame'; frame: VideoFrame } & FrameTag)
  | { type: 'stats'; revision: number; stats: VideoStats }
  | { type: 'disposed'; revision: number }
import type { Phase, FailureCode } from './types'
import type {
  InteractionMainEvent,
  InteractionWorkerEvent,
  InputState,
  Terminal,
  TerminalCause,
} from './interaction-types'
export type VideoMainEvent = VideoOnlyMainEvent | InteractionMainEvent
export type VideoWorkerEvent = VideoOnlyWorkerEvent | InteractionWorkerEvent
