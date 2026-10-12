import { OPERATION_CODES, type OperationCode } from '../src/rdweb/interaction-types'

export type ClipboardOracleStage = 'remote_input' | 'outbound_roundtrip'
export interface ClipboardOracleEvidence {
  matched: boolean
  readable: boolean
  sentinelUnchanged: boolean
  receiving: boolean
  fallback: boolean
  inputActive: boolean
  streaming: boolean
  operationCode: OperationCode | 'none'
}
// Test-only固定分類，只接受stage／operation白名單與真正boolean，不回顯任意輸入。
export function clipboardOracleCode(
  stage: ClipboardOracleStage,
  evidence: ClipboardOracleEvidence,
): string | null {
  if (
    !['remote_input', 'outbound_roundtrip'].includes(stage) ||
    !evidence ||
    [
      'matched',
      'readable',
      'sentinelUnchanged',
      'receiving',
      'fallback',
      'inputActive',
      'streaming',
    ].some(
      /* 診斷不能接受任意truthy文字或DOM值。 */ (field) =>
        typeof evidence[field as keyof ClipboardOracleEvidence] !== 'boolean',
    ) ||
    (evidence.operationCode !== 'none' && !OPERATION_CODES.includes(evidence.operationCode))
  )
    return 'input_clipboard_evidence_unavailable'
  if (evidence.matched) return null
  const prefix = 'input_clipboard_' + stage + '_'
  if (evidence.operationCode !== 'none') return prefix + evidence.operationCode
  if (!evidence.readable) return prefix + 'local_unavailable'
  if (evidence.sentinelUnchanged) return prefix + 'no_local_result'
  return prefix + 'mismatch'
}
