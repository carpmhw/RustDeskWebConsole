<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import ReauthProof from './ReauthProof.vue'

const minimum = 30
const maximum = 3650
const { t, te } = useI18n()
const auth = useAuthStore()
const saved = ref(365)
const days = ref(365)
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
const valid = computed(
  () => Number.isInteger(days.value) && days.value >= minimum && days.value <= maximum,
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
// 讀取目前保留天數。
async function load(): Promise<void> {
  try {
    const value = await auth.request<{ retention_days: number }>(
      'api/v1/settings/audit',
      'GET',
      undefined,
      controller.signal,
    )
    if (alive && Number.isInteger(value.retention_days)) {
      saved.value = value.retention_days
      days.value = value.retention_days
      loaded.value = true
    }
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  }
}
// 取消時恢復已儲存的天數，不送出任何請求。
function cancel(): void {
  confirming.value = false
  days.value = saved.value
  clearProof()
}
// 經再次驗證後才變更；縮短天數會在下一次清除時刪除較舊紀錄。
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
      'api/v1/settings/audit',
      'PUT',
      { retention_days: days.value, ...proof },
      controller.signal,
    )
    if (alive) {
      saved.value = days.value
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
  <section class="card" data-testid="audit-retention">
    <div class="card-header">
      <h2>{{ t('auditUI.retentionTitle') }}</h2>
    </div>
    <div class="card-body">
      <p>{{ t('auditUI.retentionHint') }}</p>
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <p v-if="done" class="success-message" role="status">{{ t('usersUI.saved') }}</p>
      <div class="form-narrow">
        <label for="audit-retention">{{ t('auditUI.retentionLabel') }}</label>
        <div class="inline-field">
          <input
            id="audit-retention"
            v-model.number="days"
            type="number"
            :min="minimum"
            :max="maximum"
            step="1"
            :disabled="!loaded || busy || confirming"
          />
          <button
            v-if="!confirming"
            class="secondary"
            type="button"
            :disabled="!loaded || busy || !valid || days === saved"
            @click="confirming = true"
          >
            {{ t('auditUI.retentionSave') }}
          </button>
        </div>
        <p class="field-hint">{{ t('auditUI.retentionRange', { minimum, maximum }) }}</p>
      </div>
      <form v-if="confirming" class="form-narrow" @submit.prevent="apply">
        <p v-if="days < saved" class="notice" role="status">
          {{ t('auditUI.retentionWarning', { days }) }}
        </p>
        <ReauthProof
          v-model:method="method"
          v-model:password="proofPassword"
          v-model:code="proofCode"
          id-prefix="retention"
          :disabled="busy"
        />
        <div class="button-row">
          <button class="primary" type="submit" :disabled="busy">{{ t('usersUI.confirm') }}</button>
          <button class="text-button" type="button" :disabled="busy" @click="cancel">
            {{ t('usersUI.cancel') }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
