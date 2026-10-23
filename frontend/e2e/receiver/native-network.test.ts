import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { endpoints } from './test-fixtures'
import { createReceiverDiagnostic } from './diagnostic.ts'

const state = vi.hoisted(() => ({
  socket: null as FakeTcp | null,
  udp: null as FakeUdp | null,
  failConnect: false,
}))

// 只替換真正會開socket／查DNS的邊界，執行正式Node adapter而非測試替身的close邏輯。
vi.mock('node:net', () => ({
  // 自有EventEmitter不開任何真socket，close事件由測試明確提供。
  createConnection() {
    const socket = new FakeTcp()
    state.socket = socket
    queueMicrotask(() =>
      socket.emit(state.failConnect ? 'error' : 'connect', new Error('public_connect_failure')),
    )
    return socket
  },
}))
vi.mock('node:dgram', () => ({
  // 自有EventEmitter重現非同步UDP close，不開真socket。
  createSocket() {
    state.udp = new FakeUdp()
    return state.udp
  },
}))

class FakeUdp extends EventEmitter {
  closing = false
  // connect callback只以microtask回報，無bind或DNS副作用。
  connect(_port: number, _host: string, callback: () => void) {
    queueMicrotask(callback)
  }
  // 不保存公開payload，僅完成正式adapter的send callback。
  send(_bytes: Uint8Array, callback: () => void) {
    callback()
  }
  // Node dgram在close開始後便停止運作，但close事件要稍後才到。
  close() {
    if (this.closing) throw new Error('public_dgram_not_running')
    this.closing = true
  }
}
vi.mock('node:dns/promises', () => ({
  // 固定文件專用IP，從不做真DNS查詢。
  async lookup() {
    return [{ address: '192.0.2.1', family: 4 }]
  },
}))

class FakeTcp extends EventEmitter {
  destroyed = false
  ended = false
  // adapter設定不對OS產生任何動作。
  setNoDelay() {
    return this
  }
  // 可接受的公開bytes只留長度，不保存payload。
  write(bytes: Uint8Array) {
    return bytes instanceof Uint8Array
  }
  // 故意不立即發close，捕捉把destroy要求當完成的錯誤。
  destroy() {
    this.destroyed = true
    return this
  }
  // 正常end也要等待close事件。
  end() {
    this.ended = true
    return this
  }
}

// 還原fake clock與本案狀態，不清理其他程序／網路資源。
afterEach(() => {
  vi.useRealTimers()
  state.socket = null
  state.udp = null
  state.failConnect = false
})

// abort先要求UDP close，之後正式close必須等同一原生事件，不因重複要求而假失敗。
it('waits for UDP close acknowledgement after abort without closing twice', async () => {
  const { createNodeReceiverNetwork } = await import('./cli')
  const diagnostic = createReceiverDiagnostic()
  const controller = new AbortController()
  const network = createNodeReceiverNetwork(endpoints(), diagnostic)
  await network.openUdp(endpoints().hbbsUdp, controller.signal)
  controller.abort()
  let settled = false
  const closing = network.close().then((value) => {
    settled = true
    return value
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(settled).toBe(false)
  state.udp!.emit('close')
  expect(await closing).toBe(true)
  expect(diagnostic.snapshot().udpClose).toBe('confirmed')
})

// UDP缺原生close證據仍須2000ms回false，不以close已呼叫或abort補成功。
it('preserves missing UDP close evidence at the existing deadline', async () => {
  vi.useFakeTimers()
  const { createNodeReceiverNetwork } = await import('./cli')
  const diagnostic = createReceiverDiagnostic()
  const network = createNodeReceiverNetwork(endpoints(), diagnostic)
  const duplex = await network.openUdp(endpoints().hbbsUdp, new AbortController().signal)
  const closing = duplex.close()
  await vi.advanceTimersByTimeAsync(2000)
  expect(await closing).toBe(false)
  state.udp!.emit('close')
  expect(diagnostic.snapshot().udpClose).toBe('unconfirmed')
})

// 正常close或error先觸發close要求時，都只以稍後的同一原生事件確認。
it.each(['normal', 'error'] as const)(
  'confirms UDP %s closure only on its native event',
  async (kind) => {
    const { createNodeReceiverNetwork } = await import('./cli')
    const d = createReceiverDiagnostic()
    const n = createNodeReceiverNetwork(endpoints(), d)
    const duplex = await n.openUdp(endpoints().hbbsUdp, new AbortController().signal)
    if (kind === 'error') state.udp!.emit('error', new Error('PUBLIC_SECRET_SENTINEL'))
    const first = duplex.close(),
      second = duplex.close()
    expect(d.snapshot().udpClose).toBe('unconfirmed')
    state.udp!.emit('close')
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(d.snapshot().udpClose).toBe('confirmed')
  },
)

// error後即使destroy已呼叫，沒有close證據也不能回true。
it('does not report a requested destroy as a closed socket', async () => {
  vi.useFakeTimers()
  const { createNodeReceiverNetwork } = await import('./cli')
  const n = createNodeReceiverNetwork(endpoints())
  const duplex = await n.openTcp(endpoints().hbbsTcp, new AbortController().signal)
  state.socket!.emit('error', new Error('public_socket_failure'))
  expect(state.socket!.destroyed).toBe(true)
  let settled = false
  const closing = duplex.close().then((value) => {
    settled = true
    return value
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(2000)
  expect(await closing).toBe(false)
})

// 真close事件到齊才可正常收尾；重複close只回同一終態。
it('reports closed only after the native close event', async () => {
  const { createNodeReceiverNetwork } = await import('./cli')
  const duplex = await createNodeReceiverNetwork(endpoints()).openTcp(
    endpoints().hbbsTcp,
    new AbortController().signal,
  )
  const closing = duplex.close()
  expect(state.socket!.ended).toBe(true)
  state.socket!.emit('close')
  expect(await closing).toBe(true)
  expect(await duplex.close()).toBe(true)
})

// UDP去重不能改變TCP在graceful end期間遇到error仍須destroy的行為。
it('still destroys TCP after an error during graceful close', async () => {
  const { createNodeReceiverNetwork } = await import('./cli')
  const duplex = await createNodeReceiverNetwork(endpoints()).openTcp(
    endpoints().hbbsTcp,
    new AbortController().signal,
  )
  const closing = duplex.close()
  state.socket!.emit('error', new Error('PUBLIC_SECRET_SENTINEL'))
  expect(state.socket!.destroyed).toBe(true)
  state.socket!.emit('close')
  expect(await closing).toBe(true)
})

// 連線建立失敗也擁有socket，不能只reject而漏掉destroy要求。
it('does not guess the TCP role when saved endpoints are identical', async () => {
  const { createNodeReceiverNetwork } = await import('./cli')
  const d = createReceiverDiagnostic()
  const e = endpoints()
  e.hbbrTcp = { ...e.hbbsTcp }
  const n = createNodeReceiverNetwork(e, d)
  const duplex = await n.openTcp(e.hbbsTcp, new AbortController().signal)
  const closing = duplex.close()
  state.socket!.emit('close')
  expect(await closing).toBe(true)
  expect(d.snapshot()).toMatchObject({ hbbsClose: 'unconfirmed', hbbrClose: 'unconfirmed' })
})

// 連線建立失敗也擁有socket，不能只reject而漏掉destroy要求。
it('destroys a socket that fails before connecting', async () => {
  vi.useFakeTimers()
  state.failConnect = true
  const { createNodeReceiverNetwork } = await import('./cli')
  const network = createNodeReceiverNetwork(endpoints())
  await expect(network.openTcp(endpoints().hbbsTcp, new AbortController().signal)).rejects.toThrow(
    /^receiver_unavailable$/,
  )
  expect(state.socket!.destroyed).toBe(true)
  const closing = network.close()
  await vi.advanceTimersByTimeAsync(2000)
  expect(await closing).toBe(false)
})
