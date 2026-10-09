<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { RevealLease, type RevealPayload } from '../utils/reveal'
const props = defineProps<{ targetId: string; name: string }>()
const emit = defineEmits<{ close: [] }>()
const { t, te } = useI18n()
const auth = useAuthStore()
const dialog = ref<HTMLDialogElement | null>(null)
const lease = new RevealLease()
const value = ref('')
const remaining = ref(0)
const method = ref<'password' | 'code'>('password')
const password = ref('')
const code = ref('')
const busy = ref(false)
const hidden = ref(false)
const error = ref<string | null>(null)
let alive = true
let controller: AbortController | null = null
let timer: ReturnType<typeof setInterval> | null = null
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// 到期／退出／換目標清所有私密ref，同時作廢尚未抵達的回應。
function erase(): void {
  controller?.abort()
  lease.clear()
  value.value = ''
  remaining.value = 0
  password.value = ''
  code.value = ''
  busy.value = false
  if (timer) clearInterval(timer)
  timer = null
}
// 每次以實際deadline讀取，不因背景timer節流而延長。
function refreshValue(): void {
  value.value = lease.read()
  remaining.value = lease.remaining()
  if (!value.value) {
    erase()
    hidden.value = true
  }
}
// 先proof再取得當次明文，response及秘密不進Pinia／persistent storage。
async function reveal(): Promise<void> {
  if (busy.value) return
  const proof = method.value === 'password' ? { password: password.value } : { code: code.value }
  erase()
  const revision = lease.begin()
  const request = new AbortController()
  controller = request
  busy.value = true
  hidden.value = false
  error.value = null
  try {
    const result = await auth.request<RevealPayload>(
      'api/v1/targets/' + props.targetId + '/password/reveal',
      'POST',
      proof,
      request.signal,
    )
    if (!alive || !lease.accept(revision, result)) return
    refreshValue()
    timer = setInterval(refreshValue, 250)
  } catch (failure) {
    if (alive && controller === request && !request.signal.aborted)
      error.value = auth.errorCode(failure)
  } finally {
    if (controller === request) {
      password.value = ''
      code.value = ''
      if (alive) busy.value = false
    }
  }
}
// 切換proof不保留另一種輸入。
function selectMethod(next: 'password' | 'code'): void {
  erase()
  method.value = next
  hidden.value = false
  error.value = null
}
// Esc與關閉都先清RAM再通知父層卸載。
function close(): void {
  erase()
  emit('close')
}
// 使用者把頁面切至背景時立即遮蔽，不能等待下一次timer。
function visibilityChanged(): void {
  if (document.hidden) {
    erase()
    hidden.value = true
  }
}
// 換身分／登出時父層即使仍在頁面也清除。
watch(() => [auth.phase, auth.user?.id], close)
// 新選目標不沿用上一個顯示值。
watch(() => props.targetId, close)
onMounted(() => {
  dialog.value?.showModal()
  document.addEventListener('visibilitychange', visibilityChanged)
})
// 離頁取消request／timer／DOM與listener。
onBeforeUnmount(() => {
  alive = false
  erase()
  document.removeEventListener('visibilitychange', visibilityChanged)
  dialog.value?.close()
})
</script>
<template>
  <Teleport to="body"
    ><dialog ref="dialog" class="management-dialog" aria-labelledby="reveal-title" @cancel="close">
      <h2 id="reveal-title">{{ t('targetUI.reveal') }} · {{ name }}</h2>
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <template v-if="value"
        ><label for="revealed-password">{{ t('targetUI.fixedPassword') }}</label
        ><input
          id="revealed-password"
          :value="value"
          readonly
          autocomplete="off"
          data-testid="revealed-password"
        />
        <p class="notice" role="status">
          {{ t('targetUI.secondsRemaining', { seconds: remaining }) }}
        </p></template
      >
      <form v-else @submit.prevent="reveal">
        <p v-if="hidden" class="notice" role="status">{{ t('targetUI.autoHidden') }}</p>
        <div class="choice-buttons">
          <button
            type="button"
            :disabled="busy"
            :aria-pressed="method === 'password'"
            @click="selectMethod('password')"
          >
            {{ t('password') }}</button
          ><button
            type="button"
            :disabled="busy"
            :aria-pressed="method === 'code'"
            @click="selectMethod('code')"
          >
            {{ t('totp') }}
          </button>
        </div>
        <template v-if="method === 'password'"
          ><label for="reveal-proof-password">{{ t('currentPassword') }}</label
          ><input
            id="reveal-proof-password"
            v-model="password"
            type="password"
            required
            minlength="12"
            maxlength="1024"
            autocomplete="current-password"
            :disabled="busy" /></template
        ><template v-else
          ><label for="reveal-proof-code">{{ t('totp') }}</label
          ><input
            id="reveal-proof-code"
            v-model="code"
            required
            pattern="[0-9]{6}"
            maxlength="6"
            inputmode="numeric"
            autocomplete="one-time-code"
            :disabled="busy" /></template
        ><button class="primary" type="submit" :disabled="busy">
          {{ t(busy ? 'busy' : 'targetUI.verifyReveal') }}
        </button>
      </form>
      <div class="button-row">
        <button class="secondary" type="button" @click="close">{{ t('targetUI.close') }}</button>
      </div>
    </dialog></Teleport
  >
</template>
