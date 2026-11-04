import { expect, it, vi } from 'vitest'
import { binding, endpoints, receiverApi, receiverResult } from './test-fixtures'
import type { ReceiverResult } from './contract.ts'
import { createReceiverDiagnostic, parseReceiverDiagnostic } from './diagnostic.ts'

const ENV_KEY = 'RDWEB_TEST_RECEIVER_PASSWORD'
const PASSWORD_TEXT = 'public-cli-password'

type CliModule = typeof import('./cli')

// 缺能力先以存在性斷言取得RED，不讓module-not-found冒充行為測試。
async function api(): Promise<CliModule> {
  return (await receiverApi('cli')) as CliModule
}

// 公開fake TTY只回本案RAM chunks，不建立真terminal或raw mode。
class FakeTty {
  isTTY = true
  readonly raw: boolean[] = []
  readonly prompts: string[] = []
  readonly chunks: Uint8Array[] = []
  failRestore = false
  readError: Error | null = null

  // 可選order只在測試要求時記錄secret讀取，不影響正式介面。
  constructor(private readonly order: string[] = []) {}

  // 記錄raw mode切換；測試可注入restore失敗，確認不會留下raw terminal。
  setRawMode(value: boolean): void {
    this.raw.push(value)
    if (!value && this.failRestore) throw new Error('public_restore_failure')
  }

  // 逐chunk回傳輸入；測試不經process.stdin。
  async *read(): AsyncIterable<Uint8Array> {
    this.order.push('secret')
    for (const chunk of this.chunks) yield chunk
    if (this.readError) throw this.readError
  }

  // 只記錄固定prompt code，不輸出密碼。
  prompt(code: 'receiver_password_required'): void {
    this.prompts.push(code)
  }
}

// 建立公開entry ports；所有副作用以spy記錄，不讀檔或開socket。
function entry(
  options: {
    env?: Record<string, string | undefined>
    tty?: FakeTty
    result?: ReceiverResult
    preflightError?: boolean
    claimError?: boolean
    runError?: boolean
    order?: string[]
  } = {},
) {
  const order = options.order ?? []
  const tty = options.tty ?? new FakeTty()
  const env = options.env ?? {}
  const result = options.result ?? receiverResult()
  const signal = new AbortController().signal
  let receivedPassword: Uint8Array | null = null
  const runtime = {
    // 只記錄順序及密碼buffer參考，不建立runtime或network。
    async run(
      _binding: unknown,
      _endpoints: unknown,
      password: Uint8Array,
      actualSignal: AbortSignal,
    ): Promise<ReceiverResult> {
      order.push('run')
      receivedPassword = password
      expect(actualSignal).toBe(signal)
      if (options.runError) throw new Error('public_failure')
      return result
    },
  }
  const ports = {
    env,
    tty,
    runtime,
    signal,
    // preflight必須在secret與claim前完成。
    async preflight(root: string) {
      order.push('preflight')
      expect(root).toBe('/tmp/opencode/public-run')
      if (options.preflightError) throw new Error('public_failure')
      return { binding: binding(), endpoints: endpoints() }
    },
    // claim只能一次，且必須在任何network副作用前完成。
    async claim(root: string) {
      order.push('claim')
      expect(root).toBe('/tmp/opencode/public-run')
      if (options.claimError) throw new Error('public_failure')
    },
  }
  return { ports, order, tty, env, runtime, signal, result, password: () => receivedPassword }
}

// 終端輸出只能有固定安全分類與booleans。
function spyOutput() {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  }
}

// 環境密碼優先且不碰TTY；使用後必須移除環境引用。
it('reads the password from the process environment without touching TTY', async () => {
  const cli = await api()
  const tty = new FakeTty()
  tty.isTTY = false
  const env: Record<string, string | undefined> = { [ENV_KEY]: PASSWORD_TEXT }
  const secret = await cli.readReceiverSecret(tty, env)
  expect(new TextDecoder().decode(secret)).toBe(PASSWORD_TEXT)
  expect(env[ENV_KEY]).toBeUndefined()
  expect(Object.keys(env)).not.toContain(ENV_KEY)
  expect(tty.raw).toEqual([])
  expect(tty.prompts).toEqual([])
})

// 可信TTY必須先raw、固定prompt、收一列、還原raw，且不trim。
it('reads one hidden line from a trusted TTY and restores raw mode', async () => {
  const cli = await api()
  const tty = new FakeTty()
  tty.chunks.push(new TextEncoder().encode(' public '), new TextEncoder().encode('pass\r\n'))
  const secret = await cli.readReceiverSecret(tty, {})
  expect(new TextDecoder().decode(secret)).toBe(' public pass')
  expect(tty.prompts).toEqual(['receiver_password_required'])
  expect(tty.raw).toEqual([true, false])
})

// 空Enter、Ctrl+C、EOF、非TTY與超長密碼都必須在任何claim／socket前拒絕。
it.each(['empty', 'ctrl-c', 'eof', 'non-tty', 'too-large', 'restore'])(
  'rejects %s without returning a password',
  async (kind) => {
    const cli = await api()
    const tty = new FakeTty()
    if (kind === 'empty') tty.chunks.push(new TextEncoder().encode('\n'))
    if (kind === 'ctrl-c') tty.chunks.push(new TextEncoder().encode('abc\u0003'))
    if (kind === 'eof') tty.chunks.push(new TextEncoder().encode('abc'))
    if (kind === 'non-tty') tty.isTTY = false
    if (kind === 'too-large') tty.chunks.push(new Uint8Array(4097).fill(65))
    if (kind === 'restore') {
      tty.chunks.push(new TextEncoder().encode('secret\n'))
      tty.failRestore = true
    }
    await expect(cli.readReceiverSecret(tty, {})).rejects.toMatchObject({
      message: 'receiver_unavailable',
      ...(kind === 'restore' ? { ttyRestored: false } : {}),
    })
    if (kind !== 'non-tty') expect(tty.raw).toEqual([true, false])
  },
)

// 空環境值不得當成有效密碼，也不得留下可重用的環境引用。
it('rejects an empty environment password and removes the key', async () => {
  const cli = await api()
  const env: Record<string, string | undefined> = { [ENV_KEY]: '' }
  await expect(cli.readReceiverSecret(new FakeTty(), env)).rejects.toThrow(/^receiver_unavailable$/)
  expect(Object.keys(env)).not.toContain(ENV_KEY)
})

// --help只能回0，不得preflight、讀密碼、claim或建立runtime。
it('prints fixed help without side effects', async () => {
  const cli = await api()
  const output = spyOutput()
  const fixture = entry()
  expect(await cli.receiverMain(['--help'], fixture.ports)).toBe(0)
  expect(fixture.order).toEqual([])
  expect(output.log).toHaveBeenCalledTimes(1)
  expect(String(output.log.mock.calls[0]?.[0])).toContain('--directory')
  expect(output.error).not.toHaveBeenCalled()
})

// 不精確的argv一律拒絕，不能猜路徑或接受額外參數。
it.each([
  { args: [] },
  { args: ['run'] },
  { args: ['run', '--directory'] },
  { args: ['run', '--directory', '/tmp/opencode/public-run', 'extra'] },
  { args: ['--help', 'extra'] },
  { args: ['--directory', '/tmp/opencode/public-run'] },
])('rejects invalid arguments: $args', async ({ args }) => {
  const cli = await api()
  const fixture = entry()
  expect(await cli.receiverMain(args, fixture.ports)).toBe(2)
  expect(fixture.order).toEqual([])
})

// 正常順序必須是preflight→secret→claim→run；claim前不得建立network。
it('runs preflight, secret, claim and runtime in order', async () => {
  const cli = await api()
  const order: string[] = []
  const tty = new FakeTty(order)
  tty.chunks.push(new TextEncoder().encode(PASSWORD_TEXT + '\n'))
  const fixture = entry({ order, tty })
  const output = spyOutput()
  expect(
    await cli.receiverMain(['run', '--directory', '/tmp/opencode/public-run'], fixture.ports),
  ).toBe(0)
  expect(order).toEqual(['preflight', 'secret', 'claim', 'run'])
  expect(tty.raw).toEqual([true, false])
  expect(fixture.password()).not.toBeNull()
  expect(Array.from(fixture.password()!)).toEqual(new Array(PASSWORD_TEXT.length).fill(0))
  expect(String(output.log.mock.calls[0]?.[0])).toContain('receiver_match')
  expect(output.error).not.toHaveBeenCalled()
})

// 三個固定code必須對應0／1／2，不得把mismatch或unavailable都當成功。
it.each([
  ['receiver_match', 0],
  ['receiver_mismatch', 1],
  ['receiver_unavailable', 2],
] as const)('maps %s to exit %i', async (code, expected) => {
  const cli = await api()
  const base = receiverResult()
  const result: ReceiverResult =
    code === 'receiver_match'
      ? base
      : code === 'receiver_mismatch'
        ? { ...base, textExact: false, sequenceValid: false, code }
        : { ...base, unavailable: true, code }
  const fixture = entry({ result, env: { [ENV_KEY]: PASSWORD_TEXT } })
  spyOutput()
  expect(
    await cli.receiverMain(['run', '--directory', '/tmp/opencode/public-run'], fixture.ports),
  ).toBe(expected)
})

// preflight、secret或claim失敗都不得呼叫後續階段。
it.each(['preflight', 'secret', 'claim'])('stops before runtime when %s fails', async (stage) => {
  const cli = await api()
  const order: string[] = []
  const tty = new FakeTty()
  if (stage === 'secret') tty.chunks.push(new TextEncoder().encode('\n'))
  const fixture = entry({
    order,
    tty,
    preflightError: stage === 'preflight',
    claimError: stage === 'claim',
  })
  spyOutput()
  expect(
    await cli.receiverMain(['run', '--directory', '/tmp/opencode/public-run'], fixture.ports),
  ).toBe(2)
  expect(order).not.toContain('run')
})

// runtime丟出任何原生錯誤都只能回固定unavailable，不得輸出例外原文。
it('masks a runtime exception and prints only safe codes', async () => {
  const cli = await api()
  const fixture = entry({ runError: true })
  const output = spyOutput()
  expect(
    await cli.receiverMain(['run', '--directory', '/tmp/opencode/public-run'], fixture.ports),
  ).toBe(2)
  const printed = [...output.log.mock.calls, ...output.error.mock.calls].map((call) =>
    String(call[0]),
  )
  expect(printed.join('\n')).not.toContain('public_failure')
  expect(printed.join('\n')).toContain('receiver_unavailable')
})

// 終端輸出不得含runId、requestId、peer ID、endpoint或密碼。
it('does not print identifiers, endpoints or secrets', async () => {
  const cli = await api()
  const fixture = entry({ env: { [ENV_KEY]: PASSWORD_TEXT } })
  const output = spyOutput()
  await cli.receiverMain(['run', '--directory', '/tmp/opencode/public-run'], fixture.ports)
  const printed = [...output.log.mock.calls, ...output.error.mock.calls]
    .map((call) => String(call[0]))
    .join('\n')
  for (const value of [
    binding().runId,
    binding().requestId,
    binding().peerId,
    endpoints().hbbsUdp.host,
    endpoints().hbbsTcp.host,
    endpoints().hbbrTcp.host,
    PASSWORD_TEXT,
  ]) {
    expect(printed).not.toContain(value)
  }
})

// optional診斷不改exit，只多一個完整且不含秘密的strict marker。
it('prints one bounded diagnostic after the unchanged result', async () => {
  const cli = await api()
  const f = entry({ env: { [ENV_KEY]: PASSWORD_TEXT } })
  const d = createReceiverDiagnostic()
  d.fail('register_pk', 'registration_rejected')
  const ports = { ...f.ports, runtime: { ...f.runtime, diagnostic: () => d.snapshot() } }
  const output = spyOutput()
  expect(await cli.receiverMain(['run', '--directory', '/tmp/opencode/public-run'], ports)).toBe(0)
  const lines = output.log.mock.calls.map((call) => String(call[0]))
  expect(lines.filter((line) => line.startsWith('receiver_diagnostic,'))).toHaveLength(1)
  expect(parseReceiverDiagnostic(lines.join('\n') + '\n')).toMatchObject({
    phase: 'register_pk',
    reason: 'registration_rejected',
  })
  expect(lines.join('\n')).not.toContain(PASSWORD_TEXT)
  expect(lines[0]).toContain('receiver_result,code=receiver_match')
})

// 診斷自身失敗不能更改已決定的exit或回顯例外。
it('does not change the result when diagnostic collection or printing throws', async () => {
  const cli = await api()
  for (const mode of ['collect', 'print']) {
    let attempted = false
    const f = entry({ env: { [ENV_KEY]: PASSWORD_TEXT } })
    const d = createReceiverDiagnostic()
    d.complete()
    const output = spyOutput()
    const ports = {
      ...f.ports,
      runtime: {
        ...f.runtime,
        diagnostic() {
          attempted = true
          if (mode === 'collect') throw new Error('PUBLIC_SECRET_SENTINEL')
          return d.snapshot()
        },
      },
    }
    output.log.mockImplementation((line: unknown) => {
      if (mode === 'print' && String(line).startsWith('receiver_diagnostic,'))
        throw new Error('PUBLIC_SECRET_SENTINEL')
    })
    expect(await cli.receiverMain(['run', '--directory', '/tmp/opencode/public-run'], ports)).toBe(
      0,
    )
    expect(attempted).toBe(true)
    expect(output.error).not.toHaveBeenCalled()
  }
})
