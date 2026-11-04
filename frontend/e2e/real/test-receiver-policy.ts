import type { BrowserContext, Locator, Page, Route } from '@playwright/test'
import { withBase } from '../../src/utils/basePath'

// 政策gate只擁有本輪popup及路由，不提供修改產品或報告schema的入口。
export interface ReceiverPolicyGate {
  readonly page: Page | undefined
  // 可選link僅供真opener使用，點擊與政策準備共用同一個setup期限。
  prepare(link?: Locator): Promise<Page>
  // 操作入口拒絕已取消或額外attempt，不改報告布林。
  assertSingleAttempt(): void
  // 終態只供降級scope，不把cleanup或stage當成功證據。
  valid(): boolean
  // 開始正常收尾，但保留額外attempt的拒絕條件。
  beginCleanup(): void
  // 只收自有資源，缺確認或超過原2秒上限回false。
  dispose(): Promise<boolean>
}

// 先於點連線安裝，原metadata保持pending直到正常UI停用完成；不讀取headers或body。
export async function installReceiverPolicyGate(
  source: Page,
  href: string,
  base: string,
): Promise<ReceiverPolicyGate> {
  try {
    const origin = 'http://127.0.0.1:18080'
    const url = new URL(href, origin)
    const target = url.pathname.slice((withBase('console', base) + '/').length)
    if (
      url.origin !== origin ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target) ||
      url.pathname !== withBase('console/' + target, base) ||
      source.url() !== origin + withBase('targets', base)
    )
      throw new Error('receiver_unavailable')
    const gate = new PolicyGate(
      source,
      url.href,
      origin + withBase('api/v1/targets/' + target, base),
      base,
    )
    await gate.install()
    return gate
  } catch {
    throw new Error('receiver_unavailable')
  }
}

// 只有固定數目的promise／布林／計數；不保存請求清單或任意事件內容。
class PolicyGate implements ReceiverPolicyGate {
  private candidate: Page | undefined
  private owned = false
  private readonly context: BrowserContext
  private failed = false
  private disposed = false
  private cleaning = false
  private released = false
  private seen = false
  private preparing = false
  private workers = 0
  private sockets = 0
  private cleanupOk = true
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly deadline = performance.now() + 15000
  private stop!: () => void
  private seenReady!: () => void
  private decide!: (continueRequest: boolean) => void
  private forwarded!: () => void
  private readonly stopped = new Promise<void>(
    /* 取消只resolve，未等待時不製造unhandled rejection。 */ (resolve) => {
      this.stop = resolve
    },
  )
  private readonly metadata = new Promise<void>(
    /* 首metadata的存在性，不保留任何payload。 */ (resolve) => {
      this.seenReady = resolve
    },
  )
  private readonly decision = new Promise<boolean>(
    /* 原route只等一次放行或取消。 */ (resolve) => {
      this.decide = resolve
    },
  )
  private readonly sent = new Promise<void>(
    /* 只有原continue真正完成才算準備成功。 */ (resolve) => {
      this.forwarded = resolve
    },
  )
  private pending: Promise<void> | undefined
  private closing: Promise<void> | undefined
  private disposal: Promise<boolean> | undefined
  private cleanupDeadline: number | undefined
  private registration: Promise<void> | undefined

  // 唯一owner在安裝route前即掛page事件，避免漏掉最早的Worker／WS。
  constructor(
    private readonly source: Page,
    private readonly consoleUrl: string,
    private readonly metadataUrl: string,
    private readonly base: string,
  ) {
    this.context = source.context()
  }

  // 只有source的popup事件確認的頁面可交給executor，不依window.opener或URL猜ownership。
  get page(): Page | undefined {
    return this.owned ? this.candidate : undefined
  }

  // 只攔detail路徑；handler仍重驗origin、精確target、method及來源popup。
  private readonly matches = (url: URL): boolean => {
    const prefix = withBase('api/v1/targets', this.base) + '/'
    return url.pathname.startsWith(prefix) && !url.pathname.slice(prefix.length).includes('/')
  }

  // 多出的route立即拒絕，不保存無界pending陣列。
  private readonly route = async (route: Route): Promise<void> => {
    if (this.seen || this.failed || this.disposed) {
      this.fail()
      await this.abort(route)
      return
    }
    this.seen = true
    this.pending = this.handle(route)
    await this.pending
  }

  // 第一個route由原request關聯，未成功停用不得放行；任何錯誤只留下固定失敗。
  private async handle(route: Route): Promise<void> {
    try {
      const request = route.request()
      if (
        request.url() !== this.metadataUrl ||
        request.method() !== 'GET' ||
        !this.page ||
        request.frame().page() !== this.page
      )
        throw new Error('receiver_unavailable')
      this.check(false)
      this.seenReady()
      if (!(await this.decision) || !this.released || this.failed || this.disposed) {
        await this.abort(route)
        return
      }
      await route.continue()
      this.forwarded()
    } catch {
      this.fail()
      await this.abort(route)
    }
  }

  // 拒絕時不回顯Playwright原生exception；取消失敗亦保留cleanup不足。
  private async abort(route: Route): Promise<void> {
    try {
      await route.abort()
    } catch {
      this.cleanupOk = false
    }
  }

  // context page事件先同步掛生命週期listener；ownership另由source popup事件確認。
  private readonly opened = (page: Page): void => {
    if (this.candidate || this.disposed || this.failed) {
      this.fail()
      return
    }
    this.candidate = page
    page.on('worker', this.worker)
    page.on('websocket', this.socket)
    page.on('close', this.closed)
    page.on('crash', this.cancelled)
    if (page.workers().length !== 0) this.fail()
  }

  // 必須與同次context page事件相符，不解除noopener／noreferrer或靠目前URL冒認。
  private readonly popup = (page: Page): void => {
    if (page !== this.candidate || this.owned) {
      this.fail()
      return
    }
    this.owned = true
    if (this.failed || this.disposed) this.closeOwned()
  }

  // 累計不能由目前Worker數或舊Worker退出重設。
  private readonly worker = (): void => {
    this.workers++
    if (!this.released || this.workers > 1) this.fail()
  }

  // 只計建立事件，不讀frame、URL、票證或message。
  private readonly socket = (): void => {
    this.sockets++
    if (!this.released || this.sockets > 1) this.fail()
  }

  // 正常finally關頁與非預期關頁分開，不讓收尾毒化先前成功。
  private readonly closed = (): void => {
    if (!this.cleaning) this.fail()
  }
  // source／context關閉或popup crash都取消未放行的準備。
  private readonly cancelled = (): void => {
    if (!this.cleaning) this.fail()
  }

  // 首失敗鎖定，喚醒等待並阻止晚到continue；只關自己的popup。
  private fail(): void {
    if (this.failed || this.disposed) return
    this.failed = true
    this.cleanupDeadline ??= performance.now() + 2000
    this.stop()
    this.decide(false)
    this.closeOwned()
  }

  // 只有source popup事件已確認的自有頁面可收回；多個失敗共用同一個close。
  private closeOwned(): void {
    try {
      if (!this.closing && this.page && !this.page.isClosed())
        this.closing = this.page.close().catch(
          /* 關頁失敗不能補成正常cleanup。 */ () => {
            this.cleanupOk = false
          },
        )
    } catch {
      this.cleanupOk = false
    }
  }

  // 原15秒setup共用一個deadline，任何進展不重設；已準備後只保留生命週期guard。
  private check(prepared: boolean): void {
    if (
      this.failed ||
      this.disposed ||
      (prepared && !this.released) ||
      (!this.released && performance.now() >= this.deadline)
    ) {
      this.fail()
      throw new Error('receiver_unavailable')
    }
  }

  // 取消／timer會令UI等待提早返回；晚到UI promise不會再放行route。
  private async bounded<T>(operation: Promise<T>): Promise<T> {
    return Promise.race([
      operation,
      this.stopped.then(
        /* 不輸出外部失敗內容。 */ () => {
          throw new Error('receiver_unavailable')
        },
      ),
    ])
  }

  // 安裝失敗收自己已掛listener，不影響context其他owner。
  async install(): Promise<void> {
    this.context.on('page', this.opened)
    this.context.on('close', this.cancelled)
    this.source.on('close', this.cancelled)
    this.source.on('popup', this.popup)
    this.timer = setTimeout(/* 原HTTP setup上限，不額外補時。 */ () => this.fail(), 15000)
    try {
      this.registration = this.context.route(this.matches, this.route).then(
        /* 安裝RPC晚到不能重新留下已取消的route，只移除同一個handler。 */ async () => {
          if (this.disposed) await this.context.unroute(this.matches, this.route)
        },
      )
      await this.bounded(this.registration)
      this.check(false)
    } catch {
      this.fail()
      await this.dispose()
      throw new Error('receiver_unavailable')
    }
  }

  // 正常checkbox操作及真checked讀取皆受同一剩餘期限，不直接改DOM或重啟attempt。
  async prepare(link?: Locator): Promise<Page> {
    try {
      if (this.preparing) throw new Error('receiver_unavailable')
      this.preparing = true
      this.check(false)
      if (link)
        await this.bounded(link.click({ timeout: Math.max(1, this.deadline - performance.now()) }))
      await this.bounded(this.metadata)
      this.check(false)
      const page = this.page!
      if (page.url() !== this.consoleUrl) throw new Error('receiver_unavailable')
      await this.bounded(page.bringToFront())
      const checkbox = page.getByTestId('console-auto-reconnect')
      await this.bounded(
        checkbox.uncheck({ timeout: Math.max(1, this.deadline - performance.now()) }),
      )
      this.check(false)
      if (
        await this.bounded(
          checkbox.isChecked({ timeout: Math.max(1, this.deadline - performance.now()) }),
        )
      )
        throw new Error('receiver_unavailable')
      this.check(false)
      this.released = true
      this.decide(true)
      await this.bounded(this.sent)
      this.check(true)
      clearTimeout(this.timer)
      this.timer = undefined
      return page
    } catch {
      this.fail()
      throw new Error('receiver_unavailable')
    }
  }

  // 輸入／snapshot／終態前均重驗，不以現在只有一個Worker掩蓋歷史重試。
  assertSingleAttempt(): void {
    this.check(true)
  }
  // cleanup不能抹掉已鎖定違規；有效性不由Docker／關頁成功推算。
  valid(): boolean {
    return this.released && !this.failed
  }
  // 只有正常finally才能允許預期關頁，額外Worker／WS guard仍然有效。
  beginCleanup(): void {
    this.cleaning = true
    this.cleanupDeadline ??= performance.now() + 2000
  }

  // 收回自己安裝的route／listener／timer，取消尚未放行請求，等待自有關頁結果。
  async dispose(): Promise<boolean> {
    if (this.disposal) return this.disposal
    this.disposed = true
    this.stop()
    this.decide(false)
    clearTimeout(this.timer)
    this.context.off('page', this.opened)
    this.context.off('close', this.cancelled)
    this.source.off('close', this.cancelled)
    this.source.off('popup', this.popup)
    this.candidate?.off('worker', this.worker)
    this.candidate?.off('websocket', this.socket)
    this.candidate?.off('close', this.closed)
    this.candidate?.off('crash', this.cancelled)
    this.cleanupDeadline ??= performance.now() + 2000
    if (performance.now() >= this.cleanupDeadline) this.cleanupOk = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // 關頁與unroute並行發出，任一原生邊界卡住仍要移除自己的攔截。
    const cleanup = async (): Promise<boolean> => {
      try {
        this.closeOwned()
        await Promise.all([
          this.closing,
          this.pending,
          this.registration,
          this.context.unroute(this.matches, this.route),
        ])
        if (this.page && !this.page.isClosed()) this.cleanupOk = false
      } catch {
        this.cleanupOk = false
      }
      return this.cleanupOk
    }
    this.disposal = Promise.race([
      cleanup(),
      new Promise<boolean>(
        /* 原cleanup共用2秒，超時不補成功、不重試close。 */ (resolve) => {
          timer = setTimeout(
            /* 到期只能降低收尾證據，晚到結果不能回填成功。 */
            () => {
              this.cleanupOk = false
              resolve(false)
            },
            Math.max(0, this.cleanupDeadline! - performance.now()),
          )
        },
      ),
    ]).finally(/* 自有cleanup timer只收一次。 */ () => clearTimeout(timer))
    return this.disposal
  }
}
