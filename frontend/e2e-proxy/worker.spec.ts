import { expect, test, type Page } from '@playwright/test'
import { createLoopbackProxy } from '../e2e-real/reconnect-proxy.ts'
import type { ProxyBase } from '../e2e-real/reconnect-proxy-types.ts'
import {
  PUBLIC_TARGET,
  closePublicWorker,
  openPublicWorkerSocket,
  publicWorkerResult,
  sendPublicWorkerText,
  startPublicEndpoint,
  startPublicWorker,
} from './public-fixtures.ts'

// 每案只擁有自身公開upstream／proxy／Worker，建立失敗亦清理。
async function setup(page: Page, base: ProxyBase = '') {
  const endpoint = await startPublicEndpoint()
  const proxy = await createLoopbackProxy({ listenPort: 0, upstreamPort: endpoint.port }).catch(
    async () => {
      await endpoint.close()
      throw new Error('public_proxy_failed')
    },
  )
  const lease = proxy.beginCase(base, PUBLIC_TARGET)
  try {
    await startPublicWorker(page, proxy.port, base)
  } catch (error) {
    await proxy.close()
    await endpoint.close()
    throw error
  }
  return {
    endpoint,
    proxy,
    lease,
    // 無論assertion結果，依Worker／proxy／upstream順序收自有資源。
    close: async () => {
      try {
        await closePublicWorker(page)
      } finally {
        try {
          await proxy.close()
        } finally {
          await endpoint.close()
        }
      }
    },
  }
}

// 版本只回本機browser安全metadata，不抬升成其他channel證據。
test.beforeAll(async ({ browser }) => {
  console.info('Public proxy Chromium version: ' + browser.version())
})

for (const base of ['', '/rdweb', '/a/b/c'] as const) {
  // 每種base都必須由真Worker往返文字與64KiB binary，不是Main route mock。
  test('native Worker roundtrip over ' + (base || '/'), async ({ page }) => {
    const owned = await setup(page, base)
    try {
      await openPublicWorkerSocket(page, 0)
      await openPublicWorkerSocket(page, 1, true)
      expect((await publicWorkerResult(page, 0))?.protocol).toBe('public-probe')
      expect(owned.endpoint.counts()).toEqual({ upgrades: 2, messages: 2, active: 2 })
      expect(owned.lease.summary()).toMatchObject({ accepted: 2, active: 2 })
    } finally {
      await owned.close()
    }
  })
}

// 若interrupt沒有真切TCP，native code與active歸零／新握手次數都不成立。
test('TCP cut reports native 1006 and a new connection without replay', async ({ page }) => {
  const owned = await setup(page)
  try {
    await openPublicWorkerSocket(page, 0)
    const handle = await owned.lease.nextAccepted(new AbortController().signal)
    owned.lease.interrupt(handle)
    await expect.poll(async () => (await publicWorkerResult(page, 0))?.code).toBe(1006)
    expect((await publicWorkerResult(page, 0))?.wasClean).toBe(false)
    await expect.poll(() => owned.endpoint.counts().active).toBe(0)
    await expect.poll(() => owned.lease.summary().active).toBe(0)
    await openPublicWorkerSocket(page, 1)
    expect(owned.endpoint.counts()).toEqual({ upgrades: 2, messages: 2, active: 1 })
  } finally {
    await owned.close()
  }
})

for (const code of [1000, 1012] as const) {
  // 真server close要原樣穿過proxy，不能猜成network。
  test('native server close stays ' + code, async ({ page }) => {
    const owned = await setup(page)
    try {
      await openPublicWorkerSocket(page, 0)
      owned.endpoint.end(0, code)
      await expect.poll(async () => (await publicWorkerResult(page, 0))?.code).toBe(code)
      await expect.poll(() => owned.endpoint.counts().active).toBe(0)
    } finally {
      await owned.close()
    }
  })
}

// 指定pair中斷不影響同Worker的另一條native socket。
test('sibling remains usable after one tunnel cut', async ({ page }) => {
  const owned = await setup(page)
  try {
    await openPublicWorkerSocket(page, 0)
    const first = await owned.lease.nextAccepted(new AbortController().signal)
    await openPublicWorkerSocket(page, 1)
    owned.lease.interrupt(first)
    await expect.poll(async () => (await publicWorkerResult(page, 0))?.code).toBe(1006)
    await sendPublicWorkerText(page, 1)
    await expect.poll(async () => (await publicWorkerResult(page, 1))?.matches).toBe(2)
    expect((await publicWorkerResult(page, 1))?.code).toBeUndefined()
  } finally {
    await owned.close()
  }
})

// 空閒11秒之後仍能往返，只證沒有prototype timer，不是產品stable60秒驗收。
test('idle upgraded tunnel survives prototype deadline', async ({ page }) => {
  const owned = await setup(page)
  try {
    await openPublicWorkerSocket(page, 0)
    await page.waitForTimeout(11000)
    await sendPublicWorkerText(page, 0)
    await expect.poll(async () => (await publicWorkerResult(page, 0))?.matches).toBe(2)
    expect((await publicWorkerResult(page, 0))?.code).toBeUndefined()
  } finally {
    await owned.close()
  }
})
