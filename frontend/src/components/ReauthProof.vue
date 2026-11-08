<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// 管理操作的再次驗證欄位：以目前密碼或驗證碼擇一，值只存在呼叫端的短命 ref。
defineProps<{ idPrefix: string; disabled?: boolean }>()
const method = defineModel<'password' | 'code'>('method', { required: true })
const password = defineModel<string>('password', { required: true })
const code = defineModel<string>('code', { required: true })
const { t } = useI18n()
</script>
<template>
  <div data-testid="reauth-proof">
    <div class="choice-buttons">
      <button
        type="button"
        :aria-pressed="method === 'password'"
        :disabled="disabled"
        @click="method = 'password'"
      >
        {{ t('password') }}</button
      ><button
        type="button"
        :aria-pressed="method === 'code'"
        :disabled="disabled"
        @click="method = 'code'"
      >
        {{ t('totp') }}
      </button>
    </div>
    <template v-if="method === 'password'">
      <label :for="idPrefix + '-proof-password'">{{ t('currentPassword') }}</label
      ><input
        :id="idPrefix + '-proof-password'"
        v-model="password"
        type="password"
        autocomplete="current-password"
        minlength="12"
        maxlength="1024"
        required
        :disabled="disabled"
      />
    </template>
    <template v-else>
      <label :for="idPrefix + '-proof-code'">{{ t('totp') }}</label
      ><input
        :id="idPrefix + '-proof-code'"
        v-model="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9]{6}"
        required
        :disabled="disabled"
      />
    </template>
  </div>
</template>
