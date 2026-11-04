import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { get, createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createIngressIo } from '../real/reconnect-ingress-io'

// 真child僅執行自有公開executable；任何情況都不fallback至Docker。
it('fixed_argv_only output_limit_4096 and abort_reaps_child', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ingress-io-')),
    children = new Set<ChildProcess>(),
    calls: string[][] = []
  const executable = dir + '/docker'
  writeFileSync(
    executable,
    '#!/usr/bin/env node\nif(process.argv.includes("restart")) process.stdout.write("ok"); else if(process.argv.includes("inspect")) process.stderr.write("x".repeat(4097)); else setInterval(()=>{},1000)\n',
    { mode: 0o700 },
  )
  const port = ((command: string, args: readonly string[] = [], options: SpawnOptions = {}) => {
    expect(command).toBe('docker')
    calls.push([...(args ?? [])])
    const child = spawn(executable, args, options)
    children.add(child)
    child.once('close', /* 真close才能扣資源。 */ () => children.delete(child))
    return child
  }) as typeof spawn
  const io = createIngressIo({
    spawn: port,
    get,
    now: /* 真deadline以Node時鐘計。 */ () => performance.now(),
  })
  const abort = new AbortController(),
    id = 'a'.repeat(64)
  try {
    expect(await io.run('restart', id, performance.now() + 500, abort.signal)).toBe('ok')
    expect(calls[0]).toEqual(['container', 'restart', '--signal', 'SIGKILL', '--timeout', '0', id])
    await expect(io.run('inspect', id, performance.now() + 500, abort.signal)).rejects.toThrow(
      'ingress_control_failed',
    )
    const pending = io.run('discover', null, performance.now() + 500, abort.signal)
    const rejected = expect(pending).rejects.toThrow('ingress_cancelled')
    await sleep(30)
    abort.abort()
    await rejected
    expect(calls[2]!.slice(0, 5)).toEqual([
      'compose',
      '--env-file',
      '/dev/null',
      '--project-name',
      'rdweb-m0',
    ])
    expect(calls[2]!.slice(-4)).toEqual(['ps', '--all', '--quiet', 'ingress'])
  } finally {
    await io.close()
    expect(children.size).toBe(0)
    rmSync(dir, { recursive: true })
  }
})

// close不能留下重試sleep；否則已關owner仍可能在背景繼續排程。
it('close cancels ready retry sleep before returning', async () => {
  let called!: () => void
  const received = new Promise<void>(
    /* 等真正第一個HTTP回應，不依固定startup延時。 */ (resolve) => {
      called = resolve
    },
  )
  const server = createServer(
    /* 永遠未就緒，必須靠close終止。 */ (_req, res) => {
      res.writeHead(503)
      res.end()
      called()
    },
  )
  await new Promise<void>(
    /* 公開server只綁loopback。 */ (resolve) => server.listen(0, '127.0.0.1', resolve),
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('public_fixture_failed')
  const http = ((_url: string, callback: Parameters<typeof get>[1]) =>
    get(`http://127.0.0.1:${address.port}/`, callback)) as typeof get
  const io = createIngressIo({
    spawn,
    get: http,
    now: /* 固定Node時鐘。 */ () => performance.now(),
  })
  const pending = io.ready(performance.now() + 500, new AbortController().signal)
  const stopped = pending.then(
    /* 正常返回不能當取消。 */ () => false,
    /* 只接受固定取消。 */ (error: Error) => error.message === 'ingress_cancelled',
  )
  try {
    await received
    await sleep(10)
    await io.close()
    expect(await Promise.race([stopped, sleep(30, false)])).toBe(true)
  } finally {
    await io.close()
    await pending.catch(/* 原promise已判失敗，收尾不印原文。 */ () => {})
    await new Promise<void>(/* 釋放自有endpoint。 */ (resolve) => server.close(() => resolve()))
  }
})

// 真公開HTTP驗重試／redirect／429，成功首頁不能由ready以外的捷徑產生。
it('ready_200_only redirect_never_followed ready_429_stops and deadline_not_renewed', async () => {
  let status = 503,
    requests = 0
  const server = createServer(
    /* 公開body丟棄，不使用認證。 */ (_req, res) => {
      requests++
      res.writeHead(status, { Location: '/private' })
      res.end('public')
    },
  )
  await new Promise<void>(
    /* 只綁OS分配loopback。 */ (resolve) => server.listen(0, '127.0.0.1', resolve),
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('public_fixture_failed')
  const http = ((url: string | URL, callback: Parameters<typeof get>[1]) => {
    expect(String(url)).toBe('http://127.0.0.1:18080/rdweb/')
    return get(`http://127.0.0.1:${address.port}/rdweb/`, callback)
  }) as typeof get
  const io = createIngressIo({
      spawn,
      get: http,
      now: /* 不用browser fake clock。 */ () => performance.now(),
    }),
    abort = new AbortController()
  try {
    await expect(io.ready(performance.now() + 220, abort.signal)).rejects.toThrow(
      'ingress_control_failed',
    )
    status = 200
    expect(await io.ready(performance.now() + 500, abort.signal)).toBeGreaterThan(0)
    for (const code of [302, 429]) {
      status = code
      const before = requests
      await expect(io.ready(performance.now() + 500, abort.signal)).rejects.toThrow(
        'ingress_control_failed',
      )
      expect(requests - before).toBe(1)
    }
    status = 503
    const pending = io.ready(performance.now() + 500, abort.signal),
      rejected = expect(pending).rejects.toThrow('ingress_cancelled')
    await sleep(10)
    abort.abort()
    await rejected
    const before = requests
    await sleep(120)
    expect(requests).toBe(before)
  } finally {
    await io.close()
    await new Promise<void>(/* 自有server真close。 */ (resolve) => server.close(() => resolve()))
  }
})
