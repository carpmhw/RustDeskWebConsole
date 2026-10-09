import { expect, it } from 'vitest'
import { RevealLease } from './reveal'

// Deadline依wall clock，即使callback被背景節流也不可延長明文期限。
it('expires plaintext by wall-clock deadline', () => {
  const lease = new RevealLease()
  const revision = lease.begin()
  expect(lease.accept(revision, { password: 'public-reveal-fixture', expires_in: 30 }, 1000)).toBe(
    true,
  )
  expect(lease.read(1000).length > 0).toBe(true)
  expect(lease.remaining(16000)).toBe(15)
  expect(lease.read(31000)).toBe('')
  expect(lease.remaining(31000)).toBe(0)
})
// 關閉或換目標後，先前尚未完成的回應不能再次寫入明文。
it('rejects stale responses after clear or a newer request', () => {
  const lease = new RevealLease()
  const old = lease.begin()
  lease.clear()
  expect(lease.accept(old, { password: 'public-reveal-fixture', expires_in: 30 }, 1000)).toBe(false)
  const current = lease.begin()
  const next = lease.begin()
  expect(lease.accept(current, { password: 'public-reveal-fixture', expires_in: 30 }, 1000)).toBe(
    false,
  )
  expect(lease.accept(next, { password: 'public-reveal-fixture', expires_in: 30 }, 1000)).toBe(true)
})
// 損壞的期限不能把server要求30秒的顯示變成長時間。
it('rejects malformed or excessive reveal lifetimes', () => {
  const lease = new RevealLease()
  const revision = lease.begin()
  expect(() =>
    lease.accept(revision, { password: 'public-reveal-fixture', expires_in: 31 }, 1000),
  ).toThrow('service_unavailable')
  expect(() =>
    lease.accept(revision, { password: 'public-reveal-fixture', expires_in: 0 }, 1000),
  ).toThrow('service_unavailable')
})
