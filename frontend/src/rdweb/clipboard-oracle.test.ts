import { expect, it } from 'vitest'
import { OPERATION_CODES } from './interaction-types'
import {
  clipboardOracleCode,
  type ClipboardOracleStage,
  type ClipboardOracleEvidence,
} from '../../e2e/real/clipboard-oracle'

const evidence: ClipboardOracleEvidence = {
  matched: false,
  readable: true,
  sentinelUnchanged: false,
  receiving: false,
  fallback: false,
  inputActive: true,
  streaming: true,
  operationCode: 'none',
}
// 原始文字不進分類器；兩個stage必須保持可分辨的固定成功／失敗結果。
it.each(['remote_input', 'outbound_roundtrip'] as const)(
  'classifies successful %s without diagnostics',
  (stage) => {
    expect(clipboardOracleCode(stage, { ...evidence, matched: true })).toBeNull()
  },
)
// operation-code優先於sentinel或read失敗，避免把官方permission／timeout混成內容不符。
it.each(OPERATION_CODES)('preserves fixed operation code %s at each stage', (operationCode) => {
  for (const stage of ['remote_input', 'outbound_roundtrip'] as const) {
    expect(
      clipboardOracleCode(stage, {
        ...evidence,
        operationCode,
        readable: false,
        sentinelUnchanged: true,
      }),
    ).toBe('input_clipboard_' + stage + '_' + operationCode)
  }
})
// sentinel仍在、OS不能讀與不相等結果分開，不回顯實際clipboard內容。
it.each([
  ['remote_input', false, true, 'input_clipboard_remote_input_local_unavailable'],
  ['remote_input', true, true, 'input_clipboard_remote_input_no_local_result'],
  ['remote_input', true, false, 'input_clipboard_remote_input_mismatch'],
  ['outbound_roundtrip', false, true, 'input_clipboard_outbound_roundtrip_local_unavailable'],
  ['outbound_roundtrip', true, true, 'input_clipboard_outbound_roundtrip_no_local_result'],
  ['outbound_roundtrip', true, false, 'input_clipboard_outbound_roundtrip_mismatch'],
] as const)(
  'separates %s local evidence readable=%s sentinel=%s',
  (stage, readable, sentinelUnchanged, code) => {
    expect(clipboardOracleCode(stage, { ...evidence, readable, sentinelUnchanged })).toBe(code)
  },
)
// 非白名單stage／operation code不能被拼到報告，即使字串看似公開值也拒絕。
it.each([
  ['public-untrusted-stage', evidence],
  ['remote_input', { ...evidence, operationCode: 'public-untrusted-code' }],
  ['remote_input', { ...evidence, operationCode: undefined }],
  ['remote_input', null],
] as const)('rejects malformed classification input %s', (stage, value) => {
  expect(clipboardOracleCode(stage as ClipboardOracleStage, value as ClipboardOracleEvidence)).toBe(
    'input_clipboard_evidence_unavailable',
  )
})
// 所有safe欄位必須是真boolean，不接受含任意字串的truthy物件或缺值。
it.each([
  'matched',
  'readable',
  'sentinelUnchanged',
  'receiving',
  'fallback',
  'inputActive',
  'streaming',
] as const)('rejects nonboolean %s evidence', (field) => {
  expect(
    clipboardOracleCode('remote_input', {
      ...evidence,
      [field]: 'public-untrusted-value',
    } as unknown as ClipboardOracleEvidence),
  ).toBe('input_clipboard_evidence_unavailable')
  expect(
    clipboardOracleCode('remote_input', {
      ...evidence,
      [field]: undefined,
    } as unknown as ClipboardOracleEvidence),
  ).toBe('input_clipboard_evidence_unavailable')
})
