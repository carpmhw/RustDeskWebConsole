import type { Terminal } from './interaction-types'
// 只讀 Main HttpClient 的安全 status／code，未知與權限否定一律 fatal。
export function httpTerminal(status: number, code: string): Terminal {
  if (status === 0 && code === 'cancelled') return { cause: 'stopped', code: 'connection_failed' }
  if (status === 429) return { cause: 'fatal', code: 'rate_limited' }
  // 連線剛被中斷或到期，後端拒絕自動重連取票。
  if (status === 409 && code === 'connection_ended')
    return { cause: 'fatal', code: 'connection_ended' }
  if ((status === 0 && code === 'network_error') || [502, 503, 504].includes(status))
    return { cause: 'temporary', code: 'connection_failed' }
  return { cause: 'fatal', code: 'connection_failed' }
}
// 只接受核准的原生異常來源，正常／未知 close 不推測 network；1008 為後端撤銷授權，4001／4002 為時間上限與管理員中斷。
export function closedTerminal(code: number, stopped: boolean): Terminal {
  if (stopped) return { cause: 'stopped', code: 'connection_failed' }
  if (code === 1008) return { cause: 'fatal', code: 'access_revoked' }
  if (code === 4001) return { cause: 'fatal', code: 'time_limit' }
  if (code === 4002) return { cause: 'fatal', code: 'terminated' }
  return { cause: [1006, 1012].includes(code) ? 'network' : 'fatal', code: 'connection_failed' }
}
export class TransportFault extends Error {
  readonly terminal: Terminal
  // 本機 sender 專用型別，peer 字串不能冒充 retry disposition。
  constructor(value: Terminal) {
    super(value.code)
    this.terminal = { ...value }
  }
}
