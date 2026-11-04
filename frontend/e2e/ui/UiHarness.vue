<script setup lang="ts">
import { ref } from 'vue'
import DisplayPreferences from '../../src/components/DisplayPreferences.vue'
import ConsoleHarness from './ConsoleHarness.vue'

const dialog = ref<HTMLDialogElement | null>(null)
const endpoint = 'rdweb-server-' + 'public-long-endpoint-'.repeat(12) + '.example.invalid:21116'
const preferencesScene = new URLSearchParams(window.location.search).get('scene') === 'preferences'
const consoleScene = new URLSearchParams(window.location.search).get('scene') === 'console'

// 只操作公開dialog，不呼叫認證、遠端輸入或系統剪貼簿。
function openDialog(): void {
  dialog.value?.showModal()
}

// 關閉公開dialog，讓鍵盤與原生Escape路徑可被瀏覽器實測。
function closeDialog(): void {
  dialog.value?.close()
}
</script>

<template>
  <ConsoleHarness v-if="consoleScene" />
  <main v-else-if="preferencesScene" class="app-main">
    <section class="card card-body"><DisplayPreferences /></section>
  </main>
  <main v-else class="app-main">
    <div class="page-intro">
      <div>
        <h1 id="page-title" data-contrast="text">公開工作區樣式</h1>
        <p id="page-hint" data-contrast="text">
          Public workspace visual fixtures, not a live console.
        </p>
      </div>
    </div>
    <section class="card">
      <div class="card-header">
        <h2 id="section-title" data-contrast="text">表單與狀態</h2>
        <span id="neutral" class="status-pill" data-contrast="text">尚未連線</span>
      </div>
      <div class="card-body">
        <span id="support" class="summary-icon" data-contrast="text">RD</span>
        <div class="button-row">
          <span id="badge-neutral" class="status-pill status-pill--neutral" data-contrast="text"
            >未檢查</span
          >
          <span id="badge-success" class="status-pill status-pill--success" data-contrast="text"
            >成功</span
          >
          <span id="badge-warning" class="status-pill status-pill--warning" data-contrast="text"
            >注意</span
          >
          <span id="badge-danger" class="status-pill status-pill--danger" data-contrast="text"
            >失敗</span
          >
        </div>
        <p id="body-text" data-contrast="text">固定公開資料，不含帳號、票證或真實遠端內容。</p>
        <p id="success" class="success-message" role="status" data-contrast="text">操作成功</p>
        <p id="warning" class="notice" role="status" data-contrast="text">需要注意的設定</p>
        <p id="error" class="error-message" role="alert" data-contrast="text">此操作無法完成</p>
        <div class="form-grid">
          <div>
            <label id="name-label" for="public-name" data-contrast="text">名稱</label>
            <input
              id="public-name"
              placeholder="Public name"
              data-contrast="text border placeholder focus"
            />
          </div>
          <div>
            <label for="public-select">語言</label>
            <select id="public-select" data-contrast="text border focus">
              <option>繁體中文</option>
              <option>English</option>
            </select>
          </div>
        </div>
        <label for="public-text">公開文字</label>
        <textarea id="public-text" data-contrast="text border focus">
Only a public fixture.</textarea>
        <div class="button-row">
          <button id="primary" type="button" class="primary" data-contrast="text focus">
            主要操作
          </button>
          <a id="primary-link" class="primary" href="#page-title" data-contrast="text focus"
            >連線入口</a
          >
          <button id="secondary" type="button" class="secondary" data-contrast="text border focus">
            次要操作
          </button>
          <button id="danger" type="button" class="danger" data-contrast="text border focus">
            刪除
          </button>
          <button id="disabled" type="button" disabled data-contrast="text border">
            目前不可用
          </button>
          <button
            id="open-dialog"
            type="button"
            data-contrast="text border focus"
            @click="openDialog"
          >
            公開對話框
          </button>
        </div>
        <div class="choice-buttons">
          <button id="selected" type="button" aria-pressed="true" data-contrast="text border focus">
            已選取
          </button>
          <button
            id="unselected"
            type="button"
            aria-pressed="false"
            data-contrast="text border focus"
          >
            未選取
          </button>
        </div>
        <details>
          <summary id="disclosure" data-contrast="text focus">公開說明</summary>
          <p>不會儲存或連線至任何服務。</p>
        </details>
      </div>
      <div class="table-scroll" tabindex="0" aria-label="公開資料表">
        <table class="management-table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>RustDesk ID</th>
              <th>Saved endpoint</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Public workspace with a long English name</td>
              <td>123456789</td>
              <td>{{ endpoint }}</td>
              <td><button type="button">編輯</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <dialog ref="dialog" class="management-dialog" aria-labelledby="dialog-title">
      <h2 id="dialog-title" data-contrast="text">公開對話框</h2>
      <label for="dialog-name">名稱</label>
      <input id="dialog-name" data-contrast="text border focus" />
      <div class="button-row"><button type="button" @click="closeDialog">關閉</button></div>
    </dialog>
  </main>
</template>
