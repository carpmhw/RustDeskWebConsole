import { afterEach, expect, it, vi } from 'vitest'
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { binding, endpoints, receiverApi, receiverResult } from './test-fixtures'

const roots: string[] = []
const statFault = vi.hoisted(() => ({ kind: '' }))

// 真檔案與descriptor仍由OS處理，只替換無法安全製造的跨owner／同時改檔stat結果。
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    // 在真fstat回覆上只改本案指定metadata，不偽造reader／validator結果。
    fstatSync(fd: number) {
      const s = fs.fstatSync(fd)
      if (statFault.kind === 'owner') s.uid++
      if (statFault.kind === 'identity') s.ino++
      return s
    },
  }
})

// 所有檔案皆是本次新建公開fixture，只清本測試擁有的精確目錄。
afterEach(() => {
  statFault.kind = ''
  vi.useRealTimers()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// 刪掉descriptor的owner或identity重驗會讓此負向錯誤通過。
it.each(['owner', 'identity'])('rejects a changed descriptor %s', async (kind) => {
  const c = await api(),
    root = directory()
  c.createReceiverRun(root, binding(), endpoints())
  statFault.kind = kind
  expect(() => c.readReceiverJson(root, 'binding.json')).toThrow(/^receiver_unavailable$/)
})

// 不會觸碰repo cache、原HR或Windows路徑。
function directory() {
  const parent = mkdtempSync('/tmp/opencode/rdweb-receiver-test-')
  roots.push(parent)
  return join(parent, 'current')
}

// 本輪UTC只為公開固定fixture的有效期，與真實manifest無關。
async function api() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T00:00:01.000Z'))
  return (await receiverApi('private-io')) as typeof import('./private-io')
}

// 省略私有建立、mode或single-use檢查都應使本測試失敗。
it('creates private files, claims once, and preserves existing results', async () => {
  const c = await api(),
    root = directory()
  c.createReceiverRun(root, binding(), endpoints())
  expect(lstatSync(root).mode & 0o777).toBe(0o700)
  for (const name of ['binding.json', 'connection.json'])
    expect(lstatSync(join(root, name)).mode & 0o777).toBe(0o600)
  expect(c.readReceiverJson(root, 'binding.json')).toEqual(binding())
  expect(c.readReceiverJson(root, 'connection.json')).toEqual(endpoints())
  expect(c.claimReceiverRun(root)).toEqual(binding())
  expect(() => c.claimReceiverRun(root)).toThrow(/^receiver_unavailable$/)
  c.writeReceiverResult(root, receiverResult())
  const before = readFileSync(join(root, 'result.json'))
  expect(() => c.writeReceiverResult(root, receiverResult())).toThrow(/^receiver_unavailable$/)
  expect(readFileSync(join(root, 'result.json')).equals(before)).toBe(true)
  expect(() => c.createReceiverRun(root, binding(), endpoints())).toThrow(/^receiver_unavailable$/)
})

// result只能在真正claim後落盤，準備不是執行授權或完成證據。
it('requires a matching claim before writing results', async () => {
  const c = await api(),
    root = directory()
  c.createReceiverRun(root, binding(), endpoints())
  expect(() => c.writeReceiverResult(root, receiverResult())).toThrow(/^receiver_unavailable$/)
  expect(existsSync(join(root, 'result.json'))).toBe(false)
  c.claimReceiverRun(root)
  expect(() =>
    c.writeReceiverResult(root, { ...receiverResult(), requestId: binding().runId }),
  ).toThrow(/^receiver_unavailable$/)
})

// 寬鬆mode、link或超額資料都不能經reader進入schema。
it.each([
  'directory-mode',
  'file-mode',
  'symlink',
  'hardlink',
  'oversize',
  'invalid-utf8',
  'duplicate-key',
])('rejects unsafe files: %s', async (kind) => {
  const c = await api(),
    root = directory()
  c.createReceiverRun(root, binding(), endpoints())
  const file = join(root, 'binding.json')
  if (kind === 'directory-mode') chmodSync(root, 0o750)
  if (kind === 'file-mode') chmodSync(file, 0o640)
  if (kind === 'symlink') {
    renameSync(file, file + '.original')
    symlinkSync(file + '.original', file)
  }
  if (kind === 'hardlink') linkSync(file, file + '.linked')
  if (kind === 'oversize') writeFileSync(file, ' '.repeat(8193))
  if (kind === 'invalid-utf8') writeFileSync(file, Buffer.from([0xc3, 0x28]))
  if (kind === 'duplicate-key') writeFileSync(file, '{"schemaVersion":1,"schemaVersion":1}')
  expect(() => c.readReceiverJson(root, 'binding.json')).toThrow(/^receiver_unavailable$/)
})

// 原用途root即使尚不存在，也必須在任何建立／read前被排除。
it.each(['windows-host-observer', 'windows-host-input-only', 'windows-host-handoff'])(
  'refuses other-purpose trees: %s',
  async (name) => {
    const c = await api(),
      root = directory()
    const other = join(root, name, 'current')
    expect(() => c.createReceiverRun(other, binding(), endpoints())).toThrow(
      /^receiver_unavailable$/,
    )
    expect(existsSync(root)).toBe(false)
    expect(() => c.readReceiverJson(other, 'binding.json')).toThrow(/^receiver_unavailable$/)
  },
)

// 有效期不可由mtime、晚到檔案或第二次claim恢復。
it('refuses future or expired bindings before claiming', async () => {
  const c = await api(),
    root = directory()
  c.createReceiverRun(root, binding(), endpoints())
  vi.setSystemTime(new Date('2026-10-23T00:30:00.000Z'))
  expect(() => c.claimReceiverRun(root)).toThrow(/^receiver_unavailable$/)
  expect(existsSync(join(root, 'claim.json'))).toBe(false)
  vi.setSystemTime(new Date('2026-10-22T23:59:59.999Z'))
  expect(() => c.claimReceiverRun(root)).toThrow(/^receiver_unavailable$/)
})

// symlink祖先及未知檔名不能讓IO離開明確授權的新樹。
it('rejects re-routed ancestors and unexpected names', async () => {
  const c = await api(),
    root = directory()
  const original = join(root, 'original')
  mkdirSync(root, { mode: 0o700 })
  mkdirSync(original, { mode: 0o700 })
  symlinkSync(original, join(root, 'link'))
  expect(() => c.createReceiverRun(join(root, 'link', 'current'), binding(), endpoints())).toThrow(
    /^receiver_unavailable$/,
  )
  expect(() => c.readReceiverJson(root, '../binding.json' as 'binding.json')).toThrow(
    /^receiver_unavailable$/,
  )
})
