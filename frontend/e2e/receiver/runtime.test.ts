import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { binding, endpoints, receiverApi } from './test-fixtures'
import { type ReceiverResult } from './contract.ts'
import { createReceiverFramer, frameReceiverBytes } from './framing.ts'
import { decodeMessage, encodeMessage, hbb } from '../../src/rdweb/codec.ts'
import { PeerCrypto } from '../../src/rdweb/crypto.ts'
import { publicReceiverText } from './contract.ts'
import { decodeReceiverControl, encodeReceiverControl } from './wire.ts'
import { createReceiverDiagnostic } from './diagnostic.ts'

const PASSWORD_TEXT = 'public-runtime-password'
const CONTROL = 4
const A_KEY = 65 * 65536
const LEGACY = 0
const TRANSLATE = 2
const VP8_SHA256 = '503cd8dfafcba01760afc0794752803aa36143a14b9ad49b62c28b43de795c02'
const VP8_BYTES = 12230
const MAX_RAW_BYTES = 262144
const expected = publicReceiverText(binding())

type RuntimeModule = typeof import('./runtime')

// 只讀既有公開WPT快取並驗原始hash；測試不下載或讀桌面。
let cachedVp8: Uint8Array | null = null
async function publicVp8(): Promise<Uint8Array> {
  if (cachedVp8) return cachedVp8
  const source = new Uint8Array(
    await readFile(new URL('../../.cache/codec-fixtures/vp8.webm', import.meta.url)),
  )
  expect(source).toHaveLength(VP8_BYTES)
  expect(createHash('sha256').update(source).digest('hex')).toBe(VP8_SHA256)
  cachedVp8 = source
  return source
}

// 公開fake duplex只收本案RAM資料，不建立任何真socket。
class FakeDuplex {
  readonly sent: Uint8Array[] = []
  readonly incoming: Uint8Array[] = []
  readonly waiters: ((value: Uint8Array | null) => void)[] = []
  closed = false
  closeCalls = 0
  closeResult: boolean | 'hang' = true

  // 送出資料只記錄copy，避免測試之間共享可變buffer。
  async send(bytes: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('closed')
    this.sent.push(bytes.slice())
  }

  // 有資料立即回；否則等待測試推送或關閉。
  receive(): Promise<Uint8Array | null> {
    const value = this.incoming.shift()
    if (value) return Promise.resolve(value)
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  // 測試把完整datagram或frame片段送進這個公開port。
  push(bytes: Uint8Array): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter(bytes)
    else this.incoming.push(bytes)
  }

  // 關閉喚醒所有等待者；測試可選擇回false或永遠pending。
  async close(): Promise<boolean> {
    this.closeCalls++
    if (this.closeResult === 'hang') return new Promise<boolean>(() => {})
    this.closed = true
    for (const waiter of this.waiters.splice(0)) waiter(null)
    return this.closeResult
  }
}

// 可控clock／timer及只回本案fake duplex的network，不呼叫真net／dgram。
class FakeNetwork {
  readonly udp = new FakeDuplex()
  readonly hbbs = new FakeDuplex()
  readonly hbbr = new FakeDuplex()
  readonly opened: { kind: 'udp' | 'tcp'; endpoint: { host: string; port: number } }[] = []
  clock = 0
  private id = 0
  private readonly timers: {
    id: number
    at: number
    callback: () => void
    cancelled: boolean
  }[] = []

  // UDP只以保存的hbbs endpoint建立；回應都由同一fake duplex代表。
  async openUdp(endpoint: { host: string; port: number }): Promise<FakeDuplex> {
    this.opened.push({ kind: 'udp', endpoint })
    return this.udp
  }

  // 比較host／port值而非物件參考，因為正式validator會回傳新endpoint副本。
  private isHbbr(endpoint: { host: string; port: number }): boolean {
    const hbbr = endpoints().hbbrTcp
    return endpoint.host === hbbr.host && endpoint.port === hbbr.port
  }

  // 第一次TCP是hbbs，第二次是保存的hbbr。
  async openTcp(endpoint: { host: string; port: number }): Promise<FakeDuplex> {
    this.opened.push({ kind: 'tcp', endpoint })
    return this.isHbbr(endpoint) ? this.hbbr : this.hbbs
  }

  // 只回本案單調clock，讓180000ms及5000ms邊界可確定命中。
  now(): number {
    return this.clock
  }

  // 登記一次性timer並回取消函式，測試以advance手動推進。
  schedule(delayMs: number, callback: () => void): () => void {
    const timer = { id: ++this.id, at: this.clock + delayMs, callback, cancelled: false }
    this.timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }

  // 依時間順序執行到期timer，包含callback新排的timer。
  advance(ms: number): void {
    const target = this.clock + ms
    for (;;) {
      const next = this.timers
        .filter((timer) => !timer.cancelled && timer.at <= target)
        .sort((a, b) => a.at - b.at)[0]
      if (!next) break
      this.clock = Math.max(this.clock, next.at)
      next.cancelled = true
      next.callback()
    }
    this.clock = target
  }

  // 測試結束前確認runtime已取消所有自有timer。
  activeTimers(): number {
    return this.timers.filter((timer) => !timer.cancelled).length
  }
}

// 讓async狀態機跑過目前microtask，不啟動真network。
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// 缺能力先以存在性斷言取得RED，不讓module-not-found冒充行為測試。
async function api(): Promise<RuntimeModule> {
  return (await receiverApi('runtime')) as RuntimeModule
}

// 完成UDP註冊、hbbs TCP及forced relay；只使用公開fake duplex。
async function completeRelay(network: FakeNetwork): Promise<void> {
  await flush()
  network.udp.push(encodeReceiverControl({ registerPkResponse: { result: 0 } }))
  await flush()
  network.hbbs.push(
    frameReceiverBytes(
      encodeReceiverControl({ punchHole: { socketAddr: new Uint8Array([1, 2, 3, 4]) } }),
    ),
  )
  await flush()
  await flush()
  expect(network.opened.map((item) => item.kind)).toEqual(['udp', 'tcp', 'tcp'])
}

// relay建立後的第一個TCP frame是RequestRelay，之後才是session SignedId。
function relayFrames(network: FakeNetwork): Uint8Array[] {
  const framer = createReceiverFramer(65552)
  return network.hbbr.sent.flatMap((chunk) => framer.push(chunk))
}

// 從UDP RegisterPk取本輪receiver signing public key，不另外重生密鑰。
function receiverSigningKey(network: FakeNetwork): Uint8Array {
  const control = decodeReceiverControl(network.udp.sent[0]!)
  expect(control.registerPk?.pk).toBeInstanceOf(Uint8Array)
  return control.registerPk!.pk!
}

// 依RustDesk pinned proof計算兩層SHA-256，密碼只在本helper內短暫存在。
function computeProof(password: Uint8Array, salt: string, challenge: string): Uint8Array {
  const intermediate = createHash('sha256').update(password).update(salt, 'utf8').digest()
  const proof = createHash('sha256').update(intermediate).update(challenge, 'utf8').digest()
  intermediate.fill(0)
  return new Uint8Array(proof)
}

// 手寫正常遠控LoginRequest；測試只驗runtime整合，不重做session選項矩陣。
function loginMessage(salt: string, challenge: string): hbb.IMessage {
  const password = new TextEncoder().encode(PASSWORD_TEXT)
  const proof = computeProof(password, salt, challenge)
  password.fill(0)
  return {
    loginRequest: {
      username: binding().peerId,
      password: proof,
      myId: '33333333-3333-4333-8333-333333333333',
      myName: 'Public Test',
      myPlatform: 'Web',
      version: '1.4.2',
      videoAckRequired: true,
      sessionId: 1,
      option: {
        disableAudio: hbb.OptionMessage.BoolOption.Yes,
        disableClipboard: hbb.OptionMessage.BoolOption.Yes,
        disableKeyboard: hbb.OptionMessage.BoolOption.No,
        disableCamera: hbb.OptionMessage.BoolOption.Yes,
        imageQuality: hbb.ImageQuality.Balanced,
        customFps: 30,
        supportedDecoding: { abilityVp8: 1 },
      },
    },
  }
}

// 手寫五鍵序列；expected只由Task24產生，不呼叫sender encoder。
function key(value: Record<string, unknown>): hbb.IMessage {
  return {
    keyEvent: { down: false, press: false, mode: LEGACY, modifiers: [], ...value },
  }
}

// 五鍵固定順序：Ctrl down→Translate A down→A up→Ctrl up→一次Legacy Seq。
function sequence(): hbb.IMessage[] {
  return [
    key({ controlKey: CONTROL, down: true }),
    key({ chr: A_KEY, down: true, mode: TRANSLATE, modifiers: [CONTROL] }),
    key({ chr: A_KEY, down: false, mode: TRANSLATE, modifiers: [CONTROL] }),
    key({ controlKey: CONTROL, down: false }),
    key({ seq: expected, down: true }),
  ]
}

// 把已加密peer frame經hbbr fake送進runtime；不繞過relay framing。
function pushEncrypted(network: FakeNetwork, client: PeerCrypto, message: hbb.IMessage): void {
  network.hbbr.push(frameReceiverBytes(client.encrypt(encodeMessage(message))))
}

// 只送1-byte原生heartbeat；session會忽略，但runtime仍計入protocol envelope。
function pushHeartbeat(network: FakeNetwork): void {
  network.hbbr.push(frameReceiverBytes(new Uint8Array(1)))
}

// 建立一輪runtime；writeResult只記錄白名單結果，不落盤。
async function startRun(network = new FakeNetwork(), signal = new AbortController().signal) {
  const runtime = await api()
  const diagnostic = createReceiverDiagnostic()
  const writes: ReceiverResult[] = []
  const password = new TextEncoder().encode(PASSWORD_TEXT)
  const promise = runtime.runReceiver(
    binding(),
    endpoints(),
    password,
    {
      network,
      diagnostic,
      publicVp8: await publicVp8(),
      writeResult: async (result) => {
        writes.push(result)
      },
    },
    signal,
  )
  promise.catch(() => {})
  await flush()
  return { runtime, network, promise, writes, password, signal, diagnostic }
}

// 完成真NaCl握手與登入，回傳client供後續輸入。
async function logIn(network: FakeNetwork, valid = true): Promise<PeerCrypto> {
  await completeRelay(network)
  const frames = relayFrames(network)
  const requestRelay = decodeReceiverControl(frames[0]!)
  expect(requestRelay.requestRelay).toBeTruthy()
  const signedId = decodeMessage(frames[1]!).signedId?.id
  expect(signedId).toBeTruthy()
  const client = new PeerCrypto()
  const publicKey = client.handshake(signedId!, binding().peerId, receiverSigningKey(network))
  network.hbbr.push(frameReceiverBytes(publicKey))
  await flush()
  const hash = decodeMessage(client.decrypt(relayFrames(network)[2]!)).hash
  expect(hash?.salt).toBeTruthy()
  expect(hash?.challenge).toBeTruthy()
  const login = loginMessage(hash!.salt!, hash!.challenge!)
  if (!valid) login.loginRequest!.password = new Uint8Array(32)
  pushEncrypted(network, client, login)
  await flush()
  return client
}

// 正常登入後送完整五鍵並推進5000ms觀察窗。
async function completeInput(network: FakeNetwork, client: PeerCrypto): Promise<void> {
  for (const message of sequence()) {
    pushEncrypted(network, client, message)
    await flush()
  }
  network.advance(5000)
  await flush()
}

// 所有對外輸出只能有security code與booleans；不含runId、peer、endpoint或原文。
function expectSafeResult(result: ReceiverResult): void {
  expect(Object.keys(result).sort()).toEqual(
    [
      'authenticated',
      'code',
      'identityBound',
      'macVerified',
      'overflow',
      'parsed',
      'purpose',
      'received',
      'requestId',
      'resourcesClosed',
      'runId',
      'schemaVersion',
      'sequenceComplete',
      'sequenceValid',
      'textExact',
      'textSingle',
      'unavailable',
      'windowComplete',
    ].sort(),
  )
  expect(JSON.stringify(result)).not.toContain(PASSWORD_TEXT)
  expect(JSON.stringify(result)).not.toContain(endpoints().hbbsUdp.host)
}

// 清理測試自己建立的module mock／fake timer，不碰其他檔案或全域socket。
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// import runtime不得啟動timer、socket或signal listener。
it('imports without starting timers, sockets, or signal listeners', async () => {
  const before = {
    sigint: process.listenerCount('SIGINT'),
    sigterm: process.listenerCount('SIGTERM'),
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  await api()
  expect(process.listenerCount('SIGINT')).toBe(before.sigint)
  expect(process.listenerCount('SIGTERM')).toBe(before.sigterm)
  expect(log).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

// 非法binding無法形成可信header，必須在任何socket前拒絕。
it('rejects an invalid binding before opening a socket', async () => {
  const runtime = await api()
  const network = new FakeNetwork()
  await expect(
    runtime.runReceiver(
      { ...binding(), purpose: 'windows-host-observation' } as never,
      endpoints(),
      new TextEncoder().encode(PASSWORD_TEXT),
      {
        network,
        publicVp8: await publicVp8(),
        writeResult: async () => {},
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.opened).toHaveLength(0)
})

// 密碼、endpoint、VP8或已取消signal都必須在socket前停止並只寫一次unavailable。
it.each(['empty-password', 'large-password', 'bad-endpoints', 'bad-vp8', 'aborted'])(
  'refuses %s before opening a socket',
  async (kind) => {
    const runtime = await api()
    const network = new FakeNetwork()
    const writes: ReceiverResult[] = []
    const password =
      kind === 'empty-password'
        ? new Uint8Array()
        : kind === 'large-password'
          ? new Uint8Array(4097).fill(1)
          : new TextEncoder().encode(PASSWORD_TEXT)
    const controller = new AbortController()
    if (kind === 'aborted') controller.abort()
    const result = await runtime.runReceiver(
      binding(),
      kind === 'bad-endpoints' ? { ...endpoints(), hbbrTcp: { host: '', port: 0 } } : endpoints(),
      password,
      {
        network,
        publicVp8: kind === 'bad-vp8' ? new Uint8Array(3) : await publicVp8(),
        writeResult: async (value) => {
          writes.push(value)
        },
      },
      controller.signal,
    )
    expect(network.opened).toHaveLength(0)
    expect(writes).toEqual([result])
    expect(result.code).toBe('receiver_unavailable')
    expect(result.resourcesClosed).toBe(true)
    expect(result.unavailable).toBe(true)
    expectSafeResult(result)
  },
)

// runtime只在未終態的讀取失敗投影真relay來源；缺來源仍unknown，結果schema不變。
it.each(['eof', 'io_failed', 'budget_exceeded', 'aborted', 'missing'] as const)(
  'reports a post-login relay read source of %s',
  async (reason) => {
    const f = await startRun()
    await logIn(f.network)
    if (reason !== 'missing') Object.assign(f.network.hbbr, { failureReason: () => reason })
    await f.network.hbbr.close()
    const result = await f.promise
    expect(result).toMatchObject({
      code: 'receiver_unavailable',
      authenticated: true,
      received: false,
      resourcesClosed: true,
    })
    const snapshot = f.diagnostic.snapshot()
    expect(snapshot).toMatchObject({
      phase: 'unknown',
      reason: reason === 'missing' ? 'unknown' : reason,
    })
    f.network.hbbr.push(Uint8Array.of(0xfe, 0xff, 0x07))
    expect(f.diagnostic.snapshot()).toEqual(snapshot)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expectSafeResult(result)
  },
)

// 完整輸入窗已完成時，收尾喚醒的reader不得拿底層舊來源毒化complete快照。
it('does not consume a read failure source during successful runtime cleanup', async () => {
  const f = await startRun()
  const client = await logIn(f.network)
  Object.assign(f.network.hbbr, { failureReason: () => 'io_failed' })
  await completeInput(f.network, client)
  expect((await f.promise).code).toBe('receiver_match')
  expect(f.diagnostic.snapshot()).toMatchObject({ phase: 'complete', reason: 'none' })
})

// 正常runtime必須只建立一個crypto實例，同一公鑰註冊後交session完成輸入。
it('runs a complete relay, login, input window and closes resources once', async () => {
  const fixture = await startRun()
  const client = await logIn(fixture.network)
  await completeInput(fixture.network, client)
  const result = await fixture.promise
  expect(result.code).toBe('receiver_match')
  expect(result).toMatchObject({
    identityBound: true,
    authenticated: true,
    received: true,
    macVerified: true,
    parsed: true,
    textSingle: true,
    textExact: true,
    sequenceComplete: true,
    sequenceValid: true,
    windowComplete: true,
    overflow: false,
    unavailable: false,
    resourcesClosed: true,
  })
  expect(fixture.writes).toEqual([result])
  expect(fixture.network.activeTimers()).toBe(0)
  expectSafeResult(result)
  expect(fixture.diagnostic.snapshot()).toMatchObject({
    phase: 'complete',
    reason: 'none',
    sessionClose: 'confirmed',
    timersClose: 'confirmed',
  })
})

// 真實送出的兩側relay控制須共用符合Coordinator Guid D gate的同一UUID，之後仍須正常加密／認證／輸入。
it('keeps a coordinator-compatible relay UUID through encrypted input', async () => {
  const f = await startRun()
  const client = await logIn(f.network)
  const hbbsFramer = createReceiverFramer(65552)
  const hbbsFrames = f.network.hbbs.sent.flatMap((chunk) => hbbsFramer.push(chunk))
  hbbsFramer.dispose()
  const offered = decodeReceiverControl(hbbsFrames[0]!).relayResponse?.uuid
  const requested = decodeReceiverControl(relayFrames(f.network)[0]!).requestRelay?.uuid
  expect(
    typeof offered === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(offered),
  ).toBe(true)
  expect(requested === offered).toBe(true)
  await completeInput(f.network, client)
  const result = await f.promise
  expect(result.code).toBe('receiver_match')
  expectSafeResult(result)
})

// 未建session前的失敗不能只留下空證據，且abort收尾不得覆寫真正失敗分支。
it.each([
  'registration',
  'udp-decode',
  'hbbs-eof',
  'hbbs-read',
  'hbbs-decode',
  'hbbr-open',
  'relay-encode',
] as const)('retains the first pre-session failure for %s', async (kind) => {
  const network = new FakeNetwork()
  if (kind === 'hbbr-open')
    vi.spyOn(network, 'openTcp').mockImplementation(async (endpoint) => {
      if (endpoint.port === endpoints().hbbrTcp.port) throw new Error('PUBLIC_SECRET_SENTINEL')
      return network.hbbs
    })
  if (kind === 'hbbs-read')
    vi.spyOn(network.hbbs, 'receive').mockRejectedValue(new Error('PUBLIC_SECRET_SENTINEL'))
  const f = await startRun(network)
  if (kind === 'registration')
    network.udp.push(encodeReceiverControl({ registerPkResponse: { result: 2 } }))
  else if (kind === 'udp-decode') network.udp.push(Uint8Array.of(255))
  else {
    network.udp.push(encodeReceiverControl({ registerPkResponse: { result: 0 } }))
    await flush()
    if (kind === 'hbbs-eof') await network.hbbs.close()
    else if (kind === 'hbbs-decode') network.hbbs.push(frameReceiverBytes(Uint8Array.of(255)))
    else if (kind === 'hbbs-read') {
      /* 正式reader已收到公開替身的I/O拒絕。 */
    } else if (kind === 'relay-encode')
      network.udp.push(encodeReceiverControl({ punchHole: { socketAddr: new Uint8Array(65490) } }))
    else network.udp.push(encodeReceiverControl({ punchHole: { socketAddr: Uint8Array.of(1) } }))
  }
  const result = await f.promise
  const expected = {
    registration: ['register_pk', 'registration_rejected'],
    'udp-decode': ['register_pk', 'decode_rejected'],
    'hbbs-eof': ['await_peer', 'eof'],
    'hbbs-read': ['await_peer', 'io_failed'],
    'hbbs-decode': ['await_peer', 'decode_rejected'],
    'hbbr-open': ['hbbr_open', 'io_failed'],
    'relay-encode': ['relay_response', 'unknown'],
  }[kind]
  // crypto在註冊前已建立，sessionClose亦涵蓋該資源的實際dispose。
  expect(f.diagnostic.snapshot()).toMatchObject({
    phase: expected[0],
    reason: expected[1],
    sessionClose: 'confirmed',
  })
  expect(JSON.stringify(f.diagnostic.snapshot())).not.toContain('PUBLIC_SECRET_SENTINEL')
  expect(result.code).toBe('receiver_unavailable')
  expectSafeResult(result)
})

// 已驗MAC但proof錯誤時定位認證分支，不把它當MAC或解析故障。
it('distinguishes authentication rejection from crypto rejection', async () => {
  const f = await startRun()
  await logIn(f.network, false)
  f.network.advance(250)
  expect((await f.promise).code).toBe('receiver_unavailable')
  expect(f.diagnostic.snapshot()).toMatchObject({
    phase: 'login',
    reason: 'authentication_rejected',
  })
})

// 壞PublicKey及登入後MAC失敗須定位實際crypto分支，不以例外文字猜原因。
it.each(['public_key', 'input_window'] as const)('locates rejected crypto in %s', async (phase) => {
  const f = await startRun()
  if (phase === 'public_key') await completeRelay(f.network)
  else await logIn(f.network)
  // cleanup可能喚醒底層reader；既有session首失敗不得被該來源覆寫。
  Object.assign(f.network.hbbr, { failureReason: () => 'io_failed' })
  f.network.hbbr.push(frameReceiverBytes(new Uint8Array(32)))
  await flush()
  f.network.advance(250)
  expect((await f.promise).code).toBe('receiver_unavailable')
  expect(f.diagnostic.snapshot()).toMatchObject({ phase, reason: 'crypto_rejected' })
})

// 共用cleanup timer真正到期才設逾時；即使後來close成功也不能改交付快照。
it('does not confirm timers when cleanup timer cancellation throws', async () => {
  const controller = new AbortController()
  const network = new FakeNetwork()
  const schedule = network.schedule.bind(network)
  vi.spyOn(network, 'schedule').mockImplementation((ms, callback) => {
    const cancel = schedule(ms, callback)
    return ms === 2000
      ? () => {
          cancel()
          throw new Error('PUBLIC_SECRET_SENTINEL')
        }
      : cancel
  })
  const f = await startRun(network, controller.signal)
  await completeRelay(network)
  controller.abort()
  expect((await f.promise).resourcesClosed).toBe(false)
  expect(f.diagnostic.snapshot()).toMatchObject({
    timersClose: 'unconfirmed',
    cleanupBudgetExceeded: false,
  })
})

// 共用cleanup timer真正到期才設逾時；即使後來close成功也不能改交付快照。
it('diagnoses cleanup expiration without changing the result contract', async () => {
  const controller = new AbortController()
  const f = await startRun(new FakeNetwork(), controller.signal)
  await completeRelay(f.network)
  f.network.hbbr.closeResult = 'hang'
  controller.abort()
  await flush()
  f.network.advance(2000)
  const result = await f.promise
  expect(result.resourcesClosed).toBe(false)
  expect(f.diagnostic.snapshot()).toMatchObject({ reason: 'aborted', cleanupBudgetExceeded: true })
  expectSafeResult(result)
})

// hbbs控制通道正常結束後，仍須完成真NaCl／proof與原五鍵觀察窗才可match。
it('completes real crypto and input after the hbbs control connection ends', async () => {
  const f = await startRun()
  const client = await logIn(f.network)
  await f.network.hbbs.close()
  await flush()
  await completeInput(f.network, client)
  const result = await f.promise
  expect(result.code).toBe('receiver_match')
  expect(
    result.identityBound && result.authenticated && result.macVerified && result.resourcesClosed,
  ).toBe(true)
  expectSafeResult(result)
})

// 成功後晚到heartbeat、timer或重複abort不得改寫已寫入的唯一result。
it('ignores late callbacks after a successful result', async () => {
  const fixture = await startRun()
  const client = await logIn(fixture.network)
  await completeInput(fixture.network, client)
  const result = await fixture.promise
  const before = JSON.stringify(result)
  pushHeartbeat(fixture.network)
  fixture.network.advance(10000)
  await flush()
  expect(fixture.writes).toHaveLength(1)
  expect(JSON.stringify(fixture.writes[0])).toBe(before)
  expect(fixture.network.activeTimers()).toBe(0)
})

// abort必須讓已建立連線收尾，且不得把取消誤判成成功。
it('stops on abort and records unavailable with closed resources', async () => {
  const controller = new AbortController()
  const fixture = await startRun(new FakeNetwork(), controller.signal)
  await completeRelay(fixture.network)
  controller.abort()
  await flush()
  const result = await fixture.promise
  expect(result.code).toBe('receiver_unavailable')
  expect(result.unavailable).toBe(true)
  expect(result.resourcesClosed).toBe(true)
  expect(fixture.writes).toEqual([result])
  expect(fixture.network.activeTimers()).toBe(0)
})

// 時鐘回退不得被當成額外等待或成功窗；必須立即停止。
it('stops when the monotonic clock moves backwards', async () => {
  const fixture = await startRun()
  await completeRelay(fixture.network)
  fixture.network.clock = -1
  pushHeartbeat(fixture.network)
  await flush()
  const result = await fixture.promise
  expect(result.code).toBe('receiver_unavailable')
  expect(result.resourcesClosed).toBe(true)
  expect(fixture.writes).toHaveLength(1)
  expect(fixture.diagnostic.snapshot().reason).toBe('clock_invalid')
})

// 180000ms包含收尾；正常scheduler在178秒開始關閉，不能因尚未輸入延長。
it('stops within the 180 second budget including cleanup', async () => {
  const fixture = await startRun()
  // 先完成登入，避免15秒握手期限先於180秒總期限觸發。
  await logIn(fixture.network)
  fixture.network.advance(178000)
  await flush()
  const result = await fixture.promise
  expect(result.code).toBe('receiver_unavailable')
  expect(result.sequenceComplete).toBe(false)
  expect(result.resourcesClosed).toBe(true)
  expect(fixture.writes).toHaveLength(1)
  fixture.network.advance(2000)
  expect(fixture.writes).toHaveLength(1)
})

// 收尾兩秒包含在180秒，不能到180秒才另外開始等待。
it('reserves cleanup inside the 180 second total deadline', async () => {
  const fixture = await startRun()
  await logIn(fixture.network)
  fixture.network.hbbr.closeResult = 'hang'
  fixture.network.advance(178000)
  await flush()
  expect(fixture.network.hbbr.closeCalls).toBeGreaterThan(0)
  fixture.network.advance(2000)
  await flush()
  expect((await fixture.promise).resourcesClosed).toBe(false)
  expect(fixture.writes).toHaveLength(1)
})

// 第2049個protocol envelope必須停止，不能截斷成成功。
it('stops at the 2049th protocol envelope', async () => {
  const fixture = await startRun()
  await completeRelay(fixture.network)
  for (let i = 0; i < 2049; i++) pushHeartbeat(fixture.network)
  await flush()
  const result = await fixture.promise
  expect(result.code).toBe('receiver_unavailable')
  expect(result.resourcesClosed).toBe(true)
  expect(fixture.writes).toHaveLength(1)
  expect(fixture.diagnostic.snapshot().reason).toBe('budget_exceeded')
})

// raw待解析buffer超過262144必須由relay終止，runtime不得留下背景工作。
it('stops when a raw relay chunk exceeds 262144 bytes', async () => {
  const fixture = await startRun()
  await completeRelay(fixture.network)
  fixture.network.hbbr.push(new Uint8Array(MAX_RAW_BYTES + 1))
  await flush()
  const result = await fixture.promise
  expect(result.code).toBe('receiver_unavailable')
  expect(result.resourcesClosed).toBe(true)
  expect(fixture.writes).toHaveLength(1)
})

// close回false或超過同一個2000ms界都必須resourcesClosed=false。
it.each(['false', 'hang'])('marks resourcesClosed=false when close is %s', async (kind) => {
  const controller = new AbortController()
  const fixture = await startRun(new FakeNetwork(), controller.signal)
  await completeRelay(fixture.network)
  // 用已建立連線後的abort觸發收尾，避免等待完整登入。
  fixture.network.hbbr.closeResult = kind === 'false' ? false : 'hang'
  controller.abort()
  if (kind === 'hang') fixture.network.advance(2000)
  await flush()
  const result = await fixture.promise
  expect(result.code).toBe('receiver_unavailable')
  expect(result.resourcesClosed).toBe(false)
  expect(fixture.writes).toHaveLength(1)
})

// writeResult拒絕時不得回報成功，也不得重複呼叫。
it('returns unavailable when result persistence fails', async () => {
  const runtime = await api()
  const writes: ReceiverResult[] = []
  const controller = new AbortController()
  const promise = runtime.runReceiver(
    binding(),
    endpoints(),
    new TextEncoder().encode(PASSWORD_TEXT),
    {
      network: new FakeNetwork(),
      publicVp8: await publicVp8(),
      writeResult: async (value) => {
        writes.push(value)
        throw new Error('public_failure')
      },
    },
    controller.signal,
  )
  promise.catch(() => {})
  await flush()
  controller.abort()
  const result = await promise
  expect(writes).toHaveLength(1)
  expect(result.code).toBe('receiver_unavailable')
  expect(result.unavailable).toBe(true)
})

// envelope與payload上限由單一budget管理，邊界值必須精確可測。
it('enforces envelope and payload limits at the exact boundary', async () => {
  const runtime = await api()
  const budget = runtime.createRuntimeBudget()
  for (let i = 0; i < 2048; i++) budget.envelope(1)
  expect(() => budget.envelope(1)).toThrow(/^receiver_unavailable$/)
  const payload = runtime.createRuntimeBudget()
  // 每個frame仍受65552上限約束，以128個65536-byte envelope精確填滿8MiB。
  for (let i = 0; i < 128; i++) payload.envelope(65536)
  expect(() => payload.envelope(1)).toThrow(/^receiver_unavailable$/)
})

// TX queue以262144為界；單一active send時不得堆出無界promise。
it('bounds the TX queue and waits for backpressure without unbounded promises', async () => {
  const runtime = await api()
  const gate: { release?: () => void } = {}
  const sends: Uint8Array[] = []
  const sender = runtime.createRuntimeSender(async (frame) => {
    sends.push(frame)
    await new Promise<void>((resolve) => {
      gate.release = resolve
    })
  })
  const first = sender.send(new Uint8Array(65536))
  await flush()
  const second = sender.send(new Uint8Array(65536))
  const third = sender.send(new Uint8Array(65536))
  expect(sender.pendingBytes()).toBe(196608)
  // 第四筆再增加65537bytes會超過262144；不得開始寫入，也不得留下無界promise。
  const fourth = sender.send(new Uint8Array(65537))
  await expect(fourth).rejects.toThrow(/^receiver_unavailable$/)
  await expect(third).rejects.toThrow(/^receiver_unavailable$/)
  await expect(second).rejects.toThrow(/^receiver_unavailable$/)
  expect(sends).toHaveLength(1)
  expect(sender.pendingBytes()).toBe(65536)
  gate.release?.()
  await flush()
  await expect(first).resolves.toBeUndefined()
  expect(sender.pendingBytes()).toBe(0)
  sender.close()
  await expect(sender.send(new Uint8Array(1))).rejects.toThrow(/^receiver_unavailable$/)
})

// 任何錯誤路徑都不能把密碼、endpoint、peer ID或原文寫到console。
it('does not print secrets or identifiers on failure', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const runtime = await api()
  const network = new FakeNetwork()
  const result = await runtime.runReceiver(
    binding(),
    endpoints(),
    new Uint8Array(),
    { network, publicVp8: await publicVp8(), writeResult: async () => {} },
    new AbortController().signal,
  )
  expect(result.code).toBe('receiver_unavailable')
  expect(log).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})
