<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { usePreferencesStore } from '../stores/preferences'
import { formatTimestamp } from '../utils/dateTime'
import type { AuditPage, AuditRow, UserRow } from '../api/management'
import AuditRetention from '../components/AuditRetention.vue'
defineOptions({ name: 'AuditView' })

// 與後端 AuditAction／AuditResult 名稱一致；篩選只送這些已知值。
const actions = [
  'Login',
  'Mfa',
  'UserChanged',
  'SettingsChanged',
  'TargetChanged',
  'PasswordViewed',
  'ConnectionStarted',
  'ConnectionEnded',
  'ServerChanged',
  'ServerTested',
  'VaultRotated',
  'AuditExported',
  'AuditPurged',
  'ConnectionTerminated',
  'SessionRevoked',
] as const
const ranges = [1, 7, 30, 90, 365] as const
const { t, te } = useI18n()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const rows = ref<AuditRow[]>([])
const users = ref<UserRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 50
const days = ref<(typeof ranges)[number]>(7)
const user = ref('')
const action = ref('')
const result = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
// 首次查詢完成前不顯示空狀態，避免載入中誤判為沒有紀錄。
const loaded = ref(false)
const controller = new AbortController()
let alive = true
const errorText = computed(() => {
  if (error.value === 'export_limit') return t('auditUI.exportLimit')
  return t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable')
})

// 以目前篩選組出查詢字串；時間範圍以「現在往前 N 天」換算為 UTC。
function filters(): URLSearchParams {
  const query = new URLSearchParams()
  const now = Date.now()
  query.set('from', new Date(now - days.value * 86_400_000).toISOString())
  query.set('to', new Date(now).toISOString())
  if (user.value) query.set('user_id', user.value)
  if (action.value) query.set('action', action.value)
  if (result.value) query.set('result', result.value)
  return query
}
// 讀取目前頁；離頁或新請求後晚到的回應不更新畫面。
async function load(): Promise<void> {
  busy.value = true
  error.value = null
  const query = filters()
  query.set('page', String(page.value))
  try {
    const value = await auth.request<AuditPage>(
      'api/v1/audit?' + query.toString(),
      'GET',
      undefined,
      controller.signal,
    )
    if (!alive) return
    rows.value = value.items
    total.value = value.total
    loaded.value = true
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 讀取使用者下拉選單；失敗不阻擋稽核列表。
async function loadUsers(): Promise<void> {
  try {
    const value = await auth.request<UserRow[]>('api/v1/users', 'GET', undefined, controller.signal)
    if (alive) users.value = value
  } catch {
    if (alive) users.value = []
  }
}
// 套用篩選並回到第一頁。
function search(): void {
  page.value = 1
  void load()
}
// 前後翻頁。
function changePage(delta: number): void {
  page.value += delta
  void load()
}
// 依目前篩選匯出 CSV，帶入顯示偏好的時區；使用者點擊才產生 Blob 並立即撤銷 URL。
async function exportCsv(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  const query = filters()
  query.set('time_zone', preferences.timeZone)
  try {
    const csv = await auth.request<string>(
      'api/v1/audit/export?' + query.toString(),
      'GET',
      undefined,
      controller.signal,
      'text',
    )
    if (!alive) return
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'audit.csv'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 依顯示偏好時區與語系呈現時間。
function time(row: AuditRow): string {
  return formatTimestamp(row.time, preferences.timeZone, preferences.locale)
}
// 使用者欄：系統事件無使用者；已刪除者標示。
function userText(row: AuditRow): string {
  if (!row.user_id) return t('auditUI.system')
  return row.user_deleted ? t('auditUI.deleted') : (row.user_name ?? '—')
}
// 對象欄：類型加名稱；已刪除者標示並保留識別碼供對照。
function objectText(row: AuditRow): string {
  if (!row.object_type) return '—'
  const type = te('auditUI.objectTypes.' + row.object_type)
    ? t('auditUI.objectTypes.' + row.object_type)
    : row.object_type
  if (row.object_deleted) return `${type}：${t('auditUI.deleted')}（${row.object_id}）`
  return row.object_name ? `${type}：${row.object_name}` : type
}
// 以 1024 進位呈現位元組。
function bytes(value: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return `${unit ? size.toFixed(1) : size} ${units[unit]}`
}
// 細節欄：原因、時長與傳輸量，只顯示存在的欄位。
function detailText(row: AuditRow): string {
  const parts: string[] = []
  if (row.reason)
    parts.push(
      te('auditUI.reasons.' + row.reason) ? t('auditUI.reasons.' + row.reason) : row.reason,
    )
  if (row.duration_ms !== null)
    parts.push(t('auditUI.duration', { seconds: Math.round(row.duration_ms / 1000) }))
  if (row.bytes_sent !== null && row.bytes_received !== null)
    parts.push(
      t('auditUI.transfer', { sent: bytes(row.bytes_sent), received: bytes(row.bytes_received) }),
    )
  return parts.join(' · ') || '—'
}
onMounted(() => {
  void loadUsers()
  void load()
})
// 離頁取消請求，晚到回應不恢復舊資料。
onBeforeUnmount(() => {
  alive = false
  controller.abort()
})
</script>

<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('auditUI.title') }}</h1>
        <p>{{ t('auditUI.hint') }}</p>
      </div>
    </div>
    <div class="page-stack">
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <section class="card">
        <form class="card-body target-filters" @submit.prevent="search">
          <div>
            <label for="audit-range">{{ t('auditUI.range') }}</label
            ><select id="audit-range" v-model.number="days" :disabled="busy">
              <option v-for="value in ranges" :key="value" :value="value">
                {{ t('auditUI.lastDays', { days: value }) }}
              </option>
            </select>
          </div>
          <div>
            <label for="audit-user">{{ t('user') }}</label
            ><select id="audit-user" v-model="user" :disabled="busy">
              <option value="">{{ t('auditUI.allUsers') }}</option>
              <option v-for="item in users" :key="item.id" :value="item.id">
                {{ item.username }}
              </option>
            </select>
          </div>
          <div>
            <label for="audit-action">{{ t('auditUI.action') }}</label
            ><select id="audit-action" v-model="action" :disabled="busy">
              <option value="">{{ t('auditUI.allActions') }}</option>
              <option v-for="item in actions" :key="item" :value="item">
                {{ t('auditUI.actions.' + item) }}
              </option>
            </select>
          </div>
          <div>
            <label for="audit-result">{{ t('auditUI.result') }}</label
            ><select id="audit-result" v-model="result" :disabled="busy">
              <option value="">{{ t('auditUI.allResults') }}</option>
              <option value="Success">{{ t('auditUI.results.Success') }}</option>
              <option value="Failure">{{ t('auditUI.results.Failure') }}</option>
            </select>
          </div>
          <button class="secondary" type="submit" :disabled="busy">
            {{ t('auditUI.search') }}
          </button>
        </form>
        <div class="transfer-toolbar">
          <button type="button" :disabled="busy" @click="exportCsv">
            {{ t('auditUI.export') }}
          </button>
        </div>
        <div class="table-scroll" tabindex="0" role="region" :aria-label="t('auditUI.title')">
          <table class="management-table audit-table">
            <thead>
              <tr>
                <th>{{ t('auditUI.time') }}</th>
                <th>{{ t('user') }}</th>
                <th>{{ t('auditUI.action') }}</th>
                <th>{{ t('auditUI.object') }}</th>
                <th>{{ t('auditUI.source') }}</th>
                <th>{{ t('auditUI.result') }}</th>
                <th>{{ t('auditUI.detail') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td>{{ time(row) }}</td>
                <td>{{ userText(row) }}</td>
                <td>
                  {{
                    te('auditUI.actions.' + row.action)
                      ? t('auditUI.actions.' + row.action)
                      : row.action
                  }}
                </td>
                <td>{{ objectText(row) }}</td>
                <td :title="row.user_agent ?? undefined">{{ row.source_ip ?? '—' }}</td>
                <td>
                  <span
                    class="status-pill"
                    :class="
                      row.result === 'Success' ? 'status-pill--success' : 'status-pill--danger'
                    "
                    >{{ t('auditUI.results.' + row.result) }}</span
                  >
                </td>
                <td>{{ detailText(row) }}</td>
              </tr>
              <tr v-if="loaded && !rows.length">
                <td colspan="7" class="empty-row">{{ t('auditUI.empty') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button type="button" :disabled="busy || page <= 1" @click="changePage(-1)">
            {{ t('targetUI.previous') }}</button
          ><span>{{ t('auditUI.page', { page, count: total }) }}</span
          ><button
            type="button"
            :disabled="busy || page * pageSize >= total"
            @click="changePage(1)"
          >
            {{ t('targetUI.next') }}
          </button>
        </div>
      </section>
      <AuditRetention />
    </div>
  </main>
</template>
