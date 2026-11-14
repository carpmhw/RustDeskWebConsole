import { expect, it } from 'vitest'
import { hbb, decodeMessage, encodeMessage } from './codec'
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
  x11: false,
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
// Linux X11 上游 Legacy Seq 走 libxdo 單一 scratch keycode 且按下後即還原，慢 client 掉字或重複前字；
// Translate Seq 改走 TFC 保留式重映射。Wayland／未知顯示伺服器與 Windows 維持 Legacy。
it('sends Linux X11 text as Translate Seq and keeps other peers on Legacy', () => {
  const linux = { ...meta, platform: 'linux' as const, sas: false }
  const intent: InputIntent = { kind: 'text', text: '中文A', modifiers: ['Shift', 'CapsLock'] }
  expect(encodeInput(intent, { ...linux, x11: true })).toEqual([
    {
      keyEvent: {
        seq: '中文A',
        down: true,
        press: false,
        mode: hbb.KeyboardMode.Translate,
        modifiers: [hbb.ControlKey.Shift, hbb.ControlKey.CapsLock],
      },
    },
  ])
  expect(encodeInput(intent, { ...linux, x11: false })[0]!.keyEvent?.mode).toBe(
    hbb.KeyboardMode.Legacy,
  )
  expect(encodeInput(intent, { ...meta, x11: true })[0]!.keyEvent?.mode).toBe(
    hbb.KeyboardMode.Legacy,
  )
  // 文字以外的 Linux 按鍵不受 X11 判定影響。
  expect(
    encodeInput(
      { kind: 'key', key: 'Return', down: true, modifiers: [] },
      { ...linux, x11: true },
    )[0]!.keyEvent?.mode,
  ).toBe(hbb.KeyboardMode.Legacy)
})
// 上游Legacy會釋放暫加的modifier，明確down不能將自身家族列為暫加鍵（Windows與Linux）。
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
  // Linux上游Legacy同樣在事件尾放開暫加modifier（2026-11-03真機xev實測），故同樣排除自身家族。
  expect(encodeInput(intent, { ...meta, platform: 'linux' })[0]!.keyEvent?.modifiers).toEqual([
    3, 63,
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
// pinned rdev keycodes/windows.rs 的 E0 掃描碼；上游遇 0xE0 前綴才設 KEYEVENTF_EXTENDEDKEY。
const WINDOWS_EXTENDED: Partial<Record<ControlName, number>> = {
  LeftArrow: 0xe04b,
  RightArrow: 0xe04d,
  UpArrow: 0xe048,
  DownArrow: 0xe050,
  Home: 0xe047,
  End: 0xe04f,
  PageUp: 0xe049,
  PageDown: 0xe051,
  Insert: 0xe052,
  Delete: 0xe053,
}
// Windows extended 鍵 down／up 皆以 Translate＋E0 掃描碼送出，Linux 與其他功能鍵不變。
it('sends Windows extended keys as E0 scan codes in Translate mode', () => {
  for (const [key, chr] of Object.entries(WINDOWS_EXTENDED) as [ControlName, number][]) {
    for (const down of [true, false])
      for (const [mods, wire] of [
        [['Shift'], [29]],
        [[], []],
      ] as [Modifier[], number[]][]) {
        expect(encodeInput({ kind: 'key', key, down, modifiers: mods }, meta)[0]!.keyEvent).toEqual(
          { chr, down, press: false, mode: hbb.KeyboardMode.Translate, modifiers: wire },
        )
        expect(
          encodeInput(
            { kind: 'key', key, down, modifiers: mods },
            { ...meta, platform: 'linux', sas: false },
          )[0]!.keyEvent,
        ).toEqual({ controlKey: hbb.ControlKey[key], down, press: false, mode: 0, modifiers: wire })
      }
  }
  for (const key of ['F5', 'Escape', 'Backspace'] as ControlName[])
    expect(encodeInput({ kind: 'key', key, down: true, modifiers: [] }, meta)[0]!.keyEvent).toEqual(
      { controlKey: hbb.ControlKey[key], down: true, press: false, mode: 0, modifiers: [] },
    )
})
// Linux 上游 Legacy 同樣在事件尾放開暫加 modifier：明確修飾鍵 down 不得帶自身家族，否則按住會被立即放開。
it('omits the own modifier family on explicit Linux modifier down', () => {
  const linux = { ...meta, platform: 'linux' as const, sas: false }
  expect(
    encodeInput(
      { kind: 'key', key: 'Control', down: true, modifiers: ['Control', 'Shift', 'Alt'] },
      linux,
    )[0]!.keyEvent?.modifiers,
  ).toEqual([29, 1])
  expect(
    encodeInput({ kind: 'key', key: 'Control', down: false, modifiers: ['Control'] }, linux)[0]!
      .keyEvent?.modifiers,
  ).toEqual([hbb.ControlKey.Control])
})
// 白名單每個 control key 都保留 enum 值與 up 語意。
it('maps the complete control whitelist and ASCII virtual punctuation', () => {
  // Windows extended 鍵改走 Translate 掃描碼，由獨立案例驗證。
  for (const key of CONTROL_NAMES.filter((name) => !(name in WINDOWS_EXTENDED))) {
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
// Translate 編碼須與 C# 獨立 fixture 的手算 bytes 一致，不以同一 encoder 往返作 oracle。
it('encodes Windows Translate keys to the independent CSharp wire bytes', () => {
  expect(
    Array.from(
      encodeMessage(
        encodeInput({ kind: 'key', key: 'LeftArrow', down: true, modifiers: ['Shift'] }, meta)[0]!,
      ),
    ),
  ).toEqual([0x7a, 0x0b, 8, 1, 0x20, 0xcb, 0xc0, 3, 0x42, 1, 0x1d, 0x48, 2])
  expect(
    Array.from(
      encodeMessage(
        encodeInput({ kind: 'shortcut', char: 'a', down: true, modifiers: [] }, meta)[0]!,
      ),
    ),
  ).toEqual([0x7a, 9, 8, 1, 0x20, 0x80, 0x80, 0x84, 2, 0x48, 2])
})
