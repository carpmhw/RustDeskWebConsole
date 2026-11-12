import { expect, it } from 'vitest'
import { IdleWatch } from './idle'

// 可控時鐘：分鐘數換算為毫秒推進，不依賴真實計時器。
function fixture(minutes: number) {
  let now = 0
  const watch = new IdleWatch(minutes, () => now)
  return {
    watch,
    advance: (ms: number) => {
      now += ms
    },
  }
}

// 到期前 60 秒進入警告並倒數，到期時回報一次 expired。
it('warns sixty seconds before expiry and expires once', () => {
  const { watch, advance } = fixture(5)
  expect(watch.tick()).toEqual({ phase: 'active', remaining: 300 })
  advance(239_000)
  expect(watch.tick()).toEqual({ phase: 'active', remaining: 61 })
  advance(1_000)
  expect(watch.tick()).toEqual({ phase: 'warning', remaining: 60 })
  advance(59_500)
  expect(watch.tick()).toEqual({ phase: 'warning', remaining: 1 })
  advance(500)
  expect(watch.tick()).toEqual({ phase: 'expired', remaining: 0 })
  advance(10_000)
  expect(watch.tick()).toEqual({ phase: 'expired', remaining: 0 })
})

// 任何本機活動（含倒數中按「繼續使用」）重新計時。
it('resets on local activity', () => {
  const { watch, advance } = fixture(5)
  advance(250_000)
  expect(watch.tick().phase).toBe('warning')
  watch.activity()
  expect(watch.tick()).toEqual({ phase: 'active', remaining: 300 })
})

// 到期後的活動不會讓已結束的連線復活。
it('stays expired after activity', () => {
  const { watch, advance } = fixture(5)
  advance(300_000)
  expect(watch.tick().phase).toBe('expired')
  watch.activity()
  expect(watch.tick().phase).toBe('expired')
})

// 重新開始連線時以 configure 重設，包括先前已到期的狀態。
it('configure starts a fresh period even after expiry', () => {
  const { watch, advance } = fixture(5)
  advance(300_000)
  expect(watch.tick().phase).toBe('expired')
  watch.configure(5)
  expect(watch.tick()).toEqual({ phase: 'active', remaining: 300 })
})

// 設定為 0 時停用；之後改為非 0 從設定當下開始計時。
it('is off when configured with zero', () => {
  const { watch, advance } = fixture(0)
  advance(10 * 3_600_000)
  expect(watch.tick()).toEqual({ phase: 'off', remaining: 0 })
  watch.configure(5)
  expect(watch.tick()).toEqual({ phase: 'active', remaining: 300 })
})
