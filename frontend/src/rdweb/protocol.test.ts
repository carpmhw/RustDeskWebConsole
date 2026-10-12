import { expect, it, vi } from 'vitest'
import nacl from 'tweetnacl'
import { LoginProtocol } from './protocol'
import { encodeIdentity, encodeMessage, decodeMessage, hbb } from './codec'
import { nonce } from './crypto'
import type { Callbacks, Ready } from './types'
import { TransportFault } from './terminal'
import { decodeTextClipboard } from './clipboard-codec'
const capabilities = { profiles: { vp9: ['vp09.00.10.08'] } }

// 登入後的15秒影像期限由media唯一管理，不能被握手timer搶成connection_timeout。
it('hands the authenticated first-video deadline to the media pipeline', async () => {
  vi.useFakeTimers()
  const value = peerFixture(async () => new Uint8Array(32))
  try {
    value.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    await Promise.resolve()
    value.receive(
      {
        loginResponse: {
          peerInfo: {
            platform: 'Linux',
            version: '1.4.2',
            displays: [{ width: 320, height: 240 }],
          },
        },
      },
      2n,
    )
    await vi.advanceTimersByTimeAsync(15000)
    expect(value.errors).toEqual([])
  } finally {
    value.protocol.dispose()
    vi.useRealTimers()
  }
})

// 官方display_service送部分PeerInfo，current_display=0僅相容欄位不能切換已選螢幕。
it('accepts authenticated display-only PeerInfo without replacing the selected display', async () => {
  const value = peerFixture(async () => new Uint8Array(32))
  try {
    value.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    await Promise.resolve()
    value.receive(
      {
        loginResponse: {
          peerInfo: {
            platform: 'Linux',
            version: '1.4.2',
            currentDisplay: 1,
            displays: [
              { width: 320, height: 240 },
              { width: 320, height: 240 },
            ],
          },
        },
      },
      2n,
    )
    value.receive(
      {
        peerInfo: {
          displays: [
            { width: 320, height: 240 },
            { width: 640, height: 480 },
          ],
          currentDisplay: 0,
        },
      },
      3n,
    )
    expect(value.errors).toEqual([])
    expect(value.verified).toHaveBeenLastCalledWith({
      platform: 'Linux',
      version: '1.4.2',
      display: 1,
      width: 640,
      height: 480,
      displayCount: 2,
    })
  } finally {
    value.protocol.dispose()
  }
})

// 每個契約測試建立新NaCl peer，保留公開事件並用獨立peer端解封session key。
function peerFixture(assist: Callbacks['assist']) {
  const signing = nacl.sign.keyPair()
  const peer = nacl.box.keyPair()
  const sends: Uint8Array[] = []
  const errors: string[] = []
  const verified = vi.fn()
  const video = vi.fn()
  const inputPeer = vi.fn(),
    permission = vi.fn(),
    activity = vi.fn(),
    display = vi.fn()
  const text: Uint8Array[] = []
  // 同 Worker 回呼必須在 plaintext finally 前取得獨立ownedcopy。
  const clipboard = vi.fn((message: hbb.Message) => {
    const bytes = decodeTextClipboard(message)
    if (bytes) text.push(bytes)
  })
  const send = vi.fn(/* 只收集當次安全測試wire。 */ (bytes: Uint8Array) => sends.push(bytes))
  const causes: string[] = []
  const protocol = new LoginProtocol(
    {
      type: 'rdweb.ready',
      protocol: 'rustdesk/1.4.2',
      transport: 'tcp',
      connection_id: '12345678-1234-4234-8234-123456789abc',
      target_id: 'target',
      rustdesk_id: '123456789',
      peer_signing_key: btoa(String.fromCharCode(...signing.publicKey)),
    },
    {
      send,
      assist,
      phase: () => {},
      failure: (code, cause = 'fatal') => {
        errors.push(code)
        causes.push(cause)
      },
      verified,
      video,
      display,
      inputPeer,
      permission,
      clipboard,
      activity,
    },
    capabilities,
  )
  protocol.receive(
    encodeMessage({
      signedId: {
        id: nacl.sign(encodeIdentity({ id: '123456789', pk: peer.publicKey }), signing.secretKey),
      },
    }),
  )
  const publicKey = decodeMessage(sends[0]!).publicKey!
  const key = nacl.box.open(
    publicKey.symmetricValue!,
    new Uint8Array(24),
    publicKey.asymmetricValue!,
    peer.secretKey,
  )!
  // Peer counter由fixture顯式給定，驗證assist等待期間nonce順序。
  const receive = (message: hbb.IMessage, counter: bigint): void => {
    protocol.receive(nacl.secretbox(encodeMessage(message), nonce(counter), key))
  }
  return {
    protocol,
    sends,
    errors,
    causes,
    verified,
    video,
    receive,
    key,
    send,
    inputPeer,
    permission,
    clipboard,
    activity,
    display,
    text,
  }
}

// PeerInfo後保留同一cipher session，後續影像仍須依序驗MAC才派送。
it('keeps encrypted media active after authenticated PeerInfo', async () => {
  const peer = peerFixture(async () => new Uint8Array(32))
  try {
    peer.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    await Promise.resolve()
    peer.receive(
      {
        loginResponse: {
          peerInfo: {
            platform: 'Linux',
            version: '1.4.2',
            displays: [{ width: 320, height: 240 }],
          },
        },
      },
      2n,
    )
    peer.receive(
      { videoFrame: { vp9s: { frames: [{ data: new Uint8Array([1, 2]), key: true, pts: 1 }] } } },
      3n,
    )
    expect(peer.video).toHaveBeenCalledOnce()
    expect(peer.errors).toEqual([])
  } finally {
    peer.protocol.dispose()
  }
})

// HTTP proof尚未完成時仍需處理加密delay／permission，TX和RX不能重排。
it('maintains nonce order while login assist is pending', async () => {
  let complete!: (proof: Uint8Array) => void
  const proof = new Promise<Uint8Array>((resolve) => {
    complete = resolve
  })
  const peer = peerFixture(() => proof)
  try {
    peer.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    peer.receive({ testDelay: { time: 123, fromClient: false } }, 2n)
    peer.receive({ misc: { permissionInfo: {} } }, 3n)
    const delay = decodeMessage(
      nacl.secretbox.open(peer.sends[1]!, nonce(1n), peer.key)!,
    ).testDelay!
    expect(delay.time.toString()).toBe('123')
    expect(delay.fromClient).toBe(false)
    complete(new Uint8Array(32))
    await Promise.resolve()
    expect(decodeMessage(nacl.secretbox.open(peer.sends[2]!, nonce(2n), peer.key)!).union).toBe(
      'loginRequest',
    )
    peer.receive(
      {
        loginResponse: {
          peerInfo: {
            platform: 'Linux',
            version: '1.4.2',
            displays: [{ width: 320, height: 240 }],
          },
        },
      },
      4n,
    )
    expect(peer.errors).toEqual([])
    expect(peer.verified).toHaveBeenCalledOnce()
  } finally {
    peer.protocol.dispose()
  }
})

// 密碼錯誤與額外驗證要求都只回固定分類，絕不把remote字串寫入UI。
it.each(['Wrong Password', '2FA required'])('rejects remote login errors: %s', async (error) => {
  const peer = peerFixture(async () => new Uint8Array(32))
  try {
    peer.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    await Promise.resolve()
    peer.receive({ loginResponse: { error } }, 2n)
    expect(peer.errors).toEqual(['remote_login_failed'])
    expect(peer.verified).not.toHaveBeenCalled()
  } finally {
    peer.protocol.dispose()
  }
})

// 冷啟動桌面失敗只映射固定分類，不回顯遠端任意字串。
it('classifies an unavailable desktop without returning the peer message', async () => {
  const peer = peerFixture(async () => new Uint8Array(32))
  try {
    peer.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    await Promise.resolve()
    peer.receive({ loginResponse: { error: 'Desktop session not ready' } }, 2n)
    expect(peer.errors).toEqual(['remote_desktop_unavailable'])
  } finally {
    peer.protocol.dispose()
  }
})

// Assist等待超時後，晚proof要清除且不可復活已終止的登入。
it('expires pending assist and wipes a late proof', async () => {
  vi.useFakeTimers()
  let complete!: (proof: Uint8Array) => void
  const proof = new Promise<Uint8Array>((resolve) => {
    complete = resolve
  })
  const peer = peerFixture(() => proof)
  try {
    peer.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    await vi.advanceTimersByTimeAsync(15000)
    const bytes = new Uint8Array(32).fill(7)
    complete(bytes)
    await Promise.resolve()
    expect(peer.errors).toEqual(['connection_timeout'])
    expect(peer.sends).toHaveLength(1)
    expect(bytes.every((byte) => byte === 0)).toBe(true)
    expect(peer.verified).not.toHaveBeenCalled()
  } finally {
    peer.protocol.dispose()
    vi.useRealTimers()
  }
})
// 模擬真NaCl peer驗證完整登入順序，只有cipher LoginResponse能建立verified。
it('authenticates through NaCl and requires an encrypted PeerInfo', async () => {
  const signing = nacl.sign.keyPair()
  const peer = nacl.box.keyPair()
  const ready: Ready = {
    type: 'rdweb.ready',
    protocol: 'rustdesk/1.4.2',
    transport: 'ws',
    connection_id: '12345678-1234-4234-8234-123456789abc',
    target_id: 'target',
    rustdesk_id: '123456789',
    peer_signing_key: btoa(String.fromCharCode(...signing.publicKey)),
  }
  const sends: Uint8Array[] = []
  const errors: string[] = []
  let verified = false
  const protocol = new LoginProtocol(
    ready,
    {
      send: (bytes) => sends.push(bytes),
      assist: async () => new Uint8Array(32),
      phase: () => {},
      failure: (code) => errors.push(code),
      verified: () => {
        verified = true
      },
      video: vi.fn(),
      display: vi.fn(),
      inputPeer: vi.fn(),
      permission: vi.fn(),
      clipboard: vi.fn(),
      activity: vi.fn(),
    },
    capabilities,
  )
  protocol.receive(
    encodeMessage({
      signedId: {
        id: nacl.sign(encodeIdentity({ id: '123456789', pk: peer.publicKey }), signing.secretKey),
      },
    }),
  )
  expect(sends.length).toBe(1)
  const publicKey = decodeMessage(sends[0]!).publicKey!
  const key = nacl.box.open(
    publicKey.symmetricValue!,
    new Uint8Array(24),
    publicKey.asymmetricValue!,
    peer.secretKey,
  )!
  protocol.receive(
    nacl.secretbox(
      encodeMessage({ hash: { salt: 'salt', challenge: 'challenge' } }),
      nonce(1n),
      key,
    ),
  )
  await Promise.resolve()
  await Promise.resolve()
  const login = decodeMessage(nacl.secretbox.open(sends[1]!, nonce(1n), key)!).loginRequest!
  expect(login.username).toBe('123456789')
  expect(login.password?.length).toBe(32)
  expect(verified).toBe(false)
  protocol.receive(
    nacl.secretbox(
      encodeMessage({
        loginResponse: {
          peerInfo: {
            platform: 'Linux',
            version: '1.4.2',
            displays: [{ width: 1280, height: 720 }],
          },
        },
      }),
      nonce(2n),
      key,
    ),
  )
  expect(verified).toBe(true)
  expect(errors).toEqual([])
  protocol.dispose()
  protocol.receive(new Uint8Array([2, 3]))
  expect(errors).toEqual([])
})
// Dispose後才抵達的proof不可重新傳登入資料。
it('ignores late assist results after disposal', async () => {
  const signing = nacl.sign.keyPair()
  const peer = nacl.box.keyPair()
  let complete!: (proof: Uint8Array) => void
  const assist = new Promise<Uint8Array>((resolve) => {
    complete = resolve
  })
  const sends: Uint8Array[] = []
  const protocol = new LoginProtocol(
    {
      type: 'rdweb.ready',
      protocol: 'rustdesk/1.4.2',
      transport: 'ws',
      connection_id: 'id',
      target_id: 'target',
      rustdesk_id: '123456789',
      peer_signing_key: btoa(String.fromCharCode(...signing.publicKey)),
    },
    {
      send: (bytes) => sends.push(bytes),
      assist: () => assist,
      phase: () => {},
      verified: () => {},
      failure: () => {},
      video: vi.fn(),
      display: vi.fn(),
      inputPeer: vi.fn(),
      permission: vi.fn(),
      clipboard: vi.fn(),
      activity: vi.fn(),
    },
    capabilities,
  )
  protocol.receive(
    encodeMessage({
      signedId: {
        id: nacl.sign(encodeIdentity({ id: '123456789', pk: peer.publicKey }), signing.secretKey),
      },
    }),
  )
  const message = decodeMessage(sends[0]!).publicKey!
  const key = nacl.box.open(
    message.symmetricValue!,
    new Uint8Array(24),
    message.asymmetricValue!,
    peer.secretKey,
  )!
  protocol.receive(
    nacl.secretbox(encodeMessage({ hash: { salt: 's', challenge: 'c' } }), nonce(1n), key),
  )
  protocol.dispose()
  complete(new Uint8Array(32))
  await Promise.resolve()
  await Promise.resolve()
  expect(sends.length).toBe(1)
})

// pre-login 明確權限否定不因 PeerInfo 抬升，origin只交Worker私有input owner。
it('retains authenticated pre-login permissions and private geometry', async () => {
  const p = peerFixture(/* 受控proof不冒稱真正Vault資料。 */ async () => new Uint8Array(32))
  try {
    expect(p.activity).not.toHaveBeenCalled()
    p.receive(
      {
        misc: {
          permissionInfo: { permission: hbb.PermissionInfo.Permission.Clipboard, enabled: false },
        },
      },
      1n,
    )
    p.receive({ hash: { salt: 's', challenge: 'c' } }, 2n)
    await Promise.resolve()
    p.receive(
      {
        loginResponse: {
          peerInfo: {
            platform: 'Linux',
            version: '1.4.2',
            displays: [{ width: 320, height: 240, x: -320 }],
          },
        },
      },
      3n,
    )
    expect(p.permission).toHaveBeenLastCalledWith({ keyboard: true, clipboard: false })
    expect(p.inputPeer.mock.calls[0]?.[0].geometry.x).toBe(-320)
    expect(p.verified.mock.calls[0]?.[0]).not.toHaveProperty('x')
    expect(p.activity).toHaveBeenCalledTimes(3)
  } finally {
    p.protocol.dispose()
  }
})
// normal鍵鼠／ACK／clip option皆共用真正secretbox連續TX nonce，不另建sender。
it('dispatches owned text and shares one nonce stream for encrypted controls', async () => {
  const p = peerFixture(/* 公開proof fixture。 */ async () => new Uint8Array(32))
  try {
    // 未完整登入不可從任何Main控制推進加密工作。
    expect(() => p.protocol.sendControl({ mouseEvent: { mask: 0, x: 1, y: 2 } })).toThrow(
      'protocol_error',
    )
    expect(p.sends).toHaveLength(1)
    p.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    await Promise.resolve()
    const loginPlain = nacl.secretbox.open(p.sends[1]!, nonce(1n), p.key)!
    try {
      expect(decodeMessage(loginPlain).loginRequest?.option).toMatchObject({
        disableKeyboard: 1,
        disableClipboard: 2,
        disableAudio: 2,
        disableCamera: 2,
      })
    } finally {
      loginPlain.fill(0)
    }
    p.receive(
      {
        loginResponse: {
          peerInfo: {
            platform: 'Linux',
            version: '1.4.2',
            displays: [{ width: 320, height: 240 }],
          },
        },
      },
      2n,
    )
    p.protocol.sendControl({ mouseEvent: { mask: 9, x: 2, y: 3 } })
    p.protocol.sendControl({ misc: { videoReceived: true } })
    p.protocol.sendControl({ misc: { option: { disableClipboard: 1 } } })
    for (const [index, member] of [
      [2, 'mouseEvent'],
      [3, 'misc'],
      [4, 'misc'],
    ] as const) {
      const value = nacl.secretbox.open(p.sends[index]!, nonce(BigInt(index)), p.key)
      expect(value !== null).toBe(true)
      try {
        expect(decodeMessage(value!).union).toBe(member)
      } finally {
        value?.fill(0)
      }
    }
    p.receive({ clipboard: { content: new Uint8Array([65]) } }, 3n)
    expect(p.clipboard).toHaveBeenCalledOnce()
    expect(p.text[0]).toEqual(new Uint8Array([65]))
    p.text[0]?.fill(0)
    expect(p.errors).toEqual([])
  } finally {
    p.protocol.dispose()
  }
})
// origin-only partial update保留platform／SAS與decoder幾何，但作廢input origin。
it('keeps private origin and SAS across partial updates without leaking origin to media', async () => {
  const p = peerFixture(/* 公開proof fixture。 */ async () => new Uint8Array(32))
  try {
    p.receive({ hash: { salt: 's', challenge: 'c' } }, 1n)
    await Promise.resolve()
    p.receive(
      {
        loginResponse: {
          peerInfo: {
            platform: 'Windows',
            version: '1.4.2',
            sasEnabled: true,
            displays: [{ width: 320, height: 240 }],
          },
        },
      },
      2n,
    )
    p.receive({ peerInfo: { displays: [{ width: 320, height: 240, x: -320 }] } }, 3n)
    expect(p.inputPeer.mock.calls.at(-1)?.[0]).toMatchObject({
      platform: 'windows',
      sas: true,
      geometry: { x: -320 },
    })
    expect(p.display).not.toHaveBeenCalled()
    expect(p.verified.mock.calls.at(-1)?.[0]).not.toHaveProperty('x')
  } finally {
    p.protocol.dispose()
  }
})
// 只本機TransportFault有network來源；MAC失敗與未知peer內容永遠fatal。
it('distinguishes typed closed sender from fatal MAC failure', () => {
  const p = peerFixture(/* 本案不登入也不向後端取credential。 */ async () => new Uint8Array(32))
  try {
    p.send.mockImplementationOnce(
      /* 本機同一socket已關閉。 */ () => {
        throw new TransportFault({ cause: 'network', code: 'connection_failed' })
      },
    )
    p.receive({ testDelay: { time: 1 } }, 1n)
    expect(p.errors).toEqual(['connection_failed'])
    expect(p.causes).toEqual(['network'])
  } finally {
    p.protocol.dispose()
  }
  const other = peerFixture(/* 公開proof fixture。 */ async () => new Uint8Array(32))
  try {
    other.protocol.receive(new Uint8Array(32).fill(7))
    expect(other.errors).toEqual(['crypto_failed'])
    expect(other.causes).toEqual(['fatal'])
    expect(other.activity).not.toHaveBeenCalled()
  } finally {
    other.protocol.dispose()
  }
})
