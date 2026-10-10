import { expect, test } from '@playwright/test'
for (const codec of ['vp8', 'vp9', 'av1', 'h264']) {
  // 真Worker／native應輸出兩張公開影像，probe或incomplete都不算成功。
  test('native fixture ' + codec, async ({ page, browser }) => {
    let errors = 0
    // Publicharness原生錯誤僅計數，不將任意exception帶入report。
    page.on('pageerror', () => errors++)
    await page.goto('http://127.0.0.1:18081/e2e-codecs/index.html?codec=' + codec)
    await page.waitForFunction(
      () => (window as unknown as { __codecResult?: { done: boolean } }).__codecResult?.done,
    )
    const result = await page.evaluate(
      () =>
        (
          window as unknown as {
            __codecResult: {
              outcome: string
              frames: number
              width: number
              height: number
              pixelsValid: boolean
              changed: boolean
              probeReturned: boolean
              code: string
            }
          }
        ).__codecResult,
    )
    test.info().annotations.push({
      type: 'native-codec',
      description: codec + '/' + result.outcome + '/' + browser.version(),
    })
    console.log(
      'Native codec: ' +
        test.info().project.name +
        '/' +
        browser.version() +
        '/' +
        codec +
        '/' +
        result.outcome,
    )
    expect(errors).toBe(0)
    if (result.outcome === 'unsupported') {
      expect(['video_unsupported', 'codec_unsupported'].includes(result.code)).toBe(true)
      expect(result.frames).toBe(0)
    } else {
      expect(result.outcome, JSON.stringify({ result, errors })).toBe('decoded')
      expect(result.frames).toBe(2)
      expect(result.width).toBe(320)
      expect(result.height).toBe(240)
      expect(result.pixelsValid && result.changed).toBe(true)
      expect(result.probeReturned).toBe(true)
    }
  })
}
