import type { Page } from '@playwright/test'

// 只解析瀏覽器computed RGB／RGBA，不接受未解析的CSS變數或命名色。
function rgb(value: string): [number, number, number, number] {
  const match =
    /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d*(?:\.\d+)?))?\)$/.exec(
      value,
    )
  if (!match) throw new Error('Unsupported computed color')
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)]
}

// 以alpha合成取得真實可見色，避免透明底被誤當黑色或白色。
function over(front: number[], back: number[]): [number, number, number, number] {
  const alpha = front[3]!
  return [
    front[0]! * alpha + back[0]! * (1 - alpha),
    front[1]! * alpha + back[1]! * (1 - alpha),
    front[2]! * alpha + back[2]! * (1 - alpha),
    1,
  ]
}

// 依WCAG sRGB線性化計算對比，不使用正式色票或文字斷言反推預期值。
export function contrastRatio(foreground: string, background: string): number {
  const back = rgb(background)
  const front = over(rgb(foreground), back)
  // 權重固定為WCAG相對亮度定義。
  function luminance(channels: number[]): number {
    // 每色道先還原線性亮度。
    const linear = channels.slice(0, 3).map((value) => {
      const channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
  }
  const a = luminance(front)
  const b = luminance(back)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// 對公開fixture讀取目前真正可見的文字、placeholder、控制邊界與焦點色。
export async function readContrastSamples(
  page: Page,
): Promise<Array<{ id: string; ratio: number; minimum: number }>> {
  // 瀏覽器只回傳公開元素的computed colors，不擷取頁面文字或DOM快照。
  const raw = await page.evaluate(() => {
    const samples: Array<{ id: string; front: string; backgrounds: string[]; minimum: number }> = []
    // 收集透明祖先背景，於測試程序由底至頂合成。
    function backgrounds(node: Element | null): string[] {
      const values: string[] = []
      for (let current = node; current; current = current.parentElement) {
        values.unshift(getComputedStyle(current).backgroundColor)
      }
      return values
    }
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-contrast]'))) {
      if (!element.getClientRects().length) continue
      const style = getComputedStyle(element)
      // 不讓淡化透明度繞過色彩檢查；正式控制項應保留可讀狀態色。
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        if (getComputedStyle(parent).opacity !== '1') throw new Error('Contrast sample has opacity')
      }
      for (const kind of element.dataset.contrast!.split(' ')) {
        if (
          kind === 'focus' &&
          (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0)
        )
          continue
        const front =
          kind === 'border'
            ? style.borderTopColor
            : kind === 'focus'
              ? style.outlineColor
              : kind === 'placeholder'
                ? getComputedStyle(element, '::placeholder').color
                : style.color
        const targets =
          kind === 'border'
            ? [element, element.parentElement]
            : [kind === 'focus' ? element.parentElement : element]
        for (const [index, target] of targets.entries()) {
          samples.push({
            id: `${element.id}:${kind}:${index}`,
            front,
            backgrounds: backgrounds(target),
            minimum: kind === 'border' || kind === 'focus' ? 3 : 4.5,
          })
        }
      }
    }
    return samples
  })
  // 僅在測試側合成公開色彩，保留原始小數而非向上四捨五入。
  return raw.map((sample) => {
    // 白色只作瀏覽器畫布的最底層，body與root的不透明主題會覆蓋它。
    const back = sample.backgrounds.reduce<number[]>(
      (result, value) => over(rgb(value), result),
      [255, 255, 255, 1],
    )
    return {
      id: sample.id,
      ratio: contrastRatio(sample.front, `rgb(${back[0]}, ${back[1]}, ${back[2]})`),
      minimum: sample.minimum,
    }
  })
}

// 頁面本身不得橫向溢出；表格內部捲動另由各案例明確檢查。
export async function pageOverflows(page: Page): Promise<boolean> {
  // 只回傳幾何布林，不帶頁面內容。
  return page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
}
