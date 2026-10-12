import { hbb } from './codec'
import { checkDisplay } from './video-limits'
import { int32, utf8, INTERACTION_LIMITS } from './interaction-limits'
import {
  CONTROL_NAMES,
  type InputIntent,
  type PeerInputMetadata,
  type Modifier,
  type ControlName,
} from './interaction-types'
const MODIFIERS = new Set<Modifier>(['Alt', 'Control', 'Shift', 'Meta', 'CapsLock', 'NumLock'])
const EXPLICIT_MODIFIER_FAMILY: Partial<Record<ControlName, Modifier>> = {
  Control: 'Control',
  RControl: 'Control',
  Shift: 'Shift',
  RShift: 'Shift',
  Alt: 'Alt',
  RAlt: 'Alt',
  Meta: 'Meta',
  RWin: 'Meta',
}
// 僅接受白名單修飾鍵，禁止重複及非陣列資料。
export function modifiers(value: Modifier[]): number[] {
  if (
    !Array.isArray(value) ||
    value.length > 6 ||
    new Set(value).size !== value.length ||
    value.some(/* 拒絕非白名單修飾鍵。 */ (m) => !MODIFIERS.has(m))
  )
    throw new Error('protocol_error')
  return value.map(/* 轉成 pinned enum。 */ (m) => hbb.ControlKey[m])
}
// 只轉接核准 ASCII shortcut 到 Windows virtual VK，不傳 scan-code。
export function windowsVk(char: string): number {
  if (/^[a-z]$/i.test(char)) return char.toUpperCase().charCodeAt(0)
  if (/^[0-9]$/.test(char)) return char.charCodeAt(0)
  const table: Record<string, number> = {
    ';': 0xba,
    '=': 0xbb,
    '+': 0xbb,
    ',': 0xbc,
    '-': 0xbd,
    '.': 0xbe,
    '/': 0xbf,
    '`': 0xc0,
    '[': 0xdb,
    '\\': 0xdc,
    ']': 0xdd,
    "'": 0xde,
  }
  if (!Object.hasOwn(table, char)) throw new Error('input_unsupported')
  return table[char]!
}
// local 座標與 Worker 私有原點分別驗證，拒絕 signed overflow。
export function remotePoint(
  meta: PeerInputMetadata,
  x: number,
  y: number,
): { x: number; y: number } {
  const g = meta.geometry
  checkDisplay(g)
  int32(g.x)
  int32(g.y)
  int32(g.x + g.width - 1)
  int32(g.y + g.height - 1)
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= g.width ||
    y >= g.height
  )
    throw new Error('protocol_error')
  return { x: int32(g.x + x), y: int32(g.y + y) }
}
// 先驗 primitive intent，再由原生成 encoder 與唯一 secretbox sender 提交。
export function encodeInput(v: InputIntent, meta: PeerInputMetadata): hbb.IMessage[] {
  if (!v || !['move', 'button', 'wheel', 'key', 'shortcut', 'text', 'sas'].includes(v.kind))
    throw new Error('protocol_error')
  if (meta.platform === 'unsupported') throw new Error('input_unsupported')
  const mode = hbb.KeyboardMode.Legacy
  const mods = v.kind === 'move' || v.kind === 'sas' ? [] : modifiers(v.modifiers)
  if (
    ['key', 'shortcut', 'button'].includes(v.kind) &&
    (!('down' in v) || typeof v.down !== 'boolean')
  )
    throw new Error('protocol_error')
  if (v.kind === 'text') {
    const bytes = utf8(v.text, INTERACTION_LIMITS.text, 'input_text_too_large')
    bytes.fill(0)
    if (
      !v.text ||
      v.modifiers.some(
        /* 文字不得挾帶 hot modifier。 */ (m) => !['Shift', 'CapsLock', 'NumLock'].includes(m),
      )
    )
      throw new Error('input_unsupported')
    return [{ keyEvent: { seq: v.text, down: true, press: false, mode, modifiers: mods } }]
  }
  if (v.kind === 'sas') {
    if (meta.platform !== 'windows' || !meta.sas) throw new Error('input_unsupported')
    return [{ keyEvent: { controlKey: hbb.ControlKey.CtrlAltDel, down: true, press: false, mode } }]
  }
  if (v.kind === 'key') {
    if (!CONTROL_NAMES.includes(v.key)) throw new Error('protocol_error')
    // Windows Legacy會在事件尾放開暫加modifier；明確down的自身家族不能被暫加。
    const own = EXPLICIT_MODIFIER_FAMILY[v.key]
    const keyMods =
      meta.platform === 'windows' && v.down && own
        ? mods.filter(
            /* 只排除自身家族，保留其它快捷鍵與lock狀態。 */ (m) => m !== hbb.ControlKey[own],
          )
        : mods
    return [
      {
        keyEvent: {
          controlKey: hbb.ControlKey[v.key],
          down: v.down,
          press: false,
          mode,
          modifiers: keyMods,
        },
      },
    ]
  }
  if (v.kind === 'shortcut') {
    if (typeof v.char !== 'string' || !/^[\x20-\x7e]$/.test(v.char))
      throw new Error('input_unsupported')
    return [
      {
        keyEvent: {
          chr: meta.platform === 'windows' ? windowsVk(v.char) * 65536 : v.char.charCodeAt(0),
          down: v.down,
          press: false,
          mode: meta.platform === 'windows' ? hbb.KeyboardMode.Translate : mode,
          modifiers: mods,
        },
      },
    ]
  }
  if (v.kind === 'wheel') {
    if (
      ![v.dx, v.dy].every(
        /* 每軸只接受有限整數步。 */ (n) => Number.isInteger(n) && Math.abs(n) <= 8,
      )
    )
      throw new Error('protocol_error')
    return [{ mouseEvent: { mask: 3, x: -v.dx, y: -v.dy, modifiers: mods } }]
  }
  const p = remotePoint(meta, v.x, v.y)
  const move: hbb.IMessage = { mouseEvent: { mask: 0, ...p } }
  if (v.kind === 'move') return [move]
  if (!['left', 'middle', 'right'].includes(v.button)) throw new Error('protocol_error')
  const button = { left: 1, right: 2, middle: 4 }[v.button]
  return [move, { mouseEvent: { mask: button * 8 + (v.down ? 1 : 2), ...p, modifiers: mods } }]
}
