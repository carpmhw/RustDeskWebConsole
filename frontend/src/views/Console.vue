<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import type { TargetRow } from '../api/management'
import { ConsoleHost } from '../rdweb/host'
import { CanvasRenderer, imageScale } from '../rdweb/renderer'
import type { Phase } from '../rdweb/types'
import type { PeerVideo, MediaStats, Zoom, Quality } from '../rdweb/video-types'
defineOptions({ name: 'ConsoleView' })
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()
const phase = ref<Phase>('connecting')
const summary = ref<PeerVideo | null>(null)
const stats = ref<MediaStats | null>(null)
const name = ref('')
const error = ref<string | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const zoom = ref('fit')
const quality = ref<Quality>('balanced')
const fullscreenUnavailable = ref(false)
let lookup: AbortController | null = null
let observer: ResizeObserver | null = null
let alive = true
// Vue只持安全phase／summary／數字統計，不持有frame或key。
const host = new ConsoleHost(
  auth,
  (state) => {
    if (!alive) return
    phase.value = state.phase as Phase
    if (state.peer) summary.value = state.peer
    if (state.stats) stats.value = state.stats
    if (state.error) error.value = state.error
  },
  // Main唯一renderer owner，每次明確重試重建，不重用已closed實例。
  (ack, failure, fps) => {
    if (!canvas.value) throw new Error('video_unsupported')
    return new CanvasRenderer(canvas.value, ack, failure, undefined, undefined, fps)
  },
)
// 只變CSS寬高保持pixel與remote解析度，未知選项不傳至protocol。
function resize(): void {
  if (!canvas.value || !viewport.value || !summary.value) return
  const value = zoom.value === 'fit' || zoom.value === 'original' ? zoom.value : Number(zoom.value)
  if (typeof value === 'number' && ![0.5, 1, 1.5, 2].includes(value)) return
  const factor = imageScale(
    summary.value.width,
    summary.value.height,
    Math.max(1, viewport.value.clientWidth),
    Math.max(1, viewport.value.clientHeight),
    value as Zoom,
  )
  canvas.value.style.width = summary.value.width * factor + 'px'
  canvas.value.style.height = summary.value.height * factor + 'px'
}
// Direct route照樣驗UUID、latest can_connect／viewer硬上限與secure context。
async function start(): Promise<void> {
  host.dispose()
  lookup?.abort()
  summary.value = null
  stats.value = null
  error.value = null
  quality.value = 'balanced'
  fullscreenUnavailable.value = false
  const id = String(route.params.targetId)
  if (!window.isSecureContext || !/^[a-f0-9-]{36}$/i.test(id)) {
    phase.value = 'failed'
    error.value = window.isSecureContext ? 'connection_failed' : 'insecure_context'
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
    await nextTick()
    if (!alive || operation.signal.aborted) return
    await host.start(target.id, target.rustdesk_id)
  } catch {
    if (alive && !operation.signal.aborted) {
      phase.value = 'failed'
      error.value = 'connection_failed'
    }
  }
}
// 使用者結束先作廢HTTP與Worker，renderer清空可見桌面。
function cancel(): void {
  lookup?.abort()
  host.dispose()
  phase.value = 'closed'
}
// 畫質只送固定enum的加密option，不再取ticket或assist。
function changeQuality(): void {
  if (['low', 'balanced', 'high'].includes(quality.value)) host.setQuality(quality.value)
}
// 全螢幕拒绝是可恢復UI提示，不中断連線或回傳原生exception。
async function enterFullscreen(): Promise<void> {
  try {
    if (!viewport.value?.requestFullscreen) throw new Error()
    await viewport.value.requestFullscreen()
    fullscreenUnavailable.value = false
  } catch {
    fullscreenUnavailable.value = true
  }
}
// 身分／role／MFA改變即取消，不只靠按鈕隱藏。
watch(
  () => [auth.phase, auth.user?.id, auth.user?.role, auth.user?.mfa_enrollment_required],
  cancel,
)
// 新target完全建立新operation。
watch(() => route.params.targetId, start)
// 幾何與比例變動不改remote pixel，只在DOM更新後重算CSS。
watch(
  () => [zoom.value, summary.value?.width, summary.value?.height],
  () => {
    void nextTick(resize)
  },
)
// Observer及fullscreen listener屬此view，離頁時一併移除。
onMounted(() => {
  observer = new ResizeObserver(resize)
  if (viewport.value) observer.observe(viewport.value)
  document.addEventListener('fullscreenchange', resize)
  void start()
})
// 離頁先作廢callback再清所有native／HTTP／DOM排程。
onBeforeUnmount(() => {
  alive = false
  lookup?.abort()
  host.dispose()
  observer?.disconnect()
  observer = null
  document.removeEventListener('fullscreenchange', resize)
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
          {{ t('consoleUI.errors.' + error) }}
        </p>
        <div v-if="summary" data-testid="console-verified">
          <p>{{ summary.platform }} · {{ summary.version }}</p>
        </div>
        <p v-if="phase === 'streaming'" data-testid="console-streaming">
          {{ t('consoleUI.connected') }}
        </p>
        <p v-if="stats" data-testid="console-stats">
          {{ stats.codec.toUpperCase() }} · {{ stats.width }}×{{ stats.height }} ·
          {{ t('consoleUI.fps', { count: stats.fps }) }}
        </p>
        <section class="console-toolbar" :aria-label="t('consoleUI.controls')">
          <label
            >{{ t('consoleUI.zoom')
            }}<select v-model="zoom" data-testid="console-zoom">
              <option value="fit">{{ t('consoleUI.fit') }}</option>
              <option value="original">{{ t('consoleUI.original') }}</option>
              <option value="0.5">50%</option>
              <option value="1">100%</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
            </select></label
          >
          <label
            >{{ t('consoleUI.quality')
            }}<select
              v-model="quality"
              data-testid="console-quality"
              :disabled="!summary"
              @change="changeQuality"
            >
              <option value="low">{{ t('consoleUI.low') }}</option>
              <option value="balanced">{{ t('consoleUI.balanced') }}</option>
              <option value="high">{{ t('consoleUI.high') }}</option>
            </select></label
          >
          <button type="button" data-testid="console-fullscreen" @click="enterFullscreen">
            {{ t('consoleUI.fullscreen') }}
          </button>
          <button type="button" data-testid="console-end" @click="cancel">
            {{ t('consoleUI.end') }}
          </button>
        </section>
        <p v-if="fullscreenUnavailable" role="status" data-testid="console-fullscreen-unavailable">
          {{ t('consoleUI.fullscreenUnavailable') }}
        </p>
        <section ref="viewport" class="console-viewport" data-testid="console-viewport">
          <canvas ref="canvas" data-testid="console-canvas"></canvas>
        </section>
        <div class="button-row">
          <button
            v-if="phase === 'failed' || phase === 'closed'"
            type="button"
            class="primary"
            data-testid="console-retry"
            @click="start"
          >
            {{ t('consoleUI.retry') }}
          </button>
          <RouterLink :to="{ name: 'targets' }">{{ t('targets') }}</RouterLink>
        </div>
      </div>
    </section>
  </main>
</template>
