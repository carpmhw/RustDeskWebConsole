<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { usePreferencesStore } from '../stores/preferences'
import { formatTimestamp } from '../utils/dateTime'
import type { AvailableServer, TargetPage, TargetRow } from '../api/management'
import TargetEditor from '../components/TargetEditor.vue'
import TargetPermissions from '../components/TargetPermissions.vue'
import TargetReveal from '../components/TargetReveal.vue'
defineOptions({ name: 'TargetsView' })
const { t, te } = useI18n()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const rows = ref<TargetRow[]>([])
const servers = ref<AvailableServer[]>([])
const count = ref(0)
const page = ref(1)
const pageSize = 20
const q = ref('')
const group = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const imported = ref<number | null>(null)
const selected = ref(new Map<string, number>())
const editing = ref(false)
const editorTarget = ref<TargetRow | null>(null)
const aclTarget = ref<TargetRow | null>(null)
const revealTarget = ref<TargetRow | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const controller = new AbortController()
let alive = true
let loadRevision = 0
const writer = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'operator')
const errorText = computed(() =>
  t(te('errors.' + error.value) ? 'errors.' + error.value : 'errors.service_unavailable'),
)
// 最新查詢才更新列表；只取可見metadata與server摘要，選取不跨版本保留。
async function load(): Promise<void> {
  const current = ++loadRevision
  const query = new URLSearchParams({ page: String(page.value), page_size: String(pageSize) })
  if (q.value) query.set('q', q.value)
  if (group.value) query.set('group', group.value)
  try {
    const [targets, available] = await Promise.all([
      auth.request<TargetPage>(
        'api/v1/targets?' + query.toString(),
        'GET',
        undefined,
        controller.signal,
      ),
      auth.request<AvailableServer[]>(
        'api/v1/servers/available',
        'GET',
        undefined,
        controller.signal,
      ),
    ])
    if (alive && current === loadRevision) {
      rows.value = targets.items
      count.value = targets.count
      servers.value = available
      selected.value.clear()
    }
  } catch (failure) {
    if (alive && current === loadRevision) error.value = auth.errorCode(failure)
  }
}
// 條件查詢回第一頁，避免舊分頁超過可見範圍。
async function search(): Promise<void> {
  page.value = 1
  error.value = null
  await load()
}
// 分頁只變更非敏感metadata查詢。
async function changePage(delta: number): Promise<void> {
  page.value += delta
  await load()
}
// UI role ceiling與effectiveflags一致，viewer不因意外truthy資料升權。
function canEdit(row: TargetRow): boolean {
  return writer.value && row.permissions.can_edit === true
}
// 顯示密碼必須有祕密與有效讀取能力，API仍再驗證。
function canReveal(row: TargetRow): boolean {
  return writer.value && row.has_password === true && row.permissions.can_view_password === true
}
// 連線入口依role ceiling與effective can_connect，票證不放新tab URL。
function canConnect(row: TargetRow): boolean {
  return writer.value && row.permissions.can_connect === true
}
// 新選目標會卸載上一個敏感dialog，不預填密碼。
function edit(row?: TargetRow): void {
  revealTarget.value = null
  aclTarget.value = null
  editorTarget.value = row ?? null
  editing.value = true
  error.value = null
}
// 關editor釋放短命表單。
function closeEditor(): void {
  editing.value = false
  editorTarget.value = null
}
// 成功提交後清副本並讀最新Version。
async function saved(): Promise<void> {
  closeEditor()
  aclTarget.value = null
  await load()
}
// Secret只留獨立dialog，列表沒有plaintext欄位。
function reveal(row: TargetRow): void {
  closeEditor()
  aclTarget.value = null
  revealTarget.value = row
}
// Admin才顯示ACL入口，不讓can_edit代表可轉授權。
function permissions(row: TargetRow): void {
  closeEditor()
  revealTarget.value = null
  aclTarget.value = row
}
// 選取只保存UUID／Version。
function select(row: TargetRow, event: Event): void {
  if ((event.target as HTMLInputElement).checked) selected.value.set(row.id, row.version)
  else selected.value.delete(row.id)
}
// 用明確版本單筆刪除，確認只含metadata名稱。
async function remove(row: TargetRow): Promise<void> {
  if (busy.value || !window.confirm(t('targetUI.confirmDelete', { name: row.name }))) return
  busy.value = true
  error.value = null
  try {
    await auth.request(
      'api/v1/targets/' + row.id + '?version=' + row.version,
      'DELETE',
      undefined,
      controller.signal,
    )
    if (alive) await load()
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 批刪只送可編輯選取項，任何版本／權限失敗交由後端全交易拒絕。
async function bulkDelete(): Promise<void> {
  if (
    busy.value ||
    !selected.value.size ||
    !window.confirm(t('targetUI.confirmBulk', { count: selected.value.size }))
  )
    return
  busy.value = true
  error.value = null
  try {
    await auth.request(
      'api/v1/targets/bulk-delete',
      'POST',
      { items: [...selected.value].map(([id, version]) => ({ id, version })) },
      controller.signal,
    )
    if (alive) {
      revealTarget.value = null
      await load()
    }
  } catch (failure) {
    if (alive) {
      error.value = auth.errorCode(failure)
      selected.value.clear()
      await load()
    }
  } finally {
    if (alive) busy.value = false
  }
}
// 匯出只metadata，使用者點擊才產生Blob並立即撤銷URL。
async function exportCsv(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  const query = new URLSearchParams()
  if (q.value) query.set('q', q.value)
  if (group.value) query.set('group', group.value)
  try {
    const csv = await auth.request<string>(
      'api/v1/targets/export' + (query.size ? '?' + query.toString() : ''),
      'GET',
      undefined,
      controller.signal,
      'text',
    )
    if (!alive) return
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'targets.csv'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (failure) {
    if (alive) error.value = auth.errorCode(failure)
  } finally {
    if (alive) busy.value = false
  }
}
// 匯入檔案先限byte／chars及JSON大小，維持既有16KiB baseline。
async function importCsv(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || busy.value) return
  busy.value = true
  error.value = null
  imported.value = null
  try {
    if (file.size > 16384) throw new Error('invalid_csv')
    const csv = await file.text()
    if (csv.length > 10000 || new TextEncoder().encode(JSON.stringify({ csv })).length > 16384)
      throw new Error('invalid_csv')
    const result = await auth.request<{ count: number }>(
      'api/v1/targets/import',
      'POST',
      { csv },
      controller.signal,
    )
    if (alive) {
      imported.value = result.count
      page.value = 1
      await load()
    }
  } catch (failure) {
    if (alive)
      error.value =
        failure instanceof Error && failure.message === 'invalid_csv'
          ? 'invalid_csv'
          : auth.errorCode(failure)
  } finally {
    input.value = ''
    if (alive) busy.value = false
  }
}
// 日期顯示使用選定locale與時區，原值維持UTC。
function updated(row: TargetRow): string {
  return formatTimestamp(row.updated_at, preferences.timeZone, preferences.locale)
}
// Disabled既有server無摘要時只顯UUID，不外洩內部端點。
function serverName(id: string): string {
  return servers.value.find((server) => server.id === id)?.name ?? id
}
onMounted(load)
// 離頁取消查詢與清除所有短命dialog／metadata選取。
onBeforeUnmount(() => {
  alive = false
  loadRevision++
  controller.abort()
  closeEditor()
  aclTarget.value = null
  revealTarget.value = null
  selected.value.clear()
})
</script>
<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('targets') }}</h1>
        <p>{{ t('targetUI.listHint') }}</p>
      </div>
      <button v-if="writer" type="button" class="primary" :disabled="busy" @click="edit()">
        {{ t('targetUI.addTarget') }}
      </button>
    </div>
    <p v-if="error" class="error-message" role="alert">{{ errorText }}</p>
    <p v-if="imported !== null" class="success-message" role="status">
      {{ t('targetUI.imported', { count: imported }) }}
    </p>
    <section class="card">
      <form class="card-body target-filters" @submit.prevent="search">
        <div>
          <label for="target-search">{{ t('targetUI.search') }}</label
          ><input id="target-search" v-model="q" maxlength="128" />
        </div>
        <div>
          <label for="target-group-filter">{{ t('targetUI.group') }}</label
          ><input id="target-group-filter" v-model="group" maxlength="64" />
        </div>
        <button class="secondary" type="submit" :disabled="busy">{{ t('targetUI.search') }}</button>
      </form>
      <div class="transfer-toolbar">
        <button type="button" :disabled="busy" @click="exportCsv">
          {{ t('targetUI.exportCsv') }}</button
        ><label v-if="writer" class="file-label"
          >{{ t('targetUI.importCsv')
          }}<input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv"
            :disabled="busy"
            @change="importCsv" /></label
        ><button
          v-if="writer"
          type="button"
          class="danger"
          :disabled="busy || !selected.size"
          @click="bulkDelete"
        >
          {{ t('targetUI.bulkDelete') }}
        </button>
      </div>
      <div class="table-scroll" tabindex="0" role="region" :aria-label="t('targets')">
        <table class="management-table">
          <thead>
            <tr>
              <th v-if="writer">{{ t('targetUI.select') }}</th>
              <th>{{ t('targetUI.name') }}</th>
              <th>RustDesk ID</th>
              <th>{{ t('targetUI.server') }}</th>
              <th>{{ t('targetUI.group') }}</th>
              <th>{{ t('targetUI.passwordState') }}</th>
              <th>{{ t('targetUI.updated') }}</th>
              <th>{{ t('manage.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td v-if="writer">
                <input
                  v-if="canEdit(row)"
                  type="checkbox"
                  :aria-label="t('targetUI.selectNamed', { name: row.name })"
                  :checked="selected.has(row.id)"
                  :disabled="busy"
                  @change="select(row, $event)"
                />
              </td>
              <td>
                {{ row.name }}<small class="muted">{{ row.tags.join(', ') }}</small>
              </td>
              <td>{{ row.rustdesk_id }}</td>
              <td>{{ serverName(row.server_id) }}</td>
              <td>{{ row.group_name || '—' }}</td>
              <td>{{ t(row.has_password ? 'targetUI.hasPassword' : 'targetUI.noPassword') }}</td>
              <td>{{ updated(row) }}</td>
              <td>
                <div class="row-actions">
                  <RouterLink
                    v-if="canConnect(row)"
                    class="primary"
                    :to="{ name: 'console', params: { targetId: row.id } }"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ t('consoleUI.connect') }}</RouterLink
                  >
                  <button v-if="canEdit(row)" type="button" :disabled="busy" @click="edit(row)">
                    {{ t('manage.edit') }}</button
                  ><button
                    v-if="canReveal(row)"
                    type="button"
                    :disabled="busy"
                    @click="reveal(row)"
                  >
                    {{ t('targetUI.reveal') }}</button
                  ><button
                    v-if="auth.user?.role === 'admin'"
                    type="button"
                    :disabled="busy"
                    @click="permissions(row)"
                  >
                    {{ t('targetUI.permissions') }}</button
                  ><button
                    v-if="canEdit(row)"
                    type="button"
                    class="danger"
                    :disabled="busy"
                    @click="remove(row)"
                  >
                    {{ t('manage.remove') }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="writer ? 8 : 7" class="empty-row">{{ t('targetUI.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button type="button" :disabled="busy || page <= 1" @click="changePage(-1)">
          {{ t('targetUI.previous') }}</button
        ><span>{{ t('targetUI.page', { page, count }) }}</span
        ><button type="button" :disabled="busy || page * pageSize >= count" @click="changePage(1)">
          {{ t('targetUI.next') }}
        </button>
      </div>
    </section>
    <TargetEditor
      v-if="editing"
      :target="editorTarget"
      :servers="servers"
      @close="closeEditor"
      @saved="saved"
    /><TargetPermissions
      v-if="aclTarget"
      :key="aclTarget.id"
      :target-id="aclTarget.id"
      :name="aclTarget.name"
      @close="aclTarget = null"
      @saved="saved"
    /><TargetReveal
      v-if="revealTarget"
      :key="revealTarget.id"
      :target-id="revealTarget.id"
      :name="revealTarget.name"
      @close="revealTarget = null"
    />
  </main>
</template>
