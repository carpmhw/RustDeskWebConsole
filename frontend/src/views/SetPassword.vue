<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import ChangePassword from '../components/ChangePassword.vue'

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()
// 設定完成後若仍需綁定雙重驗證則接續到帳號安全頁，否則回概覽。
function proceed(): void {
  void router.replace({ name: auth.user?.mfa_enrollment_required ? 'security' : 'overview' })
}
</script>
<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('passwordUI.requiredTitle') }}</h1>
        <p>{{ t('passwordUI.requiredHint') }}</p>
      </div>
    </div>
    <ChangePassword mode="required" @changed="proceed" />
  </main>
</template>
