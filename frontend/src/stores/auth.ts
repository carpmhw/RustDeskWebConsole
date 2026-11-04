import { defineStore } from 'pinia'
import { computed, shallowRef, ref } from 'vue'
import { HttpClient, HttpError } from '../api/client'
import { AuthSession } from '../api/session'

// 敏感狀態留在閉包的session私有RAM，Pinia僅暴露安全user與phase。
export const useAuthStore = defineStore('auth', () => {
  const session = new AuthSession(new HttpClient())
  const state = shallowRef(session.state)
  const notice = ref<string | null>(null)
  const logoutPending = ref(false)
  // 狀態更新不包含access／CSRF／MFA票證。
  session.subscribe((value) => {
    state.value = value
  })
  const user = computed(() => state.value.user)
  const phase = computed(() => state.value.phase)
  // 登出失敗保留重試入口，即使本機已匿名。
  async function logout(): Promise<void> {
    try {
      await session.logout()
      logoutPending.value = false
      notice.value = null
    } catch {
      logoutPending.value = true
      notice.value = 'logout_failed'
    }
  }
  // 只取安全分類，不把HTTP body／錯誤message呈現給使用者。
  function errorCode(error: unknown): string {
    return error instanceof HttpError ? error.code : 'service_unavailable'
  }
  return {
    phase,
    user,
    notice,
    logoutPending,
    logout,
    errorCode,
    // 管理頁只使用authorized client，不暴露private access；文字模式供metadata匯出。
    request: <T>(
      path: string,
      method = 'GET',
      body?: unknown,
      signal?: AbortSignal,
      format: 'json' | 'text' = 'json',
    ) => session.request<T>(path, method, body, signal, format),
    // 各action只呼叫RAM session，不使用持久化插件。
    restore: () => session.restore(),
    // 密碼只作為當次request參數，離頁時可取消傳輸。
    login: (username: string, password: string, signal?: AbortSignal) =>
      session.login(username, password, signal),
    // 第二步只傳code，不讓view取得票證。
    verifyMfa: (code: string) => session.verifyMfa(code),
    // 返回帳密或離頁時清除未完成的身分驗證。
    cancelMfa: () => session.cancelMfa(),
    // 綁定secret只回給短命view。
    enroll: (password: string, signal?: AbortSignal) => session.enroll(password, signal),
    // 完成確認後只回一次性codes。
    confirm: (code: string, signal?: AbortSignal) => session.confirm(code, signal),
    // 重產使用後端二次驗證。
    regenerate: (proof: { password?: string; code?: string }, signal?: AbortSignal) =>
      session.regenerate(proof, signal),
    // 停用後由session清除認證。
    disable: (proof: { password?: string; code?: string }, signal?: AbortSignal) =>
      session.disable(proof, signal),
  }
})
