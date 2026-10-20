import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 純環境白名單，不展開任何值或承接其他suite的診斷副作用。
export function assertReconnectEnvironment(env) {
  if (
    (env.RDWEB_DEV_PORT !== undefined && !['18080', '18081'].includes(env.RDWEB_DEV_PORT)) ||
    (env.RDWEB_E2E_COMPOSE_OVERRIDE !== undefined &&
      ![
        'deploy/dev/docker-compose.browser-login-test.yml',
        'deploy/dev/docker-compose.reconnect-test.yml',
      ].includes(env.RDWEB_E2E_COMPOSE_OVERRIDE))
  ) {
    throw new Error('reconnect_preflight_failed')
  }
  for (const name of [
    'RDWEB_WINDOWS_HOST_OBSERVE',
    'RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG',
    'RDWEB_WINDOWS_TEXT_PROBE',
  ]) {
    if (env[name] !== undefined && env[name] !== '0') throw new Error('reconnect_preflight_failed')
  }
}

// 只臨時bind固定loopback，不掃描或關閉占用者；部分成功亦釋放自己資源。
export async function checkReconnectPorts(ports = [18080, 18081]) {
  if (
    !ports.length ||
    new Set(ports).size !== ports.length ||
    ports.some(
      /* 公開單元可傳自己的OS port，CLI不接受外部port參數。 */ (port) =>
        !Number.isInteger(port) || port < 1 || port > 65535,
    )
  )
    throw new Error('reconnect_preflight_failed')
  const owned = []
  try {
    for (const port of ports) {
      const server = createServer()
      await new Promise((done, reject) => {
        // 不回報native error中的地址／其他原文。
        server.once('error', () => reject(new Error('reconnect_preflight_failed')))
        server.listen(port, '127.0.0.1', done)
      })
      owned.push(server)
    }
  } finally {
    await Promise.all(
      owned.map(
        /* 只清真正bind成功的owner。 */ (server) => new Promise((done) => server.close(done)),
      ),
    )
  }
}

// Runtime CLI只有這個固定檢查入口，沒有自訂目的地或敏感command-line參數。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error()
    assertReconnectEnvironment(process.env)
    await checkReconnectPorts()
  } catch {
    console.error('Reconnect preflight failed')
    process.exitCode = 2
  }
}
