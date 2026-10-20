export type IngressCase = 'tcp' | 'ws'
export type IngressIdentity = Record<
  'id' | 'image' | 'imageRef' | 'project' | 'service' | 'owner' | 'startedAt',
  string
> & { running: boolean }
export type IngressFaultReceipt = Record<
  'controlStartedAt' | 'faultRequestedAt' | 'commandCompletedAt' | 'readyAt',
  number
> &
  Record<
    | 'ownershipVerified'
    | 'identityPreserved'
    | 'startedAtChanged'
    | 'restartAttempted'
    | 'restartConfirmed',
    true
  >
export interface IngressFaultSummary {
  attempted: number
  confirmed: number
  cases: Record<IngressCase, { attempted: boolean; confirmed: boolean }>
}
export interface IngressIo {
  // 目的地與命令只由本地固定白名單產生。
  run(
    kind: 'discover' | 'inspect' | 'restart',
    id: string | null,
    until: number,
    signal: AbortSignal,
  ): Promise<string>
  // 只觀察固定公開首頁，不代表串流成功。
  ready(until: number, signal: AbortSignal): Promise<number>
  // 等待真正child／socket釋放，不推論daemon動作取消。
  close(): Promise<void>
}
export interface IngressFaultController {
  // 單案once且未知結果不重播。
  restart(which: IngressCase, signal: AbortSignal): Promise<IngressFaultReceipt>
  // 只回傳安全計數副本。
  summary(): IngressFaultSummary
  // 先失效再取消自有待辦。
  close(): Promise<void>
}
