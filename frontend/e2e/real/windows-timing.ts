// RustDesk 1.5.0／1.5.1 開源版受控端每個新連線都會讓連線管理視窗 windowOnTop 搶前景，授權 3 秒後才自動縮小
// （flutter/lib/models/server_model.dart `_addTab`／`cmHiddenTimer`）；allow-hide-cm 僅 Pro／自訂 client 有效。
// 這是第三方受控端 UI 的已知計時行為，不是放寬判定；等待後的第一次點擊即可把鍵盤焦點交回記事本。
export const WINDOWS_CM_SETTLE_MS = 4000

// 只有 Windows 受控端需要等待連線管理視窗縮小；Linux 測試目標沒有此視窗。
export function cmSettleMs(platform: 'linux' | 'windows'): number {
  return platform === 'windows' ? WINDOWS_CM_SETTLE_MS : 0
}

// Windows 記事本在點擊後套用 Ctrl+A 全選較慢，緊接的 Ctrl+C／Ctrl+V 會在無選取時執行。
// 不經 RustDesk／RdWeb 的 SendInput 隔離實驗：點擊後兩組合鍵緊接 13～17/20，間隔 50ms 以上 40/40；
// 取一倍餘裕模擬真人按鍵節奏，只用於 Windows 真機 oracle 的連續組合鍵之間，不放寬判定。
export const WINDOWS_CHORD_GAP_MS = 100

// Windows 在 500ms 內且距離 4px 以內的兩次點擊判為雙擊並選取游標下的字（2026-11-01 WS B 段只取代了 `Public`）。
// Windows oracle 第 n 次點擊沿編輯區第一行右移 40px，遠超雙擊矩形，不需等待也不會形成雙擊；之後 Ctrl+A 仍全選。
export function windowsClickAnchor(
  editor: { x: number; y: number },
  n: number,
): { x: number; y: number } {
  return { x: editor.x + 20 + 40 * n, y: editor.y + 30 }
}

// 負載下記事本偶爾晚於 Ctrl+A 處理編輯區點擊而取消全選（E2E 約 5%，加長間隔無效）。
// 接收／貼上前改點標題列空白處：canvas 仍取得鍵盤焦點，記事本游標與選取不變。偏移依 Windows 11 記事本
// （分頁列＋選單列、約 125% 縮放）量測：標題列在編輯區上方約 55px，空白區在 x≈312–967；版面不同須重量。
export function windowsTitleBarAnchor(
  editor: { x: number; y: number },
  n: number,
): { x: number; y: number } {
  return { x: editor.x + 400 + 40 * n, y: editor.y - 55 }
}
