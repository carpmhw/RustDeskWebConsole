<script setup lang="ts">
defineOptions({ name: 'PreferencesView' })
import { useI18n } from 'vue-i18n'
import HealthPanel from '../components/HealthPanel.vue'
const { t } = useI18n()
</script>
<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('preferences') }}</h1>
        <p>{{ t('preferencesHint') }}</p>
      </div>
    </div>
    <HealthPanel />
  </main>
</template>
