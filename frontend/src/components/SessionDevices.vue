<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { usePreferencesStore } from '../stores/preferences'
import { formatTimestamp } from '../utils/dateTime'
import type { SessionRow } from '../api/management'

// userId 有值時為管理員檢視該使用者；否則為本人的登入裝置。
const props = defineProps<{ userId?: string }>()
const { t, te } = useI18n()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const rows = ref<SessionRow[]>([])
const loaded = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const revoked = ref<number | null>(null)
// 待確認的操作：單一 session 的 ID，或 all（管理員全部登出／本人登出其他所有裝置）。
const pending = ref<string | null>(null)
const controller = new AbortController()
let alive = true
const base = computed(() =>
  props.userId ? 'api/v1/users/' + props.userId + '/sessions' : 'api/v1/auth/sessions',
)
const others = computed(() => rows.value.filter((row) => !row.current).length)
// 404 在此代表 session 已結束（例如在別處被登出），不沿用「目標不存在」的通用訊息。
const errorText = computed(() =>
  error.value === 'not_found'
    ? t('sessionsUI.gone')
    : t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)

// 讀取登入中的 session；離開後晚到的回應不更新畫面。
async function load(): Promise<void> {
  try {
    const value = await auth.request<{ items: SessionRow[] }>(
      base.value,
      'GET',
      undefined,
      controller.signal,
    )
    if (!alive) return
    rows.value = value.items
    loaded.value = true
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  }
}
// 確認後登出：單一、全部或其他所有裝置；完成後顯示數量並重新讀取。
async function revoke(): Promise<void> {
  const target = pending.value
  pending.value = null
  if (!target || busy.value) return
  busy.value = true
  error.value = null
  revoked.value = null
  try {
    const value = await auth.request<{ revoked: number }>(
      props.userId ? base.value + '/revoke' : 'api/v1/auth/sessions/revoke-others',
      'POST',
      target === 'all' ? {} : { session_id: target },
      controller.signal,
    )
    if (!alive) return
    revoked.value = value.revoked
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
  if (alive) await load()
}
// 裝置名稱：瀏覽器與作業系統，兩者皆無法辨識時為「未知裝置」。
function device(row: SessionRow): string {
  const parts = [row.browser, row.os].filter((part): part is string => !!part)
  return parts.length ? parts.join(' · ') : t('sessionsUI.unknown')
}
// 依顯示偏好時區呈現時間。
function time(value: string): string {
  return formatTimestamp(value, preferences.timeZone, preferences.locale)
}
onMounted(load)
// 離開時取消進行中的請求。
onBeforeUnmount(() => {
  alive = false
  controller.abort()
})
</script>
<template>
  <div class="page-stack" data-testid="session-devices">
    <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
    <p v-if="revoked !== null" class="success-message" role="status">
      {{ t('sessionsUI.revoked', { count: revoked }) }}
    </p>
    <div class="table-scroll" tabindex="0" role="region" :aria-label="t('sessionsUI.title')">
      <table class="management-table">
        <thead>
          <tr>
            <th>{{ t('sessionsUI.device') }}</th>
            <th>IP</th>
            <th>{{ t('sessionsUI.signedIn') }}</th>
            <th>{{ t('sessionsUI.lastUsed') }}</th>
            <th v-if="userId">{{ t('usersUI.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" data-testid="session-row">
            <td>
              {{ device(row) }}
              <span v-if="row.current" class="status-pill status-pill--success">{{
                t('sessionsUI.current')
              }}</span>
            </td>
            <td>{{ row.ip ?? '—' }}</td>
            <td>{{ time(row.signed_in_at) }}</td>
            <td>{{ time(row.last_used_at) }}</td>
            <td v-if="userId">
              <button
                v-if="!row.current"
                type="button"
                class="secondary"
                :disabled="busy"
                @click="pending = row.id"
              >
                {{ t('sessionsUI.revoke') }}
              </button>
            </td>
          </tr>
          <tr v-if="loaded && !rows.length">
            <td :colspan="userId ? 5 : 4" class="empty-row">{{ t('sessionsUI.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="pending"
      class="notice"
      role="alertdialog"
      :aria-label="t('sessionsUI.confirmTitle')"
    >
      <p>
        {{
          t(
            pending !== 'all'
              ? 'sessionsUI.confirmOne'
              : userId
                ? 'sessionsUI.confirmAll'
                : 'sessionsUI.confirmOthers',
          )
        }}
      </p>
      <div class="button-row">
        <button type="button" class="danger" :disabled="busy" @click="revoke">
          {{ t('usersUI.confirm') }}
        </button>
        <button type="button" class="text-button" @click="pending = null">
          {{ t('usersUI.cancel') }}
        </button>
      </div>
    </div>
    <div v-else class="button-row">
      <button
        type="button"
        class="danger"
        :disabled="busy || !loaded || others === 0"
        @click="pending = 'all'"
      >
        {{ t(userId ? 'sessionsUI.revokeAll' : 'sessionsUI.revokeOthers') }}
      </button>
    </div>
  </div>
</template>
