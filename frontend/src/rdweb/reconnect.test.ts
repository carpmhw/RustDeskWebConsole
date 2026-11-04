import { expect, it, vi } from 'vitest'
import { RetryController } from './reconnect'
import { httpTerminal } from './terminal'
import type { RetryState, Terminal } from './interaction-types'
const network: Terminal = { cause: 'network', code: 'connection_failed' }
// 明確清掉 controlled promise 反應，沒有 mock 安全握手或真正 OS timeout。
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}
// 可控 ports 記每次 signal／終態，clock 驗語意而非 timer呼叫次數。
function fixture() {
  let now = 0,
    healthy = true
  const states: RetryState[] = [],
    runs: Array<{ signal: AbortSignal; end: (t: Terminal) => void }> = []
  // 每次 run 的 signal 必須獨立，結果由測試 producer 控制。
  const run = vi.fn(
    (signal: AbortSignal) =>
      new Promise<Terminal>(/* 收集當次獨立 resolver。 */ (end) => runs.push({ signal, end })),
  )
  const c = new RetryController(
    {
      run,
      healthy: /* 控制已驗 activity 狀態。 */ () => healthy,
      changed: /* 只收安全摘要。 */ (s) => states.push(s),
    },
    /* 單調測試 clock。 */ () => now,
  )
  return {
    c,
    run,
    runs,
    states,
    time: /* 同時驅動 owner tick。 */ (n: number) => {
      now = n
      c.tick()
    },
    clock: /* 模擬背景未執行 ticker。 */ (n: number) => {
      now = n
    },
    healthy: /* 不以新畫面數量假健康。 */ (v: boolean) => {
      healthy = v
    },
    end: /* producer只結束指定attempt。 */ async (index: number, value = network) => {
      runs[index]!.end(value)
      await flush()
    },
  }
}
// 首次失败不能被 auto 掩蓋；明確手動 start 才重設曾streaming條件。
it('never retries an initial failure or silently revives it', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  await f.end(0)
  f.time(120000)
  expect(f.run).toHaveBeenCalledOnce()
  expect(f.states.at(-1)).toMatchObject({
    phase: 'exhausted',
    code: 'connection_failed',
    attempt: 0,
  })
  f.c.start()
  expect(f.run).toHaveBeenCalledTimes(2)
  await f.end(1)
  f.time(240000)
  expect(f.run).toHaveBeenCalledTimes(2)
  f.c.dispose()
})
// 延遲由上次終止時算起，最多3次，不因各子階段失敗重新補三次。
it('uses exactly two, five and ten seconds after each previous failure', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await f.end(0)
  f.time(1999)
  expect(f.run).toHaveBeenCalledOnce()
  f.time(2000)
  expect(f.run).toHaveBeenCalledTimes(2)
  f.clock(2100)
  await f.end(1, { cause: 'temporary', code: 'connection_failed' })
  f.time(7099)
  expect(f.run).toHaveBeenCalledTimes(2)
  f.time(7100)
  expect(f.run).toHaveBeenCalledTimes(3)
  f.clock(7200)
  await f.end(2)
  f.time(17199)
  expect(f.run).toHaveBeenCalledTimes(3)
  f.time(17200)
  expect(f.run).toHaveBeenCalledTimes(4)
  await f.end(3)
  expect(f.states.at(-1)).toMatchObject({
    phase: 'exhausted',
    code: 'reconnect_exhausted',
    attempt: 3,
  })
  f.time(999999)
  expect(f.run).toHaveBeenCalledTimes(4)
  expect(new Set(f.runs.map(/* 每attempt獨立AbortSignal。 */ (r) => r.signal)).size).toBe(4)
  f.c.dispose()
})
// crypto／policy／429／unknown不能由generic connection_failed猜成network。
it('stops on fatal or unknown sources including HTTP rate limiting', async () => {
  for (const terminal of [
    { cause: 'fatal', code: 'crypto_failed' } as Terminal,
    httpTerminal(429, 'rate_limited'),
    { cause: 'unknown', code: 'connection_failed' } as unknown as Terminal,
  ]) {
    const f = fixture()
    f.c.start()
    expect(f.run).toHaveBeenCalledOnce()
    f.c.streaming(true)
    await f.end(0, terminal)
    f.time(100000)
    expect(f.run).toHaveBeenCalledOnce()
    expect(f.states.at(-1)?.phase).toBe('exhausted')
    f.c.dispose()
  }
})
// 120秒包含正在執行的HTTP／probe／握手，舊promise晚結束不能復活。
it('aborts an in-progress retry at the cycle deadline and ignores late settlement', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await f.end(0)
  f.time(2000)
  expect(f.run).toHaveBeenCalledTimes(2)
  f.time(120000)
  expect(f.runs[1]!.signal.aborted).toBe(true)
  expect(f.states.at(-1)?.code).toBe('reconnect_timeout')
  await f.end(1)
  f.time(999999)
  expect(f.run).toHaveBeenCalledTimes(2)
  expect(f.states.at(-1)?.code).toBe('reconnect_timeout')
  f.c.dispose()
})
// 未跑ticker的晚frame入口亦先驗deadline，不能用streaming覆蓋過期。
it('refuses a first recovered frame arriving after the original deadline', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await f.end(0)
  f.time(2000)
  f.clock(120000)
  f.c.streaming(true)
  expect(f.states.at(-1)?.code).toBe('reconnect_timeout')
  expect(f.runs[1]!.signal.aborted).toBe(true)
  f.c.dispose()
})
// 恢復後的健康streaming可跨120秒，穩定60秒到期才重設cycle／次數。
it('keeps restored healthy streaming across the old deadline and resets only after stability', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await f.end(0)
  f.time(119000)
  expect(f.run).toHaveBeenCalledTimes(2)
  f.c.streaming(true)
  f.time(121000)
  expect(f.runs[1]!.signal.aborted).toBe(false)
  expect(f.states.at(-1)?.attempt).toBe(1)
  f.time(178999)
  expect(f.states.at(-1)?.attempt).toBe(1)
  f.time(179000)
  expect(f.states.at(-1)?.attempt).toBe(0)
  f.clock(179001)
  await f.end(1)
  f.time(181001)
  expect(f.run).toHaveBeenCalledTimes(3)
  expect(f.states.at(-1)?.attempt).toBe(1)
  f.c.dispose()
})
// 不滿60秒再斷線沿用原deadline，不能因短恢復補120秒。
it('retains the original exhausted cycle after a short recovery', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await f.end(0)
  f.time(119000)
  f.c.streaming(true)
  f.clock(121000)
  await f.end(1)
  expect(f.states.at(-1)?.code).toBe('reconnect_timeout')
  expect(f.run).toHaveBeenCalledTimes(2)
  f.c.dispose()
})
// 重複每frame的true不延長stable60；缺有效activity則不能當健康重設。
it('does not extend stability per frame or reset an unhealthy attempt', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await f.end(0)
  f.time(2000)
  f.c.streaming(true)
  f.clock(61000)
  f.c.streaming(true)
  f.healthy(false)
  f.time(62000)
  expect(f.states.at(-1)?.attempt).toBe(1)
  f.healthy(true)
  f.time(62001)
  expect(f.states.at(-1)?.attempt).toBe(0)
  f.c.dispose()
})
// 關開關只取消wait／auto attempt，不關已streaming；再開不復活。
it('cancels disabled retries without closing an already restored stream', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await f.end(0)
  f.c.enabled(false)
  f.c.enabled(true)
  f.time(2000)
  expect(f.run).toHaveBeenCalledOnce()
  f.c.start()
  expect(f.run).toHaveBeenCalledTimes(2)
  f.c.streaming(true)
  await f.end(1)
  f.time(4000)
  expect(f.run).toHaveBeenCalledTimes(3)
  f.c.streaming(true)
  f.c.enabled(false)
  expect(f.runs[2]!.signal.aborted).toBe(false)
  f.c.dispose()
})
// hidden停auto retry，visible不復活；背景明確start也不得開新attempt。
it('cancels hidden auto attempts and requires explicit visible restart', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await f.end(0)
  f.time(2000)
  expect(f.run).toHaveBeenCalledTimes(2)
  f.c.visibility(false)
  expect(f.runs[1]!.signal.aborted).toBe(true)
  f.c.start()
  expect(f.run).toHaveBeenCalledTimes(2)
  f.c.visibility(true)
  f.time(50000)
  expect(f.run).toHaveBeenCalledTimes(2)
  f.c.start()
  expect(f.run).toHaveBeenCalledTimes(3)
  f.c.dispose()
})
// 手動新epoch及dispose使舊run的late network不能改新state或再啟動。
it('invalidates old epochs and never restarts a disposed owner', async () => {
  const f = fixture()
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.start()
  expect(f.run).toHaveBeenCalledTimes(2)
  await f.end(0)
  expect(f.states.at(-1)?.phase).toBe('connecting')
  f.c.dispose()
  const count = f.states.length
  await f.end(1)
  f.c.start()
  f.c.enabled(true)
  expect(f.run).toHaveBeenCalledTimes(2)
  expect(f.states).toHaveLength(count)
})
// 本機run同步throw也是fatal，不變成unhandled或允許auto retry。
it('settles synchronous or asynchronous programming faults as fatal', async () => {
  const f = fixture()
  f.run.mockImplementationOnce(
    /* 模擬本機factory故障。 */ () => {
      throw new Error('private local detail')
    },
  )
  // start 不能把任意本機exception漏給DOM事件。
  expect(() => f.c.start()).not.toThrow()
  expect(f.run).toHaveBeenCalledOnce()
  expect(f.states.at(-1)?.code).toBe('connection_failed')
  f.c.dispose()
})

// 曾streaming也不能把本機promise rejection或首個temporary當作新network cycle。
it('does not create a new retry cycle from asynchronous local faults or temporary HTTP failures', async () => {
  const f = fixture()
  f.run.mockRejectedValueOnce(new Error('private asynchronous detail'))
  f.c.start()
  expect(f.run).toHaveBeenCalledOnce()
  f.c.streaming(true)
  await flush()
  f.time(100000)
  expect(f.run).toHaveBeenCalledOnce()
  expect(f.states.at(-1)?.code).toBe('connection_failed')
  f.c.dispose()
  const second = fixture()
  second.c.start()
  expect(second.run).toHaveBeenCalledOnce()
  second.c.streaming(true)
  await second.end(0, { cause: 'temporary', code: 'connection_failed' })
  second.time(100000)
  expect(second.run).toHaveBeenCalledOnce()
  expect(second.states.at(-1)?.phase).toBe('exhausted')
  second.c.dispose()
})
