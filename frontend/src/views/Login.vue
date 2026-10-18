<script setup lang="ts">
defineOptions({ name: 'LoginView' })
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { safeNext } from '../router/policy'
import HealthPanel from '../components/HealthPanel.vue'
const { t, te } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const code = ref('')
const method = ref<'totp' | 'recovery'>('totp')
const busy = ref(false)
const error = ref<string | null>(null)
const codeInput = ref<HTMLInputElement | null>(null)
const controller = new AbortController()
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// 提交後立即清密碼或碼，HTTP錯誤只顯示翻譯分類。
async function submit(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    if (auth.phase === 'mfa') await auth.verifyMfa(code.value)
    else await auth.login(username.value, password.value, controller.signal)
    if (controller.signal.aborted) return
    if (auth.phase === 'authenticated')
      await router.replace({
        name: auth.user?.mfa_enrollment_required ? 'security' : safeNext(route.query.next),
      })
    else {
      await nextTick()
      codeInput.value?.focus()
    }
  } catch (failure) {
    if (!controller.signal.aborted) error.value = auth.errorCode(failure)
  } finally {
    password.value = ''
    code.value = ''
    busy.value = false
  }
}
// 返回第一步時清所有第二因素輸入與票證。
function back(): void {
  auth.cancelMfa()
  code.value = ''
  error.value = null
}
// 切換第二因素輸入方式時清除原輸入。
function selectMethod(value: 'totp' | 'recovery'): void {
  method.value = value
  code.value = ''
}
// 離開登入頁會取消未完成request，避免舊回應恢復敏感狀態。
onBeforeUnmount(() => {
  controller.abort()
  password.value = ''
  code.value = ''
  auth.cancelMfa()
})
</script>
<template>
  <main class="login-main">
    <section class="card login-card">
      <h1 id="login-title">{{ t(auth.phase === 'mfa' ? 'mfaTitle' : 'login') }}</h1>
      <p class="intro-copy">{{ t(auth.phase === 'mfa' ? 'mfaHint' : 'loginHint') }}</p>
      <p v-if="route.query.message === 'disabledDone'" class="success-message" role="status">
        {{ t('disabledDone') }}
      </p>
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <form :aria-label="t(auth.phase === 'mfa' ? 'mfaTitle' : 'login')" @submit.prevent="submit">
        <template v-if="auth.phase !== 'mfa'"
          ><label for="username">{{ t('username') }}</label
          ><input
            id="username"
            v-model="username"
            name="username"
            autocomplete="username"
            required
            minlength="3"
            maxlength="128"
            :disabled="busy" /><label for="password">{{ t('password') }}</label
          ><input
            id="password"
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            minlength="12"
            maxlength="1024"
            :disabled="busy"
        /></template>
        <template v-else
          ><div class="choice-buttons">
            <button type="button" :aria-pressed="method === 'totp'" @click="selectMethod('totp')">
              {{ t('totp') }}</button
            ><button
              type="button"
              :aria-pressed="method === 'recovery'"
              @click="selectMethod('recovery')"
            >
              {{ t('recovery') }}
            </button>
          </div>
          <label for="mfa-code">{{ t(method === 'totp' ? 'totp' : 'recovery') }}</label
          ><input
            id="mfa-code"
            ref="codeInput"
            v-model="code"
            :inputmode="method === 'totp' ? 'numeric' : 'text'"
            :autocomplete="method === 'totp' ? 'one-time-code' : 'off'"
            :pattern="method === 'totp' ? '[0-9]{6}' : '[A-Fa-f0-9-]{32,64}'"
            :maxlength="method === 'totp' ? 6 : 64"
            required
            :disabled="busy"
            spellcheck="false"
        /></template>
        <button class="primary full" type="submit" :disabled="busy">
          {{ t(busy ? 'busy' : auth.phase === 'mfa' ? 'verify' : 'submitLogin') }}
        </button>
        <button
          v-if="auth.phase === 'mfa'"
          type="button"
          class="text-button full"
          :disabled="busy"
          @click="back"
        >
          {{ t('back') }}
        </button>
      </form>
    </section>
    <aside class="login-health" :aria-label="t('healthTitle')"><HealthPanel /></aside>
  </main>
</template>
