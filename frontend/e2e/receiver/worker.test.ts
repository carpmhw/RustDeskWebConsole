import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { MessageChannel } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { build } from 'vite'
import nacl from 'tweetnacl'
import { nonce } from '../../src/rdweb/crypto.ts'
import { decodeMessage, encodeIdentity, encodeMessage } from '../../src/rdweb/codec.ts'
import type { hbb } from '../../src/rdweb/generated/message.ts'
import type { Phase } from '../../src/rdweb/types.ts'
import type { VideoMainEvent, VideoWorkerEvent } from '../../src/rdweb/video-types.ts'
import { binding } from './test-fixtures'
import { publicReceiverText } from './contract.ts'
import { createReceiverCrypto } from './crypto.ts'
import { createReceiverSession } from './session.ts'
import { verifyReceiverVp8 } from './media.ts'
import { createReceiverFramer, frameReceiverBytes } from './framing.ts'

const TARGET = '00000000-0000-0000-0000-000000000001'
const PEER = '123456789'
const CONNECTION = '12345678-1234-4234-8234-123456789abc'
const ORIGIN = 'http://localhost'
const BASE = '/rdweb'
const TICKET = 'public-test-ticket'
const SALT = 'public-salt'
const CHALLENGE = 'public-challenge'
const INPUT_TEXT = 'Public receiver input'

// 公開Probe frame只代表生命週期，不宣稱native解碼或硬體支持。
class PublicFrame {
  closed = false
  // 幾何固定320×240，與公開WPT VP8 keyframe一致。
  constructor(
    readonly codedWidth = 320,
    readonly codedHeight = 240,
    readonly timestamp = 0,
  ) {}
  // display尺寸沿用coded尺寸，供presentation gate核對。
  get displayWidth(): number {
    return this.codedWidth
  }
  // display尺寸沿用coded尺寸，供presentation gate核對。
  get displayHeight(): number {
    return this.codedHeight
  }
  // 只記錄RAM替身是否已釋放，不涉及native資源。
  close(): void {
    this.closed = true
  }
}

interface DecoderInitLike {
  output: (frame: PublicFrame) => void
  error: () => void
}

// 公開VideoDecoder替身只驗Worker控制流，不解碼真VP8或冒充browser支持。
class PublicVideoDecoder {
  static enabled = true
  static failDecode = false
  static holdOutput = false
  static lastInput: Uint8Array | null = null
  static readonly pending: { frame: PublicFrame; output: (frame: PublicFrame) => void }[] = []

  // 只交付本測試hold的output，用來驗正式Worker拒絕晚到frame的ownership。
  static releaseOutput(): void {
    for (const { frame, output } of this.pending.splice(0)) output(frame)
  }
  // probe與media配置都只廣告vp8，其他family回unsupported。
  static async isConfigSupported(config: VideoDecoderConfig): Promise<VideoDecoderSupport> {
    return { supported: PublicVideoDecoder.enabled && config.codec === 'vp8', config }
  }
  state = 'unconfigured'
  decodeQueueSize = 0
  config: VideoDecoderConfig | null = null
  #init: DecoderInitLike
  #dequeue: (() => void) | null = null
  // 保存原生回呼替身，實際decode仍由測試同步交付公開frame。
  constructor(init: DecoderInitLike) {
    this.#init = init
  }
  // 只支援dequeue listener，對應createNativeDecoder的單一註冊。
  addEventListener(type: string, listener: () => void): void {
    if (type === 'dequeue') this.#dequeue = listener
  }
  // 關閉時移除listener，避免晚到回呼。
  removeEventListener(): void {
    this.#dequeue = null
  }
  // 記錄Worker要求配置的參數，不驗證native支援。
  configure(config: VideoDecoderConfig): void {
    this.config = config
    this.state = 'configured'
  }
  // 以配置幾何產生公開frame並同步通知dequeue，維持原有pump。
  decode(chunk: PublicEncodedVideoChunk): void {
    PublicVideoDecoder.lastInput = chunk.init.data.slice()
    if (PublicVideoDecoder.failDecode) {
      this.#init.error()
      return
    }
    const frame = new PublicFrame(
      this.config?.codedWidth ?? 320,
      this.config?.codedHeight ?? 240,
      chunk.timestamp,
    )
    if (PublicVideoDecoder.holdOutput)
      PublicVideoDecoder.pending.push({ frame, output: this.#init.output })
    else this.#init.output(frame)
    this.#dequeue?.()
  }
  // RAM替身沒有native資源，只更新狀態。
  close(): void {
    this.state = 'closed'
    this.#dequeue = null
  }
}

// 只承接createNativeDecoder的chunk建構參數，不進行真正解碼。
class PublicEncodedVideoChunk {
  // 真EncodedVideoChunk會同步複製輸入；替身同樣不能保留稍後被清零的view。
  constructor(readonly init: { type: string; timestamp: number; data: Uint8Array }) {
    this.init = { ...init, data: init.data.slice() }
  }

  // timestamp沿原生介面直接取值，不由替身frame預設值掩蓋缺欄位。
  get timestamp(): number {
    return this.init.timestamp
  }
}

// 公開Socket替身取代transport，NaCl與protobuf仍由正式Worker執行。
class PublicSocket {
  static readonly instances: PublicSocket[] = []
  readyState = 1
  bufferedAmount = 0
  binaryType: BinaryType = 'arraybuffer'
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: Pick<CloseEvent, 'code'>) => void) | null = null
  readonly sent: Uint8Array[] = []
  closed = false
  // 保存實際傳入的URL與subprotocol，測試不建立任何真連線。
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    PublicSocket.instances.push(this)
  }
  // 複製每次wire，避免caller清除plaintext後影響斷言。
  send(bytes: Uint8Array): void {
    this.sent.push(new Uint8Array(bytes))
  }
  // 模擬正常關閉，不觸發額外network候選。
  close(): void {
    this.closed = true
    this.readyState = 3
  }
  // 由測試扮演server交付ready字串或cipher binary。
  deliver(data: string | ArrayBuffer): void {
    this.onmessage?.({ data } as MessageEvent)
  }
}

interface HarnessEvent {
  value: VideoWorkerEvent
  transfer?: readonly unknown[]
}

interface Harness {
  readonly events: HarnessEvent[]
  // 已clone-safe的控制訊息走MessageChannel；probe帶frame需直接交付。
  send(value: VideoMainEvent): void
  // 只有frame無法structured clone，才以公開替身直接呼叫Worker入口。
  deliverProbe(frame: PublicFrame): void
  // 取回此次Worker建立的唯一公開Socket替身。
  socket(): PublicSocket
  // 結束owned MessagePort，避免影響測試程序生命週期。
  close(): void
}

// 把bytes複製成獨立ArrayBuffer，模擬一則原生WS message。
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer as ArrayBuffer
}

// 建立全新VM global，載入正式Vite bundle並接管message／socket邊界。
function createHarness(code: string): Harness {
  PublicSocket.instances.length = 0
  const events: HarnessEvent[] = []
  const sandbox: Record<string, unknown> = {
    // Worker正式路徑不應輸出內容；替身只吞掉第三方lib訊息。
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    performance,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    crypto: globalThis.crypto,
    URL,
    URLSearchParams,
    WebSocket: PublicSocket,
    VideoDecoder: PublicVideoDecoder,
    VideoFrame: PublicFrame,
    EncodedVideoChunk: PublicEncodedVideoChunk,
    // 共用host typed-array建構器，讓VM內外NaCl／protobuf的instanceof一致。
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    ArrayBuffer,
    DataView,
    // Worker出口只記錄safe事件與transfer ownership，不實際傳送。
    postMessage: (value: unknown, transfer?: unknown[]): void => {
      events.push({ value: value as VideoWorkerEvent, transfer })
    },
  }
  sandbox.self = sandbox
  const context = vm.createContext(sandbox)
  vm.runInContext(code, context, { filename: 'protocol.worker.js' })
  const channel = new MessageChannel()
  channel.port2.on('message', (data: unknown) => {
    const handler = sandbox.onmessage as ((event: { data: unknown }) => void) | undefined
    handler?.({ data })
  })
  channel.port1.unref()
  channel.port2.unref()
  return {
    events,
    // 控制訊息經真structured clone送到正式Worker入口。
    send(value: VideoMainEvent): void {
      channel.port1.postMessage(value)
    },
    // Probe frame不進channel，直接交公開RAM替身。
    deliverProbe(frame: PublicFrame): void {
      const handler = sandbox.onmessage as ((event: { data: unknown }) => void) | undefined
      handler?.({
        data: { type: 'probe', revision: 1, frame: frame as unknown as VideoFrame },
      })
    },
    // 本案只允許Worker建立一個替身，額外連線即失敗。
    socket(): PublicSocket {
      const instance = PublicSocket.instances.at(-1)
      if (!instance) throw new Error('public_socket_fixture_unavailable')
      return instance
    },
    // 釋放owned ports；不影響任何真網路或程序。
    close(): void {
      channel.port1.close()
      channel.port2.close()
    },
  }
}

// 等待指定型別的Worker事件，逾時由Vitest既有機制回報。
async function waitForEvent<T extends VideoWorkerEvent['type']>(
  harness: Harness,
  type: T,
): Promise<Extract<VideoWorkerEvent, { type: T }>> {
  let found: Extract<VideoWorkerEvent, { type: T }> | undefined
  await vi.waitFor(() => {
    found = harness.events
      .map((entry) => entry.value)
      .find((value): value is Extract<VideoWorkerEvent, { type: T }> => value.type === type)
    expect(found).toBeDefined()
  })
  return found!
}

// 等待Worker公開的phase，避免以目前事件陣列猜測時序。
async function waitForPhase(harness: Harness, phase: Phase): Promise<void> {
  await vi.waitFor(() => {
    expect(
      harness.events.some(({ value }) => value.type === 'phase' && value.phase === phase),
    ).toBe(true)
  })
}

// 只取最後一個input-state，並等待正式media轉streaming後ready。
async function waitForInputReady(
  harness: Harness,
): Promise<Extract<VideoWorkerEvent, { type: 'input-state' }>> {
  let found: Extract<VideoWorkerEvent, { type: 'input-state' }> | undefined
  await vi.waitFor(() => {
    found = harness.events
      .map((entry) => entry.value)
      .filter((value): value is Extract<VideoWorkerEvent, { type: 'input-state' }> => {
        return value.type === 'input-state'
      })
      .at(-1)
    expect(found?.ready).toBe(true)
  })
  return found!
}

// 依Worker TX順序解開一則secretbox；index 0為未加密handshake。
// protobuf bytes欄位是plaintext的view，必須在finally清零前完成取值。
function inspectSent<T>(
  socket: PublicSocket,
  index: number,
  key: Uint8Array,
  inspect: (message: hbb.IMessage) => T,
): T {
  const plaintext = nacl.secretbox.open(socket.sent[index]!, nonce(BigInt(index)), key)
  if (!plaintext) throw new Error('public_cipher_fixture_failed')
  try {
    return inspect(decodeMessage(plaintext))
  } finally {
    plaintext.fill(0)
  }
}

// 讀取既有公開WPT VP8 fixture；只取keyframe，不做native decode。
function publicVp8Keyframe(): Uint8Array {
  const samples = JSON.parse(
    readFileSync(
      new URL('../../src/rdweb/__fixtures__/codec-samples.json', import.meta.url),
      'utf8',
    ),
  ) as { codec: string; frames: { data: string; key: boolean; pts: string }[] }[]
  const sample = samples.find((value) => value.codec === 'vp8')
  const frame = sample?.frames[0]
  if (!frame?.key) throw new Error('public_vp8_fixture_unavailable')
  return Uint8Array.from(atob(frame.data), (char) => char.charCodeAt(0))
}

let workerCode = ''

// 真receiver與編譯Worker只在transport／decoder邊界替換；不手寫server協定回覆。
function receiverWorkerLoop() {
  const harness = createHarness(workerCode)
  const probe = new PublicFrame()
  const b = binding()
  const crypto = createReceiverCrypto(b)
  const receiverOutbox: Uint8Array[] = []
  const framer = createReceiverFramer(65552)
  const timers = new Set<() => void>()
  const password = new TextEncoder().encode('public-loop-password')
  let clock = 0,
    clientIndex = 0,
    clientFrames = 0,
    assisted = false
  const session = createReceiverSession(b, password, {
    crypto,
    publicVp8: verifyReceiverVp8(
      readFileSync(new URL('../../.cache/codec-fixtures/vp8.webm', import.meta.url)),
    ),
    // 兩方向都用正式TCP framing；只複製自有cipher，不開任何socket。
    send: async (frame) => {
      receiverOutbox.push(frameReceiverBytes(frame))
    },
    now: () => clock,
    // 本測試不推進影像timer，取消仍須真正移除本輪所有權。
    schedule: (_delay, callback) => {
      timers.add(callback)
      return () => {
        timers.delete(callback)
      }
    },
  })
  password.fill(0)

  // 單一consumer依序交換密文；有界循環避免錯誤echo形成無限測試。
  async function drain(): Promise<void> {
    const socket = harness.socket()
    for (let round = 0; round < 64; round++) {
      let progress = false
      for (const frame of receiverOutbox.splice(0)) {
        socket.deliver(asArrayBuffer(frame))
        frame.fill(0)
        progress = true
      }
      const assist = harness.events
        .map(({ value }) => value)
        .find((value) => value.type === 'assist')
      if (!assisted && assist?.type === 'assist') {
        assisted = true
        const source = new TextEncoder().encode('public-loop-password')
        const intermediate = createHash('sha256').update(source).update(assist.salt).digest()
        const proof = createHash('sha256').update(intermediate).update(assist.challenge).digest()
        harness.send({ type: 'assist-result', revision: 1, proof })
        source.fill(0)
        intermediate.fill(0)
        proof.fill(0)
        progress = true
      }
      while (clientIndex < socket.sent.length) {
        for (const frame of framer.push(socket.sent[clientIndex++]!)) {
          await session.receive(frame)
          clientFrames++
        }
        progress = true
      }
      if (!progress) return
    }
    throw new Error('public_loop_budget_exceeded')
  }

  return {
    harness,
    session,
    // 模擬可信後端ready，不取server私鑰；peer signing key來自本輪真receiver。
    async start(): Promise<void> {
      harness.deliverProbe(probe)
      await waitForEvent(harness, 'capabilities')
      harness.send({
        type: 'start',
        revision: 1,
        target: TARGET,
        peer: b.peerId,
        origin: ORIGIN,
        base: BASE,
        ticket: TICKET,
      })
      await waitForPhase(harness, 'awaiting_ready')
      harness.socket().deliver(
        JSON.stringify({
          type: 'rdweb.ready',
          protocol: 'rustdesk/1.4.2',
          transport: 'tcp',
          target_id: TARGET,
          rustdesk_id: b.peerId,
          connection_id: CONNECTION,
          peer_signing_key: Buffer.from(crypto.signingPublicKey).toString('base64'),
        }),
      )
      await session.start()
    },
    // 只在同一有序transport推進後檢查安全predicate，不以固定sleep猜已登入。
    async until(predicate: () => boolean): Promise<void> {
      await vi.waitFor(
        async () => {
          await drain()
          expect(predicate()).toBe(true)
        },
        { timeout: 5000 },
      )
    },
    // 只推進RAM oracle的單調時間，不重排影像或改正式deadline。
    advance(ms: number): void {
      clock += ms
    },
    // 只回正式framer交給session的完整frame數；不暴露cipher或私有nonce。
    deliveredClientFrames(): number {
      return clientFrames
    },
    // 取消真session自有timer並釋放本案Worker／frame／ports，失敗也不外洩資源。
    async close(): Promise<void> {
      try {
        await session.close()
        expect(timers.size).toBe(0)
        harness.send({ type: 'dispose', revision: 1 })
        await waitForEvent(harness, 'disposed')
      } finally {
        crypto.dispose()
        framer.dispose()
        for (const bytes of receiverOutbox.splice(0)) bytes.fill(0)
        for (const { value } of harness.events) if (value.type === 'frame') value.frame.close()
        PublicVideoDecoder.releaseOutput()
        probe.close()
        harness.close()
      }
    },
  }
}

// 以現有Vite把正式protocol.worker.ts編成單一IIFE，保留原entry行為。
beforeAll(async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const result = await build({
    configFile: false,
    root,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: {
        entry: fileURLToPath(new URL('../../src/rdweb/protocol.worker.ts', import.meta.url)),
        formats: ['iife'],
        name: 'RdwebProtocolWorker',
        fileName: () => 'receiver-worker.js',
      },
    },
  })
  if (!Array.isArray(result)) throw new Error('public_worker_build_unavailable')
  const chunk = result
    .flatMap((output) => output.output)
    .find((output) => output.type === 'chunk' && output.isEntry)
  if (!chunk || chunk.type !== 'chunk') throw new Error('public_worker_build_unavailable')
  workerCode = chunk.code
}, 120_000)

beforeEach(() => {
  PublicVideoDecoder.enabled = true
  PublicVideoDecoder.failDecode = false
  PublicVideoDecoder.holdOutput = false
  PublicVideoDecoder.lastInput = null
})

// 真producer輸出的version／權限／公開VP8經正式Worker處理，仍須Main presented才可送五鍵。
it('closes a real receiver and compiled worker loop through presentation and five keys', async () => {
  const loop = receiverWorkerLoop()
  try {
    await loop.start()
    await loop.until(() => loop.harness.events.some(({ value }) => value.type === 'frame'))
    const peer = await waitForEvent(loop.harness, 'peer')
    expect(peer.peer).toMatchObject({ platform: 'Windows', version: 'rdweb-test-receiver/0.1.0' })
    expect(loop.session.snapshot()).toMatchObject({
      authenticated: true,
      macVerified: true,
      received: false,
    })
    const expectedChunk = publicVp8Keyframe()
    expect(
      PublicVideoDecoder.lastInput?.every((byte, index) => byte === expectedChunk[index]),
    ).toBe(true)
    expect(PublicVideoDecoder.lastInput?.length).toBe(expectedChunk.length)
    // 此替身同步output後尚未還Main credit；不能要求它先送video ACK。
    expect(loop.deliveredClientFrames()).toBe(2)
    expect(loop.session.snapshot()).toMatchObject({
      parsed: true,
      unavailable: false,
      received: false,
    })
    expect(
      loop.harness.events.some(
        ({ value }) => value.type === 'phase' && value.phase === 'streaming',
      ),
    ).toBe(false)
    expect(
      loop.harness.events.some(({ value }) => value.type === 'input-state' && value.ready),
    ).toBe(false)
    const frame = await waitForEvent(loop.harness, 'frame')
    // 手控Main邊界依正式ownership先釋放frame；drawn只測gate，不表示畫布真的繪製。
    frame.frame.close()
    loop.harness.send({
      type: 'presented',
      revision: 1,
      generation: frame.generation,
      frame_id: frame.frame_id,
      drawn: true,
    })
    const state = await waitForInputReady(loop.harness)
    expect(state).toMatchObject({ keyboard: true, clipboard: false })
    // presented還credit後，PublicKey、LoginRequest及video ACK皆須抵達真session。
    await loop.until(() => loop.deliveredClientFrames() === 3)
    expect(loop.session.snapshot()).toMatchObject({
      parsed: true,
      unavailable: false,
      received: false,
    })
    loop.harness.send({
      type: 'input-batch',
      revision: 1,
      input_generation: state.input_generation,
      batch_id: 1,
      events: [
        { kind: 'key', key: 'Control', down: true, modifiers: [] },
        { kind: 'shortcut', char: 'a', down: true, modifiers: ['Control'] },
        { kind: 'shortcut', char: 'a', down: false, modifiers: ['Control'] },
        { kind: 'key', key: 'Control', down: false, modifiers: [] },
        { kind: 'text', text: publicReceiverText(binding()), modifiers: [] },
      ],
    })
    await loop.until(() => loop.session.snapshot().sequenceComplete)
    expect(loop.session.snapshot()).toMatchObject({
      textSingle: true,
      textExact: true,
      sequenceValid: true,
      windowComplete: false,
      unavailable: false,
    })
    expect((await waitForEvent(loop.harness, 'input-ack')).sent).toBe(true)
    loop.advance(5000)
    expect(loop.session.snapshot().windowComplete).toBe(true)
    expect(loop.harness.events.some(({ value }) => value.type === 'failure')).toBe(false)
  } finally {
    await loop.close()
  }
}, 15000)

// native邊界注入錯誤時真Worker必須fail closed，不能以receiver已認證恢復streaming／輸入。
it('fails the receiver worker loop when the decoder boundary rejects the public frame', async () => {
  PublicVideoDecoder.failDecode = true
  const loop = receiverWorkerLoop()
  try {
    await loop.start()
    await loop.until(() => loop.harness.events.some(({ value }) => value.type === 'failure'))
    expect((await waitForEvent(loop.harness, 'failure')).code).toBe('video_decode_failed')
    expect(loop.harness.socket().closed).toBe(true)
    expect(loop.session.snapshot().received).toBe(false)
    expect(
      loop.harness.events.some(
        ({ value }) => value.type === 'phase' && value.phase === 'streaming',
      ),
    ).toBe(false)
  } finally {
    await loop.close()
  }
}, 15000)

// 已關閉generation的晚到output必須close，不可復活frame／streaming或送出輸入。
it('releases a late decoder output after the receiver worker loop is disposed', async () => {
  PublicVideoDecoder.holdOutput = true
  const loop = receiverWorkerLoop()
  try {
    await loop.start()
    await loop.until(() => PublicVideoDecoder.pending.length === 1)
    const late = PublicVideoDecoder.pending[0]!.frame
    loop.harness.send({ type: 'dispose', revision: 1 })
    await waitForEvent(loop.harness, 'disposed')
    const sent = loop.harness.socket().sent.length
    PublicVideoDecoder.releaseOutput()
    expect(late.closed).toBe(true)
    expect(
      loop.harness.events.some(
        ({ value }) =>
          value.type === 'frame' || (value.type === 'phase' && value.phase === 'streaming'),
      ),
    ).toBe(false)
    expect(loop.harness.socket().sent.length).toBe(sent)
    expect(loop.session.snapshot().received).toBe(false)
  } finally {
    await loop.close()
  }
}, 15000)

// 正式Worker經capabilities、NaCl登入、WPT frame presented到輸入ACK全程RAM控制。
it('drives the compiled worker through encrypted login, a WPT frame and input in RAM', async () => {
  const harness = createHarness(workerCode)
  const probe = new PublicFrame()
  let ownedFrame: PublicFrame | null = null
  try {
    harness.deliverProbe(probe)
    const capabilities = await waitForEvent(harness, 'capabilities')
    expect(capabilities.capabilities.profiles).toEqual({ vp8: ['vp8'] })
    expect(capabilities.frame).toBe(probe as unknown as VideoFrame)
    expect(harness.events.find(({ value }) => value.type === 'capabilities')?.transfer).toEqual([
      probe,
    ])
    expect(PublicSocket.instances).toHaveLength(0)

    harness.send({
      type: 'start',
      revision: 1,
      target: TARGET,
      peer: PEER,
      origin: ORIGIN,
      base: BASE,
      ticket: TICKET,
    })
    await vi.waitFor(() => expect(PublicSocket.instances).toHaveLength(1))
    const socket = harness.socket()
    expect(new URL(socket.url).pathname).toBe(`/rdweb/api/v1/targets/${TARGET}/connect`)
    expect(socket.protocols).toEqual(['rdweb.v1', `rdweb.ticket.${TICKET}`])
    await waitForPhase(harness, 'awaiting_ready')

    const signing = nacl.sign.keyPair()
    const serverBox = nacl.box.keyPair()
    socket.deliver(
      JSON.stringify({
        type: 'rdweb.ready',
        protocol: 'rustdesk/1.4.2',
        transport: 'ws',
        target_id: TARGET,
        rustdesk_id: PEER,
        connection_id: CONNECTION,
        peer_signing_key: btoa(String.fromCharCode(...signing.publicKey)),
      }),
    )
    socket.deliver(
      asArrayBuffer(
        encodeMessage({
          signedId: {
            id: nacl.sign(encodeIdentity({ id: PEER, pk: serverBox.publicKey }), signing.secretKey),
          },
        }),
      ),
    )
    await waitForPhase(harness, 'awaiting_hash')
    expect(socket.sent).toHaveLength(1)
    const envelope = decodeMessage(socket.sent[0]!).publicKey
    if (!envelope?.asymmetricValue || !envelope.symmetricValue)
      throw new Error('public_handshake_fixture_unavailable')
    const key = nacl.box.open(
      envelope.symmetricValue,
      new Uint8Array(24),
      envelope.asymmetricValue,
      serverBox.secretKey,
    )
    if (!key) throw new Error('public_handshake_fixture_unavailable')
    try {
      let rx = 0n
      // 由測試扮演server，以嚴格遞增nonce回覆加密控制訊息。
      const reply = (message: hbb.IMessage): void => {
        socket.deliver(asArrayBuffer(nacl.secretbox(encodeMessage(message), nonce(++rx), key)))
      }

      reply({ hash: { salt: SALT, challenge: CHALLENGE } })
      const assist = await waitForEvent(harness, 'assist')
      expect(assist).toMatchObject({
        connection: CONNECTION,
        salt: SALT,
        challenge: CHALLENGE,
      })

      const proof = new Uint8Array(32).fill(7)
      harness.send({ type: 'assist-result', revision: 1, proof })
      await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThanOrEqual(2))
      const login = inspectSent(socket, 1, key, (message) => ({
        username: message.loginRequest?.username,
        // 先複製公開bytes，helper清零後仍可與本次proof比對。
        password: new Uint8Array(message.loginRequest?.password ?? []),
        videoAckRequired: message.loginRequest?.videoAckRequired,
      }))
      expect(login.username).toBe(PEER)
      expect(login.password).toEqual(proof)
      expect(login.videoAckRequired).toBe(true)

      reply({
        loginResponse: {
          peerInfo: {
            platform: 'Windows',
            version: '1.4.2',
            displays: [{ x: 0, y: 0, width: 320, height: 240 }],
            currentDisplay: 0,
          },
        },
      })
      const peer = await waitForEvent(harness, 'peer')
      expect(peer.peer).toMatchObject({
        platform: 'Windows',
        version: '1.4.2',
        display: 0,
        width: 320,
        height: 240,
        displayCount: 1,
      })
      expect(peer.peer).not.toHaveProperty('x')
      await waitForPhase(harness, 'awaiting_video')

      reply({
        videoFrame: {
          vp8s: {
            frames: [{ data: publicVp8Keyframe(), key: true, pts: 0 }],
          },
        },
      })
      const frame = await waitForEvent(harness, 'frame')
      if (!(frame.frame instanceof PublicFrame)) throw new Error('public_frame_fixture_unavailable')
      ownedFrame = frame.frame
      expect(frame.frame.closed).toBe(false)
      expect(harness.events.find(({ value }) => value.type === 'frame')?.transfer).toEqual([
        frame.frame,
      ])

      harness.send({
        type: 'presented',
        revision: 1,
        generation: frame.generation,
        frame_id: frame.frame_id,
        drawn: true,
      })
      await waitForPhase(harness, 'streaming')
      const state = await waitForInputReady(harness)
      const before = socket.sent.length
      harness.send({
        type: 'input-batch',
        revision: 1,
        input_generation: state.input_generation,
        batch_id: 1,
        events: [{ kind: 'text', text: INPUT_TEXT, modifiers: [] }],
      })
      const ack = await waitForEvent(harness, 'input-ack')
      expect(ack).toMatchObject({
        sent: true,
        batch_id: 1,
        input_generation: state.input_generation,
      })
      expect(inspectSent(socket, before, key, (message) => message.keyEvent?.seq)).toBe(INPUT_TEXT)
      expect(harness.events.some(({ value }) => value.type === 'failure')).toBe(false)
      expect(JSON.stringify(harness.events.map(({ value }) => value))).not.toContain(TICKET)

      harness.send({ type: 'dispose', revision: 1 })
      await waitForEvent(harness, 'disposed')
      expect(socket.closed).toBe(true)
    } finally {
      key.fill(0)
    }
  } finally {
    ownedFrame?.close()
    probe.close()
    harness.close()
  }
}, 30_000)

// 不支援的probe必須固定fail closed，且不得建立Socket或開始登入。
it('fails closed without a socket when the compiled worker has no codec', async () => {
  PublicVideoDecoder.enabled = false
  const harness = createHarness(workerCode)
  const probe = new PublicFrame()
  try {
    harness.deliverProbe(probe)
    const failure = await waitForEvent(harness, 'failure')
    expect(failure).toMatchObject({ code: 'video_unsupported', cause: 'fatal' })
    expect(probe.closed).toBe(true)
    expect(PublicSocket.instances).toHaveLength(0)
    expect(harness.events.some(({ value }) => value.type === 'capabilities')).toBe(false)
  } finally {
    harness.close()
  }
})
