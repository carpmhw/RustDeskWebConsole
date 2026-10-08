<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withBase, runtimeBase } from './utils/basePath'
import { displayTimeZones, formatTimestamp, readTimeZone, saveTimeZone } from './utils/dateTime'

// 延後存取瀏覽器儲存，隱私模式封鎖時由偏好工具安全回退。
const storage = {
  // 讀取非敏感的個人顯示偏好。
  getItem: (key: string) => window.localStorage.getItem(key),
  // 保存偏好，儲存例外由共用工具處理。
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
}
const timeZone = ref(readTimeZone(storage, window.RDWEB_CONFIG?.defaultDisplayTimeZone))
const zones = displayTimeZones(timeZone.value)
const status = ref('正在檢查')
const timestamp = ref<string | null>(null)
// 顯示時間由個人偏好轉換，不改動 API 回傳的 UTC 原值。
const displayTime = computed(() => formatTimestamp(timestamp.value, timeZone.value))

// 更新時區時僅保存個人偏好，不影響伺服器 log 設定。
function updateTimeZone(): void {
  saveTimeZone(storage, timeZone.value)
}

// 查詢 M0 健康端點並提供可辨識的連線狀態。
async function loadHealth(): Promise<void> {
  try {
    const response = await fetch(withBase('api/v1/health'), { cache: 'no-store' })
    if (!response.ok) throw new Error('健康檢查失敗')
    const body: { status: string; timestamp: string } = await response.json()
    status.value = body.status === 'ok' ? '服務正常' : '服務未就緒'
    timestamp.value = body.timestamp
  } catch {
    status.value = '無法連線至後端'
  }
}

onMounted(loadHealth)
</script>

<template>
  <main>
    <header>
      <span class="badge">M0 · 環境驗證</span>
      <h1>RustDesk Web Console</h1>
      <p>瀏覽器遠端主控台的開發基礎</p>
    </header>
    <section aria-labelledby="status-title">
      <h2 id="status-title">服務狀態</h2>
      <p class="status" data-testid="health-status">{{ status }}</p>
      <dl>
        <dt>站台掛載路徑</dt>
        <dd>{{ runtimeBase() || '/' }}</dd>
        <dt>最後檢查時間</dt>
        <dd data-testid="timestamp">{{ displayTime }}</dd>
        <dt>顯示時區</dt>
        <dd>{{ timeZone }}</dd>
      </dl>
      <button type="button" @click="loadHealth">重新檢查</button>
    </section>
    <section aria-labelledby="preferences-title">
      <h2 id="preferences-title">個人顯示偏好</h2>
      <label for="timezone">頁面時區</label>
      <select id="timezone" v-model="timeZone" @change="updateTimeZone">
        <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
      </select>
      <p>預設台北時間。選擇會儲存在此瀏覽器，與伺服器日誌時區獨立。</p>
    </section>
    <footer>
      <span>資料與 API 使用 UTC</span>
      <a href="https://github.com/carpmhw/RustDeskWebConsole" rel="noopener noreferrer"
        >原始碼 · AGPL-3.0-or-later</a
      >
    </footer>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  background: #f4f6f8;
  color: #18313d;
  font-family: system-ui, sans-serif;
}
main {
  max-width: 800px;
  margin: 64px auto;
  padding: 0 24px;
}
header {
  margin-bottom: 32px;
}
h1 {
  font-size: clamp(24px, 5vw, 36px);
  margin: 16px 0 8px;
}
h2 {
  font-size: 20px;
  margin-top: 0;
}
p,
dt,
footer {
  color: #526774;
}
section {
  padding: 28px;
  margin-bottom: 20px;
  border: 1px solid #dbe3e8;
  background: white;
  border-radius: 12px;
}
.badge {
  color: #16605c;
  background: #ddf1e9;
  border-radius: 20px;
  padding: 6px 12px;
  font-size: 13px;
}
.status {
  color: #16605c;
  font-size: 22px;
  font-weight: 600;
}
dl {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
button,
select {
  padding: 10px 14px;
  font: inherit;
  border: 1px solid #b8cbd5;
  border-radius: 6px;
  background: white;
}
button {
  cursor: pointer;
  color: #16605c;
}
label {
  display: block;
  margin-bottom: 10px;
}
select {
  width: 100%;
  max-width: 360px;
}
footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
}
a {
  color: #16605c;
}
</style>
