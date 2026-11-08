<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'

// required：首次登入必須改密碼（頁面另有標題）；voluntary：帳號安全頁自行變更。
const props = defineProps<{ mode: 'required' | 'voluntary' }>()
const emit = defineEmits<{ changed: [] }>()
const { t, te } = useI18n()
const auth = useAuthStore()
const current = ref('')
const next = ref('')
const confirmation = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref(false)
let controller: AbortController | null = null
const errorText = computed(() =>
  error.value === 'mismatch'
    ? t('passwordUI.mismatch')
    : t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
const prefix = computed(() => (props.mode === 'required' ? 'required' : 'change'))
// 密碼只存在本元件的短命 ref，送出或離開後一律清空。
function clear(): void {
  current.value = ''
  next.value = ''
  confirmation.value = ''
}
// 先在本地比對兩次新密碼，不一致時不送出；成功後通知頁面處理導向。
async function submit(): Promise<void> {
  done.value = false
  if (next.value !== confirmation.value) {
    error.value = 'mismatch'
    confirmation.value = ''
    return
  }
  error.value = null
  busy.value = true
  controller?.abort()
  controller = new AbortController()
  const values = [current.value, next.value] as const
  clear()
  try {
    await auth.changePassword(values[0], values[1], controller.signal)
    done.value = true
    emit('changed')
  } catch (failure) {
    const code = auth.errorCode(failure)
    if (code !== 'cancelled') error.value = code
  } finally {
    busy.value = false
  }
}
// 離開頁面時取消進行中的請求並清除輸入。
onBeforeUnmount(() => {
  controller?.abort()
  clear()
})
</script>
<template>
  <section class="card" data-testid="change-password">
    <div v-if="mode === 'voluntary'" class="card-header">
      <h2>{{ t('passwordUI.changeTitle') }}</h2>
      <p>{{ t('passwordUI.changeHint') }}</p>
    </div>
    <div class="card-body">
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <p v-if="done && mode === 'voluntary'" class="success-message" role="status">
        {{ t('passwordUI.changed') }}
      </p>
      <form @submit.prevent="submit">
        <label :for="prefix + '-current-password'">{{ t('currentPassword') }}</label
        ><input
          :id="prefix + '-current-password'"
          v-model="current"
          type="password"
          autocomplete="current-password"
          minlength="12"
          maxlength="1024"
          required
        />
        <label :for="prefix + '-new-password'">{{ t('passwordUI.newPassword') }}</label
        ><input
          :id="prefix + '-new-password'"
          v-model="next"
          type="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="1024"
          required
        />
        <label :for="prefix + '-confirm-password'">{{ t('passwordUI.confirmPassword') }}</label
        ><input
          :id="prefix + '-confirm-password'"
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="1024"
          required
        />
        <p class="hint">{{ t('passwordUI.lengthHint') }}</p>
        <button class="primary" type="submit" :disabled="busy">
          {{
            busy
              ? t('busy')
              : t(mode === 'required' ? 'passwordUI.submitRequired' : 'passwordUI.submitChange')
          }}
        </button>
      </form>
    </div>
  </section>
</template>
