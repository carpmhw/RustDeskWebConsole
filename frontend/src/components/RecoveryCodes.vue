<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
const props = defineProps<{ codes: string[] }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)
// Native dialog 提供焦點限制與Escape，不複製祕密到額外視窗。
onMounted(() => dialog.value?.showModal())
// 使用者按下下載才產生短命Blob，下載後立即撤銷URL。
function download(): void {
  const url = URL.createObjectURL(
    new Blob(['RustDesk Web Console recovery codes\n\n' + props.codes.join('\n') + '\n'], {
      type: 'text/plain;charset=utf-8',
    }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'rustdesk-recovery-codes.txt'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
// 只列印這個dialog，樣式來自外部CSS而不產生inline script/style。
function print(): void {
  document.body.dataset.printing = 'recovery'
  try {
    window.print()
  } finally {
    delete document.body.dataset.printing
  }
}
// 關閉回傳清除指令，父層移除短命codes。
function close(): void {
  emit('close')
}
// 離頁不留下瀏覽器dialog或列印標記。
onBeforeUnmount(() => {
  dialog.value?.close()
  delete document.body.dataset.printing
})
</script>
<template>
  <Teleport to="body"
    ><dialog ref="dialog" class="recovery-dialog" aria-labelledby="recovery-title" @cancel="close">
      <h2 id="recovery-title">{{ t('recoveryTitle') }}</h2>
      <p class="recovery-note">{{ t('codesOnce') }}</p>
      <ol class="recovery-list" data-testid="recovery-codes">
        <li v-for="item in codes" :key="item">{{ item }}</li>
      </ol>
      <div class="recovery-actions">
        <button class="secondary" type="button" @click="download">{{ t('download') }}</button
        ><button class="secondary" type="button" @click="print">{{ t('print') }}</button
        ><button class="primary" type="button" data-testid="codes-saved" @click="close">
          {{ t('saved') }}
        </button>
      </div>
    </dialog></Teleport
  >
</template>
