import { describe, expect, it } from 'vitest'
import { receiverApi, binding, endpoints, receiverResult, clientReport } from './test-fixtures'

// 僅在存在性斷言後載入能力，錯誤不包含私有資料。
async function api() {
  return (await receiverApi('contract')) as typeof import('./contract')
}

describe('receiver contract', () => {
  // 若用途或精確期限未驗，跨輪或過期設定就可能被接受。
  it('accepts only the new binding and derives the public text in RAM', async () => {
    const c = await api()
    expect(c.validateReceiverBinding(binding())).toEqual(binding())
    expect(c.publicReceiverText(binding())).toBe(
      'Public 中文 RdWeb 11111111-1111-4111-8111-111111111111',
    )
    expect(c.validateReceiverEndpoints(endpoints())).toEqual(endpoints())
  })

  // 表格中的值全部手寫，捕捉寬鬆轉型、跨用途或日期正規化。
  it.each([
    { purpose: 'input_only' },
    { schemaVersion: 2 },
    { peerId: '000000000' },
    { peerId: '12345678' },
    { runId: '11111111-1111-4111-8111-11111111111A' },
    { requestId: 'not-a-uuid' },
    { expiresUtc: '2026-10-23T00:30:00.001Z' },
    { createdUtc: '2026-02-30T00:00:00.000Z' },
    { expiresUtc: '2026-10-23T08:30:00.000+08:00' },
    { extra: 'must-not-be-logged' },
  ])('rejects invalid binding shape %#', async (change) => {
    const c = await api()
    expect(() => c.validateReceiverBinding({ ...binding(), ...change })).toThrow(
      /^receiver_unavailable$/,
    )
  })

  // getter不應在驗資料前被執行，否則錯誤或內容可能外洩。
  it('rejects accessors and custom prototypes without reading getters', async () => {
    const c = await api()
    let reads = 0
    const b = Object.defineProperty(binding(), 'peerId', {
      get() {
        // 只計數，不提供任何秘密內容。
        reads++
        return '987654321'
      },
    })
    expect(() => c.validateReceiverBinding(b)).toThrow(/^receiver_unavailable$/)
    expect(reads).toBe(0)
    expect(() => c.validateReceiverBinding(Object.create(binding()))).toThrow(
      /^receiver_unavailable$/,
    )
  })

  // 沒有明確保存的host、port及canonical key時不能猜預設目的地。
  it.each([
    { host: '' },
    { host: 'https://example.invalid' },
    { host: 'user@hbbs.invalid' },
    { host: 'hbbs.invalid/path' },
    { host: 'hbbs.invalid\0' },
    { port: 0 },
    { port: 65536 },
    { port: '21116' },
  ])('rejects malformed saved endpoints %#', async (change) => {
    const c = await api()
    const e = endpoints()
    expect(() =>
      c.validateReceiverEndpoints({ ...e, hbbsUdp: { ...e.hbbsUdp, ...change } }),
    ).toThrow(/^receiver_unavailable$/)
  })

  // Base64寬鬆解碼會接受截短或垃圾尾綴，必須拒絕。
  it.each(['', 'AAAA', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', ' '.repeat(44)])(
    'rejects malformed server keys %#',
    async (key) => {
      const c = await api()
      expect(() => c.validateReceiverEndpoints({ ...endpoints(), serverPublicKey: key })).toThrow(
        /^receiver_unavailable$/,
      )
    },
  )

  // 缺Client驗證不能從receiver本地match升為完整信任鏈。
  it.each([
    { identityVerified: false },
    { videoPresented: false },
    { submitted: false },
    { observationComplete: false },
    { scopeIntact: false },
    { resourcesClosed: false },
    { unavailable: true },
  ])('keeps incomplete client evidence unavailable %#', async (change) => {
    const c = await api()
    const result = c.joinReceiverResults(binding(), receiverResult(), {
      ...clientReport(),
      ...change,
    })
    expect(result.code).toBe('receiver_unavailable')
    expect(result.unavailable).toBe(true)
    if ('identityVerified' in change) expect(result.identityBound).toBe(false)
  })

  // 只有完整安全接收才可mismatch；缺coverage或overflow必須不可用。
  it('classifies complete match, complete mismatch and unavailable independently', async () => {
    const c = await api()
    expect(c.joinReceiverResults(binding(), receiverResult(), clientReport()).code).toBe(
      'receiver_match',
    )
    const mismatch = { ...receiverResult(), code: 'receiver_mismatch' as const, textExact: false }
    expect(c.joinReceiverResults(binding(), mismatch, clientReport()).code).toBe(
      'receiver_mismatch',
    )
    const absent = {
      ...receiverResult(),
      code: 'receiver_unavailable' as const,
      sequenceComplete: false,
      unavailable: true,
    }
    expect(c.joinReceiverResults(binding(), absent, clientReport()).code).toBe(
      'receiver_unavailable',
    )
    expect(Object.keys(c.validateReceiverResult(receiverResult())).sort()).toEqual(
      [
        'schemaVersion',
        'purpose',
        'runId',
        'requestId',
        'code',
        'identityBound',
        'authenticated',
        'received',
        'macVerified',
        'parsed',
        'textSingle',
        'textExact',
        'sequenceComplete',
        'sequenceValid',
        'windowComplete',
        'overflow',
        'unavailable',
        'resourcesClosed',
      ].sort(),
    )
  })

  // 不容許extra資料、矛盾code或跨輪header進入安全結果。
  it('rejects extra data, inconsistent classifications and crossed runs', async () => {
    const c = await api()
    for (const change of [
      { text: 'public-sentinel' },
      { identityBound: 'true' },
      { textExact: false },
      { overflow: true },
      { resourcesClosed: false },
      { code: 'arbitrary-error' },
    ])
      expect(() => c.validateReceiverResult({ ...receiverResult(), ...change })).toThrow(
        /^receiver_unavailable$/,
      )
    expect(() =>
      c.joinReceiverResults(binding(), receiverResult(), {
        ...clientReport(),
        runId: clientReport().requestId,
      }),
    ).toThrow(/^receiver_unavailable$/)
  })
})
