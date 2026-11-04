import { createHash } from 'node:crypto'
import { isBuiltin } from 'node:module'
import { inflateRawSync } from 'node:zlib'
import {
  constants,
  lstatSync,
  fstatSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { URL, fileURLToPath } from 'node:url'
import { build } from 'vite'
import { assets, extractFixture } from './prepare-codec-fixtures.mjs'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const pinPath = join(frontend, 'e2e/receiver/node-runtime-pin.json')
const MAX_ARCHIVE = 128 * 1024 * 1024
const MAX_EXE = 128 * 1024 * 1024
const MAX_LICENSE = 4 * 1024 * 1024
const MAX_BUNDLE = 16 * 1024 * 1024
const HASH = /^[0-9a-f]{64}$/

// 所有建置錯誤只回固定分類，不印來源路徑、任意metadata或原生例外。
function fail() {
  throw new Error('receiver_unavailable')
}

// 精確plain-data欄位集合，拒絕getter、prototype與未知設定捷徑。
function fields(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length
  )
    return fail()
  const descriptors = Object.getOwnPropertyDescriptors(value),
    result = {}
  for (const key of keys) {
    const d = descriptors[key]
    if (!d || !('value' in d) || !d.enumerable) return fail()
    result[key] = d.value
  }
  return result
}

// 這只驗pin格式／固定官方URL，不冒稱已驗簽章；正式build還需已核准的source pin相同。
export function validateReceiverRuntimePin(value) {
  try {
    const p = fields(value, [
      'version',
      'arch',
      'archiveUrl',
      'checksumsUrl',
      'signatureUrl',
      'archiveSha256',
      'nodeExeSha256',
      'licenseSha256',
      'trust',
    ])
    if (
      typeof p.version !== 'string' ||
      !/^v24\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(p.version) ||
      !['win-x64', 'win-arm64'].includes(p.arch)
    )
      return fail()
    const base = `https://nodejs.org/dist/${p.version}/`
    if (
      p.archiveUrl !== `${base}node-${p.version}-${p.arch}.zip` ||
      p.checksumsUrl !== base + 'SHASUMS256.txt' ||
      p.signatureUrl !== base + 'SHASUMS256.txt.sig'
    )
      return fail()
    for (const key of ['archiveSha256', 'nodeExeSha256', 'licenseSha256'])
      if (typeof p[key] !== 'string' || !HASH.test(p[key])) return fail()
    const t = fields(p.trust, ['fingerprint', 'sourceUrl', 'verifier'])
    if (
      typeof t.fingerprint !== 'string' ||
      !/^(?:[0-9A-F]{40}|[0-9A-F]{64})$/.test(t.fingerprint) ||
      typeof t.sourceUrl !== 'string' ||
      !/^https:\/\/github\.com\/nodejs\/release-keys\/blob\/[0-9a-f]{40}\/[A-Za-z0-9._/-]+$/.test(
        t.sourceUrl,
      ) ||
      t.sourceUrl.split('/').some((part) => part === '..' || part === '.') ||
      t.verifier !== '/usr/bin/gpg'
    )
      return fail()
    return { ...p, trust: t }
  } catch {
    return fail()
  }
}

// 來源檔先驗普通單link／size，以同一descriptor讀取，不追symlink或在錯誤時縮權。
function readBoundedFile(path, limit) {
  const before = lstatSync(path)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > limit
  )
    return fail()
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = fstatSync(fd)
    if (
      stat.dev !== before.dev ||
      stat.ino !== before.ino ||
      stat.size !== before.size ||
      stat.nlink !== 1
    )
      return fail()
    const bytes = readFileSync(fd),
      after = fstatSync(fd)
    if (bytes.length !== stat.size || after.size !== stat.size || after.ctimeMs !== stat.ctimeMs)
      return fail()
    return bytes
  } finally {
    closeSync(fd)
  }
}

// runtime／程式hash是公開供應鏈用途，不對收到文字或密碼計算紀錄hash。
function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

// 檔名一律正規相對路徑，不接受Windows drive、backslash、traversal或NUL。
function safeArchiveName(name, prefix) {
  if (!name || name.length > 4096 || !name.startsWith(prefix) || /[\\:\0]/.test(name)) return false
  const parts = name.endsWith('/') ? name.slice(0, -1).split('/') : name.split('/')
  return parts.every((part) => part && part !== '.' && part !== '..')
}

// ZIP只解析metadata及兩個必要成員，從不把archive任意路徑解壓到磁碟。
function zipEntries(bytes, prefix) {
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i
      break
    }
  if (end < 0 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0)
    return fail()
  const count = bytes.readUInt16LE(end + 10),
    size = bytes.readUInt32LE(end + 12),
    start = bytes.readUInt32LE(end + 16)
  if (count < 1 || count > 8192 || bytes.readUInt16LE(end + 8) !== count || start + size !== end)
    return fail()
  const seen = new Set(),
    entries = new Map(),
    ranges = []
  let offset = start
  for (let n = 0; n < count; n++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) return fail()
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10),
      compressed = bytes.readUInt32LE(offset + 20),
      length = bytes.readUInt32LE(offset + 24),
      nameLength = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32),
      local = bytes.readUInt32LE(offset + 42),
      mode = bytes.readUInt32LE(offset + 38) >>> 16
    if (
      (flags & ~0x0808) !== 0 ||
      ![0, 8].includes(method) ||
      bytes.readUInt16LE(offset + 34) !== 0 ||
      (mode & 0xf000) === 0xa000 ||
      ![0, 0x4000, 0x8000].includes(mode & 0xf000) ||
      offset + 46 + nameLength + extra + comment > end ||
      local + 30 > start
    )
      return fail()
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength)
    const name = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(nameBytes)
    if (!safeArchiveName(name, prefix) || seen.has(name)) return fail()
    seen.add(name)
    if (
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 6) !== flags ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt16LE(local + 26) !== nameLength
    )
      return fail()
    const data = local + 30 + nameLength + bytes.readUInt16LE(local + 28)
    if (
      data + compressed > start ||
      !bytes.subarray(local + 30, local + 30 + nameLength).equals(nameBytes)
    )
      return fail()
    ranges.push([local, data + compressed])
    entries.set(name, { method, data, compressed, length })
    offset += 46 + nameLength + extra + comment
  }
  if (offset !== end) return fail()
  ranges.sort((a, b) => a[0] - b[0])
  for (let n = 1; n < ranges.length; n++) if (ranges[n][0] < ranges[n - 1][1]) return fail()
  return entries
}

// 單一必要成員只在聲明大小及硬性上限內解壓，再驗實際大小與獨立hash。
function member(bytes, entry, limit, hash) {
  if (!entry || entry.length < 1 || entry.length > limit) return fail()
  const data = bytes.subarray(entry.data, entry.data + entry.compressed)
  const plain =
    entry.method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: entry.length })
  if (plain.length !== entry.length || sha(plain) !== hash) return fail()
  return plain
}

// 即使來源hash相符也驗PE32+ executable及目標架構，假fixture不會被執行。
function verifyPe(bytes, arch) {
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) return fail()
  const pe = bytes.readUInt32LE(0x3c)
  if (
    pe < 64 ||
    pe + 26 > bytes.length ||
    bytes.readUInt32LE(pe) !== 0x4550 ||
    bytes.readUInt16LE(pe + 4) !== (arch === 'win-x64' ? 0x8664 : 0xaa64) ||
    !(bytes.readUInt16LE(pe + 22) & 2) ||
    bytes.readUInt16LE(pe + 24) !== 0x20b ||
    pe + 24 + bytes.readUInt16LE(pe + 20) > bytes.length
  )
    return fail()
}

// 只回RAM bytes；驗通syntactic pin不代表官方簽章或授權已完成。
export function inspectReceiverRuntimeArchive(input, pin) {
  try {
    const p = validateReceiverRuntimePin(pin)
    if (!(input instanceof Uint8Array) || input.length > MAX_ARCHIVE || input.length < 22)
      return fail()
    const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
    if (sha(bytes) !== p.archiveSha256) return fail()
    const prefix = `node-${p.version}-${p.arch}/`,
      entries = zipEntries(bytes, prefix)
    const nodeExe = member(bytes, entries.get(prefix + 'node.exe'), MAX_EXE, p.nodeExeSha256)
    const license = member(bytes, entries.get(prefix + 'LICENSE'), MAX_LICENSE, p.licenseSha256)
    verifyPe(nodeExe, p.arch)
    return { nodeExe, license }
  } catch {
    return fail()
  }
}

// 輸出祖先不得是symlink；此建置工具不修改既有目錄權限或清理失敗產物。
function safeParents(path) {
  for (let p = resolve(path); ; p = dirname(p)) {
    const stat = lstatSync(p)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail()
    if (p === dirname(p)) break
  }
}

// 單一JS編譯產物不是Windows部署包；write:false防止Vite複製整個public／cache。
export async function buildReceiverBundle(outputFile) {
  try {
    const target = resolve(outputFile)
    safeParents(dirname(target))
    try {
      lstatSync(target)
      return fail()
    } catch (error) {
      if (error.code !== 'ENOENT') return fail()
    }
    const result = await build({
      configFile: false,
      root: frontend,
      envDir: dirname(target),
      publicDir: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'receiver-node-builtins',
          enforce: 'pre',
          // 所有內建依賴明確node:化，npm套件一律打入單一bundle。
          resolveId(id) {
            if (isBuiltin(id))
              return { id: id.startsWith('node:') ? id : 'node:' + id, external: true }
          },
        },
      ],
      ssr: { noExternal: true },
      build: {
        ssr: join(frontend, 'e2e/receiver/cli.ts'),
        write: false,
        minify: false,
        sourcemap: false,
        target: 'node24',
        copyPublicDir: false,
        rolldownOptions: { output: { format: 'es' } },
      },
    })
    const output = (Array.isArray(result) ? result : [result]).flatMap((value) => value.output)
    if (
      output.length !== 1 ||
      output[0].type !== 'chunk' ||
      !output[0].isEntry ||
      output[0].imports.some((name) => !name.startsWith('node:')) ||
      output[0].dynamicImports.length
    )
      return fail()
    const bytes = Buffer.from(output[0].code)
    if (bytes.length > MAX_BUNDLE) return fail()
    writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' })
  } catch {
    return fail()
  }
}

// 正式出包前只信另行核准並保存的完整pin，不接受測試flag或呼叫者自行填的fake hash。
function approvedPin(input) {
  const pin = validateReceiverRuntimePin(input)
  const saved = validateReceiverRuntimePin(
    JSON.parse(readBoundedFile(pinPath, 8192).toString('utf8')),
  )
  if (JSON.stringify(saved) !== JSON.stringify(pin)) return fail()
  return pin
}

// 真archive只在已核准pin存在時處理，包內容完全allowlist且不含本輪設定／秘密／資料庫。
export async function buildReceiverPortable(input) {
  try {
    const {
      pin: value,
      archivePath,
      outputRoot,
    } = fields(input, ['pin', 'archivePath', 'outputRoot'])
    const pin = approvedPin(value),
      archive = readBoundedFile(archivePath, MAX_ARCHIVE)
    const runtime = inspectReceiverRuntimeArchive(archive, pin)
    const output = resolve(outputRoot)
    safeParents(dirname(output))
    mkdirSync(output, { mode: 0o700 })
    await buildReceiverBundle(join(output, 'receiver.mjs'))
    const media = readBoundedFile(join(frontend, '.cache/codec-fixtures/vp8.webm'), 12230)
    extractFixture(
      media,
      assets.find((asset) => asset.codec === 'vp8'),
    )
    const files = {
      'node.exe': runtime.nodeExe,
      'LICENSE.Node.txt': runtime.license,
      'vp8.webm': media,
      LICENSE: readBoundedFile(join(frontend, '../LICENSE'), MAX_LICENSE),
      'THIRD_PARTY_NOTICES.md': readBoundedFile(
        join(frontend, '../THIRD_PARTY_NOTICES.md'),
        MAX_LICENSE,
      ),
      'CODEC_FIXTURES.md': readBoundedFile(
        join(frontend, 'src/rdweb/__fixtures__/CODEC_FIXTURES.md'),
        MAX_LICENSE,
      ),
      'README.md': readBoundedFile(join(frontend, 'e2e/receiver/README.md'), MAX_LICENSE),
    }
    for (const name of [
      'start-windows-test-receiver.cmd',
      'start-windows-test-receiver.ps1',
      'windows-host-observer-supervisor.ps1',
    ])
      files[name] = readBoundedFile(join(frontend, 'e2e/scripts', name), MAX_LICENSE)
    for (const [name, bytes] of Object.entries(files))
      writeFileSync(join(output, name), bytes, { flag: 'wx', mode: 0o600 })
    const hashes = {
      'receiver.mjs': sha(readBoundedFile(join(output, 'receiver.mjs'), MAX_BUNDLE)),
    }
    for (const [name, bytes] of Object.entries(files)) hashes[name] = sha(bytes)
    writeFileSync(
      join(output, 'integrity.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'rdweb-test-receiver-portable',
        version: pin.version,
        arch: pin.arch,
        files: hashes,
      }) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
  } catch {
    return fail()
  }
}
