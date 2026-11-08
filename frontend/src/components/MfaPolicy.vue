<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import ReauthProof from './ReauthProof.vue'

type Policy = 'off' | 'admins' | 'all'
const { t, te } = useI18n()
const auth = useAuthStore()
const saved = ref<Policy>('off')
const selected = ref<Policy>('off')
const confirming = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)
// 讀到目前政策前停用選單，避免較晚的回應覆蓋使用者剛做的選擇。
const loaded = ref(false)
const method = ref<'password' | 'code'>('password')
const proofPassword = ref('')
const proofCode = ref('')
const controller = new AbortController()
let alive = true
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// 再次驗證輸入只在本元件短暫保存，取消、完成或離開時清空。
function clearProof(): void {
  proofPassword.value = ''
  proofCode.value = ''
  method.value = 'password'
}
// 讀取目前政策，只接受三種已知值。
async function load(): Promise<void> {
  try {
    const value = await auth.request<{ require_mfa: Policy }>(
      'api/v1/settings/security',
      'GET',
      undefined,
      controller.signal,
    )
    if (alive && ['off', 'admins', 'all'].includes(value.require_mfa)) {
      saved.value = value.require_mfa
      selected.value = value.require_mfa
      loaded.value = true
    }
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  }
}
// 取消時恢復為已儲存的政策，不送出任何請求。
function cancel(): void {
  confirming.value = false
  selected.value = saved.value
  clearProof()
}
// 經再次驗證後才變更政策；後端會立即依新政策終止不符合者的連線。
async function apply(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  done.value = false
  const proof =
    method.value === 'password' ? { password: proofPassword.value } : { code: proofCode.value }
  clearProof()
  try {
    await auth.request(
      'api/v1/settings/security',
      'PUT',
      { require_mfa: selected.value, ...proof },
      controller.signal,
    )
    if (alive) {
      saved.value = selected.value
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
  <section class="card" data-testid="mfa-policy">
    <div class="card-header">
      <h2>{{ t('usersUI.policyTitle') }}</h2>
    </div>
    <div class="card-body">
      <p>{{ t('usersUI.policyHint') }}</p>
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <p v-if="done" class="success-message" role="status">{{ t('usersUI.saved') }}</p>
      <label for="mfa-policy">{{ t('usersUI.policyLabel') }}</label>
      <div class="inline-field">
        <select id="mfa-policy" v-model="selected" :disabled="!loaded || busy || confirming">
          <option value="off">{{ t('usersUI.policyOff') }}</option>
          <option value="admins">{{ t('usersUI.policyAdmins') }}</option>
          <option value="all">{{ t('usersUI.policyAll') }}</option>
        </select>
        <button
          v-if="!confirming"
          class="secondary"
          type="button"
          :disabled="!loaded || busy || selected === saved"
          @click="confirming = true"
        >
          {{ t('usersUI.policySave') }}
        </button>
      </div>
      <form v-if="confirming" @submit.prevent="apply">
        <ReauthProof
          v-model:method="method"
          v-model:password="proofPassword"
          v-model:code="proofCode"
          id-prefix="policy"
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
