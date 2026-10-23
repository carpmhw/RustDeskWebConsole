import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  readdirSync,
  lstatSync,
} from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { URL } from 'node:url'
import { spawnSync } from 'node:child_process'

const roots = []
// 只清一般公開測試的自有tmp；另獲授權的opt-in真包與來源不加入清理名單。
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// 能力缺失先以斷言取得RED，不以import錯誤冒充測試。
async function api() {
  assert.equal(existsSync(new URL('../../scripts/build-test-receiver.mjs', import.meta.url)), true)
  return import('../../scripts/build-test-receiver.mjs')
}

// 公開fixture hash僅供封裝parser測試，不是官方Node來源或核准pin。
function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

// 不可執行的最小PE metadata fixture，不下載或執行Windows runtime。
function pe(machine = 0x8664) {
  const b = Buffer.alloc(512)
  b.writeUInt16LE(0x5a4d, 0)
  b.writeUInt32LE(0x80, 0x3c)
  b.writeUInt32LE(0x4550, 0x80)
  b.writeUInt16LE(machine, 0x84)
  b.writeUInt16LE(0xf0, 0x94)
  b.writeUInt16LE(2, 0x96)
  b.writeUInt16LE(0x20b, 0x98)
  return b
}

// 手寫stored ZIP只供有界parser測試；CRC不作安全來源，完整archive與成員另驗SHA256。
function archive(entries) {
  const local = [],
    central = []
  let offset = 0
  for (const [name, bytes, mode = 0x81a4, method = 0] of entries) {
    const path = Buffer.from(name),
      plain = Buffer.from(bytes),
      data = method === 8 ? deflateRawSync(plain) : plain,
      header = Buffer.alloc(30),
      c = Buffer.alloc(46)
    header.writeUInt32LE(0x04034b50)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(method, 8)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(plain.length, 22)
    header.writeUInt16LE(path.length, 26)
    c.writeUInt32LE(0x02014b50)
    c.writeUInt16LE(0x0314, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(method, 10)
    c.writeUInt32LE(data.length, 20)
    c.writeUInt32LE(plain.length, 24)
    c.writeUInt16LE(path.length, 28)
    c.writeUInt32LE((mode * 65536) >>> 0, 38)
    c.writeUInt32LE(offset, 42)
    local.push(header, path, data)
    central.push(c, path)
    offset += header.length + path.length + data.length
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

// 假pin只能供純parser使用，正式build另要求已核准的source pin檔。
function fixture(entries) {
  const prefix = 'node-v24.99.0-win-x64/',
    node = pe(),
    license = Buffer.from('public fake license')
  const bytes = archive(
    entries ?? [
      [prefix + 'node.exe', node],
      [prefix + 'LICENSE', license],
    ],
  )
  return {
    bytes,
    node,
    license,
    prefix,
    pin: {
      version: 'v24.99.0',
      arch: 'win-x64',
      archiveUrl: 'https://nodejs.org/dist/v24.99.0/node-v24.99.0-win-x64.zip',
      checksumsUrl: 'https://nodejs.org/dist/v24.99.0/SHASUMS256.txt',
      signatureUrl: 'https://nodejs.org/dist/v24.99.0/SHASUMS256.txt.sig',
      archiveSha256: sha(bytes),
      nodeExeSha256: sha(node),
      licenseSha256: sha(license),
      trust: {
        fingerprint: 'A'.repeat(40),
        sourceUrl: 'https://github.com/nodejs/release-keys/blob/' + '1'.repeat(40) + '/keys.asc',
        verifier: '/usr/bin/gpg',
      },
    },
  }
}

// 接受的syntactic pin不等於已驗官方簽章；浮動URL／錯來源／錯架構必須拒絕。
test('validates exact runtime pin metadata and rejects floating or untrusted URLs', async () => {
  const c = await api(),
    f = fixture()
  assert.equal(c.validateReceiverRuntimePin(f.pin).arch, 'win-x64')
  for (const change of [
    { version: 'latest' },
    { arch: 'linux-x64' },
    { archiveUrl: f.pin.archiveUrl + '?redirect=1' },
    { checksumsUrl: 'https://example.invalid/SHASUMS256.txt' },
    { nodeExeSha256: '' },
    { extra: 'unexpected' },
    {
      trust: {
        ...f.pin.trust,
        sourceUrl: 'https://github.com/nodejs/release-keys/blob/main/keys.asc',
      },
    },
  ])
    assert.throws(
      () => c.validateReceiverRuntimePin({ ...f.pin, ...change }),
      /^Error: receiver_unavailable$/,
    )
})

// 真parser只回兩個有界RAM成員，不解壓到磁碟、不把fake PE做成可部署包。
test('inspects only pinned PE and LICENSE bytes and rejects tampering or wrong architecture', async () => {
  const c = await api(),
    f = fixture(),
    parsed = c.inspectReceiverRuntimeArchive(f.bytes, f.pin)
  assert.equal(Buffer.from(parsed.nodeExe).equals(f.node), true)
  assert.equal(Buffer.from(parsed.license).equals(f.license), true)
  assert.throws(
    () =>
      c.inspectReceiverRuntimeArchive(f.bytes, {
        ...f.pin,
        arch: 'win-arm64',
        archiveUrl: f.pin.archiveUrl.replaceAll('win-x64', 'win-arm64'),
      }),
    /^Error: receiver_unavailable$/,
  )
  const changed = Buffer.from(f.bytes)
  changed[45] ^= 1
  assert.throws(
    () => c.inspectReceiverRuntimeArchive(changed, f.pin),
    /^Error: receiver_unavailable$/,
  )
  assert.throws(
    () => c.inspectReceiverRuntimeArchive(f.bytes, { ...f.pin, nodeExeSha256: '0'.repeat(64) }),
    /^Error: receiver_unavailable$/,
  )
  assert.throws(
    () => c.inspectReceiverRuntimeArchive(f.bytes, { ...f.pin, licenseSha256: '0'.repeat(64) }),
    /^Error: receiver_unavailable$/,
  )
})

// 真Node ZIP可使用DEFLATE；只依宣告上限有界解壓，超額輸出不能進PE檢查。
test('bounds DEFLATE output before verifying PE and license hashes', async () => {
  const c = await api(),
    f = fixture()
  const bytes = archive([
    [f.prefix + 'node.exe', f.node, 0x81a4, 8],
    [f.prefix + 'LICENSE', f.license, 0x81a4, 8],
  ])
  const pin = { ...f.pin, archiveSha256: sha(bytes) }
  assert.equal(
    Buffer.from(c.inspectReceiverRuntimeArchive(bytes, pin).nodeExe).equals(f.node),
    true,
  )
  const end = bytes.length - 22,
    directory = bytes.readUInt32LE(end + 16)
  bytes.writeUInt32LE(1, directory + 24)
  assert.throws(
    () => c.inspectReceiverRuntimeArchive(bytes, { ...pin, archiveSha256: sha(bytes) }),
    /^Error: receiver_unavailable$/,
  )
})

// traversal／duplicate／symlink與缺少必要成員即使hash相符亦拒絕。
test('rejects unsafe archive names, duplicates, links and missing members', async () => {
  const c = await api(),
    f = fixture()
  for (const entries of [
    [[f.prefix + 'node.exe', f.node]],
    [
      [f.prefix + 'node.exe', f.node],
      [f.prefix + 'node.exe', f.node],
    ],
    [
      [f.prefix + 'node.exe', f.node],
      [f.prefix + 'LICENSE', f.license],
      ['../result.json', '{}'],
    ],
    [
      [f.prefix + 'node.exe', f.node],
      [f.prefix + 'LICENSE', f.license],
      [f.prefix + 'link', 'node.exe', 0xa1ff],
    ],
  ]) {
    const bytes = archive(entries)
    assert.throws(
      () => c.inspectReceiverRuntimeArchive(bytes, { ...f.pin, archiveSha256: sha(bytes) }),
      /^Error: receiver_unavailable$/,
    )
  }
})

// 編譯單一JS到公開tmp，用目前Linux Node跑--help；不執行Windows PE或開socket。
test('builds a self-contained Node bundle with no external npm install', async () => {
  const c = await api(),
    root = mkdtempSync('/tmp/opencode/rdweb-receiver-bundle-')
  roots.push(root)
  const output = join(root, 'receiver.mjs')
  await c.buildReceiverBundle(output)
  const result = spawnSync(process.execPath, [output, '--help'], {
    encoding: 'utf8',
    timeout: 10000,
    env: { PATH: process.env.PATH, HOME: root },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^receiver_usage,run --directory <root>\|--help\s*$/)
  assert.equal(result.stderr, '')
  await assert.rejects(c.buildReceiverBundle(output), /^Error: receiver_unavailable$/)
})

// 即使已保存真pin，正式builder也不能接受syntactic fake pin或拿它出包。
test('refuses a portable package with an unapproved runtime pin', async () => {
  const c = await api(),
    f = fixture(),
    root = mkdtempSync('/tmp/opencode/rdweb-receiver-package-')
  roots.push(root)
  const archivePath = join(root, 'public-fixture.zip'),
    outputRoot = join(root, 'portable')
  writeFileSync(archivePath, f.bytes)
  await assert.rejects(
    c.buildReceiverPortable({ pin: f.pin, archivePath, outputRoot }),
    /^Error: receiver_unavailable$/,
  )
  assert.equal(existsSync(outputRoot), false)
  assert.equal(readFileSync(archivePath).equals(f.bytes), true)
})

// 真包只在操作者另行授權的新根目錄執行一次；不fetch、不執行PE、不清理來源或正式輸出。
if (process.env.RDWEB_RECEIVER_PACKAGE_BUILD_ROOT) {
  test('builds the approved real package with exact contents and refuses overwrite', async () => {
    const c = await api(),
      root = process.env.RDWEB_RECEIVER_PACKAGE_BUILD_ROOT
    assert.equal(isAbsolute(root), true)
    const archivePath = join(root, 'source/node-v24.22.1-win-x64.zip'),
      outputRoot = join(root, 'portable')
    const pin = JSON.parse(
      readFileSync(new URL('../receiver/node-runtime-pin.json', import.meta.url), 'utf8'),
    )
    assert.equal(pin.version, 'v24.22.1')
    assert.equal(pin.arch, 'win-x64')
    assert.equal(existsSync(outputRoot), false)
    await c.buildReceiverPortable({ pin, archivePath, outputRoot })
    // 獨立手寫allowlist；廣泛copy cache／dist／node_modules或本輪結果都會使本案失敗。
    const expected = [
      'CODEC_FIXTURES.md',
      'LICENSE',
      'LICENSE.Node.txt',
      'README.md',
      'THIRD_PARTY_NOTICES.md',
      'integrity.json',
      'node.exe',
      'receiver.mjs',
      'start-windows-test-receiver.cmd',
      'start-windows-test-receiver.ps1',
      'vp8.webm',
      'windows-host-observer-supervisor.ps1',
    ].sort()
    assert.deepEqual(readdirSync(outputRoot).sort(), expected)
    const integrity = JSON.parse(readFileSync(join(outputRoot, 'integrity.json'), 'utf8'))
    assert.deepEqual(
      Object.keys(integrity.files).sort(),
      expected.filter((name) => name !== 'integrity.json'),
    )
    assert.equal(integrity.kind, 'rdweb-test-receiver-portable')
    assert.equal(integrity.version, pin.version)
    assert.equal(integrity.arch, pin.arch)
    const before = new Map()
    for (const name of expected) {
      const path = join(outputRoot, name),
        stat = lstatSync(path),
        bytes = readFileSync(path)
      assert.equal(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, true)
      before.set(name, sha(bytes))
      if (name !== 'integrity.json') assert.equal(integrity.files[name], sha(bytes))
    }
    assert.equal(before.get('node.exe'), pin.nodeExeSha256)
    assert.equal(before.get('LICENSE.Node.txt'), pin.licenseSha256)
    assert.equal(
      before.get('vp8.webm'),
      '503cd8dfafcba01760afc0794752803aa36143a14b9ad49b62c28b43de795c02',
    )
    // 檢查真正輸出的授權／入口與來源逐byte一致，不只相信builder產的清單。
    for (const [name, source] of [
      ['LICENSE', '../../../LICENSE'],
      ['THIRD_PARTY_NOTICES.md', '../../../THIRD_PARTY_NOTICES.md'],
      ['README.md', '../receiver/README.md'],
      ['CODEC_FIXTURES.md', '../../src/rdweb/__fixtures__/CODEC_FIXTURES.md'],
      ['start-windows-test-receiver.cmd', './start-windows-test-receiver.cmd'],
      ['start-windows-test-receiver.ps1', './start-windows-test-receiver.ps1'],
      ['windows-host-observer-supervisor.ps1', './windows-host-observer-supervisor.ps1'],
    ])
      assert.equal(
        readFileSync(join(outputRoot, name)).equals(readFileSync(new URL(source, import.meta.url))),
        true,
      )
    const result = spawnSync(process.execPath, [join(outputRoot, 'receiver.mjs'), '--help'], {
      cwd: outputRoot,
      encoding: 'utf8',
      timeout: 10000,
      env: { PATH: process.env.PATH, HOME: root },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /^receiver_usage,run --directory <root>\|--help\s*$/)
    assert.equal(result.stderr, '')
    await assert.rejects(
      c.buildReceiverPortable({ pin, archivePath, outputRoot }),
      /^Error: receiver_unavailable$/,
    )
    assert.deepEqual(readdirSync(outputRoot).sort(), expected)
    for (const [name, hash] of before) assert.equal(sha(readFileSync(join(outputRoot, name))), hash)
    assert.equal(sha(readFileSync(archivePath)), pin.archiveSha256)
  })
}
