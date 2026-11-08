import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

// 允許的 px 值：間距與字級階層、邊框／焦點／圖示微調、控制項與版面固定尺寸。
const allowed = new Set([
  0, 1, 2, 3, 4, 6, 8, 12, 14, 16, 20, 24, 28, 32, 40, 44, 48, 64, 72, 160, 200, 220, 320, 360, 420,
  560, 640, 720, 760, 1380, 1600,
])

// 每個 px 值都必須在階層內，或於同一行以 px-allow 註解說明保留理由。
it('uses only px values from the approved scale', () => {
  const stray: string[] = []
  css.split('\n').forEach((line, index) => {
    // 版面斷點不屬於間距與字級階層。
    if (line.includes('px-allow:') || line.trimStart().startsWith('@media')) return
    for (const match of line.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) {
      if (!allowed.has(Number(match[1]))) stray.push(`${index + 1}: ${match[0]}`)
    }
  })
  expect(stray).toEqual([])
})

// 根層級定義間距、字級、控制項與表單寬度變數，供全站引用。
it('defines the spacing, type and control tokens', () => {
  const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))
  for (const [name, value] of [
    ['--space-half', '4px'],
    ['--space-1', '8px'],
    ['--space-2', '12px'],
    ['--space-3', '16px'],
    ['--space-4', '24px'],
    ['--space-5', '32px'],
    ['--fs-xs', '12px'],
    ['--fs-sm', '14px'],
    ['--fs-md', '16px'],
    ['--fs-lg', '20px'],
    ['--fs-xl', '28px'],
    ['--control-height', '40px'],
    ['--control-height-sm', '32px'],
    ['--form-width', '560px'],
  ])
    expect(root).toContain(`${name}: ${value};`)
})
