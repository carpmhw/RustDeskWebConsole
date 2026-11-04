import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { setTimeout, clearTimeout } from 'node:timers'

const frontend = fileURLToPath(new URL('../../', import.meta.url))

// Node owner只持有自己spawn的Playwright CLI；以SIGINT請框架跑完fixture teardown。
export function runReconnectPlaywright(configuration) {
  const child = spawn(
    process.execPath,
    [
      resolve(frontend, 'node_modules/@playwright/test/cli.js'),
      'test',
      '--config',
      configuration,
      '--max-failures=1',
    ],
    {
      cwd: frontend,
      env: process.env,
      stdio: 'inherit',
    },
  )
  return new Promise((done) => {
    let interrupted = false,
      forced = false,
      timer
    // Pinned Playwright CLI有SIGINT watcher，沒有等價的SIGTERM graceful watcher。
    const stop = () => {
      if (interrupted || child.exitCode !== null || child.signalCode !== null) return
      interrupted = true
      child.kill('SIGINT')
      // 只對自有尚未退出的ChildProcess強制停止，超時不宣稱正常清理。
      timer = setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) return
        forced = true
        console.error('Reconnect worker cleanup failed')
        child.kill('SIGKILL')
      }, 5000)
    }
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
    // 無論spawn失敗或close都移除本owner listener，不污染後續invocation。
    const cleanup = () => {
      clearTimeout(timer)
      process.off('SIGTERM', stop)
      process.off('SIGINT', stop)
    }
    child.once('error', () => {
      cleanup()
      console.error('Reconnect worker failed')
      done(1)
    })
    child.once('close', (code) => {
      cleanup()
      done(forced ? 1 : interrupted ? 130 : (code ?? 1))
    })
  })
}

// Runtime只接受四個精確suite名稱，測試factory的臨時config不能由CLI指定。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = process.argv[2]
  if (
    process.argv.length !== 3 ||
    ![
      'playwright.reconnect.config.ts',
      'playwright.reconnect-security.config.ts',
      'playwright.reconnect-longrun.config.ts',
      'playwright.reconnect-ingress.config.ts',
    ].includes(config)
  ) {
    console.error('Reconnect suite unavailable')
    process.exitCode = 2
  } else process.exitCode = await runReconnectPlaywright(resolve(frontend, 'e2e/config', config))
}
