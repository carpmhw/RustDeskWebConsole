import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const commit = '521d168d63dbd206ea7fbe0b74ddd5760e6e668e'
export const assets = [
  {
    codec: 'vp8',
    name: 'vp8.webm',
    bytes: 12230,
    sha256: '503cd8dfafcba01760afc0794752803aa36143a14b9ad49b62c28b43de795c02',
    chunks: [
      [522, 4826],
      [5355, 394],
    ],
  },
  {
    codec: 'vp9',
    name: 'vp9.mp4',
    bytes: 6159,
    sha256: '0abb054bf0dfd17ebe08a04c656f0ad19bc117c19f89e79b6b8a20d6091539d9',
    chunks: [
      [44, 3315],
      [3359, 203],
    ],
  },
  {
    codec: 'av1',
    name: 'av1.mp4',
    bytes: 4019,
    sha256: '43620efd37f3714f80992cdd5832ed2ad0fa285e5cea656ab58fce8f53710021',
    chunks: [
      [48, 1938],
      [1986, 848],
    ],
  },
  {
    codec: 'h264',
    name: 'h264.annexb',
    bytes: 8940,
    sha256: '6d2bf6221fdf47cc2d0232c8631a74832ce0058098e314ebffdf0ca70347c101',
    chunks: [
      [0, 4175],
      [4175, 602],
    ],
  },
]
// 先驗完整公開上游檔，再有界切片；不執行下載的JS或追master。
export function extractFixture(bytes, asset) {
  if (
    bytes.length !== asset.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== asset.sha256
  )
    throw new Error('Public codec fixture integrity failed')
  return {
    codec: asset.codec,
    width: 320,
    height: 240,
    source: asset.name,
    sha256: asset.sha256,
    // 每筆公開frame保留獨立key／delta與毫秒pts，不保存任何遠端資料。
    frames: asset.chunks.map(([offset, size], index) => {
      if (
        !Number.isInteger(offset) ||
        !Number.isInteger(size) ||
        offset < 0 ||
        size < 1 ||
        offset + size > bytes.length
      )
        throw new Error('Public codec fixture bounds failed')
      return {
        key: index === 0,
        pts: String(index * 33),
        data: Buffer.from(bytes.subarray(offset, offset + size)).toString('base64'),
      }
    }),
  }
}
// 固定URL與hash，cache也是每次驗證；import此模組不下載或寫檔。
export async function prepareFixtures() {
  const cache = join(root, '.cache/codec-fixtures')
  const output = join(root, 'src/rdweb/__fixtures__')
  await mkdir(cache, { recursive: true })
  await mkdir(output, { recursive: true })
  const samples = []
  for (const asset of assets) {
    const path = join(cache, asset.name)
    let bytes
    try {
      bytes = await readFile(path)
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Public codec fixture cache unavailable')
      const response = await fetch(
        `https://raw.githubusercontent.com/web-platform-tests/wpt/${commit}/webcodecs/${asset.name}`,
        { signal: AbortSignal.timeout(15000) },
      )
      if (!response.ok) throw new Error('Public codec fixture unavailable')
      const reader = response.body.getReader()
      const chunks = []
      let size = 0
      while (true) {
        const item = await reader.read()
        if (item.done) break
        size += item.value.length
        if (size > asset.bytes) {
          await reader.cancel()
          throw new Error('Public codec fixture integrity failed')
        }
        chunks.push(item.value)
      }
      bytes = Buffer.concat(chunks)
      extractFixture(bytes, asset)
      await writeFile(path, bytes)
    }
    samples.push(extractFixture(bytes, asset))
  }
  await writeFile(join(output, 'codec-samples.json'), JSON.stringify(samples, null, 2) + '\n')
  console.log('固定公開codec fixtures與SHA256：PASS')
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await prepareFixtures()
