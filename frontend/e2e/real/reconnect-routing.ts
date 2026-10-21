import type { BrowserContext, WebSocketRoute } from '@playwright/test'

export interface ReconnectRoutes {
  readonly opened: number
  started(index: number): number
  interrupted(index: number): number | null
  interrupt(index: number): Promise<void>
  close(): Promise<void>
}

// 真連上保存的backend後沿預設雙向forward；從不讀message／headers／票證或私有bytes。
export async function installReconnectRoutes(context: BrowserContext): Promise<ReconnectRoutes> {
  const entries: Array<{
    client: WebSocketRoute
    server: WebSocketRoute
    started: number
    cut: number | null
    closed: boolean
  }> = []
  await context.routeWebSocket(
    // 僅攔主控台連線路由，HTTP／資源仍走原正式介面。
    (url) => url.pathname.endsWith('/connect'),
    // 不能省略connectToServer或註冊onMessage改寫加密資料。
    (route) => {
      const server = route.connectToServer()
      entries.push({ client: route, server, started: performance.now(), cut: null, closed: false })
    },
  )
  // 有效index才可取得此context的route，不接受外部socket或任意close code。
  function entry(index: number) {
    const value = Number.isSafeInteger(index) && index >= 0 ? entries[index] : undefined
    if (!value) throw new Error('Invalid reconnect route')
    return value
  }
  // 關閉兩端各一次；不安裝會取消預設close轉送的onClose handler。
  async function close(index: number, code: 1000 | 1012): Promise<void> {
    const value = entry(index)
    if (value.closed) return
    value.closed = true
    if (code === 1012) value.cut = performance.now()
    // Browser原生close只允許1000或3000–4999；1012僅注入page端，真upstream以1000收尾。
    await Promise.all([value.client.close({ code }), value.server.close({ code: 1000 })])
  }
  return {
    // 只暴露次數與本機單調時間，不回route物件或原連線URL。
    get opened() {
      return entries.length
    },
    // 以本地時間對照真backoff，精確邊界仍由原unit驗證。
    started: (index) => entry(index).started,
    // 未故障注入時保持null，不把自然關閉誤報為測試中斷。
    interrupted: (index) => entry(index).cut,
    // 唯一故障來源為明確service-restart 1012，不偽造任何握手／錯誤payload。
    interrupt: (index) => close(index, 1012),
    // 收尾正常關閉本測試已取得的所有paired routes，不停外部服務。
    close: async () => {
      await Promise.all(entries.map((_, index) => close(index, 1000)))
    },
  }
}
