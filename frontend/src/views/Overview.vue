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
    <HealthPanel />
  </main>
</template>
