import type {
  IngressCase,
  IngressFaultController,
  IngressFaultSummary,
  IngressIdentity,
  IngressIo,
} from './reconnect-ingress-types'
import { createRuntimeIngressIo } from './reconnect-ingress-io'
import { readIngressOwner } from '../scripts/reconnect-ingress-scope.mjs'

// 格式／label均fail closed，僅接受固定八欄且不外傳identity。
function identity(raw: string, capability: string): IngressIdentity {
  try {
    const value: IngressIdentity = JSON.parse(raw)
    if (
      !value ||
      !/^[a-f0-9]{64}$/.test(value.id) ||
      !/^sha256:[a-f0-9]{64}$/.test(value.image) ||
      !['rdweb-m0-web', 'rdweb-m0-web:latest'].includes(value.imageRef) ||
      value.project !== 'rdweb-m0' ||
      value.service !== 'ingress' ||
      value.owner !== capability ||
      value.running !== true ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value.startedAt) ||
      !Number.isFinite(Date.parse(value.startedAt)) ||
      Date.parse(value.startedAt) <= 0
    )
      throw new Error()
    return value
  } catch {
    throw new Error('ingress_control_failed')
  }
}
// 純controller把每案once與全輪budget在派發前消耗，任何failure使全owner失效。
export function createIngressFaultController(
  io: IngressIo,
  capability: string,
  now: () => number,
): IngressFaultController {
  let poisoned = false,
    busy = false,
    closing: Promise<void> | undefined
  const owner = new AbortController(),
    used = new Set<IngressCase>()
  const state: IngressFaultSummary = {
    attempted: 0,
    confirmed: 0,
    cases: {
      tcp: { attempted: false, confirmed: false },
      ws: { attempted: false, confirmed: false },
    },
  }
  // 同一絕對期限也防不合作的I/O晚回，不能繞過controller的派發guard。
  async function bounded<T>(
    operation: () => Promise<T>,
    until: number,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted) throw new Error('ingress_cancelled')
    const remaining = until - now()
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 5000)
      throw new Error('ingress_control_failed')
    let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
    try {
      const value = await Promise.race([
        operation(),
        new Promise<never>(
          /* 只回安全固定分類。 */ (_resolve, reject) => {
            abort = /* 取消優先作廢晚回。 */ () => reject(new Error('ingress_cancelled'))
            signal.addEventListener('abort', abort, { once: true })
            timer = setTimeout(
              /* 單一controller期限。 */ () => reject(new Error('ingress_control_failed')),
              remaining,
            )
            if (signal.aborted) abort()
          },
        ),
      ])
      if (signal.aborted || now() >= until) throw new Error('ingress_control_failed')
      return value
    } finally {
      clearTimeout(timer)
      if (abort) signal.removeEventListener('abort', abort)
    }
  }
  return {
    restart: /* 沒有重試／修label／重建的成功捷徑。 */ async (which, external) => {
      if (
        poisoned ||
        busy ||
        !['tcp', 'ws'].includes(which) ||
        used.has(which) ||
        state.attempted >= 2 ||
        !/^[a-f0-9]{64}$/.test(capability)
      ) {
        poisoned = true
        owner.abort()
        throw new Error('ingress_control_failed')
      }
      busy = true
      used.add(which)
      const signal = AbortSignal.any([external, owner.signal]),
        controlStartedAt = now(),
        until = controlStartedAt + 5000
      try {
        const raw = await bounded(
          /* 捕捉唯一ID後不改用service selector。 */ () => io.run('discover', null, until, signal),
          until,
          signal,
        )
        const id = raw.trim()
        if (!/^[a-f0-9]{64}$/.test(id)) throw new Error()
        const first = identity(
          await bounded(
            /* 僅固定identity投影。 */ () => io.run('inspect', id, until, signal),
            until,
            signal,
          ),
          capability,
        )
        const second = identity(
          await bounded(
            /* 派發前再驗同ID／label／image／StartedAt。 */ () =>
              io.run('inspect', id, until, signal),
            until,
            signal,
          ),
          capability,
        )
        if (
          first.id !== id ||
          Object.keys(first).some(
            /* 每個fingerprint欄都必須相同。 */ (key) =>
              first[key as keyof IngressIdentity] !== second[key as keyof IngressIdentity],
          )
        )
          throw new Error()
        if (signal.aborted || now() >= until) throw new Error()
        state.attempted++
        state.cases[which].attempted = true
        const faultRequestedAt = now()
        await bounded(
          /* 派發前已消耗，spawn失敗也不補發。 */ () => io.run('restart', id, until, signal),
          until,
          signal,
        )
        const commandCompletedAt = now()
        const after = identity(
          await bounded(
            /* manual restart不要求RestartCount增加。 */ () => io.run('inspect', id, until, signal),
            until,
            signal,
          ),
          capability,
        )
        if (
          after.id !== id ||
          after.image !== first.image ||
          after.imageRef !== first.imageRef ||
          after.startedAt === first.startedAt
        )
          throw new Error()
        const readyAt = await bounded(
          /* 只證固定公開入口ready。 */ () => io.ready(until, signal),
          until,
          signal,
        )
        if (!Number.isFinite(readyAt) || readyAt < commandCompletedAt || readyAt >= until)
          throw new Error()
        state.confirmed++
        state.cases[which].confirmed = true
        return {
          controlStartedAt,
          faultRequestedAt,
          commandCompletedAt,
          readyAt,
          ownershipVerified: true,
          identityPreserved: true,
          startedAtChanged: true,
          restartAttempted: true,
          restartConfirmed: true,
        }
      } catch {
        poisoned = true
        owner.abort()
        throw new Error(external.aborted ? 'ingress_cancelled' : 'ingress_control_failed')
      } finally {
        busy = false
      }
    },
    summary: /* copy不能讓caller重設budget。 */ () => ({
      ...state,
      cases: { tcp: { ...state.cases.tcp }, ws: { ...state.cases.ws } },
    }),
    close: /* Worker owner只close一次，未知daemon結果由外層owned teardown處理。 */ () => {
      if (!closing) {
        poisoned = true
        owner.abort()
        closing = io.close()
      }
      return closing
    },
  }
}
// Runtime讀能力先於任何Docker I/O，無參數覆寫。
export function createRuntimeIngressController(): IngressFaultController {
  return createIngressFaultController(
    createRuntimeIngressIo(),
    readIngressOwner(process.env),
    /* 固定Node時計。 */ () => performance.now(),
  )
}
