<script setup lang="ts">
defineOptions({ name: 'OverviewView' })
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import HealthPanel from '../components/HealthPanel.vue'
const { t } = useI18n()
const auth = useAuthStore()
// 入口只列目前角色可用的頁面；伺服器、使用者、稽核與連線僅限管理員。
const entries = computed(() => [
  { name: 'targets', label: 'targets' },
  { name: 'security', label: 'security' },
  { name: 'preferences', label: 'preferences' },
  ...(auth.user?.role === 'admin'
    ? [
        { name: 'servers', label: 'servers' },
        { name: 'users', label: 'usersUI.nav' },
        { name: 'audit', label: 'auditUI.nav' },
        { name: 'connections', label: 'connectionsUI.nav' },
      ]
    : []),
])
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
          <nav :aria-label="t('workspace')">
            <ul class="entry-list">
              <li v-for="entry in entries" :key="entry.name">
                <RouterLink :to="{ name: entry.name }">{{ t(entry.label) }}</RouterLink>
                <p>{{ t('overviewUI.' + entry.name) }}</p>
              </li>
            </ul>
          </nav>
        </div>
      </section>
      <HealthPanel />
    </div>
  </main>
</template>
