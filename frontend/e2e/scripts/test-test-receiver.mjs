import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { createReceiverClient } from '../receiver/client-control.ts'

const roots = []
const prepareScript = fileURLToPath(new URL('./prepare-test-receiver.mjs', import.meta.url))
const importScript = fileURLToPath(new URL('./import-test-receiver.mjs', import.meta.url))
const key = Buffer.alloc(32).toString('base64')

// 只清本測試新建的公開tmp；不碰repo cache或任何既有輪設定。
after(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// 子程序只帶本案必要env，避免宿主CI或舊用途flags意外通過opt-in。
function baseEnv() {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    RDWEB_TEST_RECEIVER_LIVE: '1',
    RDWEB_TEST_RECEIVER_HBBS_UDP: 'hbbs.invalid:21116',
    RDWEB_TEST_RECEIVER_HBBS_TCP: 'hbbs.invalid:21116',
    RDWEB_TEST_RECEIVER_HBBR_TCP: 'hbbr.invalid:21117',
    RDWEB_TEST_RECEIVER_SERVER_PUBLIC_KEY: key,
  }
}

// 只以絕對Node與固定script啟動，不經shell或PATH尋找runtime。
function run(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env, timeout: 10000 })
}

// 建立本次tmp parent；root本身仍由prepare以0700建立。
function directory() {
  const parent = mkdtempSync('/tmp/opencode/rdweb-test-receiver-cli-')
  roots.push(parent)
  return { parent, root: join(parent, 'current') }
}

// 以正式client-control寫出同輪start／client，才測import CLI。
function clientReport(binding) {
  return {
    schemaVersion: 1,
    purpose: binding.purpose,
    runId: binding.runId,
    requestId: binding.requestId,
    identityVerified: true,
    videoPresented: true,
    submitted: true,
    observationComplete: true,
    scopeIntact: true,
    resourcesClosed: true,
    unavailable: false,
  }
}

// 手寫完整receiver結果；不經被測validator產生oracle。
function receiverResult(binding) {
  return {
    schemaVersion: 1,
    purpose: binding.purpose,
    runId: binding.runId,
    requestId: binding.requestId,
    code: 'receiver_match',
    identityBound: true,
    authenticated: true,
    received: true,
    macVerified: true,
    parsed: true,
    textSingle: true,
    textExact: true,
    sequenceComplete: true,
    sequenceValid: true,
    windowComplete: true,
    overflow: false,
    unavailable: false,
    resourcesClosed: true,
  }
}

// 準備成功只回固定marker；未opt-in、CI或重複claim都必須在任何root寫入前拒絕。
test('CLI requires opt-in and claims a new root once', () => {
  const { root } = directory()
  const denied = run(prepareScript, ['--directory', root], {
    ...baseEnv(),
    RDWEB_TEST_RECEIVER_LIVE: undefined,
  })
  assert.equal(denied.status, 2)
  assert.equal(denied.stdout, '')
  assert.match(denied.stderr, /^receiver_unavailable$/m)
  assert.equal(existsSync(root), false)

  const accepted = run(prepareScript, ['--directory', root], baseEnv())
  assert.equal(accepted.status, 0)
  assert.equal(accepted.stdout.trim(), 'receiver_prepared')
  assert.equal(accepted.stderr, '')
  assert.equal(lstatSync(root).mode & 0o777, 0o700)
  const before = readFileSync(join(root, 'binding.json'))
  const again = run(prepareScript, ['--directory', root], baseEnv())
  assert.equal(again.status, 2)
  assert.match(again.stderr, /^receiver_unavailable$/m)
  assert(readFileSync(join(root, 'binding.json')).equals(before))
})

// import只回固定code；成功後重複與不安全source都不得覆寫第一份joined。
test('CLI imports a same-run result once and rejects unsafe repeats', () => {
  const { parent, root } = directory()
  const prepared = run(prepareScript, ['--directory', root], baseEnv())
  assert.equal(prepared.status, 0)
  const binding = JSON.parse(readFileSync(join(root, 'binding.json'), 'utf8'))
  const client = createReceiverClient(root, () => 0, baseEnv())
  client.start()
  client.finish(clientReport(binding))

  const source = join(parent, 'receiver-result.json')
  writeFileSync(source, JSON.stringify(receiverResult(binding)) + '\n', { mode: 0o600 })
  const imported = run(importScript, ['--directory', root, '--source', source], baseEnv())
  assert.equal(imported.status, 0)
  assert.equal(imported.stdout.trim(), 'receiver_match')
  assert.equal(imported.stderr, '')
  const joined = readFileSync(join(root, 'joined.json'))
  const repeat = run(importScript, ['--directory', root, '--source', source], baseEnv())
  assert.equal(repeat.status, 2)
  assert.match(repeat.stderr, /^receiver_unavailable$/m)
  assert(readFileSync(join(root, 'joined.json')).equals(joined))

  // 第二個私有root才能單獨驗source mode，不被第一次重複拒絕掩蓋。
  const second = join(parent, 'second')
  assert.equal(run(prepareScript, ['--directory', second], baseEnv()).status, 0)
  const secondBinding = JSON.parse(readFileSync(join(second, 'binding.json'), 'utf8'))
  const secondClient = createReceiverClient(second, () => 0, baseEnv())
  secondClient.start()
  secondClient.finish(clientReport(secondBinding))
  const unsafe = join(parent, 'unsafe-result.json')
  writeFileSync(unsafe, JSON.stringify(receiverResult(secondBinding)) + '\n', { mode: 0o640 })
  const rejected = run(importScript, ['--directory', second, '--source', unsafe], baseEnv())
  assert.equal(rejected.status, 2)
  assert.equal(existsSync(join(second, 'joined.json')), false)
})

// 終端不得洩漏runId、peerId、endpoint或public key；只允許固定狀態字。
test('CLI output does not contain binding values or endpoints', () => {
  const { parent, root } = directory()
  const prepared = run(prepareScript, ['--directory', root], baseEnv())
  const binding = JSON.parse(readFileSync(join(root, 'binding.json'), 'utf8'))
  const client = createReceiverClient(root, () => 0, baseEnv())
  client.start()
  client.finish(clientReport(binding))
  const source = join(parent, 'receiver-result.json')
  writeFileSync(source, JSON.stringify(receiverResult(binding)) + '\n', { mode: 0o600 })
  const imported = run(importScript, ['--directory', root, '--source', source], baseEnv())
  const output = [prepared.stdout, prepared.stderr, imported.stdout, imported.stderr].join('')
  for (const value of [
    binding.runId,
    binding.requestId,
    binding.peerId,
    'hbbs.invalid',
    'hbbr.invalid',
    key,
  ])
    assert.equal(output.includes(value), false)
})
