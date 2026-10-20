import { inspect } from 'node:util'
import nacl from 'tweetnacl'
import { afterEach, expect, it, vi } from 'vitest'
import { PeerCrypto, nonce } from '../src/rdweb/crypto'
import { encodeIdentity, decodeMessage } from '../src/rdweb/codec'
import { ConsoleHost, type WorkerPort } from '../src/rdweb/host'
import type { VideoMainEvent, VideoWorkerEvent, RenderPort } from '../src/rdweb/video-types'
import { createLoopbackProxy } from '../e2e-real/reconnect-proxy.ts'
import { PUBLIC_TARGET, rawTunnel, readHttp, serve } from './public-fixtures.ts'

const cleanups: Array<() => Promise<void>> = []
// Scoped producer／global stub與所有loopback owner都不得滲入下一案。
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  while (cleanups.length) await cleanups.pop()!()
})

// 真NaCl簽章與box在測試RAM解封，外部只拿布林證據，最後清掉所有key。
function cryptoEvidence() {
  const signing = nacl.sign.keyPair(),
    peer = nacl.box.keyPair()
  const signed = nacl.sign(
    encodeIdentity({ id: '123456789', pk: peer.publicKey }),
    signing.secretKey,
  )
  const sessions = [new PeerCrypto(), new PeerCrypto()]
  const keys: Uint8Array[] = []
  try {
    for (const crypto of sessions) {
      const wire = decodeMessage(
        crypto.handshake(signed, '123456789', signing.publicKey),
      ).publicKey!
      const key = nacl.box.open(
        wire.symmetricValue!,
        new Uint8Array(24),
        wire.asymmetricValue!,
        peer.secretKey,
      )
      if (!key) throw new Error('public_crypto_fixture_failed')
      keys.push(key)
    }
    const plain = new Uint8Array([1, 2, 3])
    const ciphertexts = sessions.map(/* 不回報密文或key。 */ (crypto) => crypto.encrypt(plain))
    const keysDiffer = keys[0].some(
      /* RAM內比較，assertion只收布林。 */ (value, index) => value !== keys[1][index],
    )
    const countersStartAtOne = ciphertexts.every((cipher, index) => {
      const decoded = nacl.secretbox.open(cipher, nonce(1n), keys[index])
      return !!decoded && decoded.length === 3 && decoded.every((value, i) => value === plain[i])
    })
    let crossKeyRejected = false
    try {
      sessions[1].decrypt(ciphertexts[0])
    } catch {
      crossKeyRejected = true
    }
    sessions[0].dispose()
    let disposedHandshake = false,
      disposedEncrypt = false
    try {
      sessions[0].handshake(signed, '123456789', signing.publicKey)
    } catch {
      disposedHandshake = true
    }
    try {
      sessions[0].encrypt(plain)
    } catch {
      disposedEncrypt = true
    }
    return { keysDiffer, countersStartAtOne, crossKeyRejected, disposedHandshake, disposedEncrypt }
  } finally {
    for (const crypto of sessions) crypto.dispose()
    for (const key of keys) key.fill(0)
    signing.secretKey.fill(0)
    peer.secretKey.fill(0)
  }
}

// 既有產品正確行為新增characterization，不冒稱修復產品RED。
it('derives independent session keys and resets counters with real NaCl', () => {
  const evidence = cryptoEvidence()
  expect(Object.values(evidence).every(Boolean)).toBe(true)
})

// 故意重用random producer時，真正握手仍完成但freshness oracle必須拒絕。
it('freshness oracle rejects a scoped reused randomness producer', () => {
  vi.spyOn(nacl, 'randomBytes').mockImplementation(
    /* 每次相同bytes但非同一alias。 */ (size) => new Uint8Array(size).fill(7),
  )
  const evidence = cryptoEvidence()
  expect(evidence.keysDiffer).toBe(false)
  expect(evidence.crossKeyRejected).toBe(false)
  expect(Object.values(evidence).every(Boolean)).toBe(false)
})

// Controlled port只持有安全次數，不記ticket或Start原物件。
class PublicPort implements WorkerPort {
  onmessage: ((event: MessageEvent<VideoWorkerEvent>) => void) | null = null
  onerror: (() => void) | null = null
  starts = 0
  probes = 0
  // 每次capability由真Host probe流程處理，不假稱native codec成功。
  postMessage(value: VideoMainEvent): void {
    if (value.type === 'start') this.starts++
    if (value.type === 'probe') {
      this.probes++
      queueMicrotask(
        /* 不傳認證或私有資料給主控snapshot。 */ () =>
          this.onmessage?.({
            data: {
              type: 'capabilities',
              revision: value.revision,
              frame: value.frame,
              capabilities: { profiles: { vp9: ['vp09.00.10.08'] } },
            },
          } as MessageEvent<VideoWorkerEvent>),
      )
    }
    if (value.type === 'dispose')
      queueMicrotask(
        /* Native port在這裡只作lifecycle替身。 */ () =>
          this.onmessage?.({
            data: { type: 'disposed', revision: value.revision },
          } as MessageEvent<VideoWorkerEvent>),
      )
  }
  // 無native Worker資源，清理不製造成功ACK。
  terminate(): void {}
}

// 晚first grant不得啟舊Worker或污染已準備的新operation；每次皆需probe與request。
it('Host opens fresh worker and ticket and ignores late old grant', async () => {
  vi.stubGlobal('location', { origin: 'http://localhost' })
  let release!: (value: unknown) => void
  const old = new Promise<unknown>(
    /* 只控制公開DTO producer。 */ (resolve) => {
      release = resolve
    },
  )
  let requested = 0
  const ports: PublicPort[] = []
  const renderer: RenderPort = { setFormat: () => {}, accept: () => {}, dispose: () => {} }
  const host = new ConsoleHost(
    {
      request: async <T>() => {
        requested++
        return (requested === 1 ? await old : { ticket: 'b'.repeat(43), expires_in: 30 }) as T
      },
    },
    () => {},
    () => renderer,
    () => {
      const port = new PublicPort()
      ports.push(port)
      return port
    },
    /* 公開能力transfer替身，非native frame證據。 */ () => ({ close: () => {} }) as VideoFrame,
  )
  try {
    const first = host.open(PUBLIC_TARGET, '123456789')
    await vi.waitFor(() => expect(requested).toBe(1))
    first.cancel()
    const second = host.open(PUBLIC_TARGET, '123456789')
    await second.prepared
    release({ ticket: 'a'.repeat(43), expires_in: 30 })
    await first.prepared
    expect(ports.length).toBe(2)
    expect(ports[0] !== ports[1]).toBe(true)
    expect(ports.map((port) => port.probes)).toEqual([1, 1])
    expect(ports.map((port) => port.starts)).toEqual([0, 1])
    expect(requested).toBe(2)
  } finally {
    host.dispose()
  }
})

// 真HTTP節點只回公開內容，metrics不能存任意路徑或憑證。
async function setupMetrics() {
  const endpoint = await serve(
    (_req, res) => res.end('public'),
    (_req, socket, head) => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
      )
      if (head.length) socket.write(head)
      socket.pipe(socket)
    },
  )
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  return { proxy, lease: proxy.beginCase('', PUBLIC_TARGET) }
}

// 若只寫lastAt或可覆寫meAt，後來的request會掩蓋過早attempt。
it('later request cannot overwrite first attempt timing', async () => {
  const { proxy, lease } = await setupMetrics()
  await readHttp(proxy.port, '/api/v1/targets/' + PUBLIC_TARGET)
  await readHttp(proxy.port, '/api/v1/auth/me')
  await readHttp(proxy.port, '/api/v1/targets/' + PUBLIC_TARGET + '/connect-ticket', 'POST')
  const first = lease.summary().attempts[0]
  expect(first?.metadataAt).toBeGreaterThan(0)
  expect(first?.meAt).toBeGreaterThanOrEqual(first.metadataAt)
  await readHttp(proxy.port, '/api/v1/auth/me')
  expect(lease.summary().attempts[0].meAt).toBe(first.meAt)
  const client = await rawTunnel(proxy.port)
  cleanups.push(client.close)
  const handle = await lease.nextAccepted(new AbortController().signal)
  expect(lease.summary().attempts[0].acceptedAt).toBe(handle.acceptedAt)
  lease.interrupt(handle)
  expect(lease.summary().attempts[0].cutAt).toBeGreaterThanOrEqual(handle.acceptedAt)
  await readHttp(proxy.port, '/api/v1/targets/' + PUBLIC_TARGET)
  expect(lease.summary().attempts).toHaveLength(2)
  expect(lease.summary().attempts[0].metadataAt).toBe(first.metadataAt)
  expect(lease.summary().routes.ticket.requested).toBe(1)
  expect(proxy.summary().routes.ticket.requested).toBe(1)
})

// 以真HTTP status驗limited與denied，不讀或重寫grant／assist body。
for (const status of [401, 403, 429]) {
  it('records only safe HTTP status counters: ' + status, async () => {
    const endpoint = await serve((_req, res) => {
      res.writeHead(status)
      res.end('public')
    })
    cleanups.push(endpoint.close)
    const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
    cleanups.push(proxy.close)
    const lease = proxy.beginCase('', PUBLIC_TARGET)
    await readHttp(proxy.port, '/api/v1/targets/' + PUBLIC_TARGET + '/connect-ticket', 'POST')
    expect(lease.summary().routes.ticket).toMatchObject({
      requested: 1,
      succeeded: 0,
      denied: status === 429 ? 0 : 1,
      limited: status === 429 ? 1 : 0,
    })
  })
}

// 對外control物件也不能讓通用inspect展開私有ClientRequest的認證header。
it('summary and public control do not retain credential sentinels', async () => {
  let arrived = false
  const endpoint = await serve(() => {
    arrived = true
  })
  cleanups.push(endpoint.close)
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port })
  cleanups.push(proxy.close)
  const lease = proxy.beginCase('', PUBLIC_TARGET)
  const response = readHttp(proxy.port, '/api/v1/auth/me', 'GET', {
    Authorization: 'PublicSensitiveSentinel',
  }).catch(/* 預期取消不回native error。 */ () => null)
  try {
    await expect.poll(() => arrived).toBe(true)
    expect(inspect(lease, { depth: 6 }).includes('PublicSensitiveSentinel')).toBe(false)
    expect(JSON.stringify(lease.summary()).includes('PublicSensitiveSentinel')).toBe(false)
    expect(JSON.stringify(proxy.summary()).includes('PublicSensitiveSentinel')).toBe(false)
  } finally {
    await proxy.close()
    await response
  }
})

// 未取得101的metadata attempt同樣有界，第17列不能默默繼續累積。
it('bounds metadata attempt timing to sixteen rows', async () => {
  const { proxy, lease } = await setupMetrics()
  for (let i = 0; i < 16; i++)
    expect((await readHttp(proxy.port, '/api/v1/targets/' + PUBLIC_TARGET)).status).toBe(200)
  expect((await readHttp(proxy.port, '/api/v1/targets/' + PUBLIC_TARGET)).status).toBe(503)
  expect(lease.summary().attempts).toHaveLength(16)
})
