<script setup lang="ts">
defineOptions({ name: 'PreferencesView' })
import { useI18n } from 'vue-i18n'
import HealthPanel from '../components/HealthPanel.vue'
import DisplayPreferences from '../components/DisplayPreferences.vue'
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
    <div class="preferences-grid">
      <section class="card">
        <div class="card-header">
          <h2>{{ t('appearance') }}</h2>
        </div>
        <div class="card-body"><DisplayPreferences /></div>
      </section>
      <HealthPanel />
    </div>
  </main>
</template>
