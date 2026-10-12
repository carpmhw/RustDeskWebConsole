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
  for (const code of [1000, 1001, 1008, 1011, 3000, NaN])
    expect(closedTerminal(code, false).cause).toBe('fatal')
  expect(closedTerminal(1006, true)).toEqual({ cause: 'stopped', code: 'connection_failed' })
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
