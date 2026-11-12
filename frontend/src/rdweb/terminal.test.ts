import { expect, it } from 'vitest'
import { closedTerminal, httpTerminal, TransportFault } from './terminal'
import type { Terminal } from './interaction-types'
// HTTP code 字串不能自稱 network；status 是本機 HttpClient 的權威來源。
it('classifies HTTP cancellation and temporary authority without leaking arbitrary code', () => {
  expect(httpTerminal(0, 'cancelled')).toEqual({ cause: 'stopped', code: 'connection_failed' })
  expect(httpTerminal(0, 'network_error')).toEqual({
    cause: 'temporary',
    code: 'connection_failed',
  })
  for (const status of [502, 503, 504])
    expect(httpTerminal(status, 'private arbitrary detail')).toEqual({
      cause: 'temporary',
      code: 'connection_failed',
    })
  for (const status of [0, 401, 403, 404, 500, NaN])
    expect(httpTerminal(status, 'peer_claims_network')).toEqual({
      cause: 'fatal',
      code: 'connection_failed',
    })
})
// 429 必須停止，固定 rate_limited 供 Task12明確提示，不冒充暫時網路故障。
it('preserves a safe fixed rate-limit terminal and fails closed for all other HTTP denials', () => {
  expect(httpTerminal(429, 'rate_limited')).toEqual({ cause: 'fatal', code: 'rate_limited' })
  expect(httpTerminal(429, 'untrusted arbitrary detail')).toEqual({
    cause: 'fatal',
    code: 'rate_limited',
  })
  expect(httpTerminal(403, 'network_error').cause).toBe('fatal')
})
// 正常／policy／未知 close 不猜 network；stopped 永遠優先。
it('classifies only approved native close sources as unexpected network', () => {
  for (const code of [1006, 1012])
    expect(closedTerminal(code, false)).toEqual({ cause: 'network', code: 'connection_failed' })
  for (const code of [1000, 1001, 1011, 3000, NaN])
    expect(closedTerminal(code, false)).toEqual({ cause: 'fatal', code: 'connection_failed' })
  expect(closedTerminal(1006, true)).toEqual({ cause: 'stopped', code: 'connection_failed' })
})
// 後端撤銷授權以 1008 關閉，須成為不重連的 access_revoked；使用者停止仍優先。
it('maps policy-violation close to a fatal access_revoked terminal', () => {
  expect(closedTerminal(1008, false)).toEqual({ cause: 'fatal', code: 'access_revoked' })
  expect(closedTerminal(1008, true)).toEqual({ cause: 'stopped', code: 'connection_failed' })
})
// typed fault 是本機 class，message與內部snapshot都是固定來源，不讓原DTO晚改。
it('copies authoritative typed faults and carries no native error text', () => {
  const value: Terminal = { cause: 'network', code: 'connection_failed' },
    fault = new TransportFault(value)
  expect(fault).toBeInstanceOf(Error)
  expect(fault.message).toBe('connection_failed')
  value.cause = 'fatal'
  expect(fault.terminal).toEqual({ cause: 'network', code: 'connection_failed' })
})

// 後端以應用代碼結束：4001 時間上限、4002 管理員中斷，皆為終止、不自動重連；1008 維持撤銷。
it('maps governance close codes to fatal terminals without reconnect', () => {
  expect(closedTerminal(4001, false)).toEqual({ cause: 'fatal', code: 'time_limit' })
  expect(closedTerminal(4002, false)).toEqual({ cause: 'fatal', code: 'terminated' })
  expect(closedTerminal(1008, false)).toEqual({ cause: 'fatal', code: 'access_revoked' })
  expect(closedTerminal(1006, false).cause).toBe('network')
})
// 自動重連取票被拒（連線已結束）時固定為終止，不冒充一般失敗或網路中斷。
it('maps a refused reconnect ticket to a fatal connection_ended terminal', () => {
  expect(httpTerminal(409, 'connection_ended')).toEqual({
    cause: 'fatal',
    code: 'connection_ended',
  })
  expect(httpTerminal(409, 'conflict')).toEqual({ cause: 'fatal', code: 'connection_failed' })
})
