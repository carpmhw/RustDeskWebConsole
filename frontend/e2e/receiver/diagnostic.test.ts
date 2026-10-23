import { expect, it } from 'vitest'
import { receiverApi } from './test-fixtures'

// 手寫未知快照，不以被測formatter建立預期值。
const unknown = {
  version: 1,
  phase: 'unknown',
  reason: 'unknown',
  udpClose: 'unknown',
  hbbsClose: 'unknown',
  hbbrClose: 'unknown',
  sessionClose: 'unknown',
  timersClose: 'unknown',
  cleanupBudgetExceeded: false,
}

// 缺能力先用存在性斷言取得RED，不讓import錯誤充當行為驗證。
async function api(): Promise<typeof import('./diagnostic')> {
  return (await receiverApi('diagnostic')) as typeof import('./diagnostic')
}

// 後續abort／complete不可把首失敗或收尾負向改寫成成功。
it('locks the first failure and preserves failed close evidence', async () => {
  const d = (await api()).createReceiverDiagnostic()
  d.acquire('udp')
  const before = d.snapshot()
  d.fail('register_pk', 'registration_rejected')
  d.fail('public_key', 'aborted')
  d.close('udp', false)
  d.close('udp', true)
  d.complete()
  expect(d.snapshot()).toEqual({
    version: 1,
    phase: 'register_pk',
    reason: 'registration_rejected',
    udpClose: 'unconfirmed',
    hbbsClose: 'not_acquired',
    hbbrClose: 'not_acquired',
    sessionClose: 'not_acquired',
    timersClose: 'not_acquired',
    cleanupBudgetExceeded: false,
  })
  expect(Object.isFrozen(before)).toBe(true)
  expect(before.phase).toBe('unknown')
})

// timer真正到期與某個close回false是兩種不同證據。
it('records timeout only when explicitly observed and returns immutable copies', async () => {
  const d = (await api()).createReceiverDiagnostic()
  d.acquire('hbbr')
  d.close('hbbr', false)
  expect(d.snapshot().cleanupBudgetExceeded).toBe(false)
  d.cleanupTimedOut()
  expect(d.snapshot().cleanupBudgetExceeded).toBe(true)
})

// 未確認關閉的取得中資源不能用complete宣告診斷已完整結束。
it('does not complete while acquired resources remain unconfirmed', async () => {
  const d = (await api()).createReceiverDiagnostic()
  d.acquire('udp')
  d.complete()
  expect(d.snapshot().phase).toBe('unknown')
  expect(d.snapshot().reason).toBe('unknown')
})

// 輸入必須strict且不能讀getter或把未知secret字串帶進輸出。
it('refuses malformed data without evaluating accessors or revealing values', async () => {
  const c = await api()
  let touched = false
  for (const value of [
    { ...unknown, extra: 'SECRET_SENTINEL' },
    { ...unknown, phase: 'SECRET_SENTINEL' },
    { ...unknown, version: 2 },
    { ...unknown, udpClose: true },
    { ...unknown, reason: 'none' },
    { ...unknown, phase: 'complete', reason: 'none', cleanupBudgetExceeded: true },
    { ...unknown, phase: 'complete', reason: 'none', udpClose: 'unconfirmed' },
    Object.defineProperty({ ...unknown }, 'phase', {
      get() {
        touched = true
        return 'setup'
      },
    }),
  ]) {
    expect(() => c.validateReceiverDiagnostic(value)).toThrow(/^receiver_unavailable$/)
    expect(
      c.parseReceiverDiagnostic(
        'receiver_diagnostic,' + JSON.stringify({ ...unknown, phase: 'SECRET_SENTINEL' }),
      ),
    ).toEqual(unknown)
  }
  expect(touched).toBe(false)
})

// 接收只接受唯一完整marker；重複、截斷及超額都不能沿用較早成功。
it('round trips one bounded marker and rejects duplicate or incomplete output', async () => {
  const c = await api()
  const d = c.createReceiverDiagnostic()
  d.acquire('udp')
  d.close('udp', true)
  d.complete()
  const line = c.formatReceiverDiagnostic(d.snapshot())
  expect(Buffer.byteLength(line)).toBeLessThanOrEqual(1024)
  expect(
    c.parseReceiverDiagnostic('receiver_result,code=receiver_match\n' + line + '\n'),
  ).toMatchObject({ phase: 'complete', reason: 'none', udpClose: 'confirmed' })
  for (const text of [
    '',
    line,
    line + '\n' + line + '\n',
    line.slice(0, -1) + '\n',
    'receiver_diagnostic,' + 'a'.repeat(1025) + '\n',
    'prefix' + line + '\n',
  ])
    expect(c.parseReceiverDiagnostic(text)).toEqual(unknown)
  expect(c.unknownReceiverDiagnostic()).toEqual(unknown)
})
