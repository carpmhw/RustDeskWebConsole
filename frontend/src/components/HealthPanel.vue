<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { HttpClient } from '../api/client'
import { runtimeBase } from '../utils/basePath'
import { formatTimestamp, displayTimeZones } from '../utils/dateTime'
import { usePreferencesStore } from '../stores/preferences'
const { t } = useI18n()
const preferences = usePreferencesStore()
const status = ref('checking')
const timestamp = ref<string | null>(null)
const zones = computed(() => displayTimeZones(preferences.timeZone))
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
// 更新非敏感時區偏好，UTC資料不變。
function changeZone(event: Event): void {
  preferences.setTimeZone((event.target as HTMLSelectElement).value)
}
onMounted(loadHealth)
</script>
<template>
  <section class="card health-card">
    <div class="card-header">
      <h2>{{ t('healthTitle') }}</h2>
      <span class="status-pill" data-testid="health-status">{{ t(status) }}</span>
    </div>
    <div class="card-body">
      <dl class="details">
        <dt>{{ t('basePath') }}</dt>
        <dd>{{ runtimeBase() || '/' }}</dd>
        <dt>{{ t('checkedAt') }}</dt>
        <dd data-testid="timestamp">{{ formatted }}</dd>
      </dl>
      <label for="timezone">{{ t('timeZone') }}</label
      ><select id="timezone" :value="preferences.timeZone" @change="changeZone">
        <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
      </select>
      <button class="secondary" type="button" @click="loadHealth">{{ t('checkAgain') }}</button>
    </div>
  </section>
</template>
