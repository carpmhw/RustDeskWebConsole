import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import type { Page } from '@playwright/test'

const state = vi.hoisted(
  /* 外部API／瀏覽器替身的狀態只屬本案。 */ () => ({
    actions: [] as string[],
    fail: '',
    main: {
      prefixSubmitted: true,
      prefixAccepted: true,
      postTextInput: false,
      clipboardObserved: false,
      scopeInterrupted: false,
      overflow: false,
    },
    resources: { wrongPrefix: 0, opened: 1, closed: 0 },
    reports: [] as unknown[],
  }),
)

vi.mock(
  '../../e2e/management/helpers/fixtures',
  /* 不啟動Docker。 */ () => ({
    resetStack: /* 只記錄外部邊界。 */ () => state.actions.push('reset'),
  }),
)
vi.mock(
  '../../e2e/real/fixtures',
  /* 不開真session／socket。 */ () => ({
    observeConsole: /* 同一資源計數物件。 */ () => state.resources,
    openOfficialConsole: /* 回原fake page。 */ async (page: Page) => page,
  }),
)
vi.mock(
  '../../e2e/real/input-fixtures',
  /* 隔離正式API與canvas，而保留scenario實際控制流。 */ () => ({
    clickRemote: /* 原clickRemote是瀏覽器邊界。 */ async (_page: Page, x: number, y: number) => {
      state.actions.push(`click:${x},${y}`)
    },
    prepareInputTarget: /* 模擬正式context所有權。 */ async () => ({
      editor: { x: 0, y: 152, width: 1075, height: 508 },
      context: {
        dispose: /* 只釋放本案context。 */ async () => {
          state.actions.push('dispose')
          if (state.fail === 'dispose') throw new Error('private error')
        },
      },
    }),
    waitForInputVideo: /* 只替代真機首影像。 */ async () => {
      state.actions.push('video')
    },
    assertCanvasEmptyAndWorkersClosed:
      /* 真驗收由helper另有涵蓋，此案觀察失敗控制流。 */ async () => {
        state.actions.push('workers-closed')
      },
  }),
)
vi.mock(
  '../../e2e/real/encoded-input-diagnostics',
  /* 主／Worker收集器已有真channel測試。 */ () => ({
    attachEncodedInputDiagnostics: /* 不建立Worker。 */ async () => undefined,
    prepareEncodedInputWorker: /* 不執行真瀏覽器evaluate。 */ async () => undefined,
  }),
)
vi.mock(
  '../../e2e/real/host-observation-control',
  /* 不碰live cache。 */ () => ({
    readHostInputOnlyObservation: /* 只回公開fixture。 */ () => ({
      expected: 'Public 中文 RdWeb test',
    }),
    createHostInputOnlyObservation: /* 控制檔由其他真filesystem測試覆蓋。 */ () => ({
      expected: 'Public 中文 RdWeb test',
      start: /* 一次開始。 */ () => {
        state.actions.push('start')
      },
      pollReady: /* 模擬守衛拒絕，不建立新ready。 */ () => {
        if (state.fail === 'ready') throw new Error('private error')
        return true
      },
      finish: /* 保存實際生命週期產生的report供斷言。 */ (value: unknown) => {
        state.reports.push(structuredClone(value))
      },
    }),
  }),
)

// 用存在性斷言看缺能力RED，避免module不存在成為唯一失敗原因。
async function scenario() {
  expect(
    existsSync('e2e/real/host-input-only-scenario.ts'),
    'input-only scenario unavailable',
  ).toBe(true)
  return import('../../e2e/real/host-input-only-scenario')
}
// 瀏覽器邊界只實作真case需要的方法；額外操作會失敗而非默許。
function pageFixture(): Page {
  let closed = false
  const page = {
    context: /* 不接受clipboard permission或文字logger入口。 */ () => ({
      addInitScript: /* 只註冊安裝，不執行native。 */ async () => {
        state.actions.push('init')
      },
    }),
    keyboard: {
      press: /* 每個實際按鍵操作都可觀察。 */ async (key: string) => {
        state.actions.push(key)
        if (state.fail === 'input') throw new Error('private key error')
      },
      insertText: /* 整段只允許一次公開fixture。 */ async (text: string) => {
        state.actions.push(`text:${text}`)
      },
    },
    evaluate: /* browser函數仍真執行，只有跨程序邊界被替代。 */ async (
      fn: (value?: unknown) => unknown,
      value?: unknown,
    ) => fn(value),
    getByTestId: /* 只允許停用重連與關閉自有console。 */ (id: string) => ({
      uncheck: /* 不點遠端畫面。 */ async () => {
        state.actions.push(`uncheck:${id}`)
      },
      click: /* 主動end或cleanup只可作用本案。 */ async () => {
        state.actions.push(`ui:${id}`)
        if (id !== 'console-end' || state.fail === 'end') throw new Error('private UI error')
        state.resources.closed = 1
      },
    }),
    isClosed: /* 自有page狀態。 */ () => closed,
    close: /* 關閉本案page時同步釋放Worker。 */ async () => {
      state.actions.push('close')
      if (state.fail === 'close') throw new Error('private close error')
      closed = true
      state.resources.closed = 1
    },
  }
  return page as unknown as Page
}
// 各案只持有公開布林及固定文字，fake clock避免等待真5秒。
beforeEach(() => {
  state.actions = []
  state.fail = ''
  state.reports = []
  state.resources = { wrongPrefix: 0, opened: 1, closed: 0 }
  state.main = {
    prefixSubmitted: true,
    prefixAccepted: true,
    postTextInput: false,
    clipboardObserved: false,
    scopeInterrupted: false,
    overflow: false,
  }
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.stubGlobal('document', { querySelector: /* 只表示streaming仍存在。 */ () => ({}) })
  vi.stubGlobal('window', {
    __rdwebInputDiagnostics: {
      beginTextOnly: /* 記錄不帶payload的安裝步驟。 */ () => state.actions.push('begin-main'),
      beginTimeline: /* 明確啟用timeline。 */ () => state.actions.push('begin-timeline'),
      textOnlySnapshot: /* 真window迴圈讀到此有界六布林。 */ () => ({ ...state.main }),
      takeTimeline: /* 固定安全timeline。 */ () => ({
        clockDomain: 'browser_main',
        events: [],
        overflow: false,
        unavailable: false,
      }),
    },
    __rdwebEncodedInputDiagnostics: {
      beginInputOnly: /* 不提供舊begin或takeWithText方法。 */ () =>
        state.actions.push('begin-encoded'),
      takeInputOnly: /* 固定八布林，模擬同scope快照或transport故障。 */ async () => {
        state.actions.push('take')
        if (state.fail === 'take') throw new Error('private take error')
        return {
          observed: true,
          textExact: true,
          textSingle: true,
          initialSelectComplete: true,
          sequenceComplete: true,
          sequenceInvalid: false,
          overflow: false,
          unavailable: false,
        }
      },
      cancel: /* 取消只作用診斷scope。 */ () => state.actions.push('cancel'),
    },
  })
})
// 不留下fake全域或timer。
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// 已返回insertText立即開始固定窗；不得等ACK或任何host相等訊號。
it('passive_window_is_fixed_and_never_waits_for_exact_or_ack', async () => {
  const { waitInputOnlyObservation } = await scenario()
  state.main.prefixAccepted = false
  const read = /* 安全Main快照不含host結果。 */ async () => ({ ...state.main })
  const waiting = waitInputOnlyObservation(read)
  let settled = false
  void waiting.then(
    /* 只觀察時間邊界。 */ () => {
      settled = true
    },
  )
  await vi.advanceTimersByTimeAsync(4999)
  expect(settled).toBe(false)
  state.main.prefixAccepted = true
  await vi.advanceTimersByTimeAsync(1)
  expect((await waiting).observation).toEqual({ budgetMs: 5000, elapsedMs: 5000, completed: true })
  expect(vi.getTimerCount()).toBe(0)
})
// 中斷與clock失效立即停止，不重新arm或回覆private錯誤。
it.each([
  'postTextInput',
  'clipboardObserved',
  'scopeInterrupted',
  'overflow',
  'nan',
  'infinity',
  'regressed',
  'read-fault',
])(
  'passive_window_rejects_interruptions_and_clock_regression: %s',
  /* 各案只更動一個安全輸入。 */ async (kind) => {
    const { waitInputOnlyObservation } = await scenario()
    let clock = 1000
    const read = /* 測試不涉及任何native reader。 */ async () => {
      if (kind === 'read-fault') throw new Error('private error')
      if (kind in state.main) Object.assign(state.main, { [kind]: true })
      if (kind === 'regressed') clock = 999
      return { ...state.main }
    }
    const now = /* 固定或失效的monotonic clock。 */ () =>
      kind === 'nan' ? NaN : kind === 'infinity' ? Infinity : clock
    await expect(waitInputOnlyObservation(read, now)).rejects.toThrow(
      'input_only_observation_unavailable',
    )
    expect(vi.getTimerCount()).toBe(0)
  },
)
// scenario不得增加第二個click、接收／copy或clipboard API。
it('scenario_emits_only_initial_click_select_and_one_text', async () => {
  const { runHostInputOnlyScenario } = await scenario()
  const result = runHostInputOnlyScenario(
    pageFixture(),
    { editor: { x: 0, y: 152 } } as never,
    'Public test',
  )
  await vi.advanceTimersByTimeAsync(5000)
  expect((await result).observation.completed).toBe(true)
  expect(state.actions).toEqual(['click:20,182', 'Control+a', 'text:Public test'])
})
// 同一實際生命週期才可保存完成；不把fake session本身當Windows成功。
it('input-only case closes owned resources before saving its independent client', async () => {
  const { executeHostInputOnlyCase } = await scenario()
  const waiting = executeHostInputOnlyCase(pageFixture())
  await vi.advanceTimersByTimeAsync(5000)
  await waiting
  expect(state.reports).toMatchObject([
    { code: 'input_only_completed', resourcesClosed: true, observation: { completed: true } },
  ])
  expect(
    state.actions.filter(
      /* 只計輸入與取證動作。 */ (value) => ['Control+a', 'take'].includes(value),
    ),
  ).toEqual(['Control+a', 'take'])
  expect(state.actions.slice(-3)).toEqual(['cancel', 'close', 'dispose'])
})
// 任一步失敗不重試、不再輸入，晚到結果不能恢復completed。
it.each(['ready', 'input', 'take', 'end', 'close', 'dispose'])(
  'input-only case preserves failure and performs owned cleanup: %s',
  /* 故障只注入一個外部邊界，生命週期本體保持真實。 */ async (failure) => {
    const { executeHostInputOnlyCase } = await scenario()
    state.fail = failure
    const waiting = executeHostInputOnlyCase(pageFixture())
    const failed = expect(waiting).rejects.toThrow(/^input_only_/)
    await vi.advanceTimersByTimeAsync(5000)
    await failed
    expect(state.reports).toHaveLength(1)
    expect(state.reports).not.toMatchObject([{ code: 'input_only_completed' }])
    expect(
      state.actions.filter(/* 不重試取證。 */ (value) => value === 'take').length,
    ).toBeLessThanOrEqual(1)
    if (failure === 'ready') expect(state.actions).not.toContain('click:20,182')
    if (failure === 'input')
      expect(
        state.actions.some(/* 第二步失敗不送文字。 */ (value) => value.startsWith('text:')),
      ).toBe(false)
    expect(state.actions).toContain('close')
    expect(state.actions).toContain('dispose')
  },
)
