<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import type { UserRow } from '../api/management'
import { generatePassword } from '../utils/password'
import MfaPolicy from '../components/MfaPolicy.vue'
import ReauthProof from '../components/ReauthProof.vue'
defineOptions({ name: 'UsersView' })

type Role = UserRow['role']
type Operation =
  | { kind: 'create' }
  | { kind: 'edit'; row: UserRow }
  | { kind: 'reset-password'; row: UserRow }
  | { kind: 'reset-totp'; row: UserRow }
const { t, te } = useI18n()
const auth = useAuthStore()
const rows = ref<UserRow[]>([])
const operation = ref<Operation | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)
const success = ref(false)
// 表單草稿與一次性顯示的初始密碼只存在本頁短命 ref，不進 store、storage 或 URL。
const draft = ref({ username: '', email: '', role: 'viewer' as Role, is_active: true })
const secret = ref('')
const generated = ref(false)
const reveal = ref<string | null>(null)
const copied = ref(false)
const method = ref<'password' | 'code'>('password')
const proofPassword = ref('')
const proofCode = ref('')
const controller = new AbortController()
let alive = true
const me = computed(() => auth.user?.id)
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)

// 清除所有密碼與再次驗證輸入。
function clearSecrets(): void {
  secret.value = ''
  generated.value = false
  proofPassword.value = ''
  proofCode.value = ''
  method.value = 'password'
}
// 讀取使用者安全欄位列表。
async function load(): Promise<void> {
  try {
    const value = await auth.request<UserRow[]>('api/v1/users', 'GET', undefined, controller.signal)
    if (alive) rows.value = value
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  }
}
// 開啟單一操作面板；切換時清除前一個面板的輸入。
function open(next: Operation): void {
  clearSecrets()
  error.value = null
  success.value = false
  operation.value = next
  draft.value =
    next.kind === 'edit'
      ? {
          username: next.row.username,
          email: next.row.email ?? '',
          role: next.row.role,
          is_active: next.row.is_active,
        }
      : { username: '', email: '', role: 'viewer', is_active: true }
}
// 關閉面板並清除輸入。
function close(): void {
  operation.value = null
  clearSecrets()
}
// 由瀏覽器產生初始密碼並填入欄位；完成後只顯示一次。
function generate(): void {
  secret.value = generatePassword()
  generated.value = true
}
// 手動修改密碼欄位時不再視為自動產生，避免顯示管理員自己輸入的值。
function typed(): void {
  generated.value = false
}
// 執行目前面板的操作；成功後重新讀取列表，自動產生的密碼才進入一次性顯示。
async function submit(): Promise<void> {
  const current = operation.value
  if (!current || busy.value) return
  busy.value = true
  error.value = null
  success.value = false
  const value = secret.value
  const show = generated.value
  const proof =
    method.value === 'password' ? { password: proofPassword.value } : { code: proofCode.value }
  clearSecrets()
  try {
    if (current.kind === 'create')
      await auth.request(
        'api/v1/users',
        'POST',
        {
          username: draft.value.username,
          password: value,
          role: draft.value.role,
          ...(draft.value.email ? { email: draft.value.email } : {}),
        },
        controller.signal,
      )
    else if (current.kind === 'edit')
      await auth.request(
        'api/v1/users/' + current.row.id,
        'PATCH',
        {
          is_active: draft.value.is_active,
          role: draft.value.role,
          ...(draft.value.email && draft.value.email !== current.row.email
            ? { email: draft.value.email }
            : {}),
        },
        controller.signal,
      )
    else if (current.kind === 'reset-password')
      await auth.request(
        'api/v1/users/' + current.row.id + '/reset-password',
        'POST',
        { new_password: value, ...proof },
        controller.signal,
      )
    else
      await auth.request(
        'api/v1/users/' + current.row.id + '/reset-totp',
        'POST',
        proof,
        controller.signal,
      )
    if (!alive) return
    operation.value = null
    reveal.value = show && current.kind !== 'edit' && current.kind !== 'reset-totp' ? value : null
    copied.value = false
    success.value = true
    await load()
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 複製一次性密碼到剪貼簿；不記錄內容。
async function copy(): Promise<void> {
  if (!reveal.value) return
  try {
    await navigator.clipboard.writeText(reveal.value)
    copied.value = true
  } catch {
    copied.value = false
  }
}
// 關閉一次性顯示後無法再次取得。
function dismiss(): void {
  reveal.value = null
  copied.value = false
}
onMounted(load)
// 離頁取消請求並清除所有密碼。
onBeforeUnmount(() => {
  alive = false
  controller.abort()
  clearSecrets()
  reveal.value = null
})
</script>

<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('usersUI.title') }}</h1>
        <p>{{ t('usersUI.hint') }}</p>
      </div>
      <button class="primary" type="button" :disabled="busy" @click="open({ kind: 'create' })">
        {{ t('usersUI.add') }}
      </button>
    </div>
    <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
    <p v-if="success && !reveal" class="success-message" role="status">{{ t('usersUI.saved') }}</p>
    <section v-if="reveal" class="card" data-testid="generated-password">
      <div class="card-header">
        <h2>{{ t('usersUI.generatedTitle') }}</h2>
        <p>{{ t('usersUI.generatedHint') }}</p>
      </div>
      <div class="card-body">
        <code>{{ reveal }}</code>
        <button class="secondary" type="button" @click="copy">
          {{ t(copied ? 'usersUI.copied' : 'usersUI.copy') }}
        </button>
        <button class="primary" type="button" @click="dismiss">{{ t('usersUI.done') }}</button>
      </div>
    </section>
    <section v-if="operation" class="card management-editor">
      <div class="card-header">
        <h2>
          {{
            operation.kind === 'create'
              ? t('usersUI.add')
              : operation.kind === 'edit'
                ? t('usersUI.edit') + '：' + operation.row.username
                : operation.kind === 'reset-password'
                  ? t('usersUI.resetPassword') + '：' + operation.row.username
                  : t('usersUI.resetTotp') + '：' + operation.row.username
          }}
        </h2>
        <p v-if="operation.kind === 'reset-totp'">{{ t('usersUI.resetTotpHint') }}</p>
      </div>
      <form class="card-body" @submit.prevent="submit">
        <template v-if="operation.kind === 'create'">
          <label for="user-username">{{ t('username') }}</label
          ><input
            id="user-username"
            v-model="draft.username"
            required
            minlength="3"
            maxlength="128"
            pattern="[A-Za-z0-9._\-]+"
            autocomplete="off"
            spellcheck="false"
            :disabled="busy"
          />
        </template>
        <template v-if="operation.kind === 'create' || operation.kind === 'edit'">
          <label for="user-email">{{ t('usersUI.email') }}</label
          ><input
            id="user-email"
            v-model="draft.email"
            type="email"
            maxlength="320"
            autocomplete="off"
            :disabled="busy"
          />
          <label for="user-role">{{ t('role') }}</label
          ><select id="user-role" v-model="draft.role" :disabled="busy">
            <option value="viewer">{{ t('roles.viewer') }}</option>
            <option value="operator">{{ t('roles.operator') }}</option>
            <option value="admin">{{ t('roles.admin') }}</option>
          </select>
        </template>
        <label v-if="operation.kind === 'edit'" class="check-label"
          ><input v-model="draft.is_active" type="checkbox" :disabled="busy" />
          {{ t('usersUI.activeLabel') }}</label
        >
        <template v-if="operation.kind === 'create' || operation.kind === 'reset-password'">
          <label for="user-secret">{{
            operation.kind === 'create' ? t('usersUI.initialPassword') : t('passwordUI.newPassword')
          }}</label
          ><input
            id="user-secret"
            v-model="secret"
            type="password"
            autocomplete="new-password"
            minlength="12"
            maxlength="1024"
            required
            :disabled="busy"
            @input="typed"
          />
          <button class="secondary" type="button" :disabled="busy" @click="generate">
            {{ t('usersUI.generate') }}
          </button>
          <p class="muted">{{ t('passwordUI.lengthHint') }}</p>
        </template>
        <ReauthProof
          v-if="operation.kind === 'reset-password' || operation.kind === 'reset-totp'"
          v-model:method="method"
          v-model:password="proofPassword"
          v-model:code="proofCode"
          id-prefix="user"
          :disabled="busy"
        />
        <div class="button-row">
          <button class="primary" type="submit" :disabled="busy">
            {{
              operation.kind === 'create'
                ? t('usersUI.create')
                : operation.kind === 'edit'
                  ? t('usersUI.save')
                  : operation.kind === 'reset-password'
                    ? t('usersUI.confirmReset')
                    : t('usersUI.confirmResetTotp')
            }}
          </button>
          <button class="text-button" type="button" :disabled="busy" @click="close">
            {{ t('usersUI.cancel') }}
          </button>
        </div>
      </form>
    </section>
    <section class="card">
      <div class="table-scroll" tabindex="0" role="region" :aria-label="t('usersUI.title')">
        <table class="management-table" data-testid="users-table">
          <thead>
            <tr>
              <th>{{ t('username') }}</th>
              <th>{{ t('usersUI.email') }}</th>
              <th>{{ t('role') }}</th>
              <th>{{ t('usersUI.status') }}</th>
              <th>{{ t('usersUI.mfa') }}</th>
              <th>{{ t('usersUI.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" data-testid="user-row">
              <td>
                {{ row.username }}<span v-if="row.id === me">{{ t('usersUI.you') }}</span>
                <span
                  v-if="row.password_change_required"
                  class="status-pill status-pill--warning"
                  >{{ t('usersUI.pendingChange') }}</span
                >
              </td>
              <td>{{ row.email ?? '' }}</td>
              <td>{{ t('roles.' + row.role) }}</td>
              <td>{{ t(row.is_active ? 'usersUI.active' : 'usersUI.inactive') }}</td>
              <td>{{ t(row.totp_enabled ? 'usersUI.mfaOn' : 'usersUI.mfaOff') }}</td>
              <td>
                <div class="row-actions">
                  <button
                    type="button"
                    class="secondary"
                    :disabled="busy"
                    @click="open({ kind: 'edit', row })"
                  >
                    {{ t('usersUI.edit') }}
                  </button>
                  <button
                    type="button"
                    class="secondary"
                    :disabled="busy"
                    @click="open({ kind: 'reset-password', row })"
                  >
                    {{ t('usersUI.resetPassword') }}
                  </button>
                  <button
                    v-if="row.totp_enabled && row.id !== me"
                    type="button"
                    class="secondary"
                    :disabled="busy"
                    @click="open({ kind: 'reset-totp', row })"
                  >
                    {{ t('usersUI.resetTotp') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <MfaPolicy />
  </main>
</template>
