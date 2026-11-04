import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { FAILURE_CODES } from '../../src/rdweb/types'

export interface ConnectionResult {
  platform: 'linux' | 'windows'
  transport: 'tcp' | 'ws'
  ordinal: number
  elapsed_ms: number
  first_attempt: boolean
  code: string
}

// 報告只接受正式failure分類及三個固定test-only結果；其他文字一律不可落盤。
const SAFE_CODES = new Set<string>([
  ...FAILURE_CODES,
  'ok',
  'cleanup_failed',
  'input_oracle_failed',
])
// 未知UI值或exception文字不可進報告，統一退回固定連線逾時分類。
export function reliabilityCode(value: string | null | undefined): string {
  return typeof value === 'string' && SAFE_CODES.has(value) ? value : 'connection_timeout'
}
// 50筆原始順序是驗收證據：平台、奇偶transport、ordinal、elapsed與安全碼缺一不可。
export function validateReliabilityResults(
  platform: 'linux' | 'windows',
  values: readonly ConnectionResult[],
): void {
  if (
    values.length !== 50 ||
    values.some(
      /* 每列只驗固定scalar與白名單，不接受額外truthy文字。 */ (value, index) =>
        value.platform !== platform ||
        value.ordinal !== index + 1 ||
        value.transport !== (index % 2 === 0 ? 'tcp' : 'ws') ||
        !Number.isSafeInteger(value.elapsed_ms) ||
        value.elapsed_ms < 0 ||
        typeof value.first_attempt !== 'boolean' ||
        !SAFE_CODES.has(value.code),
    )
  )
    throw new Error('Safe reliability results invalid')
}
// 只寫入白名單欄位；呼叫端額外物件欄位不會被序列化，避免夾帶秘密或原始錯誤。
export async function writeSafeReliabilityResults(
  platform: 'linux' | 'windows',
  values: readonly ConnectionResult[],
  version: string,
  directory = fileURLToPath(new URL('../../../artifacts/', import.meta.url)),
): Promise<void> {
  validateReliabilityResults(platform, values)
  if (!version || version.length > 128 || /[\r\n]/.test(version))
    throw new Error('Safe reliability results invalid')
  const rows = values.map(
    /* 明確重建每列，不沿用可能含額外欄位的原物件。 */ (value) => ({
      platform: value.platform,
      transport: value.transport,
      ordinal: value.ordinal,
      elapsed_ms: value.elapsed_ms,
      first_attempt: value.first_attempt,
      code: value.code,
    }),
  )
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(
    directory + '/m3b3-' + platform + '-reliability.json',
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        version,
        success: rows.filter((value) => value.first_attempt).length,
        results: rows,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  )
}
// 只從既有alert讀固定error-code；逾時、關頁或未知值均退回安全分類。
export async function safeFailureCode(page: Page): Promise<string> {
  try {
    return reliabilityCode(
      await page.getByRole('alert').getAttribute('data-error-code', { timeout: 1000 }),
    )
  } catch {
    return reliabilityCode(null)
  }
}
