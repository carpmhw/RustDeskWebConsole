# 獨立RustDesk協定測試接收器

此工具是診斷用的新測試peer，不是官方RustDesk替代品。它沿正式Web Console認證、編碼及加密路徑接收，在RAM比對本輪公開文字與鍵事件；不注入Windows、不讀桌面或剪貼簿、不保存原文。成功只證到此receiver的路徑，不證官方client或OS注入正確。

來源版可在原 `receiver_result` 後額外輸出一次 `receiver_diagnostic,` 安全終態：只含固定失敗階段／原因與各資源收尾狀態，不含識別碼、時間或payload。缺失／畸形／重複marker視為unknown，不代表成功；診斷不改原結果schema、分類或exit code。此能力須另行授權重新出包後才會存在於新包，既有可攜包不會自動更新，亦不得為取診斷重播已使用輪次。

## 目前界線

- 可攜建置固定使用官方 **Node.js v24.22.1 win-x64**，來源及hash見同來源目錄的 `node-runtime-pin.json`；不支援將此包當成ARM64 runtime。官方checksum已以固定release key驗簽，archive、`node.exe`及完整LICENSE皆已逐項核對；這不代表Windows原生執行或server互通已驗。
- Linux公開測試不是Windows PowerShell／TTY／DACL或真hbbs／hbbr互通證據。
- 新runtime下載／打包、新target／ACL、Docker、UDP註冊／TCP連線及Windows每輪操作均需另行授權；不要直接重播舊診斷入口。

## 可攜包內容與完整性

僅含同目錄官方`node.exe`、`receiver.mjs`、固定公開WPT VP8素材、啟動入口、既有私有路徑守衛、完整Node／AGPL／第三方授權及`integrity.json`。不含node_modules、cache、資料庫、真輪binding、密碼、票證或測試紀錄；不需要系統安裝Node／.NET或現場npm安裝。

`LICENSE.Node.txt`保留官方archive內的完整Node及第三方條款；bundle的TweetNaCl／protobuf.js／Long與公開WPT素材來源及原授權見 `THIRD_PARTY_NOTICES.md`／`CODEC_FIXTURES.md`。接收器及生成schema仍為AGPL來源；本診斷包不是公開發布，向其他接收者再散布前須一併提供該包確切版本的完整對應原始碼及建置來源，不能以未提交的本機程式冒充公開已發布版本。

取得包後，先以另行可信交接的ZIP SHA-256核對下載，再解壓到全新目錄；`integrity.json`列出除自己以外全部allowlist成員的SHA-256，不是數位簽章，也不能抵抗同時竄改檔案及清單。來源不符或有額外檔案即停，不執行入口。`node.exe`的官方簽章不會替自製bundle或PS入口背書。

準備時須先核對Windows架構、指定server／明確ports與公鑰，取得新的測試ID／run；只在新的owner-only NTFS目錄放小型`binding.json`／`connection.json`，密碼只能程序環境或可信TTY隱藏輸入。入口建立exclusive launch claim並複製設定至新子目錄，來源與所有失敗產物保留，不刪原檔、不改舊ACL。請在該新子目錄找安全`result.json`，不要上傳整個資料夾或任何原文。

只有政策允許且精確單次範圍已核准時才啟動`.cmd`；它只使用同目錄runtime。SmartScreen、AppLocker、PowerShell政策、UDP或防火牆阻擋就停，不Bypass、不改政策或自動加規則。

## 判讀

終端只回固定code與安全布林：`receiver_match`／`receiver_mismatch`／`receiver_unavailable`，exit依序0／1／2。本地match尚須與同輪Console身份驗證、真首影像、加密前五鍵安全摘要及正常收尾join；不可用不能改判不符，也不能以此覆寫原HR失敗。

來源版Windows PowerShell入口在載入同目錄守衛模組失敗時，只向stderr輸出固定`receiver_entry_load_unavailable`並exit 2；進入main後的拒絕仍為`receiver_unavailable`／exit 2。兩者都不輸出原始例外、路徑或秘密，也不代表連線成功。dot-source載入失敗仍拋出例外，不輸出此獨立分類。此區分僅適用含新版入口的來源／包；既有包不會自動更新，不能以舊包的共用錯誤行判定已到達main，亦不得為確認分類重播已使用輪次。

預設整案180秒含最多2秒收尾，完整五鍵後receiver自行觀察5秒；Client不因本地5秒完成就主動斷線。上限／取消／異常及資料不足都保留失敗，沒有自動重連或重放。RAM-only不保證JS字串、GC、OS swap或crash dump能物理抹除，不為此改系統設定。

## 開發入口

在`frontend`內執行：

```sh
corepack pnpm exec vitest run --config e2e/config/vitest.receiver.config.ts
corepack pnpm exec tsc -p e2e/config/tsconfig.receiver.json
```

在repo根目錄執行純公開建置測試：

```sh
node frontend/e2e/scripts/test-build-test-receiver.mjs
```

此測試只解析不可執行的公開PE metadata fixture，並以目前Linux Node執行新編譯JS的`--help`；它不下載或執行Windows runtime，也不產生可部署包。正式`buildReceiverPortable`要求事先核准並保存的`node-runtime-pin.json`與輸入pin完全一致；pin格式驗證本身不等於官方簽章、維護或漏洞核對已完成。
