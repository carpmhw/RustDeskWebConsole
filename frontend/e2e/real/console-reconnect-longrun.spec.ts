import type { Page, Browser, Response } from '@playwright/test'
import { test, expect } from './reconnect-fixtures'
import { resetStack } from '../management/helpers/fixtures'
import {
  prepareLinuxInputTarget,
  waitForInputVideo,
  assertCanvasEmptyAndWorkersClosed,
  type InputFixture,
} from './input-fixtures'
import { openOfficialConsole, observeConsole } from './fixtures'
import type { ReconnectLease, TunnelHandle } from './reconnect-proxy-types'
import { createLongrunBudget } from './reconnect-longrun-budget'
import {
  createLongrunPageProbe,
  longrunPagePorts,
  type LongrunPageProbe,
} from './reconnect-longrun-page'
import {
  watchLongrun,
  shortCutAt,
  deadlineCutAt,
  type LongrunCase,
  type LongrunReceipt,
  type LongrunCounts,
} from './reconnect-longrun-observer'

const budget = createLongrunBudget()
type Resources = ReturnType<typeof observeConsole>
type Control = { begin(target: string): ReconnectLease }
// 每案只正常重建console，case內不reset actor／auth／KV。
test.beforeEach(() => resetStack())

// 安全scalar摘要不含target、URL或runtime credentials。
function record(
  stage: string,
  id: LongrunCase,
  lease?: ReconnectLease,
  resources?: Resources,
  receipt?: LongrunReceipt,
): void {
  console.info(
    JSON.stringify({
      event: 'reconnect_longrun',
      utc: new Date().toISOString(),
      stage,
      case: id,
      platform: 'linux',
      base: '/rdweb',
      mode: 'preserve',
      budget: budget.summary(),
      ...(lease ? { summary: lease.summary() } : {}),
      ...(resources ? { resources: { ...resources } } : {}),
      ...(receipt ? { receipt } : {}),
    }),
  )
}
// Pending waiter在cut之前註冊，取消晚回不變成新的成功。
function next(lease: ReconnectLease, signal: AbortSignal): Promise<TunnelHandle> {
  const pending = lease.nextAccepted(signal)
  void pending.catch(/* 原promise仍由主流程await，finally只免unhandled。 */ () => {})
  return pending
}
// 任何新cut前檢查本案取消，不能由晚到helper再切線。
function interrupt(
  id: LongrunCase,
  lease: ReconnectLease,
  handle: TunnelHandle,
  signal: AbortSignal,
): number {
  if (signal.aborted) throw new Error('longrun_cancelled')
  const at = budget.cut(id, lease, handle)
  record('cut', id, lease)
  return at
}
// 各正式HTTP／Worker／accepted計數必須相互匹配，不只驗WS數。
function fresh(lease: ReconnectLease, resources: Resources, expected: number): void {
  const state = lease.summary()
  expect({
    metadata: state.routes.target.requested,
    tickets: state.routes.ticket.requested,
    accepted: state.accepted,
    opened: resources.opened,
  }).toEqual({ metadata: expected, tickets: expected, accepted: expected, opened: expected })
  expect(state.attempts).toHaveLength(expected)
  expect(resources.wrongPrefix).toBe(0)
  for (const row of state.attempts)
    expect(
      row.meAt !== null &&
        row.ticketAt !== null &&
        row.acceptedAt !== null &&
        row.metadataAt <= row.meAt &&
        row.meAt <= row.ticketAt &&
        row.ticketAt <= row.acceptedAt,
    ).toBe(true)
  for (const route of Object.values(state.routes)) expect(route.limited).toBe(0)
}
// 接受並不等於有影像，真PeerInfo／公開clock之後再等舊Worker close。
async function video(page: Page, fixture: InputFixture, resources: Resources, expected: number) {
  await waitForInputVideo(page, fixture)
  await expect
    .poll(/* 只觀測native close，不假清計數。 */ () => resources.closed)
    .toBe(expected - 1)
  expect(resources.opened).toBe(expected)
  const workers = page.workers()
  expect(workers.length).toBe(1)
  return workers[0]!
}
// 同一stage的恆定計數均由probe即時回傳copy。
async function counts(probe: LongrunPageProbe, signal: AbortSignal): Promise<LongrunCounts> {
  const value = await probe.read(signal)
  expect(value.visibleThroughout).toBe(true)
  expect(value.terminal).toBe('none')
  return value.counts
}

// 只觀察真公開影像，不新增遠端鍵鼠、Clipboard API或permission grant。
async function longrun(
  page: Page,
  browser: Browser,
  control: Control,
  transport: 'tcp' | 'ws',
  kind: 'S' | 'D',
): Promise<void> {
  const id: LongrunCase = `${kind}/${transport}`,
    resources = observeConsole(page.context()),
    abort = new AbortController()
  let fixture: InputFixture | undefined,
    remote: Page | undefined,
    lease: ReconnectLease | undefined,
    probe: LongrunPageProbe | undefined
  let rejectLimited!: (error: Error) => void
  const limited = new Promise<never>(
    /* 真429只停止，不造fake429或換actor。 */ (_resolve, reject) => {
      rejectLimited = reject
    },
  )
  const response = (value: Response): void => {
    if (value.status() === 429) {
      abort.abort()
      rejectLimited(new Error('reconnect_rate_limited'))
    }
  }
  page.context().on('response', response)
  record('begin', id)
  console.info('Reconnect longrun browser: ' + browser.version())
  try {
    await Promise.race([
      limited,
      (async () => {
        fixture = await prepareLinuxInputTarget(transport)
        lease = control.begin(fixture.targetId)
        const initial = next(lease, abort.signal)
        remote = await openOfficialConsole(page, fixture)
        const first = await initial
        await video(remote, fixture, resources, 1)
        await expect(remote.getByTestId('console-auto-reconnect')).toBeChecked()
        fresh(lease, resources, 1)
        probe = await createLongrunPageProbe(remote, lease, resources)
        const ports = longrunPagePorts(probe)
        const accepted = next(lease, abort.signal)
        const t0 = interrupt(id, lease, first, abort.signal)
        let handle = await accepted
        await probe.mark(await video(remote, fixture, resources, 2))
        fresh(lease, resources, 2)
        expect(lease.summary().attempts[1]!.metadataAt - t0 >= 2000).toBe(true)
        let baseline = await counts(probe, abort.signal)
        if (kind === 'S') {
          const until = performance.now() + 61000
          record(
            'stable_observed',
            id,
            lease,
            resources,
            await watchLongrun(ports, { kind: 'stream', until, counts: baseline }, abort.signal),
          )
          await probe.mark(null)
          const recovered = next(lease, abort.signal)
          const at = interrupt(id, lease, handle, abort.signal)
          const observation = watchLongrun(
            ports,
            { kind: 'retry-one', cutAt: at, counts: baseline },
            abort.signal,
          )
          const [, receipt] = await Promise.all([recovered, observation])
          await video(remote, fixture, resources, 3)
          fresh(lease, resources, 3)
          const after = await probe.read(abort.signal)
          expect({
            mask: after.retryMask,
            visible: after.visibleThroughout,
            terminal: after.terminal,
          }).toEqual({ mask: 1, visible: true, terminal: 'none' })
          record('stable_reset', id, lease, resources, receipt)
          await remote.getByTestId('console-end').click()
          await assertCanvasEmptyAndWorkersClosed(remote)
          await expect.poll(/* 第三個Worker也必須真close。 */ () => resources.closed).toBe(3)
        } else {
          const secondTarget = shortCutAt(handle.acceptedAt, performance.now())
          record(
            'short_stream',
            id,
            lease,
            resources,
            await watchLongrun(
              ports,
              { kind: 'stream', until: secondTarget, counts: baseline },
              abort.signal,
            ),
          )
          expect(
            performance.now() <= secondTarget + 1000 &&
              performance.now() - handle.acceptedAt < 60000,
          ).toBe(true)
          const recovered = next(lease, abort.signal)
          const secondCut = interrupt(id, lease, handle, abort.signal)
          expect(secondCut <= secondTarget + 1000 && secondCut - handle.acceptedAt < 60000).toBe(
            true,
          )
          handle = await recovered
          await probe.mark(await video(remote, fixture, resources, 3))
          fresh(lease, resources, 3)
          expect(lease.summary().attempts[2]!.metadataAt - secondCut >= 5000).toBe(true)
          baseline = await counts(probe, abort.signal)
          const thirdTarget = deadlineCutAt(t0, handle.acceptedAt, performance.now())
          record(
            'second_short_stream',
            id,
            lease,
            resources,
            await watchLongrun(
              ports,
              { kind: 'stream', until: thirdTarget, counts: baseline },
              abort.signal,
            ),
          )
          expect(
            performance.now() <= t0 + 115000 && performance.now() - handle.acceptedAt < 60000,
          ).toBe(true)
          await probe.mark(null)
          const thirdCut = interrupt(id, lease, handle, abort.signal)
          expect(
            thirdCut >= thirdTarget &&
              thirdCut <= t0 + 115000 &&
              thirdCut - handle.acceptedAt < 60000,
          ).toBe(true)
          await expect(remote.getByTestId('console-reconnect')).toHaveText('重新連線第 2／3 次', {
            timeout: 1000,
          })
          // 先等close但不可跨早期deadline取樣窗，否則可能漏掉提早timeout。
          await expect.poll(() => resources.closed, { timeout: 1000 }).toBe(3)
          expect(performance.now() < t0 + 119000).toBe(true)
          baseline = await counts(probe, abort.signal)
          record(
            'deadline_timeout',
            id,
            lease,
            resources,
            await watchLongrun(
              ports,
              { kind: 'deadline', cutAt: t0, counts: baseline },
              abort.signal,
            ),
          )
          await assertCanvasEmptyAndWorkersClosed(remote)
          record(
            'timeout_quiet',
            id,
            lease,
            resources,
            await watchLongrun(ports, { kind: 'quiet', counts: baseline }, abort.signal),
          )
          fresh(lease, resources, 3)
          expect(resources.closed).toBe(3)
        }
        record('PASS', id, lease, resources)
      })(),
    ])
  } finally {
    abort.abort()
    page.context().off('response', response)
    try {
      await probe?.close()
    } finally {
      try {
        if (remote && !remote.isClosed()) await remote.close()
      } finally {
        try {
          await fixture?.context.dispose()
        } finally {
          try {
            if (lease) {
              await lease.close()
              expect(lease.summary()).toMatchObject({
                active: 0,
                sockets: 0,
                http: 0,
                upgrades: 0,
                waiters: 0,
                timers: 0,
                closed: true,
              })
            }
          } finally {
            record('finally', id, lease, resources)
          }
        }
      }
    }
  }
}

for (const transport of ['tcp', 'ws'] as const) {
  // S獨立證真61秒後由第一次auto重新開始，不能混基本矩陣。
  test(`official reconnect stable sixty seconds over linux/${transport}`, async ({
    page,
    browser,
    reconnectCase,
  }) => {
    await longrun(page, browser, reconnectCase, transport, 'S')
  })
  // D使用原cycle期限，不把三次耗盡或正常串流120秒當成功。
  test(`official reconnect original cycle timeout over linux/${transport}`, async ({
    page,
    browser,
    reconnectCase,
  }) => {
    await longrun(page, browser, reconnectCase, transport, 'D')
  })
}
