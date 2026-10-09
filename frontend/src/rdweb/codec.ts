import { hbb } from './generated/message.js'
export { hbb }
export const CONTROL_LIMIT = 65536
// 生成codec負責schema，wrapper只驗型別、oneof與控制大小，不回原始錯誤。
export function encodeMessage(value: hbb.IMessage): Uint8Array {
  try {
    if (hbb.Message.verify(value)) throw new Error()
    const bytes = hbb.Message.encode(value).finish()
    if (bytes.length > CONTROL_LIMIT) throw new Error()
    return new Uint8Array(bytes)
  } catch {
    throw new Error('protocol_error')
  }
}
// 每個控制envelope必須有唯一oneof，損壞protobuf不泄漏payload。
export function decodeMessage(bytes: Uint8Array): hbb.Message {
  try {
    if (bytes.length > CONTROL_LIMIT) throw new Error()
    const value = hbb.Message.decode(bytes)
    if (hbb.Message.verify(value) || !value.union) throw new Error()
    return value
  } catch {
    throw new Error('protocol_error')
  }
}
// 身份payload只使用固定IdPk schema。
export function encodeIdentity(value: hbb.IIdPk): Uint8Array {
  if (hbb.IdPk.verify(value)) throw new Error('protocol_error')
  return new Uint8Array(hbb.IdPk.encode(value).finish())
}
// Ed25519驗證完成後才可讀取受限IdPk欄位。
export function decodeIdentity(bytes: Uint8Array): hbb.IdPk {
  try {
    if (bytes.length > CONTROL_LIMIT) throw new Error()
    const value = hbb.IdPk.decode(bytes)
    if (!value.id || value.pk.length !== 32) throw new Error()
    return value
  } catch {
    throw new Error('protocol_error')
  }
}
