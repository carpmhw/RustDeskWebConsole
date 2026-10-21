import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  reliabilityCode,
  validateReliabilityResults,
  writeSafeReliabilityResults,
  type ConnectionResult,
} from '../real/reliability-results'
import { selectReliabilityTargets, type InputFixture } from '../real/input-fixtures'

const directories: string[] = []
// 每案只清本測試建立的暫存目錄，不碰repo artifacts或runtime資料。
afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true })
})
// 50筆交錯TCP／WS是50次run的固定順序，不是任意長度陣列。
function results(platform: 'linux' | 'windows' = 'linux'): ConnectionResult[] {
  return Array.from({ length: 50 }, (_, index) => ({
    platform,
    transport: index % 2 === 0 ? 'tcp' : 'ws',
    ordinal: index + 1,
    elapsed_ms: 1000 + index,
    first_attempt: true,
    code: 'ok',
  }))
}
// 任意exception文字不可進報告；只接受正式failure白名單及固定test-only分類。
it('maps only fixed safe failure codes', () => {
  for (const code of [
    'rate_limited',
    'connection_timeout',
    'ok',
    'cleanup_failed',
    'input_oracle_failed',
  ])
    expect(reliabilityCode(code)).toBe(code)
  for (const code of [null, undefined, '', 'Public secret', 'A'.repeat(65), 'connection failed'])
    expect(reliabilityCode(code)).toBe('connection_timeout')
})
// 50筆原始順序、平台、transport、elapsed與白名單code缺一不可。
it('validates fifty original attempt rows', () => {
  expect(() => validateReliabilityResults('linux', results())).not.toThrow()
  const invalid = [
    results().slice(0, 49),
    results().map((value, index) => (index === 0 ? { ...value, ordinal: 2 } : value)),
    results().map((value, index) =>
      index === 1 ? { ...value, platform: 'windows' as const } : value,
    ),
    results().map((value, index) =>
      index === 2 ? { ...value, transport: 'udp' as never } : value,
    ),
    results().map((value, index) => (index === 3 ? { ...value, elapsed_ms: -1 } : value)),
    results().map((value, index) => (index === 4 ? { ...value, elapsed_ms: 1.5 } : value)),
    results().map((value, index) =>
      index === 5 ? { ...value, first_attempt: 1 as never } : value,
    ),
    results().map((value, index) => (index === 6 ? { ...value, code: 'Public secret' } : value)),
  ]
  for (const value of invalid)
    expect(() => validateReliabilityResults('linux', value)).toThrow(
      'Safe reliability results invalid',
    )
})
// 報告只落固定whitelist欄位，額外object欄位不能夾帶秘密或原始exception。
it('writes only whitelisted safe result fields', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'rdweb-reliability-'))
  directories.push(directory)
  const values = results('linux').map((value, index) =>
    index === 0 ? ({ ...value, extra: 'Public extra sentinel' } as ConnectionResult) : value,
  )
  await writeSafeReliabilityResults('linux', values, 'Chromium/156.0.0', directory)
  expect(readdirSync(directory)).toEqual(['m3b3-linux-reliability.json'])
  const report = JSON.parse(readFileSync(join(directory, 'm3b3-linux-reliability.json'), 'utf8'))
  expect(report.version).toBe('Chromium/156.0.0')
  expect(report.success).toBe(50)
  expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false)
  expect(report.results).toHaveLength(50)
  expect(Object.keys(report.results[0]).sort()).toEqual([
    'code',
    'elapsed_ms',
    'first_attempt',
    'ordinal',
    'platform',
    'transport',
  ])
  expect(JSON.stringify(report).includes('Public extra sentinel')).toBe(false)
})
// 50次run的兩個transport必須同user／同context，名稱與平台不可互換。
it('selects one same-user tcp and ws reliability target', () => {
  const context = {} as InputFixture['context']
  const fixture = (name: string, transport: 'tcp' | 'ws'): InputFixture => ({
    context,
    username: 'reliability-user',
    targetId: 'target-' + transport,
    name,
    platform: 'linux',
    editor: { x: 100, y: 410, width: 700, height: 220 },
  })
  const tcp = fixture('reliability-target-linux-tcp', 'tcp')
  const ws = fixture('reliability-target-linux-ws', 'ws')
  expect(selectReliabilityTargets([tcp, ws])).toEqual({ tcp, ws })
  for (const value of [
    [tcp],
    [tcp, ws, ws],
    [tcp, { ...ws, context: {} as InputFixture['context'] }],
    [tcp, { ...ws, username: 'other-user' }],
    [tcp, { ...ws, platform: 'windows' as const }],
    [tcp, { ...ws, name: 'reliability-target-linux-other' }],
  ])
    expect(() => selectReliabilityTargets(value)).toThrow('Reliability runtime fixture unavailable')
})

// 無效內容必須在任何寫檔前拒絕，不能留下半份50次證據。
it('refuses invalid results before writing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'rdweb-reliability-'))
  directories.push(directory)
  await expect(
    writeSafeReliabilityResults('linux', results().slice(0, 1), 'Chromium/156.0.0', directory),
  ).rejects.toThrow('Safe reliability results invalid')
  expect(readdirSync(directory)).toEqual([])
})
