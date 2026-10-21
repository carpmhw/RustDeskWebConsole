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
import type { KeyboardEmissionLog } from './input-diagnostics'
import type { PreEncryptInputEvidence } from './encoded-input-diagnostics'
import type { PreTransferClipboardEvidence } from './clipboard-transfer-diagnostics'
import type { PreDecodeClipboardEvidence } from '../../src/rdweb/incoming-clipboard-observer'
import { validateHostTimeline, type HostMainTimeline } from './host-observation-schema.ts'

export interface ClipboardTextRecord {
  transport: 'tcp' | 'ws'
  stage: 'remote_input' | 'outbound_roundtrip'
  expected: string
  nativeWrite: string | null
  readback: string | null
  source: 'native' | 'fallback' | 'unavailable'
  keyboardEmission?: KeyboardEmissionLog
  preEncryptInput?: PreEncryptInputEvidence
  preEncryptText?: string | null
  preTransferClipboard?: PreTransferClipboardEvidence
  preDecodeClipboard?: PreDecodeClipboardEvidence
  preDecodeText?: string | null
  hostTimeline?: HostMainTimeline
}
export interface ClipboardTextLogger {
  // 只寫本輪明確欄位，不接受runtime或任意metadata。
  write(record: ClipboardTextRecord): void
}
// 雜湊亦只存於opt-in私有檔；固定schema拒絕原文、任意metadata與無界紀錄。
function validateKeyboardEmission(value: KeyboardEmissionLog): void {
  const fields = [
    'sequence',
    'eventId',
    'phase',
    'type',
    'composing',
    'internalComposing',
    'confirmed',
    'codePoints',
    'utf8Bytes',
    'sha256',
  ]
  if (
    !value ||
    Object.keys(value).length !== 3 ||
    Object.keys(value).some(
      /* 只容許明確摘要欄位。 */ (key) => !['records', 'overflow', 'hashUnavailable'].includes(key),
    ) ||
    !Array.isArray(value.records) ||
    value.records.length > 64 ||
    value.records.length % 2 !== 0 ||
    typeof value.overflow !== 'boolean' ||
    typeof value.hashUnavailable !== 'boolean'
  )
    throw new Error()
  for (const [index, row] of value.records.entries()) {
    if (
      !row ||
      Object.keys(row).length !== fields.length ||
      Object.keys(row).some(
        /* 不容許data或confirmed原文等附帶資料。 */ (key) => !fields.includes(key),
      ) ||
      row.sequence !== index + 1 ||
      !Number.isSafeInteger(row.eventId) ||
      row.eventId < 1 ||
      row.phase !== (index % 2 === 0 ? 'before' : 'after') ||
      (index % 2 === 1 && row.eventId !== value.records[index - 1]!.eventId) ||
      !['insertText', 'insertFromComposition'].includes(row.type) ||
      typeof row.composing !== 'boolean' ||
      typeof row.internalComposing !== 'boolean' ||
      !['null', 'same_as_data', 'other'].includes(row.confirmed) ||
      !Number.isSafeInteger(row.codePoints) ||
      row.codePoints < 1 ||
      row.codePoints > 4096 ||
      !Number.isSafeInteger(row.utf8Bytes) ||
      row.utf8Bytes < row.codePoints ||
      row.utf8Bytes > 4096 ||
      (row.sha256 !== null &&
        (typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256)))
    )
      throw new Error()
  }
  if (
    value.hashUnavailable !==
    value.records.some(/* null須明確標不可用，不能偽裝完整hash。 */ (row) => row.sha256 === null)
  )
    throw new Error()
}
// 固定十boolean，不接受原文、hash、wire、scope或securitymetadata。
function validatePreEncryptInput(value: PreEncryptInputEvidence): void {
  const fields = [
    'observed',
    'textExact',
    'textSingle',
    'initialSelectComplete',
    'receiveSelectComplete',
    'receiveCopyComplete',
    'sequenceComplete',
    'sequenceInvalid',
    'overflow',
    'unavailable',
  ]
  if (
    !value ||
    Object.keys(value).length !== fields.length ||
    Object.keys(value).some(/* 僅診斷布林白名單。 */ (key) => !fields.includes(key)) ||
    fields.some(
      /* 全部欄位必須own且真boolean。 */ (key) =>
        !Object.hasOwn(value, key) ||
        typeof value[key as keyof PreEncryptInputEvidence] !== 'boolean',
    )
  )
    throw new Error()
}
// 新原文只允許有同輪實際seq佐證的公開fixture，null明確表示未保存。
function validatePreEncryptText(record: ClipboardTextRecord): string | null {
  const text = record.preEncryptText
  if (text === null) return null
  if (
    typeof text !== 'string' ||
    text !== record.expected ||
    !text.startsWith('Public ') ||
    text.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text) ||
    text.length > 4096 ||
    Buffer.byteLength(text, 'utf8') > 4096 ||
    !Object.hasOwn(record, 'preEncryptInput')
  )
    throw new Error()
  validatePreEncryptInput(record.preEncryptInput!)
  const evidence = record.preEncryptInput!
  if (
    !evidence.observed ||
    !evidence.textExact ||
    !evidence.textSingle ||
    evidence.overflow ||
    evidence.unavailable
  )
    throw new Error()
  return text
}
// 四個own boolean白名單，拒絕prototype冒充與任意raw欄位。
function validatePreTransferClipboard(value: PreTransferClipboardEvidence): void {
  const fields = ['compared', 'exact', 'overflow', 'unavailable'] as const
  if (
    !value ||
    Object.keys(value).length !== 4 ||
    fields.some(
      /* 精確四own boolean，不准額外原文／bytes／hash。 */ (field) =>
        !Object.hasOwn(value, field) || typeof value[field] !== 'boolean',
    )
  )
    throw new Error()
}
// 明確opt-in且非CI才建立本機私有log；沒有讀取任何Windowsruntime秘密。
function validatePreDecodeClipboard(value: PreDecodeClipboardEvidence): void {
  const fields = [
    'observed',
    'compressed',
    'uncompressedCompared',
    'uncompressedExact',
    'overflow',
    'unavailable',
  ] as const
  if (
    !value ||
    Object.keys(value).length !== 6 ||
    fields.some(
      /* 精確六own boolean，不容許raw／hash／nonce或scope。 */ (field) =>
        !Object.hasOwn(value, field) || typeof value[field] !== 'boolean',
    )
  )
    throw new Error()
}
// 原content文字須raw exact與同輪成功transfer佐證，驗好primitive後不得重讀getter。
function validatePreDecodeText(record: ClipboardTextRecord): string | null {
  const text = record.preDecodeText
  if (text === null) return null
  if (
    typeof text !== 'string' ||
    text !== record.expected ||
    !text.startsWith('Public ') ||
    text.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text) ||
    text.length > 4096 ||
    Buffer.byteLength(text, 'utf8') > 4096 ||
    !Object.hasOwn(record, 'preDecodeClipboard') ||
    !Object.hasOwn(record, 'preTransferClipboard')
  )
    throw new Error()
  validatePreDecodeClipboard(record.preDecodeClipboard!)
  validatePreTransferClipboard(record.preTransferClipboard!)
  const raw = record.preDecodeClipboard!,
    transfer = record.preTransferClipboard!
  if (
    !raw.observed ||
    raw.compressed ||
    !raw.uncompressedCompared ||
    !raw.uncompressedExact ||
    raw.overflow ||
    raw.unavailable ||
    !transfer.compared ||
    !transfer.exact ||
    transfer.overflow ||
    transfer.unavailable
  )
    throw new Error()
  return text
}
// 明確opt-in且非CI才建立本機私有log；沒有讀取任何Windowsruntime秘密。
export function createClipboardTextLogger(
  env: Readonly<Record<string, string | undefined>>,
  directory = fileURLToPath(new URL('../../.cache/windows-clipboard-text/', import.meta.url)),
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
        if (Object.hasOwn(record ?? {}, 'keyboardEmission')) fields.push('keyboardEmission')
        if (Object.hasOwn(record ?? {}, 'preEncryptInput')) fields.push('preEncryptInput')
        if (Object.hasOwn(record ?? {}, 'preEncryptText')) fields.push('preEncryptText')
        if (Object.hasOwn(record ?? {}, 'preTransferClipboard')) fields.push('preTransferClipboard')
        if (Object.hasOwn(record ?? {}, 'preDecodeClipboard')) fields.push('preDecodeClipboard')
        if (Object.hasOwn(record ?? {}, 'preDecodeText')) fields.push('preDecodeText')
        if (Object.hasOwn(record ?? {}, 'hostTimeline')) fields.push('hostTimeline')
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
        if (fields.includes('keyboardEmission')) validateKeyboardEmission(record.keyboardEmission!)
        if (fields.includes('preEncryptInput')) validatePreEncryptInput(record.preEncryptInput!)
        const preEncryptText = fields.includes('preEncryptText')
          ? validatePreEncryptText(record)
          : undefined
        if (fields.includes('preTransferClipboard'))
          validatePreTransferClipboard(record.preTransferClipboard!)
        if (fields.includes('preDecodeClipboard'))
          validatePreDecodeClipboard(record.preDecodeClipboard!)
        const preDecodeText = fields.includes('preDecodeText')
          ? validatePreDecodeText(record)
          : undefined
        const hostTimeline = fields.includes('hostTimeline')
          ? validateHostTimeline(record.hostTimeline)
          : undefined
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
              ...(record.keyboardEmission ? { keyboardEmission: record.keyboardEmission } : {}),
              ...(record.preEncryptInput ? { preEncryptInput: record.preEncryptInput } : {}),
              ...(fields.includes('preEncryptText') ? { preEncryptText } : {}),
              ...(record.preTransferClipboard
                ? { preTransferClipboard: record.preTransferClipboard }
                : {}),
              ...(record.preDecodeClipboard
                ? { preDecodeClipboard: record.preDecodeClipboard }
                : {}),
              ...(fields.includes('preDecodeText') ? { preDecodeText } : {}),
              ...(hostTimeline ? { hostTimeline } : {}),
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
