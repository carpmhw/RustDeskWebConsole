import { receiverFields } from './contract.ts'

// 只暴露安全布林；不保存輸入原文、事件陣列或DOM快照。
export interface ReceiverScenarioSnapshot {
  streaming: boolean
  inputReady: boolean
  identityVerified: boolean
  scopeIntact: boolean
  overflow: boolean
  unavailable: boolean
}

// Port由真Playwright adapter或公開fake實作；核心不直接建立頁面或socket。
export interface ReceiverScenarioPort {
  now(): number
  ready(): Promise<void>
  clickRemote(): Promise<void>
  selectAll(): Promise<void>
  insertText(text: string): Promise<void>
  snapshot(): ReceiverScenarioSnapshot
  wait(ms: number): Promise<void>
  waitForPeerEnd(deadline: number): Promise<void>
  submissionEvidence(): Promise<boolean>
}

// 結果對應ReceiverClientReport；resourcesClosed由呼叫端依自有資源收尾彙總。
export interface ReceiverScenarioResult {
  identityVerified: boolean
  videoPresented: boolean
  submitted: boolean
  observationComplete: boolean
  scopeIntact: boolean
  unavailable: boolean
}

// 任何證據不足都回固定unavailable，不把最後一次成功當成整輪成功。
function failed(
  current: ReceiverScenarioSnapshot | undefined,
  submitted: boolean,
): ReceiverScenarioResult {
  return {
    identityVerified: current?.identityVerified === true,
    videoPresented: current?.streaming === true,
    submitted,
    observationComplete: false,
    scopeIntact: current?.scopeIntact === true,
    unavailable: true,
  }
}

// 僅合併既有六／八布林，不新增profile或把Playwright返回當成加密前證據。
export function confirmReceiverSubmission(main: unknown, encoded: unknown): boolean {
  try {
    const m = receiverFields(main, [
      'prefixSubmitted',
      'prefixAccepted',
      'postTextInput',
      'clipboardObserved',
      'scopeInterrupted',
      'overflow',
    ])
    const e = receiverFields(encoded, [
      'observed',
      'textExact',
      'textSingle',
      'initialSelectComplete',
      'sequenceComplete',
      'sequenceInvalid',
      'overflow',
      'unavailable',
    ])
    return (
      m.prefixSubmitted === true &&
      m.prefixAccepted === true &&
      m.postTextInput === false &&
      m.clipboardObserved === false &&
      m.scopeInterrupted === false &&
      m.overflow === false &&
      e.observed === true &&
      e.textExact === true &&
      e.textSingle === true &&
      e.initialSelectComplete === true &&
      e.sequenceComplete === true &&
      e.sequenceInvalid === false &&
      e.overflow === false &&
      e.unavailable === false
    )
  } catch {
    return false
  }
}

// 先等streaming／input-ready，再固定三動作；insert後只被動觀察5000ms。
export async function runReceiverScenario(
  port: ReceiverScenarioPort,
  text: string,
): Promise<ReceiverScenarioResult> {
  let submitted = false
  try {
    const caseStart = port.now()
    if (!Number.isFinite(caseStart) || caseStart < 0) return failed(undefined, false)
    await port.ready()
    const initial = port.snapshot()
    if (
      !initial ||
      !initial.streaming ||
      !initial.inputReady ||
      !initial.scopeIntact ||
      initial.overflow ||
      initial.unavailable
    )
      return failed(initial, false)
    await port.clickRemote()
    await port.selectAll()
    await port.insertText(text)
    submitted = true
    const start = port.now()
    if (!Number.isFinite(start) || start < caseStart) return failed(initial, true)
    let last = start,
      current = initial
    for (;;) {
      const value = port.now()
      if (!Number.isFinite(value) || value < last) return failed(current, true)
      last = value
      const elapsed = value - start
      if (elapsed > 180000) return failed(current, true)
      current = port.snapshot()
      if (
        !current ||
        !current.streaming ||
        !current.scopeIntact ||
        current.overflow ||
        current.unavailable
      )
        return failed(current, true)
      if (elapsed >= 5000) break
      await port.wait(Math.min(100, 5000 - elapsed))
    }
    if (!(await port.submissionEvidence())) return failed(current, false)
    await port.waitForPeerEnd(caseStart + 180000)
    if (!Number.isFinite(port.now()) || port.now() > caseStart + 180000)
      return failed(current, true)
    return {
      identityVerified: current.identityVerified,
      videoPresented: current.streaming,
      submitted: true,
      observationComplete: true,
      scopeIntact: current.scopeIntact,
      unavailable: !current.identityVerified,
    }
  } catch {
    return failed(undefined, submitted)
  }
}
