<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { usePreferencesStore } from '../stores/preferences'
import type { ColorMode } from '../utils/theme'
import type { Locale } from '../i18n'
const { t } = useI18n()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const router = useRouter()
const modes: ColorMode[] = ['light', 'dark', 'system']
// 本機先匿名，遠端失敗由notice與重試入口回報。
async function logout(): Promise<void> {
  await auth.logout()
  await router.replace({ name: 'login' })
}
// 語言只能選擇已提供的兩個locale。
function changeLocale(event: Event): void {
  preferences.setLocale((event.target as HTMLSelectElement).value as Locale)
}
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <div class="brand">
        <span class="brand-mark">RD</span>
        <div>
          <strong>{{ t('brand') }}</strong
          ><small>REMOTE ACCESS, SIMPLIFIED</small>
        </div>
      </div>
      <nav v-if="auth.phase === 'authenticated'" class="app-nav" :aria-label="t('overview')">
        <RouterLink v-if="!auth.user?.mfa_enrollment_required" :to="{ name: 'overview' }">{{
          t('overview')
        }}</RouterLink>
        <RouterLink :to="{ name: 'security' }">{{ t('security') }}</RouterLink>
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
        <select :aria-label="t('language')" :value="preferences.locale" @change="changeLocale">
          <option value="zh-TW">繁中</option>
          <option value="en">English</option>
        </select>
        <div class="theme-buttons" role="group" :aria-label="t('theme')">
          <button
            v-for="mode in modes"
            :key="mode"
            type="button"
            :aria-pressed="preferences.colorMode === mode"
            :data-theme-choice="mode"
            @click="preferences.setColorMode(mode)"
          >
            {{ t(mode) }}
          </button>
        </div>
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
