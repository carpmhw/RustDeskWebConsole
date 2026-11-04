<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import type { AvailableUser, TargetGrant, TargetPermissions } from '../api/management'
const props = defineProps<{ targetId: string; name: string }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const { t, te } = useI18n()
const auth = useAuthStore()
const dialog = ref<HTMLDialogElement | null>(null)
const users = ref<AvailableUser[]>([])
const grants = ref<TargetGrant[]>([])
const version = ref(0)
const busy = ref(true)
const error = ref<string | null>(null)
const controller = new AbortController()
let alive = true
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// Admin取得安全users與完整ACL，沒有secret欄位。
async function load(): Promise<void> {
  try {
    const [acl, people] = await Promise.all([
      auth.request<TargetPermissions>(
        'api/v1/targets/' + props.targetId + '/permissions',
        'GET',
        undefined,
        controller.signal,
      ),
      auth.request<AvailableUser[]>('api/v1/users', 'GET', undefined, controller.signal),
    ])
    if (alive) {
      grants.value = acl.grants.map((grant) => ({ ...grant }))
      version.value = acl.version
      users.value = people
    }
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 空白新grant先選role viewer，預設不給action權限。
function add(): void {
  if (grants.value.length < 50)
    grants.value.push({
      user_id: null,
      role: 'viewer',
      can_connect: false,
      can_view_password: false,
      can_edit: false,
    })
}
// Subject只允許role或user互斥，viewer切換即清action flags。
function changeSubject(grant: TargetGrant, event: Event): void {
  const selected = (event.target as HTMLSelectElement).value
  if (selected.startsWith('role:')) {
    grant.role = selected === 'role:viewer' ? 'viewer' : 'operator'
    grant.user_id = null
  } else {
    grant.user_id = selected
    grant.role = null
  }
  if (isViewer(grant)) {
    grant.can_connect = false
    grant.can_view_password = false
    grant.can_edit = false
  }
}
// 角色ceiling在UI提示，API仍為最終檢查。
function isViewer(grant: TargetGrant): boolean {
  return (
    grant.role === 'viewer' ||
    users.value.some((user) => user.id === grant.user_id && user.role === 'viewer')
  )
}
// 移除只修改當次副本，保存才替換後端ACL。
function remove(index: number): void {
  grants.value.splice(index, 1)
}
// 過期Version不自動覆寫或重送。
async function save(): Promise<void> {
  if (busy.value || version.value < 1) return
  busy.value = true
  error.value = null
  try {
    await auth.request(
      'api/v1/targets/' + props.targetId + '/permissions',
      'PUT',
      { version: version.value, grants: grants.value },
      controller.signal,
    )
    if (alive) emit('saved')
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 關dialog不保存未提交的grant。
function close(): void {
  emit('close')
}
onMounted(() => {
  dialog.value?.showModal()
  void load()
})
// 離頁取消並丟棄grant副本。
onBeforeUnmount(() => {
  alive = false
  controller.abort()
  grants.value = []
  dialog.value?.close()
})
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      class="management-dialog"
      aria-labelledby="permissions-title"
      @cancel="close"
    >
      <h2 id="permissions-title">{{ t('targetUI.permissions') }} · {{ name }}</h2>
      <p class="muted">{{ t('targetUI.permissionsHint') }}</p>
      <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
      <form @submit.prevent="save">
        <fieldset v-for="(grant, index) in grants" :key="index" class="grant-row">
          <legend>{{ t('targetUI.grantNumber', { number: index + 1 }) }}</legend>
          <label :for="'grant-subject-' + index">{{ t('targetUI.grantRole') }}</label
          ><select
            :id="'grant-subject-' + index"
            :value="grant.user_id ?? 'role:' + grant.role"
            :disabled="busy"
            @change="changeSubject(grant, $event)"
          >
            <option value="role:viewer">viewer · {{ t('roles.viewer') }}</option>
            <option value="role:operator">operator · {{ t('roles.operator') }}</option>
            <option v-for="user in users" :key="user.id" :value="user.id">
              {{ user.username }} · {{ t('roles.' + user.role) }}
            </option></select
          ><label class="check-label"
            ><input
              v-model="grant.can_connect"
              type="checkbox"
              :disabled="busy || isViewer(grant)"
            />{{ t('targetUI.canConnect') }}</label
          ><label class="check-label"
            ><input
              v-model="grant.can_view_password"
              type="checkbox"
              :disabled="busy || isViewer(grant)"
            />{{ t('targetUI.canViewPassword') }}</label
          ><label class="check-label"
            ><input
              v-model="grant.can_edit"
              type="checkbox"
              :disabled="busy || isViewer(grant)"
            />{{ t('targetUI.canEdit') }}</label
          ><button type="button" :disabled="busy" @click="remove(index)">
            {{ t('manage.remove') }}
          </button>
        </fieldset>
        <button
          type="button"
          class="secondary"
          :disabled="busy || grants.length >= 50"
          @click="add"
        >
          {{ t('targetUI.addGrant') }}
        </button>
        <div class="button-row">
          <button type="submit" class="primary" :disabled="busy || version < 1">
            {{ t(busy ? 'busy' : 'targetUI.savePermissions') }}</button
          ><button type="button" class="secondary" :disabled="busy" @click="close">
            {{ t('cancel') }}
          </button>
        </div>
      </form>
    </dialog></Teleport
  >
</template>
