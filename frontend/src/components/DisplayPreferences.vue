<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '../stores/preferences'
import { displayTimeZones } from '../utils/dateTime'
import type { ColorMode } from '../utils/theme'

const { t } = useI18n()
const preferences = usePreferencesStore()
const id = useId()
const modes: ColorMode[] = ['light', 'dark', 'system']
// 沿原時區工具保留合法別名，不因Intl列表缺少目前值而清空選項。
const zones = computed(() => displayTimeZones(preferences.timeZone))

// 只接受已支援的兩語系，未知DOM事件恢復目前選擇而不污染store。
function changeLocale(event: Event): void {
  const select = event.target as HTMLSelectElement
  if (select.value === 'zh-TW' || select.value === 'en') preferences.setLocale(select.value)
  else select.value = preferences.locale
}

// 只有原工具提供的時區才能保存，格式或選項失效時保留當次值。
function changeZone(event: Event): void {
  const select = event.target as HTMLSelectElement
  if (zones.value.includes(select.value)) preferences.setTimeZone(select.value)
  else select.value = preferences.timeZone
}
</script>

<template>
  <section class="display-preferences" :aria-label="t('preferences')">
    <fieldset>
      <legend>{{ t('theme') }}</legend>
      <div class="choice-buttons">
        <button
          v-for="mode in modes"
          :key="mode"
          type="button"
          :data-theme-choice="mode"
          :aria-pressed="preferences.colorMode === mode"
          @click="preferences.setColorMode(mode)"
        >
          {{ t(mode) }}
        </button>
      </div>
    </fieldset>
    <div>
      <label :for="id + '-locale'">{{ t('language') }}</label>
      <select :id="id + '-locale'" :value="preferences.locale" @change="changeLocale">
        <option value="zh-TW">繁中</option>
        <option value="en">English</option>
      </select>
    </div>
    <div>
      <label :for="id + '-timezone'">{{ t('timeZone') }}</label>
      <select :id="id + '-timezone'" :value="preferences.timeZone" @change="changeZone">
        <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
      </select>
    </div>
  </section>
</template>

<style scoped>
.display-preferences {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
fieldset {
  padding: 0;
  margin: 0;
  border: 0;
  min-width: 0;
}
legend {
  padding: 0;
  font-size: 14px;
  font-weight: 600;
}
.choice-buttons {
  margin: var(--space-1) 0 0;
}
.choice-buttons button {
  font-size: 14px;
}
label {
  margin: 0 0 var(--space-1);
}
select {
  width: 100%;
  min-width: 0;
}
</style>
