import { expect, it } from 'vitest'
import {
  cmSettleMs,
  windowsClickAnchor,
  windowsTitleBarAnchor,
  WINDOWS_CHORD_GAP_MS,
  WINDOWS_CM_SETTLE_MS,
} from '../../e2e/real/windows-timing'

// Windows受控端須等RustDesk連線管理視窗自動縮小（3秒＋1秒餘裕）；Linux沒有此視窗不等待。
it('waits for the RustDesk connection manager only on windows peers', () => {
  expect(WINDOWS_CM_SETTLE_MS).toBe(4000)
  expect(cmSettleMs('windows')).toBe(4000)
  expect(cmSettleMs('linux')).toBe(0)
})

// 記事本點擊後連續組合鍵需間隔：隔離實驗50ms以上40/40成功，取一倍餘裕。
it('spaces windows chords after a click like a human', () => {
  expect(WINDOWS_CHORD_GAP_MS).toBe(100)
})

// 連續點擊同一點會被Windows判為雙擊（≤500ms且≤4px）而選字；每次點擊須相距遠超雙擊矩形且仍在編輯區內。
it('gives each windows click a distinct anchor inside the editor', () => {
  const editor = { x: 3, y: 153, width: 1075, height: 508 }
  const anchors = [0, 1, 2, 3].map((n) => windowsClickAnchor(editor, n))
  expect(anchors[0]).toEqual({ x: 23, y: 183 })
  for (let i = 1; i < anchors.length; i++) {
    expect(anchors[i]!.x - anchors[i - 1]!.x).toBeGreaterThanOrEqual(40)
    expect(anchors[i]!.y).toBe(anchors[0]!.y)
  }
  for (const a of anchors) {
    expect(a.x).toBeLessThan(editor.x + editor.width)
    expect(a.y).toBeLessThan(editor.y + editor.height)
  }
})

// 接收／貼上前改點記事本標題列空白處，不碰編輯區選取；錨點須在編輯區上方標題列內且彼此相距避免雙擊最大化。
it('places windows title bar anchors above the editor within the caption gap', () => {
  const editor = { x: 3, y: 143, width: 1075, height: 508 }
  const anchors = [0, 1, 2].map((n) => windowsTitleBarAnchor(editor, n))
  expect(anchors).toEqual([
    { x: 403, y: 88 },
    { x: 443, y: 88 },
    { x: 483, y: 88 },
  ])
  for (const a of anchors) {
    expect(a.y).toBeLessThan(editor.y)
    expect(a.x).toBeGreaterThan(312)
    expect(a.x).toBeLessThan(967)
  }
})
