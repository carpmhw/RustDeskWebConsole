import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { URL } from 'node:url'

const roots = []
// 只收本測試擁有的新公開資料，不讀舊診斷或清cache。
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// 入口缺失是明確能力RED，不以import錯誤充數。
async function generator() {
  assert.equal(
    existsSync(new URL('../../scripts/generate-receiver-proto.mjs', import.meta.url)),
    true,
  )
  return import('../../scripts/generate-receiver-proto.mjs')
}

// 只複製固定公開proto來源到本案私有tmp，測試不下載或安裝。
function fixture() {
  const root = mkdtempSync('/tmp/opencode/rdweb-receiver-proto-')
  roots.push(root)
  const sourceDirectory = join(root, 'source'),
    outputDirectory = join(root, 'output')
  mkdirSync(sourceDirectory, { mode: 0o700 })
  for (const name of ['message.proto', 'rendezvous.proto'])
    copyFileSync(
      new URL('../../.cache/rustdesk-protos/' + name, import.meta.url),
      join(sourceDirectory, name),
    )
  return { sourceDirectory, outputDirectory }
}

// 忽略hash或不確定生成會破壞pinned協定與離線包可追溯性。
test('generates deterministic receiver-only code and rejects modified pinned sources', async () => {
  const { generateReceiverProto } = await generator(),
    paths = fixture()
  await generateReceiverProto(paths)
  const js = readFileSync(join(paths.outputDirectory, 'rendezvous.js'))
  const types = readFileSync(join(paths.outputDirectory, 'rendezvous.d.ts'))
  await generateReceiverProto(paths)
  assert.equal(readFileSync(join(paths.outputDirectory, 'rendezvous.js')).equals(js), true)
  assert.equal(readFileSync(join(paths.outputDirectory, 'rendezvous.d.ts')).equals(types), true)
  writeFileSync(join(paths.sourceDirectory, 'rendezvous.proto'), 'syntax = "proto3";')
  await assert.rejects(generateReceiverProto(paths), /^Error: receiver_unavailable$/)
  assert.equal(readFileSync(join(paths.outputDirectory, 'rendezvous.js')).equals(js), true)
})
