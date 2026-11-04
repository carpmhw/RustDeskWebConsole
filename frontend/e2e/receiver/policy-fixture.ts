import { EventEmitter } from 'node:events'
import type { Page, Route } from '@playwright/test'

export const policyTarget = '00000000-0000-4000-8000-000000000001'

// 只替換瀏覽器事件／HTTP transport；不讀憑證、不建立真頁面或socket。
export function policyFixture(base = '') {
  const origin = 'http://127.0.0.1:18080'
  const consoleUrl = origin + base + '/console/' + policyTarget
  const metadataUrl = origin + base + '/api/v1/targets/' + policyTarget
  const context = new EventEmitter()
  const source = new EventEmitter()
  const popup = new EventEmitter()
  const calls: string[] = []
  let matcher: ((url: URL) => boolean) | undefined
  let handler: ((route: Route) => Promise<void>) | undefined
  let checked = true,
    closed = false,
    uiFailure = false,
    stuckChecked = false,
    continueFailure = false
  let workerCount = 0
  let afterContinue: (() => void) | undefined
  let change: ((enabled: boolean) => void) | undefined
  // 每個公開route自行保留計數，沒有body／headers等可被意外讀取的假捷徑。
  function request(patch: { url?: string; method?: string; page?: Page } = {}) {
    let continued = 0,
      aborted = 0
    const route = {
      // 只有metadata與來源頁面可被讀取。
      request: () => ({
        url: () => patch.url ?? metadataUrl,
        method: () => patch.method ?? 'GET',
        frame: () => ({ page: () => patch.page ?? (popup as unknown as Page) }),
      }),
      // 放行才模擬原transport回覆；不替gate判斷是否允許。
      async continue() {
        calls.push('continue')
        if (continueFailure) throw new Error('public-sensitive-transport')
        continued++
        afterContinue?.()
      },
      // 統計真正gate要求取消，不替被測程式決定結果。
      async abort() {
        calls.push('abort')
        aborted++
      },
    } as unknown as Route
    return {
      // 由已安裝的真route handler消費公開request。
      async dispatch() {
        if (handler && matcher?.(new URL(patch.url ?? metadataUrl))) await handler(route)
      },
      counts: /* 只取安全副作用計數。 */ () => ({ continued, aborted }),
    }
  }
  Object.assign(context, {
    // 舊opener只等popup，保留此邊界以重現其未停用政策的缺口。
    waitForEvent: async () => popup,
    // 保存真正gate註冊的matcher／handler，供測試transport送入公開request。
    async route(match: (url: URL) => boolean, handle: (route: Route) => Promise<void>) {
      calls.push('route')
      matcher = match
      handler = handle
    },
    // 只能移除同一個owner的handler。
    async unroute(match: unknown, handle: unknown) {
      if (match !== matcher || handle !== handler) throw new Error('public-wrong-owner')
      calls.push('unroute')
      matcher = undefined
      handler = undefined
    },
  })
  Object.assign(popup, {
    context: /* 同一個專用context。 */ () => context,
    opener: /* 公開popup只由原source開啟。 */ async () => source,
    url: /* 固定公開Console URL，不帶票證。 */ () => consoleUrl,
    workers: /* 目前數目與累計事件分開。 */ () => Array(workerCount).fill({}),
    bringToFront: /* 不改DOM或重啟session。 */ async () => {
      calls.push('front')
    },
    getByTestId: /* 正常UI方法是唯一可改checked的邊界。 */ (id: string) => ({
      // 模型化原生checkbox的正常change，不手改被測gate的狀態。
      async uncheck() {
        if (id !== 'console-auto-reconnect') throw new Error('public-wrong-locator')
        calls.push('uncheck')
        if (uiFailure) throw new Error('public-sensitive-ui')
        if (!stuckChecked) checked = false
        change?.(checked)
      },
      isChecked: /* 依實際fixture狀態，而非gate預期回覆。 */ async () => checked,
    }),
    isClosed: /* 只回自己的公開替身狀態。 */ () => closed,
    // 關閉事件會由真gate決定是不是取消，不替它設定失敗。
    async close() {
      if (closed) return
      closed = true
      calls.push('close')
      popup.emit('close')
    },
  })
  const link = {
    getAttribute: /* 模型化router link產生的公開href。 */ async () =>
      base + '/console/' + policyTarget,
    // 模擬點擊後先page事件，再由Console發metadata；沒有自己放行請求。
    async click() {
      calls.push('click')
      context.emit('page', popup)
      source.emit('popup', popup)
      void initial.dispatch()
    },
  }
  const row = {
    first: /* 導航後等待公開table。 */ () => ({ waitFor: async () => {} }),
    count: /* 本fixture只有已驗唯一一列。 */ async () => 1,
    getByRole: /* peer binding由獨立literal比對。 */ (role: string, options: { name: string }) =>
      role === 'cell' ? { count: async () => (options.name === '987654321' ? 1 : 0) } : link,
  }
  Object.assign(source, {
    url: /* target列表的真caller位置。 */ () => origin + base + '/targets',
    isClosed: /* 原caller不在本fixture自行關閉。 */ () => false,
    context: /* 所有頁面使用同一個專用context。 */ () => context,
    goto: /* 不開網路的導航邊界。 */ async () => {},
    locator: /* 真helper仍執行row／peer守衛。 */ () => ({ filter: () => row }),
  })
  const initial = request()
  return {
    source: source as unknown as Page,
    popup: popup as unknown as Page,
    context,
    calls,
    consoleUrl,
    metadataUrl,
    initial,
    request,
    checked: /* 安全布林觀測，不保存DOM原文。 */ () => checked,
    uiFailure: /* 控制公開外部UI失敗。 */ () => {
      uiFailure = true
    },
    stuckChecked: /* change後仍未停用的負向。 */ () => {
      stuckChecked = true
    },
    continueFailure: /* 控制原transport拒絕。 */ () => {
      continueFailure = true
    },
    afterContinue: /* 可接真ConsoleSession的公開HTTP producer。 */ (callback: () => void) => {
      afterContinue = callback
    },
    onChange: /* 模型化Vue原生change handler，不直接操作gate內部狀態。 */ (
      callback: (enabled: boolean) => void,
    ) => {
      change = callback
    },
    // 事件須走真gate listener；目前Worker數可另歸零，不能抹除累計歷史。
    worker() {
      workerCount++
      popup.emit('worker', {})
    },
    workersGone: /* 模擬舊Worker退出，不清累計。 */ () => {
      workerCount = 0
    },
    socket: /* 只發生命週期事件，沒有任何封包資料。 */ () => {
      popup.emit('websocket', {})
    },
    open: /* 讓不經table的gate測試也由真context事件取得page。 */ () => {
      context.emit('page', popup)
      source.emit('popup', popup)
    },
    routed: /* 確認owner移除自己的route。 */ () => handler !== undefined,
  }
}
