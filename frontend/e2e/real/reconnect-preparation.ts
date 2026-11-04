import type { Page } from '@playwright/test'
import { setTimeout as pause } from 'node:timers/promises'

export interface ReconnectPreparation {
  focused: boolean
  draftPresent: boolean
  inputActive: boolean
  receiving: boolean
}

// 只回固定四布林，不回傳DOM文字、不碰原生clipboard、網路或任何secret。
export function reconnectPreparation(page: Page): Promise<ReconnectPreparation> {
  return page.evaluate(
    /* 同一DOM task取四項，避免分別讀取時混用不同時刻。 */ () => {
      const ime = document.querySelector<HTMLTextAreaElement>('[data-testid="console-ime"]')
      return {
        focused: !!ime && document.activeElement === ime,
        draftPresent: !!ime && ime.value.length > 0,
        inputActive: !!document.querySelector('[data-testid="console-input-active"]'),
        receiving: !!document.querySelector('[data-testid="console-clipboard-waiting"]'),
      }
    },
  )
}

// 只輸出固定欄位，不把草稿、DOM或原生例外當作錯誤內容。
function failed(state: ReconnectPreparation): never {
  throw new Error('reconnect_precondition_failed ' + JSON.stringify(state))
}

// 前置最多1秒條件式等待，不能自動focus或重啟receive；cut後原1秒窗完全不動。
export async function prepareReconnectCut(page: Page): Promise<ReconnectPreparation> {
  const deadline = performance.now() + 1000
  let state: ReconnectPreparation = {
    focused: false,
    draftPresent: false,
    inputActive: false,
    receiving: false,
  }
  try {
    state = await reconnectPreparation(page)
    while (!state.focused || !state.inputActive) {
      if (!state.receiving || performance.now() >= deadline) failed(state)
      await pause(Math.min(20, Math.max(1, deadline - performance.now())))
      state = await reconnectPreparation(page)
    }
    if (!state.receiving || performance.now() >= deadline) failed(state)
    state = await page.evaluate(
      /* 同一task驗準備狀態後才建立公開未完成composition，非OS IME驗收。 */ () => {
        const ime = document.querySelector<HTMLTextAreaElement>('[data-testid="console-ime"]')
        if (!ime)
          return { focused: false, draftPresent: false, inputActive: false, receiving: false }
        if (
          document.activeElement !== ime ||
          !document.querySelector('[data-testid="console-input-active"]') ||
          !document.querySelector('[data-testid="console-clipboard-waiting"]')
        ) {
          return {
            focused: document.activeElement === ime,
            draftPresent: ime.value.length > 0,
            inputActive: !!document.querySelector('[data-testid="console-input-active"]'),
            receiving: !!document.querySelector('[data-testid="console-clipboard-waiting"]'),
          }
        }
        ime.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
        ime.value = 'Public unfinished composition'
        ime.dispatchEvent(
          new InputEvent('beforeinput', {
            inputType: 'insertCompositionText',
            isComposing: true,
            data: 'Public unfinished composition',
            bubbles: true,
          }),
        )
        return {
          focused: document.activeElement === ime,
          draftPresent: ime.value.length > 0,
          inputActive: !!document.querySelector('[data-testid="console-input-active"]'),
          receiving: !!document.querySelector('[data-testid="console-clipboard-waiting"]'),
        }
      },
    )
    if (
      performance.now() >= deadline ||
      !state.focused ||
      !state.draftPresent ||
      !state.inputActive ||
      !state.receiving
    )
      failed(state)
    return state
  } catch {
    // 最後一份scalar仍可定位分量，原生DOM／locator／page error不向外攜帶。
    failed(state)
  }
}
