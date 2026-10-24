import { expect, it } from 'vitest'
import { binding, endpoints, receiverApi } from './test-fixtures'
import { decodeReceiverControl, encodeReceiverControl } from './wire.ts'
import { createReceiverFramer, frameReceiverBytes } from './framing.ts'
import { hbb as rendezvousMessage } from './generated/rendezvous.js'
import { createReceiverDiagnostic } from './diagnostic.ts'

type Endpoint = { host: string; port: number }
type Start = { kind: 'udp' | 'tcp'; endpoint: Endpoint }

// 公開fake duplex只收本案RAM資料，不建立任何socket。
class FakeDuplex {
  readonly sent: Uint8Array[] = []
  private incoming: Uint8Array[] = []
  private waiters: ((value: Uint8Array | null) => void)[] = []
  closed = false

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

  // 關閉喚醒所有等待者，讓背景reader自然結束。
  async close(): Promise<boolean> {
    this.closed = true
    for (const waiter of this.waiters.splice(0)) waiter(null)
    return true
  }
}

// 可控clock／timer及只回本案fake duplex的network，不呼叫真net／dgram。
class FakeNetwork {
  readonly udp = new FakeDuplex()
  readonly hbbs = new FakeDuplex()
  readonly hbbr = new FakeDuplex()
  readonly opened: Start[] = []
  holdHbbr = false
  private pendingHbbr: ((duplex: FakeDuplex) => void) | null = null
  clock = 0
  private id = 0
  private readonly timers: {
    id: number
    at: number
    callback: () => void
    cancelled: boolean
  }[] = []

  // UDP只以保存的hbbs endpoint建立，回應都由同一fake duplex代表。
  async openUdp(endpoint: Endpoint): Promise<FakeDuplex> {
    this.opened.push({ kind: 'udp', endpoint })
    return this.udp
  }

  // 比較host／port值而非物件參考，因為正式validator會回傳新endpoint副本。
  private isHbbr(endpoint: Endpoint): boolean {
    const hbbr = endpoints().hbbrTcp
    return endpoint.host === hbbr.host && endpoint.port === hbbr.port
  }

  // 第一次TCP是hbbs，第二次是保存的hbbr；hold時等待測試明確釋放。
  async openTcp(endpoint: Endpoint): Promise<FakeDuplex> {
    this.opened.push({ kind: 'tcp', endpoint })
    if (this.isHbbr(endpoint) && this.holdHbbr)
      return new Promise<FakeDuplex>((resolve) => {
        this.pendingHbbr = resolve
      })
    return this.isHbbr(endpoint) ? this.hbbr : this.hbbs
  }

  // 只釋放本測試已hold的hbbr連線，不重開或模擬額外ACK。
  releaseHbbr(): void {
    const complete = this.pendingHbbr
    this.pendingHbbr = null
    complete?.(this.hbbr)
  }

  // 只回本案單調clock，讓4999／15000／60000邊界可確定命中。
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

  // 測試結束前確認沒有殘留背景timer。
  activeTimers(): number {
    return this.timers.filter((timer) => !timer.cancelled).length
  }
}

// 讓async狀態機跑過目前microtask，不啟動真network。
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// 每次建立新receiver連線；signing key只是公開32-byte fixture。
async function start(network = new FakeNetwork(), signal = new AbortController().signal) {
  const c = (await receiverApi('rendezvous')) as typeof import('./rendezvous')
  const diagnostic = createReceiverDiagnostic()
  const promise = c.connectReceiverRelay(
    binding(),
    endpoints(),
    new Uint8Array(32).fill(7),
    network,
    signal,
    diagnostic,
  )
  void promise.catch(() => {})
  return { c, network, promise, signal, diagnostic }
}

// 從TCP raw chunks重建完整frame，供測試檢視送出的控制訊息。
function frames(chunks: Uint8Array[]): Uint8Array[] {
  const framer = createReceiverFramer(65552)
  return chunks.flatMap((chunk) => framer.push(chunk))
}

// 解出TCP控制訊息；測試只比較union與安全欄位。
function controls(chunks: Uint8Array[]): ReturnType<typeof decodeReceiverControl>[] {
  return frames(chunks).map((frame) => decodeReceiverControl(frame))
}

// 未知union必須由低階fixture直接編碼，不能借sender白名單偽造惡意訊息。
function rawControl(
  value: Parameters<typeof rendezvousMessage.RendezvousMessage.encode>[0],
): Uint8Array {
  return new Uint8Array(rendezvousMessage.RendezvousMessage.encode(value).finish())
}

// 完成UDP註冊並建立hbbs TCP，讓後續案例直接從維持序號階段開始。
async function registered(network: FakeNetwork): Promise<void> {
  await flush()
  expect(network.opened[0]).toEqual({ kind: 'udp', endpoint: endpoints().hbbsUdp })
  network.udp.push(encodeReceiverControl({ registerPkResponse: { result: 0 } }))
  await flush()
  expect(network.opened[1]).toEqual({ kind: 'tcp', endpoint: endpoints().hbbsTcp })
  await flush()
}

// 推進到PunchHole並完成relay建立所需的第一個PunchHole訊息。
function punch(network: FakeNetwork, value: Parameters<typeof encodeReceiverControl>[0]): void {
  network.hbbs.push(frameReceiverBytes(encodeReceiverControl(value)))
}

// 從真relay reader取來源；不讓runtime直接消費fake duplex作為替代實作。
async function paired() {
  const f = await start()
  await registered(f.network)
  punch(f.network, { punchHole: { socketAddr: Uint8Array.of(1, 2, 3, 4) } })
  const relay = await f.promise
  return { ...f, relay }
}

// 只有底層明確來源可上傳；缺方法／非法值／例外仍是unknown，不讀例外內容。
it.each([
  ['eof', 'eof'],
  ['io_failed', 'io_failed'],
  ['budget_exceeded', 'budget_exceeded'],
  ['aborted', 'aborted'],
  ['missing', 'unknown'],
  ['null', 'unknown'],
  ['invalid', 'unknown'],
  ['throws', 'unknown'],
] as const)(
  'preserves a relay read source of %s without failing the collector early',
  async (kind, expected) => {
    const f = await paired()
    if (kind !== 'missing')
      Object.assign(f.network.hbbr, {
        // 注入的是可信port的固定能力，不傳任意例外字串作分類。
        failureReason: () => {
          if (kind === 'throws') throw new Error('PUBLIC_SECRET_SENTINEL')
          return kind === 'null' ? null : kind === 'invalid' ? 'PUBLIC_SECRET_SENTINEL' : kind
        },
      })
    try {
      await f.network.hbbr.close()
      expect(await f.relay.receive()).toBeNull()
      expect(f.relay.failureReason?.()).toBe(expected)
      expect(f.diagnostic.snapshot().phase).toBe('unknown')
    } finally {
      await f.relay.close()
    }
  },
)

// 真framer拒絕與完整frame queue超限須區分，不以後續close／EOF覆寫首原因。
it.each(['malformed', 'partial-eof', 'queue', 'io'] as const)(
  'distinguishes relay %s read failure',
  async (kind) => {
    const f = await paired()
    try {
      if (kind === 'malformed') f.network.hbbr.push(Uint8Array.of(0xfe, 0xff, 0x07))
      if (kind === 'partial-eof') {
        Object.assign(f.network.hbbr, { failureReason: () => 'eof' })
        f.network.hbbr.push(Uint8Array.of(1))
        await flush()
        await f.network.hbbr.close()
      }
      if (kind === 'queue')
        for (let i = 0; i < 5; i++) f.network.hbbr.push(frameReceiverBytes(new Uint8Array(65552)))
      if (kind === 'io') {
        f.network.hbbr.receive = () => Promise.reject(new Error('PUBLIC_SECRET_SENTINEL'))
        f.network.hbbr.push(frameReceiverBytes(Uint8Array.of(0)))
      }
      await flush()
      expect(await f.relay.receive()).toBeNull()
      expect(f.relay.failureReason?.()).toBe(
        kind === 'queue' ? 'budget_exceeded' : kind === 'io' ? 'io_failed' : 'decode_rejected',
      )
      expect(f.diagnostic.snapshot().reason).toBe('unknown')
    } finally {
      await f.relay.close()
    }
  },
)

// 本地主動終止reader不是遠端EOF；晚到資料不可毒化已完成輪次。
it('leaves a deliberately closed relay without a read failure', async () => {
  const f = await paired()
  await f.relay.close()
  f.network.hbbr.push(Uint8Array.of(0xfe, 0xff, 0x07))
  await flush()
  expect(f.relay.failureReason?.()).toBeNull()
})

// 正常UDP註冊、週期RegisterPeer、PunchHole不透明回覆及一次relay建立。
it('registers over UDP, keeps RegisterPeer alive and pairs one forced relay', async () => {
  const { network, promise } = await start()
  await flush()
  const registration = decodeReceiverControl(network.udp.sent[0]!)
  expect(registration.registerPk).toMatchObject({
    id: binding().peerId,
    pk: new Uint8Array(32).fill(7),
  })
  expect(registration.registerPk?.uuid).toHaveLength(16)

  await registered(network)
  expect(decodeReceiverControl(network.udp.sent[1]!).registerPeer).toMatchObject({
    id: binding().peerId,
    serial: 1,
  })
  network.advance(10000)
  await flush()
  expect(decodeReceiverControl(network.udp.sent[2]!).registerPeer?.serial).toBe(2)

  network.udp.push(encodeReceiverControl({ registerPeerResponse: { requestPk: false } }))
  punch(network, {
    punchHole: {
      socketAddr: Uint8Array.of(1, 2, 3, 4, 5, 6, 7),
      relayServer: 'evil.invalid:21117',
      natType: 2,
    },
  })
  await flush()

  const sent = controls(network.hbbs.sent)
  const relay = sent[0]!.relayResponse
  expect(relay).toMatchObject({
    id: binding().peerId,
    socketAddr: Uint8Array.of(1, 2, 3, 4, 5, 6, 7),
    relayServer: `${endpoints().hbbrTcp.host}:${endpoints().hbbrTcp.port}`,
  })
  // 正式Coordinator在驗簽後只接受Guid D格式；不能再用hex格式當fake oracle。
  expect(
    typeof relay?.uuid === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(relay.uuid),
  ).toBe(true)
  expect(relay?.version).toBe(
    ((await receiverApi('rendezvous')) as typeof import('./rendezvous')).RECEIVER_VERSION,
  )
  expect(sent.filter((value) => value.relayResponse)).toHaveLength(1)
  expect(sent.some((value) => value.localAddr)).toBe(false)
  expect(network.opened[2]).toEqual({ kind: 'tcp', endpoint: endpoints().hbbrTcp })
  expect(controls(network.hbbr.sent)[0]!.requestRelay).toMatchObject({
    id: binding().peerId,
    uuid: relay?.uuid,
    licenceKey: endpoints().serverPublicKey,
  })
  expect(controls(network.hbbr.sent)).toHaveLength(1)

  const result = await promise
  await result.send(Uint8Array.of(9, 8))
  expect(frames(network.hbbr.sent.slice(-1))[0]).toEqual(Uint8Array.of(9, 8))
  network.hbbr.push(frameReceiverBytes(Uint8Array.of(6, 5)))
  expect(await result.receive()).toEqual(Uint8Array.of(6, 5))
  expect(await result.close()).toBe(true)
  expect(network.udp.closed && network.hbbs.closed && network.hbbr.closed).toBe(true)
  expect(network.activeTimers()).toBe(0)
})

// 固定1.1.14由UDP socket通知已註冊peer；不能只在hbbs TCP接受相同控制。
it.each(['punchHole', 'fetchLocalAddr'] as const)(
  'accepts the pinned server UDP %s notification and pairs only the saved relay',
  async (kind) => {
    const { network, promise } = await start()
    await registered(network)
    const request = { socketAddr: Uint8Array.of(1, 2, 3), relayServer: 'evil.invalid:21117' }
    const value = kind === 'punchHole' ? { punchHole: request } : { fetchLocalAddr: request }
    network.udp.push(encodeReceiverControl(value))
    await flush()
    const sent = controls(network.hbbs.sent)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.relayResponse).toMatchObject({
      socketAddr: Uint8Array.of(1, 2, 3),
      relayServer: `${endpoints().hbbrTcp.host}:${endpoints().hbbrTcp.port}`,
    })
    expect(network.opened[2]).toEqual({ kind: 'tcp', endpoint: endpoints().hbbrTcp })
    const relay = await promise
    // UDP或TCP晚到重複通知都不得新增relay／UUID或重送已不明結果的操作。
    network.udp.push(encodeReceiverControl(value))
    punch(network, value)
    await flush()
    expect(controls(network.hbbs.sent)).toHaveLength(1)
    expect(controls(network.hbbr.sent)).toHaveLength(1)
    expect(network.opened.filter((entry) => entry.kind === 'tcp')).toHaveLength(2)
    expect(await relay.close()).toBe(true)
    expect(network.activeTimers()).toBe(0)
  },
)

// 固定hbbs送出控制回覆後可正常結束，不能因此中斷待連或已連的唯一relay。
it.each(['pending', 'connected'] as const)(
  'keeps the one relay alive when pinned hbbs ends after RelayResponse with hbbr %s',
  async (state) => {
    const network = new FakeNetwork()
    network.holdHbbr = state === 'pending'
    const f = await start(network)
    await registered(network)
    network.udp.push(encodeReceiverControl({ punchHole: { socketAddr: Uint8Array.of(1, 2, 3) } }))
    await flush()
    expect(controls(network.hbbs.sent)).toHaveLength(1)
    let rejected = false
    void f.promise.catch(() => {
      rejected = true
    })
    await network.hbbs.close()
    await flush()
    expect(rejected).toBe(false)
    expect(network.udp.closed).toBe(false)
    expect(network.hbbr.closed).toBe(false)
    if (state === 'pending') network.releaseHbbr()
    const relay = await f.promise
    await relay.send(Uint8Array.of(9, 8))
    network.hbbr.push(frameReceiverBytes(Uint8Array.of(6, 5)))
    expect(await relay.receive()).toEqual(Uint8Array.of(6, 5))
    // hbbs結束不允許晚到重複通知重建relay或再次送response。
    network.udp.push(encodeReceiverControl({ fetchLocalAddr: { socketAddr: Uint8Array.of(7) } }))
    await flush()
    expect(controls(network.hbbs.sent)).toHaveLength(1)
    expect(network.opened.filter((item) => item.kind === 'tcp')).toHaveLength(2)
    expect(f.diagnostic.snapshot().reason).toBe('unknown')
    expect(await relay.close()).toBe(true)
    expect(network.activeTimers()).toBe(0)
  },
)

// 送出尚未完成時EOF仍失敗，晚到send完成也不得開新的hbbr。
it('rejects EOF before the response send completes without late relay creation', async () => {
  const network = new FakeNetwork()
  const send = network.hbbs.send.bind(network.hbbs)
  let release: (() => void) | undefined
  // 只hold外部write completion，仍經正式response encoder與狀態機。
  network.hbbs.send = async (bytes) => {
    await send(bytes)
    await new Promise<void>((resolve) => {
      release = resolve
    })
  }
  const f = await start(network)
  await registered(network)
  network.udp.push(encodeReceiverControl({ punchHole: { socketAddr: Uint8Array.of(1) } }))
  await flush()
  await network.hbbs.close()
  await expect(f.promise).rejects.toThrow(/^receiver_unavailable$/)
  release!()
  await flush()
  expect(network.opened.filter((item) => item.kind === 'tcp')).toHaveLength(1)
  expect(network.activeTimers()).toBe(0)
})

// 預期EOF不是I/O錯誤或資料截斷的通行證，未知控制也仍需拒絕。
it.each(['partial-header', 'partial-body', 'unknown-control', 'io-error'] as const)(
  'still rejects %s after sending RelayResponse',
  async (kind) => {
    const network = new FakeNetwork()
    network.holdHbbr = true
    if (kind === 'io-error') {
      const receive = network.hbbs.receive.bind(network.hbbs)
      // 以外部receive拒絕模擬I/O故障，不讀或分類例外文字。
      network.hbbs.receive = async () => {
        const value = await receive()
        if (value === null) throw new Error('public_receive_failure')
        return value
      }
    }
    const f = await start(network)
    await registered(network)
    network.udp.push(encodeReceiverControl({ punchHole: { socketAddr: Uint8Array.of(1) } }))
    await flush()
    if (kind === 'partial-header') network.hbbs.push(Uint8Array.of(1))
    if (kind === 'partial-body') network.hbbs.push(Uint8Array.of(8, 9))
    if (kind === 'unknown-control')
      network.hbbs.push(frameReceiverBytes(rawControl({ testNatResponse: { port: 1 } })))
    await flush()
    await network.hbbs.close()
    await expect(f.promise).rejects.toThrow(/^receiver_unavailable$/)
    network.releaseHbbr()
    await flush()
    expect(network.hbbr.closed).toBe(true)
    expect(network.activeTimers()).toBe(0)
  },
)

// 乾淨hbbs EOF亦不延長原hbbr connect期限或觸發重試。
it('keeps the original hbbr timeout after the expected hbbs EOF', async () => {
  const network = new FakeNetwork()
  network.holdHbbr = true
  const f = await start(network)
  await registered(network)
  network.udp.push(encodeReceiverControl({ punchHole: { socketAddr: Uint8Array.of(1) } }))
  await flush()
  await network.hbbs.close()
  await flush()
  network.advance(15000)
  await expect(f.promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(f.diagnostic.snapshot()).toMatchObject({ phase: 'hbbr_open', reason: 'deadline' })
  network.releaseHbbr()
  await flush()
  expect(network.opened.filter((item) => item.kind === 'tcp')).toHaveLength(2)
  expect(network.activeTimers()).toBe(0)
})

// 同LAN FetchLocalAddr也只能轉forced relay，不送LocalAddr或直連。
it('turns FetchLocalAddr into the same forced relay response', async () => {
  const { network, promise } = await start()
  await registered(network)
  punch(network, { fetchLocalAddr: { socketAddr: Uint8Array.of(7, 6, 5) } })
  await flush()
  const sent = controls(network.hbbs.sent)
  expect(sent).toHaveLength(1)
  expect(sent[0]!.relayResponse?.socketAddr).toEqual(Uint8Array.of(7, 6, 5))
  expect(sent.some((value) => value.localAddr)).toBe(false)
  expect(network.opened[2]).toEqual({ kind: 'tcp', endpoint: endpoints().hbbrTcp })
  const result = await promise
  await result.close()
})

// 重複的PunchHole不得再送RelayResponse、再開hbbr或建立第二個UUID。
it('ignores duplicate PunchHole after one relay is established', async () => {
  const { network, promise } = await start()
  await registered(network)
  punch(network, { punchHole: { socketAddr: Uint8Array.of(1, 2, 3) } })
  await flush()
  punch(network, { punchHole: { socketAddr: Uint8Array.of(4, 5, 6) } })
  await flush()
  expect(controls(network.hbbs.sent).filter((value) => value.relayResponse)).toHaveLength(1)
  expect(controls(network.hbbr.sent)).toHaveLength(1)
  expect(network.opened.filter((value) => value.kind === 'tcp')).toHaveLength(2)
  const result = await promise
  await result.close()
})

// RegisterPk失敗分類全部停止，不進TCP、不重送key、不留timer。
it.each([2, 3, 4, 5, 6, 7])('rejects RegisterPk result %i before TCP', async (result) => {
  const { network, promise } = await start()
  await flush()
  network.udp.push(encodeReceiverControl({ registerPkResponse: { result } }))
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.opened.some((value) => value.kind === 'tcp')).toBe(false)
  expect(network.activeTimers()).toBe(0)
  expect(network.udp.closed).toBe(true)
})

// server要求重新註冊key時停止，不把RegisterPeer當重試RegisterPk。
it('stops when RegisterPeer asks for a fresh key', async () => {
  const { network, promise } = await start()
  await registered(network)
  network.udp.push(encodeReceiverControl({ registerPeerResponse: { requestPk: true } }))
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.udp.sent.filter((bytes) => decodeReceiverControl(bytes).registerPk)).toHaveLength(
    1,
  )
  expect(network.activeTimers()).toBe(0)
})

// 未知或非預期控制不得被忽略成成功。
it.each([
  ['UDP LocalAddr', 'udp', { localAddr: { socketAddr: Uint8Array.of(1) } }],
  ['UDP TestNat', 'udp', { testNatResponse: { port: 1 } }],
  ['hbbs PunchHoleResponse', 'hbbs', { punchHoleResponse: { socketAddr: Uint8Array.of(1) } }],
  ['hbbs RelayResponse', 'hbbs', { relayResponse: { uuid: 'u' } }],
])('rejects unexpected %s', async (_name, target, value) => {
  const { network, promise } = await start()
  await registered(network)
  const bytes = rawControl(value)
  if (target === 'udp') network.udp.push(bytes)
  else network.hbbs.push(frameReceiverBytes(bytes))
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.activeTimers()).toBe(0)
})

// UDP回覆等候超過15000ms即停止，且尚未開TCP。
it('times out the initial UDP response after 15000ms', async () => {
  const { network, promise } = await start()
  await flush()
  network.advance(15000)
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.opened.some((value) => value.kind === 'tcp')).toBe(false)
  expect(network.activeTimers()).toBe(0)
})

// hbbr連線超過15000ms即停止，不留下背景timer或第二次連線。
it('times out the hbbr connection after 15000ms', async () => {
  const { network, promise } = await start()
  await registered(network)
  network.holdHbbr = true
  punch(network, { punchHole: { socketAddr: Uint8Array.of(1, 2, 3) } })
  await flush()
  network.advance(15000)
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.opened.filter((value) => value.kind === 'tcp')).toHaveLength(2)
  expect(network.activeTimers()).toBe(0)
})

// 註冊至配對超過60000ms即停止。
it('times out pairing after 60000ms', async () => {
  const { network, promise } = await start()
  await registered(network)
  network.advance(60000)
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.activeTimers()).toBe(0)
})

// 註冊前已取消不得開任何UDP／TCP，也不得留下timer。
it('does no I/O when the signal is already aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const { network, promise } = await start(new FakeNetwork(), controller.signal)
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.opened).toHaveLength(0)
  expect(network.activeTimers()).toBe(0)
})

// 進行中取消要關閉已擁有的duplex並清除timer。
it('closes owned ports when aborted during registration', async () => {
  const controller = new AbortController()
  const { network, promise } = await start(new FakeNetwork(), controller.signal)
  await registered(network)
  controller.abort()
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  expect(network.udp.closed && network.hbbs.closed).toBe(true)
  expect(network.activeTimers()).toBe(0)
})

// 失敗的connect不得洩漏另一個relay或接受晚到PunchHole。
it('does not open a relay after failure', async () => {
  const { network, promise } = await start()
  await flush()
  network.advance(15000)
  await expect(promise).rejects.toThrow(/^receiver_unavailable$/)
  punch(network, { punchHole: { socketAddr: Uint8Array.of(1, 2, 3) } })
  await flush()
  expect(network.opened.filter((value) => value.kind === 'tcp')).toHaveLength(0)
  expect(network.hbbr.sent).toHaveLength(0)
})
