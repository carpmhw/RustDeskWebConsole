import type { Page, Worker } from '@playwright/test'
import { setTimeout as sleep } from 'node:timers/promises'
import type { ReconnectLease } from './reconnect-proxy-types'
import type { LongrunPorts, LongrunSnapshot } from './reconnect-longrun-observer'
export interface LongrunPageProbe {
  // 僅重設當段clock／徽章，不洗掉hidden或terminal。
  mark(worker: Worker | null): Promise<void>
  // 被動讀私有handle，只回安全scalar。
  read(signal: AbortSignal): Promise<LongrunSnapshot>
  // 單owner有界釋放，不讓晚回復活observer。
  close(): Promise<void>
}
export type LongrunResources = { opened: number; closed: number; wrongPrefix: number }
// 被動observer僅放私有JSHandle，不把checksum或文字放window／公開state。
export async function createLongrunPageProbe(
  page: Page,
  lease: ReconnectLease,
  resources: LongrunResources,
): Promise<LongrunPageProbe> {
  const handle = await page.evaluateHandle(() => {
    let hidden = document.visibilityState !== 'visible',
      mask = 0,
      terminal: 'none' | 'reconnect_timeout' | 'other' = 'none',
      previous: number | null = null
    // 只保留安全terminal分類，不保存原始attribute或文字。
    const noteError = (value: string | null): void => {
      if (value === null) return
      if (value === 'reconnect_timeout' && terminal !== 'other') terminal = 'reconnect_timeout'
      else terminal = 'other'
    }
    // 每次DOM實際出現的徽章都累積成有限bits。
    const noteRetry = (value: string): void => {
      const match = /^重新連線第 ([123])／3 次$/.exec(value.trim())
      if (match) mask |= 1 << (Number(match[1]) - 1)
      else terminal = 'other'
    }
    // 只讀允許的DOM節點，未知內容立即映固定分類。
    const scan = (root: ParentNode = document): void => {
      const nodes = Array.from(
        root.querySelectorAll('[data-testid="console-reconnect"], [data-error-code]'),
      )
      if (
        root instanceof Element &&
        root.matches('[data-testid="console-reconnect"], [data-error-code]')
      )
        nodes.push(root)
      for (const node of nodes) {
        noteError(node.getAttribute('data-error-code'))
        if (node.getAttribute('data-testid') === 'console-reconnect')
          noteRetry(node.textContent ?? '')
      }
    }
    // removed subtree仍在同task短命檢查，不保留其文字或節點。
    const observer = new MutationObserver((records) => {
      scan()
      for (const record of records) {
        if (record.type === 'attributes' && record.attributeName === 'data-error-code')
          noteError(record.oldValue)
        const badge = record.target instanceof Element ? record.target : record.target.parentElement
        const wasRetry = badge?.getAttribute('data-testid') === 'console-reconnect'
        if (wasRetry && record.type === 'characterData' && record.oldValue?.trim())
          noteRetry(record.oldValue)
        for (const node of Array.from(record.removedNodes)) {
          if (node instanceof Element) scan(node)
          else if (wasRetry && node.textContent?.trim()) noteRetry(node.textContent)
        }
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeOldValue: true,
      characterDataOldValue: true,
    })
    const visibility = /* 一度hidden不能被mark或重新visible洗掉。 */ (): void => {
      hidden ||= document.visibilityState !== 'visible'
    }
    document.addEventListener('visibilitychange', visibility)
    // 公開clock checksum只在此closure，讀取不等待browser timer。
    const checksum = (): number | null => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="console-canvas"]')
      if (!canvas || canvas.width !== 1280 || canvas.height !== 720) return null
      const context = canvas.getContext('2d')
      if (!context) return null
      const pixels = context.getImageData(200, 250, 700, 120).data
      let hash = 2166136261
      for (let i = 0; i < pixels.length; i += 4)
        hash =
          Math.imul(
            hash ^ (pixels[i]! * 65536 + pixels[i + 1]! * 256 + pixels[i + 2]!),
            16777619,
          ) >>> 0
      return hash
    }
    previous = checksum()
    scan()
    return {
      mark: /* 只重設當段資料，terminal／hidden仍保留。 */ () => {
        mask = 0
        previous = checksum()
        scan()
      },
      sample: /* 取樣只回白名單scalar，像素與checksum不跨回Node。 */ () => {
        visibility()
        scan()
        const current = checksum(),
          changed = current !== null && previous !== null && current !== previous
        previous = current
        return {
          visibleThroughout: !hidden,
          streaming: !!document.querySelector('[data-testid="console-streaming"]'),
          terminal,
          retryMask: mask,
          clockChanged: changed,
        }
      },
      dispose: /* browser被關閉前清掉所有自有observer與closure資料。 */ () => {
        observer.disconnect()
        document.removeEventListener('visibilitychange', visibility)
        previous = null
        mask = 0
      },
    }
  })
  let closed = false,
    reading = false,
    worker: Worker | null = null,
    closing: Promise<void> | undefined
  return {
    mark: /* 換當段Worker identity，不作任何輸入或重新取焦點。 */ async (value) => {
      if (closed || reading) throw new Error('longrun_cancelled')
      try {
        await handle.evaluate(/* 不讀寫產品內部狀態。 */ (state) => state.mark())
        if (closed) throw new Error()
        worker = value
      } catch {
        throw new Error(closed ? 'longrun_cancelled' : 'longrun_observation_failed')
      }
    },
    read: /* 每次至多一個被動read，取消／逾時不回原生錯誤。 */ async (signal) => {
      if (closed || signal.aborted) throw new Error('longrun_cancelled')
      if (reading) throw new Error('longrun_invalid_observation')
      reading = true
      let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
      try {
        const sample = await Promise.race([
          handle.evaluate(/* 僅同步取樣，不呼叫5.5秒clockChanges。 */ (state) => state.sample()),
          new Promise<never>((_resolve, reject) => {
            abort = /* 一律回固定取消分類。 */ () => reject(new Error('longrun_cancelled'))
            signal.addEventListener('abort', abort, { once: true })
            timer = setTimeout(
              /* 卡住的browser最多等一秒。 */ () => reject(new Error('longrun_observation_failed')),
              1000,
            )
          }),
        ])
        if (closed || signal.aborted) throw new Error()
        const state = lease.summary(),
          current = page.workers()
        return {
          ...sample,
          terminal: resources.wrongPrefix ? 'other' : sample.terminal,
          sameWorker: worker === null ? null : current.length === 1 && current[0] === worker,
          counts: {
            metadata: state.routes.target.requested,
            tickets: state.routes.ticket.requested,
            accepted: state.accepted,
            opened: resources.opened,
            closed: resources.closed,
          },
          latestMetadataAt: state.attempts.at(-1)?.metadataAt ?? null,
        }
      } catch {
        throw new Error(
          closed || signal.aborted ? 'longrun_cancelled' : 'longrun_observation_failed',
        )
      } finally {
        clearTimeout(timer)
        if (abort) signal.removeEventListener('abort', abort)
        reading = false
      }
    },
    close: /* 單一close promise保留真收尾與有界失敗。 */ () => {
      if (closing) return closing
      closed = true
      worker = null
      closing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            (async () => {
              if (!page.isClosed())
                await handle.evaluate(/* 真正卸載observer。 */ (state) => state.dispose())
              await handle.dispose()
            })(),
            new Promise<never>(
              /* 有界close不能等整案timeout。 */ (_resolve, reject) => {
                timer = setTimeout(() => reject(new Error()), 5000)
              },
            ),
          ])
        } catch {
          if (!page.isClosed()) throw new Error('longrun_observation_failed')
        } finally {
          clearTimeout(timer)
        }
      })()
      return closing
    },
  }
}
// Runtime沒有外部clock參數，Node sleep只用可取消的固定poll間距。
export function longrunPagePorts(probe: LongrunPageProbe): LongrunPorts {
  return {
    now: /* 原生單調clock，不受browser時計影響。 */ () => performance.now(),
    read: /* 交由同owner的安全reader。 */ (signal) => probe.read(signal),
    wait: /* 只睡一個受限poll間距，AbortSignal沿用同owner。 */ async (ms, signal) => {
      await sleep(ms, undefined, { signal })
    },
  }
}
