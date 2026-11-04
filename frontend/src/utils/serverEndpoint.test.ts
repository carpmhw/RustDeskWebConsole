import { expect, it } from 'vitest'
import { DEFAULT_PORTS, joinEndpoint, splitEndpoint, switchedPort } from './serverEndpoint'

// RustDesk OSS 預設 port 依傳輸方式區分，WS 為各自 TCP 主埠 +2。
it('exposes the OSS default ports per transport', () => {
  expect(DEFAULT_PORTS).toEqual({
    tcp: { id: 21116, relay: 21117 },
    ws: { id: 21118, relay: 21119 },
  })
})

// 保存值拆回主機與 port，IPv6 去除方括號；沒有 port 時原樣留在主機欄。
it('splits saved endpoints without altering the port', () => {
  expect(splitEndpoint('a.example:21116')).toEqual({ host: 'a.example', port: '21116' })
  expect(splitEndpoint('127.0.0.1:9000')).toEqual({ host: '127.0.0.1', port: '9000' })
  expect(splitEndpoint('[::1]:21118')).toEqual({ host: '::1', port: '21118' })
  expect(splitEndpoint('a.example')).toEqual({ host: 'a.example', port: '' })
})

// 組合成後端要求的明確 host:port，IPv6 加方括號。
it('joins host and port into the saved endpoint format', () => {
  expect(joinEndpoint(' a.example ', '21116')).toBe('a.example:21116')
  expect(joinEndpoint('::1', '21116')).toBe('[::1]:21116')
})

// 切換傳輸只替換仍為舊預設的 port，使用者改過的值保留。
it('switches only ports that still hold the previous default', () => {
  expect(switchedPort('21116', 'id', 'tcp', 'ws')).toBe('21118')
  expect(switchedPort('21119', 'relay', 'ws', 'tcp')).toBe('21117')
  expect(switchedPort('9000', 'id', 'tcp', 'ws')).toBe('9000')
  expect(switchedPort('21117', 'id', 'tcp', 'ws')).toBe('21117')
})
