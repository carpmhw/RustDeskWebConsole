import type { Terminal } from './interaction-types'
// 只讀 Main HttpClient 的安全 status／code，未知與權限否定一律 fatal。
export function httpTerminal(status: number, code: string): Terminal {
  if (status === 0 && code === 'cancelled') return { cause: 'stopped', code: 'connection_failed' }
  if (status === 429) return { cause: 'fatal', code: 'rate_limited' }
  if ((status === 0 && code === 'network_error') || [502, 503, 504].includes(status))
    return { cause: 'temporary', code: 'connection_failed' }
  return { cause: 'fatal', code: 'connection_failed' }
}
// 只接受核准的原生異常來源，正常／policy／未知 close 不推測 network。
export function closedTerminal(code: number, stopped: boolean): Terminal {
  if (stopped) return { cause: 'stopped', code: 'connection_failed' }
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
