import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const prodDir = resolve('deploy/prod')

// 建立本測試擁有的暫存根目錄，結束後一律清除。
function fixture(action) {
  const root = mkdtempSync(join(tmpdir(), 'rdweb-deploy-'))
  try {
    return action(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// 於 bin 目錄寫入可執行替身；替身把呼叫參數逐行附加到 calls.log。
function stub(root, name, body) {
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  const path = join(bin, name)
  writeFileSync(
    path,
    `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> "${join(root, 'calls.log')}"\n${body}\n`,
  )
  chmodSync(path, 0o755)
}

// 讀取替身呼叫紀錄；尚無紀錄時回空陣列。
function calls(root) {
  const path = join(root, 'calls.log')
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n') : []
}

// 以替身優先的 PATH 執行 deploy/prod 腳本。
function runScript(root, script, args, { input = '', env = {} } = {}) {
  const result = spawnSync('sh', [join(prodDir, script), ...args], {
    input,
    encoding: 'utf8',
    env: { PATH: `${join(root, 'bin')}:${process.env.PATH}`, ...env },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

// 模擬 root 執行 gen-secrets.sh 所需的 id 與 chown 替身。
function rootStubs(root, uid = '0') {
  stub(root, 'id', `echo ${uid}`)
  stub(root, 'chown', 'exit 0')
}

// 非 root 執行時拒絕且不建立任何檔案。
test('gen-secrets refuses non-root', () => {
  fixture((root) => {
    rootStubs(root, '1000')
    const dir = join(root, 'secrets')
    const result = runScript(root, 'gen-secrets.sh', ['--generate-password', dir])
    assert.equal(result.status, 2)
    assert.equal(existsSync(dir), false)
  })
})

// 產生兩把獨立 32 bytes 金鑰與密碼，權限 0400／目錄 0700，擁有者交給容器 app uid，輸出不含金鑰。
test('gen-secrets creates private files owned by app uid without printing keys', () => {
  fixture((root) => {
    rootStubs(root)
    const dir = join(root, 'secrets')
    const result = runScript(root, 'gen-secrets.sh', ['--generate-password', dir])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(statSync(dir).mode & 0o777, 0o700)
    const keys = ['secret_key', 'vault_key'].map((name) => {
      const path = join(dir, name)
      assert.equal(statSync(path).mode & 0o777, 0o400, name)
      const value = readFileSync(path, 'utf8')
      assert.equal(Buffer.from(value.trim(), 'base64').length, 32, name)
      assert.ok(!result.stdout.includes(value.trim()) && !result.stderr.includes(value.trim()))
      return value
    })
    assert.notEqual(keys[0], keys[1])
    const password = readFileSync(join(dir, 'bootstrap_admin_password'), 'utf8')
    assert.ok(password.length >= 12)
    assert.equal(statSync(join(dir, 'bootstrap_admin_password')).mode & 0o777, 0o400)
    for (const name of ['secret_key', 'vault_key', 'bootstrap_admin_password'])
      assert.ok(calls(root).includes(`chown 1654:1654 ${join(dir, name)}`), name)
    assert.deepEqual(
      readFileSync(join(dir, 'secret_key'), 'utf8').includes('\n'),
      false,
      '金鑰檔不含換行',
    )
  })
})

// 任一目標檔已存在時拒絕，既有檔案內容與修改時間不變。
test('gen-secrets refuses to overwrite existing secrets', () => {
  fixture((root) => {
    rootStubs(root)
    const dir = join(root, 'secrets')
    assert.equal(runScript(root, 'gen-secrets.sh', ['--generate-password', dir]).status, 0)
    const before = ['secret_key', 'vault_key', 'bootstrap_admin_password'].map((name) => {
      const path = join(dir, name)
      return [readFileSync(path, 'utf8'), statSync(path).mtimeMs]
    })
    const result = runScript(root, 'gen-secrets.sh', ['--generate-password', dir])
    assert.equal(result.status, 2)
    const after = ['secret_key', 'vault_key', 'bootstrap_admin_password'].map((name) => {
      const path = join(dir, name)
      return [readFileSync(path, 'utf8'), statSync(path).mtimeMs]
    })
    assert.deepEqual(after, before)
  })
})

// 互動輸入的密碼須兩次一致且至少 12 字元；失敗時不留下任何秘密檔。
test('gen-secrets validates typed password', () => {
  fixture((root) => {
    rootStubs(root)
    for (const input of ['short\nshort\n', 'long-enough-1\nlong-enough-2\n', '']) {
      const dir = join(root, `secrets-${calls(root).length}`)
      const result = runScript(root, 'gen-secrets.sh', [dir], { input })
      assert.equal(result.status, 2, JSON.stringify(input))
      assert.equal(existsSync(join(dir, 'secret_key')), false)
      assert.equal(existsSync(join(dir, 'bootstrap_admin_password')), false)
    }
    const dir = join(root, 'secrets-ok')
    const result = runScript(root, 'gen-secrets.sh', [dir], {
      input: 'typed-password-ok\ntyped-password-ok\n',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(join(dir, 'bootstrap_admin_password'), 'utf8'), 'typed-password-ok')
    assert.ok(!result.stdout.includes('typed-password-ok'))
  })
})

// 建立 docker／git 替身與設定檔；替身行為由環境變數控制，供維運腳本序列測試。
function opsFixture(root) {
  stub(
    root,
    'docker',
    `case "$*" in
  *" exec -T backend dotnet RdWeb.Api.dll backup "*) exit \${STUB_BACKUP_EXIT:-0} ;;
  *" cp backend:"*) eval "last=\\\${$#}"; : > "$last"; exit \${STUB_CP_EXIT:-0} ;;
  *" run "*" restore "*) exit \${STUB_RESTORE_EXIT:-0} ;;
  *" up -d"*) exit \${STUB_UP_EXIT:-0} ;;
esac`,
  )
  stub(
    root,
    'git',
    `case "$*" in
  *"status --porcelain"*) printf '%s' "\${STUB_GIT_DIRTY:-}" ;;
  *"rev-parse"*"refs/tags/"*) exit \${STUB_TAG_EXIT:-0} ;;
  *"describe"*) echo v0.9.0 ;;
esac`,
  )
  stub(root, 'chown', 'exit 0')
  const conf = join(root, 'rdweb.conf')
  writeFileSync(conf, 'APP_PUBLIC_URL=https://example.test/\n')
  return { RDWEB_CONF: conf }
}

// 只保留 docker／git 呼叫的子命令部分，方便比對順序。
function sequence(root) {
  return calls(root)
    .filter((line) => line.startsWith('docker ') || line.startsWith('git '))
    .map((line) => line.replace(/^docker compose -p rdweb --env-file \S+ -f \S+ /, 'compose '))
}

// backup 以 CLI 建立快照、複製到主機並設為 0600，最後清除容器內暫存。
test('backup.sh snapshots, copies out with 0600 and removes container copy', () => {
  fixture((root) => {
    const env = opsFixture(root)
    const out = join(root, 'backups')
    const result = runScript(root, 'backup.sh', [out], { env })
    assert.equal(result.status, 0, result.stderr)
    const steps = sequence(root)
    assert.match(
      steps[0],
      /^compose exec -T backend dotnet RdWeb\.Api\.dll backup \/app\/data\/backups\/rdweb-\d{8}T\d{6}Z-\d+\.db$/,
    )
    const name = steps[0].split('/').pop()
    assert.equal(steps[1], `compose cp backend:/app/data/backups/${name} ${join(out, name)}`)
    assert.equal(steps[2], `compose exec -T backend rm -f /app/data/backups/${name}`)
    assert.equal(statSync(join(out, name)).mode & 0o777, 0o600)
  })
})

// CLI 備份失敗時以非 0 結束，且主機不留下檔案。
test('backup.sh fails without leaving host file when CLI fails', () => {
  fixture((root) => {
    const env = { ...opsFixture(root), STUB_BACKUP_EXIT: '1' }
    const out = join(root, 'backups')
    const result = runScript(root, 'backup.sh', [out], { env })
    assert.notEqual(result.status, 0)
    assert.equal(
      sequence(root).some((step) => step.includes(' cp ')),
      false,
    )
    assert.equal(existsSync(out) ? readdirSync(out).length : 0, 0)
  })
})

// 未確認時不動任何服務。
test('restore.sh does nothing without confirmation', () => {
  fixture((root) => {
    const env = opsFixture(root)
    const file = join(root, 'a.db')
    writeFileSync(file, 'x')
    const result = runScript(root, 'restore.sh', [file], { env, input: 'no\n' })
    assert.equal(result.status, 1)
    assert.deepEqual(sequence(root), [])
  })
})

// 還原順序：先備份現況、停止、以唯讀掛載執行 restore、再啟動並等待健康。
test('restore.sh backs up, stops, restores read-only and starts again', () => {
  fixture((root) => {
    const env = { ...opsFixture(root), RDWEB_BACKUP_DIR: join(root, 'backups') }
    const file = join(root, 'a.db')
    writeFileSync(file, 'x')
    const result = runScript(root, 'restore.sh', ['--yes', file], { env })
    assert.equal(result.status, 0, result.stderr)
    const steps = sequence(root)
    assert.match(steps[0], /backup \/app\/data\/backups\//)
    const stop = steps.indexOf('compose stop')
    assert.ok(stop > 0)
    assert.match(
      steps[stop + 1],
      /^compose run --rm --no-deps -T -v \S+:\/restore\.db:ro backend restore \/restore\.db$/,
    )
    assert.equal(steps[stop + 2], 'compose up -d --wait --wait-timeout 120')
    assert.ok(calls(root).some((line) => /^chown 1654:1654 /.test(line)))
  })
})

// restore 回 3（備份較新於目前程式）時仍重新啟動原服務並以 3 結束。
test('restore.sh restarts services and exits 3 on newer schema', () => {
  fixture((root) => {
    const env = {
      ...opsFixture(root),
      STUB_RESTORE_EXIT: '3',
      RDWEB_BACKUP_DIR: join(root, 'backups'),
    }
    const file = join(root, 'a.db')
    writeFileSync(file, 'x')
    const result = runScript(root, 'restore.sh', ['--yes', file], { env })
    assert.equal(result.status, 3)
    assert.match(result.stderr, /較新/)
    assert.equal(sequence(root).at(-1), 'compose up -d --wait --wait-timeout 120')
  })
})

// 工作樹不乾淨或 tag 不存在時拒絕更新，且不備份、不切換版本。
test('update.sh refuses dirty tree and unknown tag', () => {
  fixture((root) => {
    const env = opsFixture(root)
    const dirty = runScript(root, 'update.sh', ['v1.0.0'], {
      env: { ...env, STUB_GIT_DIRTY: ' M file' },
    })
    assert.equal(dirty.status, 2)
    const unknown = runScript(root, 'update.sh', ['v9.9.9'], {
      env: { ...env, STUB_TAG_EXIT: '1' },
    })
    assert.equal(unknown.status, 2)
    assert.equal(
      sequence(root).some((step) => step.startsWith('compose') || step.includes('checkout')),
      false,
    )
  })
})

// 成功更新序列為 fetch → backup → checkout → build → up；備份失敗則不 checkout。
test('update.sh runs fetch, backup, checkout, build and up in order', () => {
  fixture((root) => {
    const env = { ...opsFixture(root), RDWEB_BACKUP_DIR: join(root, 'backups') }
    const result = runScript(root, 'update.sh', ['v1.0.0'], { env })
    assert.equal(result.status, 0, result.stderr)
    const steps = sequence(root)
    const index = (pattern) => steps.findIndex((step) => pattern.test(step))
    const order = [
      index(/^git .*fetch --tags/),
      index(/backup \/app\/data\/backups\//),
      index(/^git .*checkout -q v1\.0\.0$/),
      index(/^compose build$/),
      index(/^compose up -d --wait --wait-timeout 120$/),
    ]
    assert.ok(
      order.every((value) => value >= 0),
      JSON.stringify(steps),
    )
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
    )
  })
  fixture((root) => {
    const env = {
      ...opsFixture(root),
      STUB_BACKUP_EXIT: '1',
      RDWEB_BACKUP_DIR: join(root, 'backups'),
    }
    const result = runScript(root, 'update.sh', ['v1.0.0'], { env })
    assert.notEqual(result.status, 0)
    assert.equal(
      sequence(root).some((step) => step.includes('checkout')),
      false,
    )
  })
})

// 啟動失敗時提示回到前一版本的指令。
test('update.sh prints rollback command when services fail to become healthy', () => {
  fixture((root) => {
    const env = { ...opsFixture(root), STUB_UP_EXIT: '1', RDWEB_BACKUP_DIR: join(root, 'backups') }
    const result = runScript(root, 'update.sh', ['v1.0.0'], { env })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /update\.sh v0\.9\.0/)
  })
})

// 額外 compose 檔依序疊加在 compose.yml 之後，供主機自訂設定或 E2E 使用。
test('lib.sh appends RDWEB_COMPOSE_EXTRA files after compose.yml', () => {
  fixture((root) => {
    const env = { ...opsFixture(root), RDWEB_COMPOSE_EXTRA: '/x/a.yml /x/b.yml' }
    assert.equal(runScript(root, 'backup.sh', [join(root, 'backups')], { env }).status, 0)
    const first = calls(root).find((line) => line.startsWith('docker '))
    assert.match(
      first,
      /^docker compose -p rdweb --env-file \S+ -f \S+\/compose\.yml -f \/x\/a\.yml -f \/x\/b\.yml exec /,
    )
  })
})

// 同一秒內連續備份（例如還原前自動備份緊接手動備份）不得因檔名相同而失敗。
test('backup.sh twice within the same second creates two files', () => {
  fixture((root) => {
    const env = opsFixture(root)
    const out = join(root, 'backups')
    assert.equal(runScript(root, 'backup.sh', [out], { env }).status, 0)
    assert.equal(runScript(root, 'backup.sh', [out], { env }).status, 0)
    assert.equal(readdirSync(out).length, 2)
  })
})

// 新 named volume 只會繼承映像內既有目錄的擁有者；資料目錄必須是 Dockerfile 預先建立且屬於 app 的路徑。
test('prod data volume mounts the app-owned directory created by the image', () => {
  const compose = readFileSync('deploy/prod/compose.yml', 'utf8')
  const dockerfile = readFileSync('deploy/dev/Dockerfile.api', 'utf8')
  assert.match(dockerfile, /mkdir -p \/app\/data && chown app:app \/app\/data && chmod 700 \/app\/data/)
  assert.match(compose, /^\s+- rdweb-data:\/app\/data$/m)
  assert.match(compose, /^\s+DATA_PATH: \/app\/data\/app\.db$/m)
  const backup = readFileSync('deploy/prod/backup.sh', 'utf8')
  assert.doesNotMatch(backup, /[^p]\/data\/backups/)
})
