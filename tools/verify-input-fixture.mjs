import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

const ERROR = 'Public Linux input fixture unavailable'
const compose = fileURLToPath(
  new URL('../deploy/dev/docker-compose.rustdesk-test.yml', import.meta.url),
)
// X11 stdout只在RAM有界解析，不將title或原始tree放入錯誤。
function rows(tree) {
  if (typeof tree !== 'string' || Buffer.byteLength(tree) > 262144) throw new Error(ERROR)
  return tree.split('\n').flatMap(
    /* 只接受xwininfo回報的精確ID／絕對座標，略過metadata行。 */ (line) => {
      const m = line.match(
        /^(\s*)(0x[0-9a-f]+)\s+(.*?)\s+(\d+)x(\d+)[+-]\d+[+-]\d+\s+([+-]\d+)([+-]\d+)\s*$/,
      )
      if (!m) return []
      return [
        {
          id: m[2],
          label: m[3],
          depth: m[1].length,
          x: Number(m[6]),
          y: Number(m[7]),
          width: Number(m[4]),
          height: Number(m[5]),
        },
      ]
    },
  )
}
// 固定公開app須唯一；不以任意title或預設parentrect猜文字位置。
function parents(tree) {
  const all = rows(tree)
  const editors = all.filter(
    /* 固定app class，不取filename當辨識。 */ (r) => /\("xedit" "Xedit"\)/.test(r.label),
  )
  const observers = all.filter(
    /* 真xev無WM_CLASS，只接受固定公開title及已知或空class。 */ (r) =>
      /^"Event Tester": \((?:"xev" "Xev")?\)$/.test(r.label),
  )
  if (editors.length !== 1 || observers.length !== 1) throw new Error(ERROR)
  return { editor: editors[0], observer: observers[0] }
}
// geometry不越出固定1280×720 display，亦不能覆蓋B2 clock（含border）。
function rectangle(row) {
  const { x, y, width, height } = row
  if (
    ![x, y, width, height].every(/* 必須是精確整數。 */ (n) => Number.isSafeInteger(n)) ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1 ||
    x + width + 2 > 1280 ||
    y + height + 2 > 720 ||
    (x - 2 < 900 && x + width + 2 > 200 && y - 2 < 370 && y + height + 2 > 250)
  )
    throw new Error(ERROR)
  return { x, y, width, height }
}
// 最深大文字區才可操作，狹窄scrollbar child不排除它；平手與越界皆拒絕。
export function parseInputGeometry(root, editorTree) {
  const parent = parents(root),
    outer = rectangle(parent.editor),
    observer = rectangle(parent.observer)
  const all = rows(editorTree).filter(
    /* parent本身不是text child。 */ (r) => r.id !== parent.editor.id,
  )
  const candidates = all.filter(
    /* 寬高足夠的大區域才納入，最深篩選會排除上層容器。 */ (r) => r.width >= 200 && r.height >= 80,
  )
  const depth = Math.max(...candidates.map(/* 僅選最深candidate。 */ (r) => r.depth))
  const leaves = candidates
    .filter(/* 過濾容器層。 */ (r) => r.depth === depth)
    .sort(
      /* 同depth選最大面積；平手無法唯一判定。 */ (a, b) => b.width * b.height - a.width * a.height,
    )
  if (
    !leaves.length ||
    (leaves.length > 1 && leaves[0].width * leaves[0].height === leaves[1].width * leaves[1].height)
  )
    throw new Error(ERROR)
  const editor = rectangle(leaves[0])
  if (
    editor.x < outer.x ||
    editor.y < outer.y ||
    editor.x + editor.width > outer.x + outer.width + 2 ||
    editor.y + editor.height > outer.y + outer.height + 2
  )
    throw new Error(ERROR)
  return { editor, observer }
}
// Docker只讀本輪target的公開X11 window，child_process的stderr/stdout絕不進exception。
function tree(args) {
  try {
    return execFileSync(
      'docker',
      ['compose', '-f', compose, 'exec', '-T', 'target', 'xwininfo', ...args],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 262144, stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch {
    throw new Error(ERROR)
  }
}
// 回傳只有安全rectangles，可供runner JSON讀取；不回tree／ID／window title。
export function verifyInputFixture() {
  const root = tree(['-root', '-tree']),
    parent = parents(root)
  return parseInputGeometry(root, tree(['-id', parent.editor.id, '-tree']))
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(/* 僅允許固定JSON選項。 */ (arg) => arg !== '--json'))
      throw new Error(ERROR)
    const result = verifyInputFixture()
    console.log(
      process.argv.includes('--json')
        ? JSON.stringify(result)
        : '公開Linux輸入fixture windows：PASS',
    )
  } catch {
    console.error(ERROR)
    process.exitCode = 1
  }
}
