<script setup lang="ts">
defineOptions({ name: 'OverviewView' })
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import HealthPanel from '../components/HealthPanel.vue'
const { t } = useI18n()
const auth = useAuthStore()
</script>
<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('overview') }}</h1>
        <p>
          {{ t('user') }}：{{ auth.user?.username }} ·
          {{ auth.user ? t('roles.' + auth.user.role) : '' }}
        </p>
      </div>
    </div>
    <div class="overview-grid">
      <section class="card">
        <div class="card-header">
          <h2>{{ t('workspace') }}</h2>
        </div>
        <div class="card-body">
          <p class="muted">{{ t('workspaceHint') }}</p>
          <nav class="workspace-links" :aria-label="t('workspace')">
            <RouterLink :to="{ name: 'targets' }">{{ t('targets') }}</RouterLink>
            <RouterLink :to="{ name: 'security' }">{{ t('security') }}</RouterLink>
            <RouterLink :to="{ name: 'preferences' }">{{ t('preferences') }}</RouterLink>
            <RouterLink v-if="auth.user?.role === 'admin'" :to="{ name: 'servers' }">{{
              t('servers')
            }}</RouterLink>
          </nav>
        </div>
      </section>
      <HealthPanel />
    </div>
  </main>
</template>
