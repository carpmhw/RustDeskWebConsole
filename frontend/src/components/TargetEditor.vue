<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import type { AvailableServer, TargetRow } from '../api/management'
const props = defineProps<{ target: TargetRow | null; servers: AvailableServer[] }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t, te } = useI18n()
const auth = useAuthStore()
const dialog = ref<HTMLDialogElement | null>(null)
const row = props.target
const draft = ref({
  name: row?.name ?? '',
  server_id: row?.server_id ?? props.servers[0]?.id ?? '',
  rustdesk_id: row?.rustdesk_id ?? '',
  group_name: row?.group_name ?? '',
  tags: row?.tags.join(', ') ?? '',
  notes: row?.notes ?? '',
  version: row?.version ?? 0,
})
const passwordMode = ref<'keep' | 'replace' | 'clear'>('keep')
const password = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const controller = new AbortController()
let alive = true
const unavailable = computed(
  () => row && !props.servers.some((server) => server.id === row.server_id),
)
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// 選不同密碼語意時立即清輸入，不讀reveal明文或預填祕密。
function changePasswordMode(event: Event): void {
  passwordMode.value = (event.target as HTMLSelectElement).value as 'keep' | 'replace' | 'clear'
  password.value = ''
}
// Metadata與Version副本送API；password只取當次短命ref。
async function save(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  const tags = draft.value.tags
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (tags.length > 20 || tags.some((value) => value.length > 32)) {
    error.value = 'invalid_request'
    busy.value = false
    password.value = ''
    return
  }
  const payload = {
    ...draft.value,
    group_name: draft.value.group_name || null,
    tags,
    notes: draft.value.notes || null,
    password:
      passwordMode.value === 'replace'
        ? password.value
        : passwordMode.value === 'clear'
          ? ''
          : null,
  }
  try {
    await auth.request(
      props.target ? 'api/v1/targets/' + props.target.id : 'api/v1/targets',
      props.target ? 'PUT' : 'POST',
      payload,
      controller.signal,
    )
    if (alive) emit('saved')
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    password.value = ''
    if (alive) busy.value = false
  }
}
// 關閉不保留密碼或表單副本。
function close(): void {
  password.value = ''
  emit('close')
}
onMounted(() => dialog.value?.showModal())
// 離頁取消與清除；彈窗不會被晚到的回應重新開啟。
onBeforeUnmount(() => {
  alive = false
  controller.abort()
  password.value = ''
  dialog.value?.close()
})
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      class="management-dialog"
      aria-labelledby="target-editor-title"
      @cancel="close"
    >
      <h2 id="target-editor-title">
        {{ t(target ? 'targetUI.editTarget' : 'targetUI.addTarget') }}
      </h2>
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <form @submit.prevent="save">
        <div class="form-grid">
          <div>
            <label for="target-name">{{ t('targetUI.name') }}</label
            ><input
              id="target-name"
              v-model="draft.name"
              required
              maxlength="128"
              :disabled="busy"
            />
          </div>
          <div>
            <label for="target-server">{{ t('targetUI.server') }}</label
            ><select id="target-server" v-model="draft.server_id" required :disabled="busy">
              <option value="" disabled>{{ t('targetUI.chooseServer') }}</option>
              <option v-for="server in servers" :key="server.id" :value="server.id">
                {{ server.name }}
              </option>
              <option v-if="unavailable && target" :value="target.server_id">
                {{ t('targetUI.unavailableServer') }} · {{ target.server_id }}
              </option>
            </select>
          </div>
          <div>
            <label for="rustdesk-id">RustDesk ID</label
            ><input
              id="rustdesk-id"
              v-model="draft.rustdesk_id"
              required
              maxlength="64"
              pattern="[A-Za-z0-9_-]+"
              :disabled="busy"
            />
          </div>
          <div>
            <label for="target-group">{{ t('targetUI.group') }}</label
            ><input id="target-group" v-model="draft.group_name" maxlength="64" :disabled="busy" />
          </div>
        </div>
        <label for="target-tags">{{ t('targetUI.tags') }}</label
        ><input id="target-tags" v-model="draft.tags" :disabled="busy" /><label
          for="target-notes"
          >{{ t('manage.notes') }}</label
        ><textarea
          id="target-notes"
          v-model="draft.notes"
          maxlength="2000"
          :disabled="busy"
        ></textarea
        ><label for="password-mode">{{ t('targetUI.passwordMode') }}</label
        ><select
          id="password-mode"
          :value="passwordMode"
          :disabled="busy"
          @change="changePasswordMode"
        >
          <option value="keep">{{ t('targetUI.keepPassword') }}</option>
          <option value="replace">{{ t('targetUI.replacePassword') }}</option>
          <option v-if="target" value="clear">{{ t('targetUI.clearPassword') }}</option></select
        ><template v-if="passwordMode === 'replace'"
          ><label for="target-password">{{ t('targetUI.fixedPassword') }}</label
          ><input
            id="target-password"
            v-model="password"
            type="password"
            required
            maxlength="1024"
            autocomplete="new-password"
            :disabled="busy"
        /></template>
        <div class="button-row">
          <button class="primary" type="submit" :disabled="busy">
            {{ t(busy ? 'busy' : 'targetUI.saveTarget') }}</button
          ><button class="secondary" type="button" :disabled="busy" @click="close">
            {{ t('cancel') }}
          </button>
        </div>
      </form>
    </dialog></Teleport
  >
</template>
