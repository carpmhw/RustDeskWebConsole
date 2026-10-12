import { expect, it } from 'vitest'
import { hbb, decodeMessage } from './codec'
import { encodeInput } from './input-codec'
import {
  CONTROL_NAMES,
  type InputIntent,
  type PeerInputMetadata,
  type ControlName,
  type Modifier,
} from './interaction-types'
const meta: PeerInputMetadata = {
  geometry: { display: 0, width: 320, height: 240, x: -320, y: 0 },
  platform: 'windows',
  sas: true,
}
// 滑鼠 mask 及座標依 pinned 協定，不從 Main 取得原點。
it('uses signed origin, pinned buttons and canonical wheel signs', () => {
  for (const [button, bit] of [
    ['left', 1],
    ['right', 2],
    ['middle', 4],
  ] as const) {
    for (const down of [true, false]) {
      const messages = encodeInput(
        { kind: 'button', button, down, x: 10, y: 20, modifiers: [] },
        meta,
      )
      expect(messages).toHaveLength(2)
      expect(messages[0]!.mouseEvent).toEqual({ mask: 0, x: -310, y: 20 })
      expect(messages[1]!.mouseEvent?.mask).toBe(bit * 8 + (down ? 1 : 2))
    }
  }
  expect(encodeInput({ kind: 'wheel', dx: 2, dy: -3, modifiers: [] }, meta)[0]!.mouseEvent).toEqual(
    { mask: 3, x: -2, y: 3, modifiers: [] },
  )
})
// 語意文字與 SAS 一次送出，Windows shortcut down/up 使用同一 VK。
it('keeps semantic text atomic and Windows shortcuts releasable', () => {
  expect(encodeInput({ kind: 'text', text: '中文', modifiers: [] }, meta)).toEqual([
    { keyEvent: { seq: '中文', down: true, press: false, mode: 0, modifiers: [] } },
  ])
  const down = encodeInput(
    { kind: 'shortcut', char: 'a', down: true, modifiers: ['Control'] },
    meta,
  )[0]!.keyEvent!
  const up = encodeInput({ kind: 'shortcut', char: 'a', down: false, modifiers: [] }, meta)[0]!
    .keyEvent!
  expect(down.mode).toBe(hbb.KeyboardMode.Translate)
  expect(down.chr).toBe(0x410000)
  expect(up.chr).toBe(down.chr)
  expect(encodeInput({ kind: 'sas' }, meta)).toEqual([
    { keyEvent: { controlKey: 100, down: true, press: false, mode: 0 } },
  ])
  expect(() => encodeInput({ kind: 'sas' }, { ...meta, sas: false })).toThrow('input_unsupported')
  expect(() => encodeInput({ kind: 'sas' }, { ...meta, platform: 'linux' })).toThrow(
    'input_unsupported',
  )
  expect(
    encodeInput(
      { kind: 'shortcut', char: 'a', down: false, modifiers: [] },
      { ...meta, platform: 'linux' },
    )[0]!.keyEvent?.chr,
  ).toBe(97)
})
// Windows Legacy會釋放暫加的modifier，明確down不能將自身家族列為暫加鍵。
it.each<readonly [ControlName, Modifier, number]>([
  ['Control', 'Control', 4],
  ['RControl', 'Control', 74],
  ['Shift', 'Shift', 29],
  ['RShift', 'Shift', 73],
  ['Alt', 'Alt', 1],
  ['RAlt', 'Alt', 75],
  ['Meta', 'Meta', 23],
  ['RWin', 'Meta', 64],
])('keeps explicit Windows %s down out of temporary modifiers', (key, family, controlKey) => {
  const intent: InputIntent = {
    kind: 'key',
    key,
    down: true,
    modifiers: [family, 'CapsLock', 'NumLock'],
  }
  expect(encodeInput(intent, meta)[0]!.keyEvent).toEqual({
    controlKey,
    down: true,
    press: false,
    mode: 0,
    modifiers: [3, 63],
  })
  expect(encodeInput(intent, { ...meta, platform: 'linux' })[0]!.keyEvent?.modifiers).toEqual([
    hbb.ControlKey[family],
    3,
    63,
  ])
})
// 去除自身家族仍需保留其它已按下家族，不把Ctrl+Shift誤變成單鍵。
it('preserves other Windows hot modifiers on explicit modifier down', () => {
  expect(
    encodeInput(
      { kind: 'key', key: 'Control', down: true, modifiers: ['Control', 'Shift', 'Alt'] },
      meta,
    )[0]!.keyEvent?.modifiers,
  ).toEqual([29, 1])
})
// 白名單每個 control key 都保留 enum 值與 up 語意。
it('maps the complete control whitelist and ASCII virtual punctuation', () => {
  for (const key of CONTROL_NAMES) {
    expect(
      encodeInput({ kind: 'key', key, down: false, modifiers: ['Shift'] }, meta)[0]!.keyEvent,
    ).toEqual({
      controlKey: hbb.ControlKey[key],
      down: false,
      press: false,
      mode: 0,
      modifiers: [29],
    })
  }
  for (const [char, vk] of [
    ['1', 0x31],
    [';', 0xba],
    ['=', 0xbb],
    ['+', 0xbb],
    [',', 0xbc],
    ['-', 0xbd],
    ['.', 0xbe],
    ['/', 0xbf],
    ['`', 0xc0],
    ['[', 0xdb],
    ['\\', 0xdc],
    [']', 0xdd],
    ["'", 0xde],
  ] as const)
    expect(
      encodeInput({ kind: 'shortcut', char, down: true, modifiers: [] }, meta)[0]!.keyEvent?.chr,
    ).toBe(vk * 65536)
})
// 不只信任 TS 型別，Worker 接到的 primitive 亦須 runtime 驗證。
it('rejects malformed intents before building wire', () => {
  const values: unknown[] = [
    { kind: 'move', x: -1, y: 0 },
    { kind: 'move', x: 320, y: 0 },
    { kind: 'move', x: NaN, y: 0 },
    { kind: 'key', key: 'CtrlAltDel', down: true, modifiers: [] },
    { kind: 'key', key: 'Return', down: 1, modifiers: [] },
    { kind: 'key', key: 'Return', modifiers: [] },
    { kind: 'key', key: 'Return', down: true },
    { kind: 'button', button: 'left', x: 1, y: 2, modifiers: [] },
    { kind: 'key', key: 'Return', down: true, modifiers: ['Control', 'Control'] },
    { kind: 'key', key: 'Return', down: true, modifiers: ['Unknown'] },
    { kind: 'wheel', dx: 9, dy: 0, modifiers: [] },
    { kind: 'wheel', dx: 0.1, dy: 0, modifiers: [] },
    { kind: 'button', button: 'other', down: true, x: 1, y: 2, modifiers: [] },
    { kind: 'invalid' },
    null,
  ]
  for (const value of values)
    expect(() => encodeInput(value as InputIntent, meta)).toThrow('protocol_error')
  expect(() => encodeInput({ kind: 'text', text: 'a', modifiers: ['Control'] }, meta)).toThrow(
    'input_unsupported',
  )
  expect(() => encodeInput({ kind: 'text', text: 'a'.repeat(4097), modifiers: [] }, meta)).toThrow(
    'input_text_too_large',
  )
  expect(() =>
    encodeInput(
      { kind: 'move', x: 1, y: 1 },
      { ...meta, geometry: { ...meta.geometry, x: 2147483647 } },
    ),
  ).toThrow('protocol_error')
})
// 獨立 Google.Protobuf literals 作為跨語言 oracle，不靠 TS 自己往返。
it('reads independent CSharp public wire literals', () => {
  expect(decodeMessage(new Uint8Array([0x52, 6, 8, 9, 16, 3, 24, 6])).mouseEvent).toMatchObject({
    mask: 9,
    x: -2,
    y: 3,
  })
  expect(decodeMessage(new Uint8Array([0x7a, 4, 8, 1, 24, 100])).keyEvent).toMatchObject({
    down: true,
    controlKey: 100,
  })
  expect(decodeMessage(new Uint8Array([0x7a, 7, 8, 1, 50, 3, 228, 184, 173])).keyEvent?.seq).toBe(
    '中',
  )
  expect(
    decodeMessage(new Uint8Array([0xe2, 1, 5, 10, 3, 18, 1, 65])).multiClipboards?.clipboards?.[0]
      ?.content,
  ).toEqual(new Uint8Array([65]))
  expect(
    decodeMessage(new Uint8Array([0x9a, 1, 4, 58, 2, 96, 1])).misc?.option?.disableKeyboard,
  ).toBe(1)
})
