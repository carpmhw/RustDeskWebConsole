import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { performance } from 'node:perf_hooks'
import { clearTimeout, setTimeout } from 'node:timers'
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'

const fixture = fileURLToPath(
  new URL(
    '../receiver/native-supervisor/Fixtures/PUBLIC 空格 繁體/receiver-native-case.mjs',
    import.meta.url,
  ),
)

// 本函數只擁有工廠回傳的直接child，兩路各128bytes、一次取消與固定共同截止。
function collectCase(createChild, clock, normalEnd, hardEnd) {
  // Promise內只回安全結果；原error物件與逾額資料不保存或輸出。
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let failed = false
    let closed = false
    let settled = false
    let cancelled = false
    let normalTimer = null
    let cleanupTimer = null
    let child
    const caseEnd = Math.min(normalEnd, clock.now() + 2000)

    // close或收尾截止只結案一次，晚到事件不能修改已回傳的安全標量。
    const finish = (code, signal) => {
      if (settled) return
      settled = true
      clock.cancel(normalTimer)
      clock.cancel(cleanupTimer)
      resolve(Object.freeze({ failed, closed, code, signal, stdout, stderr }))
    }

    // 取消要求不代表close；不重試、不延長最初的cleanup截止。
    const abort = () => {
      if (settled || closed) return
      failed = true
      if (cancelled) return
      cancelled = true
      clock.cancel(normalTimer)
      const cleanupEnd = Math.min(hardEnd, clock.now() + 2000)
      if (clock.now() >= hardEnd) {
        finish(null, null)
        return
      }
      try {
        child.kill('SIGKILL')
      } catch {
        // kill錯誤不印例外；仍以close或原截止結案，不補第二次取消。
      }
      if (!settled) {
        // 原生close未確認只能回失敗，不能由kill返回值推定完成。
        cleanupTimer = clock.schedule(
          () => finish(null, null),
          Math.max(0, cleanupEnd - clock.now()),
        )
      }
    }

    // 先判共同期限，不能先spawn再發現沒有正常預算。
    if (clock.now() >= caseEnd) {
      failed = true
      finish(null, null)
      return
    }
    try {
      child = createChild()
    } catch {
      failed = true
      finish(null, null)
      return
    }

    // 只有close可確認stdio及直接child結案，exit事件本身不足。
    child.once('close', (code, signal) => {
      closed = true
      if (signal !== null || clock.now() >= caseEnd) failed = true
      finish(code, signal)
    })
    child.on('error', abort)
    child.stdout.on('error', abort)
    child.stderr.on('error', abort)

    // 任何超額chunk在串接前拒絕，已取消／結案後不再累積資料。
    const append = (isStdout, chunk) => {
      if (settled || failed) return
      const current = isStdout ? stdout : stderr
      if (current.length + chunk.length > 128) {
        abort()
        return
      }
      if (isStdout) stdout = Buffer.concat([stdout, chunk])
      else stderr = Buffer.concat([stderr, chunk])
    }
    // 不將兩路混流或逐行重印，Node預設binary stream提供Buffer。
    child.stdout.on('data', (chunk) => append(true, chunk))
    // stderr也獨立計上限與保留固定bytes，不套文字解碼。
    child.stderr.on('data', (chunk) => append(false, chunk))
    normalTimer = clock.schedule(abort, Math.max(0, caseEnd - clock.now()))
  })
}

// 固定安全斷言，不讓測試framework印出實際argv／stdout／stderr或例外。
function check(condition) {
  if (!condition) throw new Error('receiver_fixture_assertion_failed')
}

// 只取代OS child與timer；collector仍是同一個真實被測函數。
function fakeRuntime(closeOnKill = true) {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kills = 0
  // fake只模擬取消回值與close事件，不稱實際SIGKILL已驗。
  child.kill = (signal) => {
    check(signal === 'SIGKILL')
    child.kills++
    if (closeOnKill) child.emit('close', null, 'SIGKILL')
    return closeOnKill
  }
  let now = 0
  let next = 0
  const timers = new Map()
  return {
    child,
    // 工廠僅在本測試閉包內存在，無CLI或任意命令入口。
    createChild() {
      return child
    },
    clock: {
      // 同一個可控單調時間，不由collector重設。
      now() {
        return now
      },
      // 記錄固定截止，供測試觀察是否錯誤補時。
      schedule(run, delay) {
        const id = ++next
        timers.set(id, { at: now + delay, run })
        return id
      },
      // 只取消本collector持有的timer。
      cancel(id) {
        timers.delete(id)
      },
    },
    // 測試精確走到期限，不sleep或使用真hang程式。
    advance(milliseconds) {
      now += milliseconds
      for (const [id, timer] of timers) {
        if (timer.at > now) continue
        timers.delete(id)
        timer.run()
      }
    },
    // 只回本測試排程的metadata，不取真程序資料。
    pendingTimes() {
      return [...timers.values()].map((timer) => timer.at)
    },
  }
}

// 兩路恰128bytes均可收，正常close而非exit事件才完成collector。
async function collectorExactLimit() {
  const fake = fakeRuntime()
  const result = collectCase(fake.createChild, fake.clock, 18000, 20000)
  fake.child.emit('exit', 0, null)
  fake.child.stdout.emit('data', Buffer.alloc(128, 65))
  fake.child.stderr.emit('data', Buffer.alloc(128, 66))
  fake.child.emit('close', 0, null)
  const terminal = await result
  check(terminal.closed && !terminal.failed && terminal.code === 0)
  check(terminal.stdout.length === 128 && terminal.stderr.length === 128 && fake.child.kills === 0)
}

// 第129byte不可加入buffer，兩路共用一次取消且晚到資料不得復活。
async function collectorOverflow() {
  for (const stream of ['stdout', 'stderr']) {
    const fake = fakeRuntime()
    const result = collectCase(fake.createChild, fake.clock, 18000, 20000)
    fake.child[stream].emit('data', Buffer.alloc(127, 65))
    fake.child[stream].emit('data', Buffer.alloc(2, 65))
    fake.child.stdout.emit('data', Buffer.alloc(129, 66))
    const terminal = await result
    check(terminal.failed && terminal.closed && fake.child.kills === 1)
    check(terminal[stream].length === 127)
  }
}

// kill返回false不代表close；重複error不補截止，未確認時固定失敗。
async function collectorTimeout() {
  const fake = fakeRuntime(false)
  const result = collectCase(fake.createChild, fake.clock, 18000, 20000)
  fake.advance(2000)
  check(fake.child.kills === 1 && fake.pendingTimes()[0] === 4000)
  fake.advance(1999)
  fake.child.emit('error', new Error('PUBLIC_LATE_ERROR'))
  check(fake.child.kills === 1 && fake.pendingTimes()[0] === 4000)
  fake.advance(1)
  const terminal = await result
  check(terminal.failed && !terminal.closed)
  fake.child.emit('close', 0, null)
  check(!terminal.closed && fake.child.kills === 1)
  const shared = fakeRuntime(false)
  shared.advance(17999)
  const sharedResult = collectCase(shared.createChild, shared.clock, 18000, 20000)
  shared.advance(1)
  check(shared.child.kills === 1 && shared.pendingTimes()[0] === 20000)
  shared.advance(2000)
  check(!(await sharedResult).closed && shared.child.kills === 1)
}

// child及兩路error只安全失敗，不輸出原例外或再取消已close程序。
async function collectorErrors() {
  for (const source of ['child', 'stdout', 'stderr']) {
    const fake = fakeRuntime()
    const result = collectCase(fake.createChild, fake.clock, 18000, 20000)
    const emitter = source === 'child' ? fake.child : fake.child[source]
    emitter.emit('error', new Error('PUBLIC_ERROR'))
    const terminal = await result
    check(terminal.failed && terminal.closed && fake.child.kills === 1)
    emitter.emit('error', new Error('PUBLIC_LATE_ERROR'))
    check(fake.child.kills === 1)
  }
}

// 唯一真clock，整套normal18秒／hard20秒；每case不能自行追加總budget。
const systemClock = {
  // 只取本行程單調時間，不讀現場或他程序。
  now() {
    return performance.now()
  },
  // timer只負責同輪collector的截止，不另開子程序。
  schedule(run, delay) {
    return setTimeout(run, delay)
  },
  // 已close或失敗時取消本輪timer。
  cancel(timer) {
    clearTimeout(timer)
  },
}

// 只接受Linux無參數入口；真fixture與fake守衛都不執行PowerShell或Windows binary。
async function main() {
  if (process.platform !== 'linux' || process.argv.length !== 2) {
    console.log(
      'receiver_native_case_fixture_tests,status=unavailable,windowsNative=false,powershell=false',
    )
    process.exitCode = 2
    return
  }
  const guards = [
    ['CollectorExactLimit', collectorExactLimit],
    ['CollectorOverflow', collectorOverflow],
    ['CollectorTimeout', collectorTimeout],
    ['CollectorErrors', collectorErrors],
  ]
  let failed = 0
  for (const [name, run] of guards) {
    try {
      await run()
    } catch {
      failed++
      console.log(`receiver_native_case_fixture_test,name=${name},status=failed`)
    }
  }
  const cases = [
    ['E0', ['E0'], 0, '', ''],
    ['E1', ['E1'], 1, '', ''],
    ['E2', ['E2'], 2, '', ''],
    ['E7', ['E7'], 7, '', ''],
    ['O', ['O'], 0, 'PUBLIC_STDOUT', ''],
    ['R', ['R'], 0, '', 'PUBLIC_STDERR'],
    ['A', ['A', 'PUBLIC SPACE', 'PUBLIC_繁體中文'], 0, '', ''],
    ['MissingCase', [], 2, '', ''],
    ['UnknownCase', ['UNKNOWN'], 2, '', ''],
    ['ExtraE0Argument', ['E0', 'PUBLIC_EXTRA'], 2, '', ''],
    ['MissingAArgument', ['A', 'PUBLIC SPACE'], 2, '', ''],
    ['ReorderedAArguments', ['A', 'PUBLIC_繁體中文', 'PUBLIC SPACE'], 2, '', ''],
    ['ExtraAArgument', ['A', 'PUBLIC SPACE', 'PUBLIC_繁體中文', 'PUBLIC_EXTRA'], 2, '', ''],
    ['WrongUnicodeAArgument', ['A', 'PUBLIC SPACE', 'PUBLIC_中文'], 2, '', ''],
    ['LowercaseCase', ['e0'], 2, '', ''],
  ]
  let fixtureCases = 0
  if (failed === 0) {
    const start = systemClock.now()
    for (const [name, args, code, stdout, stderr] of cases) {
      // 只建固定實檔／既有execPath的直接child，不經shell或繼承秘密環境。
      const createChild = () =>
        spawn(process.execPath, [fixture, ...args], {
          env: { LANG: 'C.UTF-8' },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
        })
      const result = await collectCase(createChild, systemClock, start + 18000, start + 20000)
      fixtureCases++
      const accepted =
        result.closed &&
        !result.failed &&
        result.signal === null &&
        result.code === code &&
        result.stdout.equals(Buffer.from(stdout, 'ascii')) &&
        result.stderr.equals(Buffer.from(stderr, 'ascii'))
      if (!accepted) {
        failed++
        console.log(`receiver_native_case_fixture_test,name=${name},status=failed`)
      }
      if (!result.closed || result.failed) break
    }
  }
  console.log(
    `receiver_native_case_fixture_tests,guards=4,fixtureCases=${fixtureCases},failed=${failed},windowsNative=false,powershell=false`,
  )
  process.exitCode = failed === 0 ? 0 : 1
}

// 最外層也不輸出未知例外，保持只有固定安全分類。
try {
  await main()
} catch {
  console.log(
    'receiver_native_case_fixture_tests,status=unavailable,windowsNative=false,powershell=false',
  )
  process.exitCode = 1
}
