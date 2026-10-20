import { ConsoleHost as RealHost, type WorkerPort } from '../src/rdweb/host'
import { messages } from '../src/i18n/messages'
import type { VideoMainEvent, VideoWorkerEvent } from '../src/rdweb/video-types'
import type { Terminal } from '../src/rdweb/interaction-types'
import type { SessionAuth } from '../src/rdweb/console-session'
import type { TargetRow } from '../src/api/management'

const target = '00000000-0000-0000-0000-000000000001'
const user: NonNullable<SessionAuth['user']> = {
  id: '00000000-0000-0000-0000-000000000002',
  username: 'public-calibration',
  role: 'operator',
  totp_enabled: true,
  mfa_enrollment_required: false,
}
const workers = new Set<PublicWorker>()
const boundary = { requests: 0, workers: 0, probes: 0, starts: 0 }

// 僅替換外部Worker／renderer ports，Host與lifecycle／Session／RetryController均用正式程式。
class PublicWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  private revision = 0
  // 記住本公開port供測試派送固定typed終態，不建立native Worker或WS。
  constructor() {
    boundary.workers++
    workers.add(this)
  }
  // 公開probe／start只供DOM校準，不代表協定、影像或認證通過。
  postMessage(value: VideoMainEvent): void {
    this.revision = value.revision
    if (value.type === 'probe') {
      boundary.probes++
      queueMicrotask(
        /* probe回覆沿真Host的有界waiter。 */ () =>
          this.emit({
            type: 'capabilities',
            revision: value.revision,
            frame: value.frame,
            capabilities: { profiles: { vp9: ['vp09.00.10.08'] } },
          }),
      )
    } else if (value.type === 'start') {
      boundary.starts++
      queueMicrotask(
        /* 讓Session先收到handle後才派送公開phase。 */ () => {
          this.active()
          this.emit({ type: 'phase', revision: value.revision, phase: 'streaming' })
        },
      )
    } else if (value.type === 'dispose') this.emit({ type: 'disposed', revision: value.revision })
    else throw new Error('public_unexpected_worker_message')
  }
  // 健康activity只限隔離producer，用於測正式stable排程而非真streaming證據。
  active(): void {
    this.emit({ type: 'activity', revision: this.revision, open: true })
  }
  // 三種固定cause走正式Host dispatcher，不能由測試直接修改Vue或RetryState。
  fail(cause: Terminal['cause'], code: Terminal['code'] = 'connection_failed'): void {
    this.emit({ type: 'failure', revision: this.revision, cause, code })
  }
  // 事件型別與revision沿正式dispatcher驗證；不攜帶真實畫面或內容。
  private emit(data: VideoWorkerEvent): void {
    this.onmessage?.({ data } as MessageEvent<VideoWorkerEvent>)
  }
  // 只清本公開port，不觸碰任何宿主程序。
  terminate(): void {
    this.onmessage = null
    this.onerror = null
    workers.delete(this)
  }
}

// 正式Host的非同步終態順序保留，僅注入不接觸外界的三個ports。
export class ConsoleHost extends RealHost {
  // 與Console.vue的建構參數相同；不啟用真正renderer／native probe／Worker。
  constructor(...args: ConstructorParameters<typeof RealHost>) {
    const [auth, update, , , , hooks, now] = args
    super(
      auth,
      update,
      /* 不呈現畫面，不能產生真影像成功證據。 */ () => ({
        setFormat: /* 本fixture不送format。 */ () => {},
        accept: /* 本fixture不送frame。 */ () => {},
        dispose: /* 無native資源。 */ () => {},
      }),
      /* 唯一公開Worker port。 */ () => new PublicWorker(),
      /* 固定公開probe不建VideoFrame。 */ () =>
        ({
          close: /* 公開probe沒有native資源。 */ () => {},
        }) as VideoFrame,
      hooks,
      now,
    )
  }
}

// 沒有HTTP／AuthSession／JWT；只在編譯期替換Console.vue的store入口。
export function useAuthStore(): SessionAuth {
  return {
    phase: 'authenticated' as const,
    user,
    // 固定公開DTO只滿足正式Session／Host資料形狀，不向原server要求票證。
    request: async <T>(path: string): Promise<T> => {
      boundary.requests++
      if (path === 'api/v1/auth/me') return { ...user } as T
      if (path === `api/v1/targets/${target}`)
        return {
          id: target,
          server_id: '00000000-0000-0000-0000-000000000003',
          rustdesk_id: '123456789',
          name: 'Public calibration',
          group_name: null,
          tags: [],
          notes: null,
          created_by: user.id,
          has_password: true,
          permissions: { can_connect: true, can_edit: false, can_view_password: false },
          version: 1,
          created_at: '2026-10-20T00:00:00Z',
          updated_at: '2026-10-20T00:00:00Z',
        } satisfies TargetRow as T
      if (path === `api/v1/targets/${target}/connect-ticket`)
        return { ticket: 'a'.repeat(43), expires_in: 30 } as T
      throw new Error('public_unexpected_request')
    },
  }
}
// 固定公開route不載正式router或任何操作者狀態。
export function useRoute() {
  return { params: { targetId: target }, fullPath: '/public-calibration' }
}
// 採用正式繁中訊息，只替換翻譯注入而不複製retry徽章文案。
export function useI18n() {
  return {
    t: /* 固定公開字典與插值，不讀儲存偏好。 */ (key: string, values?: Record<string, unknown>) => {
      let result: unknown = messages['zh-TW']
      for (const part of key.split('.')) result = (result as Record<string, unknown>)?.[part]
      if (typeof result !== 'string') return key
      return result.replace(
        /\{(\w+)\}/g,
        /* 只插入公開參數。 */ (_, name: string) => String(values?.[name] ?? ''),
      )
    },
  }
}
// 測試控制只存在公開bundle，不進正式頁面或runtime helper。
export const calibration = {
  summary: /* 只回邊界次數，不回request或message資料。 */ () => ({ ...boundary }),
  fail: /* 不改正式classifier，只派送固定cause。 */ (cause: Terminal['cause']) =>
    Array.from(workers).at(-1)?.fail(cause),
  limited: /* 只派送固定fatal分類，不冒稱真正HTTP429證據。 */ () =>
    Array.from(workers).at(-1)?.fail('fatal', 'rate_limited'),
  active: /* 保持公開activity，不能稱作真MAC健康。 */ () => Array.from(workers).at(-1)?.active(),
}
