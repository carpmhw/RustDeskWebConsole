export type LongrunCase = 'S/tcp' | 'S/ws' | 'D/tcp' | 'D/ws'
export interface LongrunCounts {
  metadata: number
  tickets: number
  accepted: number
  opened: number
  closed: number
}
export interface LongrunSnapshot {
  visibleThroughout: boolean
  streaming: boolean
  sameWorker: boolean | null
  terminal: 'none' | 'reconnect_timeout' | 'other'
  retryMask: number
  clockChanged: boolean
  counts: LongrunCounts
  latestMetadataAt: number | null
}
export interface LongrunPorts {
  // 僅runtime adapter固定使用Node單調時間。
  now(): number
  // 一次只讀安全scalar，取消後不得恢復舊結果。
  read(signal: AbortSignal): Promise<LongrunSnapshot>
  // 測試可注入clock，正式觀察用可取消Node sleep。
  wait(ms: number, signal: AbortSignal): Promise<void>
}
export type LongrunWatch =
  | { kind: 'stream'; until: number; counts: LongrunCounts }
  | { kind: 'retry-one'; cutAt: number; counts: LongrunCounts }
  | { kind: 'deadline'; cutAt: number; counts: LongrunCounts }
  | { kind: 'quiet'; counts: LongrunCounts }
export interface LongrunReceipt {
  fromAt: number
  untilAt: number
  polls: number
  clockChanges: number
  retryMask: number
  timeoutAt: number | null
  metadataAt: number | null
}
const keys = ['metadata', 'tickets', 'accepted', 'opened', 'closed'] as const
// 錯誤名稱僅加固定分量，保留原message，不附snapshot／DOM或下層例外。
class LongrunObservationError extends Error {
  // 分量只由已驗證的本地guard選取，不接受producer字串或資料物件。
  constructor(reason: 'poll_limit' | 'visibility_lost' | 'terminal_other') {
    super('longrun_observation_failed')
    this.name = `LongrunObservationError[${reason}]`
  }
}
// 時計與timestamps只接受有限非負數，不把NaN混進比較。
function finite(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}
// 非法producer資料只回固定分類，不回原物件。
function validCounts(value: LongrunCounts): boolean {
  return (
    !!value &&
    keys.every(
      /* 計數必須是安全非負整數。 */ (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
    )
  )
}
// 任一read／wait都只有單一owner，取消／逾時先作廢再拒絕晚回。
function bounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('longrun_cancelled'))
  return new Promise<T>((resolve, reject) => {
    const child = new AbortController()
    let finished = false
    // 完成一次後清掉guard，未知下層錯誤不附cause。
    const finish = (error?: string, value?: T): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      child.abort()
      if (error) reject(new Error(error))
      else resolve(value as T)
    }
    const abort = /* 外部取消不能映成成功或一般timeout。 */ (): void => finish('longrun_cancelled')
    const timer = setTimeout(
      /* 宿主read卡住也有固定上限。 */ () => finish('longrun_observation_failed'),
      1000,
    )
    signal.addEventListener('abort', abort, { once: true })
    try {
      void operation(child.signal).then(
        /* 晚回由finish抑制。 */ (value) => finish(undefined, value),
        /* 不印原生錯誤。 */ () =>
          finish(signal.aborted ? 'longrun_cancelled' : 'longrun_observation_failed'),
      )
    } catch {
      finish('longrun_observation_failed')
    }
  })
}
// 純觀察器逐段證反例，不用最後snapshot代替整個時間窗。
export async function watchLongrun(
  ports: LongrunPorts,
  request: LongrunWatch,
  signal: AbortSignal,
): Promise<LongrunReceipt> {
  const fromAt = ports.now(),
    baseline = { ...request.counts }
  if (
    !finite(fromAt) ||
    !validCounts(baseline) ||
    !['stream', 'quiet', 'deadline', 'retry-one'].includes(request.kind)
  )
    throw new Error('longrun_invalid_observation')
  const end =
    request.kind === 'stream'
      ? request.until
      : request.kind === 'quiet'
        ? fromAt + 10500
        : request.cutAt + (request.kind === 'deadline' ? 121500 : 5000)
  if (
    !finite(end) ||
    end < fromAt ||
    end - fromAt > 240000 ||
    ('cutAt' in request && (!finite(request.cutAt) || request.cutAt > fromAt))
  )
    throw new Error('longrun_invalid_observation')
  const result: LongrunReceipt = {
    fromAt,
    untilAt: fromAt,
    polls: 0,
    clockChanges: 0,
    retryMask: 0,
    timeoutAt: null,
    metadataAt: null,
  }
  let previous = fromAt,
    lastClock = fromAt,
    initialTerminal: LongrunSnapshot['terminal'] | undefined
  let lastCounts = baseline
  for (;;) {
    const state = await bounded(/* read沒有成功捷徑。 */ (child) => ports.read(child), signal)
    const at = ports.now()
    if (
      !finite(at) ||
      at < previous ||
      !state ||
      !validCounts(state.counts) ||
      !Number.isInteger(state.retryMask) ||
      state.retryMask < 0 ||
      state.retryMask > 7 ||
      !['none', 'reconnect_timeout', 'other'].includes(state.terminal) ||
      typeof state.visibleThroughout !== 'boolean' ||
      typeof state.streaming !== 'boolean' ||
      typeof state.clockChanged !== 'boolean' ||
      ![null, true, false].includes(state.sameWorker) ||
      (state.latestMetadataAt !== null &&
        (!finite(state.latestMetadataAt) || state.latestMetadataAt > at))
    )
      throw new Error('longrun_invalid_observation')
    previous = at
    result.polls++
    result.untilAt = at
    result.retryMask |= state.retryMask
    if (result.polls > 3000) throw new LongrunObservationError('poll_limit')
    if (!state.visibleThroughout) throw new LongrunObservationError('visibility_lost')
    if (state.terminal === 'other') throw new LongrunObservationError('terminal_other')
    for (const key of keys) {
      const extra = request.kind === 'retry-one' ? 1 : 0
      if (
        state.counts[key] < lastCounts[key] ||
        state.counts[key] < baseline[key] ||
        state.counts[key] > baseline[key] + extra
      )
        throw new Error('longrun_observation_failed')
    }
    lastCounts = { ...state.counts }
    if (state.clockChanged) {
      result.clockChanges++
      lastClock = at
    }
    initialTerminal ??= state.terminal
    if (request.kind === 'stream') {
      if (
        state.terminal !== 'none' ||
        !state.streaming ||
        state.sameWorker !== true ||
        at - lastClock >= 5000
      )
        throw new Error('longrun_observation_failed')
      if (at >= end) return result
    } else if (request.kind === 'quiet') {
      if (state.terminal !== initialTerminal) throw new Error('longrun_observation_failed')
      if (at >= end) return result
    } else if (request.kind === 'deadline') {
      if ((state.retryMask & 4) !== 0 || at > end) throw new Error('longrun_observation_failed')
      if (state.terminal === 'reconnect_timeout') {
        if (at < request.cutAt + 120000) throw new Error('longrun_observation_failed')
        result.timeoutAt = at
        return result
      }
      if (at >= end) throw new Error('longrun_observation_failed')
    } else {
      if (state.terminal !== 'none' || (result.retryMask & 6) !== 0 || at >= end)
        throw new Error('longrun_observation_failed')
      if (state.counts.metadata === baseline.metadata + 1) {
        const metadata = state.latestMetadataAt
        if (
          metadata === null ||
          metadata - request.cutAt < 2000 ||
          metadata - request.cutAt >= 5000
        )
          throw new Error('longrun_observation_failed')
        result.metadataAt = metadata
      }
      if (
        keys.every(
          /* 新attempt的每項計數都必須到位。 */ (key) => state.counts[key] === baseline[key] + 1,
        ) &&
        result.retryMask === 1 &&
        result.metadataAt !== null
      )
        return result
    }
    await bounded(
      /* 睡眠本身亦可取消，不能忙迴圈。 */ (child) =>
        ports.wait(Math.min(100, Math.max(1, end - at)), child),
      signal,
    )
  }
}
// 原切點一旦錯過即拒絕，不自動挪到現在。
export function shortCutAt(acceptedAt: number, now: number): number {
  const target = acceptedAt + 50000
  if (![acceptedAt, now, target].every(finite) || now < acceptedAt || now > target)
    throw new Error('longrun_cut_window_missed')
  return target
}
// 兩段短暫恢復仍沿用最初cycle錨點，恰60秒亦不能用於此案。
export function deadlineCutAt(firstCutAt: number, currentAcceptedAt: number, now: number): number {
  const target = firstCutAt + 114000
  if (
    ![firstCutAt, currentAcceptedAt, now, target].every(finite) ||
    currentAcceptedAt < firstCutAt ||
    now < currentAcceptedAt ||
    now > target ||
    target - currentAcceptedAt >= 60000
  )
    throw new Error('longrun_cut_window_missed')
  return target
}
