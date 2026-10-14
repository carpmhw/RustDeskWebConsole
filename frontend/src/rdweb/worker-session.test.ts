import { expect, it, vi } from 'vitest'
import { ProtocolWorkerSession, type WorkerDependencies, type SocketPort } from './worker-session'
import type { VideoWorkerEvent } from './video-types'
import nacl from 'tweetnacl'
import { hbb, encodeMessage, encodeIdentity, decodeMessage } from './codec'
import { nonce } from './crypto'
import samples from './__fixtures__/codec-samples.json'
import { ptsMicros } from './video-limits'
// Publicprobe fake只測生命週期，不當作native支持證據。
class ProbeFrame {
  timestamp = 0
  codedWidth = 1
  codedHeight = 1
  displayWidth = 1
  displayHeight = 1
  close = vi.fn()
}
// 注入可控query與未連線socket，JWT沒有參數可傳入。
function fixture() {
  const messages: VideoWorkerEvent[] = []
  const deps: WorkerDependencies = {
    query: async (config) => ({ supported: config.codec === 'vp8', config }),
    factory: vi.fn(),
    socket: vi.fn(),
    now: () => 0,
    isFrame: (value): value is VideoFrame => value instanceof ProbeFrame,
  }
  return {
    session: new ProtocolWorkerSession((value) => messages.push(value), deps),
    messages,
    deps,
  }
}
// Probe成功返還同一publicframe及實測profiles，尚未取ticket或開WS。
it('returns proven capabilities and a transferred public probe frame', async () => {
  const value = fixture()
  const frame = new ProbeFrame()
  value.session.handle({ type: 'probe', revision: 1, frame: frame as unknown as VideoFrame })
  await vi.waitFor(() =>
    expect(value.messages.some((message) => message.type === 'capabilities')).toBe(true),
  )
  const result = value.messages.find((message) => message.type === 'capabilities')!
  expect(result.capabilities.profiles).toEqual({ vp8: ['vp8'] })
  expect(result.frame).toBe(frame)
  expect(value.deps.socket).not.toHaveBeenCalled()
  value.session.dispose()
})

// 受控socket僅取代transport，不跳過真正NaCl SignedId／secretbox驗證。
class Socket implements SocketPort {
  readyState = 1
  bufferedAmount = 0
  binaryType: BinaryType = 'arraybuffer'
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: Pick<CloseEvent, 'code'>) => void) | null = null
  sent: Uint8Array[] = []
  // caller可能清除plaintext，socket保留獨立公開test wire。
  send(bytes: Uint8Array): void {
    this.sent.push(new Uint8Array(bytes))
  }
  // 不自行產生新的unexpected close，session取消時listeners應已移除。
  close = vi.fn(
    /* 模擬單次原生close。 */ () => {
      this.readyState = 3
    },
  )
  // 一個真正cipher envelope以一個WS message交付，不mockprotocol成功。
  message(data: string | Uint8Array): void {
    this.onmessage?.({
      data: typeof data === 'string' ? data : new Uint8Array(data).buffer,
    } as MessageEvent)
  }
}
// bounded microtasks只為受控native query，不是假Browser的支持證據。
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
// 每案新Signing／Box peer，只在RAM解封當次session key。
async function encryptedFixture(
  override?: (m: VideoWorkerEvent, t?: Transferable[]) => void,
  dependencies?: Partial<WorkerDependencies>,
) {
  const value = fixture(),
    socket = new Socket(),
    messages: VideoWorkerEvent[] = []
  Object.assign(value.deps, dependencies)
  value.deps.socket = /* 只觀察saved bridgeURL，不印ticket或protocols。 */ () => socket
  const session = new ProtocolWorkerSession(
    /* primitive與ownedframe分開觀察。 */ (m, t) => {
      messages.push(m)
      override?.(m, t)
    },
    value.deps,
  )
  session.handle({ type: 'probe', revision: 1, frame: new ProbeFrame() as unknown as VideoFrame })
  await settle()
  expect(messages.some(/* query後才可能start。 */ (m) => m.type === 'capabilities')).toBe(true)
  const signing = nacl.sign.keyPair(),
    peer = nacl.box.keyPair()
  session.handle({
    type: 'start',
    revision: 1,
    target: '00000000-0000-0000-0000-000000000001',
    peer: '123456789',
    origin: 'http://localhost',
    base: '/rdweb',
    ticket: 'public-test-only',
  })
  socket.message(
    JSON.stringify({
      type: 'rdweb.ready',
      protocol: 'rustdesk/1.4.2',
      transport: 'ws',
      target_id: '00000000-0000-0000-0000-000000000001',
      rustdesk_id: '123456789',
      connection_id: '12345678-1234-4234-8234-123456789abc',
      peer_signing_key: btoa(String.fromCharCode(...signing.publicKey)),
    }),
  )
  socket.message(
    encodeMessage({
      signedId: {
        id: nacl.sign(encodeIdentity({ id: '123456789', pk: peer.publicKey }), signing.secretKey),
      },
    }),
  )
  const envelope = decodeMessage(socket.sent[0]!).publicKey!
  const key = nacl.box.open(
    envelope.symmetricValue!,
    new Uint8Array(24),
    envelope.asymmetricValue!,
    peer.secretKey,
  )!
  let counter = 0n
  // rx counter真遞增，資料不以publicproduction測試模式進入worker。
  const receive = (message: hbb.IMessage): void =>
    socket.message(nacl.secretbox(encodeMessage(message), nonce(++counter), key))
  // 回覆當次worker要求的公開proof，驗真正encrypted LoginResponse。
  const login = async (): Promise<void> => {
    receive({ hash: { salt: 's', challenge: 'c' } })
    session.handle({ type: 'assist-result', revision: 1, proof: new Uint8Array(32) })
    await settle()
    receive({
      loginResponse: {
        peerInfo: {
          platform: 'Linux',
          version: '1.4.2',
          displays: [{ width: 320, height: 240, x: -320 }],
        },
      },
    })
  }
  return { session, socket, messages, key, receive, login }
}
// 真Worker session經MAC、影像presented後才送input；接點故障不改sent ACK或wire。
it('observes incoming clipboard before decoding through a late-installed session provider', async () => {
  const expected = 'Public 中文 RdWeb'
  const rows: import('./incoming-clipboard-observer').IncomingClipboardSnapshot[] = []
  let observer: import('./incoming-clipboard-observer').IncomingClipboardObserver | undefined
  const p = await encryptedFixture(undefined, {
    // 建立session時尚未有observer，ready後才由測試安裝。
    incomingClipboardObserver: () => observer,
  })
  try {
    await p.login()
    observer = {
      // 真active pull的本地tag才回公開expected。
      expected: (tag) => (tag.revision === 1 && tag.request_id === 7 ? expected : null),
      // 只保存布林及tag，不取得真正wire content或nonce。
      record: (value) => rows.push({ ...value }),
      // 正常公開fixture不應有診斷錯誤。
      unavailable: () => {
        throw new Error('public_diagnostic_fault')
      },
    }
    p.session.handle({ type: 'clipboard-pull', revision: 1, request_id: 7 })
    p.receive({ clipboard: { content: new TextEncoder().encode(expected) } })
    expect(rows).toEqual([
      {
        revision: 1,
        request_id: 7,
        observed: true,
        compressed: false,
        uncompressedCompared: true,
        uncompressedExact: true,
        overflow: false,
        unavailable: false,
      },
    ])
    const reply = p.messages.find(
      /* 真產品資料仍由原decoder移交。 */ (message) => message.type === 'clipboard-data',
    )
    expect(reply?.type).toBe('clipboard-data')
    if (reply?.type === 'clipboard-data')
      expect(reply.bytes).toEqual(new TextEncoder().encode(expected))
  } finally {
    p.session.dispose()
    p.key.fill(0)
  }
})
// 真Worker session經MAC、影像presented後才送input；接點故障不改sent ACK或wire。
it('observes the actual worker input ciphertext without changing credit on observer failure', async () => {
  const rows: import('./encoded-input-observer').EncodedInputSnapshot[] = []
  const p = await encryptedFixture(undefined, {
    encodedInputObserver: {
      // 只借用public DTO；拋例外不得轉產品fatal。
      record(value) {
        rows.push(value)
        throw new Error('public_diagnostic_fault')
      },
      // collector本身也故障時不能擋send。
      unavailable() {
        throw new Error('public_diagnostic_unavailable')
      },
    },
    // 只替代native硬體，不替代MAC／codec／Main presented。
    factory: (callbacks) => ({
      decodeQueueSize: 0,
      // public fixture參數已由正式video reader驗證。
      configure() {},
      // 假native frame只為跨sessioninput權限狀態，不冒充browser解碼。
      decode(input) {
        const frame = new ProbeFrame()
        Object.assign(frame, {
          codedWidth: 320,
          codedHeight: 240,
          displayWidth: 320,
          displayHeight: 240,
          timestamp: ptsMicros(input.pts),
        })
        callbacks.output(frame)
      },
      // 本案無硬體資源。
      close() {},
    }),
  })
  try {
    await p.login()
    const sample = samples.find(/* 選已核hash的publicVP8。 */ (value) => value.codec === 'vp8')!
    p.receive({
      videoFrame: {
        vp8s: {
          frames: [
            {
              data: Uint8Array.from(
                atob(sample.frames[0]!.data),
                /* public base64。 */ (c) => c.charCodeAt(0),
              ),
              key: true,
              pts: 0,
            },
          ],
        },
      },
    })
    await settle()
    const frame = p.messages.find(
      /* 真session已發布frame才可presented。 */ (m) => m.type === 'frame',
    )
    expect(frame?.type).toBe('frame')
    if (frame?.type !== 'frame') throw new Error('public_frame_fixture_unavailable')
    p.session.handle({
      type: 'presented',
      revision: 1,
      generation: frame.generation,
      frame_id: frame.frame_id,
      drawn: true,
    })
    const state = p.messages
      .filter(/* 只取已ready的安全inputgeneration。 */ (m) => m.type === 'input-state')
      .at(-1)
    if (state?.type !== 'input-state') throw new Error('public_state_fixture_unavailable')
    expect(state.ready).toBe(true)
    const before = p.socket.sent.length
    p.session.handle({
      type: 'input-batch',
      revision: 1,
      input_generation: state.input_generation,
      batch_id: 1,
      events: [{ kind: 'text', text: 'Public test', modifiers: [] }],
    })
    expect(rows).toHaveLength(1)
    expect(p.messages.at(-1)).toMatchObject({ type: 'input-ack', sent: true, batch_id: 1 })
    const plain = nacl.secretbox.open(p.socket.sent[before]!, nonce(BigInt(before)), p.key)!
    try {
      expect(decodeMessage(plain).keyEvent?.seq === 'Public test').toBe(true)
    } finally {
      plain.fill(0)
    }
    expect(p.messages.some(/* 診斷例外不變成正式終態。 */ (m) => m.type === 'failure')).toBe(false)
  } finally {
    p.session.dispose()
    p.key.fill(0)
  }
})
// error先作candidate，真MAC錯誤必須在close前以fatal優先。
it('gives fatal MAC failure priority over a pending native network error', async () => {
  vi.useFakeTimers()
  const p = await encryptedFixture()
  try {
    p.socket.onerror?.()
    expect(
      p.messages.filter(/* 此處不能提早排network終態。 */ (m) => m.type === 'failure'),
    ).toHaveLength(0)
    p.socket.message(new Uint8Array(32).fill(7))
    p.socket.onclose?.({ code: 1006 })
    await vi.advanceTimersByTimeAsync(250)
    expect(
      p.messages.filter(/* 只有第一個authoritative終態。 */ (m) => m.type === 'failure'),
    ).toEqual([{ type: 'failure', revision: 1, code: 'crypto_failed', cause: 'fatal' }])
    expect(p.socket.close).toHaveBeenCalledOnce()
  } finally {
    p.session.dispose()
    p.key.fill(0)
    vi.useRealTimers()
  }
})
// policy close与明确backend error不能被先前onerror重新歸為network。
it('gives policy close and authoritative backend error priority over network candidates', async () => {
  vi.useFakeTimers()
  try {
    for (const cause of ['policy', 'backend'] as const) {
      const p = await encryptedFixture()
      try {
        p.socket.onerror?.()
        expect(
          p.messages.filter(
            /* 先等authoritative source，不提早終態。 */ (m) => m.type === 'failure',
          ),
        ).toHaveLength(0)
        if (cause === 'policy') p.socket.onclose?.({ code: 1008 })
        else p.socket.message(JSON.stringify({ type: 'rdweb.error', code: 'public-policy-denial' }))
        await vi.advanceTimersByTimeAsync(250)
        expect(
          p.messages.filter(/* authority不因genericUIcode改變。 */ (m) => m.type === 'failure'),
        ).toEqual([{ type: 'failure', revision: 1, code: 'connection_failed', cause: 'fatal' }])
      } finally {
        p.session.dispose()
        p.key.fill(0)
      }
    }
  } finally {
    vi.useRealTimers()
  }
})
// 1006可結束network；error缺close最多250ms亦只settle一次，並即時撤銷open證據。
it('settles approved native network errors once after close or the candidate deadline', async () => {
  vi.useFakeTimers()
  try {
    for (const closing of [true, false]) {
      const p = await encryptedFixture()
      try {
        p.socket.onerror?.()
        p.socket.onerror?.()
        expect(
          p.messages.filter(
            /* false不是有效MAC活動，而是本機closed證據。 */ (m) =>
              m.type === 'activity' && m.open === false,
          ),
        ).toHaveLength(1)
        if (closing) p.socket.onclose?.({ code: 1006 })
        else {
          await vi.advanceTimersByTimeAsync(249)
          expect(
            p.messages.filter(/* deadline之前未終態。 */ (m) => m.type === 'failure'),
          ).toHaveLength(0)
        }
        await vi.advanceTimersByTimeAsync(closing ? 250 : 1)
        expect(
          p.messages.filter(/* 原生來源與固定code分開。 */ (m) => m.type === 'failure'),
        ).toEqual([{ type: 'failure', revision: 1, code: 'connection_failed', cause: 'network' }])
      } finally {
        p.session.dispose()
        p.key.fill(0)
      }
    }
  } finally {
    vi.useRealTimers()
  }
})
// encrypted metadata取得privateorigin後，只post安全state；native media未presented不能送input。
it('dispatches permissions and drops unready input without exposing remote origin', async () => {
  const p = await encryptedFixture()
  try {
    p.receive({
      misc: {
        permissionInfo: { permission: hbb.PermissionInfo.Permission.Clipboard, enabled: false },
      },
    })
    await p.login()
    const state = [...p.messages]
      .reverse()
      .find(/* 只讀safeinputstate。 */ (m) => m.type === 'input-state')
    expect(state).toMatchObject({
      type: 'input-state',
      keyboard: true,
      clipboard: false,
      ready: false,
      display: { display: 0, width: 320, height: 240 },
    })
    if (state?.type !== 'input-state') throw new Error('public_fixture_failed')
    expect(state.display).not.toHaveProperty('x')
    const count = p.socket.sent.length
    p.session.handle({
      type: 'input-batch',
      revision: 1,
      input_generation: state.input_generation,
      batch_id: 1,
      events: [{ kind: 'move', x: 1, y: 2 }],
    })
    expect(p.messages.at(-1)).toEqual({
      type: 'input-ack',
      revision: 1,
      input_generation: state.input_generation,
      batch_id: 1,
      sent: false,
    })
    expect(p.socket.sent).toHaveLength(count)
    p.session.handle({ type: 'clipboard-pull', revision: 1, request_id: 1 })
    expect(p.messages.at(-1)).toMatchObject({
      type: 'clipboard-error',
      code: 'clipboard_unavailable',
    })
    const stale = new Uint8Array([65])
    p.session.handle({ type: 'clipboard-push', revision: 0, request_id: 1, bytes: stale })
    expect(stale).toEqual(new Uint8Array([0]))
  } finally {
    p.session.dispose()
    p.key.fill(0)
  }
})
// result transfer exception要清ownedbytes並fatal，不用recoverable文字提示掩蓋。
// 三筆outbound共用真NaCl nonce序列；Main成功回覆只能晚於Yes，unsolicited不transfer。
it('encrypts outbound clipboard gates in nonce order before reporting sent', async () => {
  let socket: Socket | null = null
  const postedAt: number[] = []
  const p = await encryptedFixture(
    /* 只觀察安全sent回覆與wire數量，不保留文字。 */ (message) => {
      if (message.type === 'clipboard-sent') postedAt.push(socket!.sent.length)
    },
  )
  socket = p.socket
  try {
    await p.login()
    const before = p.socket.sent.length
    const bytes = new Uint8Array([65])
    p.session.handle({ type: 'clipboard-push', revision: 1, request_id: 1, bytes })
    expect(p.socket.sent).toHaveLength(before + 3)
    expect(postedAt).toEqual([before + 3])
    const messages = p.socket.sent.slice(before).map(
      /* 依真正TX counter逐筆解封，測試材料全為public。 */ (wire, index) => {
        const plaintext = nacl.secretbox.open(wire, nonce(BigInt(before + index)), p.key)
        if (!plaintext) throw new Error('public_cipher_fixture_failed')
        try {
          const message = decodeMessage(plaintext)
          const clip = message.multiClipboards?.clipboards?.[0]
          // generated bytes借用plaintext；測試oracle先複製publicbytes，不能清零後才讀view。
          return {
            option: message.misc?.option?.disableClipboard,
            content: clip?.content ? new Uint8Array(clip.content) : undefined,
            format: clip?.format,
            compress: clip?.compress,
          }
        } finally {
          plaintext.fill(0)
        }
      },
    )
    expect(messages[0]!.option).toBe(1)
    expect(messages[1]).toMatchObject({ content: new Uint8Array([65]), format: 0, compress: false })
    expect(messages[2]!.option).toBe(2)
    expect(bytes).toEqual(new Uint8Array([0]))
    p.receive({ clipboard: { compress: true, content: new Uint8Array([255]) } })
    expect(
      p.messages.filter(
        /* 無pull的資料不可解壓或帶文字進Main。 */ (message) =>
          ['clipboard-data', 'clipboard-error', 'operation-error', 'failure'].includes(
            message.type,
          ),
      ),
    ).toHaveLength(0)
  } finally {
    p.session.dispose()
    p.key.fill(0)
  }
})
// 各sender邊界故障由原session收尾，不把文字提交當remote成功或重播至新key。
it.each([0, 1, 2])(
  'closes the original session after outbound sender failure %s',
  async (failure) => {
    vi.useFakeTimers()
    const p = await encryptedFixture()
    try {
      await p.login()
      let calls = 0
      const original = p.socket.send.bind(p.socket)
      vi.spyOn(p.socket, 'send').mockImplementation(
        /* 原crypto仍執行，只在transport出口拋錯。 */ (bytes) => {
          if (calls++ === failure) throw new Error('public socket failure')
          original(bytes)
        },
      )
      const bytes = new Uint8Array([65])
      p.session.handle({ type: 'clipboard-push', revision: 1, request_id: 1, bytes })
      expect(
        p.messages.filter(
          /* 未完成close不能發出成功reply。 */ (message) => message.type === 'clipboard-sent',
        ),
      ).toHaveLength(0)
      expect(bytes).toEqual(new Uint8Array([0]))
      vi.advanceTimersByTime(250)
      expect(
        p.messages
          .filter(
            /* 未知native sender例外維持fail-closed，不冒猜network。 */ (message) =>
              message.type === 'failure',
          )
          .at(-1),
      ).toMatchObject({ cause: 'fatal', code: 'protocol_error' })
      expect(p.socket.close).toHaveBeenCalledTimes(1)
      const after = calls
      p.session.handle({
        type: 'clipboard-push',
        revision: 1,
        request_id: 2,
        bytes: new Uint8Array([66]),
      })
      expect(calls).toBe(after)
    } finally {
      p.session.dispose()
      p.key.fill(0)
      vi.useRealTimers()
    }
  },
)
// result transfer exception要清ownedbytes並fatal，不用recoverable文字提示掩蓋。
it('wipes owned clipboard bytes when the worker result cannot transfer', async () => {
  let owned: Uint8Array | null = null
  // 此callback只模擬nativeclone錯誤，不替代crypto／clipboarddecode。
  const p = await encryptedFixture((message) => {
    if (message.type === 'clipboard-data') {
      owned = message.bytes
      throw new Error('public transfer failure')
    }
  })
  try {
    await p.login()
    p.session.handle({ type: 'clipboard-pull', revision: 1, request_id: 1 })
    p.receive({ clipboard: { content: new Uint8Array([65]) } })
    expect(owned !== null).toBe(true)
    expect((owned as Uint8Array | null)?.every(/* owned結果必須清零。 */ (b) => b === 0)).toBe(true)
    expect(
      p.messages.filter(/* clone錯誤屬fatal而非network。 */ (m) => m.type === 'failure').at(-1),
    ).toMatchObject({ cause: 'fatal', code: 'protocol_error' })
  } finally {
    p.session.dispose()
    p.key.fill(0)
  }
})

// activity只由已驗MAC產生且每秒最多一次，plaintext heartbeat不當健康證據。
it('throttles authenticated activity and ignores plaintext heartbeat bytes', async () => {
  const p = await encryptedFixture()
  try {
    await p.login()
    expect(
      p.messages.filter(/* true必須來自有效MAC。 */ (m) => m.type === 'activity' && m.open),
    ).toHaveLength(1)
    p.socket.message(new Uint8Array([0]))
    expect(
      p.messages.filter(/* heartbeat不增MAC訊號。 */ (m) => m.type === 'activity' && m.open),
    ).toHaveLength(1)
  } finally {
    p.session.dispose()
    p.key.fill(0)
  }
})
// sendbuffer超額是資源fatal，不能以network重連繞過既定背壓限制。
it('keeps sender backpressure fatal instead of consuming automatic network retries', async () => {
  const p = await encryptedFixture()
  try {
    p.socket.bufferedAmount = 1048577
    p.receive({ testDelay: { time: 1 } })
    expect(
      p.messages
        .filter(/* 比對固定錯誤及來源，不輸出任何wire。 */ (m) => m.type === 'failure')
        .at(-1),
    ).toMatchObject({ cause: 'fatal', code: 'video_backpressure' })
    expect(p.socket.close).toHaveBeenCalledOnce()
  } finally {
    p.session.dispose()
    p.key.fill(0)
  }
})
// 缺probe不得開始WS；取消後晚probe也不能返capability並復活。
it('fails closed when starting without a completed probe', () => {
  const value = fixture()
  value.session.handle({
    type: 'start',
    revision: 1,
    target: 'target',
    peer: 'peer',
    origin: 'http://localhost',
    base: '/',
    ticket: 'public',
  })
  expect(value.messages.some((message) => message.type === 'failure')).toBe(true)
  expect(value.deps.socket).not.toHaveBeenCalled()
  value.session.dispose()
})
// Transfer失敗時frame仍屬Worker，必須close並中止，而不是遺失ownership。
it('closes the public probe when returning capabilities cannot transfer it', async () => {
  const value = fixture()
  const frame = new ProbeFrame()
  const failures: VideoWorkerEvent[] = []
  const session = new ProtocolWorkerSession((message) => {
    if (message.type === 'capabilities') throw new Error('public transfer failure')
    failures.push(message)
  }, value.deps)
  session.handle({ type: 'probe', revision: 1, frame: frame as unknown as VideoFrame })
  await vi.waitFor(() => expect(failures.some((message) => message.type === 'failure')).toBe(true))
  expect(frame.close).toHaveBeenCalledOnce()
  expect(value.deps.socket).not.toHaveBeenCalled()
  session.dispose()
})
