<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { HttpClient } from '../api/client'
import { runtimeBase } from '../utils/basePath'
import { formatTimestamp } from '../utils/dateTime'
import { usePreferencesStore } from '../stores/preferences'
const { t } = useI18n()
const preferences = usePreferencesStore()
const status = ref('checking')
const timestamp = ref<string | null>(null)
const formatted = computed(() =>
  formatTimestamp(timestamp.value, preferences.timeZone, preferences.locale),
)
// 健康端點不使用登入憑證，失敗只顯示分類狀態。
async function loadHealth(): Promise<void> {
  status.value = 'checking'
  try {
    const health = await new HttpClient().send<{ status: string; timestamp: string }>(
      'api/v1/health',
    )
    status.value = health.status === 'ok' ? 'healthOk' : 'healthUnavailable'
    timestamp.value = health.timestamp
  } catch {
    status.value = 'healthOffline'
    timestamp.value = null
  }
}
onMounted(loadHealth)
</script>
<template>
  <section class="card health-card">
    <div class="card-header">
      <h2>{{ t('healthTitle') }}</h2>
      <span
        class="status-pill"
        :class="
          status === 'healthOk'
            ? 'status-pill--success'
            : status === 'checking'
              ? 'status-pill--neutral'
              : 'status-pill--warning'
        "
        data-testid="health-status"
        >{{ t(status) }}</span
      >
    </div>
    <div class="card-body">
      <dl class="details">
        <dt>{{ t('basePath') }}</dt>
        <dd>{{ runtimeBase() || '/' }}</dd>
        <dt>{{ t('checkedAt') }}</dt>
        <dd data-testid="timestamp">{{ formatted }}</dd>
      </dl>
      <button class="secondary" type="button" @click="loadHealth">{{ t('checkAgain') }}</button>
    </div>
  </section>
</template>
