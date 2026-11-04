import { afterEach, expect, it, vi } from 'vitest'
import { startIngressWatch, type IngressSnapshot } from '../real/reconnect-ingress-watch'
import { newProxySummary } from '../real/reconnect-proxy-types'

// 純策略測試才使用fake clock，真spec不注入clock。
function setup() {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const routes = newProxySummary().routes
  const state: IngressSnapshot = {
    visibleThroughout: true,
    streaming: true,
    sameWorker: true,
    terminal: 'none',
    retryMask: 0,
    clockChanged: false,
    counts: { metadata: 1, tickets: 1, accepted: 1, opened: 1, closed: 0 },
    latestMetadataAt: 0,
    cutsNull: true,
    routes: {
      target: { ...routes.target, requested: 1, succeeded: 1 },
      me: { ...routes.me, requested: 2, succeeded: 2 },
      ticket: { ...routes.ticket, requested: 1, succeeded: 1 },
      assist: { ...routes.assist, requested: 1, succeeded: 1 },
    },
  }
  const watch = startIngressWatch(
    {
      now: /* 可控純策略時計。 */ () => Date.now(),
      read: /* 同fixture仍只回copy。 */ async () => structuredClone(state),
      wait: /* 取消確實清掉自有timer。 */ (ms, signal) =>
        new Promise((resolve, reject) => {
          const cancel = /* 不接受取消晚回。 */ (): void => {
            clearTimeout(timer)
            reject(new Error('cancelled'))
          }
          const timer = setTimeout(
            /* 完成移除listener。 */ () => {
              signal.removeEventListener('abort', cancel)
              resolve()
            },
            ms,
          )
          signal.addEventListener('abort', cancel, { once: true })
          if (signal.aborted) cancel()
        }),
    },
    structuredClone(state),
    new AbortController().signal,
  )
  // 手寫literal的新attempt，me從2到3，不複用被測邏輯計算期望。
  function fresh() {
    state.counts = { metadata: 2, tickets: 2, accepted: 2, opened: 2, closed: 1 }
    state.latestMetadataAt = 20
    state.retryMask = 1
    state.sameWorker = false
    state.routes = {
      ...state.routes,
      target: { ...state.routes.target, requested: 2, succeeded: 2 },
      ticket: { ...state.routes.ticket, requested: 2, succeeded: 2 },
      me: { ...state.routes.me, requested: 3, succeeded: 3 },
    }
  }
  return { state, watch, fresh }
}
// 每案不遺留fake timer環境。
afterEach(() => {
  vi.useRealTimers()
})
// 新attempt與真影像分開裁決，quiet不得少1ms或跳過正常end。
it('me_baseline_two_advances_to_three and quiet_requires_10500', async () => {
  const f = setup()
  try {
    f.fresh()
    await vi.advanceTimersByTimeAsync(100)
    expect(await f.watch.fresh).toEqual({ metadataAt: 20 })
    f.watch.beginEnd()
    f.state.streaming = false
    f.state.counts.closed = 2
    const quiet = f.watch.quiet()
    let done = false
    void quiet.then(
      /* 僅作公開完成旗標。 */ () => {
        done = true
      },
    )
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(10499)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(101)
    expect((await quiet).untilAt - (await quiet).fromAt).toBeGreaterThanOrEqual(10500)
  } finally {
    await f.watch.close()
  }
})
// 額外attempt、短命fatal／hidden與假cut都不能被最後健康snapshot洗掉。
for (const mode of ['extra', 'fatal', 'timeout', 'hidden', 'cut', 'worker', 'limited', 'denied']) {
  it('sticky rejection ' + mode, async () => {
    const f = setup()
    try {
      f.fresh()
      await vi.advanceTimersByTimeAsync(100)
      await f.watch.fresh
      if (mode === 'extra') f.state.counts.metadata = 3
      if (mode === 'fatal') f.state.terminal = 'other'
      if (mode === 'timeout') f.state.terminal = 'reconnect_timeout'
      if (mode === 'hidden') f.state.visibleThroughout = false
      if (mode === 'cut') f.state.cutsNull = false
      if (mode === 'worker') f.state.counts.closed = 2
      if (mode === 'limited')
        f.state.routes = { ...f.state.routes, ticket: { ...f.state.routes.ticket, limited: 1 } }
      if (mode === 'denied')
        f.state.routes = { ...f.state.routes, ticket: { ...f.state.routes.ticket, denied: 1 } }
      const failed = expect(f.watch.failed).rejects.toThrow('ingress_observation_failed')
      await vi.advanceTimersByTimeAsync(100)
      await failed
    } finally {
      await f.watch.close()
    }
  })
}
// 健康首頁不是新attempt；缺事件持續到觀察上限必須失敗。
it('healthy_home_without_fresh_attempt_never_passes and begin_end_only_after_fresh', async () => {
  const f = setup()
  try {
    expect(() => f.watch.beginEnd()).toThrow()
    const failed = expect(f.watch.fresh).rejects.toThrow('ingress_observation_failed')
    await vi.advanceTimersByTimeAsync(45100)
    await failed
  } finally {
    await f.watch.close()
  }
})
// 取消不合作reader後再送晚到樣本，不能回復任何成功promise。
it('cancel_ignores_late_sample', async () => {
  const f = setup()
  const baseline = structuredClone(f.state)
  await f.watch.close()
  let release!: (value: IngressSnapshot) => void,
    reads = 0
  const watch = startIngressWatch(
    {
      now: /* 固定純策略時計。 */ () => 0,
      read: /* 模擬不合作的外部reader。 */ () => {
        reads++
        return new Promise((resolve) => {
          release = resolve
        })
      },
      wait: /* 本案不應走到poll sleep。 */ async () => {},
    },
    baseline,
    new AbortController().signal,
  )
  const cancelled = expect(watch.fresh).rejects.toThrow('ingress_cancelled')
  await watch.close()
  release(baseline)
  await cancelled
  expect(reads).toBe(1)
})
