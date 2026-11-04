<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import DisplayPreferences from './DisplayPreferences.vue'
const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const navigationOpen = ref(false)
// 換頁後收合本機導覽，不改認證或路由守衛。
watch(
  () => router.currentRoute.value.fullPath,
  () => {
    navigationOpen.value = false
  },
)
// 本機先匿名，遠端失敗由notice與重試入口回報。
async function logout(): Promise<void> {
  await auth.logout()
  await router.replace({ name: 'login' })
}
// 窄螢幕明確開關導覽，不能靠橫向溢出顯示被擠掉的入口。
function toggleNavigation(): void {
  navigationOpen.value = !navigationOpen.value
}
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <div class="brand">
        <span class="brand-mark">RD</span>
        <div>
          <strong>{{ t('brand') }}</strong>
        </div>
      </div>
      <button
        v-if="auth.phase === 'authenticated'"
        type="button"
        class="navigation-toggle"
        data-testid="navigation-toggle"
        :aria-expanded="navigationOpen"
        aria-controls="app-navigation"
        @click="toggleNavigation"
      >
        {{ t('navigation') }}
      </button>
      <nav
        v-if="auth.phase === 'authenticated'"
        id="app-navigation"
        class="app-nav"
        :class="{ 'is-open': navigationOpen }"
        :aria-label="t('navigation')"
      >
        <RouterLink v-if="!auth.user?.mfa_enrollment_required" :to="{ name: 'overview' }">{{
          t('overview')
        }}</RouterLink>
        <RouterLink :to="{ name: 'security' }">{{ t('security') }}</RouterLink>
        <RouterLink v-if="!auth.user?.mfa_enrollment_required" :to="{ name: 'targets' }">{{
          t('targets')
        }}</RouterLink>
        <RouterLink
          v-if="!auth.user?.mfa_enrollment_required && auth.user?.role === 'admin'"
          :to="{ name: 'servers' }"
          >{{ t('servers') }}</RouterLink
        >
        <RouterLink v-if="!auth.user?.mfa_enrollment_required" :to="{ name: 'preferences' }">{{
          t('preferences')
        }}</RouterLink>
      </nav>
      <div class="header-actions">
        <details
          v-if="auth.phase !== 'authenticated' || auth.user?.mfa_enrollment_required"
          class="appearance-menu"
          data-testid="appearance-menu"
        >
          <summary>{{ t('appearance') }}</summary>
          <DisplayPreferences />
        </details>
        <button
          v-if="auth.phase === 'authenticated' || auth.logoutPending"
          type="button"
          class="text-button"
          data-testid="logout"
          @click="logout"
        >
          {{ t('logout') }}
        </button>
      </div>
    </div>
  </header>
</template>
