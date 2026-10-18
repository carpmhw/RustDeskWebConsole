<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ConsoleWorkspace from '../src/components/ConsoleWorkspace.vue'
import { InputController } from '../src/rdweb/input-controller'
import { InputChannel } from '../src/rdweb/input-channel'
import { imageScale } from '../src/rdweb/renderer'
import type { Zoom } from '../src/rdweb/video-types'

const focused = ref(false)
const zoom = ref('fit')
const canvas = ref<HTMLCanvasElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const ime = ref<HTMLTextAreaElement | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const state = reactive({
  lastPoint: { x: -1, y: -1 },
  points: 0,
  keys: 0,
  releases: 0,
  issues: 0,
  ended: false,
  fullscreenUnavailable: false,
})
let controller: InputController | null = null
let channel: InputChannel | null = null
let observer: ResizeObserver | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let alive = true

// 只重算固定公開320×240畫面的CSS幾何，沿正式imageScale，不模擬串流或ACK。
function resize(): void {
  if (!alive || !canvas.value || !viewport.value) return
  const value = zoom.value === 'fit' || zoom.value === 'original' ? zoom.value : Number(zoom.value)
  const scale = imageScale(
    320,
    240,
    Math.max(1, viewport.value.clientWidth),
    Math.max(1, viewport.value.clientHeight),
    value as Zoom,
  )
  canvas.value.style.width = 320 * scale + 'px'
  canvas.value.style.height = 240 * scale + 'px'
}

// 本地專注模式只等待layout，不重新建立任何controller或自動取得輸入焦點。
async function focusMode(value: boolean): Promise<void> {
  focused.value = value
  await nextTick()
  resize()
}

// 公開原生dialog只驗焦點，不接ClipboardController或系統clipboard。
function openDialog(): void {
  dialog.value?.showModal()
}

// 公開fixture可結束本機controller，不能建立真正遠端session。
function end(): void {
  controller?.dispose()
  channel?.dispose()
  state.ended = true
  if (ticker !== null) clearInterval(ticker)
  ticker = null
}

// 沿原fullscreen元素實測瀏覽器成功／拒絕，只用布林記錄而不回傳exception。
async function fullscreen(): Promise<void> {
  try {
    await viewport.value!.requestFullscreen()
    state.fullscreenUnavailable = false
  } catch {
    state.fullscreenUnavailable = true
  }
}

// zoom變更在Vue更新後重算，同值不重建surface。
watch(zoom, () => {
  void nextTick(resize)
})

// 真InputController只接RAM batch port，不啟Host／Worker／WS或任何系統clipboard。
onMounted(() => {
  channel = new InputChannel(
    // 只保存固定事件計數與公開座標，忽略所有文字payload。
    (batch) => {
      for (const event of batch.events) {
        if (event.kind === 'button' && event.down) {
          state.lastPoint = { x: event.x, y: event.y }
          state.points++
        }
        if (event.kind === 'key' || event.kind === 'shortcut' || event.kind === 'text') state.keys++
      }
      // 本地測試credit只餵回原tag，不宣稱遠端收到或已執行。
      queueMicrotask(() =>
        channel?.ack({
          revision: batch.revision,
          input_generation: batch.input_generation,
          batch_id: batch.batch_id,
          sent: true,
        }),
      )
    },
    // 原controller失焦的release只記次數，不送往外部程序。
    () => {
      state.releases++
    },
    // 原channel背壓例外只留安全計數。
    () => {
      state.issues++
    },
    // 使用真單調時鐘，不放寬原deadline。
    () => performance.now(),
  )
  controller = new InputController(
    canvas.value!,
    ime.value!,
    channel,
    /* 固定錯誤只留計數。 */ () => {
      state.issues++
    },
  )
  controller.setState({
    revision: 1,
    input_generation: 1,
    display: { display: 0, width: 320, height: 240 },
    platform: 'linux',
    sas: false,
    ready: true,
    keyboard: true,
    clipboard: true,
  })
  controller.bind()
  // 與正式view一樣以有界ticker推進原channel的move節流與deadline。
  ticker = setInterval(() => {
    channel?.tick()
  }, 100)
  const context = canvas.value!.getContext('2d')!
  context.fillStyle = '#1d2424'
  context.fillRect(0, 0, 320, 240)
  context.fillStyle = '#ffffff'
  context.fillText('PUBLIC FIXTURE - NO REMOTE CONNECTION', 16, 24)
  observer = new ResizeObserver(resize)
  observer.observe(viewport.value!)
  document.addEventListener('fullscreenchange', resize)
  resize()
})

// 清理本元件擁有的DOM listener／observer與RAM channel，不操作真遠端資源。
onBeforeUnmount(() => {
  alive = false
  if (ticker !== null) clearInterval(ticker)
  ticker = null
  controller?.dispose()
  channel?.dispose()
  observer?.disconnect()
  document.removeEventListener('fullscreenchange', resize)
})
</script>
<template>
  <header v-show="!focused" class="app-header" data-testid="public-app-header">
    <div class="header-inner">公開管理導覽</div>
  </header>
  <ConsoleWorkspace :focused="focused" @update:focused="focusMode">
    <template #heading
      ><div>
        <h1>公開主控台fixture</h1>
        <p>public-target · 非真連線</p>
      </div></template
    >
    <template #toolbar>
      <section class="console-toolbar">
        <label
          >顯示比例<select v-model="zoom" data-testid="console-zoom">
            <option value="fit">fit</option>
            <option value="original">original</option>
            <option v-for="value in ['0.5', '1', '1.5', '2']" :key="value" :value="value">
              {{ value }}
            </option>
          </select></label
        >
        <button type="button" data-testid="console-fullscreen" @click="fullscreen">全螢幕</button>
        <button type="button" data-testid="public-dialog-open" @click="openDialog">
          公開文字框
        </button>
        <button type="button" data-testid="console-end" @click="end">結束</button>
      </section>
    </template>
    <template #status
      ><output data-testid="public-input-state">{{ JSON.stringify(state) }}</output></template
    >
    <section ref="viewport" class="console-viewport" data-testid="console-viewport">
      <canvas ref="canvas" width="320" height="240" data-testid="console-canvas"></canvas>
      <textarea
        ref="ime"
        class="console-ime"
        aria-label="公開遠端文字輸入"
        data-testid="console-ime"
      ></textarea>
    </section>
    <dialog ref="dialog" class="management-dialog" aria-label="公開文字框">
      <label>公開文字<textarea></textarea></label>
    </dialog>
  </ConsoleWorkspace>
</template>
