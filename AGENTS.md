# 專案開發指南

本檔適用於整個儲存庫。RustDesk Web Console 是 AGPL-3.0-or-later 的自架瀏覽器遠端主控台：Vue 前端透過 ASP.NET Core 後端橋接既有 RustDesk hbbs／hbbr，資料使用 SQLite，KV 預設行程內記憶體、可選 Redis。

## 開始工作前

1. 使用繁體中文溝通、撰寫說明與手寫程式註解。
2. 先執行 `git status --short`，辨識既有修改與未追蹤檔；不得覆寫、還原或清除不屬於本次任務的工作。
3. 閱讀 `README.md` 與任務涉及的程式、測試和設定；流程文件以目前採用的 Superpowers 或 OpenSpec 為主：
   - Superpowers：閱讀相關 `docs/superpowers/specs/`、`docs/superpowers/plans/` 與該流程要求的既有任務紀錄。
   - OpenSpec：閱讀相關 `openspec/` 規格與 change 的 proposal、design、tasks。
   - 舊總計畫、`docs/DECISIONS.md`、驗收／協定文件僅在涉及既有需求、資安基線、版本或歷史證據時按需參考，不要求每次同步維護。
4. 按 M0 → M5 順序開發，完成對應驗收後再進下一里程碑。已核准的後續決策需與原計畫一併閱讀；發現矛盾時明確指出，影響需求或資安的部分先確認。
5. 進度以所選流程的任務狀態、實際驗證結果及當前實作核對，不以 README 的歷史測試數量或檔案存在判定完成。本機文件若缺少，先依既有規格與程式確認現況，缺乏必要需求時向使用者詢問。

## 工作流程與紀錄

- 同一任務以 Superpowers 或 OpenSpec 擇一為主要流程；已有進行中的流程就沿用，不另外建立另一套平行規格、計畫或進度紀錄。
- 只建立所選流程要求的必要文件，設計、任務、決策與進度直接更新該流程的既有文件。簡單修正或文件調整直接處理，不為套流程而新增設計或計畫。
- 不額外建立或同步獨立的進度帳本、決策日誌、驗收報告、操作卡、自審摘要、驗證 JSON 或任務來源雜湊清單；即使放在流程目錄內，也不新增框架未要求的紀錄。這項約定取代舊計畫中要求重複留存工作紀錄的做法，不降低既有驗證或資安標準。
- 驗證結果、未驗項目、阻塞與操作授權範圍直接在對話回報；需要持續追蹤時更新所選流程的既有任務文件，不再另寫一份報告。測試原始輸出沿用工具既有機制，不另製多份摘要或副本。
- 舊文件可先將有效需求、重要決策、必要限制、PASS／FAIL 結果與未完成項目摘要整合至所選流程的既有文件；核對無遺漏並更新引用後，可刪除已被摘要取代的舊文件，不另建摘要檔，也不得改判或隱去歷史失敗與阻塞。
- 實際刪除範圍須明確，未指定具體文件時先確認，不憑檔名或日期批次清除。仍在使用的規格、測試 fixture、必要原始證據及授權／來源資料，不視為可自動刪除的舊文件。
- 產品使用文件、必要授權／第三方來源聲明與 pinned 協定雜湊仍依實際變更維護，不屬於額外工作紀錄。

## 目錄導覽

| 路徑                                              | 職責                                            |
| ------------------------------------------------- | ----------------------------------------------- |
| `src/RdWeb.Api/Endpoints/`                        | Minimal API 端點與路由群組                      |
| `src/RdWeb.Api/Security/`、`Targets/`             | 認證、授權、Vault 與目標服務                    |
| `src/RdWeb.Api/Data/`                             | 正式 `AppDbContext`、實體與 migrations          |
| `src/RdWeb.Api/Infrastructure/`、`Configuration/` | KV、稽核、代理路徑、設定與共用基礎設施          |
| `src/RdWeb.Api/RustDesk/`                         | 固定來源協定、rendezvous／relay 與橋接          |
| `src/RdWeb.Api/Cli/`                              | bootstrap、金鑰輪替等 CLI                       |
| `src/RdWeb.Tests/`                                | xUnit、API 整合、SQLite／KV 契約及協定測試      |
| `frontend/src/api/`、`stores/`、`router/`         | HTTP、認證狀態與路由                            |
| `frontend/src/views/`、`components/`、`i18n/`     | 頁面、元件與翻譯                                |
| `frontend/src/rdweb/`                             | Protocol Worker、加密、影像、輸入、剪貼簿與重連 |
| `frontend/src/utils/basePath.ts`                  | 執行期 subpath 與 HTTP／WebSocket URL 工具      |
| `frontend/e2e/`                                   | E2E 案例、設定、fixture、runner 與專用容器      |
| `deploy/dev/`                                     | 共用開發 Compose、API／web 映像及 Redis 測試    |
| `tools/`                                          | 共用 fixture、回歸及授權檢查工具                |
| `.github/workflows/ci.yml`                        | CI 分流、日常檢查與發布前 E2E                   |

`deploy/dev/` 是開發與驗收環境；正式部署能力須依 M4 計畫與驗收確認。

## 程式與資料規範

- 所有手寫函數、方法與測試函數添加繁體中文註解，說明目的或重要限制；工具生成檔保留原格式。
- 遵守 `.editorconfig`：UTF-8、LF、檔尾換行；C# 四空白，其餘預設兩空白。前端遵循現有 ESLint／Prettier 設定，不做無關的全庫格式化。
- 後端維持 nullable、warnings-as-errors、分析器及 NuGet audit；不以停用檢查、Native AOT 或 trimming 迴避問題。
- 沿用現有服務分層、DTO、錯誤碼與取消機制，避免將業務邏輯堆進 `Program.cs` 或頁面。新增介面行為同步檢查前後端契約。
- 前端沿用現有 Vue／TypeScript、Pinia、Vue Router、vue-i18n 和原生元件；使用既有主題色票，介面文字更新相應語系。
- 資料庫及 API 時間一律 UTC；頁面預設 `Asia/Taipei` 並允許使用者選擇時區；log 預設 UTC，以 `LOG_TIME_ZONE` 獨立設定，不依賴宿主本地時間。
- SQLite 維持 WAL、每連線外鍵檢查、短交易與整數 `Version` 樂觀並發。Redis 不解除 SQLite 單實例限制。
- 正式 migration 指定 `AppDbContext`，輸出至 `Data/Migrations`；M0 的 `SpikeDbContext`／migration 分開處理。Migration 必須在真實 SQLite 驗證。
- API、WebSocket 與路由須支援執行期 subpath；沿用 `withBase`／`buildWsUrl` 等共用工具，不硬編碼根路徑 `/api` 或手動重複套前綴。

## 資安與協定邊界

- 不把金鑰、密碼、JWT、票證、TOTP secret、備援碼或真實剪貼簿內容放入 log、快照、報告或 commit。錯誤回應及稽核只使用既有安全分類與允許欄位。
- 敏感設定由程序環境注入，不放 `.env`、命令列參數或範例常值；不提交資料庫、測試私鑰與認證 fixture。
- Access／MFA 票證只留私有記憶體，refresh 使用 HttpOnly cookie；不把敏感狀態放 localStorage、公開 Pinia state 或跨分頁訊息。離頁、登出及取消後，晚到回應不得恢復舊資料。
- 保留 Origin／CSRF、MFA、ACL、限流、CSP、SSRF／DNS 驗證、簽章與 MAC 檢查。不得為測試通過調低正式限制或加入成功捷徑。
- 後端只能連管理員保存並通過驗證的 hbbs／hbbr；瀏覽器不得任意指定目的地。WS 使用保存的 listener，不自行推算 port 或 TLS 路徑。
- RustDesk 協定以 `src/RdWeb.Api/RustDesk/Protos/UPSTREAM.md` 的 pinned 上游與 SHA-256 為準，不憑記憶手寫欄位、不追 `master`。Client 驗收版本與 schema／能力自報版本分開管理。
- C# proto 由建置產生；前端由 `frontend/scripts/generate-rustdesk-proto.mjs` 產生至 `frontend/src/rdweb/generated/`。修改來源或生成流程後重新生成，不直接修生成檔，也不跳過雜湊檢查。
- 保持 Main／Worker 權責：Main 負責 AuthSession、HTTP 與呈現；Protocol Worker 持有 WS、RustDesk 金鑰／nonce 與 decoder。目標密碼及 login-assist 中間雜湊留在後端。
- 橋接、影像、輸入及剪貼簿必須維持有界容量、背壓、逾時與資源釋放；重試使用新連線所需的 ticket／Worker／金鑰，不重放結果不明的協定操作。
- `fzstd` 使用 `frontend/pnpm-workspace.yaml` 宣告的固定版本 patch；不得直接修改 `node_modules` 或略過 patch／負向 fixture 驗證。
- 新增計畫外依賴、變更授權或降低資安基線前先詢問使用者；協定與預期不符且兩小時內無法釐清時，回報證據與阻塞，不繼續猜測。新增依賴需檢查維護狀態、授權、漏洞並更新鎖檔與來源紀錄。

## 建置與驗證

### 先確認影響範圍，再選擇檢查

- 修改前先確認涉及的檔案、行為、呼叫端及共用契約，簡述本次調整與預計驗證範圍；範圍明確時直接執行，有歧義才詢問使用者。
- 日常修改以能覆蓋受影響行為的最小檢查集合為原則，不因修改任何檔案就執行整套前後端測試、Docker／E2E 矩陣或全部 audit。
- 局部邏輯修改跑對應測試與修改檔案的 format／lint；涉及型別、編譯、生成流程或打包時，加跑相關專案的型別檢查／build。
- 共用契約、認證、授權、資料庫或協定修改，依呼叫關係擴大至相關整合與負向測試；影響安全邊界不代表必須重跑無關模組。
- 依賴／鎖檔／第三方來源有變更時，執行相關 audit 與授權檢查；純文件修改只檢查內容、引用與格式。
- 全面回歸只在里程碑驗收、跨模組廣泛影響、針對性結果顯示可能有廣泛回歸，或使用者明確要求時執行；執行前說明擴大範圍的理由。CI 依 `frontend/e2e/README.md` 的日常／發布前策略執行，不將 CI 的代表性路徑覆蓋稱為原六組完整功能矩陣。
- 必要檢查通過後即可交付；沒有新修改、失敗或未解疑慮時，不重複或擴大測試。保留必要負向案例與 fixture，並如實回報未執行的驗證範圍。

以下為按需選用的指令參考，不是每次修改必跑清單，皆在儲存庫根目錄執行。使用 .NET 10 SDK（依 `global.json`）、Node.js 24／Corepack、`frontend/package.json` 指定的 pnpm，以及 Docker Compose。

### 還原依賴

```sh
dotnet tool restore
dotnet restore RdWeb.sln --locked-mode
corepack pnpm --dir frontend install --frozen-lockfile
```

首次 build／test 可能下載 pinned proto；離線快取仍須通過雜湊驗證。不可刪除鎖檔或取消 locked／frozen 模式解決還原失敗。

### 後端檢查指令

局部測試以 `--filter` 選取相關測試類別／案例；以下測試指令涵蓋全部一般後端測試。只在選定測試需要 Redis 時啟動 Redis stack；使用 `--no-build` 前須已建置目前修改。

```sh
docker compose -f deploy/dev/docker-compose.redis-test.yml up -d --wait
dotnet build RdWeb.sln -c Release --no-restore
TEST_REDIS_URL=redis://127.0.0.1:16379 dotnet test RdWeb.sln -c Release --no-build --filter "Category!=RustDeskReal"
dotnet format RdWeb.sln --verify-no-changes --no-restore
dotnet list RdWeb.sln package --vulnerable --include-transitive
```

真實 Redis 契約測試必須提供 `TEST_REDIS_URL`。完成後，若 Redis stack 是本次啟動，執行 `docker compose -f deploy/dev/docker-compose.redis-test.yml down`。

### 前端檢查指令

局部測試可用 `corepack pnpm --dir frontend test src/相關檔案.test.ts`；以下 `test`／`lint` 指令涵蓋整個前端，依本次影響範圍選用。

```sh
node tools/test-url-lint.mjs
corepack pnpm --dir frontend lint
corepack pnpm --dir frontend test
corepack pnpm --dir frontend build
corepack pnpm --dir frontend audit --audit-level high
```

`build` 包含 proto 生成、`vue-tsc --noEmit` 與 Vite；`test` 包含 proto 生成與 Vitest。變更 codec、剪貼簿或 fzstd 時，另跑相關 fixture 完整性／patch 回歸，指令見 CI。

### 工具、依賴與文件

```sh
frontend/node_modules/.bin/eslint tools
node tools/licenses.mjs
git diff --check
```

依變更範圍執行：工具修改跑 ESLint、對應 `tools/test-*.mjs` 或 `frontend/e2e/scripts/test-*.mjs` 與指定檔案的 Prettier；依賴或第三方來源修改跑 audit、授權檢查並更新 `THIRD_PARTY_NOTICES.md`。純 Markdown 修改檢查內容、路徑／指令及 `frontend/node_modules/.bin/prettier --check <修改的檔案>`，無須啟動完整應用測試。

### 真實整合與瀏覽器驗收

先準備 Chromium：`corepack pnpm --dir frontend exec playwright install chromium`。按影響範圍選用 runner，環境需求詳見 README、腳本與對應本機設計：

| 變更範圍                    | 指令                                           |
| --------------------------- | ---------------------------------------------- |
| 認證、管理頁、subpath／代理 | `bash frontend/e2e/scripts/test-subpaths.sh`   |
| RustDesk TCP／WS relay      | `bash frontend/e2e/scripts/test-m3a-relay.sh`  |
| 瀏覽器 RustDesk 加密登入    | `bash frontend/e2e/scripts/test-m3b1-login.sh` |
| 真實影像與呈現生命週期      | `bash frontend/e2e/scripts/test-m3b2-video.sh` |
| M3-B3 輸入／剪貼簿／重連    | `bash frontend/e2e/scripts/test-m3b3-input.sh` |

- `Category=RustDeskReal` 需要官方 runtime fixture，由 relay runner 準備；一般後端測試排除此類別不代表真實協定已通過。
- 管理 E2E 使用隔離 stack 與正式安全限制；直接執行 `pnpm e2e` 不會自動具備 runner 的環境。
- 維持測試的敏感資料防護，不開啟可能保存認證頁面或真實內容的 trace／screenshot／video／自動 DOM snapshot；公開 fixture 的專用驗收依既有規則處理。
- 只清理本次啟動且擁有的容器／程序，預設保留測試 volumes。不得清除宿主 RustDesk 設定、使用廣泛的 Docker prune，或未經確認執行 `down -v`。
- 單組診斷不等於完整矩陣；port／process healthy 不等於收到影像，Linux 結果不等於 Windows 真機結果。本機通過不代表遠端 CI 已執行。

## 完成與交付

- 依「先確認影響範圍，再選擇檢查」完成本次必要驗證；不將全面測試或所有檢查種類視為每次交付的固定門檻。不可用刪除失敗案例或跳過必要 fixture 宣稱通過。
- 回報變更檔案、實際執行的檢查與結果，以及未驗證項目／阻塞；不要沿用舊紀錄中的通過數量作本次結果。
- 需要保留的決策、協定／版本證據與驗證結論整合至所選 Superpowers／OpenSpec 流程的既有文件，不再另外同步 `docs/DECISIONS.md`、`docs/PROTOCOL_NOTES.md` 或獨立驗收文件；第三方來源與授權聲明仍依實際變更維護。
- `docs/`、`openspec/` 與代理工具資料夾依現有 `.gitignore` 留本機，不強制加入 Git，也不為交付而改動忽略規則。
- 提交／推送依使用者當次授權。獲准提交時按任務拆分，使用 `feat(scope): ...`、`fix(scope): ...`、`test(scope): ...` 或 `docs(scope): ...`，明確指定本次檔案 stage，避免夾帶既有工作。
