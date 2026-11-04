import assert from 'node:assert/strict'
import { parseInputGeometry } from './verify-input-fixture.mjs'

const root = `
xwininfo: Window id: 0x50d (the root window) (has no name)
     3 children:
     0x400001 "Event Tester": ("xev" "Xev")  240x220+1000+410  +1000+410
        1 child:
        0x400002 (has no name): ()  50x50+10+10  +1011+421
     0x600001 "xedit": ("xedit" "Xedit")  700x220+100+410  +100+410
     0x20000d "xclock": ("xclock" "XClock")  700x120+200+250  +200+250
`
const editor = `
xwininfo: Window id: 0x600001 "xedit"
     1 child:
     0x600002 (has no name): ()  700x220+0+0  +101+411
        3 children:
        0x600003 (has no name): ()  700x20+0+0  +101+411
        0x600004 (has no name): ()  700x80+0+20  +101+431
        0x600005 (has no name): ()  700x118+0+100  +101+511
`
// 若解析器選外框或工具列而非唯一最大深層文字區，本案會失敗。
assert.deepEqual(parseInputGeometry(root, editor), {
  editor: { x: 101, y: 511, width: 700, height: 118 },
  observer: { x: 1000, y: 410, width: 240, height: 220 },
})
// 真xev沒有WM_CLASS，固定公開title仍必須識別；不能要求不存在的class。
assert.deepEqual(parseInputGeometry(root.replace('("xev" "Xev")', '()'), editor), {
  editor: { x: 101, y: 511, width: 700, height: 118 },
  observer: { x: 1000, y: 410, width: 240, height: 220 },
})
// 真Xaw文字區有狹窄scrollbar child，深層最大文字區不能因它被排除。
assert.deepEqual(
  parseInputGeometry(
    root,
    editor + '           0x600006 (has no name): ()  14x118+0+0  +101+511\n',
  ),
  {
    editor: { x: 101, y: 511, width: 700, height: 118 },
    observer: { x: 1000, y: 410, width: 240, height: 220 },
  },
)
// 任意未知視窗、缺項、重複app及遮住clock不能被當作公開fixture通過。
for (const [r, e] of [
  [root.replace('"Xedit"', '"Other"'), editor],
  [root.replace('"Event Tester"', '"Other"'), editor],
  [root + '     0x800001 "xedit": ("xedit" "Xedit")  700x220+100+410  +100+410\n', editor],
  [root.replace('240x220+1000+410  +1000+410', '240x220+800+300  +800+300'), editor],
  [root, editor.replace('700x118+0+100  +101+511', '700x118+0+100  +101+300')],
  [root, editor.replace('700x118', '700x80')],
  [root, editor.replace('700x118+0+100  +101+511', '700x500+0+100  +101+511')],
  [root, 'malformed'],
  [root, ' '.repeat(262145)],
]) {
  assert.throws(
    /* 每組負向獨立驗固定安全錯誤，不把X11內容帶入exception。 */ () => parseInputGeometry(r, e),
    { message: 'Public Linux input fixture unavailable' },
  )
}
console.log('公開Linux輸入fixture geometry：12/12 PASS')
