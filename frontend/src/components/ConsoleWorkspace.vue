<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const props = defineProps<{ focused: boolean }>()
const emit = defineEmits<{ 'update:focused': [value: boolean] }>()
const { t } = useI18n()

// 只發布局意圖，外層保留Canvas、IME、連線與資源所有權。
function toggleFocus(): void {
  emit('update:focused', !props.focused)
}
</script>
<template>
  <main class="app-main console-workspace" :class="{ 'console-workspace--focused': focused }">
    <div class="console-workspace-heading">
      <slot name="heading" />
      <button
        type="button"
        data-testid="console-focus-mode"
        :aria-pressed="focused"
        @click="toggleFocus"
      >
        {{ t(focused ? 'consoleUI.exitFocusMode' : 'consoleUI.focusMode') }}
      </button>
    </div>
    <section class="card console-workspace-panel">
      <div class="console-workspace-toolbar"><slot name="toolbar" /></div>
      <div class="console-workspace-status"><slot name="status" /></div>
      <div class="console-workspace-surface"><slot /></div>
    </section>
  </main>
</template>
