export interface HostManifest {
  schemaVersion: 1
  runId: string
  expected: string
  editor: { x: number; y: number; width: number; height: number }
  createdUtc: string
  expiresUtc: string
}
export interface HostRequest {
  schemaVersion: 1
  runId: string
  requestId: string
  createdUtc: string
}
export interface HostMainTimeline {
  clockDomain: 'browser_main'
  events: HostMainEvent[]
  overflow: boolean
  unavailable: boolean
}
export interface HostMainEvent {
  ordinal: number
  kind: string
  tUs: number
  revision: number | null
  generation: number | null
  batchId: number | null
  requestId: number | null
  code: string
}
export interface HostReady {
  schemaVersion: 1
  runId: string
  requestId: string
  utc: string
  policyAccepted: boolean
  scopeVerified: boolean
  observerReady: boolean
  clockDomain: 'windows_host'
  frequency: number
  origin: 0
}
export interface HostRow {
  ordinal: number
  kind: string
  tStartUs: number
  tEndUs: number
  clipboardOrdinal: number | null
  notificationUs: number | null
  scopeVerified: boolean
  editorReadable: boolean
  editorExact: boolean
  editorStable: boolean
  clipboardReadable: boolean
  clipboardExact: boolean
  clipboardStable: boolean
  clipboardOwnerMatchesEditor: boolean | null
  clipboardMatchesEditor: boolean | null
  code: string
}
export interface HostResult {
  schemaVersion: 1
  runId: string
  requestId: string
  startedUtc: string
  endedUtc: string
  clockDomain: 'windows_host'
  observations: HostRow[]
  clipboardNotifications: number
  sampleAttempts: number
  overflow: boolean
  unavailable: boolean
  resourcesClosed: boolean
  code: string
}
// 固定錯誤不帶資料或原生exception。
export function hostUnavailable(): never {
  throw new Error('host_observation_unavailable')
}
export const HOST_CODES = [
  'host_observed',
  'host_observation_timeout',
  'host_query_timeout',
  'host_scope_changed',
  'host_text_unreadable',
  'host_clipboard_busy',
  'host_clipboard_format_unavailable',
  'host_clipboard_unstable',
  'host_text_too_large',
  'host_text_invalid',
  'host_observation_overflow',
  'host_policy_unavailable',
  'host_capability_unavailable',
  'host_cleanup_unavailable',
] as const
// 只接普通object的own data property，不執行getter／toJSON或接受extra。
function fields(value: unknown, names: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== names.length ||
    names.some(
      /* schema欄位不得繼承或以getter提供。 */ (key) =>
        !Object.hasOwn(value, key) ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'),
    )
  )
    hostUnavailable()
  const copy: Record<string, unknown> = {}
  for (const key of names) copy[key] = Object.getOwnPropertyDescriptor(value, key)!.value
  return copy
}
// 有界密集own-data陣列副本；拒絕getter／自訂iterator／toJSON，遍歷不執行外部程式。
function list(value: unknown, max: number): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > max ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    hostUnavailable()
  const copy: unknown[] = []
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) hostUnavailable()
    copy.push(descriptor.value)
  }
  return copy
}
// 對有限整數及nullable tag作界限檢查。
function integer(value: unknown, max: number, min = 0): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    hostUnavailable()
}
// 只收boolean，不用truthiness猜原生可用性。
function booleans(value: Record<string, unknown>, names: string[]): void {
  if (names.some(/* 每欄必須真boolean。 */ (key) => typeof value[key] !== 'boolean'))
    hostUnavailable()
}
// UTC只用於過期／展示，驗完整格式與有效日期，不作跨時鐘排序。
function utc(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    hostUnavailable()
  return Date.parse(value)
}
// 只接受公開關聯GUID，並非認證token。
function guid(value: unknown): void {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    hostUnavailable()
}
// geometry保持既有授權矩形界限，不擴大桌面；回傳own-data副本。
function geometry(value: unknown): Record<string, unknown> {
  const v = fields(value, ['x', 'y', 'width', 'height'])
  for (const key of ['x', 'y', 'width', 'height']) integer(v[key], 4096)
  if (
    Number(v.width) < 21 ||
    Number(v.height) < 31 ||
    Number(v.x) + Number(v.width) > 4096 ||
    Number(v.y) + Number(v.height) > 4096
  )
    hostUnavailable()
  return v
}
// expected僅公開fixture、合法scalar、無NUL且4096 UTF8，暫存編碼即清。
export function validateHostManifest(value: unknown, now = Date.now()): HostManifest {
  const v = fields(value, [
    'schemaVersion',
    'runId',
    'expected',
    'editor',
    'createdUtc',
    'expiresUtc',
  ])
  guid(v.runId)
  v.editor = geometry(v.editor)
  if (
    v.schemaVersion !== 1 ||
    typeof v.expected !== 'string' ||
    !v.expected.startsWith('Public 中文 RdWeb ') ||
    v.expected.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v.expected) ||
    v.expected.length > 4096
  )
    hostUnavailable()
  const bytes = new TextEncoder().encode(v.expected)
  const size = bytes.length
  bytes.fill(0)
  const start = utc(v.createdUtc),
    end = utc(v.expiresUtc)
  if (size > 4096 || end - start !== 1800000 || !Number.isFinite(now) || now < start || now >= end)
    hostUnavailable()
  return v as unknown as HostManifest
}
// request綁已claim的manifest，不允許其他輪次或任意metadata。
export function validateHostRequest(value: unknown, manifest: HostManifest): HostRequest {
  const v = fields(value, ['schemaVersion', 'runId', 'requestId', 'createdUtc'])
  guid(v.requestId)
  const time = utc(v.createdUtc)
  if (
    v.schemaVersion !== 1 ||
    v.runId !== manifest.runId ||
    time < Date.parse(manifest.createdUtc) ||
    time >= Date.parse(manifest.expiresUtc)
  )
    hostUnavailable()
  return v as unknown as HostRequest
}
// ready只證明當時開始；scope／能力不足一律不讓原輸入開始。
export function validateHostReady(
  value: unknown,
  manifest: HostManifest,
  request: HostRequest,
): HostReady {
  const v = fields(value, [
    'schemaVersion',
    'runId',
    'requestId',
    'utc',
    'policyAccepted',
    'scopeVerified',
    'observerReady',
    'clockDomain',
    'frequency',
    'origin',
  ])
  utc(v.utc)
  integer(v.frequency, 1000000000, 1)
  if (
    v.schemaVersion !== 1 ||
    v.runId !== manifest.runId ||
    v.requestId !== request.requestId ||
    v.clockDomain !== 'windows_host' ||
    v.origin !== 0 ||
    v.policyAccepted !== true ||
    v.scopeVerified !== true ||
    v.observerReady !== true
  )
    hostUnavailable()
  return v as unknown as HostReady
}
// host只接受固定安全rows，讀取／通知時間分開，unknown不補成相等。
export function validateHostResult(
  value: unknown,
  manifest: HostManifest,
  request: HostRequest,
): HostResult {
  const v = fields(value, [
    'schemaVersion',
    'runId',
    'requestId',
    'startedUtc',
    'endedUtc',
    'clockDomain',
    'observations',
    'clipboardNotifications',
    'sampleAttempts',
    'overflow',
    'unavailable',
    'resourcesClosed',
    'code',
  ])
  if (
    v.schemaVersion !== 1 ||
    v.runId !== manifest.runId ||
    v.requestId !== request.requestId ||
    v.clockDomain !== 'windows_host' ||
    !Array.isArray(v.observations) ||
    v.observations.length > 128 ||
    !HOST_CODES.includes(v.code as (typeof HOST_CODES)[number])
  )
    hostUnavailable()
  v.observations = list(v.observations, 128)
  booleans(v, ['overflow', 'unavailable', 'resourcesClosed'])
  if ((v.resourcesClosed !== true || v.overflow === true) && v.unavailable !== true)
    hostUnavailable()
  integer(v.clipboardNotifications, 64)
  integer(v.sampleAttempts, 1200)
  const elapsed = utc(v.endedUtc) - utc(v.startedUtc)
  if (elapsed < 0 || elapsed > 122000) hostUnavailable()
  let previous = 0,
    clipboardOrdinal = 0
  const observations: Record<string, unknown>[] = []
  for (const [index, item] of (v.observations as unknown[]).entries()) {
    const r = fields(item, [
      'ordinal',
      'kind',
      'tStartUs',
      'tEndUs',
      'clipboardOrdinal',
      'notificationUs',
      'scopeVerified',
      'editorReadable',
      'editorExact',
      'editorStable',
      'clipboardReadable',
      'clipboardExact',
      'clipboardStable',
      'clipboardOwnerMatchesEditor',
      'clipboardMatchesEditor',
      'code',
    ])
    if (
      r.ordinal !== index + 1 ||
      typeof r.kind !== 'string' ||
      !['baseline', 'editor', 'clipboard', 'terminal'].includes(r.kind) ||
      !HOST_CODES.includes(r.code as (typeof HOST_CODES)[number])
    )
      hostUnavailable()
    integer(r.tStartUs, 120000000)
    integer(r.tEndUs, 120000000)
    if (Number(r.tStartUs) < previous || Number(r.tEndUs) < Number(r.tStartUs)) hostUnavailable()
    previous = Number(r.tEndUs)
    booleans(r, [
      'scopeVerified',
      'editorReadable',
      'editorExact',
      'editorStable',
      'clipboardReadable',
      'clipboardExact',
      'clipboardStable',
    ])
    if (r.clipboardOrdinal !== null) {
      integer(r.clipboardOrdinal, Number(v.clipboardNotifications), 1)
      if (Number(r.clipboardOrdinal) <= clipboardOrdinal) hostUnavailable()
      clipboardOrdinal = Number(r.clipboardOrdinal)
    }
    if (r.notificationUs !== null) integer(r.notificationUs, Number(r.tStartUs))
    if (r.kind === 'clipboard' && (r.clipboardOrdinal === null || r.notificationUs === null))
      hostUnavailable()
    for (const key of ['clipboardOwnerMatchesEditor', 'clipboardMatchesEditor'])
      if (r[key] !== null && typeof r[key] !== 'boolean') hostUnavailable()
    if (
      (r.editorExact && (!r.scopeVerified || !r.editorReadable || !r.editorStable)) ||
      (r.clipboardExact && (!r.scopeVerified || !r.clipboardReadable || !r.clipboardStable)) ||
      (r.clipboardMatchesEditor !== null &&
        (!r.scopeVerified ||
          !r.editorReadable ||
          !r.editorStable ||
          !r.clipboardReadable ||
          !r.clipboardStable))
    )
      hostUnavailable()
    if (
      r.clipboardMatchesEditor !== null &&
      ((r.editorExact === true && r.clipboardExact === true && r.clipboardMatchesEditor !== true) ||
        (r.editorExact !== r.clipboardExact && r.clipboardMatchesEditor === true))
    )
      hostUnavailable()
    observations.push(r)
  }
  v.observations = observations
  if (new TextEncoder().encode(JSON.stringify(v)).length > 65536) hostUnavailable()
  return v as unknown as HostResult
}
// Main同scope單調時間／metadata白名單，不讀任何payload／hash。
export function validateHostTimeline(value: unknown): HostMainTimeline {
  const v = fields(value, ['clockDomain', 'events', 'overflow', 'unavailable'])
  booleans(v, ['overflow', 'unavailable'])
  if (v.clockDomain !== 'browser_main' || !Array.isArray(v.events) || v.events.length > 128)
    hostUnavailable()
  v.events = list(v.events, 128)
  let previous = 0
  const events: Record<string, unknown>[] = []
  for (const [index, item] of (v.events as unknown[]).entries()) {
    const r = fields(item, [
      'ordinal',
      'kind',
      'tUs',
      'revision',
      'generation',
      'batchId',
      'requestId',
      'code',
    ])
    integer(r.tUs, 180000000)
    if (
      r.ordinal !== index + 1 ||
      Number(r.tUs) < previous ||
      typeof r.kind !== 'string' ||
      typeof r.code !== 'string' ||
      ![
        'batch_submit',
        'batch_ack',
        'pull_submit',
        'clipboard_data',
        'native_write',
        'terminal',
      ].includes(r.kind) ||
      !['observed', 'sent', 'dropped', 'closed', 'unavailable'].includes(r.code)
    )
      hostUnavailable()
    previous = Number(r.tUs)
    for (const key of ['revision', 'generation', 'batchId', 'requestId'])
      if (r[key] !== null) integer(r[key], Number.MAX_SAFE_INTEGER)
    events.push(r)
  }
  v.events = events
  return v as unknown as HostMainTimeline
}
