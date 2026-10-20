import { afterEach, expect, it, vi } from 'vitest'
import {
  watchLongrun,
  shortCutAt,
  deadlineCutAt,
  type LongrunPorts,
  type LongrunSnapshot,
} from '../e2e-real/reconnect-longrun-observer'

const counts = { metadata: 2, tickets: 2, accepted: 2, opened: 2, closed: 1 }
// 公開scalar producer不使用產品／runtime，僅控制外部時計和DOM摘要。
function rig(read?: (at: number) => Partial<LongrunSnapshot>, start = 0) {
  let at = start
  const ports: LongrunPorts = {
    now: /* 同步公開單調clock。 */ () => at,
    wait: async (ms) => {
      at += ms
    },
    read: async () => ({
      visibleThroughout: true,
      streaming: true,
      sameWorker: true,
      terminal: 'none',
      retryMask: 0,
      clockChanged: at % 1000 === 0,
      counts: { ...counts },
      latestMetadataAt: null,
      ...read?.(at),
    }),
  }
  return ports
}
// 每案恢復真正Node timers，不能汙染socket契約。
afterEach(() => vi.useRealTimers())

// 提早完成或省略中途觀察都會破壞此字面61秒證據。
it('stream observes the entire interval', async () => {
  const r = await watchLongrun(
    rig(),
    { kind: 'stream', until: 61000, counts },
    new AbortController().signal,
  )
  expect(r.untilAt).toBe(61000)
  expect(r.polls).toBeGreaterThanOrEqual(611)
  expect(r.clockChanges).toBeGreaterThan(50)
})
// 即使Worker最終已關，monotonic opened仍能抓到中間新attempt。
it('transient extra attempt cannot disappear', async () => {
  await expect(
    watchLongrun(
      rig(
        /* 中間只增加一次metadata，不能只驗最後。 */ (at) =>
          at === 100 ? { counts: { ...counts, metadata: 3 } } : {},
      ),
      { kind: 'quiet', counts },
      new AbortController().signal,
    ),
  ).rejects.toThrow('longrun_observation_failed')
})
// 無clock更新與換Worker不應以仍有streaming徽章冒充健康。
it('refuses frozen clock changed worker and hidden', async () => {
  for (const change of [
    { clockChanged: false },
    { sameWorker: false },
    { visibleThroughout: false },
  ]) {
    await expect(
      watchLongrun(
        rig(/* 固定負向scalar。 */ () => change),
        { kind: 'stream', until: 61000, counts },
        new AbortController().signal,
      ),
    ).rejects.toThrow('longrun_observation_failed')
  }
})
// 合併guard失敗必須能區分安全原因，不能再用共用錯誤猜hidden或fatal。
it('reports only a fixed safe reason for each global guard', async () => {
  for (const [change, reason] of [
    [{ visibleThroughout: false }, 'visibility_lost'],
    [{ terminal: 'other' as const }, 'terminal_other'],
    [{}, 'poll_limit'],
  ] as const) {
    const ports = rig(/* 固定公開負向scalar。 */ () => change)
    if (reason === 'poll_limit') ports.wait = /* 不前進時計以觸及有界poll guard。 */ async () => {}
    const result = await watchLongrun(
      ports,
      { kind: 'quiet', counts },
      new AbortController().signal,
    ).catch(/* 只檢查固定安全錯誤，不保存producer物件。 */ (error: unknown) => error)
    expect(result).toMatchObject({
      message: 'longrun_observation_failed',
      name: `LongrunObservationError[${reason}]`,
    })
    expect(Object.keys(result as Error)).toEqual(['name'])
  }
})
// 真timeout的外部上下界不能因輪詢而四捨五入接受。
for (const [when, ok] of [
  [119999, false],
  [120000, true],
  [121500, true],
  [121501, false],
] as const) {
  it('deadline boundary ' + when, async () => {
    const ports = rig(
      /* 以實際取樣時間決定公開terminal。 */ (at) => ({
        terminal: at >= when ? 'reconnect_timeout' : 'none',
      }),
      when === 119999 ? 119999 : 119000,
    )
    const pending = watchLongrun(
      ports,
      { kind: 'deadline', cutAt: 0, counts },
      new AbortController().signal,
    )
    if (ok) expect((await pending).timeoutAt).toBe(when)
    else await expect(pending).rejects.toThrow('longrun_observation_failed')
  })
}
// exhausted是other，不能把三次耗盡冒充原cycle期限。
it('deadline rejects exhausted', async () => {
  await expect(
    watchLongrun(
      rig(/* 只允許明確timeout。 */ () => ({ terminal: 'other' }), 120000),
      { kind: 'deadline', cutAt: 0, counts },
      new AbortController().signal,
    ),
  ).rejects.toThrow('longrun_observation_failed')
})
// Quiet必須涵蓋完整10500ms，不是讀完初始狀態立即返回。
it('quiet covers 10500ms', async () => {
  const r = await watchLongrun(rig(), { kind: 'quiet', counts }, new AbortController().signal)
  expect(r.untilAt - r.fromAt).toBe(10500)
})
// 舊第二次5秒、未知徽章及多出attempt都不能判成重新第1次。
it('retry-one requires both first timing and a clean badge trace', async () => {
  for (const [at, mask, ok] of [
    [2000, 1, true],
    [1999, 1, false],
    [5000, 1, false],
    [2000, 3, false],
    [2000, 0, false],
  ] as const) {
    const ports = rig(
      /* 新request與badge必須共同成立。 */ () => ({
        counts: { metadata: 3, tickets: 3, accepted: 3, opened: 3, closed: 2 },
        latestMetadataAt: at,
        retryMask: mask,
      }),
      at,
    )
    const pending = watchLongrun(
      ports,
      { kind: 'retry-one', cutAt: 0, counts },
      new AbortController().signal,
    )
    if (ok) expect((await pending).metadataAt).toBe(2000)
    else await expect(pending).rejects.toThrow('longrun_observation_failed')
  }
})
// 不合法scalar與未知分類不可透過truthy值混入安全結果。
it('rejects invalid observation fields', async () => {
  for (const change of [
    { retryMask: 8 },
    { counts: { ...counts, metadata: NaN } },
    { terminal: 'public-secret' as 'other' },
  ]) {
    await expect(
      watchLongrun(
        rig(/* 固定非法輸入。 */ () => change),
        { kind: 'quiet', counts },
        new AbortController().signal,
      ),
    ).rejects.toThrow('longrun_invalid_observation')
  }
})
// 固定切點必須維持原anchor，遲到不能換一個較晚目標。
it('missed cut never moves its anchor', () => {
  expect(shortCutAt(2000, 51999)).toBe(52000)
  expect(() => shortCutAt(2000, 52001)).toThrow('longrun_cut_window_missed')
  expect(deadlineCutAt(0, 57000, 114000)).toBe(114000)
  expect(() => deadlineCutAt(0, 54000, 113000)).toThrow('longrun_cut_window_missed')
  expect(() => deadlineCutAt(0, 57000, 114001)).toThrow('longrun_cut_window_missed')
  for (const value of [NaN, Infinity, -1])
    expect(() => shortCutAt(value, 0)).toThrow('longrun_cut_window_missed')
})
// read永不回覆仍必須在1秒內失敗，並釋放自身guard timer。
it('blocked read is bounded', async () => {
  vi.useFakeTimers()
  const ports = rig()
  ports.read = /* 公開永不完成reader，非假造成功。 */ () => new Promise(() => {})
  const pending = watchLongrun(ports, { kind: 'quiet', counts }, new AbortController().signal)
  const rejected = expect(pending).rejects.toThrow('longrun_observation_failed')
  await vi.advanceTimersByTimeAsync(1000)
  await rejected
  expect(vi.getTimerCount()).toBe(0)
})
// abort必須先作廢，再到的公開read不能復活已取消watch。
it('late completion stays cancelled', async () => {
  let resolve: ((value: LongrunSnapshot) => void) | undefined
  const ports = rig(),
    abort = new AbortController()
  ports.read = /* 可控晚回，但資料仍走真watch validator。 */ () =>
    new Promise((done) => {
      resolve = done
    })
  const pending = watchLongrun(ports, { kind: 'quiet', counts }, abort.signal)
  const rejected = expect(pending).rejects.toThrow('longrun_cancelled')
  abort.abort()
  resolve?.(await rig().read(new AbortController().signal))
  await rejected
})
