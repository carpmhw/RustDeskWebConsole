<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import type { TargetRow } from '../api/management'
import { ConsoleHost } from '../rdweb/host'
import type { Phase, PeerSummary } from '../rdweb/types'
defineOptions({ name: 'ConsoleView' })
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()
const phase = ref<Phase>('connecting')
const summary = ref<PeerSummary | null>(null)
const name = ref('')
const error = ref<string | null>(null)
let lookup: AbortController | null = null
let alive = true
// View只接固定phase與安全PeerInfo摘要，不保存任何ticket／proof／key。
const host = new ConsoleHost(auth, (value, info, failure) => {
  if (!alive) return
  phase.value = value
  if (info) summary.value = info
  if (failure) error.value = failure
})
// Direct route同樣驗targetUUID／latest can_connect及secure context。
async function start(): Promise<void> {
  host.dispose()
  lookup?.abort()
  summary.value = null
  error.value = null
  const id = String(route.params.targetId)
  if (!window.isSecureContext || !/^[a-f0-9-]{36}$/i.test(id)) {
    phase.value = 'failed'
    error.value = 'connection_failed'
    return
  }
  lookup = new AbortController()
  const operation = lookup
  phase.value = 'connecting'
  try {
    const target = await auth.request<TargetRow>(
      `api/v1/targets/${id}`,
      'GET',
      undefined,
      operation.signal,
    )
    if (!alive || operation.signal.aborted) return
    if (!target.permissions.can_connect || auth.user?.role === 'viewer') throw new Error()
    name.value = target.name
    await host.start(target.id, target.rustdesk_id)
  } catch {
    if (alive && !operation.signal.aborted) {
      phase.value = 'failed'
      error.value = 'connection_failed'
    }
  }
}
// 使用者取消後舊lookup或RPC不可推進protocol。
function cancel(): void {
  lookup?.abort()
  host.dispose()
  phase.value = 'closed'
}
// 身分、MFA或role變更就關閉；保持本機auth與bridge一致。
watch(
  () => [auth.phase, auth.user?.id, auth.user?.role, auth.user?.mfa_enrollment_required],
  cancel,
)
// 改target時完全重新建立新的ticket／Worker／keys。
watch(() => route.params.targetId, start)
onMounted(start)
// 離頁先作廢callback再清Worker及HTTP，不留敏感記憶體。
onBeforeUnmount(() => {
  alive = false
  lookup?.abort()
  host.dispose()
})
</script>
<template>
  <main class="app-main">
    <div class="page-intro">
      <div>
        <h1>{{ t('consoleUI.title') }}</h1>
        <p>{{ name }}</p>
      </div>
    </div>
    <section class="card">
      <div class="card-body">
        <p role="status" data-testid="console-phase">{{ t('consoleUI.phases.' + phase) }}</p>
        <p v-if="error" class="error-message" role="alert" :data-error-code="error">
          {{ t('consoleUI.failure') }}
        </p>
        <div v-if="summary" data-testid="console-verified">
          <p>{{ summary.platform }} · {{ summary.version }}</p>
          <p>{{ t('consoleUI.displays', { count: summary.displayCount }) }}</p>
        </div>
        <div class="button-row">
          <button type="button" @click="cancel">{{ t('cancel') }}</button
          ><button
            v-if="phase === 'failed' || phase === 'closed' || phase === 'verified'"
            type="button"
            class="primary"
            @click="start"
          >
            {{ t('consoleUI.retry') }}</button
          ><RouterLink :to="{ name: 'targets' }">{{ t('targets') }}</RouterLink>
        </div>
      </div>
    </section>
  </main>
</template>
