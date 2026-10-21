import { expect, type Page, type Browser, type Response } from '@playwright/test'
import { createReconnectTest } from './reconnect-fixtures'
import { startReconnectProxy } from './reconnect-proxy'
import { resetStack } from '../management/helpers/fixtures'
import { readIngressOwner } from '../scripts/reconnect-ingress-scope.mjs'
import { createRuntimeIngressController } from './reconnect-ingress-control'
import type {
  IngressCase,
  IngressFaultController,
  IngressFaultReceipt,
} from './reconnect-ingress-types'
import {
  prepareLinuxInputTarget,
  waitForInputVideo,
  assertCanvasEmptyAndWorkersClosed,
  type InputFixture,
} from './input-fixtures'
import { observeConsole, openOfficialConsole } from './fixtures'
import { createLongrunPageProbe, type LongrunPageProbe } from './reconnect-longrun-page'
import { startIngressWatch, type IngressWatch } from './reconnect-ingress-watch'
import { ingressPagePorts, observeIngressHttp } from './reconnect-ingress-page'
import { withIngressComposeProject } from './reconnect-ingress-compose'
import type { ReconnectLease } from './reconnect-proxy-types'

const base = createReconnectTest(
  /* 缺能力的直接CLI連proxy都不建立。 */ async () => {
    readIngressOwner(process.env)
    return startReconnectProxy()
  },
)
const test = base.extend<object, { ingressController: IngressFaultController }>({
  ingressController: [
    /* 依賴proxy確保controller先於它收尾，跨兩案保留once。 */ async ({ reconnectProxy }, use) => {
      void reconnectProxy
      const controller = createRuntimeIngressController()
      try {
        await use(controller)
      } finally {
        await controller.close()
      }
    },
    { scope: 'worker', auto: true, timeout: 5000 },
  ],
})
// 正式reset前再驗能力，不在同案恢復過程重建AuthSession／KV。
test.beforeEach(async () => {
  readIngressOwner(process.env)
  await withIngressComposeProject(
    'console',
    /* 原同步reset只在固定console project執行。 */ async () => resetStack(),
  )
})

// 所有晚到await後、下一副作用前先檢查本case是否仍有效。
function live(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('ingress_cancelled')
}
// 收尾也有界且不帶下層cause，下一層仍由finally繼續清理。
async function cleanup(operation: () => Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      operation(),
      new Promise<never>(
        /* 不讓清理卡到整案期限。 */ (_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('ingress_cleanup_failed')), 5000)
        },
      ),
    ])
  } catch {
    throw new Error('ingress_cleanup_failed')
  } finally {
    clearTimeout(timer)
  }
}
// 只輸出安全計數／時間，不讀ticket、key、frame或畫面內容。
function record(
  stage: string,
  which: IngressCase,
  controller: IngressFaultController,
  lease?: ReconnectLease,
  resources?: ReturnType<typeof observeConsole>,
  receipt?: IngressFaultReceipt,
): void {
  console.info(
    JSON.stringify({
      event: 'reconnect_ingress',
      utc: new Date().toISOString(),
      stage,
      case: which,
      platform: 'linux',
      base: '/rdweb',
      mode: 'preserve',
      nativeCloseCode: 'not-observed',
      budget: controller.summary(),
      ...(lease ? { summary: lease.summary() } : {}),
      ...(resources ? { resources: { ...resources } } : {}),
      ...(receipt ? { receipt } : {}),
    }),
  )
}
// 真故障只由本輪controller派發，任何首次auto失敗都停止而不是等待第二次。
async function ingress(
  page: Page,
  browser: Browser,
  which: IngressCase,
  controller: IngressFaultController,
  control: { begin(target: string): ReconnectLease },
): Promise<void> {
  const resources = observeConsole(page.context()),
    abort = new AbortController()
  let fixture: InputFixture | undefined,
    remote: Page | undefined,
    lease: ReconnectLease | undefined,
    probe: LongrunPageProbe | undefined,
    watch: IngressWatch | undefined,
    http: ReturnType<typeof observeIngressHttp> | undefined,
    receipt: IngressFaultReceipt | undefined,
    work: Promise<void> | undefined,
    oldClosedAt: number | null = null
  let rejectLimited!: (error: Error) => void
  const limited = new Promise<never>(
    /* 非預期429當次立即停止。 */ (_resolve, reject) => {
      rejectLimited = reject
    },
  )
  void limited.catch(/* 保留原promise供主流程race。 */ () => {})
  const response = /* 不保存原URL／body或錯誤內容。 */ (value: Response): void => {
    if (value.status() === 429) {
      abort.abort()
      rejectLimited(new Error('ingress_observation_failed'))
    }
  }
  page.context().on('response', response)
  record('begin', which, controller)
  console.info('Ingress browser: ' + browser.version())
  try {
    work = (async () => {
      fixture = await withIngressComposeProject(
        'official',
        /* 固定官方fixture的observer／geometry子程序，不改helper。 */ () =>
          prepareLinuxInputTarget(which),
      )
      live(abort.signal)
      lease = control.begin(fixture.targetId)
      const first = lease.nextAccepted(abort.signal)
      void first.catch(/* 取消後等待不可unhandled。 */ () => {})
      remote = await openOfficialConsole(page, fixture)
      live(abort.signal)
      const initialHandle = await first
      live(abort.signal)
      await waitForInputVideo(remote, fixture)
      live(abort.signal)
      expect(resources.opened).toBe(1)
      expect(resources.closed).toBe(0)
      expect(resources.wrongPrefix).toBe(0)
      await expect(remote.getByTestId('console-auto-reconnect')).toBeChecked()
      live(abort.signal)
      const oldWorker = remote.workers()[0]
      if (!oldWorker || remote.workers().length !== 1) throw new Error('ingress_observation_failed')
      oldWorker.once(
        'close',
        /* 原生生命週期外部錨點，不推CloseEvent code。 */ () => {
          oldClosedAt = performance.now()
        },
      )
      probe = await createLongrunPageProbe(remote, lease, resources)
      live(abort.signal)
      await probe.mark(oldWorker)
      live(abort.signal)
      const ports = ingressPagePorts(probe, lease),
        baseline = await ports.read(abort.signal)
      live(abort.signal)
      expect(
        baseline.streaming &&
          baseline.visibleThroughout &&
          baseline.terminal === 'none' &&
          baseline.retryMask === 0 &&
          baseline.cutsNull,
      ).toBe(true)
      http = observeIngressHttp(remote, fixture.targetId)
      watch = startIngressWatch(ports, baseline, abort.signal)
      const accepted = lease.nextAccepted(abort.signal)
      void accepted.catch(/* 預先處理取消，不換原promise。 */ () => {})
      const guarded = Promise.race([watch.failed, http.failed, limited])
      void guarded.catch(/* 主流程仍await同promise。 */ () => {})
      await Promise.race([
        guarded,
        (async () => {
          const fault = controller.restart(which, abort.signal)
          const values = await Promise.all([fault, watch!.fresh, accepted])
          live(abort.signal)
          receipt = values[0]
          expect(values[2]).not.toBe(initialHandle)
          expect(values[1].metadataAt >= receipt.faultRequestedAt).toBe(true)
          expect(oldClosedAt !== null && oldClosedAt >= receipt.faultRequestedAt).toBe(true)
          await waitForInputVideo(remote!, fixture!)
          live(abort.signal)
          expect(remote!.workers().length).toBe(1)
          expect(remote!.workers()[0]).not.toBe(oldWorker)
          const state = lease!.summary()
          expect({
            metadata: state.routes.target.requested,
            ticket: state.routes.ticket.requested,
            accepted: state.accepted,
            opened: resources.opened,
            closed: resources.closed,
          }).toEqual({ metadata: 2, ticket: 2, accepted: 2, opened: 2, closed: 1 })
          expect(resources.wrongPrefix).toBe(0)
          expect(state.attempts).toHaveLength(2)
          for (const kind of ['target', 'ticket', 'me', 'assist'] as const) {
            expect(state.routes[kind].requested).toBe(baseline.routes[kind].requested + 1)
            expect(state.routes[kind].succeeded).toBe(baseline.routes[kind].succeeded + 1)
          }
          for (const row of state.attempts)
            expect(
              row.cutAt === null &&
                row.meAt !== null &&
                row.ticketAt !== null &&
                row.acceptedAt !== null &&
                row.metadataAt <= row.meAt &&
                row.meAt <= row.ticketAt &&
                row.ticketAt <= row.acceptedAt,
            ).toBe(true)
          record('recovered', which, controller, lease, resources, receipt)
          watch!.beginEnd()
          live(abort.signal)
          await remote!.getByTestId('console-end').click()
          live(abort.signal)
          await assertCanvasEmptyAndWorkersClosed(remote!)
          live(abort.signal)
          await expect.poll(/* 真Worker close，不手改計數。 */ () => resources.closed).toBe(2)
          live(abort.signal)
          const quiet = await watch!.quiet()
          live(abort.signal)
          expect(quiet.untilAt - quiet.fromAt).toBeGreaterThanOrEqual(10500)
        })(),
      ])
    })()
    await Promise.race([work, limited])
  } finally {
    abort.abort()
    page.context().off('response', response)
    http?.close()
    try {
      await cleanup(/* 停止唯一probe reader。 */ async () => watch?.close())
    } finally {
      try {
        await cleanup(/* 先dispose被動DOM observer。 */ async () => probe?.close())
      } finally {
        try {
          await cleanup(
            /* 關頁讓晚到影像等待確實終止。 */ async () => {
              if (remote && !remote.isClosed()) await remote.close()
            },
          )
        } finally {
          try {
            await cleanup(
              /* 正式API fixture owner獨立釋放。 */ async () => fixture?.context.dispose(),
            )
          } finally {
            try {
              await cleanup(/* 原lease.close不呼pair interrupt。 */ async () => lease?.close())
              if (lease)
                expect(lease.summary()).toMatchObject({
                  active: 0,
                  sockets: 0,
                  http: 0,
                  upgrades: 0,
                  waiters: 0,
                  timers: 0,
                  closed: true,
                })
            } finally {
              await cleanup(
                /* losing branch已取消，仍等它真正退出。 */ async () => {
                  await work?.catch(() => {})
                },
              )
              record('finally', which, controller, lease, resources, receipt)
            }
          }
        }
      }
    }
  }
  record('PASS', which, controller, lease, resources, receipt)
}
for (const which of ['tcp', 'ws'] as const) {
  // 只有取得另外當次真操作許可後才由正式runner執行。
  test(`official reconnect after owned ingress crash over linux/${which}`, async ({
    page,
    browser,
    ingressController,
    reconnectCase,
  }) => {
    await ingress(page, browser, which, ingressController, reconnectCase)
  })
}
