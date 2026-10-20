import type { IngressIo } from './reconnect-ingress-types'
import { spawn } from 'node:child_process'
import { get } from 'node:http'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
export interface IngressIoPorts {
  spawn: typeof import('node:child_process').spawn
  get: typeof import('node:http').get
  now: () => number
}
const fields = {
  id: '.Id',
  image: '.Image',
  imageRef: '.Config.Image',
  project: 'index .Config.Labels "com.docker.compose.project"',
  service: 'index .Config.Labels "com.docker.compose.service"',
  owner: 'index .Config.Labels "rdweb.test.reconnect-ingress-owner"',
  startedAt: '.State.StartedAt',
  running: '.State.Running',
}
const template =
  '{' +
  Object.entries(fields)
    .map(
      /* 僅投影八個固定欄，值由Docker JSON編碼。 */ ([key, field]) =>
        `"${key}":{{json (${field})}}`,
    )
    .join(',') +
  '}'
const compose = [
  'compose',
  '--env-file',
  '/dev/null',
  '--project-name',
  'rdweb-m0',
  ...['spikes', 'browser-login-test', 'reconnect-test'].flatMap(
    /* 不接受外部Compose路徑。 */ (name) => [
      '-f',
      fileURLToPath(new URL(`../../deploy/dev/docker-compose.${name}.yml`, import.meta.url)),
    ],
  ),
]
// 有界I/O只接受固定命令，真子程序與HTTP各有明確owner。
export function createIngressIo(ports: IngressIoPorts): IngressIo {
  let closed = false,
    closing: Promise<void> | undefined
  const owner = new AbortController()
  const stops = new Set<() => void>(),
    pending = new Set<Promise<void>>()
  // 每次只使用controller傳入的絕對期限，不能更新窗口。
  function check(until: number, signal: AbortSignal): number {
    if (closed || signal.aborted) throw new Error('ingress_cancelled')
    const ms = until - ports.now()
    if (!Number.isFinite(ms) || ms <= 0 || ms > 5000) throw new Error('ingress_control_failed')
    return ms
  }
  return {
    run: /* stdout只留有界結果，stderr只計量並丟棄。 */ async (kind, id, until, signal) => {
      signal = AbortSignal.any([signal, owner.signal])
      const ms = check(until, signal)
      if (
        !['discover', 'inspect', 'restart'].includes(kind) ||
        (kind === 'discover' ? id !== null : !/^[a-f0-9]{64}$/.test(id ?? ''))
      )
        throw new Error('ingress_control_failed')
      const args =
        kind === 'discover'
          ? [...compose, 'ps', '--all', '--quiet', 'ingress']
          : kind === 'inspect'
            ? ['container', 'inspect', '--format', template, id!]
            : ['container', 'restart', '--signal', 'SIGKILL', '--timeout', '0', id!]
      return new Promise<string>((resolve, reject) => {
        let bytes = 0,
          output = '',
          error = '',
          child: ReturnType<typeof spawn>
        try {
          child = ports.spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
        } catch {
          reject(new Error('ingress_control_failed'))
          return
        }
        let done!: () => void
        const drained = new Promise<void>(
          /* 記真正close，不以kill返回代替。 */ (resolve) => {
            done = resolve
          },
        )
        pending.add(drained)
        const stop = /* 只終止自有CLI，不聲稱撤銷daemon命令。 */ (): void => {
          error ||= signal.aborted || closed ? 'ingress_cancelled' : 'ingress_control_failed'
          child.kill('SIGKILL')
        }
        const timer = setTimeout(stop, ms)
        stops.add(stop)
        signal.addEventListener('abort', stop, { once: true })
        // 兩個輸出stream共享硬上限，超額立即終止。
        const data = (value: Buffer, stdout: boolean): void => {
          bytes += value.length
          if (bytes > 4096) {
            error = 'ingress_control_failed'
            stop()
          } else if (stdout) output += value.toString('utf8')
        }
        child.stdout?.on(
          'data',
          /* 只保存合法容量的stdout。 */ (value: Buffer) => data(value, true),
        )
        child.stderr?.on('data', /* stderr不保存原文。 */ (value: Buffer) => data(value, false))
        child.once(
          'error',
          /* spawn失敗也使用相同安全分類。 */ () => {
            error = 'ingress_control_failed'
          },
        )
        child.once(
          'close',
          /* 真close後才完成並釋放所有guard。 */ (code) => {
            clearTimeout(timer)
            stops.delete(stop)
            signal.removeEventListener('abort', stop)
            pending.delete(drained)
            done()
            if (error || code !== 0 || ports.now() >= until || signal.aborted || closed)
              reject(
                new Error(
                  error ||
                    (signal.aborted || closed ? 'ingress_cancelled' : 'ingress_control_failed'),
                ),
              )
            else resolve(output)
          },
        )
        if (signal.aborted || closed) stop()
      })
    },
    ready: /* 單request及整段期限皆有界，不重導向、不帶認證。 */ async (until, signal) => {
      signal = AbortSignal.any([signal, owner.signal])
      for (;;) {
        const ms = Math.min(500, check(until, signal))
        const status = await new Promise<number>((resolve, reject) => {
          let finished = false,
            request: ReturnType<typeof get>,
            done!: () => void
          const drained = new Promise<void>(
            /* HTTP也等真正close。 */ (resolve) => {
              done = resolve
            },
          )
          // 所有完成分支共用一次性guard，不接受晚回。
          const finish = (status: number, cancelled = false): void => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            stops.delete(stop)
            signal.removeEventListener('abort', stop)
            request?.destroy()
            if (cancelled) reject(new Error('ingress_cancelled'))
            else resolve(status)
          }
          const stop = /* close或外部取消均作廢本request。 */ (): void => finish(0, true)
          const timer = setTimeout(/* 單request不超過剩餘窗口。 */ () => finish(0), ms)
          try {
            request = ports.get(
              'http://127.0.0.1:18080/rdweb/',
              /* 不保存body或headers。 */ (response) => {
                response.resume()
                response.once(
                  'end',
                  /* 丟棄後才判公開status。 */ () => finish(response.statusCode ?? 0),
                )
                response.once('error', /* 斷流不能當200。 */ () => finish(0))
              },
            )
          } catch {
            finish(0)
            done()
            return
          }
          pending.add(drained)
          stops.add(stop)
          request.once(
            'close',
            /* 收尾帳只在close扣除。 */ () => {
              pending.delete(drained)
              done()
            },
          )
          request.once('error', /* 原生錯誤內容不向外傳。 */ () => finish(0))
          signal.addEventListener('abort', stop, { once: true })
          if (signal.aborted || closed) stop()
        })
        check(until, signal)
        if (status === 200) return ports.now()
        if (status >= 300 && status < 500) throw new Error('ingress_control_failed')
        try {
          await sleep(Math.min(100, check(until, signal)), undefined, { signal })
        } catch {
          throw new Error('ingress_cancelled')
        }
      }
    },
    close: /* 先失效，收尾最多一秒且失敗不可吞掉。 */ () => {
      if (closing) return closing
      closed = true
      owner.abort()
      for (const stop of stops) stop()
      closing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            Promise.all([...pending]),
            new Promise<never>(
              /* 卡住的自有資源必須回報。 */ (_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('ingress_cleanup_failed')), 1000)
              },
            ),
          ])
        } finally {
          clearTimeout(timer)
        }
      })()
      return closing
    },
  }
}
// Runtime入口沒有外部ports或目的地覆寫。
export function createRuntimeIngressIo(): IngressIo {
  return createIngressIo({ spawn, get, now: /* 固定Node時計。 */ () => performance.now() })
}
