import { randomInt, randomUUID } from 'node:crypto'
import { prepareReceiverClient, readReceiverEndpoints } from '../receiver/client-control.ts'

// 只接受固定的prepare --directory <root>；root不是秘密但仍需明確參數。
function readRoot(args) {
  if (args.length !== 2 || args[0] !== '--directory' || !args[1]) throw new Error()
  return args[1]
}

// 新測試ID只生成一次9位數字；不沿用官方client或舊輪ID。
function readPeerId(value) {
  if (value === undefined) return String(100000000 + randomInt(900000000))
  if (!/^[1-9]\d{8}$/.test(value)) throw new Error()
  return value
}

// binding與connection全部由本次prepare生成；有效期固定30分鐘。
function readBinding(env) {
  const createdUtc = new Date().toISOString()
  return {
    schemaVersion: 1,
    purpose: 'rustdesk_test_receiver_v1',
    runId: randomUUID(),
    requestId: randomUUID(),
    peerId: readPeerId(env.RDWEB_TEST_RECEIVER_PEER_ID),
    createdUtc,
    expiresUtc: new Date(Date.parse(createdUtc) + 1800000).toISOString(),
  }
}

// 只回固定成功marker；不列出runId、peerId、endpoint或公鑰。
try {
  const root = readRoot(process.argv.slice(2))
  const binding = readBinding(process.env)
  prepareReceiverClient(root, binding, readReceiverEndpoints(process.env))
  console.log('receiver_prepared')
} catch {
  console.error('receiver_unavailable')
  process.exitCode = 2
}
