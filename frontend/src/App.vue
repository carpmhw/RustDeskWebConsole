<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import { useAuthStore } from './stores/auth'
const { t, te } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const insecure = !window.isSecureContext
// 跨分頁撤銷與MFA限制也會觸發安全導向，不只在點擊導覽時判斷。
watch(
  () => [auth.phase, auth.user?.mfa_enrollment_required],
  () => {
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
  <AppHeader />
  <p v-if="insecure" class="global-notice notice" role="status">{{ t('insecure') }}</p>
  <p v-if="auth.notice" class="global-notice error-message" role="alert">
    {{ t(te('errors.' + auth.notice) ? 'errors.' + auth.notice : 'errors.service_unavailable') }}
  </p>
  <p v-if="auth.phase === 'unknown'" class="loading" role="status">{{ t('restoring') }}</p>
  <RouterView v-else />
  <footer class="app-footer">
    <span>{{ t('utc') }}</span
    ><a href="https://github.com/carpmhw/RustDeskWebConsole" rel="noopener noreferrer">{{
      t('source')
    }}</a>
  </footer>
</template>
