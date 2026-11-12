<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { usePreferencesStore } from '../stores/preferences'
import { formatTimestamp } from '../utils/dateTime'
import type { ActiveConnection } from '../api/management'
import ConnectionSettings from '../components/ConnectionSettings.vue'
defineOptions({ name: 'ConnectionsView' })

const { t, te } = useI18n()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const rows = ref<ActiveConnection[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)
// 首次查詢完成前不顯示空狀態，避免載入中誤判為沒有連線。
const loaded = ref(false)
// 已連線時間以每秒更新的「現在」計算，不另發 API。
const now = ref(Date.now())
const pending = ref<ActiveConnection | null>(null)
const confirmDialog = ref<HTMLDialogElement | null>(null)
const controller = new AbortController()
let ticker: ReturnType<typeof setInterval> | null = null
let alive = true
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)

// 讀取作用中連線；離頁後晚到的回應不更新畫面。
async function load(): Promise<void> {
  busy.value = true
  error.value = null
  try {
    const value = await auth.request<{ items: ActiveConnection[] }>(
      'api/v1/connections',
      'GET',
      undefined,
      controller.signal,
    )
    if (!alive) return
    rows.value = value.items
    loaded.value = true
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 手動重新整理，並清除前一次的中斷結果訊息。
function refresh(): void {
  done.value = false
  void load()
}
// 開啟確認對話框；實際中斷只在確認後送出。
function ask(row: ActiveConnection): void {
  pending.value = row
  confirmDialog.value?.showModal()
}
// 關閉確認對話框而不中斷。
function dismiss(): void {
  confirmDialog.value?.close()
  pending.value = null
}
// 確認後強制中斷，完成後重新讀取列表。
async function terminate(): Promise<void> {
  const row = pending.value
  dismiss()
  if (!row || busy.value) return
  busy.value = true
  error.value = null
  done.value = false
  try {
    await auth.request('api/v1/connections/' + row.id + '/terminate', 'POST', {}, controller.signal)
    if (!alive) return
    done.value = true
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
  if (alive) await load()
}
// 依顯示偏好時區呈現開始時間。
function started(row: ActiveConnection): string {
  return formatTimestamp(row.started_at, preferences.timeZone, preferences.locale)
}
// 已連線時間：時、分、秒。
function elapsed(row: ActiveConnection): string {
  const seconds = Math.max(0, Math.floor((now.value - Date.parse(row.started_at)) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return t('connectionsUI.elapsed', { hours, minutes, seconds: seconds % 60 })
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
onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  void load()
})
// 離頁取消請求並停止計時。
onBeforeUnmount(() => {
  alive = false
  controller.abort()
  if (ticker !== null) clearInterval(ticker)
})
</script>

<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('connectionsUI.title') }}</h1>
        <p>{{ t('connectionsUI.hint') }}</p>
      </div>
      <button type="button" class="secondary" :disabled="busy" @click="refresh">
        {{ t('connectionsUI.refresh') }}
      </button>
    </div>
    <div class="page-stack">
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <p v-if="done" class="success-message" role="status">{{ t('connectionsUI.terminated') }}</p>
      <section class="card">
        <div class="table-scroll" tabindex="0" role="region" :aria-label="t('connectionsUI.title')">
          <table class="management-table audit-table">
            <thead>
              <tr>
                <th>{{ t('user') }}</th>
                <th>{{ t('connectionsUI.target') }}</th>
                <th>{{ t('connectionsUI.started') }}</th>
                <th>{{ t('connectionsUI.duration') }}</th>
                <th>{{ t('auditUI.source') }}</th>
                <th>{{ t('connectionsUI.traffic') }}</th>
                <th>{{ t('manage.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td>{{ row.user_name ?? t('auditUI.deleted') }}</td>
                <td>{{ row.target_name ?? t('auditUI.deleted') }}</td>
                <td>{{ started(row) }}</td>
                <td>{{ elapsed(row) }}</td>
                <td>{{ row.source_ip ?? '—' }}</td>
                <td>
                  {{
                    t('auditUI.transfer', {
                      sent: bytes(row.bytes_sent),
                      received: bytes(row.bytes_received),
                    })
                  }}
                </td>
                <td>
                  <button type="button" class="danger" :disabled="busy" @click="ask(row)">
                    {{ t('connectionsUI.terminate') }}
                  </button>
                </td>
              </tr>
              <tr v-if="loaded && !rows.length">
                <td colspan="7" class="empty-row">{{ t('connectionsUI.empty') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <ConnectionSettings />
    </div>
    <dialog
      ref="confirmDialog"
      class="management-dialog"
      :aria-label="t('connectionsUI.confirmTitle')"
      @close="pending = null"
    >
      <h2>{{ t('connectionsUI.confirmTitle') }}</h2>
      <p v-if="pending">
        {{
          t('connectionsUI.confirmText', {
            user: pending.user_name ?? '—',
            target: pending.target_name ?? '—',
          })
        }}
      </p>
      <div class="button-row">
        <button type="button" class="danger" @click="terminate">
          {{ t('connectionsUI.terminate') }}
        </button>
        <button type="button" @click="dismiss">{{ t('usersUI.cancel') }}</button>
      </div>
    </dialog>
  </main>
</template>
