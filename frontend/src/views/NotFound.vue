<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
<template>
  <main class="app-main">
    <section class="card card-body empty-state">
      <h1>{{ t('notFound') }}</h1>
      <RouterLink class="primary" :to="{ name: 'overview' }">{{ t('goHome') }}</RouterLink>
    </section>
  </main>
</template>
