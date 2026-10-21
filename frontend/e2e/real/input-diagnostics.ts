import type {
  KeyboardEmissionObserver,
  KeyboardEmissionSnapshot,
} from '../../src/rdweb/keyboard-input'

export interface KeyboardEmissionRecord extends KeyboardEmissionSnapshot {
  sequence: number
  codePoints: number
  utf8Bytes: number
  sha256: string | null
}
export interface KeyboardEmissionLog {
  records: KeyboardEmissionRecord[]
  overflow: boolean
  hashUnavailable: boolean
}
export interface KeyboardEmissionDiagnostics extends KeyboardEmissionObserver {
  // 只接受明確公開的單次測試scope，預設不收集。
  begin(publicExpected: string): void
  // 原oracle結束後才有界等待雜湊，取出即停止與清除scope。
  take(): Promise<KeyboardEmissionLog>
}
declare global {
  interface Window {
    __rdwebKeyboardEmissionObserver?: KeyboardEmissionDiagnostics
  }
}

// 僅由opt-in測試init script安裝；可序列化，無產品runtime相依及原文log。
export function installKeyboardEmissionDiagnostics(): void {
  if (window.__rdwebKeyboardEmissionObserver) return
  let enabled = false,
    sequence = 0,
    overflow = false
  let records: KeyboardEmissionRecord[] = [],
    pending: Promise<void>[] = [],
    owned: Uint8Array[] = []
  window.__rdwebKeyboardEmissionObserver = {
    // 公開scope驗額後才啟用，不將expected存入collector。
    begin(publicExpected): void {
      if (
        enabled ||
        records.length ||
        pending.length ||
        typeof publicExpected !== 'string' ||
        !publicExpected.startsWith('Public ') ||
        publicExpected.length > 4096 ||
        new TextEncoder().encode(publicExpected).length > 4096
      )
        throw new Error('keyboard_emission_diagnostics_unavailable')
      enabled = true
      sequence = 0
      overflow = false
    },
    // 立即固定前後狀態及序號；hash排入microtask，不在emitText前後await。
    record(snapshot, data): void {
      if (!enabled) return
      if (records.length >= 64 || data.length > 4096) {
        overflow = true
        return
      }
      const bytes = new TextEncoder().encode(data)
      if (bytes.length > 4096) {
        bytes.fill(0)
        overflow = true
        return
      }
      const row: KeyboardEmissionRecord = {
        sequence: ++sequence,
        eventId: snapshot.eventId,
        phase: snapshot.phase,
        type: snapshot.type,
        composing: snapshot.composing,
        internalComposing: snapshot.internalComposing,
        confirmed: snapshot.confirmed,
        codePoints: [...data].length,
        utf8Bytes: bytes.length,
        sha256: null,
      }
      records.push(row)
      owned.push(bytes)
      pending.push(
        Promise.resolve()
          .then(
            /* 原生digest自己擁有輸入副本，原文字不進promise或result。 */ () =>
              crypto.subtle.digest('SHA-256', bytes),
          )
          .then(
            /* 只保存固定64字元hex，完成次序不改寫紀錄序號。 */ (hash) => {
              row.sha256 = [...new Uint8Array(hash)]
                .map(/* 每byte轉固定兩位hex。 */ (byte) => byte.toString(16).padStart(2, '0'))
                .join('')
            },
            /* 原生例外只留null，不回顯內容。 */ () => {},
          )
          .finally(/* 清自有編碼暫存，不宣稱清除JS字串。 */ () => bytes.fill(0)),
      )
    },
    // 停止收集後才等最多2秒；未完成hash保持null，晚到不能改回傳快照。
    async take(): Promise<KeyboardEmissionLog> {
      enabled = false
      const rows = records,
        tasks = pending,
        buffers = owned,
        wasOverflow = overflow
      records = []
      pending = []
      owned = []
      overflow = false
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all(tasks),
          new Promise<void>(
            /* 只限制取證收尾，不插入遠端操作之間。 */ (resolve) => {
              timer = setTimeout(resolve, 2000)
            },
          ),
        ])
        return {
          records: rows.map(/* 複製後晚到digest不能改寫已取出的log。 */ (row) => ({ ...row })),
          overflow: wasOverflow,
          hashUnavailable: rows.some(
            /* pending或失敗的hash均明確標不可用。 */ (row) => row.sha256 === null,
          ),
        }
      } finally {
        clearTimeout(timer)
        for (const bytes of buffers) bytes.fill(0)
      }
    },
  }
}

export interface InputDiagnosticEvidence {
  textSubmitted: boolean
  textAccepted: boolean
  selectSubmitted: boolean
  selectAccepted: boolean
  copySubmitted: boolean
  copyAccepted: boolean
  rejected: boolean
  releaseObserved: boolean
  pullSubmitted: boolean
  pullCancelled: boolean
  clipboardDelivered: boolean
  clipboardPayloadCompared: boolean
  clipboardPayloadExact: boolean
  dataBeforeCopySubmitted: boolean
  dataBeforeCopyAccepted: boolean
  overflow: boolean
  nativeWriteHooked: boolean
  nativeWriteObserved: boolean
  nativeWriteExact: boolean
  nativeWriteContainsExpected: boolean
  nativeWriteIsExpectedFragment: boolean
  nativeWriteUuidMatches: boolean
  nativeWriteAsciiMatches: boolean
  nativeWriteTrimMatches: boolean
  textExactSubmitted: boolean
  textSingleSubmitted: boolean
  initialSelectChordSubmitted: boolean
  receiveSelectChordSubmitted: boolean
  receiveCopyChordSubmitted: boolean
  inputSequenceSubmitted: boolean
  inputSequenceAccepted: boolean
  sequenceInvalid: boolean
  dataBeforeCopyChordSubmitted: boolean
}
export interface TextOnlyEvidence {
  prefixSubmitted: boolean
  prefixAccepted: boolean
  postTextInput: boolean
  clipboardObserved: boolean
  scopeInterrupted: boolean
  overflow: boolean
}
export interface InputDiagnostics {
  // 明確host opt-in才啟用metadata時間線。
  beginTimeline(): void
  // 同scope取出即清，預設off不保存payload。
  takeTimeline(): import('./host-observation-schema').HostMainTimeline
  // 僅啟用文字prefix與安靜窗口的被動摘要。
  beginTextOnly(publicExpected: string): void
  // 單獨回文字診斷六項布林，不代表OS已編輯完成。
  textOnlySnapshot(): TextOnlyEvidence
  // 開始本輪被動診斷；payload比較僅HR顯式capture opt-in，絕不送input／clipboard指令。
  begin(
    publicExpected?: string,
    captureText?: boolean,
    inspectInput?: boolean,
    inspectClipboardPayload?: boolean,
  ): void
  // 僅回固定boolean摘要，ACK不代表遠端OS執行。
  snapshot(): InputDiagnosticEvidence
  // 只有顯式核准的本機診斷可取得第一筆native參數，取出後立即清除。
  takeText(): string | null
  // 沿原oracle已有的讀取保存最後結果，不額外讀取OS剪貼簿。
  observeReadback(value: string | null, source: 'native' | 'fallback' | 'unavailable'): void
  // 取出即清；source刻意區分OS、fallback與未取得資料。
  takeReadback(): { value: string | null; source: 'native' | 'fallback' | 'unavailable' }
}
export const INPUT_DIAGNOSTIC_FIELDS = [
  'textSubmitted',
  'textAccepted',
  'selectSubmitted',
  'selectAccepted',
  'copySubmitted',
  'copyAccepted',
  'rejected',
  'releaseObserved',
  'pullSubmitted',
  'pullCancelled',
  'clipboardDelivered',
  'clipboardPayloadCompared',
  'clipboardPayloadExact',
  'dataBeforeCopySubmitted',
  'dataBeforeCopyAccepted',
  'overflow',
  'nativeWriteHooked',
  'nativeWriteObserved',
  'nativeWriteExact',
  'nativeWriteContainsExpected',
  'nativeWriteIsExpectedFragment',
  'nativeWriteUuidMatches',
  'nativeWriteAsciiMatches',
  'nativeWriteTrimMatches',
  'textExactSubmitted',
  'textSingleSubmitted',
  'initialSelectChordSubmitted',
  'receiveSelectChordSubmitted',
  'receiveCopyChordSubmitted',
  'inputSequenceSubmitted',
  'inputSequenceAccepted',
  'sequenceInvalid',
  'dataBeforeCopyChordSubmitted',
] as const
declare global {
  interface Window {
    __rdwebInputDiagnostics?: InputDiagnostics
  }
}
// 只由E2E addInitScript安裝被動observer；本函數可序列化且沒有外部runtime相依。
export function installInputDiagnostics(): void {
  if (window.__rdwebInputDiagnostics) return
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  const canObserveWrite = typeof clipboard?.writeText === 'function'
  // 每輪重新建立純boolean摘要，沒有原訊息、文字、bytes或安全DTO。
  function empty(): InputDiagnosticEvidence {
    return {
      textSubmitted: false,
      textAccepted: false,
      selectSubmitted: false,
      selectAccepted: false,
      copySubmitted: false,
      copyAccepted: false,
      rejected: false,
      releaseObserved: false,
      pullSubmitted: false,
      pullCancelled: false,
      clipboardDelivered: false,
      clipboardPayloadCompared: false,
      clipboardPayloadExact: false,
      dataBeforeCopySubmitted: false,
      dataBeforeCopyAccepted: false,
      overflow: false,
      nativeWriteHooked: canObserveWrite,
      nativeWriteObserved: false,
      nativeWriteExact: false,
      nativeWriteContainsExpected: false,
      nativeWriteIsExpectedFragment: false,
      nativeWriteUuidMatches: false,
      nativeWriteAsciiMatches: false,
      nativeWriteTrimMatches: false,
      textExactSubmitted: false,
      textSingleSubmitted: false,
      initialSelectChordSubmitted: false,
      receiveSelectChordSubmitted: false,
      receiveCopyChordSubmitted: false,
      inputSequenceSubmitted: false,
      inputSequenceAccepted: false,
      sequenceInvalid: false,
      dataBeforeCopyChordSubmitted: false,
    }
  }
  let evidence = empty(),
    enabled = false,
    owner: Worker | null = null,
    pull: string | null = null,
    expected = '',
    inputExpected = '',
    inspectInput = false,
    inspectClipboardPayload = false,
    textOnly = false,
    postTextInput = false,
    clipboardObserved = false,
    scopeInterrupted = false,
    inputScope: string | null = null,
    lastInputBatch = 0,
    initialStep = 0,
    receiveStep = 0,
    initialInvalid = false,
    receiveInvalid = false,
    receivingStarted = false,
    textCount = 0,
    sequenceRejected = false,
    captureText = false,
    capturedText: string | null = null,
    readback: { value: string | null; source: 'native' | 'fallback' | 'unavailable' } = {
      value: null,
      source: 'unavailable',
    }
  // 保存文字前按UTF-8驗原32KiB上限，不截斷、trim或normalize。
  function boundedText(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.length <= 32768 &&
      new TextEncoder().encode(value).byteLength <= 32768
    )
  }
  // 輸入Text沿產品4096-byte／有效scalar契約；不能用clipboard的32KiB額度誤報exact。
  function boundedInputText(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 4096) return false
    for (const char of value) {
      const scalar = char.codePointAt(0)!
      if (scalar === 0 || (scalar >= 0xd800 && scalar <= 0xdfff)) return false
    }
    return new TextEncoder().encode(value).byteLength <= 4096
  }
  const pending = new Map<string, number>()
  let timelineEnabled = false,
    timelineOrigin = 0,
    timelineLast = 0
  let timeline: import('./host-observation-schema').HostMainTimeline = {
    clockDomain: 'browser_main',
    events: [],
    overflow: false,
    unavailable: false,
  }
  let timelineData: Record<string, unknown> = {}
  let timelineScope: string | null = null
  const timelinePending = new Set<string>()
  // 只copy有限整數與固定label，diag異常不能改產品；不讀payload或native參數。
  function timelineRecord(kind: string, message: Record<string, unknown>, code = 'observed'): void {
    if (!timelineEnabled) return
    try {
      const tUs = Math.floor((performance.now() - timelineOrigin) * 1000)
      if (!Number.isSafeInteger(tUs) || tUs < timelineLast || tUs > 180000000) {
        timeline.unavailable = true
        timelineEnabled = false
        return
      }
      timelineLast = tUs
      if (timeline.events.length >= 128) {
        timeline.overflow = true
        timelineEnabled = false
        return
      }
      // 缺tag只回null，不保留任意metadata。
      const number = (key: string): number | null => {
        const n = message[key]
        return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null
      }
      timeline.events.push({
        ordinal: timeline.events.length + 1,
        kind,
        tUs,
        revision: number('revision'),
        generation: number('input_generation'),
        batchId: number('batch_id'),
        requestId: number('request_id'),
        code,
      })
    } catch {
      timeline.unavailable = true
      timelineEnabled = false
    }
  }
  // 有限狀態只留步數與boolean；原batch／文字不留副本，ACK僅表示Worker提交。
  function refreshSequence(): void {
    evidence.inputSequenceSubmitted =
      inspectInput &&
      !evidence.sequenceInvalid &&
      !evidence.overflow &&
      evidence.initialSelectChordSubmitted &&
      evidence.textExactSubmitted &&
      evidence.textSingleSubmitted &&
      receivingStarted &&
      evidence.receiveCopyChordSubmitted
    evidence.inputSequenceAccepted =
      evidence.inputSequenceSubmitted &&
      !sequenceRejected &&
      ![...pending.values()].some(/* bit8只代表本輪完整序列的batch。 */ (mask) => !!(mask & 8))
  }
  // 每個Ctrl chord固定四個edge；lock可共存，但其他hot modifier或Control up未放開不匹配。
  function chordEdge(event: Record<string, unknown>, step: number, char: 'a' | 'c'): boolean {
    const edge = step % 4,
      mods = event.modifiers
    if (
      !Array.isArray(mods) ||
      mods.length > 3 ||
      new Set(mods).size !== mods.length ||
      !mods.every(
        /* 只容許Control與兩種lock狀態。 */ (m) => ['Control', 'CapsLock', 'NumLock'].includes(m),
      )
    )
      return false
    if (edge === 0 || edge === 3)
      return (
        event.kind === 'key' &&
        event.key === 'Control' &&
        event.down === (edge === 0) &&
        mods.includes('Control') === (edge === 0)
      )
    return (
      event.kind === 'shortcut' &&
      event.char === char &&
      event.down === (edge === 1) &&
      mods.includes('Control')
    )
  }
  // 被動逐event驗全文與初始／接收後chord；資料抵達後仍觀察keyup，不送指令或等待。
  function inspectEvent(event: Record<string, unknown>): boolean {
    if (!inspectInput) return false
    if (textOnly && textCount > 0) {
      postTextInput = true
      return false
    }
    if (event.kind === 'move') return false
    if (event.kind === 'button') {
      if ((receivingStarted ? receiveStep : initialStep) % 4 !== 0) {
        evidence.sequenceInvalid = true
        if (receivingStarted) receiveInvalid = true
        else initialInvalid = true
      }
      return false
    }
    if (event.kind === 'text') {
      textCount = Math.min(2, textCount + 1)
      evidence.textSingleSubmitted = textCount === 1
      evidence.textExactSubmitted = false
      if (textCount > 1) {
        evidence.sequenceInvalid = true
        inputExpected = ''
        return true
      }
      try {
        const text = event.text,
          mods = event.modifiers
        evidence.textExactSubmitted =
          !!inputExpected &&
          boundedInputText(text) &&
          text === inputExpected &&
          Array.isArray(mods) &&
          mods.length <= 3 &&
          new Set(mods).size === mods.length &&
          mods.every(
            /* Text不得挾帶hot modifier。 */ (m) => ['Shift', 'CapsLock', 'NumLock'].includes(m),
          )
        if (
          !evidence.textExactSubmitted ||
          !evidence.initialSelectChordSubmitted ||
          receivingStarted
        )
          evidence.sequenceInvalid = true
      } finally {
        // 比對後清公開expected；native寫入的expected另有生命週期。
        inputExpected = ''
      }
      return true
    }
    if (
      event.kind !== 'key' &&
      event.kind !== 'shortcut' &&
      event.kind !== 'wheel' &&
      event.kind !== 'sas'
    ) {
      evidence.sequenceInvalid = true
      return false
    }
    if (!receivingStarted) {
      if (textCount || initialStep >= 4 || initialInvalid || !chordEdge(event, initialStep, 'a')) {
        initialInvalid = evidence.sequenceInvalid = true
      } else {
        initialStep++
        evidence.initialSelectChordSubmitted = initialStep === 4
      }
    } else {
      if (
        receiveStep >= 8 ||
        receiveInvalid ||
        !chordEdge(event, receiveStep, receiveStep < 4 ? 'a' : 'c')
      ) {
        receiveInvalid = evidence.sequenceInvalid = true
      } else {
        receiveStep++
        if (receiveStep === 4) evidence.receiveSelectChordSubmitted = true
        if (receiveStep === 8) evidence.receiveCopyChordSubmitted = true
      }
    }
    return true
  }
  // 僅允許正整數tag，不將任意值或原訊息拼入診斷狀態。
  function tag(value: Record<string, unknown>, input: boolean): string | null {
    const fields = input
      ? [value.revision, value.input_generation, value.batch_id]
      : [value.revision, value.request_id]
    return fields.every(
      /* 禁止非數字與非精確整數。 */ (n) =>
        typeof n === 'number' && Number.isSafeInteger(n) && n > 0,
    )
      ? fields.join(':')
      : null
  }
  // 僅處理指定互動訊息；不存payload、不讀clipboard bytes或start ticket。
  function observe(worker: Worker, value: unknown, outgoing: boolean): void {
    if (!enabled || !value || typeof value !== 'object') return
    const message = value as Record<string, unknown>
    const type = message.type
    if (outgoing && (type === 'input-batch' || type === 'clipboard-pull')) owner ??= worker
    if (worker !== owner) return
    if (timelineEnabled) {
      const key = tag(message, true)
      const scope = key?.split(':').slice(0, 2).join(':')
      if (outgoing && type === 'input-batch' && key && scope) {
        timelineScope ??= scope
        if (scope !== timelineScope) {
          timelineRecord('terminal', message, 'unavailable')
          timeline.unavailable = true
          timelineEnabled = false
        } else {
          timelineRecord('batch_submit', message)
          if (timelineEnabled) timelinePending.add(key)
        }
      } else if (
        !outgoing &&
        type === 'input-ack' &&
        key &&
        timelinePending.has(key) &&
        typeof message.sent === 'boolean'
      ) {
        timelineRecord('batch_ack', message, message.sent ? 'sent' : 'dropped')
        timelinePending.delete(key)
      } else if (
        timelineScope &&
        message.revision !== Number(timelineScope.split(':')[0]) &&
        (type === 'clipboard-pull' || type === 'input-state')
      ) {
        timelineRecord('terminal', message, 'unavailable')
        timeline.unavailable = true
        timelineEnabled = false
      }
    }
    if (!outgoing && (type === 'failure' || type === 'disposed')) {
      timelineRecord('terminal', message, 'closed')
      timelineEnabled = false
    }
    if (textOnly) {
      if (typeof type === 'string' && type.startsWith('clipboard-')) clipboardObserved = true
      if (type === 'input-release' && inputScope?.split(':')[0] === String(message.revision))
        scopeInterrupted = true
      if (!outgoing && (type === 'error' || type === 'closed' || type === 'terminal'))
        scopeInterrupted = true
      if (
        !outgoing &&
        inputScope?.split(':')[0] === String(message.revision) &&
        (type === 'failure' ||
          type === 'disposed' ||
          type === 'operation-error' ||
          (type === 'activity' && message.open === false))
      )
        scopeInterrupted = true
      if (
        !outgoing &&
        type === 'input-state' &&
        inputScope &&
        (textCount > 0 ||
          `${message.revision}:${message.input_generation}` !== inputScope ||
          message.ready !== true ||
          message.keyboard !== true ||
          message.platform !== 'windows')
      )
        scopeInterrupted = true
    }
    if (outgoing && type === 'input-batch') {
      const key = tag(message, true)
      if (!key || !Array.isArray(message.events)) {
        if (inspectInput) evidence.sequenceInvalid = true
        return
      }
      if (inspectInput) {
        const scope = key.split(':').slice(0, 2).join(':')
        inputScope ??= scope
        if (scope !== inputScope || (message.batch_id as number) <= lastInputBatch) {
          if (textOnly) scopeInterrupted = true
          evidence.sequenceInvalid = true
          return
        }
        lastInputBatch = message.batch_id as number
        if (!message.events.length || message.events.length > 16) {
          evidence.overflow = evidence.sequenceInvalid = true
          return
        }
      }
      let mask = 0
      for (const raw of message.events) {
        if (!raw || typeof raw !== 'object') {
          if (inspectInput) evidence.sequenceInvalid = true
          continue
        }
        const event = raw as Record<string, unknown>
        if (inspectEvent(event)) mask |= 8
        if (event.kind === 'text') mask |= 1
        if (
          event.kind === 'shortcut' &&
          event.down === true &&
          Array.isArray(event.modifiers) &&
          event.modifiers.includes('Control') &&
          event.modifiers.length <= 3 &&
          event.modifiers.every(
            /* lock狀態不改shortcut身分，其他家族一律排除。 */ (modifier) =>
              ['Control', 'CapsLock', 'NumLock'].includes(modifier),
          )
        ) {
          if (event.char === 'a') mask |= 2
          if (event.char === 'c') mask |= 4
        }
      }
      evidence.textSubmitted ||= !!(mask & 1)
      evidence.selectSubmitted ||= !!(mask & 2)
      evidence.copySubmitted ||= !!(mask & 4)
      if (mask) {
        if (pending.size >= 64) evidence.overflow = true
        else pending.set(key, mask)
      }
    } else if (!outgoing && type === 'input-ack') {
      const key = tag(message, true),
        mask = key ? pending.get(key) : undefined
      if (mask === undefined || !key || typeof message.sent !== 'boolean') return
      pending.delete(key)
      if (!message.sent) {
        evidence.rejected = true
        if (mask & 8) sequenceRejected = true
      } else {
        evidence.textAccepted ||= !!(mask & 1)
        evidence.selectAccepted ||= !!(mask & 2)
        evidence.copyAccepted ||= !!(mask & 4)
      }
    } else if (outgoing && type === 'input-release') {
      evidence.releaseObserved = true
      if (
        inspectInput &&
        inputScope?.split(':')[0] === String(message.revision) &&
        (receivingStarted ? receiveStep : initialStep) % 4 !== 0
      ) {
        evidence.sequenceInvalid = true
        if (receivingStarted) receiveInvalid = true
        else initialInvalid = true
      }
    } else if (outgoing && type === 'clipboard-pull') {
      pull = tag(message, false)
      if (!pull) return
      evidence.pullSubmitted = true
      timelineRecord('pull_submit', message)
      if (inspectInput) {
        if (
          receivingStarted ||
          !evidence.initialSelectChordSubmitted ||
          textCount !== 1 ||
          inputScope?.split(':')[0] !== String(message.revision)
        )
          evidence.sequenceInvalid = true
        receivingStarted = true
      }
      // 接收前的全選不能替代「點回遠端後重新選取」證據；文字提交證據仍保留。
      evidence.selectSubmitted =
        evidence.selectAccepted =
        evidence.copySubmitted =
        evidence.copyAccepted =
          false
      for (const [key, mask] of pending) {
        if (mask & 9) pending.set(key, mask & 9)
        else pending.delete(key)
      }
    } else if (pull && tag(message, false) === pull) {
      if (!outgoing && type === 'clipboard-data') {
        const comparePayload =
          !evidence.clipboardDelivered && inspectClipboardPayload && captureText && !!expected
        evidence.clipboardDelivered = true
        timelineRecord('clipboard_data', message)
        if (timelineEnabled)
          timelineData = { revision: message.revision, request_id: message.request_id }
        // 只在HR明確opt-in時，比對產品handler前到達的matchingbytes。
        if (comparePayload) {
          let text = ''
          try {
            const bytes = message.bytes
            if (
              !(bytes instanceof Uint8Array) ||
              !(bytes.buffer instanceof ArrayBuffer) ||
              bytes.byteLength > 32768
            )
              throw new Error()
            text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
            if (text.includes('\0')) throw new Error()
            evidence.clipboardPayloadCompared = true
            evidence.clipboardPayloadExact = text === expected
          } catch {
            evidence.overflow = true
          } finally {
            // 只保留boolean；解碼副本不跨越這個message callback。
            text = ''
          }
        }
        evidence.dataBeforeCopySubmitted = !evidence.copySubmitted
        evidence.dataBeforeCopyAccepted = !evidence.copyAccepted
        if (inspectInput)
          evidence.dataBeforeCopyChordSubmitted = !evidence.receiveCopyChordSubmitted
        pull = null
      } else if (
        type === 'clipboard-cancel' ||
        type === 'clipboard-cancelled' ||
        type === 'clipboard-error'
      ) {
        evidence.pullCancelled = true
        pull = null
      }
    }
  }
  window.__rdwebInputDiagnostics = {
    // host opt-in必在原begin之後明確啟用；不向Worker送任何消息。
    beginTimeline(): void {
      if (!enabled) throw new Error('host_observation_unavailable')
      timeline = { clockDomain: 'browser_main', events: [], overflow: false, unavailable: false }
      timelineOrigin = performance.now()
      timelineLast = 0
      timelineData = {}
      timelineScope = null
      timelinePending.clear()
      timelineEnabled = true
    },
    // 取出即清；晚到不能回填下一scope。
    takeTimeline() {
      const value = timeline
      timelineEnabled = false
      timeline = { clockDomain: 'browser_main', events: [], overflow: false, unavailable: false }
      timelineData = {}
      timelineScope = null
      timelinePending.clear()
      return value
    },
    // 先沿原begin清前輪，再啟用獨立prefix摘要，不保存native expected或文字副本。
    beginTextOnly(publicExpected): void {
      window.__rdwebInputDiagnostics!.begin(publicExpected, false, true)
      textOnly = true
      expected = ''
    },
    // prefix只表示Main提交與matching ACK；後續輸入獨立標干擾，絕非OS完成ACK。
    textOnlySnapshot(): TextOnlyEvidence {
      const prefixSubmitted =
        textOnly &&
        !evidence.sequenceInvalid &&
        !evidence.overflow &&
        evidence.initialSelectChordSubmitted &&
        evidence.textExactSubmitted &&
        evidence.textSingleSubmitted
      return {
        prefixSubmitted,
        prefixAccepted:
          prefixSubmitted &&
          !sequenceRejected &&
          ![...pending.values()].some(
            /* prefix每edge的batch都必須被接受。 */ (mask) => !!(mask & 8),
          ),
        postTextInput,
        clipboardObserved,
        scopeInterrupted,
        overflow: textOnly && evidence.overflow,
      }
    },
    // 清除本輪tag與booleans；不干預產品queue或deadline。
    begin(publicExpected = '', capture = false, inspect = false, inspectPayload = false): void {
      if (
        typeof publicExpected !== 'string' ||
        publicExpected.length > 32768 ||
        (publicExpected && !publicExpected.startsWith('Public ')) ||
        typeof capture !== 'boolean' ||
        (capture && !publicExpected) ||
        typeof inspect !== 'boolean' ||
        (inspect && (!publicExpected || !boundedInputText(publicExpected))) ||
        typeof inspectPayload !== 'boolean' ||
        (inspectPayload && (!capture || !publicExpected || !boundedText(publicExpected)))
      )
        throw new Error('input_clipboard_diagnostics_unavailable')
      evidence = empty()
      timelineEnabled = false
      timeline = { clockDomain: 'browser_main', events: [], overflow: false, unavailable: false }
      timelineData = {}
      timelineScope = null
      timelinePending.clear()
      textOnly = postTextInput = clipboardObserved = scopeInterrupted = false
      pending.clear()
      pull = null
      owner = null
      enabled = true
      expected = publicExpected
      inputExpected = inspect ? publicExpected : ''
      inspectInput = inspect
      inspectClipboardPayload = inspectPayload
      inputScope = null
      lastInputBatch = 0
      initialStep = receiveStep = textCount = 0
      initialInvalid = receiveInvalid = receivingStarted = sequenceRejected = false
      captureText = capture
      capturedText = null
      readback = { value: null, source: 'unavailable' }
    },
    // spread對象只有固定boolean，不包含原訊息、tag、nonce或文字。
    snapshot(): InputDiagnosticEvidence {
      refreshSequence()
      return { ...evidence }
    },
    // 顯式捕捉與一般boolean摘要分離；取出即清，不留第二份payload引用。
    takeText(): string | null {
      const text = capturedText
      capturedText = null
      return text
    },
    // 僅沿原oracle已讀到的值保存最後一筆，不另讀clipboard或改原比較結果。
    observeReadback(value, source): void {
      if (!enabled || !captureText) return
      readback = { value: null, source: 'unavailable' }
      if (value === null && source === 'unavailable') return
      if (boundedText(value) && (source === 'native' || source === 'fallback'))
        readback = { value, source }
      else evidence.overflow = true
    },
    // 取出後清除引用，下一輪不可看見前一輪回讀。
    takeReadback() {
      const value = readback
      readback = { value: null, source: 'unavailable' }
      return value
    },
  }
  if (canObserveWrite && clipboard) {
    clipboard.writeText = new Proxy(clipboard.writeText, {
      // 保留原字串／receiver／Promise；只對matching資料後第一筆native入口做即時計算。
      apply(method, receiver, parameters) {
        if (enabled && expected && evidence.clipboardDelivered && !evidence.nativeWriteObserved)
          timelineRecord('native_write', timelineData)
        const result = Reflect.apply(method, receiver, parameters)
        if (enabled && expected && evidence.clipboardDelivered && !evidence.nativeWriteObserved) {
          try {
            const value: unknown = parameters[0]
            if (typeof value !== 'string') {
              evidence.overflow = true
              return result
            }
            const uuid = expected.match(
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            )?.[0]
            evidence.nativeWriteObserved = true
            if (captureText) {
              if (boundedText(value)) capturedText = value
              else evidence.overflow = true
            }
            evidence.nativeWriteExact = value === expected
            evidence.nativeWriteContainsExpected = value !== expected && value.includes(expected)
            evidence.nativeWriteIsExpectedFragment =
              !!value && value !== expected && expected.includes(value)
            evidence.nativeWriteUuidMatches = !!uuid && value.includes(uuid)
            evidence.nativeWriteAsciiMatches =
              value.replace(/[^\p{ASCII}]/gu, '') === expected.replace(/[^\p{ASCII}]/gu, '')
            evidence.nativeWriteTrimMatches = value.trim() === expected
          } catch {
            evidence.overflow = true
          } finally {
            // 清本輪native比對用expected；文字只有顯式本機log模式短命保存，Promise不留。
            expected = ''
          }
        }
        return result
      },
    })
  }
  window.Worker = new Proxy(window.Worker, {
    // 保留原constructor參數與原Worker；每instance的matching tag互不污染。
    construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker
      worker.postMessage = new Proxy(worker.postMessage, {
        // 先原封不動提交一次，成功後才記錄；observer例外不改產品路徑。
        apply(method, receiver, parameters) {
          const result = Reflect.apply(method, receiver, parameters)
          try {
            observe(worker, parameters[0], true)
          } catch {
            evidence.overflow = true
          }
          return result
        },
      })
      worker.addEventListener(
        'message',
        /* 被動讀固定type／tag，不取得transfer或像素。 */ (event: MessageEvent<unknown>) => {
          try {
            observe(worker, event.data, false)
          } catch {
            evidence.overflow = true
          }
        },
      )
      for (const type of ['error', 'messageerror'])
        worker.addEventListener(
          type,
          /* 原生Worker錯誤只記安全干擾，不讀exception／event資料。 */ () => {
            if (enabled && textOnly && worker === owner) scopeInterrupted = true
          },
        )
      return worker
    },
  })
}
