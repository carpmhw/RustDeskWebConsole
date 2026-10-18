<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import type { ServerRow, ServerProbe } from '../api/management'
defineOptions({ name: 'ServersView' })
const { t, te } = useI18n()
const auth = useAuthStore()
const rows = ref<ServerRow[]>([])
const selected = ref<ServerRow | null>(null)
const editing = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const success = ref(false)
const probes = ref<Record<string, ServerProbe>>({})
const draft = ref(emptyDraft())
const controller = new AbortController()
let alive = true
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// 新設定不帶任何existing key或不安全預設端點。
function emptyDraft() {
  return {
    name: '',
    id_server: '',
    relay_server: '',
    public_key: '',
    transport: 'tcp' as 'tcp' | 'ws',
    enabled: true,
    allow_private_network: false,
    notes: '',
    version: 0,
  }
}
// 只由authorized client取得admin設定，錯誤分類不顯示body。
async function load(): Promise<void> {
  try {
    const value = await auth.request<ServerRow[]>(
      'api/v1/servers',
      'GET',
      undefined,
      controller.signal,
    )
    if (alive) rows.value = value
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  }
}
// 編輯使用安全metadata副本，Version保留而不自動覆寫新資料。
function edit(row?: ServerRow): void {
  selected.value = row ?? null
  draft.value = row
    ? {
        name: row.name,
        id_server: row.id_server,
        relay_server: row.relay_server,
        public_key: row.public_key,
        transport: row.transport,
        enabled: row.enabled,
        allow_private_network: row.allow_private_network,
        notes: row.notes ?? '',
        version: row.version,
      }
    : emptyDraft()
  editing.value = true
  error.value = null
  success.value = false
}
// 保存後重新讀列表，409只提示，不重送或偷偷換Version。
async function save(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  success.value = false
  try {
    await auth.request(
      selected.value ? 'api/v1/servers/' + selected.value.id : 'api/v1/servers',
      selected.value ? 'PUT' : 'POST',
      draft.value,
      controller.signal,
    )
    if (alive) {
      editing.value = false
      draft.value = emptyDraft()
      selected.value = null
      probes.value = {}
      success.value = true
      await load()
    }
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 刪除需使用者操作確認，版本查詢只有非敏感整數。
async function remove(row: ServerRow): Promise<void> {
  if (busy.value || !window.confirm(t('manage.confirmDelete', { name: row.name }))) return
  busy.value = true
  error.value = null
  try {
    await auth.request(
      'api/v1/servers/' + row.id + '?version=' + row.version,
      'DELETE',
      undefined,
      controller.signal,
    )
    if (alive) {
      delete probes.value[row.id]
      await load()
    }
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 探測只已保存端點，不傳host override，UI明確只顯TCP分類。
async function probe(row: ServerRow): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    const value = await auth.request<ServerProbe>(
      'api/v1/servers/' + row.id + '/connection-test',
      'GET',
      undefined,
      controller.signal,
    )
    if (alive) probes.value[row.id] = value
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 未知probe狀態不回顯任意server字串。
function status(value: string): string {
  return t(
    te('manage.statuses.' + value) ? 'manage.statuses.' + value : 'errors.service_unavailable',
  )
}
// 關閉editor清除副本，不把它持久化。
function cancel(): void {
  editing.value = false
  selected.value = null
  draft.value = emptyDraft()
}
onMounted(load)
// 離頁取消操作與清除設定副本，避免延遲回應更新新頁。
onBeforeUnmount(() => {
  alive = false
  controller.abort()
  cancel()
})
</script>

<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('servers') }}</h1>
        <p>{{ t('manage.probeHint') }}</p>
      </div>
      <button class="primary" type="button" :disabled="busy" @click="edit()">
        {{ t('manage.addServer') }}
      </button>
    </div>
    <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
    <p v-if="success" class="success-message" role="status">{{ t('manage.saved') }}</p>
    <section v-if="editing" class="card management-editor">
      <div class="card-header">
        <h2>{{ t(selected ? 'manage.edit' : 'manage.addServer') }}</h2>
      </div>
      <form class="card-body" @submit.prevent="save">
        <div class="form-grid">
          <div>
            <label for="server-name">{{ t('manage.name') }}</label
            ><input
              id="server-name"
              v-model="draft.name"
              required
              maxlength="128"
              :disabled="busy"
            />
          </div>
          <div>
            <label for="server-transport">{{ t('manage.transport') }}</label
            ><select id="server-transport" v-model="draft.transport" :disabled="busy">
              <option value="tcp">TCP</option>
              <option value="ws">WS</option>
            </select>
          </div>
          <div>
            <label for="id-server">{{ t('manage.idServer') }}</label
            ><input
              id="id-server"
              v-model="draft.id_server"
              required
              maxlength="320"
              :disabled="busy"
              spellcheck="false"
            />
          </div>
          <div>
            <label for="relay-server">{{ t('manage.relayServer') }}</label
            ><input
              id="relay-server"
              v-model="draft.relay_server"
              required
              maxlength="320"
              :disabled="busy"
              spellcheck="false"
            />
          </div>
        </div>
        <label for="server-key">{{ t('manage.publicKey') }}</label
        ><input
          id="server-key"
          v-model="draft.public_key"
          required
          maxlength="44"
          :disabled="busy"
          autocomplete="off"
          spellcheck="false"
        />
        <label class="check-label"
          ><input v-model="draft.enabled" type="checkbox" :disabled="busy" />{{
            t('manage.enabled')
          }}</label
        ><label class="check-label"
          ><input v-model="draft.allow_private_network" type="checkbox" :disabled="busy" />{{
            t('manage.allowPrivate')
          }}</label
        >
        <label for="server-notes">{{ t('manage.notes') }}</label
        ><textarea
          id="server-notes"
          v-model="draft.notes"
          maxlength="2000"
          :disabled="busy"
        ></textarea>
        <div class="button-row">
          <button class="primary" type="submit" :disabled="busy">
            {{ t(busy ? 'busy' : 'manage.save') }}</button
          ><button class="secondary" type="button" :disabled="busy" @click="cancel">
            {{ t('cancel') }}
          </button>
        </div>
      </form>
    </section>
    <section class="card">
      <div class="card-header">
        <h2>{{ t('servers') }}</h2>
        <button type="button" class="secondary" :disabled="busy" @click="load">
          {{ t('manage.refresh') }}
        </button>
      </div>
      <div class="table-scroll" tabindex="0" role="region" :aria-label="t('servers')">
        <table class="management-table">
          <thead>
            <tr>
              <th>{{ t('manage.name') }}</th>
              <th>{{ t('manage.idServer') }}</th>
              <th>{{ t('manage.relayServer') }}</th>
              <th>{{ t('manage.enabled') }}</th>
              <th>{{ t('manage.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                {{ row.name }}<small class="muted">{{ row.transport.toUpperCase() }}</small>
              </td>
              <td>{{ row.id_server }}</td>
              <td>{{ row.relay_server }}</td>
              <td>
                <span class="status-pill status-pill--neutral">{{
                  t(row.enabled ? 'enabled' : 'disabled')
                }}</span>
              </td>
              <td>
                <div class="row-actions">
                  <button type="button" :disabled="busy" @click="edit(row)">
                    {{ t('manage.edit') }}</button
                  ><button type="button" :disabled="busy || !row.enabled" @click="probe(row)">
                    {{ t('manage.probe') }}</button
                  ><button type="button" class="danger" :disabled="busy" @click="remove(row)">
                    {{ t('manage.remove') }}
                  </button>
                </div>
                <p
                  v-if="probes[row.id]"
                  class="probe-result"
                  role="status"
                  data-testid="probe-result"
                >
                  ID: {{ status(probes[row.id]!.id_server.status) }} · Relay:
                  {{ status(probes[row.id]!.relay_server.status) }}
                </p>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="5" class="empty-row">{{ t('manage.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
