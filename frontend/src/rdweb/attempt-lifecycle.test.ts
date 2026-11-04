import { expect, it, vi } from 'vitest'
import { AttemptLifecycle } from './attempt-lifecycle'
// prepared 只表示提交／失敗，不代表 streaming，更不能在 constructor 自動成功。
it('resolves prepared only after preparation and does not finish a live attempt', async () => {
  const cleanup = vi.fn(),
    life = new AttemptLifecycle(3, cleanup)
  let prepared = false,
    finished = false
  // 只觀察 promise lifecycle，不把它當 native resources 已回收。
  void life.handle.prepared.then(() => {
    prepared = true
  })
  // 終態到達前不應提早 resolve。
  void life.handle.finished.then(() => {
    finished = true
  })
  await Promise.resolve()
  expect(prepared).toBe(false)
  expect(finished).toBe(false)
  life.prepared()
  await life.handle.prepared
  expect(prepared).toBe(true)
  expect(finished).toBe(false)
  expect(cleanup).not.toHaveBeenCalled()
  life.handle.cancel()
  await life.handle.finished
})
// 第一個 authoritative failure 優先，後續 close 或 cancel 不能改成 network。
it('settles fatal once and starts cleanup once before resolving finished', async () => {
  const cleanup = vi.fn(),
    life = new AttemptLifecycle(3, cleanup)
  expect(life.finish({ cause: 'fatal', code: 'crypto_failed' })).toBe(true)
  expect(life.finish({ cause: 'network', code: 'connection_failed' })).toBe(false)
  life.handle.cancel()
  life.prepared()
  await expect(life.handle.finished).resolves.toEqual({ cause: 'fatal', code: 'crypto_failed' })
  await expect(life.handle.prepared).resolves.toBeUndefined()
  expect(cleanup).toHaveBeenCalledOnce()
  expect(life.controller.signal.aborted).toBe(true)
})
// 取消可在任何 preflight 之前發生；重入不重做 cleanup或留下 rejection。
it('supports early cancellation and reentrant cleanup without reviving the attempt', async () => {
  let cleaned = 0
  // cleanup 中再次 cancel 必須無害，不形成 recursive close。
  const life = new AttemptLifecycle(4, () => {
    cleaned++
    life.handle.cancel()
  })
  const aborted = vi.fn()
  life.controller.signal.addEventListener('abort', aborted, { once: true })
  life.handle.cancel()
  life.handle.cancel()
  await expect(life.handle.finished).resolves.toEqual({
    cause: 'stopped',
    code: 'connection_failed',
  })
  expect(cleaned).toBe(1)
  expect(aborted).toHaveBeenCalledOnce()
})
// 未知 cleanup exception 不得拋出公開 cancel 或允許 network 自動 retry。
it('turns unexpected cleanup failure into a fixed fatal settlement', async () => {
  // 生成人工錯誤只作 controller 邊界驗證，不回傳原生 detail。
  const cleanup = vi.fn(() => {
      throw new Error('private cleanup detail')
    }),
    life = new AttemptLifecycle(5, cleanup)
  // finish 不留 unhandled rejection／任意 exception 字串。
  expect(() => life.finish({ cause: 'network', code: 'connection_failed' })).not.toThrow()
  expect(cleanup).toHaveBeenCalledOnce()
  await expect(life.handle.finished).resolves.toEqual({ cause: 'fatal', code: 'connection_failed' })
  await expect(life.handle.prepared).resolves.toBeUndefined()
})
