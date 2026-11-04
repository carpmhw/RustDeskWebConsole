import protobuf from 'protobufjs/light.js'
import schema from './generated/receiver-schema.js'
import { hbb as rendezvous } from './generated/rendezvous.js'
import { hbb } from '../../src/rdweb/generated/message.js'
import { visitWire } from '../../src/rdweb/wire-admission.ts'
import { receiverUnavailable } from './contract.ts'

export type ReceiverControl = rendezvous.IRendezvousMessage
const root = protobuf.Root.fromJSON(schema).resolveAll()
const controlType = root.lookupType('hbb.RendezvousMessage'),
  peerType = root.lookupType('hbb.Message')
const controlUnions = new Set([
  'registerPeer',
  'registerPeerResponse',
  'registerPk',
  'registerPkResponse',
  'punchHole',
  'fetchLocalAddr',
  'requestRelay',
  'relayResponse',
])

// 欄位型別與oneof來自固定proto生成metadata，不憑記憶重建wire欄號。
function admit(bytes: Uint8Array, type: protobuf.Type, budget = { fields: 0 }, depth = 0): void {
  if (depth > 8 || bytes.length > 65536) return receiverUnavailable()
  const seen = new Set<number>(),
    unions = new Set<string>()
  visitWire(bytes, budget, (field) => {
    // 每層拒絕非repeated重複與多個oneof成員，避免generated最後值覆蓋。
    const f = type.fieldsById[field.number]
    if (!f || (seen.has(field.number) && !f.repeated)) return receiverUnavailable()
    seen.add(field.number)
    if (f.partOf) {
      if (unions.has(f.partOf.name)) return receiverUnavailable()
      unions.add(f.partOf.name)
    }
    const nested = f.resolvedType instanceof protobuf.Type ? f.resolvedType : null
    const wire =
      nested || f.type === 'bytes' || f.type === 'string'
        ? 2
        : ['double', 'fixed64', 'sfixed64'].includes(f.type)
          ? 1
          : ['float', 'fixed32', 'sfixed32'].includes(f.type)
            ? 5
            : 0
    if (field.wire !== wire && !(f.repeated && f.packed && field.wire === 2))
      return receiverUnavailable()
    if (nested) admit(field.bytes!, nested, budget, depth + 1)
    if (f.type === 'string') {
      const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(field.bytes!)
      if (value.includes('\0')) return receiverUnavailable()
    }
  })
}

// UDP與TCP控制共用同一pinned protobuf，framing由transport另行處理。
export function encodeReceiverControl(value: ReceiverControl): Uint8Array {
  try {
    if (rendezvous.RendezvousMessage.verify(value)) return receiverUnavailable()
    const bytes = rendezvous.RendezvousMessage.encode(value).finish()
    decodeReceiverControl(bytes)
    return new Uint8Array(bytes)
  } catch {
    return receiverUnavailable()
  }
}

// 先入場再解碼，拒絕未知控制功能或不唯一union。
export function decodeReceiverControl(bytes: Uint8Array): rendezvous.RendezvousMessage {
  try {
    admit(bytes, controlType)
    const value = rendezvous.RendezvousMessage.decode(bytes)
    if (
      !value.union ||
      !controlUnions.has(value.union) ||
      rendezvous.RendezvousMessage.verify(value)
    )
      return receiverUnavailable()
    return value
  } catch {
    return receiverUnavailable()
  }
}

// 接收方向需驗LoginRequest／KeyEvent等nested wire，不能只用sender的根oneof檢查。
export function decodeReceiverPeerMessage(bytes: Uint8Array): hbb.Message {
  try {
    admit(bytes, peerType)
    const value = hbb.Message.decode(bytes)
    if (!value.union || hbb.Message.verify(value)) return receiverUnavailable()
    return value
  } catch {
    return receiverUnavailable()
  }
}
