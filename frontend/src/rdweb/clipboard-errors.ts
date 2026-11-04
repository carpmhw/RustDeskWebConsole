import { OPERATION_CODES, type OperationCode } from './interaction-types'
// Main／Worker 共用純分類 helper，不將 protobuf／decoder 匯入 Main。
export function clipboardError(error: unknown): OperationCode {
  return error instanceof Error &&
    OPERATION_CODES.includes(error.message as OperationCode) &&
    error.message.startsWith('clipboard_')
    ? (error.message as OperationCode)
    : 'clipboard_invalid'
}
