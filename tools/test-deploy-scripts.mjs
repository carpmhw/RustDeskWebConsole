import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
