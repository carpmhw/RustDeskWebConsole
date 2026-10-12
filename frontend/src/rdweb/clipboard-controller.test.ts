import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ClipboardController } from './clipboard-controller'
import type { ClipboardUi } from './interaction-types'
// 原生 promise 可控制晚回覆，但不冒稱可取消真正 OS clipboard 寫入。
function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  // 測試持有端獨立於 controller，stub 不呼叫 port 也不導致 undefined 錯誤。
  const promise = new Promise<T>((ok, bad) => {
    resolve = ok
    reject = bad
  })
  return { promise, resolve, reject }
}
// 全部 deadline 使用同一可控時間；不是 browser 原生 API 的支持證據。
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
// 測試不把 fake timers 遺留至其它模組。
afterEach(() => vi.useRealTimers())
// safe UI 不含文字；bridge 只是 controlled port，沒有 mock auth 或協定成功。
function fixture() {
  const values: ClipboardUi[] = [],
    owned: Uint8Array[] = []
  const port = {
    readText: vi.fn(/* 模擬點擊時可讀的公開文字。 */ async () => 'public local'),
    writeText: vi.fn(
      /* 只驗 native port 參數型別，不宣稱 OS 寫入 ACK。 */ async (value: string) => {
        expect(typeof value).toBe('string')
      },
    ),
  }
  const bridge = {
    push: vi.fn(
      /* 保留原 owned reference 驗 caller 最終清除。 */ async (
        bytes: Uint8Array,
        signal: AbortSignal,
      ) => {
        expect(signal.aborted).toBe(false)
        owned.push(bytes)
      },
    ),
    pull: vi.fn(
      /* 依正式 Bridge 契約回傳活躍操作的 typed bytes。 */ async (
        signal: AbortSignal,
      ): Promise<Uint8Array> => {
        expect(signal.aborted).toBe(false)
        return new Uint8Array([65])
      },
    ),
    cancel: vi.fn(),
  }
  // only primitives 進觀測 state。
  const notify = vi.fn((ui: ClipboardUi) => {
    values.push(ui)
  })
  // 時鐘與 fake timer 同源，可另測 sleep 時直接 tick。
  const c = new ClipboardController(port, bridge, notify, () => Date.now())
  c.setRevision(2)
  return { c, port, bridge, values, owned, notify }
}
// 等待遠端才顯示receiving，native寫入仍pending不可誤導使用者繼續遠端複製。
it('publishes receiving only while awaiting remote bytes', async () => {
  const f = fixture(),
    remote = pending<Uint8Array>(),
    native = pending<void>()
  f.bridge.pull.mockReturnValueOnce(remote.promise)
  f.port.writeText.mockReturnValueOnce(native.promise)
  const running = f.c.copyRemote()
  expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: true, fallback: 'none' })
  remote.resolve(new Uint8Array([65]))
  await vi.advanceTimersByTimeAsync(0)
  expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: false, fallback: 'none' })
  native.resolve()
  await running
  expect(f.values.at(-1)).toMatchObject({ busy: false, receiving: false, fallback: 'none' })
  f.c.dispose()
})
// 本機讀取、手動送出及fallback寫入都不屬於等待遠端新複製。
it('never publishes receiving for local sends or fallback writes', async () => {
  const f = fixture(),
    local = pending<string>(),
    push = pending<void>(),
    native = pending<void>()
  f.port.readText.mockReturnValueOnce(local.promise)
  const sending = f.c.sendLocal()
  expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: false })
  local.reject(new Error('public denial'))
  await sending
  f.c.edit('public manual')
  f.bridge.push.mockReturnValueOnce(push.promise)
  const submitting = f.c.submit()
  expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: false })
  push.resolve()
  await submitting
  f.port.writeText.mockRejectedValueOnce(new Error('public denial'))
  await f.c.copyRemote()
  expect(f.values.at(-1)).toMatchObject({ fallback: 'copy', receiving: false })
  f.port.writeText.mockReturnValueOnce(native.promise)
  const copying = f.c.copyFallback()
  expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: false })
  native.resolve()
  await copying
  f.c.dispose()
})
// 主動關閉、替換revision、失敗及原五秒deadline皆必須清掉接收提示。
it('clears receiving on cancellation, revision replacement, failure and timeout', async () => {
  for (const end of ['close', 'revision', 'failure', 'timeout'] as const) {
    const f = fixture(),
      remote = pending<Uint8Array>()
    f.bridge.pull.mockReturnValueOnce(remote.promise)
    const running = f.c.copyRemote()
    expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: true })
    if (end === 'close') f.c.close()
    else if (end === 'revision') f.c.setRevision(3)
    else if (end === 'failure') remote.reject(new Error('clipboard_unavailable'))
    else {
      await vi.advanceTimersByTimeAsync(4999)
      expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: true })
      await vi.advanceTimersByTimeAsync(1)
    }
    await running
    expect(f.values.at(-1)).toMatchObject({ busy: false, receiving: false })
    expect(f.port.writeText).not.toHaveBeenCalled()
    if (end === 'timeout') expect(f.values.at(-1)?.code).toBe('clipboard_timeout')
    f.c.dispose()
  }
})
// 舊pull晚回來只能清自己的bytes，不得關閉目前新操作的接收提示。
it('does not clear a new receiving state when old remote bytes arrive late', async () => {
  const f = fixture(),
    old = pending<Uint8Array>(),
    current = pending<Uint8Array>()
  f.bridge.pull.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const stale = f.c.copyRemote()
  f.c.close()
  const running = f.c.copyRemote()
  expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: true })
  const bytes = new Uint8Array([65])
  old.resolve(bytes)
  await stale
  await vi.advanceTimersByTimeAsync(0)
  expect(bytes).toEqual(new Uint8Array([0]))
  expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: true })
  expect(f.port.writeText).not.toHaveBeenCalled()
  current.resolve(new Uint8Array([66]))
  await running
  expect(f.values.at(-1)).toMatchObject({ busy: false, receiving: false })
  f.c.dispose()
})
// 期限通知可同步關閉舊scope並重開；舊tick不得因此abort新的controller。
it('does not cancel a new operation opened reentrantly by a timeout notification', async () => {
  const f = fixture(),
    old = pending<Uint8Array>(),
    current = pending<Uint8Array>()
  f.bridge.pull.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const first = f.c.copyRemote()
  let restart = true,
    second: Promise<void> | undefined
  f.notify.mockImplementation(
    /* 消費安全UI的同步重入，不模擬controller內部。 */ (ui) => {
      f.values.push(ui)
      if (restart && !ui.receiving) {
        restart = false
        f.c.close()
        second = f.c.copyRemote()
      }
    },
  )
  await vi.advanceTimersByTimeAsync(5000)
  await first
  expect(f.values.at(-1)).toMatchObject({ busy: true, receiving: true })
  current.resolve(new Uint8Array([66]))
  await second
  expect(f.values.at(-1)).toMatchObject({ busy: false, receiving: false, code: undefined })
  f.c.dispose()
})
// UI接收通知可同步失效scope；不能在取消後仍開訂閱或開始不可撤銷的native寫入。
it('does not start remote or native work after a receiving notification closes its scope', async () => {
  for (const stage of ['waiting', 'received'] as const) {
    const f = fixture(),
      remote = pending<Uint8Array>()
    let receiving = false
    f.bridge.pull.mockReturnValueOnce(remote.promise)
    f.notify.mockImplementation(
      /* Main通知重新檢查route或permission時可同步close。 */ (ui) => {
        f.values.push(ui)
        if (ui.receiving) receiving = true
        if (receiving && ui.busy && (stage === 'waiting' ? ui.receiving : !ui.receiving))
          f.c.close()
      },
    )
    const running = f.c.copyRemote()
    const bytes = new Uint8Array([65])
    remote.resolve(bytes)
    await running
    expect(f.values.at(-1)).toMatchObject({ busy: false, receiving: false })
    expect(f.port.writeText).not.toHaveBeenCalled()
    if (stage === 'waiting') expect(f.bridge.pull).not.toHaveBeenCalled()
    else expect(bytes).toEqual(new Uint8Array([0]))
    f.c.dispose()
  }
})
// native read 被關閉後即使晚回覆，也不得觸發 outbound 或保存文字。
it('does not send a late native result after closing or replacing revision', async () => {
  const f = fixture(),
    p = pending<string>()
  f.port.readText.mockReturnValueOnce(p.promise)
  const running = f.c.sendLocal()
  expect(f.port.readText).toHaveBeenCalledOnce()
  f.c.close()
  const count = f.notify.mock.calls.length
  p.resolve('public late text')
  await running
  expect(f.bridge.push).not.toHaveBeenCalled()
  expect(f.c.text()).toBe('')
  expect(f.notify).toHaveBeenCalledTimes(count)
  expect(vi.getTimerCount()).toBe(0)
  f.c.dispose()
})
// 成功傳送只代表提交，原 bytes 在 finally 清除，公開 UI 沒有文字。
it('sends one strict owned payload and publishes only safe UI', async () => {
  const f = fixture()
  await f.c.sendLocal()
  expect(f.bridge.push).toHaveBeenCalledOnce()
  expect(f.owned[0]?.every(/* 應用暫存全部清零。 */ (b) => b === 0)).toBe(true)
  expect(f.values.at(-1)).toMatchObject({ busy: false, fallback: 'none' })
  expect(
    f.values.every(
      /* 安全摘要只含固定primitive，不可夾帶文字。 */ (v) =>
        Object.keys(v).every(
          /* 固定欄位白名單。 */ (k) => ['busy', 'receiving', 'fallback', 'code'].includes(k),
        ),
    ),
  ).toBe(true)
  expect(f.c.text()).toBe('')
  expect(vi.getTimerCount()).toBe(0)
  f.c.dispose()
})
// UTF-8 scalar／byte 限額獨立於 browser API；錯誤不送殘缺或替換資料。
it('rejects malformed or oversized local text without sending', async () => {
  for (const [text, code] of [
    ['\ud800', 'clipboard_invalid'],
    ['中'.repeat(10923), 'clipboard_too_large'],
  ] as const) {
    const f = fixture()
    f.port.readText.mockResolvedValueOnce(text)
    await f.c.sendLocal()
    expect(f.bridge.push).not.toHaveBeenCalled()
    expect(f.values.at(-1)?.code).toBe(code)
    f.c.dispose()
  }
})
// API 拒絕只能明確手動 fallback，editor 不重讀 native 或延長 30 秒。
it('keeps a fixed manual-send lease and does not submit stale valid text after invalid editing', async () => {
  const f = fixture()
  f.port.readText.mockRejectedValueOnce(new Error('private native detail'))
  await f.c.sendLocal()
  expect(f.values.at(-1)).toMatchObject({ fallback: 'send', code: 'clipboard_permission_denied' })
  f.c.edit('public manual')
  f.c.edit('\ud800')
  await f.c.submit()
  expect(f.bridge.push).not.toHaveBeenCalled()
  expect(f.c.text()).toBe('')
  f.c.edit('valid public text')
  vi.setSystemTime(29999)
  expect(f.c.text()).toBe('valid public text')
  vi.setSystemTime(30000)
  expect(f.c.text()).toBe('')
  expect(f.values.at(-1)?.fallback).toBe('none')
  expect(f.port.readText).toHaveBeenCalledOnce()
  f.c.dispose()
})
// remote owned 結果驗明後原 buffer 即清除，Native write 拒絕保留本次 lease。
it('keeps one remote lease with the original deadline across explicit copy retries', async () => {
  const f = fixture(),
    data = new Uint8Array([65])
  f.bridge.pull.mockResolvedValueOnce(data)
  f.port.writeText.mockRejectedValue(new Error('native denied'))
  await f.c.copyRemote()
  expect(data).toEqual(new Uint8Array([0]))
  expect(f.c.text()).toBe('A')
  expect(f.values.at(-1)).toMatchObject({ fallback: 'copy', code: 'clipboard_permission_denied' })
  vi.setSystemTime(20000)
  await f.c.copyFallback()
  expect(f.port.writeText).toHaveBeenCalledTimes(2)
  vi.setSystemTime(30000)
  expect(f.c.text()).toBe('')
  expect(f.values.at(-1)?.fallback).toBe('none')
  f.c.dispose()
})
// empty snapshot 是本次空字串，不沿用任何前次快取。
it('writes an empty snapshot and clears application-owned text on success', async () => {
  const f = fixture()
  f.bridge.pull.mockResolvedValueOnce(new Uint8Array())
  await f.c.copyRemote()
  expect(f.port.writeText).toHaveBeenCalledExactlyOnceWith('')
  expect(f.c.text()).toBe('')
  expect(f.values.at(-1)).toMatchObject({ busy: false, fallback: 'none' })
  f.c.dispose()
})
// 同一 native promise 永久 pending 也只有一份呼叫；timeout 後可明確手動送。
it('bounds hung native reads to five seconds without accumulating native calls', async () => {
  const f = fixture(),
    p = pending<string>()
  f.port.readText.mockReturnValueOnce(p.promise)
  const running = f.c.sendLocal()
  await vi.advanceTimersByTimeAsync(5000)
  await running
  expect(f.values.at(-1)).toMatchObject({
    busy: false,
    fallback: 'send',
    code: 'clipboard_timeout',
  })
  await f.c.sendLocal()
  expect(f.port.readText).toHaveBeenCalledOnce()
  expect(f.values.at(-1)?.code).toBe('clipboard_busy')
  f.c.edit('manual while native pending')
  await f.c.submit()
  expect(f.bridge.push).toHaveBeenCalledOnce()
  p.resolve('late')
  await Promise.resolve()
  expect(f.bridge.push).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  f.c.dispose()
})
// 五秒是整次操作的界限，不能 remote 等4秒後再給 native 額外5秒。
it('uses one overall operation deadline and ignores late native writes', async () => {
  const f = fixture(),
    remote = pending<Uint8Array>(),
    native = pending<void>()
  f.bridge.pull.mockReturnValueOnce(remote.promise)
  f.port.writeText.mockReturnValueOnce(native.promise)
  const running = f.c.copyRemote()
  await vi.advanceTimersByTimeAsync(4000)
  remote.resolve(new Uint8Array([65]))
  await Promise.resolve()
  await Promise.resolve()
  expect(f.port.writeText).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1000)
  await running
  expect(f.values.at(-1)).toMatchObject({ busy: false, code: 'clipboard_timeout' })
  f.c.close()
  const count = f.notify.mock.calls.length
  native.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(f.notify).toHaveBeenCalledTimes(count)
  expect(f.port.writeText).toHaveBeenCalledOnce()
  f.c.dispose()
})
// 即使 bridge 忽略 abort，Main awaiter仍需結束，遲到 owned bytes 清零。
it('bounds hung pulls and wipes late owned buffers after timeout', async () => {
  const f = fixture(),
    remote = pending<Uint8Array>()
  f.bridge.pull.mockReturnValueOnce(remote.promise)
  const running = f.c.copyRemote()
  await vi.advanceTimersByTimeAsync(5000)
  await running
  expect(f.bridge.cancel).toHaveBeenCalled()
  expect(f.values.at(-1)?.code).toBe('clipboard_timeout')
  const late = new Uint8Array([65])
  remote.resolve(late)
  await Promise.resolve()
  await Promise.resolve()
  expect(late).toEqual(new Uint8Array([0]))
  expect(f.port.writeText).not.toHaveBeenCalled()
  f.c.dispose()
})
// busy 不開第二操作；revision同值保留lease，真正替換與dispose一次清。
it('keeps one operation, preserves same-revision leases and disposes idempotently', async () => {
  const f = fixture(),
    remote = pending<Uint8Array>()
  f.bridge.pull.mockReturnValueOnce(remote.promise)
  const running = f.c.copyRemote()
  await f.c.copyRemote()
  expect(f.bridge.pull).toHaveBeenCalledOnce()
  f.c.setRevision(3)
  remote.resolve(new Uint8Array([65]))
  await running
  expect(f.port.writeText).not.toHaveBeenCalled()
  f.port.readText.mockRejectedValueOnce(new Error('denied'))
  await f.c.sendLocal()
  f.c.edit('public')
  f.c.setRevision(3)
  expect(f.c.text()).toBe('public')
  f.c.dispose()
  const count = f.notify.mock.calls.length
  f.c.dispose()
  await f.c.sendLocal()
  expect(f.c.text()).toBe('')
  expect(f.notify).toHaveBeenCalledTimes(count)
  expect(vi.getTimerCount()).toBe(0)
})

// Main 再驗 UTF-8，不因 buffer 來自 Worker 就信任；late deadline 亦不採納。
it('rejects malformed remote buffers and checks elapsed deadlines at response entry', async () => {
  const f = fixture(),
    data = new Uint8Array([65, 0])
  f.bridge.pull.mockResolvedValueOnce(data)
  await f.c.copyRemote()
  expect(data).toEqual(new Uint8Array([0, 0]))
  expect(f.port.writeText).not.toHaveBeenCalled()
  expect(f.values.at(-1)?.code).toBe('clipboard_invalid')
  const p = pending<string>()
  f.port.readText.mockReturnValueOnce(p.promise)
  const running = f.c.sendLocal()
  vi.setSystemTime(6000)
  p.resolve('public late data')
  await running
  expect(f.bridge.push).not.toHaveBeenCalled()
  expect(f.values.at(-1)?.code).toBe('clipboard_timeout')
  f.c.dispose()
  expect(vi.getTimerCount()).toBe(0)
})
// manual retry 不補 lease 時間，失敗仍留固定剩餘期限而非旧快取副本。
it('preserves the original send lease on submission failure without resetting its expiry', async () => {
  const f = fixture()
  f.port.readText.mockRejectedValueOnce(new Error('denied'))
  await f.c.sendLocal()
  f.c.edit('public retained manual text')
  f.bridge.push.mockRejectedValueOnce(new Error('clipboard_unavailable'))
  vi.setSystemTime(20000)
  await f.c.submit()
  expect(f.c.text()).toBe('public retained manual text')
  expect(f.values.at(-1)).toMatchObject({ fallback: 'send', code: 'clipboard_unavailable' })
  vi.setSystemTime(30000)
  expect(f.c.text()).toBe('')
  f.c.dispose()
})

// rejection 入口也須驗實際 deadline，背景晚拒絕不能覆蓋原來的 timeout。
it('checks elapsed deadlines for late native rejection as well as resolution', async () => {
  const f = fixture(),
    p = pending<string>()
  f.port.readText.mockReturnValueOnce(p.promise)
  const running = f.c.sendLocal()
  vi.setSystemTime(6000)
  p.reject(new Error('native denied too late'))
  await running
  expect(f.values.at(-1)?.code).toBe('clipboard_timeout')
  expect(f.bridge.push).not.toHaveBeenCalled()
  f.c.dispose()
  expect(vi.getTimerCount()).toBe(0)
})
