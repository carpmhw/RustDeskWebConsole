import { expect, it, vi } from 'vitest'
import nacl from 'tweetnacl'
import { LoginProtocol } from './protocol'
import { encodeIdentity, encodeMessage, decodeMessage, hbb } from './codec'
import { nonce } from './crypto'
import type { Callbacks, Ready } from './types'

// 每個契約測試建立新NaCl peer，保留公開事件並用獨立peer端解封session key。
function peerFixture(assist: Callbacks['assist']) {
  const signing = nacl.sign.keyPair()
  const peer = nacl.box.keyPair()
  const sends: Uint8Array[] = []
  const errors: string[] = []
  const verified = vi.fn()
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
      send: (bytes) => sends.push(bytes),
      assist,
      phase: () => {},
      failure: (code) => errors.push(code),
      verified,
    },
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
  return { protocol, sends, errors, verified, receive, key }
}

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
    peer.receive({ loginResponse: { peerInfo: { platform: 'Linux', version: '1.4.2' } } }, 4n)
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
  const protocol = new LoginProtocol(ready, {
    send: (bytes) => sends.push(bytes),
    assist: async () => new Uint8Array(32),
    phase: () => {},
    failure: (code) => errors.push(code),
    verified: () => {
      verified = true
    },
  })
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
    },
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
