import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const password = 'abcdef'.repeat(8)
const helper = resolve('deploy/dev/initialize-target-password.sh')
// 本機沿用核准暫存根目錄；CI亦先確保它存在，不改已有目錄權限。
mkdirSync('/tmp/opencode', { recursive: true, mode: 0o700 })

// 每案只用公開合成設定與owned短命資料夾，不讀取真fixture volume或秘密。
function run(config, value = password) {
  const directory = mkdtempSync('/tmp/opencode/rdweb-password-init-')
  const configPath = join(directory, 'RustDesk.toml')
  const passwordPath = join(directory, 'password')
  try {
    if (config !== null) writeFileSync(configPath, config, { mode: 0o600 })
    if (value !== null) writeFileSync(passwordPath, value, { mode: 0o600 })
    const result = spawnSync(
      'sh',
      [
        '-c',
        '. "$1"; initialize_target_password "$2" "$3"',
        'fixture',
        helper,
        configPath,
        passwordPath,
      ],
      { encoding: 'utf8' },
    )
    assert.ifError(result.error)
    let stored = null
    let mode = null
    try {
      stored = readFileSync(configPath, 'utf8')
      mode = statSync(configPath).mode & 0o777
    } catch {
      // 新檔初始化拒絕時不應留下半套Config。
    }
    return { status: result.status, output: result.stdout + result.stderr, stored, mode }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

// 新檔沿用既有runtime權威來源，不能改成另一個密碼或放寬權限。
test('seeds a missing Config from the existing runtime password file', () => {
  const result = run(null)
  assert.equal(result.status, 0)
  assert.equal(result.stored, "password = '" + password + "'\n")
  assert.equal(result.mode, 0o600)
  assert.equal(result.output, '')
})

// 整檔存在不代表認證欄位存在；補空值但保留原ID／key／salt資料。
for (const line of ['password = ""\n', "password = ''\n", '']) {
  // 雙／單引號與缺root欄位各獨立驗證，不能丟掉原identity資料。
  test('repairs missing or empty root password ' + JSON.stringify(line), () => {
    const rest = 'id = "public-id"\nsalt = "public-salt"\nkey_pair = [[], []]\n'
    const result = run(line + rest)
    assert.equal(result.status, 0)
    assert.equal(result.stored, "password = '" + password + "'\n" + rest)
    assert.equal(result.mode, 0o600)
    assert.equal(result.output, '')
  })
}

// 已有任何非空storage都不能被新runtime覆寫，不自行處理未知密碼migration。
test('preserves nonempty existing password storage byte for byte', () => {
  const config = 'password = "01-public-storage-placeholder"\nsalt = "public-salt"\n'
  const result = run(config)
  assert.equal(result.status, 0)
  assert.equal(result.stored, config)
  assert.equal(result.output, '')
})

// TOML子section的password不是root credential，不移除或覆寫它。
test('preserves sections while adding only the missing root credential', () => {
  const config = '[options]\npassword = "public-nested-value"\n'
  const result = run(config)
  assert.equal(result.status, 0)
  assert.equal(result.stored, "password = '" + password + "'\n" + config)
})

// 無來源／非canonical／TOML注入皆fail closed，錯誤不帶原值，不留新檔。
for (const value of [null, '', 'a'.repeat(47), "public'\npassword='injected", 'G'.repeat(48)]) {
  // 失敗只允許固定診斷，不回顯runtime內容或partial Config。
  test('rejects an unavailable or invalid runtime password safely', () => {
    const result = run(null, value)
    assert.notEqual(result.status, 0)
    assert.equal(result.stored, null)
    assert.equal(result.output, 'Target password fixture unavailable\n')
  })
}

// 矛盾root欄位不能被初始化掩蓋；原Config保持不變。
test('rejects duplicate root password fields without replacing the config', () => {
  const config = 'password = ""\npassword = "public-existing"\n'
  const result = run(config)
  assert.notEqual(result.status, 0)
  assert.equal(result.stored, config)
  assert.equal(result.output, 'Target password fixture unavailable\n')
})
