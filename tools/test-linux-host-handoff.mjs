import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  lstatSync,
  statSync,
  existsSync,
  readdirSync,
  symlinkSync,
  linkSync,
  chmodSync,
  copyFileSync,
  rmSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { setImmediate as turn } from 'node:timers/promises'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

const roots = []
const geometry = { x: 0, y: 152, width: 1075, height: 508 }
const unavailable = /^Error: host_handoff_unavailable$/

// 只建立本測試自有tmp，沒有操作者資料或Windows／SFTP連線。
function root() {
  const parent = mkdtempSync('/tmp/opencode/rdweb-handoff-test-')
  roots.push(parent)
  return join(parent, 'handoff')
}
// 清理範圍僅本測試新建且持有的精確tmp，不碰current／歷史FAIL。
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})
// 真模組缺失是首輪RED；只替換等待及輸出，不mock正式controller／schema／filesystem。
async function driver(path, wait, output = [], env = {}) {
  assert.ok(existsSync('tools/linux-host-handoff.mjs'), 'handoff module unavailable')
  const { createLinuxHandoff } = await import('./linux-host-handoff.mjs')
  return createLinuxHandoff(path, geometry, {
    env,
    wait,
    emit: /* 只收安全marker，測試不印公開fixture或未知資料。 */ (value) => output.push(value),
  })
}
// 控制原controller使用的performance時鐘，UTC與真檔案仍正常；一定還原全域。
async function clock(action) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance')
  const time = { now: 0 }
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: /* 與正式controller同一單調clock。 */ () => time.now },
  })
  try {
    await action(time)
  } finally {
    Object.defineProperty(globalThis, 'performance', original)
  }
}
// 只讀本測試剛建立的公開資料，不接觸操作者JSON。
function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
// 手寫metadata oracle，僅關聯ID／時間來自本次真controller；不是被測builder生成成功旗標。
function ready(path) {
  const m = json(join(path, 'current/manifest.json'))
  const r = json(join(path, 'current/start-request.json'))
  return {
    schemaVersion: 1,
    runId: m.runId,
    requestId: r.requestId,
    utc: r.createdUtc,
    policyAccepted: true,
    scopeVerified: true,
    observerReady: true,
    clockDomain: 'windows_host',
    frequency: 10000000,
    origin: 0,
  }
}
// 手寫正常host baseline，不假造console輸入／client oracle，也不讀剪貼簿。
function host(path) {
  const r = ready(path)
  return {
    schemaVersion: 1,
    runId: r.runId,
    requestId: r.requestId,
    startedUtc: r.utc,
    endedUtc: new Date(Date.parse(r.utc) + 1000).toISOString(),
    clockDomain: 'windows_host',
    observations: [
      {
        ordinal: 1,
        kind: 'baseline',
        tStartUs: 10,
        tEndUs: 20,
        clipboardOrdinal: null,
        notificationUs: null,
        scopeVerified: true,
        editorReadable: true,
        editorExact: false,
        editorStable: true,
        clipboardReadable: false,
        clipboardExact: false,
        clipboardStable: false,
        clipboardOwnerMatchesEditor: null,
        clipboardMatchesEditor: null,
        code: 'host_observed',
      },
    ],
    clipboardNotifications: 0,
    sampleAttempts: 2,
    overflow: false,
    unavailable: false,
    resourcesClosed: true,
    code: 'host_observed',
  }
}
// 交接只在上傳完成及0600後rename，與SFTP完成檔名約定相同。
function deliver(path, value = ready(path), mode = 0o600) {
  const upload = join(path, 'incoming/ready.json')
  writeFileSync(upload, JSON.stringify(value), { mode })
  chmodSync(upload, mode)
  renameSync(upload, join(path, 'incoming/ready-complete.json'))
}

// 只暫停本測試的真watch；讓斷言在watch catch以外執行，最後沿原deadline收尾。
async function pendingCommit(action, path = root()) {
  await clock(async (time) => {
    const output = []
    let release
    const d = await driver(
      path,
      /* 暫停poll但不替換正式controller。 */ () =>
        new Promise(
          /* 此resolver只供本測試釋放等待。 */ (resolve) => {
            release = resolve
          },
        ),
      output,
    )
    assert.equal(typeof d.commitReady, 'function', 'commit-ready unavailable')
    d.prepare()
    const watching = d.watch()
    try {
      await action({ path, d, output, time })
    } finally {
      time.now = 90000
      release()
      await assert.rejects(watching, unavailable)
    }
  })
}

// 模擬FileZilla已完成的公開metadata upload；不自行chmod或改成完成檔名。
function uploadReady(path, value = ready(path), mode = 0o644) {
  const upload = join(path, 'incoming/ready.json')
  writeFileSync(upload, JSON.stringify(value), { mode })
  chmodSync(upload, mode)
  return upload
}

// 使用真stream的TTY邊界替身；不連操作者終端或改raw mode。
function terminal() {
  const input = new PassThrough()
  input.isTTY = true
  return input
}
// 所有終態都須釋放自有listener並暫停輸入，不能留下process存活來源。
function inputClosed(input) {
  for (const event of ['data', 'end', 'error', 'close']) assert.equal(input.listenerCount(event), 0)
  assert.equal(input.destroyed || input.isPaused(), true)
}

// 只傳檔不能提交；Enter後同一原controller提交與確認，無需切第二終端。
for (const elapsed of [60000, 89999])
  test(`interactive watch requires Enter before committing and importing the uploaded ready at ${elapsed}ms`, async () => {
    await clock(async (time) => {
      const path = root(),
        input = terminal(),
        output = []
      let steps = 0,
        before
      const d = await driver(
        path,
        async () => {
          if (++steps === 1) {
            const file = uploadReady(path)
            before = statSync(file)
          } else {
            assert.equal(existsSync(join(path, 'incoming/ready.json')), true)
            assert.equal(existsSync(join(path, 'incoming/ready-complete.json')), false)
            time.now = elapsed
            input.write('\n')
            await turn()
          }
        },
        output,
      )
      assert.equal(typeof d.watchInteractive, 'function')
      d.prepare()
      await d.watchInteractive(input)
      inputClosed(input)
      assert.equal(steps, 2)
      assert.deepEqual(output, [
        'host_handoff_prepared,hrStarted=False',
        'host_handoff_start_requested,setupBudgetMs=90000,hrStarted=False',
        'host_handoff_upload_confirmation_requested,pressEnterAfterUpload=True,hrStarted=False',
        'host_handoff_ready_committed,liveSetupVerified=False,hrStarted=False',
        'host_handoff_ready_observed,linuxClaimVerified=True,liveSetupVerified=True,hrStarted=False',
      ])
      const completed = statSync(join(path, 'incoming/ready-complete.json'))
      assert.equal(completed.ino, before.ino)
      assert.equal(completed.mode & 0o7777, 0o600)
      assert.equal(existsSync(join(path, 'incoming/ready.json')), false)
      assert.equal(json(join(path, 'setup-status.json')).state, 'ready')
      const preserved = readFileSync(join(path, 'setup-status.json'))
      await assert.rejects(d.watchInteractive(terminal()), unavailable)
      assert.deepEqual(readFileSync(join(path, 'setup-status.json')), preserved)
      for (const file of ['client.json', 'joined.json', 'result.json'])
        assert.equal(existsSync(join(path, 'current', file)), false)
    })
  })

// 校準gate在處理排隊Enter之前，90000恰好逾時也不能chmod／rename。
for (const deadline of [90000, 90074]) {
  test(`interactive watch rejects queued Enter at original deadline ${deadline} without changing upload`, async () => {
    await clock(async (time) => {
      const path = root(),
        input = terminal(),
        output = []
      let before, bytes
      const d = await driver(
        path,
        async () => {
          const file = uploadReady(path)
          before = statSync(file)
          bytes = readFileSync(file)
          time.now = 89999
          input.write('\n')
          await turn()
          time.now = deadline
        },
        output,
      )
      assert.equal(typeof d.watchInteractive, 'function')
      d.prepare()
      await assert.rejects(d.watchInteractive(input), unavailable)
      inputClosed(input)
      const file = join(path, 'incoming/ready.json')
      assert.deepEqual(readFileSync(file), bytes)
      assert.equal(statSync(file).ino, before.ino)
      assert.equal(statSync(file).mode, before.mode)
      assert.equal(existsSync(join(path, 'incoming/ready-complete.json')), false)
      assert.equal(existsSync(join(path, 'current/ready.json')), false)
      assert.equal(
        output.some(/* 只檢查公開marker。 */ (line) => line.includes('ready_committed')),
        false,
      )
      assert.match(output.at(-1), /phase=poll,reason=deadline_exceeded,elapsedMs=900(00|74),/)
    })
  })
}

// 未確認、錯誤或外部完成檔均不能觸發自動提交；原文從不反射。
for (const scenario of [
  'nonempty',
  'oversized',
  'multiple',
  'eof',
  'error',
  'missing',
  'external',
  'no-confirmation',
  'SIGINT',
  'SIGTERM',
]) {
  test(`interactive watch fails closed for ${scenario} and releases input`, async () => {
    await clock(async (time) => {
      const path = root(),
        input = terminal(),
        output = []
      const signals = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]
      let before
      const d = await driver(
        path,
        async () => {
          if (scenario !== 'missing') before = statSync(uploadReady(path))
          if (scenario === 'nonempty') input.write('Public denied input\n')
          if (scenario === 'oversized') input.write(Buffer.alloc(65536, 65))
          if (scenario === 'multiple') input.write('\n\n')
          if (scenario === 'eof') input.end()
          if (scenario === 'error') input.emit('error', new Error('Public denied error'))
          if (scenario === 'missing') input.write('\n')
          if (scenario === 'SIGINT' || scenario === 'SIGTERM') process.emit(scenario)
          if (scenario === 'external')
            renameSync(
              join(path, 'incoming/ready.json'),
              join(path, 'incoming/ready-complete.json'),
            )
          if (scenario === 'no-confirmation') time.now = 90000
          await turn()
        },
        output,
      )
      assert.equal(typeof d.watchInteractive, 'function')
      d.prepare()
      await assert.rejects(d.watchInteractive(input), unavailable)
      inputClosed(input)
      assert.deepEqual([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')], signals)
      assert.equal(existsSync(join(path, 'current/ready.json')), false)
      assert.equal(json(join(path, 'setup-status.json')).state, 'failed')
      assert.equal(
        output.some(/* 不回顯stdin或exception。 */ (line) => /Public|AAAA/.test(line)),
        false,
      )
      assert.equal(
        output.some(/* 只有驗證成功才允許此marker。 */ (line) => line.includes('ready_committed')),
        false,
      )
      if (before && scenario !== 'external') {
        const after = statSync(join(path, 'incoming/ready.json'))
        assert.equal(after.ino, before.ino)
        assert.equal(after.mode, before.mode)
      }
    })
  })
}

// CRLF可能拆成兩個事件；不為等輸入新增timeout或重啟原controller。
test('interactive watch accepts split CRLF once and releases input on preflight failure', async () => {
  await clock(async () => {
    const path = root(),
      input = terminal()
    let steps = 0
    const d = await driver(path, async () => {
      if (++steps === 1) {
        uploadReady(path)
        input.write('\r')
      } else input.write('\n')
      await turn()
    })
    assert.equal(typeof d.watchInteractive, 'function')
    d.prepare()
    await d.watchInteractive(input)
    inputClosed(input)
    assert.equal(steps, 2)
    const other = terminal()
    await assert.rejects(d.watchInteractive(other), unavailable)
    inputClosed(other)
  })
})

// 非TTY不能透過pipe事先確認；在claim與request之前拒絕。
test('interactive watch refuses non-TTY before claiming the prepared run', async () => {
  const path = root(),
    input = terminal(),
    output = []
  input.isTTY = false
  const d = await driver(path, undefined, output)
  assert.equal(typeof d.watchInteractive, 'function')
  d.prepare()
  await assert.rejects(d.watchInteractive(input), unavailable)
  assert.deepEqual(readdirSync(join(path, 'current')), ['manifest.json'])
  assert.equal(existsSync(join(path, 'setup-status.json')), false)
  assert.deepEqual(output, ['host_handoff_prepared,hrStarted=False'])
})

// stream直接destroy也可能沒有end／error；不得等到原deadline才知道已無輸入。
test('interactive watch stops on closed input before waiting for its deadline', async () => {
  await clock(async (time) => {
    const path = root(),
      input = terminal(),
      output = []
    let waits = 0
    const d = await driver(
      path,
      async () => {
        if (++waits === 1) input.destroy()
        else time.now = 90000
        await turn()
      },
      output,
    )
    d.prepare()
    await assert.rejects(d.watchInteractive(input), unavailable)
    inputClosed(input)
    assert.equal(waits, 1)
    assert.match(output.at(-1), /phase=confirmation,reason=unknown,/)
  })
})

// 只在真lstat回ENOENT後出版公開fixture，重現外部rename恰好落在兩次檢查之間。
test('interactive watch never imports an external complete published between checks without Enter', async () => {
  await clock(async (time) => {
    const path = root(),
      input = terminal(),
      output = []
    let publish = false,
      published = false
    const d = await driver(
      path,
      async () => {
        if (published) time.now = 90000
        else {
          uploadReady(path, ready(path), 0o600)
          publish = true
        }
      },
      output,
    )
    d.prepare()
    const original = fs.lstatSync
    // 不偽造stat結果；僅排定另一上傳者的真rename發生時點，finally必還原binding。
    fs.lstatSync = function (file, ...args) {
      try {
        return original(file, ...args)
      } catch (error) {
        if (
          publish &&
          file === join(path, 'incoming/ready-complete.json') &&
          error.code === 'ENOENT'
        ) {
          publish = false
          published = true
          renameSync(join(path, 'incoming/ready.json'), file)
        }
        throw error
      }
    }
    syncBuiltinESMExports()
    try {
      await assert.rejects(d.watchInteractive(input), unavailable)
      assert.equal(published, true)
      assert.equal(existsSync(join(path, 'current/ready.json')), false)
      assert.equal(json(join(path, 'setup-status.json')).state, 'failed')
      inputClosed(input)
    } finally {
      fs.lstatSync = original
      syncBuiltinESMExports()
    }
  })
})

// 真CLI只能在TTY互動；預先pipe Enter與CI不能消耗任何舊case或建立新case。
test('interactive CLI refuses piped confirmation and preserves cases01-11 without opening case12', async () => {
  const cwd = root()
  mkdirSync(cwd, { mode: 0o700 })
  for (const name of [
    'tools/linux-host-handoff.mjs',
    'frontend/e2e-real/host-observation-control.ts',
    'frontend/e2e-real/host-observation-schema.ts',
  ]) {
    const target = join(cwd, name)
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    copyFileSync(name, target)
  }
  const files = []
  for (const number of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']) {
    const directory = join(cwd, `frontend/.cache/windows-host-handoff-${number}`)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const file = join(directory, 'FAIL')
    writeFileSync(file, 'Public preserved failure\n', { mode: 0o600 })
    files.push({ file, directory, before: statSync(file) })
  }
  for (const env of [{ PATH: process.env.PATH }, { PATH: process.env.PATH, CI: '1' }]) {
    const result = spawnSync(
      process.execPath,
      ['tools/linux-host-handoff.mjs', 'watch-interactive', '0', '152', '1075', '508'],
      {
        cwd,
        env,
        input: '\n',
        encoding: 'utf8',
        timeout: 5000,
      },
    )
    assert.equal(result.status, 2)
    assert.equal(result.stdout, 'host_handoff_unavailable,stage=watch-interactive\n')
    assert.equal(result.stderr, '')
  }
  for (const { file, directory, before } of files) {
    assert.equal(readFileSync(file, 'utf8'), 'Public preserved failure\n')
    assert.equal(statSync(file).ino, before.ino)
    assert.equal(statSync(file).mode, before.mode)
    assert.deepEqual(readdirSync(directory), ['FAIL'])
  }
  assert.equal(existsSync(join(cwd, 'frontend/.cache/windows-host-handoff-12')), false)
})

// 有效期由真controller判斷；不是以watch外層耗時推測timeout，也不改原status格式。
test('watch diagnostics report the source deadline and preserve the original failure status', async () => {
  await clock(async (time) => {
    time.now = 1000
    const path = root(),
      output = []
    const d = await driver(
      path,
      /* 只推進原單調clock。 */ async () => {
        time.now = 91000
      },
      output,
    )
    d.prepare()
    await assert.rejects(d.watch(), unavailable)
    assert.equal(
      output.at(-1),
      'host_handoff_watch_failed,phase=poll,reason=deadline_exceeded,elapsedMs=90000,clockDomain=linux_monotonic,elapsedSource=last_gate_sample,hrStarted=False',
    )
    const file = join(path, 'setup-status.json'),
      before = readFileSync(file),
      metadata = statSync(file)
    assert.deepEqual(Object.keys(json(file)), [
      'schemaVersion',
      'runId',
      'requestId',
      'state',
      'liveSetupVerified',
      'hrStarted',
    ])
    assert.equal(json(file).state, 'failed')
    assert.equal(json(file).liveSetupVerified, false)
    time.now = 1
    await assert.rejects(d.watch(), unavailable)
    assert.equal(
      output.at(-1),
      'host_handoff_watch_failed,phase=create,reason=unknown,elapsedMs=unknown,clockDomain=linux_monotonic,elapsedSource=last_gate_sample,hrStarted=False',
    )
    assert.deepEqual(readFileSync(file), before)
    assert.equal(statSync(file).ino, metadata.ino)
    for (const name of ['client.json', 'joined.json', 'result.json'])
      assert.equal(existsSync(join(path, 'current', name)), false)
  })
})

// 原identity guard先於deadline；即使校準elapsed已90秒也不能偽報timeout。
test('watch diagnostics retain identity precedence when the deadline is also exceeded', async () => {
  await clock(async (time) => {
    const path = root(),
      output = []
    const d = await driver(
      path,
      /* 真實改動自有scratch權限。 */ async () => {
        time.now = 90000
        chmodSync(join(path, 'current'), 0o755)
      },
      output,
    )
    d.prepare()
    await assert.rejects(d.watch(), unavailable)
    assert.equal(
      output.at(-1),
      'host_handoff_watch_failed,phase=poll,reason=identity_rejected,elapsedMs=90000,clockDomain=linux_monotonic,elapsedSource=last_gate_sample,hrStarted=False',
    )
    assert.equal(json(join(path, 'setup-status.json')).state, 'failed')
  })
})

// 直接current ready不是正式匯入成功；診斷仍維持原fail-closed guard。
test('watch diagnostics reject ready that appears before the controlled import', async () => {
  await clock(async (time) => {
    const path = root(),
      output = []
    const d = await driver(
      path,
      /* 模擬錯誤上傳current，但僅公開fixture。 */ async () => {
        time.now = 5
        writeFileSync(join(path, 'current/ready.json'), JSON.stringify(ready(path)), {
          mode: 0o600,
        })
      },
      output,
    )
    d.prepare()
    await assert.rejects(d.watch(), unavailable)
    assert.equal(
      output.at(-1),
      'host_handoff_watch_failed,phase=poll,reason=ready_before_import,elapsedMs=5,clockDomain=linux_monotonic,elapsedSource=last_gate_sample,hrStarted=False',
    )
    assert.equal(json(join(path, 'setup-status.json')).state, 'failed')
    assert.equal(existsSync(join(path, 'incoming/ready-complete.json')), false)
  })
})

// import沒有認證來源原因時保留unknown，未知payload／UUID／expected／path不進marker。
test('watch diagnostics keep import errors unknown and never echo rejected values', async () => {
  await clock(async (time) => {
    const path = root(),
      output = []
    const d = await driver(
      path,
      /* 真schema拒絕未知欄位。 */ async () => {
        time.now = 1
        deliver(path, { ...ready(path), text: 'Public denied diagnostic payload' })
      },
      output,
    )
    d.prepare()
    await assert.rejects(d.watch(), unavailable)
    assert.equal(
      output.at(-1),
      'host_handoff_watch_failed,phase=import,reason=unknown,elapsedMs=1,clockDomain=linux_monotonic,elapsedSource=last_gate_sample,hrStarted=False',
    )
    const m = json(join(path, 'current/manifest.json'))
    for (const denied of [path, m.runId, m.expected, 'Public denied diagnostic payload'])
      assert.equal(output.join('\n').includes(denied), false)
  })
})

// wait拋任意物件不執行getter／轉型；外層clock即使已90秒也不能猜deadline原因。
test('watch diagnostics ignore hostile exceptions and do not infer timeout from a later clock', async () => {
  await clock(async (time) => {
    const path = root(),
      output = []
    let reads = 0
    const denied = new Proxy(
      {},
      {
        get: /* 不能讀message／reason／stack。 */ () => {
          reads++
          throw new Error('Public denied getter')
        },
      },
    )
    const d = await driver(
      path,
      /* 原wait之外的未知拒絕。 */ async () => {
        time.now = 90000
        throw denied
      },
      output,
    )
    d.prepare()
    await assert.rejects(d.watch(), unavailable)
    assert.equal(
      output.at(-1),
      'host_handoff_watch_failed,phase=wait,reason=unknown,elapsedMs=0,clockDomain=linux_monotonic,elapsedSource=last_gate_sample,hrStarted=False',
    )
    assert.equal(reads, 0)
  })
})

// 診斷sink失敗不能取代原拒絕code或阻止原failed status保存。
test('watch diagnostics sink failures never replace the original unavailable code', async () => {
  await clock(async (time) => {
    const path = root(),
      output = []
    let attempts = 0
    output.push = /* 僅本測試自有sink；不替換controller或filesystem。 */ (line) => {
      if (line.startsWith('host_handoff_watch_failed,')) {
        attempts++
        throw new Error('Public denied diagnostic sink')
      }
      return Array.prototype.push.call(output, line)
    }
    const d = await driver(
      path,
      /* 真deadline仍沿原clock判斷。 */ async () => {
        time.now = 90000
      },
      output,
    )
    d.prepare()
    await assert.rejects(d.watch(), unavailable)
    assert.equal(attempts, 1)
    assert.equal(json(join(path, 'setup-status.json')).state, 'failed')
  })
})

// 真scratch subprocess確認新增marker不能取代原CLI unavailable／exit2；不碰live root12。
test('watch diagnostics CLI append metadata but preserve the original terminal code and exit', async () => {
  const cwd = root()
  mkdirSync(cwd, { mode: 0o700 })
  for (const name of [
    'tools/linux-host-handoff.mjs',
    'frontend/e2e-real/host-observation-control.ts',
    'frontend/e2e-real/host-observation-schema.ts',
  ]) {
    const target = join(cwd, name)
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    copyFileSync(name, target)
  }
  const args = ['tools/linux-host-handoff.mjs', 'prepare', '0', '152', '1075', '508']
  const prepared = spawnSync(process.execPath, args, {
    cwd,
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  })
  assert.equal(prepared.status, 0)
  const path = join(cwd, 'frontend/.cache/windows-host-handoff-12')
  assert.equal(existsSync(join(path, 'current')), true)
  writeFileSync(join(path, 'current/claim.json'), '{}', { mode: 0o600 })
  args[1] = 'watch'
  const watched = spawnSync(process.execPath, args, {
    cwd,
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  })
  assert.equal(watched.status, 2)
  assert.equal(watched.stderr, '')
  assert.equal(
    watched.stdout,
    'host_handoff_watch_failed,phase=create,reason=unknown,elapsedMs=unknown,clockDomain=linux_monotonic,elapsedSource=last_gate_sample,hrStarted=False\nhost_handoff_unavailable,stage=watch\n',
  )
  assert.equal(existsSync(join(path, 'setup-status.json')), false)
})

// 少了真正chmod／不覆寫提交或冒稱live setup，此case都會失敗。
test('commit-ready preserves uploaded bytes and inode, restricts mode and only reports submission', async () => {
  for (const mode of [0o600, 0o644])
    await pendingCommit(async ({ path, d, output }) => {
      assert.throws(() => d.commitReady(), unavailable)
      const upload = uploadReady(path, ready(path), mode)
      if (mode === 0o644) {
        const text = readFileSync(upload, 'utf8')
        writeFileSync(upload, text + ' '.repeat(8192 - Buffer.byteLength(text)))
      }
      const unrelated = join(path, 'incoming/unrelated.json')
      writeFileSync(unrelated, 'Public unrelated fixture', { mode: 0o644 })
      const before = statSync(upload),
        bytes = readFileSync(upload)
      d.commitReady()
      const completed = join(path, 'incoming/ready-complete.json')
      assert.equal(existsSync(upload), false)
      assert.deepEqual(readFileSync(completed), bytes)
      assert.equal(lstatSync(completed).ino, before.ino)
      assert.equal(lstatSync(completed).nlink, 1)
      assert.equal(lstatSync(completed).mode & 0o7777, 0o600)
      assert.equal(readFileSync(unrelated, 'utf8'), 'Public unrelated fixture')
      assert.equal(statSync(unrelated).mode & 0o777, 0o644)
      assert.equal(
        output.at(-1),
        'host_handoff_ready_committed,liveSetupVerified=False,hrStarted=False',
      )
      for (const name of ['ready.json', 'client.json', 'joined.json', 'result.json'])
        assert.equal(existsSync(join(path, 'current', name)), false)
      assert.equal(existsSync(join(path, 'setup-status.json')), false)
      assert.throws(() => d.commitReady(), unavailable)
      assert.deepEqual(readFileSync(completed), bytes)
      assert.equal(output.join('\n').includes(ready(path).runId), false)
    })
})

// 非同輪／不安全upload必須在chmod前拒絕，不能洩漏未知欄位或改動來源。
test('commit-ready rejects invalid uploads without changing their bytes mode or identity', async () => {
  for (const mutation of [
    'run',
    'request',
    'extra',
    'json',
    'utf8',
    'oversize',
    'symlink',
    'hardlink',
    'directory',
    'mode',
    'special',
    'incoming',
    'ancestor',
  ])
    await pendingCommit(async ({ path, d, output }) => {
      const value = ready(path)
      if (mutation === 'run') value.runId = '00000000-0000-4000-8000-000000000009'
      if (mutation === 'request') value.requestId = '00000000-0000-4000-8000-000000000009'
      if (mutation === 'extra') value.text = 'Public denied commit value'
      const upload = uploadReady(path, value)
      if (mutation === 'json') writeFileSync(upload, '{"text":"Public denied commit value"')
      if (mutation === 'utf8') writeFileSync(upload, Buffer.from([0xff]))
      if (mutation === 'oversize') writeFileSync(upload, JSON.stringify(value) + ' '.repeat(8193))
      if (mutation === 'mode') chmodSync(upload, 0o666)
      if (mutation === 'special') chmodSync(upload, 0o4644)
      if (mutation === 'symlink' || mutation === 'directory') {
        renameSync(upload, join(path, 'upload-target.json'))
        if (mutation === 'symlink') symlinkSync(join(path, 'upload-target.json'), upload)
        else mkdirSync(upload, { mode: 0o700 })
      }
      if (mutation === 'hardlink') linkSync(upload, join(path, 'linked-upload.json'))
      if (mutation === 'incoming') chmodSync(join(path, 'incoming'), 0o755)
      if (mutation === 'ancestor') {
        renameSync(join(path, 'incoming'), join(path, 'incoming-target'))
        symlinkSync(join(path, 'incoming-target'), join(path, 'incoming'))
      }
      const before = statSync(upload),
        linkBefore = lstatSync(upload)
      const bytes = before.isFile() ? readFileSync(upload) : null
      assert.throws(() => d.commitReady(), unavailable)
      assert.equal(statSync(upload).ino, before.ino)
      assert.equal(statSync(upload).mode, before.mode)
      assert.equal(lstatSync(upload).ino, linkBefore.ino)
      if (bytes) assert.deepEqual(readFileSync(upload), bytes)
      assert.equal(existsSync(join(path, 'incoming/ready-complete.json')), false)
      assert.equal(output.join('\n').includes('Public denied commit value'), false)
    })
})

// 完成目標即使是dangling symlink也屬既有證據，禁止chmod來源或覆寫／刪目標。
test('commit-ready preserves any preexisting completion target without chmodding the upload', async () => {
  for (const kind of ['file', 'directory', 'dangling'])
    await pendingCommit(async ({ path, d }) => {
      const upload = uploadReady(path)
      const completed = join(path, 'incoming/ready-complete.json')
      if (kind === 'file') writeFileSync(completed, 'Public preserved complete', { mode: 0o600 })
      if (kind === 'directory') mkdirSync(completed, { mode: 0o700 })
      if (kind === 'dangling') symlinkSync(join(path, 'missing-target'), completed)
      const before = lstatSync(completed),
        source = readFileSync(upload)
      assert.throws(() => d.commitReady(), unavailable)
      assert.equal(lstatSync(completed).ino, before.ino)
      assert.equal(lstatSync(completed).mode, before.mode)
      assert.deepEqual(readFileSync(upload), source)
      assert.equal(statSync(upload).mode & 0o777, 0o644)
      if (kind === 'file')
        assert.equal(readFileSync(completed, 'utf8'), 'Public preserved complete')
    })
})

// 沒有原claim/request或已進終態的case不可拿commit-ready補票／重啟。
test('commit-ready requires the original claimed request and refuses expired or terminal cases', async () => {
  for (const mutation of [
    'claim',
    'request',
    'expired',
    'setup-status.json',
    'result-status.json',
    'ready.json',
    'client.json',
    'joined.json',
    'result.json',
  ])
    await pendingCommit(async ({ path, d }) => {
      const upload = uploadReady(path)
      if (mutation === 'claim' || mutation === 'request') {
        const name = mutation === 'claim' ? 'claim.json' : 'start-request.json'
        renameSync(join(path, 'current', name), join(path, name))
      } else if (mutation === 'expired') {
        const m = json(join(path, 'current/manifest.json'))
        m.createdUtc = new Date(Date.now() - 1801000).toISOString()
        m.expiresUtc = new Date(Date.parse(m.createdUtc) + 1800000).toISOString()
        writeFileSync(join(path, 'current/manifest.json'), JSON.stringify(m))
      } else {
        const directory = mutation.endsWith('status.json') ? path : join(path, 'current')
        writeFileSync(join(directory, mutation), '{}', { mode: 0o600 })
      }
      const bytes = readFileSync(upload),
        before = statSync(upload)
      assert.throws(() => d.commitReady(), unavailable)
      assert.deepEqual(readFileSync(upload), bytes)
      assert.equal(statSync(upload).mode, before.mode)
      assert.equal(statSync(upload).ino, before.ino)
      assert.equal(existsSync(join(path, 'incoming/ready-complete.json')), false)
    })
})

// 真failed watch的status會先擋commit，既有失敗與未提交來源完整保留。
test('commit-ready cannot repair a failed watch or an unstarted case', async () => {
  await clock(async (time) => {
    const path = root()
    const d = await driver(path, async () => {
      time.now = 90000
    })
    assert.equal(typeof d.commitReady, 'function', 'commit-ready unavailable')
    d.prepare()
    assert.throws(() => d.commitReady(), unavailable)
    await assert.rejects(d.watch(), unavailable)
    const upload = uploadReady(path)
    const before = readFileSync(join(path, 'setup-status.json'), 'utf8')
    assert.throws(() => d.commitReady(), unavailable)
    assert.equal(readFileSync(join(path, 'setup-status.json'), 'utf8'), before)
    assert.equal(statSync(upload).mode & 0o777, 0o644)
    assert.equal(existsSync(join(path, 'incoming/ready-complete.json')), false)
  })
})

// commit不重建時鐘；校準60000／89999可被poll接受，90000剛提交也須poison。
test('commit-ready submission never extends the original watch deadline', async () => {
  for (const ms of [60000, 89999, 90000])
    await clock(async (time) => {
      const path = root(),
        output = []
      const d = await driver(
        path,
        async () => {
          uploadReady(path)
          time.now = ms
          d.commitReady()
        },
        output,
      )
      assert.equal(typeof d.commitReady, 'function', 'commit-ready unavailable')
      d.prepare()
      if (ms < 90000) await d.watch()
      else await assert.rejects(d.watch(), unavailable)
      assert.equal(
        output.includes('host_handoff_ready_committed,liveSetupVerified=False,hrStarted=False'),
        true,
      )
      assert.equal(json(join(path, 'setup-status.json')).state, ms < 90000 ? 'ready' : 'failed')
      assert.equal(existsSync(join(path, 'current/ready.json')), ms < 90000)
      await assert.rejects(d.watch(), unavailable)
    })
})

// CLI新verb只在scratch copy執行，CI／額外參數早拒絕且不回顯未知值。
test('commit-ready CLI submits only metadata and refuses CI unknown flags and replay', async () => {
  const cwd = root()
  mkdirSync(cwd, { mode: 0o700 })
  for (const name of [
    'tools/linux-host-handoff.mjs',
    'frontend/e2e-real/host-observation-control.ts',
    'frontend/e2e-real/host-observation-schema.ts',
  ]) {
    const target = join(cwd, name)
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    copyFileSync(name, target)
  }
  const args = ['tools/linux-host-handoff.mjs', 'commit-ready', '0', '152', '1075', '508']
  const denied = spawnSync(process.execPath, args, {
    cwd,
    env: { PATH: process.env.PATH, CI: '1' },
    encoding: 'utf8',
  })
  assert.equal(denied.status, 2)
  assert.equal(denied.stdout, 'host_handoff_unavailable,stage=commit-ready\n')
  assert.equal(denied.stderr, '')
  assert.equal(existsSync(join(cwd, 'frontend/.cache')), false)
  const invalid = spawnSync(process.execPath, [...args, 'Public denied argument'], {
    cwd,
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  })
  assert.equal(invalid.status, 2)
  assert.equal(invalid.stdout, 'host_handoff_unavailable,stage=flags\n')
  assert.equal(invalid.stderr, '')
  assert.equal(existsSync(join(cwd, 'frontend/.cache')), false)
  await pendingCommit(
    async ({ path }) => {
      uploadReady(path)
      const committed = spawnSync(process.execPath, args, {
        cwd,
        env: { PATH: '/nonexistent' },
        encoding: 'utf8',
      })
      assert.equal(committed.status, 0)
      assert.equal(
        committed.stdout,
        'host_handoff_ready_committed,liveSetupVerified=False,hrStarted=False\n',
      )
      assert.equal(committed.stderr, '')
      assert.equal(existsSync(join(path, 'current/ready.json')), false)
      assert.equal(existsSync(join(path, 'setup-status.json')), false)
      const replayed = spawnSync(process.execPath, args, {
        cwd,
        env: { PATH: process.env.PATH },
        encoding: 'utf8',
      })
      assert.equal(replayed.status, 2)
      assert.equal(replayed.stdout, 'host_handoff_unavailable,stage=commit-ready\n')
      assert.equal(replayed.stderr, '')
    },
    join(cwd, 'frontend/.cache/windows-host-handoff-12'),
  )
})

// 若prepare啟動計時、重用目錄或放寬私有權限，此測試必失敗。
test('prepare is private and exclusive without claiming or starting a request', async () => {
  const path = root(),
    output = []
  const d = await driver(path, undefined, output)
  d.prepare()
  assert.equal(statSync(path).mode & 0o777, 0o700)
  assert.equal(statSync(join(path, 'incoming')).mode & 0o777, 0o700)
  assert.equal(statSync(join(path, 'current/manifest.json')).mode & 0o777, 0o600)
  assert.deepEqual(readdirSync(join(path, 'current')), ['manifest.json'])
  assert.deepEqual(output, ['host_handoff_prepared,hrStarted=False'])
  assert.throws(() => d.prepare(), unavailable)
})

// 原claim／request／import／poll都真執行；不能讀進行中upload或製造client／join。
test('watch waits for the completed name and validates ready on the live controller', async () => {
  await clock(async (time) => {
    const path = root(),
      output = []
    let calls = 0
    const d = await driver(
      path,
      async (ms) => {
        assert.equal(ms, 100)
        time.now += ms
        calls++
        assert.ok(existsSync(join(path, 'current/claim.json')))
        assert.ok(existsSync(join(path, 'current/start-request.json')))
        if (calls === 1)
          writeFileSync(join(path, 'incoming/ready.json'), 'Public incomplete upload', {
            mode: 0o600,
          })
        else {
          assert.equal(existsSync(join(path, 'current/ready.json')), false)
          deliver(path)
        }
      },
      output,
    )
    d.prepare()
    await d.watch()
    assert.equal(calls, 2)
    assert.equal(json(join(path, 'setup-status.json')).liveSetupVerified, true)
    assert.equal(statSync(join(path, 'setup-status.json')).mode & 0o777, 0o600)
    assert.deepEqual(output.slice(1), [
      'host_handoff_start_requested,setupBudgetMs=90000,hrStarted=False',
      'host_handoff_ready_observed,linuxClaimVerified=True,liveSetupVerified=True,hrStarted=False',
    ])
    for (const name of ['client.json', 'joined.json', 'result.json'])
      assert.equal(existsSync(join(path, 'current', name)), false)
    const m = json(join(path, 'current/manifest.json'))
    assert.equal(output.join('\n').includes(m.expected), false)
    assert.equal(output.join('\n').includes(m.runId), false)
    await assert.rejects(() => d.watch(), unavailable)
  })
})

// 校準60及89.999秒可過、90秒不行；不能重起clock或先import再忽略deadline。
test('ready at the boundary fails closed and cannot restart the claim', async () => {
  for (const ms of [60000, 89999, 90000])
    await clock(async (time) => {
      const path = root()
      const d = await driver(path, async () => {
        time.now = ms
        deliver(path)
      })
      d.prepare()
      if (ms < 90000) await d.watch()
      else {
        await assert.rejects(() => d.watch(), unavailable)
        assert.equal(json(join(path, 'setup-status.json')).state, 'failed')
        assert.equal(existsSync(join(path, 'current/ready.json')), false)
        const before = readFileSync(join(path, 'setup-status.json'), 'utf8')
        time.now = 1
        await assert.rejects(() => d.watch(), unavailable)
        assert.equal(readFileSync(join(path, 'setup-status.json'), 'utf8'), before)
      }
    })
})

// 真來源ACL／symlink／有界schema拒絕，不以錯誤／未知資料回終端。
test('rejects mismatched, public, linked, oversized and extra ready uploads', async () => {
  for (const mutation of ['request', 'permissions', 'link', 'oversize', 'extra'])
    await clock(async (time) => {
      const path = root(),
        output = []
      const d = await driver(
        path,
        async () => {
          time.now = 1
          const value = ready(path)
          if (mutation === 'request') value.requestId = '00000000-0000-4000-8000-000000000009'
          if (mutation === 'extra') value.text = 'Public denied value'
          deliver(path, value, mutation === 'permissions' ? 0o644 : 0o600)
          if (mutation === 'link') {
            renameSync(
              join(path, 'incoming/ready-complete.json'),
              join(path, 'incoming/target.json'),
            )
            symlinkSync(
              join(path, 'incoming/target.json'),
              join(path, 'incoming/ready-complete.json'),
            )
          }
          if (mutation === 'oversize')
            writeFileSync(
              join(path, 'incoming/ready-complete.json'),
              JSON.stringify(value) + ' '.repeat(8193),
            )
        },
        output,
      )
      d.prepare()
      await assert.rejects(() => d.watch(), unavailable)
      assert.equal(json(join(path, 'setup-status.json')).state, 'failed')
      assert.equal(output.join('\n').includes('Public denied value'), false)
    })
})

// 成功只驗host result，不能呼finish或產生假的console PASS／FAIL及正式joined。
test('validates the matched result with live setup proof but never invents a client', async () => {
  await clock(async (time) => {
    const path = root(),
      output = []
    const d = await driver(
      path,
      async () => {
        time.now = 1
        deliver(path)
      },
      output,
    )
    d.prepare()
    await d.watch()
    writeFileSync(join(path, 'incoming/result-complete.json'), JSON.stringify(host(path)), {
      mode: 0o600,
    })
    d.result()
    const status = json(join(path, 'result-status.json'))
    assert.equal(status.liveSetupVerified, true)
    assert.equal(status.hostResultValidated, true)
    assert.equal(status.formalJoinVerified, false)
    assert.equal(status.clientOracleEvaluated, false)
    assert.equal(status.hrStarted, false)
    assert.match(
      output.at(-1),
      /^host_handoff_result_observed,.*sampleAttempts=2,observations=1,clipboardNotifications=0,.*formalJoinVerified=False,clientOracleEvaluated=False,hrStarted=False$/,
    )
    for (const name of ['client.json', 'joined.json', 'result.json'])
      assert.equal(existsSync(join(path, 'current', name)), false)
    assert.throws(() => d.result(), unavailable)
  })
})

// 兩主機UTC不可當精確因果：host比Linux慢一秒但仍在manifest窗口，不應拒絕真live poll。
test('host UTC offset never replaces the live controller deadline', async () => {
  await clock(async (time) => {
    const path = root()
    const d = await driver(path, async () => {
      time.now = 1
      const value = ready(path)
      value.utc = new Date(Date.parse(value.utc) - 1000).toISOString()
      deliver(path, value)
    })
    d.prepare()
    const m = json(join(path, 'current/manifest.json'))
    m.createdUtc = new Date(Date.now() - 60000).toISOString()
    m.expiresUtc = new Date(Date.parse(m.createdUtc) + 1800000).toISOString()
    writeFileSync(join(path, 'current/manifest.json'), JSON.stringify(m))
    await d.watch()
    const value = host(path)
    value.startedUtc = json(join(path, 'current/ready.json')).utc
    value.endedUtc = new Date(Date.parse(value.startedUtc) + 1000).toISOString()
    writeFileSync(join(path, 'incoming/result-complete.json'), JSON.stringify(value), {
      mode: 0o600,
    })
    d.result()
    assert.equal(json(join(path, 'result-status.json')).liveSetupVerified, true)
    assert.equal(json(join(path, 'result-status.json')).formalJoinVerified, false)
  })
})

// 不完整／跨request／超額或未知文字不能因close=True就當正常交接。
test('rejects invalid results and does not write success status', async () => {
  for (const mutation of [
    'close',
    'request',
    'start',
    'extra',
    'oversize',
    'setup',
    'status_request',
    'permissions',
    'link',
    'hardlink',
  ])
    await clock(async (time) => {
      const path = root()
      const d = await driver(path, async () => {
        time.now = 1
        deliver(path)
      })
      d.prepare()
      await d.watch()
      const value = host(path)
      if (mutation === 'close') {
        value.resourcesClosed = false
        value.unavailable = true
      }
      if (mutation === 'request') value.requestId = '00000000-0000-4000-8000-000000000009'
      if (mutation === 'start')
        value.startedUtc = new Date(Date.parse(value.startedUtc) + 1).toISOString()
      if (mutation === 'extra') value.text = 'Public denied value'
      if (mutation === 'setup') {
        const status = json(join(path, 'setup-status.json'))
        status.state = 'failed'
        status.liveSetupVerified = false
        writeFileSync(join(path, 'setup-status.json'), JSON.stringify(status))
      }
      if (mutation === 'status_request') {
        const status = json(join(path, 'setup-status.json'))
        status.requestId = '00000000-0000-4000-8000-000000000009'
        writeFileSync(join(path, 'setup-status.json'), JSON.stringify(status))
      }
      writeFileSync(
        join(path, 'incoming/result-complete.json'),
        JSON.stringify(value) + (mutation === 'oversize' ? ' '.repeat(65537) : ''),
        { mode: 0o600 },
      )
      if (mutation === 'permissions') chmodSync(join(path, 'incoming/result-complete.json'), 0o644)
      if (mutation === 'link' || mutation === 'hardlink') {
        renameSync(
          join(path, 'incoming/result-complete.json'),
          join(path, 'incoming/result-target.json'),
        )
        if (mutation === 'link')
          symlinkSync(
            join(path, 'incoming/result-target.json'),
            join(path, 'incoming/result-complete.json'),
          )
        else
          linkSync(
            join(path, 'incoming/result-target.json'),
            join(path, 'incoming/result-complete.json'),
          )
      }
      assert.throws(() => d.result(), unavailable)
      assert.equal(existsSync(join(path, 'result-status.json')), false)
    })
})

// 只讀診斷可辨過期而不續期／claim；也不能回顯expected或把當前狀態當失敗瞬間證據。
test('inspect is read only and reports current expiry without restarting watch', async () => {
  const path = root(),
    output = []
  const d = await driver(path, undefined, output)
  assert.equal(typeof d.inspect, 'function', 'read-only inspection unavailable')
  d.prepare()
  const m = json(join(path, 'current/manifest.json'))
  m.createdUtc = new Date(Date.now() - 1801000).toISOString()
  m.expiresUtc = new Date(Date.parse(m.createdUtc) + 1800000).toISOString()
  writeFileSync(join(path, 'current/manifest.json'), JSON.stringify(m))
  const before = readFileSync(join(path, 'current/manifest.json'), 'utf8')
  await assert.rejects(() => d.watch(), unavailable)
  assert.equal(
    output.some(
      /* 失敗重現只是公開過期fixture，不是原生因果定案。 */ (line) =>
        line.startsWith('host_handoff_start_requested'),
    ),
    false,
  )
  d.inspect()
  assert.ok(
    output.includes(
      'host_handoff_manifest_probe,jsonReadable=True,schemaWellFormed=True,validNow=False,expired=True,notYetValid=False,geometryMatches=True',
    ),
  )
  assert.equal(
    output.at(-1),
    'host_handoff_inspection_observed,readOnly=True,watchRestarted=False,hrStarted=False',
  )
  assert.equal(readFileSync(join(path, 'current/manifest.json'), 'utf8'), before)
  assert.deepEqual(readdirSync(path).sort(), ['current', 'incoming'])
  assert.deepEqual(readdirSync(join(path, 'current')), ['manifest.json'])
  assert.equal(output.join('\n').includes(m.expected), false)
  assert.equal(output.join('\n').includes(m.createdUtc), false)
})

// 已失敗的claim／request／sidecar是取證資料；inspect不可刪掉、覆寫或重新start。
test('inspect preserves an existing failed claim and all its metadata bytes', async () => {
  await clock(async (time) => {
    const path = root(),
      output = []
    const d = await driver(
      path,
      async () => {
        time.now = 90000
      },
      output,
    )
    d.prepare()
    await assert.rejects(() => d.watch(), unavailable)
    const files = ['current/claim.json', 'current/start-request.json', 'setup-status.json']
    const before = files.map(
      /* 僅本測試公開fixture的原始bytes。 */ (name) => readFileSync(join(path, name), 'utf8'),
    )
    d.inspect()
    assert.deepEqual(
      files.map(
        /* 診斷前後逐檔比較，不能用新builder生成expected。 */ (name) =>
          readFileSync(join(path, name), 'utf8'),
      ),
      before,
    )
    assert.ok(
      output.includes(
        'host_handoff_presence_probe,claim=True,request=True,setupStatus=True,ready=False,readyComplete=False',
      ),
    )
    assert.equal(
      output.filter(
        /* 診斷不能偷偷重啟watch。 */ (line) => line.startsWith('host_handoff_start_requested'),
      ).length,
      1,
    )
    assert.equal(json(join(path, 'setup-status.json')).state, 'failed')
  })
})

// 若診斷為了讀資料而修mode、跟link或讀不安全祖先，這組真檔案測試必失敗。
test('inspect reports unsafe paths and malformed input without changing or disclosing them', async () => {
  for (const mutation of ['incoming_mode', 'manifest_mode', 'link', 'oversize', 'extra']) {
    const path = root(),
      output = []
    const d = await driver(path, undefined, output)
    assert.equal(typeof d.inspect, 'function', 'read-only inspection unavailable')
    d.prepare()
    const manifestPath = join(path, 'current/manifest.json')
    if (mutation === 'incoming_mode') chmodSync(join(path, 'incoming'), 0o755)
    if (mutation === 'manifest_mode') chmodSync(manifestPath, 0o644)
    if (mutation === 'link') {
      renameSync(manifestPath, join(path, 'current/public-target.json'))
      symlinkSync(join(path, 'current/public-target.json'), manifestPath)
    }
    if (mutation === 'oversize')
      writeFileSync(manifestPath, readFileSync(manifestPath, 'utf8') + ' '.repeat(8193))
    if (mutation === 'extra') {
      const m = json(manifestPath)
      m.text = 'Public denied inspection value'
      writeFileSync(manifestPath, JSON.stringify(m))
    }
    const before = readFileSync(manifestPath, 'utf8'),
      mode = statSync(manifestPath).mode
    d.inspect()
    assert.equal(readFileSync(manifestPath, 'utf8'), before)
    assert.equal(statSync(manifestPath).mode, mode)
    assert.equal(output.join('\n').includes('Public denied inspection value'), false)
    if (mutation === 'extra')
      assert.ok(
        output.includes(
          'host_handoff_manifest_probe,jsonReadable=True,schemaWellFormed=False,validNow=unknown,expired=unknown,notYetValid=unknown,geometryMatches=unknown',
        ),
      )
    else
      assert.ok(
        output.includes(
          'host_handoff_manifest_probe,jsonReadable=unknown,schemaWellFormed=unknown,validNow=unknown,expired=unknown,notYetValid=unknown,geometryMatches=unknown',
        ),
      )
    for (const name of ['claim.json', 'start-request.json', 'ready.json', 'client.json'])
      assert.equal(existsSync(join(path, 'current', name)), false)
    assert.equal(existsSync(join(path, 'setup-status.json')), false)
  }
})

// CLI只在自有scratch執行；01–11歷史資料不動，新12獨立建立且拒絕重用。
test('CLI prepares case12 without touching cases01-11 evidence and refuses reuse or CI', async () => {
  await driver(root())
  const cwd = root()
  mkdirSync(cwd, { mode: 0o700 })
  for (const name of [
    'tools/linux-host-handoff.mjs',
    'frontend/e2e-real/host-observation-control.ts',
    'frontend/e2e-real/host-observation-schema.ts',
  ]) {
    const path = join(cwd, name)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    copyFileSync(name, path)
  }
  const args = ['tools/linux-host-handoff.mjs', 'prepare', '0', '152', '1075', '508']
  const bad = spawnSync(process.execPath, args, {
    cwd,
    env: { PATH: process.env.PATH, CI: '1' },
    encoding: 'utf8',
  })
  assert.equal(bad.status, 2)
  assert.equal(bad.stdout, 'host_handoff_unavailable,stage=prepare\n')
  assert.equal(bad.stderr, '')
  const invalid = spawnSync(
    process.execPath,
    ['tools/linux-host-handoff.mjs', 'Public denied argument'],
    { cwd, env: { PATH: process.env.PATH }, encoding: 'utf8' },
  )
  assert.equal(invalid.status, 2)
  assert.equal(invalid.stdout, 'host_handoff_unavailable,stage=flags\n')
  assert.equal(invalid.stderr, '')
  const badGeometry = spawnSync(
    process.execPath,
    ['tools/linux-host-handoff.mjs', 'prepare', '0', '152', '20', '508'],
    { cwd, env: { PATH: process.env.PATH }, encoding: 'utf8' },
  )
  assert.equal(badGeometry.status, 2)
  assert.equal(badGeometry.stdout, 'host_handoff_unavailable,stage=prepare\n')
  assert.equal(badGeometry.stderr, '')
  assert.equal(existsSync(join(cwd, 'frontend/.cache')), false)
  const oldCases = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'].map(
    // 每輪僅建立公開哨兵，供後續核對舊資料的內容、權限與inode未變。
    (number) => {
      const directory = join(cwd, `frontend/.cache/windows-host-handoff-${number}/current`)
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      const manifest = join(directory, 'manifest.json')
      writeFileSync(manifest, `Public preserved case ${number}\n`, { mode: 0o600 })
      return { directory, manifest, metadata: statSync(manifest), number }
    },
  )
  const good = spawnSync(process.execPath, args, {
    cwd,
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  })
  assert.equal(good.status, 0)
  assert.equal(good.stdout, 'host_handoff_prepared,hrStarted=False\n')
  assert.equal(good.stderr, '')
  const current = join(cwd, 'frontend/.cache/windows-host-handoff-12/current')
  assert.deepEqual(readdirSync(current), ['manifest.json'])
  const manifestPath = join(current, 'manifest.json')
  const before = readFileSync(manifestPath, 'utf8')
  const metadata = statSync(manifestPath)
  const reused = spawnSync(process.execPath, args, {
    cwd,
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  })
  assert.equal(reused.status, 2)
  assert.equal(reused.stdout, 'host_handoff_unavailable,stage=prepare\n')
  assert.equal(reused.stderr, '')
  assert.equal(readFileSync(manifestPath, 'utf8'), before)
  assert.equal(statSync(manifestPath).ino, metadata.ino)
  assert.equal(statSync(manifestPath).mode, metadata.mode)
  const inspected = spawnSync(
    process.execPath,
    ['tools/linux-host-handoff.mjs', 'inspect', '0', '152', '1075', '508'],
    { cwd, env: { PATH: process.env.PATH }, encoding: 'utf8' },
  )
  assert.equal(inspected.status, 0)
  assert.equal(inspected.stderr, '')
  assert.match(
    inspected.stdout,
    /host_handoff_manifest_probe,jsonReadable=True,schemaWellFormed=True,validNow=True,expired=False,notYetValid=False,geometryMatches=True\n/,
  )
  assert.deepEqual(readdirSync(current), ['manifest.json'])
  const inspectedCi = spawnSync(
    process.execPath,
    ['tools/linux-host-handoff.mjs', 'inspect', '0', '152', '1075', '508'],
    { cwd, env: { PATH: process.env.PATH, CI: '1' }, encoding: 'utf8' },
  )
  assert.equal(inspectedCi.status, 2)
  assert.match(
    inspectedCi.stdout,
    /^host_handoff_context,linux=True,node24=True,ciSet=True,githubActionsSet=False\nhost_handoff_unavailable,stage=inspect\n$/,
  )
  assert.equal(inspectedCi.stderr, '')
  for (const old of oldCases) {
    assert.equal(readFileSync(old.manifest, 'utf8'), `Public preserved case ${old.number}\n`)
    assert.equal(statSync(old.manifest).ino, old.metadata.ino)
    assert.equal(statSync(old.manifest).mode, old.metadata.mode)
    assert.deepEqual(readdirSync(old.directory), ['manifest.json'])
  }
  assert.deepEqual(readdirSync(join(cwd, 'frontend/.cache')).sort(), [
    'windows-host-handoff-01',
    'windows-host-handoff-02',
    'windows-host-handoff-03',
    'windows-host-handoff-04',
    'windows-host-handoff-05',
    'windows-host-handoff-06',
    'windows-host-handoff-07',
    'windows-host-handoff-08',
    'windows-host-handoff-09',
    'windows-host-handoff-10',
    'windows-host-handoff-11',
    'windows-host-handoff-12',
  ])
})
