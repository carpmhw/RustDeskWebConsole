import { randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ClipboardTextRecord {
  transport: 'tcp' | 'ws'
  stage: 'remote_input' | 'outbound_roundtrip'
  expected: string
  nativeWrite: string | null
  readback: string | null
  source: 'native' | 'fallback' | 'unavailable'
}
export interface ClipboardTextLogger {
  // 只寫本輪明確欄位，不接受runtime或任意metadata。
  write(record: ClipboardTextRecord): void
}
// 明確opt-in且非CI才建立本機私有log；沒有讀取任何Windowsruntime秘密。
export function createClipboardTextLogger(
  env: Readonly<Record<string, string | undefined>>,
  directory = fileURLToPath(new URL('../.cache/windows-clipboard-text/', import.meta.url)),
): ClipboardTextLogger | null {
  const value = env.RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG
  if (value === undefined || value === '0') return null
  if (value !== '1' || env.CI || env.GITHUB_ACTIONS || process.platform !== 'linux')
    throw new Error('clipboard_text_log_unavailable')
  let path: string
  try {
    path = resolve(directory)
    // 只容許普通目錄路徑；同帳號trusted runtime仍是必要前提，不宣稱抵抗同帳號競態。
    for (let parent = path; ; parent = dirname(parent)) {
      try {
        const stat = lstatSync(parent)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error()
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error
      }
      if (dirname(parent) === parent) break
    }
    mkdirSync(path, { recursive: true, mode: 0o700 })
    const stat = lstatSync(path)
    if (stat.uid !== process.getuid!() || (stat.mode & 0o777) !== 0o700) throw new Error()
  } catch {
    throw new Error('clipboard_text_log_unavailable')
  }
  return {
    // 固定schema／32KiB UTF-8先驗，再以exclusive 0600檔案保存；錯誤不回原值或fs例外。
    write(record: ClipboardTextRecord): void {
      let fd: number | undefined
      let file: string | undefined
      try {
        const fields = ['transport', 'stage', 'expected', 'nativeWrite', 'readback', 'source']
        if (
          !record ||
          Object.keys(record).length !== fields.length ||
          Object.keys(record).some(
            /* 不允許runtime或其他metadata混入。 */ (key) => !fields.includes(key),
          ) ||
          !['tcp', 'ws'].includes(record.transport) ||
          !['remote_input', 'outbound_roundtrip'].includes(record.stage) ||
          !['native', 'fallback', 'unavailable'].includes(record.source) ||
          typeof record.expected !== 'string' ||
          !record.expected.startsWith('Public ')
        )
          throw new Error()
        for (const text of [record.expected, record.nativeWrite, record.readback]) {
          if (text === null) continue
          if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 32768) throw new Error()
        }
        const stat = lstatSync(path)
        if (
          !stat.isDirectory() ||
          stat.isSymbolicLink() ||
          stat.uid !== process.getuid!() ||
          (stat.mode & 0o777) !== 0o700
        )
          throw new Error()
        const data =
          JSON.stringify(
            {
              utc: new Date().toISOString(),
              transport: record.transport,
              stage: record.stage,
              expected: record.expected,
              nativeWrite: record.nativeWrite,
              readback: record.readback,
              source: record.source,
            },
            null,
            2,
          ) + '\n'
        const candidate = join(
          path,
          record.transport + '-' + record.stage + '-' + randomUUID() + '.json',
        )
        fd = openSync(
          candidate,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600,
        )
        file = candidate
        if ((fstatSync(fd).mode & 0o777) !== 0o600) throw new Error()
        writeFileSync(fd, data, 'utf8')
      } catch {
        if (file) {
          try {
            unlinkSync(file)
          } catch {
            /* 只最佳努力移除本次新建的不完整檔案。 */
          }
        }
        throw new Error('clipboard_text_log_unavailable')
      } finally {
        if (fd !== undefined) {
          try {
            closeSync(fd)
          } catch {
            throw new Error('clipboard_text_log_unavailable')
          }
        }
      }
    },
  }
}
