import type { EncodedInputObserver } from '../../src/rdweb/encoded-input-observer'
import type { BrowserContext, Page } from '@playwright/test'
import { hbb } from '../../src/rdweb/generated/message.js'

export interface PreEncryptInputEvidence {
  observed: boolean
  textExact: boolean
  textSingle: boolean
  initialSelectComplete: boolean
  receiveSelectComplete: boolean
  receiveCopyComplete: boolean
  sequenceComplete: boolean
  sequenceInvalid: boolean
  overflow: boolean
  unavailable: boolean
}
export interface PreEncryptInputCapture {
  preEncryptInput: PreEncryptInputEvidence
  preEncryptText: string | null
}
export interface InputPinnedEnums {
  control: number
  capsLock: number
  numLock: number
  legacy: number
  translate: number
}
export interface EncodedWorkerScope {
  __rdwebEncodedInputObserver?: EncodedInputObserver
  onmessage?: ((event: MessageEvent) => void) | null
}
export interface EncodedInputDiagnostics {
  // 在第一筆輸入前同步設定同一Worker scope，不等待診斷ready。
  begin(publicExpected: string, captureText?: boolean): void
  // 僅原oracle後取摘要，缺資料不得當完整證據。
  take(): Promise<PreEncryptInputEvidence>
  // 只取已明確opt-in的公開seq；舊十boolean介面保持。
  takeWithText(): Promise<PreEncryptInputCapture>
  // 本次頁面停止時釋放自有port與pending，不影響產品Worker。
  cancel(): void
}
declare global {
  interface Window {
    __rdwebEncodedInputDiagnostics?: EncodedInputDiagnostics
  }
}
// 可序列化Main collector，保留原Worker參數／input；診斷只經獨立port。
export function installEncodedInputDiagnostics(): void {
  if (window.__rdwebEncodedInputDiagnostics) return
  const fields = [
    'observed',
    'textExact',
    'textSingle',
    'initialSelectComplete',
    'receiveSelectComplete',
    'receiveCopyComplete',
    'sequenceComplete',
    'sequenceInvalid',
    'overflow',
    'unavailable',
  ]
  const states = new Map<Worker, { revision: number; generation: number; ready: boolean }>()
  let nextScope = 0
  let capacityExceeded = false
  let active: {
    worker: Worker
    scope: number
    revision: number
    generation: number
    port: MessagePort
    timer?: ReturnType<typeof setTimeout>
    resolve?: (value: PreEncryptInputCapture) => void
    deadline: number
    captureText: boolean
    expected: string
  } | null = null
  // 只有不可用旗標為true；缺證據不能假造sequence成立。
  function unavailable(): PreEncryptInputEvidence {
    return {
      observed: false,
      textExact: false,
      textSingle: false,
      initialSelectComplete: false,
      receiveSelectComplete: false,
      receiveCopyComplete: false,
      sequenceComplete: false,
      sequenceInvalid: false,
      overflow: false,
      unavailable: true,
    }
  }
  // 結束時只清同scope自有資源，晚到引用不作用於新scope。
  function finish(
    value: PreEncryptInputEvidence,
    cancelWorker: boolean,
    text: string | null = null,
  ): void {
    const current = active
    if (!current) return
    active = null
    clearTimeout(current.timer)
    current.port.onmessage = null
    current.port.onmessageerror = null
    current.port.close()
    current.expected = ''
    if (cancelWorker) {
      try {
        current.worker.postMessage({
          type: 'rdweb-encoded-input-diagnostic',
          action: 'cancel',
          scope: current.scope,
        })
      } catch {
        /* Worker已關亦清本機scope，不回原生例外。 */
      }
    }
    current.resolve?.({ preEncryptInput: { ...value }, preEncryptText: text })
  }
  // 同scope僅取一次；文字只有明確opt-in、十boolean及同expected通過才回Node。
  function take(withText: boolean): Promise<PreEncryptInputCapture> {
    const current = active
    if (!current || current.resolve)
      return Promise.resolve({ preEncryptInput: unavailable(), preEncryptText: null })
    const capture = withText && current.captureText
    return new Promise(
      /* 原oracle後才等待這份原子回覆，期限不延長產品操作。 */ (resolve) => {
        current.resolve = resolve
        current.deadline = performance.now() + 2000
        current.port.onmessage = /* 拒絕未知原文、nested schema／getter故障及late回覆。 */ (
          event,
        ) => {
          if (active !== current) return
          try {
            const reply = event.data
            if (performance.now() >= current.deadline || !reply || typeof reply !== 'object')
              throw new Error()
            if (
              capture &&
              (Object.keys(reply).length !== 2 ||
                !Object.hasOwn(reply, 'preEncryptInput') ||
                !Object.hasOwn(reply, 'preEncryptText'))
            )
              throw new Error()
            const value = capture ? reply.preEncryptInput : reply
            if (
              !value ||
              typeof value !== 'object' ||
              Object.keys(value).length !== fields.length ||
              fields.some(
                /* own十boolean，不准prototype／extra或任意metadata。 */ (field) =>
                  !Object.hasOwn(value, field) || typeof value[field] !== 'boolean',
              )
            )
              throw new Error()
            const text = capture ? reply.preEncryptText : null
            if (
              text !== null &&
              (typeof text !== 'string' ||
                text !== current.expected ||
                !value.observed ||
                !value.textExact ||
                !value.textSingle ||
                value.overflow ||
                value.unavailable)
            )
              throw new Error()
            finish(
              Object.fromEntries(
                fields.map(
                  /* 只copy固定十欄，不保留transport DTO。 */ (field) => [field, value[field]],
                ),
              ) as unknown as PreEncryptInputEvidence,
              false,
              text,
            )
          } catch {
            finish(unavailable(), true)
          }
        }
        current.port.onmessageerror = /* 失效port不能將晚到文字放回新scope。 */ () => {
          if (active === current) finish(unavailable(), true)
        }
        current.port.start()
        current.timer = setTimeout(
          /* 2000ms後僅取消自有診斷scope。 */ () => {
            if (active === current) finish(unavailable(), true)
          },
          2000,
        )
        try {
          current.worker.postMessage({
            type: 'rdweb-encoded-input-diagnostic',
            action: capture ? 'takeWithText' : 'take',
            scope: current.scope,
          })
        } catch {
          if (active === current) finish(unavailable(), true)
        }
      },
    )
  }
  window.__rdwebEncodedInputDiagnostics = {
    // 舊take與文字take共用單次消費，不新增第二次Worker roundtrip。
    async takeWithText(): Promise<PreEncryptInputCapture> {
      return take(true)
    },
    // 同一postMessage queue先設定public expected，再由產品送input；沒有await。
    begin(publicExpected, captureText = false): void {
      const owners = [...states].filter(
        /* 只有明確Windowssafe ready能選為owner。 */ ([, state]) => state.ready,
      )
      if (
        active ||
        capacityExceeded ||
        owners.length !== 1 ||
        typeof publicExpected !== 'string' ||
        !publicExpected.startsWith('Public ') ||
        typeof captureText !== 'boolean' ||
        (captureText && publicExpected.includes('\0')) ||
        publicExpected.length > 4096 ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
          publicExpected,
        ) ||
        new TextEncoder().encode(publicExpected).length > 4096 ||
        nextScope >= Number.MAX_SAFE_INTEGER
      )
        throw new Error('encoded_input_diagnostics_unavailable')
      const [worker, state] = owners[0]!,
        channel = new MessageChannel(),
        scope = ++nextScope
      active = {
        worker,
        scope,
        revision: state.revision,
        generation: state.generation,
        port: channel.port1,
        deadline: Infinity,
        captureText,
        expected: captureText ? publicExpected : '',
      }
      try {
        worker.postMessage(
          {
            type: 'rdweb-encoded-input-diagnostic',
            action: 'begin',
            scope,
            expected: publicExpected,
            ...(captureText ? { captureText: true } : {}),
          },
          [channel.port2],
        )
      } catch {
        channel.port2.close()
        finish(unavailable(), false)
        throw new Error('encoded_input_diagnostics_unavailable')
      }
    },
    // 僅原oracle後收摘要；2000ms截止後即使偶然回覆也不算完整取證。
    async take(): Promise<PreEncryptInputEvidence> {
      return (await take(false)).preEncryptInput
    },
    // 主動收尾不停止產品Worker，也不復活舊promise。
    cancel(): void {
      finish(unavailable(), true)
    },
  }
  window.Worker = new Proxy(window.Worker, {
    // constructor與原WorkerURL／options保持；不在native操作前等待診斷。
    construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker
      if (states.size >= 16) capacityExceeded = true
      else states.set(worker, { revision: 0, generation: 0, ready: false })
      worker.addEventListener(
        'message',
        /* 僅safe input-state能建立／作廢owner。 */ (event: MessageEvent) => {
          const value = event.data
          if (!value || typeof value !== 'object') return
          if (
            value.type === 'input-state' &&
            Number.isSafeInteger(value.revision) &&
            value.revision > 0 &&
            Number.isSafeInteger(value.input_generation) &&
            value.input_generation >= 0
          ) {
            const old = states.get(worker)
            if (
              !old ||
              value.revision < old.revision ||
              (value.revision === old.revision && value.input_generation < old.generation)
            )
              return
            const state = {
              revision: value.revision,
              generation: value.input_generation,
              ready:
                value.ready === true && value.keyboard === true && value.platform === 'windows',
            }
            states.set(worker, state)
            if (
              active?.worker === worker &&
              (!state.ready ||
                active.revision !== state.revision ||
                active.generation !== state.generation)
            )
              finish(unavailable(), true)
          } else if (['failure', 'disposed'].includes(value.type)) {
            const state = states.get(worker)
            if (state && value.revision === state.revision) state.ready = false
            if (active?.worker === worker && value.revision === active.revision)
              finish(unavailable(), true)
          }
        },
      )
      for (const type of ['error', 'messageerror'])
        worker.addEventListener(
          type,
          /* 原生故障只作廢同owner。 */ () => {
            states.delete(worker)
            if (active?.worker === worker) finish(unavailable(), true)
          },
        )
      worker.terminate = new Proxy(worker.terminate, {
        // 先沿原terminate，再釋放這個instance的診斷scope與引用。
        apply(method, receiver, parameters) {
          try {
            return Reflect.apply(method, receiver, parameters)
          } finally {
            states.delete(worker)
            if (active?.worker === worker) finish(unavailable(), false)
          }
        },
      })
      return worker
    },
  })
}

// 單TCP opt-in只安裝Main觀察，不攔截資產或變更瀏覽器網路安全限制。
export async function attachEncodedInputDiagnostics(context: BrowserContext): Promise<void> {
  await context.addInitScript(installEncodedInputDiagnostics)
}
// 原Worker已安全登入／呈現後、任何native輸入前安裝；不換WorkerURL或constructor。
export async function prepareEncodedInputWorker(page: Page): Promise<void> {
  const enums = {
    control: hbb.ControlKey.Control,
    capsLock: hbb.ControlKey.CapsLock,
    numLock: hbb.ControlKey.NumLock,
    legacy: hbb.KeyboardMode.Legacy,
    translate: hbb.KeyboardMode.Translate,
  }
  const origin = new URL(page.url()).origin
  const workers = page.workers().filter(
    /* 只選當頁同源正式protocolWorker，不碰其他frame。 */ (worker) => {
      try {
        const url = new URL(worker.url())
        return url.origin === origin && /\/assets\/protocol\.worker-[\w-]+\.js$/.test(url.pathname)
      } catch {
        return false
      }
    },
  )
  if (workers.length !== 1) throw new Error('encoded_input_diagnostics_unavailable')
  try {
    await workers[0]!.evaluate(installWorkerEncodedInputDiagnostics, enums)
  } catch {
    throw new Error('encoded_input_diagnostics_unavailable')
  }
}
// 可序列化test-only bootstrap；原文字只同步比較，不保存wire或原訊息。
export function installWorkerEncodedInputDiagnostics(enums: InputPinnedEnums): void {
  const scope = self as unknown as EncodedWorkerScope
  if (scope.__rdwebEncodedInputObserver) return
  let enabled = false,
    expected = '',
    current = 0,
    lastScope = 0,
    step = 0,
    count = 0,
    texts = 0
  let port: MessagePort | null = null
  let captureText = false,
    capturedText: string | null = null
  // 只建立固定boolean，不將tags／文字／按鍵或protobuf帶出Worker。
  function empty(unavailable = false): PreEncryptInputEvidence {
    return {
      observed: false,
      textExact: false,
      textSingle: false,
      initialSelectComplete: false,
      receiveSelectComplete: false,
      receiveCopyComplete: false,
      sequenceComplete: false,
      sequenceInvalid: false,
      overflow: false,
      unavailable,
    }
  }
  let evidence = empty()
  // 當前scope獨占port；取消與take皆清expected，舊訊號不作用於新scope。
  function clear(): void {
    enabled = false
    expected = ''
    capturedText = null
    captureText = false
    try {
      port?.close()
    } catch {
      /* 診斷port故障不變成產品Workererror。 */
    }
    port = null
  }
  scope.__rdwebEncodedInputObserver = {
    // 只追13個鍵訊息，chord外正常mouse不改序列；容量含所有input最多64。
    record(value): void {
      if (!enabled) return
      evidence.observed = true
      if (++count > 64) {
        evidence.overflow = true
        capturedText = null
        return
      }
      if (value.kind === 'mouse') {
        if ([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12].includes(step)) evidence.sequenceInvalid = true
        return
      }
      if (value.union === 'seq') {
        const seq = value.seq
        texts++
        evidence.textSingle = texts === 1
        evidence.textExact = texts === 1 && seq === expected
        capturedText = captureText && evidence.textExact ? seq : null
        expected = ''
      }
      if (evidence.sequenceInvalid || evidence.overflow) return
      const locks = [enums.capsLock, enums.numLock]
      const mods = value.modifiers
      const clean = Array.isArray(mods) && new Set(mods).size === mods.length && mods.length <= 3
      let valid = false
      if (step === 4) {
        valid =
          value.union === 'seq' &&
          evidence.textExact &&
          texts === 1 &&
          value.mode === enums.legacy &&
          value.down &&
          !value.press &&
          clean &&
          mods.every(/* Text不能帶hot modifier。 */ (m) => locks.includes(m))
      } else {
        const position = step < 4 ? step : step < 9 ? step - 5 : step - 9
        const letter = step < 9 ? 65 : 67
        const control = position === 0 || position === 3
        valid =
          step < 13 &&
          clean &&
          !value.press &&
          value.down === position < 2 &&
          (control
            ? value.union === 'controlKey' &&
              value.controlKey === enums.control &&
              value.mode === enums.legacy &&
              mods.every(/* 明確Control edge不暫加自身。 */ (m) => locks.includes(m))
            : value.union === 'chr' &&
              value.chr === letter * 65536 &&
              value.mode === enums.translate &&
              mods.includes(enums.control) &&
              mods.every(
                /* A／C只允許Control與lock。 */ (m) => m === enums.control || locks.includes(m),
              ))
      }
      if (!valid) {
        evidence.sequenceInvalid = true
        return
      }
      step++
      if (step === 4) evidence.initialSelectComplete = true
      if (step === 9) evidence.receiveSelectComplete = true
      if (step === 13) evidence.receiveCopyComplete = true
    },
    // collector或decoder故障只將本輪取證標不可用。
    unavailable(): void {
      if (enabled) {
        evidence.unavailable = true
        capturedText = null
      }
    },
  }
  const original = scope.onmessage
  // WorkerGlobalScope沒有DOM捕獲優先序；包住原handler，非診斷event原封不動只呼一次。
  scope.onmessage = function (this: unknown, event: MessageEvent): void {
    if (event.data?.type !== 'rdweb-encoded-input-diagnostic') {
      original?.call(this, event)
      return
    }
    event.stopImmediatePropagation()
    try {
      const data = event.data
      if (!Number.isSafeInteger(data.scope) || data.scope < 1) return
      if (data.action === 'begin') {
        if (data.scope <= lastScope) {
          event.ports[0]?.close()
          return
        }
        clear()
        lastScope = current = data.scope
        evidence = empty()
        port = event.ports[0] ?? null
        if (
          Object.keys(data).length !== (Object.hasOwn(data, 'captureText') ? 5 : 4) ||
          (Object.hasOwn(data, 'captureText') && data.captureText !== true) ||
          typeof data.expected !== 'string' ||
          !data.expected.startsWith('Public ') ||
          (data.captureText === true && data.expected.includes('\0')) ||
          data.expected.length > 4096 ||
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
            data.expected,
          ) ||
          new TextEncoder().encode(data.expected).length > 4096
        ) {
          port?.postMessage(empty(true))
          clear()
          return
        }
        expected = data.expected
        captureText = Object.hasOwn(data, 'captureText') && data.captureText === true
        step = count = texts = 0
        enabled = !!port
      } else if (data.scope === current && enabled && Object.keys(data).length === 3) {
        if (data.action === 'take' || data.action === 'takeWithText') {
          evidence.sequenceComplete =
            step === 13 &&
            texts === 1 &&
            !evidence.sequenceInvalid &&
            !evidence.overflow &&
            !evidence.unavailable
          try {
            const snapshot = { ...evidence }
            if (data.action === 'takeWithText')
              port?.postMessage({
                preEncryptInput: snapshot,
                preEncryptText:
                  captureText &&
                  snapshot.observed &&
                  snapshot.textExact &&
                  snapshot.textSingle &&
                  !snapshot.overflow &&
                  !snapshot.unavailable
                    ? capturedText
                    : null,
              })
            else port?.postMessage(snapshot)
          } finally {
            clear()
          }
        } else if (data.action === 'cancel') clear()
      }
    } catch {
      evidence.unavailable = true
      clear() /* 獨立診斷控制永不拋到正式Worker。 */
    }
  }
}
