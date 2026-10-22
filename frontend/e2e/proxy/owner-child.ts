import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { ProxySummary } from '../real/reconnect-proxy-types.ts'

// 只啟自有Playwright child及固定公開case，環境不承接操作者秘密。
export async function runOwnerChild(
  mode: 'setup' | 'timeout' | 'signal' | 'runner-signal',
  upstreamPort: number,
) {
  const directory = mkdtempSync(join(tmpdir(), 'reconnect-owner-'))
  const root = fileURLToPath(new URL('../../..', import.meta.url))
  const modulePath = (name: string): string => JSON.stringify(join(root, 'frontend', name))
  const stopping = mode === 'signal' || mode === 'runner-signal'
  writeFileSync(
    join(directory, 'playwright.config.mjs'),
    `export default ${JSON.stringify({
      testDir: directory,
      testMatch: 'public.spec.ts',
      workers: 1,
      retries: 0,
      timeout: stopping ? 15000 : 500,
      reporter: 'line',
      outputDir: join(directory, 'artifacts'),
      use: { trace: 'off', screenshot: 'off', video: 'off', acceptDownloads: false },
    })}`,
  )
  writeFileSync(
    join(directory, 'public.spec.ts'),
    `
import { createReconnectTest } from ${modulePath('e2e/real/reconnect-fixtures.ts')};
import { createLoopbackProxy } from ${modulePath('e2e/real/reconnect-proxy.ts')};
import { rawTunnel, PUBLIC_TARGET } from ${modulePath('e2e/proxy/public-fixtures.ts')};
// 自有公開proxy完成後才輸出安全summary，不記任何原生request。
const test=createReconnectTest(async()=>{
  const proxy=await createLoopbackProxy({listenPort:0,upstreamPort:${upstreamPort}});
  const close=proxy.close; let reported=false;
  console.info('public-owner-port='+proxy.port);
  return {...proxy,close:async()=>{await close();if(!reported){reported=true;console.info('public-owner-closed='+JSON.stringify(proxy.summary()));}}};
});
${mode === 'setup' ? "test.beforeEach(()=>{throw new Error('public_setup_failure')});" : ''}
// timeout／signal時保留真公開pair及一個waiter，不能只驗空listener。
test('public owner child',async({reconnectCase,reconnectProxy})=>{
  const lease=reconnectCase.begin(PUBLIC_TARGET);
  await rawTunnel(reconnectProxy.port);
  await lease.nextAccepted(new AbortController().signal);
  console.info('public-owner-ready');
  await lease.nextAccepted(new AbortController().signal);
});`,
  )
  writeFileSync(
    join(directory, 'launcher.mjs'),
    `import { runReconnectPlaywright } from ${JSON.stringify(join(root, 'frontend/e2e/scripts/run-reconnect-playwright.mjs'))}; process.exitCode=await runReconnectPlaywright(${JSON.stringify(join(directory, 'playwright.config.mjs'))});`,
  )
  const environment = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PLAYWRIGHT_NO_COPY_PROMPT: '1',
  }
  if (mode === 'runner-signal') {
    // 真shell搭配隔離替身，只把PW子程序導向這個公開config，不啟Docker。
    writeFileSync(
      join(directory, 'docker'),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *' ps '* ]]; then
  if [[ "$*" == *rustdesk-test.yml* ]]; then printf 'hbbs\\nhbbr\\ntarget\\n'; fi
elif [[ "$*" == *' exec '* ]]; then echo public-fixture
elif [[ "$*" == *' down' ]]; then echo public-owned-console-down
fi
`,
      { mode: 0o700 },
    )
    writeFileSync(
      join(directory, 'corepack'),
      '#!/usr/bin/env bash\necho public-unexpected-corepack\nexit 2\n',
      { mode: 0o700 },
    )
    writeFileSync(
      join(directory, 'node'),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == -p ]]; then echo public-fixture; exit 0; fi
if [[ "\${1:-}" == frontend/e2e/scripts/run-reconnect-playwright.mjs ]]; then exec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(directory, 'launcher.mjs'))}; fi
if [[ "\${1:-}" == frontend/e2e/scripts/reconnect-preflight.mjs || "\${1:-}" == frontend/e2e/scripts/wait-rustdesk-online.mjs || "\${1:-}" == frontend/e2e/scripts/test-rustdesk-clock.mjs || "\${1:-}" == frontend/e2e/scripts/verify-input-fixture.mjs ]]; then exit 0; fi
exec ${JSON.stringify(process.execPath)} "$@"
`,
      { mode: 0o700 },
    )
  }
  const child =
    mode === 'runner-signal'
      ? spawn('bash', ['frontend/e2e/scripts/test-m3b3-reconnect.sh'], {
          cwd: root,
          env: {
            ...environment,
            PATH: directory + ':' + process.env.PATH,
            RDWEB_INPUT_PLATFORMS: 'linux',
            RDWEB_B3_BASES: '/',
            RDWEB_B3_MODES: 'preserve',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(process.execPath, [join(directory, 'launcher.mjs')], {
          cwd: join(root, 'frontend'),
          env: environment,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
  let output = '',
    signalled = false,
    killed = false
  const result = new Promise<{
    code: number | null
    port: number | null
    summary?: ProxySummary
    signalled: boolean
    killed: boolean
    output: string
  }>((resolve, reject) => {
    // 只有自己spawn的child超時才可kill，不掃port或程序樹。
    const guard = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, 12000)
    // 輸出只包含固定公開fixture及安全摘要，仍限制總大小。
    const receive = (part: Buffer): void => {
      output += part.toString()
      if (output.length > 262144) {
        killed = true
        child.kill('SIGKILL')
      }
      if (stopping && !signalled && output.includes('public-owner-ready')) {
        signalled = true
        child.kill('SIGTERM')
      }
    }
    child.stdout.on('data', receive)
    child.stderr.on('data', receive)
    // 出錯只回固定分類，不攜帶spawn options。
    child.once('error', () => {
      clearTimeout(guard)
      reject(new Error('public_owner_child_failed'))
    })
    // Native child退出後才核對真port與summary。
    child.once('close', (code) => {
      clearTimeout(guard)
      const port = output.match(/public-owner-port=(\d+)/)
      const match = output.match(/public-owner-closed=(\{[^\r\n]+\})/)
      let summary: ProxySummary | undefined
      if (match) summary = JSON.parse(match[1]) as ProxySummary
      resolve({ code, port: port ? Number(port[1]) : null, summary, signalled, killed, output })
    })
  })
  try {
    return await result
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
