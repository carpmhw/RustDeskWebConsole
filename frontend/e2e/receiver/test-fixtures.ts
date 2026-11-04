import { expect } from 'vitest'

// 缺能力先以存在性斷言取得RED，不讓module-not-found冒充行為測試。
export async function receiverApi(name: string): Promise<unknown> {
  const modules = import.meta.glob('./*.ts')
  const load = modules[`./${name}.ts`]
  expect(typeof load).toBe('function')
  return load!()
}

// 手寫新用途fixture；不讀真輪manifest或使用被測validator建立oracle。
export function binding() {
  return {
    schemaVersion: 1 as const,
    purpose: 'rustdesk_test_receiver_v1' as const,
    runId: '11111111-1111-4111-8111-111111111111',
    requestId: '22222222-2222-4222-8222-222222222222',
    peerId: '987654321',
    createdUtc: '2026-10-23T00:00:00.000Z',
    expiresUtc: '2026-10-23T00:30:00.000Z',
  }
}

// 公開假endpoint不會連線，公鑰只是32個零bytes的canonical Base64。
export function endpoints() {
  return {
    hbbsUdp: { host: 'hbbs.invalid', port: 21116 },
    hbbsTcp: { host: 'hbbs.invalid', port: 21116 },
    hbbrTcp: { host: 'hbbr.invalid', port: 21117 },
    serverPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  }
}

// 手寫完整成功證據，後續每案只變更該案要拒絕的欄位。
export function evidence() {
  return {
    identityBound: true,
    authenticated: true,
    received: true,
    macVerified: true,
    parsed: true,
    textSingle: true,
    textExact: true,
    sequenceComplete: true,
    sequenceValid: true,
    windowComplete: true,
    overflow: false,
    unavailable: false,
    resourcesClosed: true,
  }
}

// 結果只含安全header與布林，不帶peer ID、endpoint或文字。
export function receiverResult() {
  const b = binding()
  return {
    schemaVersion: 1 as const,
    purpose: b.purpose,
    runId: b.runId,
    requestId: b.requestId,
    code: 'receiver_match' as const,
    ...evidence(),
  }
}

// Client的正常驗證是獨立證據，不能由receiver推定。
export function clientReport() {
  const b = binding()
  return {
    schemaVersion: 1 as const,
    purpose: b.purpose,
    runId: b.runId,
    requestId: b.requestId,
    identityVerified: true,
    videoPresented: true,
    submitted: true,
    observationComplete: true,
    scopeIntact: true,
    resourcesClosed: true,
    unavailable: false,
  }
}
