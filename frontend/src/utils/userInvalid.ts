type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

// 讓 aria-invalid 與 CSS :user-invalid 同步：只在使用者改值離開欄位或送出失敗後才標記，修正後即清除，
// 避免輔助技術在載入或輸入途中提前宣告錯誤。元件自行設定的 aria-invalid="true"（如本地比對失敗）不覆寫。
// 不支援 :user-invalid 的瀏覽器直接略過，維持原生驗證行為。
export function installUserInvalidSync(root: Document): void {
  if (!CSS.supports('selector(:user-invalid)')) return
  const flagged = new WeakSet<Field>()
  // 依目前 :user-invalid 狀態更新單一欄位；未互動欄位設為 false，避免空白 required 欄位被提前讀成不合法。
  const sync = (target: EventTarget | null): void => {
    if (!(
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ))
      return
    if (target.matches(':user-invalid')) {
      target.setAttribute('aria-invalid', 'true')
      flagged.add(target)
    } else if (flagged.has(target) || target.getAttribute('aria-invalid') !== 'true') {
      target.setAttribute('aria-invalid', 'false')
      flagged.delete(target)
    }
  }
  // SPA 欄位會動態掛載，改在聚焦時補上初始 false，而非只在頁面載入時掃描一次。
  root.addEventListener(
    'focusin',
    (event) => {
      if (!(event.target instanceof Element) || !event.target.hasAttribute('aria-invalid'))
        sync(event.target)
    },
    true,
  )
  // 離開欄位或提交變更（checkbox、select）時顯示錯誤；輸入中只負責清除已修正的錯誤。
  root.addEventListener('focusout', (event) => sync(event.target), true)
  root.addEventListener('change', (event) => sync(event.target), true)
  root.addEventListener('input', (event) => {
    if (event.target instanceof Element && event.target.hasAttribute('aria-invalid'))
      sync(event.target)
  })
  // 送出失敗會對每個不合法欄位觸發 invalid（不冒泡），包含從未碰過的 required 欄位。
  root.addEventListener('invalid', (event) => sync(event.target), true)
  // reset 在事件之後才清除 :user-invalid，延到下一個工作再同步表單內所有欄位。
  root.addEventListener(
    'reset',
    (event) => {
      if (!(event.target instanceof HTMLFormElement)) return
      const form = event.target
      setTimeout(() => Array.from(form.elements).forEach(sync))
    },
    true,
  )
}
