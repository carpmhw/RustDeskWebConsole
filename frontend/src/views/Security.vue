<script setup lang="ts">
defineOptions({ name: 'SecurityView' })
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePreferencesStore } from '../stores/preferences'
import { buildQr } from '../utils/qr'
import RecoveryCodes from '../components/RecoveryCodes.vue'
const { t, te } = useI18n()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const router = useRouter()
const password = ref('')
const code = ref('')
const secret = ref('')
const qr = ref('')
const codes = ref<string[]>([])
const busy = ref(false)
const error = ref<string | null>(null)
const operation = ref<'regenerate' | 'disable' | null>(null)
const proofMethod = ref<'password' | 'code'>('password')
const proofPassword = ref('')
const proofCode = ref('')
let revision = 0
let alive = true
let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const enabled = computed(() => auth.user?.totp_enabled === true)
const errorText = computed(() =>
  error.value === 'pendingExpired'
    ? t('pendingExpired')
    : t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// Pending只在目前view保留；移除timer及所有QR／secret／輸入。
function clearPending(): void {
  secret.value = ''
  qr.value = ''
  code.value = ''
  password.value = ''
  if (timer) clearTimeout(timer)
  timer = null
}
// 新操作會取消舊request與舊QR回應，不能讓過期secret回寫。
function begin(): number {
  controller?.abort()
  controller = new AbortController()
  error.value = null
  busy.value = true
  return ++revision
}
// 單次enrol後產生QR，只有仍在目前view的操作可以顯示。
async function enroll(): Promise<void> {
  const current = begin()
  const value = password.value
  clearPending()
  try {
    const pending = await auth.enroll(value, controller!.signal)
    const image = await buildQr(pending.otpauth_uri)
    if (!alive || current !== revision) return
    secret.value = pending.secret
    qr.value = image
    // UI也在有限期限清除，後端TTL仍為最終判斷。
    timer = setTimeout(
      () => {
        clearPending()
        error.value = 'pendingExpired'
      },
      10 * 60 * 1000,
    )
  } catch (failure) {
    if (alive && current === revision) error.value = auth.errorCode(failure)
  } finally {
    if (current === revision) {
      password.value = ''
      busy.value = false
    }
  }
}
// Confirm後不保留pending；失敗需要重新綁定，不能重用已消耗secret。
async function confirm(): Promise<void> {
  const current = begin()
  try {
    const result = await auth.confirm(code.value, controller!.signal)
    if (alive && current === revision) {
      clearPending()
      codes.value = result
    }
  } catch (failure) {
    if (alive && current === revision) {
      clearPending()
      error.value =
        auth.errorCode(failure) === 'invalid_mfa' ? 'pendingExpired' : auth.errorCode(failure)
    }
  } finally {
    if (current === revision) {
      code.value = ''
      busy.value = false
    }
  }
}
// 二次驗證成功才重產／停用，password/code從未進入持久化偏好。
async function applyOperation(): Promise<void> {
  if (!operation.value) return
  const selected = operation.value
  const current = begin()
  const proof =
    proofMethod.value === 'password' ? { password: proofPassword.value } : { code: proofCode.value }
  try {
    if (selected === 'regenerate') {
      const value = await auth.regenerate(proof, controller!.signal)
      if (alive && current === revision) {
        codes.value = value
        operation.value = null
      }
    } else {
      await auth.disable(proof, controller!.signal)
      await router.replace({ name: 'login', query: { message: 'disabledDone' } })
    }
  } catch (failure) {
    if (alive && current === revision) error.value = auth.errorCode(failure)
  } finally {
    proofPassword.value = ''
    proofCode.value = ''
    if (current === revision) busy.value = false
  }
}
// 取消敏感操作不保留輸入。
function cancelOperation(): void {
  operation.value = null
  proofPassword.value = ''
  proofCode.value = ''
  error.value = null
}
// 開啟二次驗證時不保留舊操作的輸入與錯誤。
function selectOperation(value: 'regenerate' | 'disable'): void {
  cancelOperation()
  operation.value = value
}
// 切換密碼／TOTP時清掉另一種憑證。
function selectProof(value: 'password' | 'code'): void {
  proofMethod.value = value
  proofPassword.value = ''
  proofCode.value = ''
}
// 使用者確認保存後立即清除一次性codes。
function clearCodes(): void {
  codes.value = []
}
// session失效或換身分不能留下上一個人的secret。
watch(
  () => [auth.phase, auth.user?.id],
  () => {
    if (auth.phase !== 'authenticated') {
      revision++
      controller?.abort()
      clearPending()
      clearCodes()
      cancelOperation()
    }
  },
)
// 離頁取消request／timer，延遲回應不能再顯示敏感資料。
onBeforeUnmount(() => {
  alive = false
  revision++
  controller?.abort()
  clearPending()
  clearCodes()
  cancelOperation()
})
</script>

<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('security') }}</h1>
        <p>{{ t('securityHint') }}</p>
      </div>
      <span
        class="status-pill"
        :class="enabled ? 'status-pill--success' : 'status-pill--warning'"
        >{{ t(enabled ? 'enabled' : 'disabled') }}</span
      >
    </div>
    <div
      v-if="auth.user?.mfa_enrollment_required"
      class="notice"
      role="status"
      data-testid="mfa-required"
    >
      {{ t('required') }}
    </div>
    <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
    <div class="security-grid">
      <aside class="card summary">
        <div class="summary-icon">MFA</div>
        <h2>{{ t('protection') }}</h2>
        <p>{{ t('protectionHint') }}</p>
        <span
          class="status-pill"
          :class="enabled ? 'status-pill--success' : 'status-pill--warning'"
          >{{ t(enabled ? 'enabled' : 'disabled') }}</span
        >
        <dl class="details">
          <dt>{{ t('user') }}</dt>
          <dd>{{ auth.user?.username }}</dd>
          <dt>{{ t('totp') }}</dt>
          <dd>{{ t('authenticator') }}</dd>
          <dt>{{ t('timeZone') }}</dt>
          <dd>{{ preferences.timeZone }}</dd>
        </dl>
      </aside>
      <div class="main-column">
        <section class="card">
          <div class="card-header">
            <h2>{{ t('enroll') }}</h2>
            <span class="status-pill">{{
              t(enabled ? 'enabled' : secret ? 'stepScan' : 'stepPassword')
            }}</span>
          </div>
          <div v-if="!enabled" class="card-body">
            <div class="steps">
              <span>{{ t('stepPassword') }}</span
              ><span>{{ t('stepScan') }}</span
              ><span>{{ t('stepSave') }}</span>
            </div>
            <form v-if="!secret" @submit.prevent="enroll">
              <label for="enroll-password">{{ t('currentPassword') }}</label
              ><input
                id="enroll-password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                minlength="12"
                maxlength="1024"
                required
                :disabled="busy"
              /><button class="primary" type="submit" :disabled="busy">
                {{ t(busy ? 'busy' : 'startEnroll') }}
              </button>
            </form>
            <div v-else class="enroll-grid">
              <div class="qr-panel">
                <img :src="qr" width="200" height="200" :alt="t('scan')" data-testid="totp-qr" />
              </div>
              <div>
                <h3>{{ t('scan') }}</h3>
                <p>{{ t('scanHint') }}</p>
                <details>
                  <summary>{{ t('manualKey') }}</summary>
                  <code class="secret-key" data-testid="manual-secret">{{ secret }}</code>
                </details>
                <form @submit.prevent="confirm">
                  <label for="enroll-code">{{ t('totp') }}</label
                  ><input
                    id="enroll-code"
                    v-model="code"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxlength="6"
                    required
                    :disabled="busy"
                  /><button class="primary" type="submit" :disabled="busy">
                    {{ t(busy ? 'busy' : 'confirm') }}
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div v-else class="card-body">
            <p class="success-message" data-testid="totp-enabled">{{ t('enabled') }}</p>
            <button
              class="danger"
              type="button"
              :disabled="busy"
              @click="selectOperation('disable')"
            >
              {{ t('disableTotp') }}
            </button>
          </div>
        </section>
        <section class="card">
          <div class="card-header">
            <h2>{{ t('recoveryTitle') }}</h2>
          </div>
          <div class="card-body">
            <p>{{ t('recoveryHint') }}</p>
            <p class="muted">{{ t('recoveryEmpty') }}</p>
            <button
              v-if="enabled"
              class="secondary"
              type="button"
              :disabled="busy"
              @click="selectOperation('regenerate')"
            >
              {{ t('regenerate') }}
            </button>
          </div>
        </section>
        <section v-if="operation" class="card" data-testid="reauth-panel">
          <div class="card-header">
            <h2>{{ t('reauth') }}</h2>
          </div>
          <div class="card-body">
            <p class="notice">
              {{ t(operation === 'regenerate' ? 'regenerateWarning' : 'disableWarning') }}
            </p>
            <form @submit.prevent="applyOperation">
              <div class="choice-buttons">
                <button
                  type="button"
                  :aria-pressed="proofMethod === 'password'"
                  @click="selectProof('password')"
                >
                  {{ t('password') }}</button
                ><button
                  type="button"
                  :aria-pressed="proofMethod === 'code'"
                  @click="selectProof('code')"
                >
                  {{ t('totp') }}
                </button>
              </div>
              <template v-if="proofMethod === 'password'"
                ><label for="proof-password">{{ t('currentPassword') }}</label
                ><input
                  id="proof-password"
                  v-model="proofPassword"
                  type="password"
                  autocomplete="current-password"
                  minlength="12"
                  maxlength="1024"
                  required
                  :disabled="busy" /></template
              ><template v-else
                ><label for="proof-code">{{ t('totp') }}</label
                ><input
                  id="proof-code"
                  v-model="proofCode"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxlength="6"
                  required
                  :disabled="busy"
              /></template>
              <div class="button-row">
                <button class="primary" type="submit" :disabled="busy">
                  {{ t(busy ? 'busy' : 'apply') }}</button
                ><button class="secondary" type="button" :disabled="busy" @click="cancelOperation">
                  {{ t('cancel') }}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
    <RecoveryCodes v-if="codes.length" :codes="codes" @close="clearCodes" />
  </main>
</template>
