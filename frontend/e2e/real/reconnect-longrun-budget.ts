import type { ReconnectLease, TunnelHandle } from './reconnect-proxy-types'
import type { LongrunCase } from './reconnect-longrun-observer'
export interface LongrunBudget {
  // 只接受已接受的opaque handle，成功才耗預算。
  cut(caseId: LongrunCase, lease: ReconnectLease, handle: TunnelHandle): number
  // 安全計數copy不能修改owner。
  summary(): { total: number; cases: Readonly<Record<LongrunCase, number>> }
}
// 僅在真interrupt成功後耗額，保留opaque handle的原identity驗證。
export function createLongrunBudget(): LongrunBudget {
  let total = 0
  const cases: Record<LongrunCase, number> = { 'S/tcp': 0, 'S/ws': 0, 'D/tcp': 0, 'D/ws': 0 }
  return {
    cut: /* 容量先驗，真cut完成才記實際次數與原row錨點。 */ (id, lease, handle) => {
      if (!Object.hasOwn(cases, id) || total >= 10 || cases[id] >= (id.startsWith('S/') ? 2 : 3))
        throw new Error('longrun_cut_budget')
      lease.interrupt(handle)
      total++
      cases[id]++
      const at = lease
        .summary()
        .attempts.find(
          /* 按原accepted時間找首次row，不重造clock。 */ (row) =>
            row.acceptedAt === handle.acceptedAt,
        )?.cutAt
      if (typeof at !== 'number' || !Number.isFinite(at))
        throw new Error('longrun_invalid_observation')
      return at
    },
    summary: /* copy隔離呼叫端修改。 */ () => ({ total, cases: { ...cases } }),
  }
}
