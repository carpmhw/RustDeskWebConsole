import { expect, it, vi } from 'vitest'
import { HttpClient } from './client'

// 所有 API request 必須遵循執行期 base 與禁止快取的設定。
it('sends same-origin no-store requests through runtime base', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })))
  const client = new HttpClient('/rdweb', fetcher)
  vi.stubGlobal('fetch', fetcher)
  try {
    await client.send('api/v1/health')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]?.[0]).toBe('/rdweb/api/v1/health')
    expect(fetcher.mock.calls[0]?.[1]?.cache).toBe('no-store')
    expect(fetcher.mock.calls[0]?.[1]?.credentials).toBe('same-origin')
  } finally {
    vi.unstubAllGlobals()
  }
})

// 永遠不回應的連線須有有限期限，不能永久持有跨分頁refresh鎖。
it('bounds a stalled request without exposing transport details', async () => {
  vi.useFakeTimers()
  try {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          // 只有abort會完成這個模擬request，沒有signal時保留pending以檢出缺漏。
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('private-transport-details')),
            { once: true },
          )
        }),
    )
    const client = new HttpClient('', fetcher)
    let code: string | null = null
    const pending = client.send('api/v1/health').catch((error: unknown) => {
      // 測試只收安全分類，不輸出例外中的傳輸資訊。
      code = error instanceof Error ? error.message : 'unexpected'
    })
    await vi.advanceTimersByTimeAsync(15000)
    expect(code).toBe('network_error')
    await pending
  } finally {
    vi.useRealTimers()
  }
})

// CSV需authorized text，但失敗仍解析安全JSONcode，不把body當錯誤message。
it('supports text exports and bounded same-origin query paths', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response('name\r\nfixture\r\n', { headers: { 'Content-Type': 'text/csv' } }),
    )
  const client = new HttpClient('/rdweb', fetcher)
  const value = await client.send<string>(
    'api/v1/targets/export?q=work',
    'GET',
    undefined,
    'public.access.token',
    undefined,
    undefined,
    'text',
  )
  expect(value).toContain('fixture')
  expect(fetcher.mock.calls[0]?.[0]).toBe('/rdweb/api/v1/targets/export?q=work')
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ code: 'forbidden', detail: 'private-detail' }), { status: 403 }),
  )
  await expect(
    client.send('api/v1/targets/export', 'GET', undefined, undefined, undefined, undefined, 'text'),
  ).rejects.toThrow('forbidden')
})
