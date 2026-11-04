import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { URL } from 'node:url'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { Script, createContext } from 'node:vm'
import { setImmediate } from 'node:timers'

const readyLine = 'receiver_tty_probe_ready\n'
const publicFailure = 'PUBLIC_EXCEPTION_MUST_NOT_BE_EMITTED'

// 能力缺失先以斷言呈現，不把module import例外當作行為RED。
async function sourceApi() {
  assert.equal(existsSync(new URL('./receiver-tty-probe.mjs', import.meta.url)), true)
  const api = await import('./receiver-tty-probe.mjs')
  assert.equal(typeof api.createReceiverTtyProbeSource, 'function')
  return api
}

// 只排空RAM Readable的nextTick／close事件，不接觸真TTY。
function turn() {
  // 讓真正Node stream事件完成，並非替probe實作清理邏輯。
  return new Promise((resolve) => setImmediate(resolve))
}

// 只替換時間與原生timer邊界，所有deadline判定仍跑生成碼。
class PublicClock {
  // 每個case使用獨立clock，沒有真timer或跨case狀態。
  constructor(options) {
    this.options = options
    this.time = 0
    this.next = 1
    this.tasks = new Map()
  }

  // 可注入建立失敗，但不得讓測試跳過生成碼的排程決策。
  schedule(callback, delay) {
    if (this.options.createTimerFailsAt === delay) throw new Error(publicFailure)
    const handle = { id: this.next++ }
    this.tasks.set(handle.id, { handle, callback, delay, due: this.time + delay })
    return handle
  }

  // 失敗時保留真正尚未移除的RAM task，以驗不能假報清理完成。
  clear(handle) {
    const task = this.tasks.get(handle.id)
    if (task && task.delay === this.options.clearTimerFailsAt) throw new Error(publicFailure)
    this.tasks.delete(handle.id)
  }

  // 先移動觀察時間再執行到期task，可重現event loop晚到而非理想準時timer。
  advance(milliseconds) {
    this.time += milliseconds
    for (let count = 0; count < 30; count++) {
      const due = [...this.tasks.values()]
        // 排序只服務公開clock，不替probe推導成功或失敗。
        .filter((task) => task.due <= this.time)
        // 同一截止依建立次序執行，與傳送資料的動作分開控制。
        .sort((a, b) => a.due - b.due || a.handle.id - b.handle.id)[0]
      if (!due) return
      this.tasks.delete(due.handle.id)
      due.callback()
    }
    assert.fail('probe scheduled an unbounded timer loop')
  }
}

// RAM Readable保留真正的data自動resume／buffer／destroy／close語意。
class PublicTty extends Readable {
  // 只替換沒有硬體的raw-mode API及指定故障邊界。
  constructor(options) {
    super()
    this.options = options
    this.isTTY = options.stdinTty ?? true
    this.isRaw = options.initialRaw ?? false
    this.rawTransitions = []
    this.readCalls = 0
    this.pendingDestroy = null
  }

  // 不從OS讀資料，public bytes只由case明確push。
  _read() {
    this.readCalls++
  }

  // destroy後的adapter不保證保留buffer metadata；probe必須在關閉前鎖定額外輸入。
  get readableLength() {
    if (this.options?.bufferMetadataThrows && this.isRaw) throw new Error(publicFailure)
    if (this.options?.hideBufferAfterDestroy && this.destroyed) return 0
    return super.readableLength
  }

  // 真正close事件仍由Readable發出，延遲只停在原生destroy callback邊界。
  _destroy(error, callback) {
    if (this.options.holdClose) this.pendingDestroy = callback
    else callback(error)
  }

  // 模擬呼叫拋錯前後的模式變化，避免只看isRaw欄位就誤判還原成功。
  setRawMode(value) {
    this.rawTransitions.push(value)
    if (value && this.options.enterThrowsBefore) throw new Error(publicFailure)
    if (!value && this.options.restoreThrowsBefore) throw new Error(publicFailure)
    if (!(value ? this.options.enterNoop : this.options.restoreNoop)) this.isRaw = value
    if (value && this.options.enterThrowsAfter) throw new Error(publicFailure)
    if (!value && this.options.restoreThrowsAfter) throw new Error(publicFailure)
    return this
  }

  // 保留真pause副作用，只在raw階段注入原生失敗。
  pause() {
    if (this.isRaw && this.options.pauseFails) throw new Error(publicFailure)
    return super.pause()
  }

  // 保留真resume行為，不能用假的事件分派掩蓋過早開始讀取。
  resume() {
    if (this.options.resumeFails) throw new Error(publicFailure)
    return super.resume()
  }

  // 同步close後拋錯是故意注入的部分副作用，不能在destroy返回前先成功。
  destroy(error) {
    if (this.options.destroyThrows) throw new Error(publicFailure)
    if (this.options.closeThenThrow) {
      this.emit('close')
      throw new Error(publicFailure)
    }
    return super.destroy(error)
  }

  // 只解除此公開RAM stream的native-boundary停頓。
  completeClose() {
    assert.equal(typeof this.pendingDestroy, 'function')
    const callback = this.pendingDestroy
    this.pendingDestroy = null
    callback(null)
  }
}

// 只保留public process metadata與exit證據，不能終止測試宿主。
class PublicProcess extends EventEmitter {
  // 非0／2初值可抓到生成碼沒有明確fail-closed的缺陷。
  constructor(input, options) {
    super()
    this.stdin = input
    this.stdout = { isTTY: options.stdoutTty ?? true }
    this.platform = options.platform ?? 'win32'
    this.arch = options.arch ?? 'x64'
    this.version = options.version ?? 'v24.22.1'
    this.env = options.env ?? {
      RDWEB_RECEIVER_TTY_PROBE_AUTHORIZE: 'tty-cancel-public-fixture-v1',
    }
    this.value = 19
    this.exitHistory = []
    this.forcedExits = []
  }

  // 記錄真正生成碼設定的退出值，不以測試自己補成功。
  set exitCode(value) {
    this.value = value
    this.exitHistory.push(value)
  }

  // 暴露child可觀察的狀態，不回傳probe私有狀態機。
  get exitCode() {
    return this.value
  }

  // 僅模擬自身child強制失敗退出；不得真的呼叫宿主process.exit。
  exit(code) {
    this.forcedExits.push(code)
    this.exitCode = code
  }
}

// 每例執行原始生成artifact；VM不提供真fs／TTY／socket或其他import能力。
async function fixture(options = {}) {
  const api = await sourceApi()
  const source = api.createReceiverTtyProbeSource()
  assert.equal(typeof source, 'string')
  assert.equal(source.length <= 16000, true)
  const clock = new PublicClock(options)
  const input = new PublicTty(options)
  const runtime = new PublicProcess(input, options)
  const writes = []
  if (options.setup) options.setup(input, runtime, clock)

  // 只允許已繼承stdout上的固定public READY，不提供開檔或讀檔API。
  function writeSync(fd, text) {
    assert.equal(fd, 1)
    assert.equal(text, readyLine)
    assert.equal(input.readableFlowing, false)
    assert.equal(input.readCalls, 0)
    if (options.writeFails) throw new Error(publicFailure)
    writes.push(text)
    if (options.slowWrite) clock.time += 5000
    return options.shortWrite ? 0 : Buffer.byteLength(text)
  }

  const context = createContext(
    {
      process: runtime,
      Buffer,
      performance: {
        // 故障只改clock邊界，不由fixture計算probe的deadline結果。
        now() {
          if (options.clockFails) throw new Error(publicFailure)
          return clock.time
        },
      },
      // 排程與取消均使用此case的公開clock。
      setTimeout(callback, delay) {
        return clock.schedule(callback, delay)
      },
      // 清理的實際副作用可由pending task驗證。
      clearTimeout(handle) {
        clock.clear(handle)
      },
      // 不允許生成碼借VM逃到真Node I/O。
      require(name) {
        assert.equal(name, 'node:fs')
        return { writeSync }
      },
    },
    { codeGeneration: { strings: false, wasm: false } },
  )
  new Script(source).runInContext(context, { timeout: 1000 })
  return { input, runtime, clock, writes }
}

// 正常終態必須源自真Readable close及實際移除／取消副作用。
function assertClosed(p) {
  assert.equal(p.input.closed, true)
  assert.equal(p.input.isRaw, false)
  assert.equal(p.input.readableFlowing, false)
  for (const name of ['data', 'error', 'end', 'close']) {
    assert.equal(p.input.listenerCount(name), 0)
  }
  assert.equal(p.clock.tasks.size, 0)
  assert.deepEqual(p.writes, [readyLine])
}

// 只送新公開Ctrl+C fixture，不從真終端或剪貼簿取得資料。
async function cancel(p) {
  const bytes = Buffer.from([3])
  p.input.push(bytes)
  await turn()
  // 只比較清除布林，不讓assert失敗時列出輸入bytes。
  assert.equal(
    bytes.every((value) => value === 0),
    true,
  )
  p.clock.advance(0)
  await turn()
}

// 若刪除取消觀察、還原或close gate，此正向／中間態斷言會抓到假成功。
test('accepts public Ctrl+C only after actual raw restoration and close', async () => {
  const p = await fixture()
  assert.deepEqual(p.writes, [readyLine])
  assert.equal(p.runtime.exitCode, 2)
  assert.deepEqual(p.input.rawTransitions, [true])
  await cancel(p)
  assert.equal(p.runtime.exitCode, 0)
  assert.deepEqual(p.input.rawTransitions, [true, false])
  assert.deepEqual(p.runtime.forcedExits, [])
  assertClosed(p)
})

// 錯scope若仍切raw／pause／destroy，必須在接觸終端前被拒絕。
for (const [label, options] of [
  ['authorization absent', { env: {} }],
  ['authorization wrong', { env: { RDWEB_RECEIVER_TTY_PROBE_AUTHORIZE: 'wrong' } }],
  ['CI', { env: { CI: '1', RDWEB_RECEIVER_TTY_PROBE_AUTHORIZE: 'tty-cancel-public-fixture-v1' } }],
  ['wrong platform', { platform: 'linux' }],
  ['wrong architecture', { arch: 'arm64' }],
  ['wrong runtime', { version: 'v24.99.0' }],
  ['stdin redirected', { stdinTty: false }],
  ['stdout redirected', { stdoutTty: false }],
  ['already raw', { initialRaw: true }],
]) {
  // 只觀察生成碼的模式／輸出／退出結果，不以fixture分支代替guard。
  test(`rejects ${label} without acquiring input`, async () => {
    const p = await fixture(options)
    assert.equal(p.runtime.exitCode, 2)
    assert.deepEqual(p.input.rawTransitions, [])
    assert.equal(p.input.destroyed, false)
    assert.equal(p.input.readableFlowing, null)
    assert.deepEqual(p.writes, [])
    assert.equal(p.clock.tasks.size, 0)
  })
}

// 已有消費者或buffer不能被探針搶走，也不能自行清除別人的狀態。
for (const event of ['data', 'readable']) {
  // 外部reader是既有狀態fixture，probe必須完全不取得其模式。
  test(`rejects an existing ${event} consumer`, async () => {
    const p = await fixture({
      // 註冊真正Readable的消費者，而非硬編一個listenerCount。
      setup(input) {
        // 不讀或記錄任何資料，只代表已有其他consumer。
        input.on(event, () => {})
      },
    })
    assert.equal(p.runtime.exitCode, 2)
    assert.deepEqual(p.input.rawTransitions, [])
    assert.equal(p.input.destroyed, false)
    assert.equal(p.input.listenerCount(event), 1)
  })
}

// setup印出的READY不能讓慢到超過deadline的操作仍啟動讀取。
for (const options of [{ writeFails: true }, { shortWrite: true }, { slowWrite: true }]) {
  // 失敗的prompt必須還原已取得模式，不留下active reader。
  test(`rejects prompt fault ${Object.keys(options)[0]}`, async () => {
    const p = await fixture(options)
    await turn()
    assert.equal(p.runtime.exitCode, 2)
    assert.deepEqual(p.input.rawTransitions, [true, false])
    assert.equal(p.input.readCalls, 0)
    assert.equal(p.input.closed, true)
    assert.equal(p.clock.tasks.size, 0)
    assert.equal(
      p.writes.every((line) => line === readyLine),
      true,
    )
  })
}

// 非Ctrl+C、重複或超額資料不得截斷成取消成功，且不回顯輸入。
for (const bytes of [Buffer.from([65]), Buffer.from([3, 3]), Buffer.alloc(0)]) {
  // 以真事件將public Buffer送至生成碼；斷言只列布林與退出碼。
  test('rejects unexpected public input without echoing bytes', async () => {
    const p = await fixture()
    p.input.emit('data', bytes)
    p.clock.advance(0)
    await turn()
    assert.equal(p.runtime.exitCode, 2)
    assert.equal(
      bytes.every((value) => value === 0),
      true,
    )
    assertClosed(p)
  })
}

// 一般字串不能冒充原生二進位stdin；不得為診斷把它轉成文字輸出。
test('rejects non-buffer input without coercion or logging', async () => {
  const p = await fixture()
  p.input.emit('data', 'PUBLIC_INPUT_MUST_NOT_BE_EMITTED')
  p.clock.advance(0)
  await turn()
  assert.equal(p.runtime.exitCode, 2)
  assertClosed(p)
})

// Ctrl+C後pause留下的額外buffer不可被destroy掩蓋成完整取消。
test('rejects extra buffered input before cleanup completes', async () => {
  const p = await fixture()
  p.input.push(Buffer.from([3]))
  await turn()
  p.input.push(Buffer.from([3]))
  p.clock.advance(0)
  await turn()
  assert.equal(p.runtime.exitCode, 2)
  assert.equal(p.runtime.exitHistory.includes(0), false)
})

// 若只在close後查buffer，destroy抹去metadata就會把額外輸入誤判為成功。
test('latches extra buffered input before destroy can hide its metadata', async () => {
  const p = await fixture({ hideBufferAfterDestroy: true })
  p.input.push(Buffer.from([3]))
  await turn()
  p.input.push(Buffer.from([3]))
  assert.equal(p.input.readableLength > 0, true)
  p.clock.advance(0)
  await turn()
  assert.equal(p.runtime.exitCode, 2)
  assert.equal(p.runtime.exitHistory.includes(0), false)
})

// 額外輸入metadata不足必須拒絕，但不能阻止對已取得raw mode的還原嘗試。
test('still restores raw mode if buffered-input metadata becomes unavailable', async () => {
  const p = await fixture({ bufferMetadataThrows: true })
  await cancel(p)
  assert.equal(p.runtime.exitCode, 2)
  assert.deepEqual(p.input.rawTransitions, [true, false])
  assert.equal(p.input.isRaw, false)
})

// 取消被觀察後就已開始清理，不能等下一個turn才重新取得兩秒預算。
test('includes a delayed cleanup turn in the original cleanup budget', async () => {
  const p = await fixture()
  p.input.push(Buffer.from([3]))
  await turn()
  p.clock.time = 2000
  p.clock.advance(0)
  await turn()
  assert.equal(p.runtime.exitCode, 2)
  assert.equal(p.runtime.exitHistory.includes(0), false)
  assert.deepEqual(p.input.rawTransitions, [true, false])
})

// 原生pause耗時也屬同一清理預算，不得被晚起算的clock隱去。
test('includes synchronous pause time in the original cleanup budget', async () => {
  const p = await fixture({
    // 僅在真正Readable pause返回後注入原生耗時，保留其flowing副作用。
    setup(input, runtime, clock) {
      const pause = input.pause.bind(input)
      // initial pause不耗時，raw取消後的pause才模擬超過原截止。
      input.pause = function () {
        const result = pause()
        if (this.isRaw) clock.time += 2000
        return result
      }
    },
  })
  await cancel(p)
  assert.equal(p.runtime.exitCode, 2)
  assert.equal(p.runtime.exitHistory.includes(0), false)
})

// 同turn的重複事件與晚到的舊callback要分開：前者拒絕，後者不得重開模式。
test('rejects a duplicate callback before terminal cleanup', async () => {
  const p = await fixture()
  const onData = p.input.listeners('data')[0]
  p.input.push(Buffer.from([3]))
  await turn()
  onData(Buffer.from([3]))
  p.clock.advance(0)
  await turn()
  assert.equal(p.runtime.exitCode, 2)
  assertClosed(p)
})

// 若移除terminal guard，晚到callback會新增timer／模式切換或翻轉退出結果。
test('ignores old callbacks after successful cleanup', async () => {
  const p = await fixture()
  const onData = p.input.listeners('data')[0]
  const onError = p.input.listeners('error')[0]
  const onClose = p.input.listeners('close')[0]
  await cancel(p)
  const late = Buffer.from([3])
  onData(late)
  onError(new Error(publicFailure))
  onClose()
  p.clock.advance(20000)
  assert.equal(
    late.every((value) => value === 0),
    true,
  )
  assert.equal(p.runtime.exitCode, 0)
  assert.deepEqual(p.input.rawTransitions, [true, false])
  assertClosed(p)
})

// deadline須依monotonic觀察時間，不可只等timer callback先到。
test('rejects Ctrl+C delivered exactly at the input deadline before its timer', async () => {
  const p = await fixture()
  p.clock.time = 10000
  await cancel(p)
  assert.equal(p.runtime.exitCode, 2)
  assertClosed(p)
})

// 輸入窗內不任意縮短deadline，正常尾端事件仍可成功。
test('accepts Ctrl+C just inside the input deadline', async () => {
  const p = await fixture()
  p.clock.advance(9999)
  await cancel(p)
  assert.equal(p.runtime.exitCode, 0)
  assertClosed(p)
})

// 逾時不是取消，晚到的Ctrl+C也不能補成PASS。
test('times out without input and cannot be revived by a late callback', async () => {
  const p = await fixture()
  const onData = p.input.listeners('data')[0]
  p.clock.advance(10000)
  await turn()
  onData(Buffer.from([3]))
  assert.equal(p.runtime.exitCode, 2)
  assertClosed(p)
})

// 沒有Ctrl+C的原生error／EOF／提前close都要走還原，而非只留下預設exit2。
for (const event of ['error', 'end', 'close']) {
  // 真Readable生命週期仍保留，只有觸發的外部終態不同。
  test(`restores and rejects ${event} before cancellation`, async () => {
    const p = await fixture()
    if (event === 'close') p.input.destroy()
    else p.input.emit(event, new Error(publicFailure))
    await turn()
    p.clock.advance(0)
    await turn()
    assert.equal(p.runtime.exitCode, 2)
    assert.deepEqual(p.input.rawTransitions, [true, false])
    // 真Readable提前destroy後pause可能保留flowing=True；此不足只能拒絕，不能補成功。
    if (event !== 'close') assertClosed(p)
    else {
      assert.equal(p.runtime.exitHistory.includes(0), false)
      assert.equal(p.input.closed, true)
      assert.equal(p.input.isRaw, false)
      for (const name of ['data', 'error', 'end', 'close']) {
        assert.equal(p.input.listenerCount(name), 0)
      }
      assert.equal(p.clock.tasks.size, 0)
      assert.deepEqual(p.writes, [readyLine])
    }
  })
}

// reader已close仍不代表所有自有listener已移除，部分清理故障不能回exit0。
test('rejects listener cleanup failure even after native input closes', async () => {
  const p = await fixture({
    // 只在移除error listener的邊界注入失敗，其餘保留真EventEmitter副作用。
    setup(input) {
      const remove = input.removeListener.bind(input)
      // 不能讓一個清理錯誤跳過其他自有資源收尾。
      input.removeListener = function (event, callback) {
        if (event === 'error') throw new Error(publicFailure)
        return remove(event, callback)
      }
    },
  })
  await cancel(p)
  assert.equal(p.runtime.exitCode, 2)
  assert.equal(p.input.closed, true)
  assert.equal(p.input.isRaw, false)
  assert.equal(p.input.listenerCount('data'), 0)
  assert.equal(p.input.listenerCount('error'), 1)
  assert.equal(p.runtime.exitHistory.includes(0), false)
})

// 原生API拋錯前後與無副作用返回都必須保留失敗，不能只看最後isRaw。
for (const key of [
  'enterThrowsBefore',
  'enterThrowsAfter',
  'enterNoop',
  'restoreThrowsBefore',
  'restoreThrowsAfter',
  'restoreNoop',
  'pauseFails',
  'resumeFails',
  'destroyThrows',
  'closeThenThrow',
]) {
  // 以原生邊界故障執行真正cleanup，不由fixture代設結果。
  test(`rejects native boundary fault ${key}`, async () => {
    const p = await fixture({ [key]: true })
    if (p.writes.length === 1 && !p.input.destroyed) {
      p.input.emit('data', Buffer.from([3]))
    }
    p.clock.advance(0)
    await turn()
    p.clock.advance(2000)
    await turn()
    assert.equal(p.runtime.exitCode, 2)
    assert.equal(p.runtime.exitHistory.includes(0), false)
    assert.equal(p.input.rawTransitions.includes(false), true)
    assert.equal(
      p.writes.every((line) => line === readyLine),
      true,
    )
  })
}

// destroy呼叫返回不等於收到native close，不能在兩者間先設成功。
test('waits for actual close within the shared cleanup deadline', async () => {
  const p = await fixture({ holdClose: true })
  await cancel(p)
  assert.equal(p.runtime.exitCode, 2)
  assert.equal(p.input.closed, false)
  p.clock.advance(1999)
  p.input.completeClose()
  await turn()
  assert.equal(p.runtime.exitCode, 0)
  assertClosed(p)
})

// 失敗後的close不能覆寫缺證據終態；強制退出只屬不可用收尾。
test('fails closed when actual close misses its cleanup deadline', async () => {
  const p = await fixture({ holdClose: true })
  await cancel(p)
  p.clock.advance(2000)
  assert.deepEqual(p.runtime.forcedExits, [2])
  p.input.completeClose()
  await turn()
  assert.equal(p.runtime.exitCode, 2)
  assert.equal(p.runtime.exitHistory.includes(0), false)
})

// timer建立／移除失敗不能以finally補成功，也不能藉重試掩蓋。
for (const options of [
  { createTimerFailsAt: 0 },
  { createTimerFailsAt: 2000 },
  { clearTimerFailsAt: 10000 },
]) {
  // 真實生成碼仍須嘗試還原；只有timer邊界被替換。
  test(`rejects timer boundary fault ${JSON.stringify(options)}`, async () => {
    const p = await fixture(options)
    await cancel(p)
    p.clock.advance(20000)
    assert.equal(p.runtime.exitCode, 2)
    assert.equal(p.runtime.exitHistory.includes(0), false)
    assert.deepEqual(p.input.rawTransitions, [true, false])
  })
}

// 缺少可信時鐘與時間倒退都不得接受取消，即使最終資源看似已關閉。
test('rejects an unavailable monotonic clock before changing modes', async () => {
  const p = await fixture({ clockFails: true })
  assert.equal(p.runtime.exitCode, 2)
  assert.deepEqual(p.input.rawTransitions, [])
})

// timer尚未執行不代表事件仍在原窗內，倒退也不能增加觀察時間。
test('rejects clock regression during input', async () => {
  const p = await fixture()
  p.clock.time = -1
  await cancel(p)
  assert.equal(p.runtime.exitCode, 2)
  assert.equal(p.runtime.exitHistory.includes(0), false)
})
