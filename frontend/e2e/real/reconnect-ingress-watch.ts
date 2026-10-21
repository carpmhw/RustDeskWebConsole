import type { LongrunSnapshot, LongrunReceipt } from './reconnect-longrun-observer'
import type { ProxySummary } from './reconnect-proxy-types'
export interface IngressSnapshot extends LongrunSnapshot {
  routes: Pick<ProxySummary['routes'], 'target' | 'me' | 'ticket' | 'assist'>
  cutsNull: boolean
}
export interface IngressWatchPorts {
  // Runtime固定Node單調時計，純策略測試才可控。
  now(): number
  // 唯一reader僅回安全scalar副本。
  read(signal: AbortSignal): Promise<IngressSnapshot>
  // 有界poll等待沿用本case取消權。
  wait(ms: number, signal: AbortSignal): Promise<void>
}
export interface IngressWatch {
  fresh: Promise<{ metadataAt: number }>
  failed: Promise<never>
  // 真影像裁決通過後才允許正常Worker close。
  beginEnd(): void
  // 完整end樣本後持續10500ms，不重設sticky狀態。
  quiet(): Promise<LongrunReceipt>
  // 先失效再釋放自有reader／timer。
  close(): Promise<void>
}
// 同一loop跨首次auto／影像驗證／正常end／quiet，不重設任何sticky觀察。
export function startIngressWatch(
  ports: IngressWatchPorts,
  baseline: IngressSnapshot,
  external: AbortSignal,
): IngressWatch {
  const base = structuredClone(baseline),
    start = ports.now(),
    owner = new AbortController(),
    signal = AbortSignal.any([external, owner.signal])
  let closed = false,
    freshDone = false,
    ending = false,
    quietRequested = false,
    quietAt: number | null = null,
    previousAt = start,
    last = base
  let resolveFresh!: (value: { metadataAt: number }) => void,
    rejectFresh!: (error: Error) => void,
    rejectFailed!: (error: Error) => void,
    resolveQuiet!: (value: LongrunReceipt) => void,
    rejectQuiet!: (error: Error) => void
  const fresh = new Promise<{ metadataAt: number }>(
    /* 公開promise仍由主流程await。 */ (resolve, reject) => {
      resolveFresh = resolve
      rejectFresh = reject
    },
  )
  const failed = new Promise<never>(
    /* 只拒絕，不把ready當成功。 */ (_resolve, reject) => {
      rejectFailed = reject
    },
  )
  const quiet = new Promise<LongrunReceipt>(
    /* 正常end後才可消費。 */ (resolve, reject) => {
      resolveQuiet = resolve
      rejectQuiet = reject
    },
  )
  for (const pending of [fresh, failed, quiet])
    void pending.catch(/* 防unhandled，不換掉原promise。 */ () => {})
  const receipt: LongrunReceipt = {
    fromAt: start,
    untilAt: start,
    polls: 0,
    clockChanges: 0,
    retryMask: 0,
    timeoutAt: null,
    metadataAt: null,
  }
  // 不合作的reader也只有一秒，取消後忽略晚回。
  async function bounded<T>(operation: (child: AbortSignal) => Promise<T>): Promise<T> {
    if (signal.aborted) throw new Error('ingress_cancelled')
    const child = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
    try {
      return await Promise.race([
        operation(AbortSignal.any([signal, child.signal])),
        new Promise<never>(
          /* 只有固定失敗分類。 */ (_resolve, reject) => {
            abort = /* 外部close可立即停止卡住的reader。 */ () =>
              reject(new Error('ingress_cancelled'))
            signal.addEventListener('abort', abort, { once: true })
            timer = setTimeout(() => reject(new Error('ingress_observation_failed')), 1000)
            if (signal.aborted) abort()
          },
        ),
      ])
    } finally {
      clearTimeout(timer)
      child.abort()
      if (abort) signal.removeEventListener('abort', abort)
    }
  }
  const loop = (async () => {
    try {
      if (
        !Number.isFinite(start) ||
        start < 0 ||
        base.counts.metadata !== 1 ||
        base.counts.tickets !== 1 ||
        base.counts.accepted !== 1 ||
        base.counts.opened !== 1 ||
        base.counts.closed !== 0
      )
        throw new Error()
      for (;;) {
        const state = await bounded(/* 單owner probe read。 */ (child) => ports.read(child)),
          at = ports.now()
        if (signal.aborted) throw new Error()
        if (
          !Number.isFinite(at) ||
          at < previousAt ||
          state.visibleThroughout !== true ||
          state.terminal !== 'none' ||
          state.cutsNull !== true ||
          !Number.isInteger(state.retryMask) ||
          state.retryMask < 0 ||
          (state.retryMask & ~1) !== 0 ||
          typeof state.streaming !== 'boolean' ||
          typeof state.clockChanged !== 'boolean'
        )
          throw new Error()
        for (const key of ['metadata', 'tickets', 'accepted', 'opened', 'closed'] as const) {
          const value = state.counts[key],
            max = key === 'closed' ? (ending ? 2 : 1) : 2
          if (!Number.isSafeInteger(value) || value < last.counts[key] || value > max)
            throw new Error()
        }
        for (const route of ['target', 'me', 'ticket', 'assist'] as const) {
          const row = state.routes[route],
            before = base.routes[route]
          for (const key of ['requested', 'succeeded', 'denied', 'limited'] as const) {
            if (
              !Number.isSafeInteger(row[key]) ||
              row[key] < last.routes[route][key] ||
              row[key] > before[key] + (key === 'requested' || key === 'succeeded' ? 1 : 0)
            )
              throw new Error()
          }
          if (row.succeeded > row.requested || row.denied || row.limited) throw new Error()
        }
        if (
          state.latestMetadataAt !== null &&
          (!Number.isFinite(state.latestMetadataAt) ||
            state.latestMetadataAt < 0 ||
            state.latestMetadataAt > at)
        )
          throw new Error()
        previousAt = at
        last = structuredClone(state)
        receipt.polls++
        receipt.untilAt = at
        receipt.retryMask |= state.retryMask
        if (state.clockChanged) receipt.clockChanges++
        if (receipt.polls > 3000) throw new Error()
        if (!freshDone) {
          if (at - start >= 45000) throw new Error()
          if (
            state.counts.metadata === 2 &&
            state.counts.tickets === 2 &&
            state.counts.accepted === 2 &&
            state.counts.opened === 2 &&
            state.counts.closed === 1 &&
            state.routes.target.succeeded === 2 &&
            state.routes.ticket.succeeded === 2 &&
            state.routes.me.requested === base.routes.me.requested + 1 &&
            state.routes.me.succeeded === base.routes.me.succeeded + 1 &&
            receipt.retryMask === 1 &&
            state.latestMetadataAt !== null
          ) {
            freshDone = true
            receipt.metadataAt = state.latestMetadataAt
            resolveFresh({ metadataAt: state.latestMetadataAt })
          }
        }
        if (quietRequested && state.counts.closed === 2 && !state.streaming) {
          quietAt ??= at
          if (at - quietAt >= 10500) {
            resolveQuiet({ ...receipt, fromAt: quietAt })
            return
          }
        } else if (quietAt !== null) throw new Error()
        await bounded(/* Poll不忙等，quiet最後仍完整取樣。 */ (child) => ports.wait(100, child))
      }
    } catch {
      const error = new Error(
        closed || external.aborted ? 'ingress_cancelled' : 'ingress_observation_failed',
      )
      rejectFresh(error)
      rejectFailed(error)
      rejectQuiet(error)
      owner.abort()
    }
  })()
  return {
    fresh,
    failed,
    beginEnd: /* 只有主流程真影像通過後才走此路徑。 */ () => {
      if (closed || signal.aborted || !freshDone || ending || !last.streaming)
        throw new Error('ingress_observation_failed')
      ending = true
    },
    quiet: /* 重複quiet不能重設觀察窗口。 */ () => {
      if (closed || !ending || quietRequested) throw new Error('ingress_observation_failed')
      quietRequested = true
      return quiet
    },
    close: /* 先失效再等loop釋放自有timer。 */ async () => {
      closed = true
      owner.abort()
      rejectFailed(new Error('ingress_cancelled'))
      await loop
    },
  }
}
