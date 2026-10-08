import { expect, test } from 'vitest'
import { buildWsUrl, normalizeBase, withBase } from './basePath'

// 三種掛載路徑都必須產生正確 HTTP 與 WebSocket 前綴。
test.each(['', '/rdweb', '/a/b/c'])('URLs preserve base %s', (base) => {
  expect(normalizeBase(base || '/')).toBe(base)
  expect(withBase('api/v1/health', base)).toBe(`${base}/api/v1/health`)
  expect(buildWsUrl('api/v1/spikes/ws', 'https://example.test', base)).toBe(
    `wss://example.test${base}/api/v1/spikes/ws`,
  )
})

// 路徑不能指定任意來源、雙斜線或向上跳出掛載範圍。
test.each(['//evil.test', '/a/../b', '/a?query', 'https://evil.test'])('reject base %s', (base) => {
  expect(() => normalizeBase(base)).toThrow()
})

// API 呼叫端只提供站台內相對路徑，不能繞過工具指定來源。
test.each(['/api/v1/health', 'https://evil.test', '../secret'])('reject URL %s', (path) => {
  expect(() => withBase(path, '/rdweb')).toThrow()
})
