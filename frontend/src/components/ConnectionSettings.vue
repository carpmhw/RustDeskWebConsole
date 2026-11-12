<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import ReauthProof from './ReauthProof.vue'

interface Settings {
  idle_minutes: number
  max_hours: number
}
const { t, te } = useI18n()
const auth = useAuthStore()
const saved = ref<Settings>({ idle_minutes: 30, max_hours: 8 })
const idle = ref(30)
const hours = ref(8)
const confirming = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)
// 讀到目前設定前停用輸入，避免較晚的回應覆蓋使用者剛輸入的值。
const loaded = ref(false)
const method = ref<'password' | 'code'>('password')
const proofPassword = ref('')
const proofCode = ref('')
const controller = new AbortController()
let alive = true
// 0 表示關閉；其餘值須在範圍內（閒置 5–480 分鐘、上限 1–24 小時）。
const valid = computed(
  () =>
    Number.isInteger(idle.value) &&
    (idle.value === 0 || (idle.value >= 5 && idle.value <= 480)) &&
    Number.isInteger(hours.value) &&
    hours.value >= 0 &&
    hours.value <= 24,
)
const changed = computed(
  () => idle.value !== saved.value.idle_minutes || hours.value !== saved.value.max_hours,
)
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// 再次驗證輸入只在本元件短暫保存，取消、完成或離開時清空。
function clearProof(): void {
  proofPassword.value = ''
  proofCode.value = ''
  method.value = 'password'
}
// 讀取目前設定。
async function load(): Promise<void> {
  try {
    const value = await auth.request<Settings>(
      'api/v1/settings/connections',
      'GET',
      undefined,
      controller.signal,
    )
    if (alive && Number.isInteger(value.idle_minutes) && Number.isInteger(value.max_hours)) {
      saved.value = value
      idle.value = value.idle_minutes
      hours.value = value.max_hours
      loaded.value = true
    }
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  }
}
// 取消時恢復已儲存的值，不送出任何請求。
function cancel(): void {
  confirming.value = false
  idle.value = saved.value.idle_minutes
  hours.value = saved.value.max_hours
  clearProof()
}
// 經再次驗證後才變更；新設定只套用於之後建立的連線。
async function apply(): Promise<void> {
  if (busy.value || !valid.value) return
  busy.value = true
  error.value = null
  done.value = false
  const proof =
    method.value === 'password' ? { password: proofPassword.value } : { code: proofCode.value }
  clearProof()
  try {
    await auth.request(
      'api/v1/settings/connections',
      'PUT',
      { idle_minutes: idle.value, max_hours: hours.value, ...proof },
      controller.signal,
    )
    if (alive) {
      saved.value = { idle_minutes: idle.value, max_hours: hours.value }
      confirming.value = false
      done.value = true
    }
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
onMounted(load)
// 離頁取消進行中的請求並清除驗證輸入。
onBeforeUnmount(() => {
  alive = false
  controller.abort()
  clearProof()
})
</script>
<template>
  <section class="card" data-testid="connection-settings">
    <div class="card-header">
      <h2>{{ t('connectionsUI.settingsTitle') }}</h2>
    </div>
    <div class="card-body">
      <p>{{ t('connectionsUI.settingsHint') }}</p>
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <p v-if="done" class="success-message" role="status">{{ t('usersUI.saved') }}</p>
      <div class="form-narrow">
        <label for="connection-idle">{{ t('connectionsUI.idleLabel') }}</label
        ><input
          id="connection-idle"
          v-model.number="idle"
          type="number"
          min="0"
          max="480"
          step="1"
          :disabled="!loaded || busy || confirming"
        />
        <p class="field-hint">{{ t('connectionsUI.idleHint') }}</p>
        <label for="connection-hours">{{ t('connectionsUI.hoursLabel') }}</label
        ><input
          id="connection-hours"
          v-model.number="hours"
          type="number"
          min="0"
          max="24"
          step="1"
          :disabled="!loaded || busy || confirming"
        />
        <p class="field-hint">{{ t('connectionsUI.hoursHint') }}</p>
        <button
          v-if="!confirming"
          class="secondary"
          type="button"
          :disabled="!loaded || busy || !valid || !changed"
          @click="confirming = true"
        >
          {{ t('auditUI.retentionSave') }}
        </button>
        <form v-if="confirming" @submit.prevent="apply">
          <ReauthProof
            v-model:method="method"
            v-model:password="proofPassword"
            v-model:code="proofCode"
            id-prefix="connection"
            :disabled="busy"
          />
          <div class="button-row">
            <button class="primary" type="submit" :disabled="busy">
              {{ t('usersUI.confirm') }}
            </button>
            <button class="text-button" type="button" :disabled="busy" @click="cancel">
              {{ t('usersUI.cancel') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>
