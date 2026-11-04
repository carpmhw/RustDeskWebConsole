// 此函數只序列化為另行授權後的child程式；import本模組不會操作TTY。
function receiverTtyProbe(process, Buffer, performance, setTimeout, clearTimeout, writeSync) {
  process.exitCode = 2
  let input
  let phase = 'setup'
  let scope = false
  let failed = false
  let lastTime = null
  let setupStarted = null
  let inputDeadline = null
  let cleanupStarted = null
  let rawAttempted = false
  let rawEntered = false
  let ready = false
  let resumed = false
  let cancelObserved = false
  let pauseAttempted = false
  let paused = false
  let restored = false
  let closeObserved = false
  let destroySettled = false
  let destroySucceeded = false
  let timersClean = true
  const timers = { setup: null, input: null, turn: null, cleanup: null }
  const ownedListeners = []

  // 時鐘不足或倒退只保留失敗，不以wall clock或假時間補成功。
  function now() {
    try {
      const value = performance.now()
      if (!Number.isFinite(value) || value < 0 || (lastTime !== null && value < lastTime)) {
        failed = true
        return null
      }
      lastTime = value
      return value
    } catch {
      failed = true
      return null
    }
  }

  // 每個自有timer至多取消一次，失敗不能以清空引用冒充已取消。
  function clearOwnedTimer(name) {
    const handle = timers[name]
    timers[name] = null
    if (handle === null) return
    try {
      clearTimeout(handle)
    } catch {
      failed = true
      timersClean = false
    }
  }

  // 只清除已取得的可變chunk，不轉字串、不保存內容或診斷其長度／hash。
  function wipe(chunk) {
    try {
      if (Buffer.isBuffer(chunk)) chunk.fill(0)
    } catch {
      if (phase !== 'done') failed = true
    }
  }

  // Ctrl+C後立刻停止自身讀取，且不重試失敗的原生pause。
  function pauseForCleanup() {
    if (pauseAttempted) return
    pauseAttempted = true
    try {
      input.pause()
      paused = input.readableFlowing === false
      if (!paused) failed = true
    } catch {
      failed = true
    }
  }

  // 僅在close及destroy返回都有證據後完成；強制退出永遠不能代表還原成功。
  function complete(force = false) {
    if (phase !== 'closing' || (!force && (!closeObserved || !destroySettled))) return
    phase = 'done'
    for (const name of ['setup', 'input', 'turn', 'cleanup']) clearOwnedTimer(name)
    let listenersClean = true
    for (const [event, callback] of ownedListeners) {
      try {
        input.removeListener(event, callback)
        if (input.listeners(event).includes(callback)) listenersClean = false
      } catch {
        listenersClean = false
      }
    }
    let inputClosed = false
    try {
      inputClosed =
        input.closed === true &&
        input.destroyed === true &&
        input.isRaw === false &&
        input.readableFlowing === false &&
        input.readableLength === 0 &&
        input.listenerCount('data') === 0 &&
        input.listenerCount('readable') === 0
    } catch {
      failed = true
    }
    const ended = now()
    const withinBudget = ended !== null && cleanupStarted !== null && ended - cleanupStarted < 2000
    const accepted =
      !force &&
      !failed &&
      scope &&
      rawEntered &&
      ready &&
      resumed &&
      cancelObserved &&
      paused &&
      restored &&
      closeObserved &&
      destroySucceeded &&
      inputClosed &&
      listenersClean &&
      timersClean &&
      withinBudget
    process.exitCode = accepted ? 0 : 2
    if (force) process.exit(2)
  }

  // native close逾時只能終止本child；外部必須把模式還原視為未確認。
  function onCleanupDeadline() {
    if (phase !== 'closing') return
    failed = true
    complete(true)
  }

  // 所有退出共用此owner，先還原模式，再關child自己的stdin並等待真close。
  function beginCleanup() {
    if (phase === 'done' || phase === 'closing') return
    if (!scope) {
      phase = 'done'
      return
    }
    phase = 'closing'
    if (cleanupStarted === null) cleanupStarted = now()
    for (const name of ['setup', 'input', 'turn']) clearOwnedTimer(name)
    const at = now()
    const remaining =
      at === null || cleanupStarted === null ? 0 : Math.max(0, 2000 - (at - cleanupStarted))
    try {
      timers.cleanup = setTimeout(onCleanupDeadline, remaining)
    } catch {
      failed = true
    }
    pauseForCleanup()
    try {
      // destroy可能丟棄buffer metadata，必須在關閉前先鎖定額外輸入失敗。
      if (input.readableLength !== 0) failed = true
    } catch {
      failed = true
    }
    try {
      if (rawAttempted) input.setRawMode(false)
      restored = input.isRaw === false
      if (!restored) failed = true
    } catch {
      failed = true
    }
    try {
      destroySucceeded = input.destroy() === input
      if (!destroySucceeded) failed = true
    } catch {
      failed = true
    } finally {
      destroySettled = true
    }
    if (closeObserved) complete()
  }

  // timer遲到也不能接受已過deadline的資料；只有armed階段才有輸入窗。
  function onDeadline() {
    if (phase !== 'setup' && phase !== 'armed') return
    failed = true
    beginCleanup()
  }

  // 輸入錯誤不能輸出exception，也不能被後來的close覆寫成成功。
  function onError() {
    if (phase === 'done') return
    failed = true
    beginCleanup()
  }

  // EOF不是Ctrl+C；只在本owner已進入關閉階段後忽略預期的end。
  function onEnd() {
    if (phase === 'done' || phase === 'closing') return
    failed = true
    beginCleanup()
  }

  // close可以同步重入，但不得早於destroy方法正常返回就先設定成功。
  function onClose() {
    if (phase === 'done') return
    closeObserved = true
    if (phase !== 'closing') {
      failed = true
      beginCleanup()
    } else if (destroySettled) complete()
  }

  // 只接受READY後的唯一單byte Ctrl+C；額外／晚到／未知資料不補成功。
  function onData(chunk) {
    if (phase === 'done') {
      wipe(chunk)
      return
    }
    try {
      const at = now()
      // 清理預算包含本callback內的pause與下一個turn的排程等待。
      if (cleanupStarted === null) cleanupStarted = at
      const valid =
        phase === 'armed' &&
        ready &&
        !cancelObserved &&
        at !== null &&
        at < inputDeadline &&
        input.isRaw === true &&
        input.listenerCount('data') === 1 &&
        input.listenerCount('readable') === 0 &&
        Buffer.isBuffer(chunk) &&
        chunk.length === 1 &&
        chunk[0] === 3
      if (valid) cancelObserved = true
      else failed = true
    } catch {
      failed = true
    } finally {
      wipe(chunk)
    }
    pauseForCleanup()
    if (phase === 'closing' || phase === 'done' || phase === 'stopping') return
    phase = 'stopping'
    try {
      timers.turn = setTimeout(beginCleanup, 0)
    } catch {
      failed = true
      beginCleanup()
    }
  }

  try {
    if (
      process.env.RDWEB_RECEIVER_TTY_PROBE_AUTHORIZE !== 'tty-cancel-public-fixture-v1' ||
      process.env.CI ||
      process.platform !== 'win32' ||
      process.arch !== 'x64' ||
      process.version !== 'v24.22.1' ||
      process.listenerCount('SIGINT') !== 0
    )
      return
    input = process.stdin
    if (
      input.isTTY !== true ||
      process.stdout.isTTY !== true ||
      input.isRaw !== false ||
      input.destroyed !== false ||
      input.closed !== false ||
      input.readableEncoding !== null ||
      input.readableFlowing === true ||
      input.readableLength !== 0 ||
      input.listenerCount('data') !== 0 ||
      input.listenerCount('readable') !== 0
    )
      return
    setupStarted = now()
    if (setupStarted === null) return
    scope = true
    timers.setup = setTimeout(onDeadline, 5000)
    // data listener會自動resume，因此先明確pause，再註冊自有消費者。
    input.pause()
    if (input.readableFlowing !== false) throw new Error()
    for (const pair of [
      ['error', onError],
      ['end', onEnd],
      ['close', onClose],
      ['data', onData],
    ]) {
      ownedListeners.push(pair)
      input.on(pair[0], pair[1])
      if (phase !== 'setup') return
    }
    rawAttempted = true
    input.setRawMode(true)
    if (phase !== 'setup') return
    rawEntered = input.isRaw === true
    if (!rawEntered) throw new Error()
    const beforePrompt = now()
    if (beforePrompt === null || beforePrompt - setupStarted >= 5000) throw new Error()
    const prompt = 'receiver_tty_probe_ready\n'
    if (writeSync(1, prompt) !== prompt.length) throw new Error()
    const armedAt = now()
    if (armedAt === null || armedAt - setupStarted >= 5000) throw new Error()
    clearOwnedTimer('setup')
    if (failed) throw new Error()
    inputDeadline = armedAt + 10000
    timers.input = setTimeout(onDeadline, 10000)
    ready = true
    phase = 'armed'
    input.resume()
    resumed = true
    if (phase === 'armed' && input.readableFlowing !== true) throw new Error()
  } catch {
    failed = true
    beginCleanup()
  }
}

// 只生成可另行核准的自包含程式；沒有live CLI，也不在import時讀取process.stdin。
export function createReceiverTtyProbeSource() {
  const source = `(${receiverTtyProbe.toString()})(process,Buffer,performance,setTimeout,clearTimeout,require('node:fs').writeSync);`
  if (source.length > 16000) throw new Error('receiver_tty_probe_unavailable')
  return source
}
