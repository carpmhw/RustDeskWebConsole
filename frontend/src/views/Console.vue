<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { ConsoleHost } from '../rdweb/host'
import { CanvasRenderer, imageScale } from '../rdweb/renderer'
import type { Phase, FailureCode } from '../rdweb/types'
import type { PeerVideo, MediaStats, Zoom, Quality, ConsoleState } from '../rdweb/video-types'
import type { InputState, ClipboardUi, OperationCode, RetryState } from '../rdweb/interaction-types'
import { ConsoleSession, sameIdentity, type AuthIdentity } from '../rdweb/console-session'
import { InputChannel } from '../rdweb/input-channel'
import { InputController } from '../rdweb/input-controller'
import { ClipboardController } from '../rdweb/clipboard-controller'
import { ClipboardDialog } from '../rdweb/clipboard-dialog'
import { interactionClock } from '../rdweb/interaction-limits'
import ConsoleWorkspace from '../components/ConsoleWorkspace.vue'
defineOptions({ name: 'ConsoleView' })
const emit = defineEmits<{ focusModeChange: [value: boolean] }>()
const focusMode = ref(false)
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()
const phase = ref<Phase>('connecting')
const summary = ref<PeerVideo | null>(null)
const stats = ref<MediaStats | null>(null)
const name = ref('')
const error = ref<FailureCode | null>(null)
const issue = ref<OperationCode | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const ime = ref<HTMLTextAreaElement | null>(null)
const clipboardDialog = ref<HTMLDialogElement | null>(null)
const clipboardText = ref<HTMLTextAreaElement | null>(null)
const inputState = ref<InputState | null>(null)
const inputFocused = ref(false)
const inputBusy = ref(false)
const socketOpen = ref(false)
const clipboardUi = ref<ClipboardUi>({ busy: false, receiving: false, fallback: 'none' })
const retryState = ref<RetryState>({ phase: 'idle', attempt: 0, enabled: true })
const zoom = ref('fit')
const quality = ref<Quality>('balanced')
const fullscreenUnavailable = ref(false)
let observer: ResizeObserver | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let input: InputController | null = null
let channel: InputChannel | null = null
let domClipboard: ClipboardDialog | null = null
let activeRevision = 0
let clipboardDirection: 'none' | 'send' | 'copy' = 'none'
let alive = true
const now = interactionClock()
// clipboard只需要已登入及獨立peer permission，不要求keyboard permission才能outbound。
const clipboardAvailable = computed(
  () =>
    socketOpen.value &&
    ['awaiting_video', 'streaming'].includes(phase.value) &&
    !!inputState.value?.clipboard &&
    !clipboardUi.value.busy,
)
// 輸入scope可以在新operation重建，原controller永遠不能復活。
function dropInput(): void {
  channel?.blur()
  input?.dispose()
  input = null
  channel?.dispose()
  channel = null
  if (ime.value) {
    ime.value.value = ''
    ime.value.blur()
  }
  inputFocused.value = false
  inputBusy.value = false
}
// view只公開固定分類，controller或lease的文字不得加入ref。
function operationIssue(code: OperationCode): void {
  if (alive) issue.value = code
}
// 操作終態先清DOM文字，所有private lease仍只由controller持有。
function clipboardChanged(ui: ClipboardUi): void {
  if (!alive) return
  clipboardUi.value = { ...ui }
  if (!ui.busy) clipboardDirection = ui.fallback === 'none' ? 'none' : ui.fallback
  domClipboard?.update(ui)
}
// 每revision建立一份InputChannel／DOM scope，ACK與failure closure都綁原owner。
function ensureInput(revision: number): void {
  if (channel || !canvas.value || !ime.value || !alive) return
  const owned = new InputChannel(
    /* primitive batch由Host派送。 */ (batch) => host.sendInput(batch),
    /* release只屬原revision。 */ (r) => host.releaseInput(r),
    /* 舊channel無權終止新operation。 */ () => {
      if (channel === owned) host.failInput(revision)
    },
    now,
  )
  channel = owned
  input = new InputController(canvas.value, ime.value, owned, operationIssue)
  input.bind()
}
// Host DTO不含frame／clipboard；終態清renderer以外的Main互動ownership。
function hostChanged(state: ConsoleState): void {
  if (!alive) return
  if (state.revision !== activeRevision) {
    dropInput()
    activeRevision = state.revision
    socketOpen.value = false
    issue.value = null
    quality.value = 'balanced'
    clipboard.setRevision(activeRevision)
  }
  phase.value = state.phase
  summary.value = state.peer ?? null
  stats.value = state.stats ?? null
  error.value = state.error ?? null
  inputState.value = state.input ?? null
  name.value = session.targetName
  if (state.phase === 'closed' || state.phase === 'failed') {
    dropInput()
    clipboard.close()
    socketOpen.value = false
  }
  session.phase(state.revision, state.phase)
}
// Main獨占renderer／AuthSession；所有互動回呼只接受safe primitive。
const host = new ConsoleHost(
  auth,
  hostChanged,
  // Main唯一renderer owner，每次明確重試重建，不重用已closed實例。
  (ack, failure, fps) => {
    if (!canvas.value) throw new Error('video_unsupported')
    return new CanvasRenderer(canvas.value, ack, failure, undefined, undefined, fps)
  },
  undefined,
  undefined,
  {
    // 精確ACK與當前channel標記比對，不視為遠端OS已執行。
    inputAck: (ack) => {
      if (alive && ack.revision === activeRevision) channel?.ack(ack)
    },
    // false立即撤銷焦點／文字與健康證據，不以舊MAC重設budget。
    activity: (revision, open) => {
      if (!alive || revision !== activeRevision) return
      socketOpen.value = open
      session.activity(revision, open)
      if (!open) {
        dropInput()
        clipboard.close()
      }
    },
    issue: operationIssue,
    // origin不在state；permission／generation失效由controller清ledger。
    inputState: (state) => {
      if (!alive || state.revision !== activeRevision) return
      inputState.value = state
      if (!state.clipboard || (!state.keyboard && clipboardDirection === 'copy')) clipboard.close()
      if (socketOpen.value && document.visibilityState !== 'hidden') {
        ensureInput(state.revision)
        input?.setState(state)
      }
    },
  },
  now,
)
// Native API只由使用者click呼叫，缺API明確進入短命fallback。
const clipboard = new ClipboardController(
  {
    // 不自動poll或同步local clipboard。
    readText: () => {
      if (!window.isSecureContext || !navigator.clipboard?.readText)
        return Promise.reject(new Error('clipboard_unavailable'))
      return navigator.clipboard.readText()
    },
    // 無法可靠abort已開始的OS write，epoch只防晚UI或第二次寫入。
    writeText: (value) => {
      if (!window.isSecureContext || !navigator.clipboard?.writeText)
        return Promise.reject(new Error('clipboard_unavailable'))
      return navigator.clipboard.writeText(value)
    },
  },
  {
    // Host再copy owned bytes，caller保留原buffer清除權。
    push: (bytes, signal) => host.pushClipboard(bytes, signal),
    // pull交owned bytes而非string／公開state。
    pull: (signal) => host.pullClipboard(signal),
    // 只取消目前operation的tag，confirmation gate仍由Host持有。
    cancel: () => host.cancelClipboard(),
  },
  clipboardChanged,
  now,
)
// RetryPhase與Protocol Phase分開；尚未open host的HTTP失敗亦有固定提示。
function retryChanged(value: RetryState): void {
  if (!alive) return
  retryState.value = { ...value }
  name.value = session.targetName
  if (value.phase === 'waiting' || value.phase === 'exhausted' || value.phase === 'stopped') {
    dropInput()
    clipboard.close()
    inputState.value = null
    socketOpen.value = false
    summary.value = null
    stats.value = null
    if (value.phase === 'waiting') {
      phase.value = 'connecting'
      error.value = null
    } else {
      phase.value = value.phase === 'exhausted' ? 'failed' : 'closed'
      error.value = value.code ?? null
    }
  } else if (value.phase === 'connecting' && !socketOpen.value) {
    phase.value = 'connecting'
    error.value = null
  }
}
const session = new ConsoleSession(auth, host, retryChanged, now)
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
// 專注只改本機布局；等待DOM幾何後重算，不重連、重建Worker或自動取焦。
async function setFocusMode(value: boolean): Promise<void> {
  if (!alive) return
  focusMode.value = value
  emit('focusModeChange', value)
  await nextTick()
  if (alive) resize()
}
// Direct route照樣驗UUID、latest can_connect／viewer硬上限與secure context。
function start(): void {
  if (!alive) return
  session.cancel()
  dropInput()
  clipboard.close()
  summary.value = null
  stats.value = null
  error.value = null
  issue.value = null
  quality.value = 'balanced'
  fullscreenUnavailable.value = false
  const id = String(route.params.targetId)
  if (
    !window.isSecureContext ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  ) {
    phase.value = 'failed'
    error.value = window.isSecureContext ? 'connection_failed' : 'insecure_context'
    return
  }
  session.setVisible(document.visibilityState !== 'hidden')
  session.start(id)
  phase.value = 'connecting'
}
// 使用者結束先作廢HTTP與Worker，renderer清空可見桌面。
function cancel(): void {
  session.cancel()
  dropInput()
  clipboard.close()
  inputState.value = null
  socketOpen.value = false
  error.value = null
  issue.value = null
  phase.value = 'closed'
}
// SAS專用gesture不奪一般keyboard焦點，inflight時不排第二次。
function sendCad(): void {
  if (!channel?.commandSas()) operationIssue('input_unsupported')
  inputBusy.value = channel?.inflight ?? false
}
// outbound只讀本機文字，不自動替使用者remote paste。
function sendLocalClipboard(): void {
  issue.value = null
  void clipboard.sendLocal()
  if (clipboardUi.value.busy) clipboardDirection = 'send'
}
// 明確gesture先啟動Host短訂閱，再由操作者於遠端複製；不保證讀取既有文字。
function copyRemoteClipboard(): void {
  issue.value = null
  void clipboard.copyRemote()
  if (clipboardUi.value.busy) clipboardDirection = 'copy'
}
// DOM文字短讀進privatecontroller，不使用v-model／reactive string副本。
function editClipboard(): void {
  if (clipboardText.value) clipboard.edit(clipboardText.value.value)
}
// 手動框不再次讀native clipboard，且保留原lease期限。
function submitClipboard(): void {
  void clipboard.submit()
  if (clipboardUi.value.busy) clipboardDirection = 'send'
}
// 重試copy是新gesture，不重讀remote或延長原文字期限。
function retryCopyClipboard(): void {
  void clipboard.copyFallback()
  if (clipboardUi.value.busy) clipboardDirection = 'copy'
}
// 明確user close一併清DOM與lease，正常程序close由獨立handler避免重入。
function closeClipboard(): void {
  clipboard.close()
  domClipboard?.close()
}
// 程序close事件可能晚於新框／submit，不能取消新的busy operation。
function clipboardClosed(): void {
  if (
    !clipboardDialog.value?.open &&
    clipboardUi.value.fallback !== 'none' &&
    !clipboardUi.value.busy
  )
    closeClipboard()
}
// 開關僅在此view RAM，不在storage復活failed session。
function changeReconnect(event: Event): void {
  session.setEnabled((event.target as HTMLInputElement).checked)
}
// hidden立即清焦點與文字，visible不重取focus或重開cycle。
function visibilityChanged(): void {
  const visible = document.visibilityState !== 'hidden'
  if (!visible) {
    dropInput()
    clipboard.close()
  } else if (inputState.value && socketOpen.value) {
    ensureInput(activeRevision)
    input?.setState(inputState.value)
  }
  session.setVisible(visible)
}
// bfcache／pagehide也取消operation，不能把native資源留到重新顯示。
function pageHidden(): void {
  cancel()
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
// 比較primitive tuple，same-user DTO clone／正常refresh不誤取消。
function actor(): AuthIdentity {
  return {
    phase: auth.phase,
    id: auth.user?.id ?? null,
    role: auth.user?.role ?? null,
    mfa: auth.user?.mfa_enrollment_required ?? false,
  }
}
watch(
  actor,
  /* 真身份／政策變動才清scope與outer session。 */ (value, previous) => {
    if (previous && !sameIdentity(value, previous)) {
      dropInput()
      clipboard.close()
      session.authChanged(value)
      phase.value = 'closed'
      inputState.value = null
      socketOpen.value = false
    }
  },
)
// 新target完全建立新operation。
watch(() => route.params.targetId, start)
// 包括目標與query在內的路由變更都取消舊專注外觀，不重放任何輸入。
watch(
  () => route.fullPath,
  () => {
    void setFocusMode(false)
  },
)
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
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('pagehide', pageHidden)
  if (clipboardDialog.value && clipboardText.value)
    domClipboard = new ClipboardDialog(
      clipboardDialog.value,
      clipboardText.value,
      clipboard,
      operationIssue,
    )
  // 此view唯一ticker，所有deadline自入口檢查；沒有per-frame新增timer。
  ticker = setInterval(() => {
    if (!alive) return
    channel?.tick()
    clipboard.tick()
    domClipboard?.tick()
    session.tick()
    inputFocused.value = input?.focused ?? false
    inputBusy.value = channel?.inflight ?? false
  }, 100)
  start()
})
// 離頁先作廢callback再清所有native／HTTP／DOM排程。
onBeforeUnmount(() => {
  alive = false
  emit('focusModeChange', false)
  if (ticker !== null) clearInterval(ticker)
  ticker = null
  dropInput()
  domClipboard?.dispose()
  domClipboard = null
  clipboard.dispose()
  session.dispose()
  observer?.disconnect()
  observer = null
  document.removeEventListener('fullscreenchange', resize)
  document.removeEventListener('visibilitychange', visibilityChanged)
  window.removeEventListener('pagehide', pageHidden)
})
</script>
<template>
  <ConsoleWorkspace :focused="focusMode" @update:focused="setFocusMode">
    <template #heading>
      <div>
        <h1>{{ t('consoleUI.title') }}</h1>
        <p>{{ name }}</p>
      </div>
    </template>
    <template #status>
      <p role="status" data-testid="console-phase">{{ t('consoleUI.phases.' + phase) }}</p>
      <p v-if="error" class="error-message" role="alert" :data-error-code="error">
        {{ t('consoleUI.errors.' + error) }}
      </p>
      <p
        v-if="issue || clipboardUi.code"
        role="status"
        data-testid="console-operation-error"
        :data-operation-code="issue || clipboardUi.code"
      >
        {{ t('consoleUI.operations.' + (issue || clipboardUi.code)) }}
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
      <p
        v-if="
          retryState.phase === 'waiting' ||
          (retryState.phase === 'connecting' && retryState.attempt > 0)
        "
        data-testid="console-reconnect"
        role="status"
      >
        {{ t('consoleUI.reconnecting', { count: retryState.attempt || 1 }) }}
      </p>
      <p v-if="inputFocused" data-testid="console-input-active" role="status">
        {{ t('consoleUI.inputActive') }}
      </p>
      <p v-if="fullscreenUnavailable" role="status" data-testid="console-fullscreen-unavailable">
        {{ t('consoleUI.fullscreenUnavailable') }}
      </p>
      <p v-if="clipboardUi.receiving" role="status" data-testid="console-clipboard-waiting">
        {{ t('consoleUI.clipboardWaiting') }}
      </p>
    </template>
    <template #toolbar>
      <section class="console-toolbar" :aria-label="t('consoleUI.controls')">
        <div class="console-toolgroup" role="group" :aria-label="t('consoleUI.textControls')">
          <button
            type="button"
            data-testid="console-clipboard-send"
            :disabled="!clipboardAvailable"
            @click="sendLocalClipboard"
          >
            {{ t('consoleUI.clipboardSend') }}
          </button>
          <button
            type="button"
            data-testid="console-clipboard-copy"
            aria-describedby="console-clipboard-help"
            :disabled="!clipboardAvailable || !inputState?.keyboard"
            @click="copyRemoteClipboard"
          >
            {{ t('consoleUI.clipboardCopy') }}
          </button>
          <p id="console-clipboard-help" data-testid="console-clipboard-help">
            {{ t('consoleUI.clipboardHelp') }}
          </p>
        </div>
        <div class="console-toolgroup" role="group" :aria-label="t('consoleUI.displayControls')">
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
        </div>
        <div class="console-toolgroup" role="group" :aria-label="t('consoleUI.connectionControls')">
          <button
            v-if="inputState?.platform === 'windows'"
            type="button"
            data-testid="console-cad"
            :disabled="
              !socketOpen ||
              !inputState.ready ||
              !inputState.keyboard ||
              !inputState.sas ||
              inputBusy
            "
            @click="sendCad"
          >
            {{ t('consoleUI.cad') }}
          </button>
          <label class="check-label"
            ><input
              type="checkbox"
              data-testid="console-auto-reconnect"
              :checked="retryState.enabled"
              @change="changeReconnect"
            />{{ t('consoleUI.autoReconnect') }}</label
          >
          <button type="button" class="danger" data-testid="console-end" @click="cancel">
            {{ t('consoleUI.end') }}
          </button>
        </div>
      </section>
    </template>
    <section ref="viewport" class="console-viewport" data-testid="console-viewport">
      <canvas ref="canvas" data-testid="console-canvas"></canvas>
      <textarea
        ref="ime"
        class="console-ime"
        :aria-label="t('consoleUI.input')"
        data-testid="console-ime"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      ></textarea>
    </section>
    <dialog
      ref="clipboardDialog"
      class="management-dialog"
      :aria-label="
        t(
          clipboardUi.fallback === 'copy'
            ? 'consoleUI.clipboardFallbackCopy'
            : 'consoleUI.clipboardSend',
        )
      "
      data-testid="console-clipboard-dialog"
      @close="clipboardClosed"
      @cancel="closeClipboard"
    >
      <label
        >{{ t('consoleUI.clipboardText')
        }}<textarea
          ref="clipboardText"
          data-testid="console-clipboard-text"
          :readonly="clipboardUi.fallback === 'copy'"
          :disabled="clipboardUi.busy"
          autocomplete="off"
          spellcheck="false"
          @input="editClipboard"
        ></textarea>
      </label>
      <div class="button-row">
        <button
          v-if="clipboardUi.fallback === 'send'"
          type="button"
          data-testid="console-clipboard-submit"
          :disabled="clipboardUi.busy"
          @click="submitClipboard"
        >
          {{ t('consoleUI.clipboardSend') }}
        </button>
        <button
          v-if="clipboardUi.fallback === 'copy'"
          type="button"
          data-testid="console-clipboard-retry-copy"
          :disabled="clipboardUi.busy"
          @click="retryCopyClipboard"
        >
          {{ t('consoleUI.clipboardFallbackCopy') }}
        </button>
        <button type="button" data-testid="console-clipboard-close" @click="closeClipboard">
          {{ t('targetUI.close') }}
        </button>
      </div>
    </dialog>
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
  </ConsoleWorkspace>
</template>
