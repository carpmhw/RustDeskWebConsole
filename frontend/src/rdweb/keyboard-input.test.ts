import { expect, it, vi } from 'vitest'
import { KeyboardInput, type KeyLike } from './keyboard-input'
import type { ControlName } from './interaction-types'
// 可控 primitive，不以合成 DOM 冒充原生 OS 輸入法驗收。
function event(key: string, code = key, patch: Partial<KeyLike> = {}): KeyLike {
  return {
    key,
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    getModifierState: () => false,
    ...patch,
  }
}
// 只送最後確認文字，取消後晚到 composition 不得復活。
it('sends one confirmed composition and ignores its duplicate input', () => {
  const emit = vi.fn(),
    k = new KeyboardInput(emit, vi.fn())
  k.compositionStart()
  k.beforeInput('insertCompositionText', '中', true)
  k.keyDown(event('Enter', 'Enter', { isComposing: true }))
  expect(emit).not.toHaveBeenCalled()
  k.compositionEnd('中文')
  k.beforeInput('insertText', '中文', false)
  expect(emit).toHaveBeenCalledExactlyOnceWith({ kind: 'text', text: '中文', modifiers: [] })
  k.reset()
  k.compositionEnd('晚到文字')
  expect(emit).toHaveBeenCalledOnce()
})
// 下一次一般鍵盤輸入清去重 marker，相同中文字不能被永久吃掉。
it('allows a subsequent identical character and excludes implicit paste', () => {
  const emit = vi.fn(),
    k = new KeyboardInput(emit, vi.fn())
  k.compositionStart()
  k.compositionEnd('中')
  k.beforeInput('insertFromComposition', '中', false)
  k.keyDown(event('中', 'KeyA'))
  k.beforeInput('insertText', '中', false)
  k.beforeInput('insertFromPaste', 'local private text', false)
  expect(emit).toHaveBeenCalledTimes(2)
})
// down 時的語意與 code 配對；Shift 提早放開不可換成另一個子鍵。
it('retains shortcut identity through repeat and keyup modifier changes', () => {
  const emit = vi.fn(),
    k = new KeyboardInput(emit, vi.fn())
  expect(k.keyDown(event('A', 'KeyA', { ctrlKey: true, shiftKey: true }))).toBe(true)
  k.keyDown(event('a', 'KeyA', { ctrlKey: true, repeat: true }))
  expect(k.keyUp(event('a', 'KeyA'))).toBe(true)
  expect(emit.mock.calls.map((c) => c[0].char)).toEqual(['a', 'a', 'a'])
  expect(emit.mock.calls.at(-1)![0]).toMatchObject({ down: false, modifiers: [] })
  expect(k.keyUp(event('a', 'KeyA'))).toBe(false)
  expect(k.keyDown(event('a', 'KeyA'))).toBe(false)
})
// 功能鍵、右側修飾鍵及 numpad 使用 pinned 安全白名單。
it('maps function, navigation, right modifiers and numeric keypad keys', () => {
  const emit = vi.fn(),
    k = new KeyboardInput(emit, vi.fn())
  const keys: [string, string, ControlName][] = [
    ['ArrowLeft', 'ArrowLeft', 'LeftArrow'],
    ['ArrowRight', 'ArrowRight', 'RightArrow'],
    ['ArrowUp', 'ArrowUp', 'UpArrow'],
    ['ArrowDown', 'ArrowDown', 'DownArrow'],
    ['Enter', 'Enter', 'Return'],
    ['Escape', 'Escape', 'Escape'],
    ['Backspace', 'Backspace', 'Backspace'],
    ['Delete', 'Delete', 'Delete'],
    ['Insert', 'Insert', 'Insert'],
    ['Home', 'Home', 'Home'],
    ['End', 'End', 'End'],
    ['PageUp', 'PageUp', 'PageUp'],
    ['PageDown', 'PageDown', 'PageDown'],
    ['Tab', 'Tab', 'Tab'],
    ['Shift', 'ShiftRight', 'RShift'],
    ['Control', 'ControlRight', 'RControl'],
    ['Alt', 'AltRight', 'RAlt'],
    ['Meta', 'MetaRight', 'RWin'],
    ['Shift', 'ShiftLeft', 'Shift'],
    ['Control', 'ControlLeft', 'Control'],
    ['Alt', 'AltLeft', 'Alt'],
    ['Meta', 'MetaLeft', 'Meta'],
    ['CapsLock', 'CapsLock', 'CapsLock'],
    ['NumLock', 'NumLock', 'NumLock'],
    [' ', 'Space', 'Space'],
    ['Enter', 'NumpadEnter', 'NumpadEnter'],
    ['*', 'NumpadMultiply', 'Multiply'],
    ['+', 'NumpadAdd', 'Add'],
    ['-', 'NumpadSubtract', 'Subtract'],
    ['.', 'NumpadDecimal', 'Decimal'],
    ['/', 'NumpadDivide', 'Divide'],
    ['=', 'NumpadEqual', 'Equals'],
  ]
  for (let i = 1; i <= 12; i++) keys.push(['F' + i, 'F' + i, ('F' + i) as ControlName])
  for (let i = 0; i < 10; i++) keys.push([String(i), 'Numpad' + i, ('Numpad' + i) as ControlName])
  for (const [key, code, expected] of keys) {
    expect(k.keyDown(event(key, code))).toBe(true)
    expect(emit.mock.calls.at(-1)![0]).toMatchObject({ kind: 'key', key: expected, down: true })
    expect(k.keyUp(event(key, code))).toBe(true)
  }
  expect(k.keyDown(event('AudioVolumeUp'))).toBe(false)
})
// AltGraph 不變成 CtrlAlt shortcut，已送 hot modifier 必須先放開。
it('releases hot modifiers for AltGraph and emits only confirmed text', () => {
  const emit = vi.fn(),
    k = new KeyboardInput(emit, vi.fn())
  k.keyDown(event('Control', 'ControlLeft', { ctrlKey: true }))
  k.keyDown(event('Alt', 'AltRight', { ctrlKey: true, altKey: true }))
  expect(
    k.keyDown(
      event('@', 'KeyQ', {
        ctrlKey: true,
        altKey: true,
        getModifierState: (name) => name === 'AltGraph',
      }),
    ),
  ).toBe(false)
  k.beforeInput('insertText', '@', false)
  expect(emit.mock.calls.slice(2).map((c) => c[0])).toEqual([
    { kind: 'key', key: 'Control', down: false, modifiers: [] },
    { kind: 'key', key: 'RAlt', down: false, modifiers: [] },
    { kind: 'text', text: '@', modifiers: [] },
  ])
})
// UTF-8 超額為操作提示，ledger 有界且 reset 冪等。
it('bounds composition and held keys and releases each known down once', () => {
  const emit = vi.fn(),
    issue = vi.fn(),
    k = new KeyboardInput(emit, issue)
  k.compositionStart()
  k.compositionEnd('中'.repeat(1366))
  expect(issue).toHaveBeenCalledWith('input_text_too_large')
  expect(emit).not.toHaveBeenCalled()
  k.beforeInput('insertText', '中'.repeat(1366), false)
  expect(issue).toHaveBeenCalledTimes(2)
  k.beforeInput('insertText', '\ud800', false)
  expect(issue).toHaveBeenLastCalledWith('input_unsupported')
  for (let i = 0; i < 64; i++) k.keyDown(event('F1', 'public-' + i))
  k.keyDown(event('F1', 'overflow'))
  expect(emit).toHaveBeenCalledTimes(64)
  k.reset()
  k.reset()
  expect(emit).toHaveBeenCalledTimes(128)
})
// CapsLock／NumLock 狀態只帶安全 modifier，普通文字不混入 CtrlAltMeta。
it('preserves text lock modifiers without forwarding hotkeys as Unicode', () => {
  const emit = vi.fn(),
    k = new KeyboardInput(emit, vi.fn())
  k.keyDown(
    event('A', 'KeyA', {
      shiftKey: true,
      getModifierState: (name) => ['CapsLock', 'NumLock'].includes(name),
    }),
  )
  k.beforeInput('insertText', 'A', false)
  expect(emit).toHaveBeenCalledExactlyOnceWith({
    kind: 'text',
    text: 'A',
    modifiers: ['Shift', 'CapsLock', 'NumLock'],
  })
})
