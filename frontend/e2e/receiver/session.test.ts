import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { binding, receiverApi } from './test-fixtures'
import { createReceiverCrypto } from './crypto.ts'
import { createReceiverSession } from './session.ts'
import { PeerCrypto } from '../../src/rdweb/crypto.ts'
import { decodeMessage, encodeMessage, hbb } from '../../src/rdweb/codec.ts'
import { LoginProtocol } from '../../src/rdweb/protocol.ts'
import type { Callbacks, Phase, Ready } from '../../src/rdweb/types.ts'
import type { RemotePermissions } from '../../src/rdweb/interaction-types.ts'
import type { PeerVideo, VideoPacket } from '../../src/rdweb/video-types.ts'
import { publicReceiverText } from './contract.ts'
import { createReceiverDiagnostic, type ReceiverDiagnosticRecorder } from './diagnostic.ts'

const PASSWORD_TEXT = 'public-test-password'
const VERSION = 'rdweb-test-receiver/0.1.0'
const VP8_SHA256 = '503cd8dfafcba01760afc0794752803aa36143a14b9ad49b62c28b43de795c02'
const VP8_BYTES = 12230
const CONTROL = 4
const A_KEY = 65 * 65536
const LEGACY = 0
const TRANSLATE = 2
const expected = publicReceiverText(binding())

// 可控clock／timer及可hold的send port，不建立任何真socket或真sleep。
class FakePorts {
  readonly sent: Uint8Array[] = []
  clock = 0
  sendCalls = 0
  failNext = false
  private hold = false
  private pending: (() => void) | null = null
  private id = 0
  private readonly timers: {
    id: number
    at: number
    callback: () => void
    cancelled: boolean
  }[] = []

  // 下一次send先停住，讓測試確認影像只有一個pending。
  holdNextSend(): void {
    this.hold = true
  }

  // 釋放被hold的send；沒有等待者時保持no-op。
  releaseSend(): void {
    const resolve = this.pending
    this.pending = null
    resolve?.()
  }

  // 記錄完整frame；hold或注入失敗都用同一路徑，避免測試繞過正式send。
  async send(frame: Uint8Array): Promise<void> {
    this.sendCalls++
    if (this.hold) {
      this.hold = false
      await new Promise<void>((resolve) => {
        this.pending = resolve
      })
    }
    if (this.failNext) {
      this.failNext = false
      throw new Error('fake_send_failed')
    }
    this.sent.push(frame.slice())
  }

  // 只回本案單調clock。
  now(): number {
    return this.clock
  }

  // 登記一次性timer並回取消函式。
  schedule(delayMs: number, callback: () => void): () => void {
    const timer = { id: ++this.id, at: this.clock + delayMs, callback, cancelled: false }
    this.timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }

  // 依時間順序推進到期timer，包含callback新排的timer。
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

  // 回傳尚未取消的timer數量。
  activeTimers(): number {
    return this.timers.filter((timer) => !timer.cancelled).length
  }
}

// 讓async狀態機跑過目前microtask，不啟動真network。
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// 只讀既有公開WPT快取並驗原始hash；不重新下載或讀桌面。
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

interface Fixture {
  diagnostic: ReceiverDiagnosticRecorder
  session: ReturnType<typeof import('./session').createReceiverSession>
  media: typeof import('./media')
  crypto: ReturnType<typeof import('./crypto').createReceiverCrypto>
  ports: FakePorts
  client: PeerCrypto
  signingPublicKey: Uint8Array
}

// 每次建立新crypto／session／client；receiver與client只用公開RAM fixture。
async function fixture(): Promise<Fixture> {
  const [sessionApi, mediaApi] = (await Promise.all([
    receiverApi('session'),
    receiverApi('media'),
  ])) as [typeof import('./session'), typeof import('./media')]
  const crypto = createReceiverCrypto(binding())
  const diagnostic = createReceiverDiagnostic()
  diagnostic.acquire('session')
  diagnostic.acquire('timers')
  const ports = new FakePorts()
  const publicKeyframe = mediaApi.verifyReceiverVp8(await publicVp8())
  const session = sessionApi.createReceiverSession(
    binding(),
    new TextEncoder().encode(PASSWORD_TEXT),
    {
      crypto,
      diagnostic,
      send: (frame) => ports.send(frame),
      now: () => ports.now(),
      schedule: (delayMs, callback) => ports.schedule(delayMs, callback),
      publicVp8: publicKeyframe,
    },
  )
  return {
    diagnostic,
    session,
    media: mediaApi,
    crypto,
    ports,
    client: new PeerCrypto(),
    signingPublicKey: crypto.signingPublicKey,
  }
}

// session原本吞掉的收尾錯誤也不能在診斷中被當成已確認關閉。
it.each(['crypto', 'timer'] as const)(
  'keeps %s cleanup failure unconfirmed in diagnostics',
  async (kind) => {
    const f = await fixture()
    if (kind === 'crypto')
      vi.spyOn(f.crypto, 'dispose').mockImplementation(() => {
        throw new Error('PUBLIC_SECRET_SENTINEL')
      })
    else
      vi.spyOn(f.ports, 'schedule').mockImplementation(() => () => {
        throw new Error('PUBLIC_SECRET_SENTINEL')
      })
    await f.session.start()
    await f.session.close()
    // runtime的既有close回值彙總不得覆寫session內已知負向證據。
    f.diagnostic.close('session', true)
    f.diagnostic.close('timers', true)
    expect(f.diagnostic.snapshot()[kind === 'crypto' ? 'sessionClose' : 'timersClose']).toBe(
      'unconfirmed',
    )
  },
)

// 編碼／加密失敗尚未發生send，不能被誤分類為I/O錯誤。
it('distinguishes crypto encryption failure from an attempted send failure', async () => {
  const f = await fixture()
  await f.session.start()
  const signedId = decodeMessage(f.ports.sent[0]!).signedId!.id!
  const key = f.client.handshake(signedId, binding().peerId, f.signingPublicKey)
  vi.spyOn(f.crypto, 'encrypt').mockImplementation(() => {
    throw new Error('PUBLIC_SECRET_SENTINEL')
  })
  await f.session.receive(key)
  expect(f.diagnostic.snapshot()).toMatchObject({ phase: 'public_key', reason: 'crypto_rejected' })
})

// 依RustDesk pinned proof計算兩層SHA-256，密碼只在本helper內短暫存在。
function computeProof(password: Uint8Array, salt: string, challenge: string): Uint8Array {
  const intermediate = createHash('sha256').update(password).update(salt, 'utf8').digest()
  const proof = createHash('sha256').update(intermediate).update(challenge, 'utf8').digest()
  intermediate.fill(0)
  return new Uint8Array(proof)
}

interface LoginOverrides {
  request?: Partial<hbb.LoginRequest.$Properties>
  option?: Partial<hbb.OptionMessage.$Properties>
}

// 手寫正常遠控LoginRequest；每案只覆寫要驗證的欄位。
function loginMessage(
  f: Fixture,
  hash: { salt: string; challenge: string },
  overrides: LoginOverrides = {},
): hbb.IMessage {
  const password = new TextEncoder().encode(PASSWORD_TEXT)
  const proof = computeProof(password, hash.salt, hash.challenge)
  password.fill(0)
  const option: hbb.OptionMessage.$Properties = {
    disableAudio: hbb.OptionMessage.BoolOption.Yes,
    disableClipboard: hbb.OptionMessage.BoolOption.Yes,
    disableKeyboard: hbb.OptionMessage.BoolOption.No,
    disableCamera: hbb.OptionMessage.BoolOption.Yes,
    imageQuality: hbb.ImageQuality.Balanced,
    customFps: 30,
    supportedDecoding: { abilityVp8: 1 },
    ...overrides.option,
  }
  const loginRequest: hbb.LoginRequest.$Properties = {
    username: binding().peerId,
    password: proof,
    myId: '33333333-3333-4333-8333-333333333333',
    myName: 'Public Test',
    myPlatform: 'Web',
    version: '1.4.2',
    videoAckRequired: true,
    sessionId: 1,
    option,
    ...overrides.request,
  }
  return { loginRequest }
}

interface HashFixture {
  salt: string
  challenge: string
}

// 正式client以真NaCl完成SignedId→PublicKey，receiver回Hash。
async function handshake(f: Fixture): Promise<HashFixture> {
  await f.session.start()
  const signed = f.ports.sent[0]!
  const signedId = decodeMessage(signed).signedId?.id
  expect(signedId).toBeTruthy()
  const publicKey = f.client.handshake(signedId!, binding().peerId, f.signingPublicKey)
  await f.session.receive(publicKey)
  await flush()
  const hashMessage = decodeMessage(f.client.decrypt(f.ports.sent[1]!))
  expect(hashMessage.union).toBe('hash')
  const hash = hashMessage.hash
  expect(hash?.salt).toBeTruthy()
  expect(hash?.challenge).toBeTruthy()
  return { salt: hash!.salt!, challenge: hash!.challenge! }
}

// 依序解密receiver送出的加密控制；client RX counter不可跳號。
class EncryptedReader {
  private index: number
  constructor(
    private readonly client: PeerCrypto,
    private readonly sent: Uint8Array[],
    start: number,
  ) {
    this.index = start
  }

  next(): hbb.Message {
    const frame = this.sent[this.index++]
    expect(frame).toBeDefined()
    return decodeMessage(this.client.decrypt(frame!))
  }
}

// 完成握手與登入，回傳從LoginResponse開始的reader。
async function logIn(f: Fixture): Promise<EncryptedReader> {
  const hash = await handshake(f)
  await f.session.receive(f.client.encrypt(encodeMessage(loginMessage(f, hash))))
  await flush()
  return new EncryptedReader(f.client, f.ports.sent, 2)
}

// 讀完登入後的四個加密frame：LoginResponse、兩個PermissionInfo、第一張VideoFrame。
function readLoginFrames(reader: EncryptedReader): hbb.Message[] {
  return [reader.next(), reader.next(), reader.next(), reader.next()]
}

// 手寫五鍵序列；expected只由Task24產生，不呼叫sender encoder。
function key(value: Record<string, unknown>): hbb.IMessage {
  return {
    keyEvent: { down: false, press: false, mode: LEGACY, modifiers: [], ...value },
  }
}

// 公開surface固定(20,30)，mask只用手寫0／9／10。
function mouse(value: Record<string, unknown> = {}): hbb.IMessage {
  return { mouseEvent: { mask: 0, x: 20, y: 30, modifiers: [], ...value } }
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

// 正常握手必須先送SignedId，PublicKey後才產生非空且每輪新的Hash。
it('starts with SignedId and sends a fresh non-empty Hash after PublicKey', async () => {
  const first = await fixture()
  const hash = await handshake(first)
  expect(hash.salt).not.toHaveLength(0)
  expect(hash.challenge).not.toHaveLength(0)
  const second = await fixture()
  const next = await handshake(second)
  expect(next.salt).not.toBe(hash.salt)
  expect(next.challenge).not.toBe(hash.challenge)
  await first.session.close()
  await second.session.close()
})

// 錯proof不得送PeerInfo，且所有後續訊息不再推進。
it('rejects a wrong proof without sending PeerInfo', async () => {
  const f = await fixture()
  const hash = await handshake(f)
  const before = f.ports.sent.length
  await f.session.receive(
    f.client.encrypt(
      encodeMessage(loginMessage(f, hash, { request: { password: new Uint8Array(32) } })),
    ),
  )
  await flush()
  expect(f.ports.sent).toHaveLength(before)
  expect(f.session.snapshot()).toMatchObject({
    authenticated: false,
    macVerified: true,
    parsed: true,
    unavailable: true,
    resourcesClosed: false,
  })
})

// 正常登入只回精確PeerInfo、keyboard enabled／clipboard disabled及一張VP8 keyframe。
it('authenticates and sends exact PeerInfo, permissions and pinned VP8 keyframe', async () => {
  const f = await fixture()
  const reader = await logIn(f)
  const response = reader.next()
  expect(response.union).toBe('loginResponse')
  expect(response.loginResponse?.peerInfo).toMatchObject({
    platform: 'Windows',
    version: VERSION,
    currentDisplay: 0,
    sasEnabled: false,
    encoding: { vp8: true },
  })
  expect(response.loginResponse?.peerInfo?.displays).toHaveLength(1)
  expect(response.loginResponse?.peerInfo?.displays?.[0]).toMatchObject({
    x: 0,
    y: 0,
    width: 320,
    height: 240,
  })
  const permissions = [reader.next(), reader.next()].map((message) => message.misc?.permissionInfo)
  expect(permissions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        permission: hbb.PermissionInfo.Permission.Keyboard,
        enabled: true,
      }),
      expect.objectContaining({
        permission: hbb.PermissionInfo.Permission.Clipboard,
        enabled: false,
      }),
    ]),
  )
  const video = reader.next()
  expect(video.union).toBe('videoFrame')
  const frame = video.videoFrame?.vp8s?.frames?.[0]
  expect(frame?.data).toEqual(await publicVp8().then((source) => source.slice(522, 522 + 4826)))
  expect(frame).toMatchObject({ key: true })
  expect(Number(frame?.pts)).toBe(0)
  expect(f.session.snapshot()).toMatchObject({
    identityBound: true,
    authenticated: true,
    received: false,
    macVerified: true,
    parsed: true,
    textSingle: false,
    textExact: false,
    sequenceComplete: false,
    sequenceValid: false,
    windowComplete: false,
    overflow: false,
    unavailable: false,
    resourcesClosed: false,
  })
  expect(Object.keys(f.session.snapshot()).sort()).toEqual([
    'authenticated',
    'identityBound',
    'macVerified',
    'overflow',
    'parsed',
    'received',
    'resourcesClosed',
    'sequenceComplete',
    'sequenceValid',
    'textExact',
    'textSingle',
    'unavailable',
    'windowComplete',
  ])
  expect(JSON.stringify(f.session.snapshot())).not.toContain('Public')
  await f.session.close()
})

// 任何非預期LoginRequest option都不能取得PeerInfo。
it.each([
  ['clipboard enabled', { disableClipboard: hbb.OptionMessage.BoolOption.No }],
  ['keyboard disabled', { disableKeyboard: hbb.OptionMessage.BoolOption.Yes }],
  ['audio enabled', { disableAudio: hbb.OptionMessage.BoolOption.No }],
  ['camera enabled', { disableCamera: hbb.OptionMessage.BoolOption.No }],
  ['wrong fps', { customFps: 24 }],
  ['wrong quality', { imageQuality: hbb.ImageQuality.Best }],
  ['no VP8', { supportedDecoding: { abilityVp8: 0 } }],
])('rejects login option %s', async (_name, option) => {
  const f = await fixture()
  const hash = await handshake(f)
  const before = f.ports.sent.length
  await f.session.receive(f.client.encrypt(encodeMessage(loginMessage(f, hash, { option }))))
  await flush()
  expect(f.ports.sent).toHaveLength(before)
  expect(f.session.snapshot()).toMatchObject({ authenticated: false, unavailable: true })
})

// LoginRequest的fileTransfer／terminal等非遠控union一律拒絕。
it('rejects a non-remote-control LoginRequest union', async () => {
  const f = await fixture()
  const hash = await handshake(f)
  const before = f.ports.sent.length
  await f.session.receive(
    f.client.encrypt(encodeMessage(loginMessage(f, hash, { request: { terminal: {} } }))),
  )
  await flush()
  expect(f.ports.sent).toHaveLength(before)
  expect(f.session.snapshot()).toMatchObject({ authenticated: false, unavailable: true })
})

// PublicKey之前只能收明文PublicKey；任何明文LoginRequest都不得推進。
it('rejects a plaintext LoginRequest before PublicKey', async () => {
  const f = await fixture()
  await f.session.start()
  await f.session.receive(encodeMessage(loginMessage(f, { salt: 'x', challenge: 'y' })))
  await flush()
  expect(f.ports.sent).toHaveLength(1)
  expect(f.session.snapshot()).toMatchObject({ authenticated: false, unavailable: true })
})

// PublicKey之後只接受真NaCl密文；明文或翻轉MAC都不能推進。
it.each([
  [
    'plaintext LoginRequest',
    (f: Fixture, hash: HashFixture) => encodeMessage(loginMessage(f, hash)),
  ],
  [
    'bad MAC',
    (f: Fixture, hash: HashFixture) => {
      const frame = f.client.encrypt(encodeMessage(loginMessage(f, hash)))
      frame[0] = frame[0]! ^ 1
      return frame
    },
  ],
])('rejects %s after PublicKey', async (_name, makeFrame) => {
  const f = await fixture()
  const hash = await handshake(f)
  const before = f.ports.sent.length
  await f.session.receive(makeFrame(f, hash))
  await flush()
  expect(f.ports.sent).toHaveLength(before)
  expect(f.session.snapshot()).toMatchObject({
    authenticated: false,
    macVerified: false,
    unavailable: true,
  })
})

// PublicKey之後重複同一個明文PublicKey屬錯state，不得再送PeerInfo。
it('rejects a repeated PublicKey', async () => {
  const f = await fixture()
  await f.session.start()
  const publicKey = f.client.handshake(
    decodeMessage(f.ports.sent[0]!).signedId!.id!,
    binding().peerId,
    f.signingPublicKey,
  )
  await f.session.receive(publicKey)
  await flush()
  const before = f.ports.sent.length
  await f.session.receive(publicKey)
  await flush()
  expect(f.ports.sent).toHaveLength(before)
  expect(f.session.snapshot()).toMatchObject({ authenticated: false, unavailable: true })
})

// 登入成功後再送LoginRequest或Hash屬錯state，不得再送PeerInfo。
it('rejects LoginRequest and Hash after ready', async () => {
  for (const name of ['LoginRequest', 'Hash']) {
    const f = await fixture()
    const hash = await handshake(f)
    await f.session.receive(f.client.encrypt(encodeMessage(loginMessage(f, hash))))
    await flush()
    const before = f.ports.sent.length
    const message =
      name === 'LoginRequest'
        ? loginMessage(f, hash)
        : ({ hash: { salt: 'x', challenge: 'y' } } as hbb.IMessage)
    await f.session.receive(f.client.encrypt(encodeMessage(message)))
    await flush()
    expect(f.ports.sent).toHaveLength(before)
    expect(f.session.snapshot().unavailable).toBe(true)
  }
})

// PublicKey與LoginRequest階段各只有15000ms，逾時不得再送PeerInfo。
it.each(['before PublicKey', 'after PublicKey'])('times out the %s phase', async (phase) => {
  const f = await fixture()
  if (phase === 'before PublicKey') await f.session.start()
  else await handshake(f)
  f.ports.advance(15000)
  await flush()
  expect(f.session.snapshot().unavailable).toBe(true)
  expect(f.ports.activeTimers()).toBe(0)
})

// 成功登入後握手timer必須清除，15秒不會誤殺連線。
it('does not time out after a successful login', async () => {
  const f = await fixture()
  await logIn(f)
  f.ports.advance(15000)
  await flush()
  expect(f.session.snapshot().unavailable).toBe(false)
  await f.session.close()
})

// TestDelay只echo相同time並固定fromClient=false，不消耗額外狀態。
it('echoes TestDelay after login', async () => {
  const f = await fixture()
  const reader = await logIn(f)
  readLoginFrames(reader)
  await f.session.receive(
    f.client.encrypt(encodeMessage({ testDelay: { time: 42, fromClient: true } })),
  )
  await flush()
  expect(Number(reader.next().testDelay?.time)).toBe(42)
})

// 空heartbeat不計MAC、不推進RX；後續真密文仍可正常解密。
it('ignores heartbeats without consuming the next RX counter', async () => {
  const f = await fixture()
  const reader = await logIn(f)
  readLoginFrames(reader)
  await f.session.receive(Uint8Array.of(0))
  await f.session.receive(f.client.encrypt(encodeMessage({ misc: { videoReceived: true } })))
  await flush()
  expect(f.session.snapshot()).toMatchObject({ unavailable: false, macVerified: true })
  await f.session.close()
})

// ready後只接受已核對控制；clipboard／file／未知misc立即unavailable。
it.each([
  ['videoReceived', { misc: { videoReceived: true } }],
  ['refreshVideo', { misc: { refreshVideo: true } }],
  [
    'permissionInfo',
    {
      misc: {
        permissionInfo: { permission: hbb.PermissionInfo.Permission.Keyboard, enabled: true },
      },
    },
  ],
  ['option', { misc: { option: { imageQuality: hbb.ImageQuality.Balanced } } }],
])('accepts ready control %s', async (_name, message) => {
  const f = await fixture()
  const reader = await logIn(f)
  readLoginFrames(reader)
  await f.session.receive(f.client.encrypt(encodeMessage(message)))
  await flush()
  expect(f.session.snapshot()).toMatchObject({ unavailable: false, macVerified: true })
  await f.session.close()
})

it.each([
  ['clipboard', { clipboard: { compress: false, content: Uint8Array.of(1, 2) } }],
  ['chat', { misc: { chatMessage: { text: 'public' } } }],
  ['file', { fileAction: { readDir: { path: '/public' } } }],
])('rejects ready control %s', async (_name, message) => {
  const f = await fixture()
  const reader = await logIn(f)
  readLoginFrames(reader)
  await f.session.receive(f.client.encrypt(encodeMessage(message)))
  await flush()
  expect(f.session.snapshot()).toMatchObject({ unavailable: true })
})

// session必須把五鍵交給Task26 oracle，並在完整五鍵後滿5000ms才windowComplete。
it('merges the five-key oracle and exposes the exact 5000ms window', async () => {
  const f = await fixture()
  const reader = await logIn(f)
  readLoginFrames(reader)
  for (const message of [mouse(), mouse({ mask: 9 }), mouse({ mask: 10 }), ...sequence()]) {
    await f.session.receive(f.client.encrypt(encodeMessage(message)))
  }
  f.ports.advance(4999)
  expect(f.session.snapshot()).toMatchObject({
    received: true,
    parsed: true,
    textSingle: true,
    textExact: true,
    sequenceComplete: true,
    sequenceValid: true,
    windowComplete: false,
    unavailable: false,
  })
  f.ports.advance(1)
  expect(f.session.snapshot().windowComplete).toBe(true)
  await f.session.close()
})

// 影像第一張立即送，第二張至少間隔1000ms且PTS單調。
it('paces VP8 keyframes with monotonic PTS', async () => {
  const f = await fixture()
  const reader = await logIn(f)
  readLoginFrames(reader)
  const firstPts = 0
  const before = f.ports.sent.length
  f.ports.advance(999)
  await flush()
  expect(f.ports.sent).toHaveLength(before)
  f.ports.advance(1)
  await flush()
  expect(f.ports.sent).toHaveLength(before + 1)
  const second = reader.next()
  expect(Number(second.videoFrame?.vp8s?.frames?.[0]?.pts)).toBeGreaterThan(firstPts)
  await f.session.close()
})

// send未完成時不得再排第二張，避免refresh或時鐘推進堆出無界queue。
it('keeps only one pending keyframe', async () => {
  const f = await fixture()
  const reader = await logIn(f)
  readLoginFrames(reader)
  const before = f.ports.sent.length
  f.ports.holdNextSend()
  f.ports.advance(1000)
  await flush()
  const calls = f.ports.sendCalls
  f.ports.advance(1000)
  await flush()
  expect(f.ports.sendCalls).toBe(calls)
  expect(f.ports.sent).toHaveLength(before)
  f.ports.releaseSend()
  await flush()
  expect(f.ports.sent).toHaveLength(before + 1)
  await f.session.close()
})

// send失敗必須標unavailable並停止影像timer，不能留下背景送送。
it('stops on send failure', async () => {
  const f = await fixture()
  const reader = await logIn(f)
  readLoginFrames(reader)
  f.ports.failNext = true
  f.ports.advance(1000)
  await flush()
  expect(f.session.snapshot()).toMatchObject({
    unavailable: true,
    resourcesClosed: false,
  })
  expect(f.ports.activeTimers()).toBe(0)
})

// close只收session自有timer；resourcesClosed仍留Task29彙總。
it('closes timers without claiming resourcesClosed', async () => {
  const f = await fixture()
  await logIn(f)
  expect(await f.session.close()).toBe(true)
  expect(f.ports.activeTimers()).toBe(0)
  expect(f.session.snapshot().resourcesClosed).toBe(false)
  expect(await f.session.close()).toBe(true)
})

// 空VP8或空密碼在start前拒絕，避免進入握手。
it.each([
  ['empty VP8', new Uint8Array(), new TextEncoder().encode(PASSWORD_TEXT)],
  ['empty password', new Uint8Array([1]), new Uint8Array()],
])('rejects %s before start', async (_name, publicKeyframe, password) => {
  const sessionApi = (await receiverApi('session')) as typeof import('./session')
  const crypto = createReceiverCrypto(binding())
  const ports = new FakePorts()
  expect(() =>
    sessionApi.createReceiverSession(binding(), password, {
      crypto,
      send: (frame) => ports.send(frame),
      now: () => ports.now(),
      schedule: (delayMs, callback) => ports.schedule(delayMs, callback),
      publicVp8: publicKeyframe,
    }),
  ).toThrow(/^receiver_unavailable$/)
})

// start只能一次；重複呼叫不得再送第二個SignedId。
it('rejects a duplicate start', async () => {
  const f = await fixture()
  await f.session.start()
  await expect(f.session.start()).rejects.toThrow(/^receiver_unavailable$/)
  expect(f.ports.sent).toHaveLength(1)
})

// 28.4：以正式LoginProtocol＋真PeerCrypto在公開記憶體完成認證、權限及首影像互通。
it('interoperates with the production LoginProtocol and PeerCrypto', async () => {
  const media = (await receiverApi('media')) as typeof import('./media')
  const keyframe = media.verifyReceiverVp8(await publicVp8())
  const crypto = createReceiverCrypto(binding())
  const receiverOutbox: Uint8Array[] = []
  const clientOutbox: Uint8Array[] = []
  const password = new TextEncoder().encode(PASSWORD_TEXT)
  const session = createReceiverSessionForInterop(password, crypto, keyframe, receiverOutbox)
  password.fill(0)
  const ready: Ready = {
    type: 'rdweb.ready',
    protocol: 'rustdesk/1.4.2',
    transport: 'tcp',
    connection_id: '44444444-4444-4444-8444-444444444444',
    target_id: 'public-test-target',
    rustdesk_id: binding().peerId,
    peer_signing_key: Buffer.from(crypto.signingPublicKey).toString('base64'),
  }
  const phases: Phase[] = []
  let permissions: RemotePermissions = { keyboard: false, clipboard: false }
  let peer: PeerVideo | null = null
  let packet: VideoPacket | null = null
  let failure: string | null = null
  const callbacks: Callbacks = {
    send: (bytes) => clientOutbox.push(bytes.slice()),
    assist: async (connectionId, salt, challenge) => {
      expect(connectionId).toBe(ready.connection_id)
      const source = new TextEncoder().encode(PASSWORD_TEXT)
      try {
        return computeProof(source, salt, challenge)
      } finally {
        source.fill(0)
      }
    },
    phase: (value) => phases.push(value),
    verified: (value) => {
      peer = value
    },
    video: (value) => {
      // LoginProtocol在receive finally清除明文，media owner必須同步owned copy。
      packet = {
        ...value,
        frames: value.frames.map((frame) => ({ ...frame, data: frame.data.slice() })),
      }
    },
    display: () => undefined,
    failure: (code) => {
      failure = code
    },
    inputPeer: () => undefined,
    permission: (value) => {
      permissions = value
    },
    clipboard: () => undefined,
    activity: () => undefined,
  }
  const protocol = new LoginProtocol(ready, callbacks, { profiles: { vp8: ['vp8'] } })
  try {
    await session.start()
    for (let round = 0; round < 16 && !packet; round++) {
      while (receiverOutbox.length) protocol.receive(receiverOutbox.shift()!)
      await flush()
      while (clientOutbox.length) await session.receive(clientOutbox.shift()!)
      await flush()
    }
    expect(failure).toBeNull()
    expect(phases).toContain('awaiting_video')
    expect(peer).toMatchObject({
      platform: 'Windows',
      display: 0,
      width: 320,
      height: 240,
      displayCount: 1,
    })
    expect(permissions).toEqual({ keyboard: true, clipboard: false })
    const receivedPacket = packet as VideoPacket | null
    expect(receivedPacket).not.toBeNull()
    expect(receivedPacket?.codec).toBe('vp8')
    expect(receivedPacket?.frames).toHaveLength(1)
    expect(receivedPacket?.frames[0]).toMatchObject({ codec: 'vp8', key: true, pts: '0' })
    expect(receivedPacket?.frames[0]?.data).toEqual(keyframe)
  } finally {
    await session.close()
    protocol.dispose()
  }
})

// 互通helper只建立正式session實例；不複製生產狀態機或sender oracle。
function createReceiverSessionForInterop(
  password: Uint8Array,
  crypto: ReturnType<typeof createReceiverCrypto>,
  publicVp8: Uint8Array,
  outbox: Uint8Array[],
) {
  return createReceiverSession(binding(), password, {
    crypto,
    send: async (frame) => {
      outbox.push(frame.slice())
    },
    now: () => 0,
    schedule: () => () => undefined,
    publicVp8,
  })
}
