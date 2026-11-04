import { expect, it } from 'vitest'
import { receiverApi } from './test-fixtures'

// 假port只記錄操作順序，不建立Playwright、DOM或任何socket。
type Snapshot = {
  streaming: boolean
  inputReady: boolean
  identityVerified: boolean
  scopeIntact: boolean
  overflow: boolean
  unavailable: boolean
}

class FakePort {
  time = 0
  step = 5000
  calls: string[] = []
  value: Snapshot = {
    streaming: true,
    inputReady: true,
    identityVerified: true,
    scopeIntact: true,
    overflow: false,
    unavailable: false,
  }
  readyError = false
  snapshotValue: Snapshot | null = null
  submissionAccepted = true

  // 以test擁有的單調time回傳，不由scenario讀真clock。
  now(): number {
    return this.time
  }

  // 只回固定安全布林；不保存文字或事件原文。
  snapshot(): Snapshot {
    return this.snapshotValue ?? this.value
  }

  // 固定三動作依序記錄，方便斷言只送一次。
  async ready() {
    this.calls.push('ready')
    if (this.readyError) throw new Error('public_ready_failure')
  }

  async clickRemote() {
    this.calls.push('click')
  }

  async selectAll() {
    this.calls.push('select')
  }

  async insertText() {
    this.calls.push('insert')
  }

  // 接收器自己的窗可能較晚結束，Client只能被動等peer收尾。
  async waitForPeerEnd(deadline: number): Promise<void> {
    if (deadline < this.time) throw new Error('public_deadline_exceeded')
    this.calls.push('peer-end')
  }

  // 真adapter需取得既有Main／加密前五鍵布林，press返回本身不是證據。
  async submissionEvidence(): Promise<boolean> {
    this.calls.push('evidence')
    return this.submissionAccepted
  }

  // 測試以step控制觀察窗；不讓真timer參與。
  async wait() {
    this.calls.push('wait')
    this.time += this.step
  }

  // 若scenario誤呼叫close，測試立即失敗。
  async close(): Promise<boolean> {
    throw new Error('public_close_called')
  }
}

// 測試檔只載入公開scenario核心，不載入Playwright spec。
async function api() {
  return (await receiverApi('scenario')) as typeof import('./scenario')
}

// 成功情境必須先ready、再三動作、之後只等待而不送額外輸入。
it('runs exactly click, select-all and one insert before a quiet 5000ms window', async () => {
  const c = await api(),
    port = new FakePort()
  const result = await c.runReceiverScenario(port, 'Public 中文')
  expect(port.calls).toEqual(['ready', 'click', 'select', 'insert', 'wait', 'evidence', 'peer-end'])
  expect(result).toEqual({
    identityVerified: true,
    videoPresented: true,
    submitted: true,
    observationComplete: true,
    scopeIntact: true,
    unavailable: false,
  })
})

// 不允許僅憑三個Playwright promise完成就宣告submitted成功。
it('requires the main and pre-encryption evidence before accepting submission', async () => {
  const c = await api(),
    port = new FakePort()
  port.submissionAccepted = false
  expect((await c.runReceiverScenario(port, 'Public 中文')).unavailable).toBe(true)
  expect(port.calls).not.toContain('peer-end')
})

// 只用既有六／八布林；錯textExact或晚到輸入不得被視為正常提交。
it('validates the existing submission booleans without adding another profile', async () => {
  const c = await api()
  expect(typeof c.confirmReceiverSubmission).toBe('function')
  const main = {
    prefixSubmitted: true,
    prefixAccepted: true,
    postTextInput: false,
    clipboardObserved: false,
    scopeInterrupted: false,
    overflow: false,
  }
  const encoded = {
    observed: true,
    textExact: true,
    textSingle: true,
    initialSelectComplete: true,
    sequenceComplete: true,
    sequenceInvalid: false,
    overflow: false,
    unavailable: false,
  }
  expect(c.confirmReceiverSubmission(main, encoded)).toBe(true)
  for (const field of ['textExact', 'textSingle', 'initialSelectComplete', 'sequenceComplete'])
    expect(c.confirmReceiverSubmission(main, { ...encoded, [field]: false })).toBe(false)
  expect(c.confirmReceiverSubmission({ ...main, postTextInput: true }, encoded)).toBe(false)
  expect(c.confirmReceiverSubmission(main, { ...encoded, unavailable: true })).toBe(false)
})

// 本地5秒完成不是結束授權，receiver未關閉時不得提前回報供caller斷線。
it('keeps the client alive after its window until the receiver ends', async () => {
  const c = await api(),
    port = new FakePort()
  let release: (() => void) | undefined,
    completed = false
  port.waitForPeerEnd = async (deadline) => {
    expect(deadline).toBe(180000)
    await new Promise<void>((resolve) => {
      release = resolve
    })
  }
  const result = c.runReceiverScenario(port, 'Public 中文').then((value) => {
    completed = true
    return value
  })
  for (let i = 0; i < 12; i++) await Promise.resolve()
  expect(completed).toBe(false)
  expect(typeof release).toBe('function')
  release!()
  expect((await result).unavailable).toBe(false)
})

// receiver不結束或drain失敗不能把本地五秒成功當完整結果。
it('fails closed when waiting for the peer end fails', async () => {
  const c = await api(),
    port = new FakePort()
  port.waitForPeerEnd = async () => {
    throw new Error('public_peer_end_failure')
  }
  expect((await c.runReceiverScenario(port, 'Public 中文')).unavailable).toBe(true)
})

// ready失敗時不得先送出任何輸入，也不得假稱影片已呈現。
it('does not submit before streaming and input are ready', async () => {
  const c = await api(),
    port = new FakePort()
  port.readyError = true
  const result = await c.runReceiverScenario(port, 'Public 中文')
  expect(port.calls).toEqual(['ready'])
  expect(result).toMatchObject({ submitted: false, unavailable: true })
})

// ready回傳但snapshot顯示尚未streaming／input-ready時仍不得固定三動作。
it.each(['streaming', 'inputReady', 'scopeIntact', 'overflow', 'unavailable'])(
  'rejects an unsafe initial snapshot: %s',
  async (name) => {
    const c = await api(),
      port = new FakePort()
    port.snapshotValue = { ...port.value, [name]: name === 'overflow' || name === 'unavailable' }
    const result = await c.runReceiverScenario(port, 'Public 中文')
    expect(port.calls).toEqual(['ready'])
    expect(result).toMatchObject({ submitted: false, unavailable: true })
  },
)

// 5000ms內斷線、scope中斷或溢位都保留失敗，不以最後一筆成功覆寫。
it.each(['streaming', 'scopeIntact', 'overflow', 'unavailable'])(
  'stops the observation when %s becomes unsafe',
  async (name) => {
    const c = await api(),
      port = new FakePort()
    let calls = 0
    port.snapshot = () => {
      calls++
      return calls === 1
        ? port.value
        : { ...port.value, [name]: name === 'overflow' || name === 'unavailable' }
    }
    const result = await c.runReceiverScenario(port, 'Public 中文')
    expect(result).toMatchObject({ submitted: true, observationComplete: false, unavailable: true })
  },
)

// 時鐘回退、非有限或超過180秒都必須停止，不延長觀察窗。
it.each([
  ['regress', () => -1],
  ['invalid', () => Number.NaN],
  ['over-budget', () => 180001],
])('stops on a %s monotonic clock', async (_name, step) => {
  const c = await api(),
    port = new FakePort()
  port.step = step()
  const result = await c.runReceiverScenario(port, 'Public 中文')
  expect(result.submitted).toBe(true)
  expect(result.unavailable).toBe(true)
})

// 不執行close；收尾與resourcesClosed由呼叫端依自有資源證據彙總。
it('does not close or report resources itself', async () => {
  const c = await api(),
    port = new FakePort()
  const result = await c.runReceiverScenario(port, 'Public 中文')
  expect(result).not.toHaveProperty('resourcesClosed')
})
