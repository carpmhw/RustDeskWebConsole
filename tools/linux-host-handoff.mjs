import {
  constants,
  lstatSync,
  fstatSync,
  openSync,
  closeSync,
  readSync,
  fchmodSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { TextDecoder } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { spawnSync } from 'node:child_process'
import {
  prepareHostObservation,
  createHostHandoffObservation,
  importHostObservation,
  readHostSetupDiagnostic,
} from '../frontend/e2e-real/host-observation-control.ts'
import {
  validateHostManifest,
  validateHostRequest,
  validateHostReady,
  validateHostResult,
} from '../frontend/e2e-real/host-observation-schema.ts'

// 所有公開出口固定失敗，不反射路徑、原文、UUID或例外內容。
function fail() {
  throw new Error('host_handoff_unavailable')
}
// missing只接受ENOENT，權限／link等錯誤不能假裝檔案未到。
function exists(path) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    return fail()
  }
}
// 本目錄同owner／0700，全部祖先拒絕symlink；不修改上傳者ACL或宣稱防同帳號偽造。
function privateDirectory(path) {
  const own = lstatSync(path)
  if (own.uid !== process.getuid() || (own.mode & 0o777) !== 0o700) fail()
  for (let p = path; ; p = dirname(p)) {
    const s = lstatSync(p)
    if (!s.isDirectory() || s.isSymbolicLink()) fail()
    if (p === dirname(p)) break
  }
}
// 只讀安全metadata JSON；普通單link／0600／同owner／nofollow及固定buffer全部先驗。
function readPrivate(path, limit = 8192) {
  privateDirectory(dirname(path))
  const bytes = Buffer.alloc(limit + 1)
  let fd
  try {
    const before = lstatSync(path)
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid() ||
      (before.mode & 0o777) !== 0o600 ||
      before.size > limit
    )
      fail()
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const s = fstatSync(fd)
    if (s.dev !== before.dev || s.ino !== before.ino || s.size !== before.size) fail()
    const n = readSync(fd, bytes, 0, bytes.length, 0)
    if (n !== s.size || n > limit) fail()
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, n)))
  } finally {
    bytes.fill(0)
    if (fd !== undefined) closeSync(fd)
  }
}
// 操作者已確認上傳完成才呼叫；只驗同一有界普通檔，驗證後縮權並不覆寫提交。
function commitReadyUpload(source, destination, validate) {
  const bytes = Buffer.alloc(8193)
  let fd
  try {
    privateDirectory(dirname(source))
    if (exists(destination)) fail()
    const before = lstatSync(source)
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid() ||
      ![0o600, 0o644].includes(before.mode & 0o7777) ||
      before.size > 8192 ||
      before.dev !== lstatSync(dirname(source)).dev
    )
      fail()
    fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const opened = fstatSync(fd)
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.mode !== before.mode ||
      opened.uid !== before.uid ||
      opened.nlink !== 1
    )
      fail()
    const n = readSync(fd, bytes, 0, bytes.length, 0)
    if (n !== opened.size || n > 8192) fail()
    validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, n))))
    const checked = fstatSync(fd),
      named = lstatSync(source)
    if (
      checked.nlink !== 1 ||
      checked.size !== opened.size ||
      checked.mtimeMs !== opened.mtimeMs ||
      checked.ctimeMs !== opened.ctimeMs ||
      named.dev !== opened.dev ||
      named.ino !== opened.ino ||
      exists(destination)
    )
      fail()
    // 只對已驗證descriptor縮權，不以chmod(path)跟隨可能被置換的symlink。
    fchmodSync(fd, 0o600)
    const privateFile = fstatSync(fd)
    if ((privateFile.mode & 0o7777) !== 0o600 || privateFile.nlink !== 1) fail()
    // 沿既有Linux mv的no-clobber rename，沒有shell、未知輸出、PATH查找或自動重試。
    const moved = spawnSync('/usr/bin/mv', ['-nT', '--', source, destination], {
      stdio: 'ignore',
      env: { LC_ALL: 'C' },
      timeout: 1000,
    })
    if (moved.error || moved.signal || moved.status !== 0 || exists(source)) fail()
    const completed = lstatSync(destination)
    if (
      !completed.isFile() ||
      completed.isSymbolicLink() ||
      completed.nlink !== 1 ||
      completed.dev !== opened.dev ||
      completed.ino !== opened.ino ||
      completed.uid !== opened.uid ||
      (completed.mode & 0o7777) !== 0o600 ||
      completed.size !== opened.size
    )
      fail()
  } finally {
    bytes.fill(0)
    if (fd !== undefined) closeSync(fd)
  }
}
// 僅診斷sidecar的exclusive0600寫入；不寫client／joined或複製整份host result。
function writePrivate(path, value) {
  privateDirectory(dirname(path))
  const text = JSON.stringify(value) + '\n'
  if (Buffer.byteLength(text) > 8192) fail()
  let fd
  try {
    fd = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    )
    const s = fstatSync(fd)
    if (s.uid !== process.getuid() || s.nlink !== 1 || (s.mode & 0o777) !== 0o600) fail()
    writeFileSync(fd, text, 'utf8')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
// 普通JSON的sidecar／claim精確欄位，未知資料不能以選欄後保存冒充已驗。
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const keys = Object.keys(value)
  if (
    keys.length !== names.length ||
    keys.some(/* 只比欄名，不讀未知值。 */ (key) => !names.includes(key))
  )
    fail()
}

// 診斷只輸出布林或unknown，不回實際mode／UID／長度、檔名值或錯誤內容。
function flag(value) {
  return value === true ? 'True' : value === false ? 'False' : 'unknown'
}
// 路徑診斷只lstat；祖先拒絕symlink，未滿足原private guard時不能進一步讀JSON。
function pathProbe(path, directory) {
  try {
    const s = lstatSync(path)
    let plainPath = !s.isSymbolicLink()
    for (let p = directory ? path : dirname(path); ; p = dirname(p)) {
      const parent = lstatSync(p)
      if (!parent.isDirectory() || parent.isSymbolicLink()) plainPath = false
      if (p === dirname(p)) break
    }
    const kindMatches = directory ? s.isDirectory() : s.isFile()
    const ownerMatches = s.uid === process.getuid()
    const modeMatches = (s.mode & 0o777) === (directory ? 0o700 : 0o600)
    const singleLink = directory ? 'unknown' : s.nlink === 1
    const bounded = directory ? 'unknown' : s.size <= 8192
    return {
      exists: true,
      kindMatches,
      ownerMatches,
      modeMatches,
      plainPath,
      singleLink,
      bounded,
      safe:
        kindMatches &&
        ownerMatches &&
        modeMatches &&
        plainPath &&
        (directory || (singleLink === true && bounded === true)),
    }
  } catch (error) {
    return {
      exists: error.code === 'ENOENT' ? false : 'unknown',
      kindMatches: 'unknown',
      ownerMatches: 'unknown',
      modeMatches: 'unknown',
      plainPath: 'unknown',
      singleLink: 'unknown',
      bounded: 'unknown',
      safe: false,
    }
  }
}
// 單純存在性無法讀取時回unknown，不跟隨內容／重試／修權限。
function presenceProbe(path) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    return error.code === 'ENOENT' ? false : 'unknown'
  }
}

// TTY只收單次空行；不累積字串、不回顯輸入，也不在事件callback寫檔。
function uploadConfirmation(input) {
  if (!input || input.isTTY !== true || input.destroyed || input.readableEnded) fail()
  let state = 'pending'
  // 解析最多CR／LF兩byte；未知或重複輸入只留下固定失敗狀態。
  function data(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length > 2 || state === 'confirmed') {
      state = 'rejected'
      return
    }
    for (const byte of chunk) {
      if ((state === 'pending' || state === 'cr') && byte === 10) state = 'confirmed'
      else if (state === 'pending' && byte === 13) state = 'cr'
      else state = 'rejected'
    }
  }
  // EOF／error／signal都只要求原watch停止，不讀例外或另啟程序。
  function reject() {
    state = 'rejected'
  }
  return {
    // 原request成立後才監聽；保留終端原line discipline，不用raw mode。
    start() {
      input.on('data', data)
      input.on('end', reject)
      input.on('error', reject)
      input.on('close', reject)
      process.on('SIGINT', reject)
      process.on('SIGTERM', reject)
      input.resume()
    },
    // 僅有界狀態提供給同process原poll，不以輸入時刻判斷deadline。
    confirmed() {
      if (state === 'rejected') fail()
      return state === 'confirmed'
    },
    // 所有終態移除自己的listener並pause，不動其他listener或程序。
    close() {
      input.pause()
      input.removeListener('data', data)
      input.removeListener('end', reject)
      input.removeListener('error', reject)
      input.removeListener('close', reject)
      process.removeListener('SIGINT', reject)
      process.removeListener('SIGTERM', reject)
    },
  }
}

// 獨立校準只收公開geometry及測試用等待／輸出port；CLI固定使用真環境與原controller。
export function createLinuxHandoff(root, geometry, options = {}) {
  const { env = process.env, wait = delay, emit = console.log } = options
  if (
    process.platform !== 'linux' ||
    env.CI ||
    env.GITHUB_ACTIONS ||
    !geometry ||
    Object.keys(geometry).length !== 4
  )
    fail()
  for (const name of ['x', 'y', 'width', 'height'])
    if (!Number.isSafeInteger(geometry[name]) || geometry[name] < 0 || geometry[name] > 4096) fail()
  if (
    geometry.width < 21 ||
    geometry.height < 31 ||
    geometry.x + geometry.width > 4096 ||
    geometry.y + geometry.height > 4096
  )
    fail()
  const path = resolve(root),
    current = join(path, 'current'),
    incoming = join(path, 'incoming')
  const config = {
    RDWEB_WINDOWS_HOST_OBSERVE: '1',
    RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1',
    RDWEB_INPUT_PLATFORMS: 'windows',
    RDWEB_INPUT_CHANNELS: 'chromium',
    RDWEB_B3_BASES: '/',
    RDWEB_B3_MODES: 'preserve',
    RDWEB_WINDOWS_EDITOR_X: String(geometry.x),
    RDWEB_WINDOWS_EDITOR_Y: String(geometry.y),
    RDWEB_WINDOWS_EDITOR_WIDTH: String(geometry.width),
    RDWEB_WINDOWS_EDITOR_HEIGHT: String(geometry.height),
  }
  // 每個階段只用獨立case的private current／incoming，不觸正式observer current。
  function directories() {
    for (const p of [path, current, incoming]) privateDirectory(p)
  }
  // manifest每次重驗期限／geometry，不能將SFTP資料當任意目的地或新scope。
  function manifest() {
    const m = validateHostManifest(readPrivate(join(current, 'manifest.json')))
    for (const name of ['x', 'y', 'width', 'height']) if (m.editor[name] !== geometry[name]) fail()
    return m
  }
  // 只接受本次原controller建立的claim與request，不另造claim或重啟request。
  function request(m) {
    const claim = readPrivate(join(current, 'claim.json'))
    fields(claim, ['schemaVersion', 'runId'])
    if (claim.schemaVersion !== 1 || claim.runId !== m.runId) fail()
    return validateHostRequest(readPrivate(join(current, 'start-request.json')), m)
  }
  // setup sidecar只記同run/request與真poll結果；不是console終態／PASS或心跳。
  function setupStatus(m, r, state) {
    writePrivate(join(path, 'setup-status.json'), {
      schemaVersion: 1,
      runId: m.runId,
      requestId: r.requestId,
      state,
      liveSetupVerified: state === 'ready',
      hrStarted: false,
    })
  }
  // 原watch與互動watch共用同一controller／clock／診斷；確認事件不自行提交。
  async function watch(confirmation = null) {
    let m,
      r,
      controller,
      phase = 'preflight',
      knownReason = null,
      started = false
    try {
      directories()
      m = manifest()
      phase = 'create'
      controller = createHostHandoffObservation(config, current)
      phase = 'start'
      controller.start()
      started = true
      phase = 'request'
      r = request(m)
      emit('host_handoff_start_requested,setupBudgetMs=90000,hrStarted=False')
      if (confirmation) {
        confirmation.start()
        emit(
          'host_handoff_upload_confirmation_requested,pressEnterAfterUpload=True,hrStarted=False',
        )
      }
      for (;;) {
        let committed = false
        // 先驗原期限；排隊的Enter也不能讓已逾時的來源chmod或rename。
        phase = 'poll'
        if (controller.pollReady()) {
          knownReason = 'ready_before_import'
          fail()
        }
        if (confirmation) {
          phase = 'confirmation'
          if (exists(join(incoming, 'ready-complete.json'))) fail()
          if (confirmation.confirmed()) {
            phase = 'commit'
            handoff.commitReady()
            committed = true
          }
        }
        if ((!confirmation || committed) && exists(join(incoming, 'ready-complete.json'))) {
          phase = 'import'
          directories()
          importHostObservation('ready', join(incoming, 'ready-complete.json'), config, current)
          phase = 'confirm'
          if (!controller.pollReady()) fail()
          phase = 'status'
          setupStatus(m, r, 'ready')
          emit(
            'host_handoff_ready_observed,linuxClaimVerified=True,liveSetupVerified=True,hrStarted=False',
          )
          return
        }
        phase = 'wait'
        await wait(100)
      }
    } catch {
      if (started && m && r) {
        try {
          setupStatus(m, r, 'failed')
        } catch {
          /* 已有或無法保存的sidecar保留，不覆寫／重試。 */
        }
      }
      try {
        const diagnostic = readHostSetupDiagnostic(controller)
        emit(
          `host_handoff_watch_failed,phase=${phase},reason=${knownReason ?? diagnostic.reason},elapsedMs=${diagnostic.elapsedMs ?? 'unknown'},clockDomain=linux_monotonic,elapsedSource=last_gate_sample,hrStarted=False`,
        )
      } catch {
        /* 診斷sink不可替換原固定失敗、觸發重試或妨礙原status保存。 */
      }
      fail()
    } finally {
      confirmation?.close()
    }
  }
  const handoff = {
    // 明確提交不是live-ready：不claim、不重啟clock，已結束／匯入／提交的case拒絕。
    commitReady() {
      try {
        directories()
        for (const name of ['setup-status.json', 'result-status.json'])
          if (exists(join(path, name))) fail()
        for (const name of ['ready.json', 'client.json', 'joined.json', 'result.json'])
          if (exists(join(current, name))) fail()
        const m = manifest(),
          r = request(m)
        commitReadyUpload(
          join(incoming, 'ready.json'),
          join(incoming, 'ready-complete.json'),
          /* 只驗原schema與當前run/request，未知原值不輸出。 */ (value) =>
            validateHostReady(value, m, r),
        )
        emit('host_handoff_ready_committed,liveSetupVerified=False,hrStarted=False')
      } catch {
        fail()
      }
    },
    // 只讀當前metadata，不claim／start／寫sidecar或恢復gate，也不能回填失敗瞬間狀態。
    inspect() {
      try {
        let safe = true
        for (const [entry, target, directory] of [
          ['root', path, true],
          ['current', current, true],
          ['incoming', incoming, true],
          ['manifest', join(current, 'manifest.json'), false],
        ]) {
          const info = pathProbe(target, directory)
          safe = safe && info.safe
          emit(
            `host_handoff_path_probe,entry=${entry},exists=${flag(info.exists)},kindMatches=${flag(info.kindMatches)},ownerMatches=${flag(info.ownerMatches)},modeMatches=${flag(info.modeMatches)},plainPath=${flag(info.plainPath)}${directory ? '' : `,singleLink=${flag(info.singleLink)},bounded=${flag(info.bounded)}`}`,
          )
        }
        emit(
          `host_handoff_presence_probe,claim=${flag(presenceProbe(join(current, 'claim.json')))},request=${flag(presenceProbe(join(current, 'start-request.json')))},setupStatus=${flag(presenceProbe(join(path, 'setup-status.json')))},ready=${flag(presenceProbe(join(current, 'ready.json')))},readyComplete=${flag(presenceProbe(join(incoming, 'ready-complete.json')))}`,
        )
        let jsonReadable = 'unknown',
          schemaWellFormed = 'unknown',
          validNow = 'unknown',
          expired = 'unknown',
          notYetValid = 'unknown',
          geometryMatches = 'unknown'
        if (safe) {
          try {
            const raw = readPrivate(join(current, 'manifest.json'))
            jsonReadable = true
            try {
              // 檔內建立時點只供結構校驗，絕不修改期限／系統clock或作真gate；有效性另用當前UTC驗。
              const m = validateHostManifest(raw, Date.parse(raw?.createdUtc))
              schemaWellFormed = true
              const now = Date.now()
              expired = now >= Date.parse(m.expiresUtc)
              notYetValid = now < Date.parse(m.createdUtc)
              geometryMatches = ['x', 'y', 'width', 'height'].every(
                /* 只比較已驗公開整數。 */ (name) => m.editor[name] === geometry[name],
              )
              try {
                validateHostManifest(raw, now)
                validNow = true
              } catch {
                validNow = false
              }
            } catch {
              schemaWellFormed = false
            }
          } catch {
            jsonReadable = false
          }
        }
        emit(
          `host_handoff_manifest_probe,jsonReadable=${flag(jsonReadable)},schemaWellFormed=${flag(schemaWellFormed)},validNow=${flag(validNow)},expired=${flag(expired)},notYetValid=${flag(notYetValid)},geometryMatches=${flag(geometryMatches)}`,
        )
        emit('host_handoff_inspection_observed,readOnly=True,watchRestarted=False,hrStarted=False')
      } catch {
        fail()
      }
    },
    // 準備不claim、不產request、不開始60秒；既有目錄完全保留且拒絕重用。
    prepare() {
      try {
        if (exists(path)) fail()
        prepareHostObservation(config, current)
        mkdirSync(incoming, { mode: 0o700 })
        directories()
        emit('host_handoff_prepared,hrStarted=False')
      } catch {
        fail()
      }
    },
    // 手動完成檔模式維持原介面，不接收外部確認adapter。
    watch() {
      return watch()
    },
    // 僅TTY人工確認模式；非TTY在controller／claim之前拒絕。
    async watchInteractive(input = process.stdin) {
      return watch(uploadConfirmation(input))
    },
    // 結果只做host metadata驗證，不呼需真client的正式import-result／join或finish。
    result() {
      try {
        directories()
        const m = manifest(),
          r = request(m),
          status = readPrivate(join(path, 'setup-status.json'))
        fields(status, [
          'schemaVersion',
          'runId',
          'requestId',
          'state',
          'liveSetupVerified',
          'hrStarted',
        ])
        if (
          status.schemaVersion !== 1 ||
          status.runId !== m.runId ||
          status.requestId !== r.requestId ||
          status.state !== 'ready' ||
          status.liveSetupVerified !== true ||
          status.hrStarted !== false
        )
          fail()
        const ready = validateHostReady(readPrivate(join(current, 'ready.json')), m, r)
        const result = validateHostResult(
          readPrivate(join(incoming, 'result-complete.json'), 65536),
          m,
          r,
        )
        if (
          result.startedUtc !== ready.utc ||
          !result.resourcesClosed ||
          result.overflow ||
          result.unavailable ||
          result.code !== 'host_observed' ||
          result.observations.length < 1 ||
          result.observations.length > result.sampleAttempts ||
          result.observations[0].kind !== 'baseline'
        )
          fail()
        for (const row of result.observations)
          if (!row.scopeVerified || !row.editorReadable || row.code !== 'host_observed') fail()
        writePrivate(join(path, 'result-status.json'), {
          schemaVersion: 1,
          runId: m.runId,
          requestId: r.requestId,
          hostResultValidated: true,
          linuxClaimVerified: true,
          liveSetupVerified: true,
          formalJoinVerified: false,
          clientOracleEvaluated: false,
          hrStarted: false,
        })
        emit(
          `host_handoff_result_observed,hostResultValidated=True,resourcesClosed=True,sampleAttempts=${result.sampleAttempts},observations=${result.observations.length},clipboardNotifications=${result.clipboardNotifications},liveSetupVerified=True,formalJoinVerified=False,clientOracleEvaluated=False,hrStarted=False`,
        )
      } catch {
        fail()
      }
    },
  }
  return handoff
}

// CLI只收固定動作及公開整數，不接受憑證／目錄／任意metadata；任何錯誤只固定marker。
async function main() {
  let stage = 'flags'
  try {
    const [verb, ...values] = process.argv.slice(2)
    if (
      !['prepare', 'watch', 'watch-interactive', 'result', 'inspect', 'commit-ready'].includes(
        verb,
      ) ||
      values.length !== 4 ||
      values.some(/* 原始參數從不回顯。 */ (v) => !/^\d+$/.test(v))
    )
      fail()
    stage = verb
    const [x, y, width, height] = values.map(Number)
    const root = fileURLToPath(
      new URL('../frontend/.cache/windows-host-handoff-12/', import.meta.url),
    )
    if (verb === 'inspect')
      console.log(
        `host_handoff_context,linux=${flag(process.platform === 'linux')},node24=${flag(process.versions.node.split('.')[0] === '24')},ciSet=${flag(Boolean(process.env.CI))},githubActionsSet=${flag(Boolean(process.env.GITHUB_ACTIONS))}`,
      )
    const handoff = createLinuxHandoff(root, { x, y, width, height })
    if (verb === 'watch-interactive') await handoff.watchInteractive()
    else if (verb === 'commit-ready') handoff.commitReady()
    else await handoff[verb]()
  } catch {
    console.log('host_handoff_unavailable,stage=' + stage)
    process.exitCode = 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
