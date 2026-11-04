import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import protobuf from 'protobufjs'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const commit = '334641686c731631fc51524bb2aa2ec2773069ee'
const pins = {
  'message.proto': '963cb7b27752edf7c200f563607fdbef76e1792951cbb4bb21d72508435f08eb',
  'rendezvous.proto': '98c7c047761bbd7151b72d249f9e58479cc345827335589a1f5285c27ab1a469',
}

// 唯有本機固定proto通過完整hash後才生成；import不下載、不寫檔或執行工具。
export async function generateReceiverProto({ sourceDirectory, outputDirectory }) {
  try {
    const root = new protobuf.Root()
    for (const [name, hash] of Object.entries(pins)) {
      const path = join(sourceDirectory, name),
        stat = lstatSync(path),
        bytes = readFileSync(path)
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        bytes.length > 65536 ||
        createHash('sha256').update(bytes).digest('hex') !== hash
      )
        throw new Error()
      protobuf.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), root)
    }
    // 明確輸出樹不跟symlink，不接觸正式message生成碼。
    const output = resolve(outputDirectory)
    mkdirSync(output, { recursive: true })
    for (let p = output; ; p = dirname(p)) {
      if (lstatSync(p).isSymbolicLink()) throw new Error()
      if (p === dirname(p)) break
    }
    const js = join(output, 'rendezvous.js'),
      types = join(output, 'rendezvous.d.ts')
    execFileSync(
      process.execPath,
      [
        join(frontend, 'node_modules/protobufjs-cli/bin/pbjs'),
        '-t',
        'static-module',
        '-w',
        'es6',
        '--root',
        'rdwebReceiverRendezvous',
        '--dependency',
        'protobufjs/minimal.js',
        '-o',
        js,
        join(sourceDirectory, 'rendezvous.proto'),
      ],
      { cwd: frontend, stdio: 'pipe' },
    )
    execFileSync(
      process.execPath,
      [join(frontend, 'node_modules/protobufjs-cli/bin/pbts'), '-o', types, js],
      { cwd: frontend, stdio: 'pipe' },
    )
    const header = `// Generated from rustdesk/hbb_common ${commit}; AGPL-3.0, RustDesk contributors. Do not edit.\n// rendezvous.proto SHA256 ${pins['rendezvous.proto']}; message.proto SHA256 ${pins['message.proto']}.\n`
    for (const path of [js, types]) writeFileSync(path, header + readFileSync(path, 'utf8'))
    writeFileSync(
      join(output, 'receiver-schema.js'),
      header + 'export default ' + JSON.stringify(root.toJSON()) + '\n',
    )
    writeFileSync(
      join(output, 'receiver-schema.d.ts'),
      header +
        "import type { INamespace } from 'protobufjs'\ndeclare const schema: INamespace\nexport default schema\n",
    )
  } catch {
    throw new Error('receiver_unavailable')
  }
}

// 只有直接呼叫才在明確新receiver目錄生成，不自動fetch缺少來源。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await generateReceiverProto({
      sourceDirectory: join(frontend, '.cache/rustdesk-protos'),
      outputDirectory: join(frontend, 'e2e/receiver/generated'),
    })
  } catch {
    console.error('receiver_unavailable')
    process.exitCode = 2
  }
}
