import { afterEach, expect, it, vi } from 'vitest'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { binding, clientReport, endpoints, receiverApi, receiverResult } from './test-fixtures'

const roots: string[] = []
const ENABLED = { RDWEB_TEST_RECEIVER_LIVE: '1' }

// 只清本測試新建的公開tmp樹，不碰repo cache或任何既有輪資料。
afterEach(() => {
  vi.useRealTimers()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// 每個root都是本次mkdtemp下的新current，父目錄已由OS建立為私有。
function directory() {
  const parent = mkdtempSync('/tmp/opencode/rdweb-receiver-client-')
  roots.push(parent)
  return join(parent, 'current')
}

// UTC時間只固定公開fixture有效期；client的180秒另用注入的單調now。
async function api() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T00:00:01.000Z'))
  return (await receiverApi('client-control')) as typeof import('./client-control')
}

// 準備只建立新root／私有檔並claim一次，不讀網路或既有host資料。
function prepared(c: typeof import('./client-control'), root: string): void {
  c.prepareReceiverClient(root, binding(), endpoints(), ENABLED)
}

// 以source私有檔模擬操作者從Windows帶回的receiver result；每次用新檔名避免mode重用。
let sourceCount = 0
function source(parent: string, value: unknown, mode = 0o600): string {
  const path = join(parent, `receiver-result-${sourceCount++}.json`)
  writeFileSync(path, JSON.stringify(value) + '\n', { mode })
  return path
}

// 準備與claim只能成功一次；重複不得覆寫任何既有檔。
it('prepares a private receiver root and claims exactly once', async () => {
  const c = await api(),
    root = directory()
  prepared(c, root)
  expect(lstatSync(root).mode & 0o777).toBe(0o700)
  for (const name of ['binding.json', 'connection.json', 'claim.json'])
    expect(lstatSync(join(root, name)).mode & 0o777).toBe(0o600)
  expect(() => prepared(c, root)).toThrow(/^receiver_unavailable$/)
})

// start先驗claim並只寫一次start-request；finish只接受同輪client report。
it('starts once and writes a matching client report once', async () => {
  const c = await api(),
    root = directory()
  prepared(c, root)
  const client = c.createReceiverClient(root, () => 0, ENABLED)
  expect(client.binding).toEqual(binding())
  expect(existsSync(join(root, 'start-request.json'))).toBe(false)
  client.start()
  expect(lstatSync(join(root, 'start-request.json')).mode & 0o777).toBe(0o600)
  expect(() => client.start()).toThrow(/^receiver_unavailable$/)
  client.finish(clientReport())
  expect(lstatSync(join(root, 'client.json')).mode & 0o777).toBe(0o600)
  expect(() => client.finish(clientReport())).toThrow(/^receiver_unavailable$/)
})

// 非opt-in必須在任何root讀寫前拒絕；CI與舊用途flags也不得混用。
it.each([
  [{}, false],
  [{ RDWEB_TEST_RECEIVER_LIVE: '0' }, false],
  [{ RDWEB_TEST_RECEIVER_LIVE: '1', CI: '1' }, false],
  [{ RDWEB_TEST_RECEIVER_LIVE: '1', GITHUB_ACTIONS: 'true' }, false],
  [{ RDWEB_TEST_RECEIVER_LIVE: '1', RDWEB_WINDOWS_HOST_OBSERVE: '1' }, false],
  [{ RDWEB_TEST_RECEIVER_LIVE: '1', RDWEB_WINDOWS_HOST_INPUT_ONLY: '1' }, false],
  [{ RDWEB_TEST_RECEIVER_LIVE: '1', RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG: '1' }, false],
  [ENABLED, true],
] as const)('enforces the live opt-in: %j', async (env, expected) => {
  const c = await api()
  expect(c.receiverClientEnabled(env)).toBe(expected)
  if (!expected) {
    const root = directory()
    expect(() => c.prepareReceiverClient(root, binding(), endpoints(), env)).toThrow(
      /^receiver_unavailable$/,
    )
    expect(existsSync(root)).toBe(false)
  }
})

// 過期binding不得建立client或匯入；晚到時間不能由mtime恢復。
it('rejects expired bindings before client or import I/O', async () => {
  const c = await api(),
    root = directory()
  prepared(c, root)
  vi.setSystemTime(new Date('2026-10-23T00:30:00.000Z'))
  expect(() => c.createReceiverClient(root, () => 0, ENABLED)).toThrow(/^receiver_unavailable$/)
})

// 跨run、額外欄位與非私有root都不能被當成同輪client證據。
it('rejects cross-run, extra and unsafe client reports', async () => {
  const c = await api(),
    root = directory()
  prepared(c, root)
  const client = c.createReceiverClient(root, () => 0, ENABLED)
  client.start()
  expect(() =>
    client.finish({ ...clientReport(), runId: '33333333-3333-4333-8333-333333333333' }),
  ).toThrow(/^receiver_unavailable$/)
  expect(() => client.finish({ ...clientReport(), extra: true } as never)).toThrow(
    /^receiver_unavailable$/,
  )
  expect(existsSync(join(root, 'client.json'))).toBe(false)
  chmodSync(root, 0o750)
  expect(() => c.createReceiverClient(root, () => 0, ENABLED)).toThrow(/^receiver_unavailable$/)
})

// 成功join只寫一次私有joined／result；重複import不得縮權或覆寫第一份。
it('imports a same-run result once and preserves the first join', async () => {
  const c = await api(),
    root = directory(),
    parent = roots.at(-1)!
  prepared(c, root)
  const client = c.createReceiverClient(root, () => 0, ENABLED)
  client.start()
  client.finish(clientReport())
  const receiverPath = source(parent, receiverResult())
  const joined = c.importReceiverResult(root, receiverPath, () => 0, ENABLED)
  expect(joined.code).toBe('receiver_match')
  for (const name of ['joined.json', 'result.json'])
    expect(lstatSync(join(root, name)).mode & 0o777).toBe(0o600)
  const before = readFileSync(join(root, 'joined.json'))
  expect(() => c.importReceiverResult(root, receiverPath, () => 0, ENABLED)).toThrow(
    /^receiver_unavailable$/,
  )
  expect(readFileSync(join(root, 'joined.json')).equals(before)).toBe(true)
})

// Client缺少身份、畫面、scope或收尾任一證據時，receiver自身match也不能升級。
it.each(['identityVerified', 'videoPresented', 'scopeIntact', 'resourcesClosed', 'unavailable'])(
  'does not match when client %s is incomplete',
  async (name) => {
    const c = await api(),
      root = directory(),
      parent = roots.at(-1)!
    prepared(c, root)
    const client = c.createReceiverClient(root, () => 0, ENABLED)
    client.start()
    client.finish({ ...clientReport(), [name]: name === 'unavailable' } as never)
    const joined = c.importReceiverResult(root, source(parent, receiverResult()), () => 0, ENABLED)
    expect(joined.code).toBe('receiver_unavailable')
    expect(existsSync(join(root, 'joined.json'))).toBe(true)
  },
)

// receiver自己的收尾或跨run錯誤優先不可用，不能以client成功補值。
it('rejects a cross-run or invalid receiver result', async () => {
  const c = await api(),
    root = directory(),
    parent = roots.at(-1)!
  prepared(c, root)
  const client = c.createReceiverClient(root, () => 0, ENABLED)
  client.start()
  client.finish(clientReport())
  expect(() =>
    c.importReceiverResult(
      root,
      source(parent, { ...receiverResult(), runId: '33333333-3333-4333-8333-333333333333' }),
      () => 0,
      ENABLED,
    ),
  ).toThrow(/^receiver_unavailable$/)
  expect(() =>
    c.importReceiverResult(
      root,
      source(parent, { ...receiverResult(), extra: true }),
      () => 0,
      ENABLED,
    ),
  ).toThrow(/^receiver_unavailable$/)
  expect(() =>
    c.importReceiverResult(root, source(parent, receiverResult(), 0o640), () => 0, ENABLED),
  ).toThrow(/^receiver_unavailable$/)
})
