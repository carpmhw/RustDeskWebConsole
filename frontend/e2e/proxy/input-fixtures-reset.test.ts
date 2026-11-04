import { describe, expect, it, vi } from 'vitest'

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }))

// 只替換 child_process 的 execFileSync，保留其他 Node API 給既有 module graph。
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFileSync: execFileSyncMock }
})

import { resetLinuxObserver } from '../real/input-fixtures'

// reset 是 test setup；一次 transient exec／X11 失敗可重試一次，但不改變任何 input oracle。
describe('resetLinuxObserver', () => {
  it('retries once after a transient reset failure', () => {
    execFileSyncMock.mockReset()
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error('timeout')
    })
    execFileSyncMock.mockImplementationOnce(() => Buffer.from(''))
    expect(() => resetLinuxObserver()).not.toThrow()
    expect(execFileSyncMock).toHaveBeenCalledTimes(2)
  })

  // 兩次都失敗仍回固定安全錯誤，不洩漏 Docker、X11 或例外原文。
  it('throws a fixed error after two failures', () => {
    execFileSyncMock.mockReset()
    execFileSyncMock.mockImplementation(() => {
      throw new Error('timeout')
    })
    expect(() => resetLinuxObserver()).toThrow('Public Linux observer unavailable')
    expect(execFileSyncMock).toHaveBeenCalledTimes(2)
  })

  // 正常一次成功不應多跑第二次 reset，避免固定成本與重複 observer。
  it('does not retry after a successful reset', () => {
    execFileSyncMock.mockReset()
    execFileSyncMock.mockReturnValue(Buffer.from(''))
    expect(() => resetLinuxObserver()).not.toThrow()
    expect(execFileSyncMock).toHaveBeenCalledTimes(1)
  })
})
