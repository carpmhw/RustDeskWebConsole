import { expect, it } from 'vitest'
import type { IngressIo, IngressIdentity } from '../e2e-real/reconnect-ingress-types'
import { createIngressFaultController } from '../e2e-real/reconnect-ingress-control'
const token = 'b'.repeat(64),
  id = 'a'.repeat(64)
const identity: IngressIdentity = {
  id,
  image: 'sha256:' + 'c'.repeat(64),
  imageRef: 'rdweb-m0-web',
  project: 'rdweb-m0',
  service: 'ingress',
  owner: token,
  running: true,
  startedAt: '2026-10-20T01:00:00.123456789Z',
}
// 完整公開替身只取代外部I/O，真controller的guard／once皆保持。
function fixture(change: Partial<IngressIdentity> = {}, mode = '') {
  let at = 10,
    inspections = 0,
    restarts = 0,
    closed = false
  const deadlines: number[] = []
  const io: IngressIo = {
    run: /* 固定回完整欄，restart後同ID只改StartedAt。 */ async (kind, requested, until) => {
      deadlines.push(until)
      if (kind === 'discover')
        return mode === 'multi' ? id + '\n' + 'd'.repeat(64) : mode === 'zero' ? '' : id
      expect(requested).toBe(id)
      if (kind === 'restart') {
        restarts++
        if (mode === 'unknown') throw new Error('public-private-sentinel')
        return ''
      }
      inspections++
      return JSON.stringify({
        ...identity,
        ...change,
        ...(mode === 'replaced' && inspections === 2 ? { id: 'd'.repeat(64) } : {}),
        ...(mode === 'changed' && inspections === 2 ? { startedAt: '2026-10-20T02:00:00Z' } : {}),
        ...(restarts ? { startedAt: `2026-10-20T0${3 + restarts}:00:00Z` } : {}),
      })
    },
    ready: /* 晚回必須由controller拒絕。 */ async (until) => {
      deadlines.push(until)
      if (mode === 'late') at += 5001
      return at
    },
    close: /* 公開owner真記錄失效。 */ async () => {
      closed = true
    },
  }
  return {
    controller: createIngressFaultController(io, token, /* 可控純策略時計。 */ () => at),
    deadlines,
    restarts: /* 只讀外部派發數。 */ () => restarts,
    closed: /* 只驗本fixture owner。 */ () => closed,
  }
}
// 兩案各一次且所有I/O沿入口同deadline，receipt不洩漏identity。
it('two once cases share one deadline each and safe receipts', async () => {
  const f = fixture()
  try {
    const receipt = await f.controller.restart('tcp', new AbortController().signal)
    expect(receipt).toEqual({
      controlStartedAt: 10,
      faultRequestedAt: 10,
      commandCompletedAt: 10,
      readyAt: 10,
      ownershipVerified: true,
      identityPreserved: true,
      startedAtChanged: true,
      restartAttempted: true,
      restartConfirmed: true,
    })
    expect(f.controller.summary()).toEqual({
      attempted: 1,
      confirmed: 1,
      cases: {
        tcp: { attempted: true, confirmed: true },
        ws: { attempted: false, confirmed: false },
      },
    })
    await f.controller.restart('ws', new AbortController().signal)
    expect(f.controller.summary().attempted).toBe(2)
    expect(f.restarts()).toBe(2)
    expect(f.deadlines.every(/* 所有步驟不更新窗口。 */ (until) => until === 5010)).toBe(true)
  } finally {
    await f.controller.close()
    expect(f.closed()).toBe(true)
  }
})
// 外部同名／錯誤能力／替換／已停止容器一律在命令前拒絕。
for (const change of [
  { owner: '' },
  { project: 'external' },
  { service: 'backend' },
  { running: false },
  { imageRef: 'unknown' },
  { image: 'invalid' },
  { startedAt: 'invalid' },
]) {
  it('foreign_labels_never_restart ' + Object.keys(change)[0], async () => {
    const f = fixture(change)
    try {
      await expect(f.controller.restart('tcp', new AbortController().signal)).rejects.toThrow(
        'ingress_control_failed',
      )
      expect(f.restarts()).toBe(0)
    } finally {
      await f.controller.close()
    }
  })
}
// 未知結果消耗once、整個controller失效，不用第二案補成功。
for (const mode of ['zero', 'multi', 'replaced', 'changed', 'unknown', 'late']) {
  it('rejects and poisons ' + mode, async () => {
    const f = fixture({}, mode)
    try {
      await expect(f.controller.restart('tcp', new AbortController().signal)).rejects.toThrow(
        'ingress_control_failed',
      )
      await expect(f.controller.restart('ws', new AbortController().signal)).rejects.toThrow()
      expect(f.restarts()).toBe(['unknown', 'late'].includes(mode) ? 1 : 0)
      expect(f.controller.summary().confirmed).toBe(0)
    } finally {
      await f.controller.close()
    }
  })
}
// 重複案與已取消／close owner不能派發任何新命令。
it('duplicate case and closed controller never replay', async () => {
  const f = fixture()
  await f.controller.restart('tcp', new AbortController().signal)
  await expect(f.controller.restart('tcp', new AbortController().signal)).rejects.toThrow()
  await f.controller.close()
  await expect(f.controller.restart('ws', new AbortController().signal)).rejects.toThrow()
  expect(f.restarts()).toBe(1)
})
// I/O不遵守取消也不能讓晚到discover觸發restart。
it('concurrent cancellation invalidates late external result', async () => {
  let release!: (value: string) => void,
    calls = 0
  const io: IngressIo = {
    run: /* 只卡第一個discover。 */ () => {
      calls++
      return new Promise((resolve) => {
        release = resolve
      })
    },
    ready: /* 不應抵達ready。 */ async () => 0,
    close: /* 無真資源。 */ async () => {},
  }
  const controller = createIngressFaultController(io, token, /* 純策略固定clock。 */ () => 10)
  const abort = new AbortController(),
    pending = controller.restart('tcp', abort.signal)
  const failed = expect(pending).rejects.toThrow()
  await expect(controller.restart('ws', abort.signal)).rejects.toThrow()
  abort.abort()
  release?.(id)
  await failed
  await controller.close()
  expect(calls).toBe(1)
})
