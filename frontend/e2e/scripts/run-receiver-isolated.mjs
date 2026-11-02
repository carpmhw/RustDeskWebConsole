import { spawn } from 'node:child_process'
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { URL, fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout, clearTimeout } from 'node:timers'
import { performance } from 'node:perf_hooks'
import { setTimeout as wait } from 'node:timers/promises'
import {
  receiverFields,
  validateReceiverBinding,
  validateReceiverEndpoints,
} from '../receiver/contract.ts'
import { createReceiverRun, readReceiverJson } from '../receiver/private-io.ts'
import { prepareReceiverClient, importReceiverResult } from '../receiver/client-control.ts'
import { parseReceiverClientStage, safeReceiverClientStage } from '../real/test-receiver-control.ts'
import {
  parseReceiverDiagnostic,
  validateReceiverDiagnostic,
  unknownReceiverDiagnostic,
} from '../receiver/diagnostic.ts'

const PROJECT = 'rdweb-receiver-isolated-20261023-01'
const ROOT = '/tmp/opencode/rdweb-test-receiver-isolated-20261023-01'
const REUSED_IMAGES = Object.freeze({
  server: 'sha256:993e1615cd733264573f2440e6c1daeff7a8627c572c34085d6c5a0d7b8d504d',
  api: 'sha256:2fa3aca31b154641864ccd327e9748d9c303b3cf58106e7f0254da04bf29e5fc',
  web: 'sha256:470c199b6d9ec02b5e11156395482c69ea921a0251383d5257082aec2c396ad3',
})
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const COMPOSE = 'frontend/e2e/docker/docker-compose.receiver-test.yml'
const PACKAGE = join(
  REPO,
  'frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261023-01/portable',
)
const LEGACY_PACKAGE_PIN = Object.freeze({
  packageDirectory: PACKAGE,
  packageSha256: 'cb2f2cb4000fb5ec09e3906b094e2d29547d866d34ae50acc7a59ed9d63a77e8',
  integritySha256: '26713ce11ede4a3e2ba4b09d01d582ce78a0278bb1b325b5dbfc26b310dced92',
  bundleSha256: 'cb59fa56e4661015aeab78f36caf4bf5bef90ccc4854cba164bbb2774f5fb9f8',
})
const FIXED_PACKAGE_PIN = Object.freeze({
  packageDirectory: join(
    REPO,
    'frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261023-02/portable',
  ),
  packageSha256: 'b4e2f86f7d0f2f753e420f06ce808fc6f76c84a7549612a1b8a3aa96b2c6d3d1',
  integritySha256: 'e1bd76c075ff50f9f965cbfbc55fcd871466798eaca448e6f939c4586cd9065f',
  bundleSha256: '29450fd437c30dbb9da972dcd8de1bf1e5a34268bf6fef2cd80692805d407f2e',
})
const DIAGNOSTIC_PACKAGE_PIN = Object.freeze({
  packageDirectory: join(
    REPO,
    'frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-01/portable',
  ),
  packageSha256: '9704428f76582c421b862d4cd49461611fe65b6f1a54b23d648e80a8a52deb09',
  integritySha256: 'ade33ca425883e6b99b6293fe9d290efe29885f280de74c7c1d8f2b18e08163c',
  bundleSha256: '8d369024c7a0dadf8e6221cdd976360c6b735b450e710fd7da1a4258adf8e8a2',
})
const EOF_FIXED_PACKAGE_PIN = Object.freeze({
  packageDirectory: join(
    REPO,
    'frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-02/portable',
  ),
  packageSha256: '58623ffa2e41533cc887b5cb13cd509ca3030959ea1717027937705b6473807c',
  integritySha256: 'c9e19ac93745b5fe57e21398ac5d2e062fe250bdc1cd0591add75c9b0081e206',
  bundleSha256: '005b51a5084246dfeb109a42ffcf2953198c220a116bf61015e9e386a8e899b4',
})
const UUID_FIXED_PACKAGE_PIN = Object.freeze({
  packageDirectory: join(
    REPO,
    'frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-03/portable',
  ),
  packageSha256: '86395b36604383fd0068785381eaf5e68e5bcb040ef50b7a190ef2f506837399',
  integritySha256: '850dc4f40457651d6dba9d5c1da071d29487d56cdd4d3e4d6f8130e91e1a3d0d',
  bundleSha256: '657e7cac66d9803ef7074f59988015220702d77d8caa5bb30a5430e806b6ef20',
})
const READ_SOURCE_PACKAGE_PIN = Object.freeze({
  packageDirectory: join(
    REPO,
    'frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-04/portable',
  ),
  packageSha256: 'e7094d12b644df510a2e45ade29641f5a8ac80df9021e2d3f3bd359b2d23e3b8',
  integritySha256: 'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
  bundleSha256: '03d6c730119b941e20454e3f52ad9e920a08a6ef4473ac1e61d9c341ff559947',
})
const ORIGIN = 'http://127.0.0.1:18080'
const { AbortController, AbortSignal } = globalThis

// 所有錯誤固定分類，不把command／HTTP／exception或秘密送入報告。
function fail() {
  throw new Error('receiver_unavailable')
}

// 單次固定scope不能以一般live=1冒用，也不繼承CI或舊host用途。
export function authorizeIsolation(env) {
  if (
    process.platform !== 'linux' ||
    ![
      PROJECT,
      'rdweb-receiver-isolated-20261023-02',
      'rdweb-receiver-isolated-20261023-03',
      'rdweb-receiver-isolated-20261024-04',
      'rdweb-receiver-isolated-20261024-05',
      'rdweb-receiver-isolated-20261024-06',
      'rdweb-receiver-isolated-20261024-07',
      'rdweb-receiver-isolated-20261024-08',
    ].includes(env.RDWEB_RECEIVER_ISOLATED_AUTHORIZE) ||
    env.CI ||
    env.GITHUB_ACTIONS ||
    [
      'RDWEB_WINDOWS_HOST_OBSERVE',
      'RDWEB_WINDOWS_HOST_INPUT_ONLY',
      'RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG',
    ].some((key) => env[key] !== undefined && env[key] !== '0')
  )
    return fail()
  return true
}

// 僅明列已核准scope，不推算其他輪次；03與歷史包固定分離，沒有任意來源override。
export function readIsolationScope(env) {
  authorizeIsolation(env)
  if (env.RDWEB_RECEIVER_ISOLATED_AUTHORIZE === 'rdweb-receiver-isolated-20261024-08')
    return Object.freeze({
      project: 'rdweb-receiver-isolated-20261024-08',
      root: '/tmp/opencode/rdweb-test-receiver-isolated-20261024-08',
      reuseImages: true,
      images: REUSED_IMAGES,
      ...READ_SOURCE_PACKAGE_PIN,
    })
  if (env.RDWEB_RECEIVER_ISOLATED_AUTHORIZE === 'rdweb-receiver-isolated-20261024-07')
    return Object.freeze({
      project: 'rdweb-receiver-isolated-20261024-07',
      root: '/tmp/opencode/rdweb-test-receiver-isolated-20261024-07',
      reuseImages: true,
      images: REUSED_IMAGES,
      ...READ_SOURCE_PACKAGE_PIN,
    })
  if (env.RDWEB_RECEIVER_ISOLATED_AUTHORIZE === 'rdweb-receiver-isolated-20261024-06')
    return Object.freeze({
      project: 'rdweb-receiver-isolated-20261024-06',
      root: '/tmp/opencode/rdweb-test-receiver-isolated-20261024-06',
      reuseImages: true,
      images: REUSED_IMAGES,
      ...UUID_FIXED_PACKAGE_PIN,
    })
  if (env.RDWEB_RECEIVER_ISOLATED_AUTHORIZE === 'rdweb-receiver-isolated-20261024-05')
    return Object.freeze({
      project: 'rdweb-receiver-isolated-20261024-05',
      root: '/tmp/opencode/rdweb-test-receiver-isolated-20261024-05',
      reuseImages: true,
      images: REUSED_IMAGES,
      ...EOF_FIXED_PACKAGE_PIN,
    })
  if (env.RDWEB_RECEIVER_ISOLATED_AUTHORIZE === 'rdweb-receiver-isolated-20261024-04')
    return Object.freeze({
      project: 'rdweb-receiver-isolated-20261024-04',
      root: '/tmp/opencode/rdweb-test-receiver-isolated-20261024-04',
      reuseImages: true,
      images: REUSED_IMAGES,
      ...DIAGNOSTIC_PACKAGE_PIN,
    })
  if (env.RDWEB_RECEIVER_ISOLATED_AUTHORIZE === PROJECT)
    return Object.freeze({
      project: PROJECT,
      root: ROOT,
      reuseImages: false,
      images: null,
      ...LEGACY_PACKAGE_PIN,
    })
  if (env.RDWEB_RECEIVER_ISOLATED_AUTHORIZE === 'rdweb-receiver-isolated-20261023-03')
    return Object.freeze({
      project: 'rdweb-receiver-isolated-20261023-03',
      root: '/tmp/opencode/rdweb-test-receiver-isolated-20261023-03',
      reuseImages: true,
      images: REUSED_IMAGES,
      ...FIXED_PACKAGE_PIN,
    })
  return Object.freeze({
    project: 'rdweb-receiver-isolated-20261023-02',
    root: '/tmp/opencode/rdweb-test-receiver-isolated-20261023-02',
    reuseImages: true,
    images: REUSED_IMAGES,
    ...LEGACY_PACKAGE_PIN,
  })
}

// directory／ZIP／manifest／實際bundle均須符合該scope的獨立pin，不信任可自行修改的清單。
export function assertIsolationPackage(scope, actual) {
  const v = receiverFields(actual, ['directory', 'zipSha256', 'integritySha256', 'bundleSha256'])
  const pin = [
    'rdweb-receiver-isolated-20261024-07',
    'rdweb-receiver-isolated-20261024-08',
  ].includes(scope.project)
    ? READ_SOURCE_PACKAGE_PIN
    : scope.project === 'rdweb-receiver-isolated-20261024-06'
      ? UUID_FIXED_PACKAGE_PIN
      : scope.project === 'rdweb-receiver-isolated-20261024-05'
        ? EOF_FIXED_PACKAGE_PIN
        : scope.project === 'rdweb-receiver-isolated-20261024-04'
          ? DIAGNOSTIC_PACKAGE_PIN
          : scope.project === 'rdweb-receiver-isolated-20261023-03'
            ? FIXED_PACKAGE_PIN
            : [PROJECT, 'rdweb-receiver-isolated-20261023-02'].includes(scope.project)
              ? LEGACY_PACKAGE_PIN
              : fail()
  if (
    v.directory !== pin.packageDirectory ||
    v.zipSha256 !== pin.packageSha256 ||
    v.integritySha256 !== pin.integritySha256 ||
    v.bundleSha256 !== pin.bundleSha256
  )
    return fail()
  return true
}

// 01仍禁止既有tag；02只認事前核准的完整本地ID，缺檔或替換絕不fallback。
export function assertIsolationImage(scope, role, actual) {
  if (!Object.hasOwn(REUSED_IMAGES, role)) return fail()
  if (scope.reuseImages ? actual !== REUSED_IMAGES[role] : actual !== null) return fail()
  return true
}

// native只消費此命令計畫，02不存在build／pull命令；是否有image仍由preflight驗證。
export function isolationCommands(scope) {
  return scope.reuseImages
    ? {
        build: null,
        up: ['up', '--no-build', '--pull', 'never', '-d', '--wait', '--wait-timeout', '90'],
      }
    : {
        build: ['build', 'hbbs', 'backend', 'web'],
        up: ['up', '-d', '--wait', '--wait-timeout', '90'],
      }
}

// 各類既有資源任一存在即拒絕；新image tag不能藉project不存在而被覆寫。
export function assertIsolationFresh(value) {
  const state = receiverFields(value, ['root', 'containers', 'volumes', 'networks', 'images'])
  if (Object.values(state).some((item) => item !== false)) return fail()
  return true
}

// start-request須經既有strict private reader，再以精確四欄比對同run／request。
export function isIsolationStart(value, binding) {
  try {
    const b = validateReceiverBinding(binding),
      v = receiverFields(value, ['schemaVersion', 'purpose', 'runId', 'requestId'])
    return (
      v.schemaVersion === 1 &&
      v.purpose === b.purpose &&
      v.runId === b.runId &&
      v.requestId === b.requestId
    )
  } catch {
    return false
  }
}

// 接線只擁有本次up開始的stack；單案不重試，失敗與缺cleanup證據都保留。
export async function executeIsolation(ports) {
  let stage = 'preflight',
    owned = false,
    resourcesClosed = true,
    code = 'receiver_unavailable',
    clientStage,
    receiverDiagnostic
  try {
    for (stage of ['preflight', 'claim', 'build', 'up', 'provision', 'run']) {
      if (stage === 'up') owned = true
      if (stage === 'run') resourcesClosed = false
      const result = await ports[stage]()
      if (stage === 'run') {
        const descriptor = Object.getOwnPropertyDescriptor(result, 'receiverDiagnostic')
        if (descriptor) {
          try {
            receiverDiagnostic = validateReceiverDiagnostic(
              'value' in descriptor ? descriptor.value : null,
            )
          } catch {
            receiverDiagnostic = unknownReceiverDiagnostic()
          }
        }
        resourcesClosed = result.resourcesClosed === true
        if (!['receiver_match', 'receiver_mismatch', 'receiver_unavailable'].includes(result.code))
          return fail()
        code = resourcesClosed ? result.code : 'receiver_unavailable'
        if ('clientStage' in result) clientStage = safeReceiverClientStage(result.clientStage)
      }
    }
    stage = 'complete'
  } catch {
    code = 'receiver_unavailable'
  } finally {
    // 結果缺檔／import失敗仍可保留同一owned child已解析的安全診斷。
    const diagnosticPort = Object.getOwnPropertyDescriptor(ports, 'diagnostic')
    if (diagnosticPort && 'value' in diagnosticPort && typeof diagnosticPort.value === 'function') {
      try {
        receiverDiagnostic = validateReceiverDiagnostic(diagnosticPort.value())
      } catch {
        receiverDiagnostic = unknownReceiverDiagnostic()
      }
    }
    if (owned) {
      try {
        if ((await ports.down()) !== true) throw new Error()
      } catch {
        resourcesClosed = false
        code = 'receiver_unavailable'
        stage = 'down'
      }
    }
  }
  return {
    code,
    stage,
    resourcesClosed,
    ...(clientStage ? { clientStage } : {}),
    ...(receiverDiagnostic ? { receiverDiagnostic } : {}),
  }
}

// command只留有界RAM輸出；無shell、固定timeout、close事件才算子程序完成。
function startCommand(binary, args, env, timeoutMs, signal) {
  const child = spawn(binary, args, {
    cwd: REPO,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let bytes = 0,
    stdout = '',
    failed = false,
    closed = false,
    killer
  // 只終止本函數持有的child，兩秒後仍未close才kill，不掃程序或Docker資源。
  const stop = () => {
    if (closed) return
    failed = true
    child.kill('SIGTERM')
    killer ??= setTimeout(() => {
      if (!closed) child.kill('SIGKILL')
    }, 2000)
  }
  const timer = setTimeout(stop, Math.max(1, timeoutMs - 2000))
  signal?.addEventListener('abort', stop, { once: true })
  if (signal?.aborted) stop()
  // stdout只供固定metadata／公開key／JSON解析；stderr永不回傳或落盤。
  const consume = (chunk, output) => {
    bytes += chunk.length
    if (bytes > 8 * 1024 * 1024) stop()
    else if (output) stdout += chunk.toString('utf8')
  }
  child.stdout.on('data', (chunk) => consume(chunk, true))
  child.stderr.on('data', (chunk) => consume(chunk, false))
  const done = new Promise((resolveDone) => {
    child.on('error', () => {
      failed = true
    })
    child.once('close', (code) => {
      closed = true
      clearTimeout(timer)
      clearTimeout(killer)
      signal?.removeEventListener('abort', stop)
      resolveDone({ code: failed ? 2 : code, stdout, closed: true })
      stdout = ''
    })
  })
  return { done, stop }
}

// 只接受成功command，原始錯誤或非零exit不印出；不自動重試。
async function command(binary, args, env, timeoutMs, signal) {
  const result = await startCommand(binary, args, env, timeoutMs, signal).done
  if (result.code !== 0) return fail()
  return result.stdout
}

// 固定project且不讀.env，所有敏感值只由程序環境注入。
function compose(args, env, timeoutMs, signal, scope) {
  return command(
    'docker',
    ['compose', '--env-file', '/dev/null', '-p', scope.project, '-f', COMPOSE, ...args],
    env,
    timeoutMs,
    signal,
  )
}

// API只連新隔離Origin，禁止redirect；每次有界timeout，錯誤只留HTTP狀態分類。
async function api(path, body, token, signal, method = 'POST') {
  const response = await fetch(ORIGIN + '/api/v1/' + path, {
    method,
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    console.log('receiver_isolated_http_' + response.status)
    return fail()
  }
  if (response.status === 204) return null
  const text = await response.text()
  if (text.length > 65536) return fail()
  return JSON.parse(text)
}

// 只核對指定新project／loopback ports／新網段與本機包；不啟服務、不讀其他容器env。
async function preflight(env, signal, scope) {
  const PACKAGE = scope.packageDirectory
  const state = {
    root: existsSync(scope.root),
    containers: false,
    volumes: false,
    networks: false,
    images: false,
  }
  assertIsolationFresh(state)
  for (const resource of ['container', 'volume', 'network']) {
    const sub = resource === 'container' ? ['ps', '-a'] : [resource, 'ls']
    const output = await command(
      'docker',
      [
        ...sub,
        '--filter',
        'label=com.docker.compose.project=' + scope.project,
        '--format',
        resource === 'container' ? '{{.ID}}' : '{{.Name}}',
      ],
      env,
      15000,
      signal,
    )
    state[resource === 'container' ? 'containers' : resource + 's'] = !!output.trim()
  }
  for (const tag of ['server', 'api', 'web']) {
    const result = await startCommand(
      'docker',
      [
        'image',
        'inspect',
        '--format',
        '{{.Id}}',
        scope.reuseImages ? scope.images[tag] : `rdweb-receiver-${tag}:20261023-01`,
      ],
      env,
      15000,
      signal,
    ).done
    if (![0, 1].includes(result.code)) return fail()
    assertIsolationImage(scope, tag, result.code === 0 ? result.stdout.trim() : null)
  }
  assertIsolationFresh(state)
  for (const name of ['tcp', 'tcp6', 'udp', 'udp6']) {
    const rows = readFileSync('/proc/net/' + name, 'utf8')
      .trim()
      .split('\n')
      .slice(1)
    if (
      rows.some((row) =>
        [18080, 21136, 21137].includes(parseInt(row.trim().split(/\s+/)[1].split(':')[1], 16)),
      )
    )
      return fail()
  }
  const ids = (await command('docker', ['network', 'ls', '-q'], env, 15000, signal))
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const networks = ids.length
    ? JSON.parse(await command('docker', ['network', 'inspect', ...ids], env, 15000, signal))
    : []
  const routes = JSON.parse(await command('ip', ['-j', '-4', 'route', 'show'], env, 15000, signal))
  // 有號bit運算只用同一遮罩比較，不依網路名稱猜測隔離。
  const overlaps = (subnet) => {
    const [address, bits] = subnet.split('/')
    if (address.includes(':')) return false
    const n = address.split('.').reduce((value, part) => (value << 8) | Number(part), 0)
    const mask = -1 << (32 - Math.min(Number(bits ?? 32), 24))
    const candidate = (172 << 24) | (30 << 16) | (91 << 8)
    return (n & mask) === (candidate & mask)
  }
  if (
    networks.some((n) => (n.IPAM?.Config ?? []).some((c) => c.Subnet && overlaps(c.Subnet))) ||
    routes.some((r) => r.dst && r.dst !== 'default' && overlaps(r.dst))
  )
    return fail()
  const manifestBytes = readFileSync(join(PACKAGE, 'integrity.json'))
  const zip = readFileSync(join(dirname(PACKAGE), 'rdweb-test-receiver-v24.22.1-win-x64.zip'))
  assertIsolationPackage(scope, {
    directory: PACKAGE,
    zipSha256: createHash('sha256').update(zip).digest('hex'),
    integritySha256: createHash('sha256').update(manifestBytes).digest('hex'),
    bundleSha256: createHash('sha256')
      .update(readFileSync(join(PACKAGE, 'receiver.mjs')))
      .digest('hex'),
  })
  const integrity = JSON.parse(manifestBytes.toString('utf8'))
  for (const name of ['receiver.mjs', 'vp8.webm']) {
    const file = join(PACKAGE, name),
      stat = lstatSync(file)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      createHash('sha256').update(readFileSync(file)).digest('hex') !== integrity.files[name]
    )
      return fail()
  }
}

// 所有native狀態只屬本次CLI；secret不寫檔，結果與binding沿既有private-io。
function nativePorts(signal, scope) {
  let receiverDiagnostic = unknownReceiverDiagnostic()
  const ROOT = scope.root,
    PACKAGE = scope.packageDirectory,
    commands = isolationCommands(scope)
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SECRET_KEY: randomBytes(32).toString('base64'),
    VAULT_KEY: randomBytes(32).toString('base64'),
    BOOTSTRAP_ADMIN_PASSWORD: randomBytes(24).toString('base64'),
    ...(scope.reuseImages
      ? {
          RDWEB_RECEIVER_SERVER_IMAGE: scope.images.server,
          RDWEB_RECEIVER_API_IMAGE: scope.images.api,
          RDWEB_RECEIVER_WEB_IMAGE: scope.images.web,
        }
      : {}),
  }
  const setupDeadline = performance.now() + 1200000
  let runtimeEnv, binding
  // setup共享20分鐘期限，不因階段切換重設。
  const left = () => {
    const value = setupDeadline - performance.now()
    if (value <= 0) return fail()
    return value
  }
  return {
    preflight: () => preflight(env, signal, scope),
    // 僅回本次receiver child已完成的strict快照；import失敗也可取得。
    diagnostic: () => receiverDiagnostic,
    // 根目錄本身是單次gate；所有祖先普通非symlink，失敗亦不刪除或重用。
    async claim() {
      for (let p = dirname(ROOT); ; p = dirname(p)) {
        const s = lstatSync(p)
        if (!s.isDirectory() || s.isSymbolicLink()) return fail()
        if (p === dirname(p)) break
      }
      mkdirSync(ROOT, { mode: 0o700 })
    },
    build: () =>
      commands.build ? compose(commands.build, env, left(), signal, scope) : Promise.resolve(true),
    up: () => compose(commands.up, env, Math.min(left(), 95000), signal, scope),
    // 只透過正常API建立新operator／server／target及最小user ACL，不接管舊資料。
    async provision() {
      const key = (
        await compose(
          ['exec', '-T', 'hbbs', 'cat', '/public-key/id_ed25519.pub'],
          env,
          10000,
          signal,
          scope,
        )
      ).trim()
      const endpoints = validateReceiverEndpoints({
        hbbsUdp: { host: '127.0.0.1', port: 21136 },
        hbbsTcp: { host: '127.0.0.1', port: 21136 },
        hbbrTcp: { host: '127.0.0.1', port: 21137 },
        serverPublicKey: key,
      })
      const now = Date.now()
      binding = validateReceiverBinding({
        schemaVersion: 1,
        purpose: 'rustdesk_test_receiver_v1',
        runId: randomUUID(),
        requestId: randomUUID(),
        peerId: String(100000000 + randomInt(900000000)),
        createdUtc: new Date(now).toISOString(),
        expiresUtc: new Date(now + 1800000).toISOString(),
      })
      const password = randomBytes(24).toString('base64'),
        username = 'e2e-' + randomUUID().replaceAll('-', '')
      const name = 'receiver-test-target-' + randomBytes(8).toString('hex')
      runtimeEnv = {
        PATH: env.PATH,
        HOME: env.HOME,
        APP_BASE_PATH: '/',
        RDWEB_TEST_RECEIVER_LIVE: '1',
        RDWEB_TEST_RECEIVER_MODE: 'existing-target',
        RDWEB_TEST_RECEIVER_ROOT: join(ROOT, 'client'),
        RDWEB_TEST_RECEIVER_TARGET_NAME: name,
        RDWEB_TEST_RECEIVER_USERNAME: username,
        RDWEB_E2E_PASSWORD: password,
        RDWEB_TEST_RECEIVER_PASSWORD: password,
        RDWEB_TEST_RECEIVER_HBBS_UDP: '127.0.0.1:21136',
        RDWEB_TEST_RECEIVER_HBBS_TCP: '127.0.0.1:21136',
        RDWEB_TEST_RECEIVER_HBBR_TCP: '127.0.0.1:21137',
        RDWEB_TEST_RECEIVER_SERVER_PUBLIC_KEY: key,
      }
      const admin = await api(
        'auth/login',
        { username: 'receiver-isolated-admin', password: env.BOOTSTRAP_ADMIN_PASSWORD },
        null,
        signal,
      )
      const user = await api(
        'users',
        { username, password, role: 'operator' },
        admin.access_token,
        signal,
      )
      const server = await api(
        'servers',
        {
          name: 'receiver-isolated-server',
          id_server: 'hbbs:21116',
          relay_server: 'hbbr:21117',
          public_key: key,
          transport: 'tcp',
          enabled: true,
          allow_private_network: true,
          version: 0,
        },
        admin.access_token,
        signal,
      )
      const target = await api(
        'targets',
        { name, server_id: server.id, rustdesk_id: binding.peerId, password },
        admin.access_token,
        signal,
      )
      const acl = await api(
        'targets/' + target.id + '/permissions',
        null,
        admin.access_token,
        signal,
        'GET',
      )
      await api(
        'targets/' + target.id + '/permissions',
        {
          version: acl.version,
          grants: [
            {
              role: null,
              user_id: user.id,
              can_connect: true,
              can_view_password: false,
              can_edit: false,
            },
          ],
        },
        admin.access_token,
        signal,
        'PUT',
      )
      prepareReceiverClient(join(ROOT, 'client'), binding, endpoints, runtimeEnv)
      createReceiverRun(join(ROOT, 'receiver'), binding, endpoints)
      left()
    },
    // 唯一正常單輪：等同輪start再啟receiver，兩child以同一剩餘期限收尾。
    async run() {
      const deadline = performance.now() + 180000
      const cli = join(REPO, 'frontend/node_modules/@playwright/test/cli.js')
      const browser = startCommand(
        process.execPath,
        [
          cli,
          'test',
          '--config',
          'frontend/e2e/config/playwright.test-receiver.config.ts',
          '--max-failures=1',
          '--reporter=line',
        ],
        runtimeEnv,
        180000,
        signal,
      )
      let receiver,
        browserEnded = false
      const browserDone = browser.done.then((result) => {
        browserEnded = true
        return result
      })
      try {
        while (!existsSync(join(ROOT, 'client/start-request.json'))) {
          if (browserEnded || signal.aborted || performance.now() >= deadline - 2000) return fail()
          await wait(25)
        }
        if (
          !isIsolationStart(readReceiverJson(join(ROOT, 'client'), 'start-request.json'), binding)
        )
          return fail()
        receiver = startCommand(
          process.execPath,
          [join(PACKAGE, 'receiver.mjs'), 'run', '--directory', join(ROOT, 'receiver')],
          {
            PATH: env.PATH,
            HOME: env.HOME,
            RDWEB_TEST_RECEIVER_PASSWORD: runtimeEnv.RDWEB_TEST_RECEIVER_PASSWORD,
          },
          deadline - performance.now(),
          signal,
        )
        const [b, r] = await Promise.all([browserDone, receiver.done])
        receiverDiagnostic = parseReceiverDiagnostic(r.stdout)
        const joined = importReceiverResult(
          join(ROOT, 'client'),
          join(ROOT, 'receiver/result.json'),
          undefined,
          runtimeEnv,
        )
        return {
          code: b.code === 0 && [0, 1, 2].includes(r.code) ? joined.code : 'receiver_unavailable',
          resourcesClosed: joined.resourcesClosed && b.closed && r.closed,
          clientStage: parseReceiverClientStage(b.stdout),
          receiverDiagnostic,
        }
      } finally {
        browser.stop()
        receiver?.stop()
        await Promise.all([browserDone, receiver?.done])
      }
    },
    // 協定結束後只停本project容器／network，不移除volumes或images；signal另用正常cleanup期限。
    async down() {
      await compose(['down', '--timeout', '5'], env, 60000, undefined, scope)
      const remaining = await command(
        'docker',
        [
          'ps',
          '-a',
          '--filter',
          'label=com.docker.compose.project=' + scope.project,
          '--format',
          '{{.ID}}',
        ],
        env,
        5000,
      )
      return !remaining.trim()
    },
  }
}

// CLI先驗精確scope再建native ports；只輸出安全終態，不印metadata／keys／API內容。
async function main() {
  const controller = new AbortController(),
    onSignal = () => controller.abort()
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)
  let result
  try {
    if (process.argv.length !== 2) return fail()
    const scope = readIsolationScope(process.env)
    result = await executeIsolation(nativePorts(controller.signal, scope))
  } catch {
    result = { code: 'receiver_unavailable', stage: 'authorization', resourcesClosed: true }
  } finally {
    process.removeListener('SIGTERM', onSignal)
    process.removeListener('SIGINT', onSignal)
  }
  console.log(JSON.stringify(result))
  process.exitCode =
    result.code === 'receiver_match' ? 0 : result.code === 'receiver_mismatch' ? 1 : 2
}

// import只載入純函數，不隱式啟Docker／瀏覽器或開socket。
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await main()
