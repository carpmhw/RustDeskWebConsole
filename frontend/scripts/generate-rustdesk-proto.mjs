import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const cache = join(root, '.cache/rustdesk-protos')
const output = join(root, 'src/rdweb/generated')
const commit = '334641686c731631fc51524bb2aa2ec2773069ee'
const hashes = {
  'message.proto': '963cb7b27752edf7c200f563607fdbef76e1792951cbb4bb21d72508435f08eb',
  'rendezvous.proto': '98c7c047761bbd7151b72d249f9e58479cc345827335589a1f5285c27ab1a469',
}
mkdirSync(cache, { recursive: true })
mkdirSync(output, { recursive: true })
// 完整上游schema每次核hash，已有cache時不需要網路或.NET SDK。
for (const [name, hash] of Object.entries(hashes)) {
  const path = join(cache, name)
  if (!existsSync(path)) {
    const response = await fetch(
      `https://raw.githubusercontent.com/rustdesk/hbb_common/${commit}/protos/${name}`,
    )
    if (!response.ok) throw new Error('Pinned schema download failed')
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > 65536 || createHash('sha256').update(data).digest('hex') !== hash)
      throw new Error('Pinned schema hash mismatch')
    writeFileSync(path, data)
  }
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== hash)
    throw new Error('Pinned schema hash mismatch')
}
const js = join(output, 'message.js')
const types = join(output, 'message.d.ts')
execFileSync(
  process.execPath,
  [
    join(root, 'node_modules/protobufjs-cli/bin/pbjs'),
    '-t',
    'static-module',
    '-w',
    'es6',
    '--dependency',
    'protobufjs/minimal.js',
    '-o',
    js,
    join(cache, 'message.proto'),
  ],
  { cwd: root },
)
execFileSync(
  process.execPath,
  [join(root, 'node_modules/protobufjs-cli/bin/pbts'), '-o', types, js],
  { cwd: root },
)
const provenance = `// Generated from rustdesk/hbb_common ${commit}; AGPL-3.0, RustDesk contributors.\n// message.proto SHA256 ${hashes['message.proto']}; protobufjs-cli 2.7.0. Do not edit.\n`
writeFileSync(js, provenance + readFileSync(js, 'utf8'))
writeFileSync(types, provenance + readFileSync(types, 'utf8'))
