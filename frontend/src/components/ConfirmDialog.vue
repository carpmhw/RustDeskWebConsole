<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
// 破壞性操作共用的原生 modal 確認框：取代 window.confirm，套用站內主題並把初始焦點放在安全的取消鈕。
defineProps<{ title: string; confirmLabel: string }>()
const { t } = useI18n()
const titleId = useId()
const dialog = ref<HTMLDialogElement | null>(null)
const message = ref('')
let settle: ((confirmed: boolean) => void) | null = null

// 以 showModal 開啟並等待選擇；Esc、返回手勢或取消皆視為未確認。
function ask(text: string): Promise<boolean> {
  message.value = text
  dialog.value!.returnValue = ''
  dialog.value!.showModal()
  return new Promise((resolve) => {
    settle = resolve
  })
}
// 依 returnValue 判斷是否確認，並立即重設，避免舊值延續到下一次以 Esc 關閉。
function closed(): void {
  const confirmed = dialog.value!.returnValue === 'confirm'
  dialog.value!.returnValue = ''
  settle?.(confirmed)
  settle = null
}
defineExpose({ ask })
</script>

<template>
  <dialog ref="dialog" class="management-dialog" :aria-labelledby="titleId" @close="closed">
    <h2 :id="titleId">{{ title }}</h2>
    <p>{{ message }}</p>
    <form method="dialog" class="button-row">
      <button value="confirm" class="danger">{{ confirmLabel }}</button>
      <button value="cancel" autofocus>{{ t('cancel') }}</button>
    </form>
  </dialog>
</template>
