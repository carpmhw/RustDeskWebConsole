import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const runner = fileURLToPath(new URL('../scripts/test-subpaths.sh', import.meta.url))

// 只替換慢速外部命令，真shell控制流程／環境與參數仍由正式runner決定。
function run(matrix?: string): { status: number | null; calls: string[] } {
  const directory = mkdtempSync('/tmp/opencode/rdweb-ui-runner-')
  const log = join(directory, 'public-commands.log')
  try {
    for (const name of ['docker', 'corepack']) {
      // 只記固定命令參數與公開prefix，不輸出或保存程序環境中的憑證。
      writeFileSync(
        join(directory, name),
        `#!/bin/sh\nprintf '%s|%s|%s|%s\\n' '${name}' "\${APP_BASE_PATH:-unset}" "\${PREFIX_MODE:-unset}" "$*" >> "$PUBLIC_RUNNER_LOG"\n`,
      )
      chmodSync(join(directory, name), 0o700)
    }
    const result = spawnSync(
      'sh',
      [runner, 'e2e/management/workspace-ui.spec.ts', '--grep', 'header keeps'],
      {
        env: {
          ...process.env,
          PATH: directory + ':' + process.env.PATH,
          SECRET_KEY: '',
          VAULT_KEY: '',
          RDWEB_E2E_MATRIX: matrix,
          PUBLIC_RUNNER_LOG: log,
        },
        stdio: 'pipe',
      },
    )
    return {
      status: result.status,
      calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
    }
  } finally {
    // 僅清理由本案例mkdtemp建立的專用目錄，不碰repo或其他工作區。
    rmSync(directory, { recursive: true, force: true })
  }
}

// 不合法模式不得先啟Docker、測試或執行cleanup。
test('management runner rejects unknown matrix before external commands', () => {
  const result = run('not-a-mode')
  expect(result.status).toBe(2)
  expect(result.calls).toEqual([])
})

// 精選應只跑一組深路徑保留代理，並完整轉交案例參數。
test('management runner selects one deep path and forwards test arguments', () => {
  const result = run('ui-targeted')
  expect(result.status).toBe(0)
  expect(result.calls.filter((line) => line.startsWith('corepack|'))).toEqual([
    'corepack|/a/b/c|preserve|pnpm --dir frontend e2e e2e/management/workspace-ui.spec.ts --grep header keeps',
  ])
  expect(
    result.calls.filter((line) =>
      line.includes('compose -f deploy/dev/docker-compose.spikes.yml down'),
    ).length,
  ).toBe(1)
})

// 未指定模式時原六組完整矩陣不可因新增精選而被縮減。
test('management runner preserves the default six path combinations', () => {
  const result = run()
  expect(result.status).toBe(0)
  expect(
    result.calls
      .filter((line) => line.startsWith('corepack|'))
      .map((line) => line.split('|').slice(1, 3).join('|')),
  ).toEqual([
    '/|preserve',
    '/|strip',
    '/rdweb|preserve',
    '/rdweb|strip',
    '/a/b/c|preserve',
    '/a/b/c|strip',
  ])
})
