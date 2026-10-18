<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import { useAuthStore } from './stores/auth'
const { t, te } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const insecure = !window.isSecureContext
const consoleFocusMode = ref(false)
// 只接受目前已登入主控台的布局意圖，不建立可持久化或跨頁的敏感狀態。
function setConsoleFocusMode(value: boolean): void {
  consoleFocusMode.value =
    value &&
    router.currentRoute.value.name === 'console' &&
    auth.phase === 'authenticated' &&
    !auth.user?.mfa_enrollment_required
}
// 任何路由／目標變更都恢復管理導覽，不留上一頁的專注外觀。
watch(
  () => router.currentRoute.value.fullPath,
  () => {
    consoleFocusMode.value = false
  },
)
// 跨分頁撤銷與MFA限制也會觸發安全導向，不只在點擊導覽時判斷。
watch(
  () => [auth.phase, auth.user?.mfa_enrollment_required],
  () => {
    if (auth.phase !== 'authenticated' || auth.user?.mfa_enrollment_required)
      consoleFocusMode.value = false
    if (auth.phase === 'anonymous' && router.currentRoute.value.meta.auth)
      void router.replace({ name: 'login' })
    if (
      auth.phase === 'authenticated' &&
      auth.user?.mfa_enrollment_required &&
      router.currentRoute.value.name !== 'security'
    )
      void router.replace({ name: 'security' })
  },
)
</script>
<template>
  <AppHeader v-show="!consoleFocusMode" />
  <p v-if="insecure" class="global-notice notice" role="status">{{ t('insecure') }}</p>
  <p v-if="auth.notice" class="global-notice error-message" role="alert">
    {{ t(te('errors.' + auth.notice) ? 'errors.' + auth.notice : 'errors.service_unavailable') }}
  </p>
  <p v-if="auth.phase === 'unknown'" class="loading" role="status">{{ t('restoring') }}</p>
  <RouterView v-else v-slot="{ Component }">
    <component :is="Component" @focus-mode-change="setConsoleFocusMode" />
  </RouterView>
  <footer class="app-footer">
    <span>{{ t('utc') }}</span
    ><a href="https://github.com/carpmhw/RustDeskWebConsole" rel="noopener noreferrer">{{
      t('source')
    }}</a>
  </footer>
</template>
