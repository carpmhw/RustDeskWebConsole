# 專案開發指南

本檔適用於整個儲存庫。RustDesk Web Console 是 AGPL-3.0-or-later 的自架瀏覽器遠端主控台：Vue 前端透過 ASP.NET Core 後端橋接既有 RustDesk hbbs／hbbr，資料使用 SQLite，KV 預設行程內記憶體、可選 Redis。

## 開始工作前

1. 使用繁體中文溝通、撰寫說明與手寫程式註解。
2. 先執行 `git status --short`，辨識既有修改與未追蹤檔；不得覆寫、還原或清除不屬於本次任務的工作。
3. 閱讀 `README.md` 與任務涉及的程式、測試和設定；流程文件以目前採用的 Superpowers 或 OpenSpec 為主：
   - Superpowers：閱讀相關 `docs/superpowers/specs/`、`docs/superpowers/plans/` 與該流程要求的既有任務紀錄。
   - OpenSpec：閱讀相關 `openspec/` 規格與 change 的 proposal、design、tasks。
   - 舊總計畫、`docs/DECISIONS.md`、驗收／協定文件僅在涉及既有需求、資安基線、版本或歷史證據時按需參考，不要求每次同步維護。
4. 目前進度：M0–M4（含正式部署）已完成，M5（發布）尚未進行。里程碑外的功能與修正以 OpenSpec change 或 Superpowers 計畫進行，不得破壞已驗收里程碑的行為；涉及 M5 發布範圍的工作先確認。已核准的後續決策需與原計畫一併閱讀；發現矛盾時明確指出，影響需求或資安的部分先確認。
5. 進度以所選流程的任務狀態、實際驗證結果及當前實作核對，不以 README 的歷史測試數量或檔案存在判定完成。本機文件若缺少，先依既有規格與程式確認現況，缺乏必要需求時向使用者詢問。

## 工作流程與紀錄

- 同一任務以 Superpowers 或 OpenSpec 擇一為主要流程；已有進行中的流程就沿用，只建立該流程要求的文件，簡單修正或文件調整直接處理。
- 不另建平行的進度帳本、決策日誌、驗收報告、自審摘要或驗證 JSON，也不另同步 `docs/DECISIONS.md`、`docs/PROTOCOL_NOTES.md`。驗證結果、未驗項目、阻塞與授權範圍在對話回報；需持續追蹤的設計、決策、協定／版本證據與驗證結論寫入所選流程的既有文件。此約定不降低驗證或資安標準。
- 刪除舊文件前，先將有效需求、決策、限制、PASS／FAIL 與未完成項目整合至所選流程文件並更新引用，不得改判或隱去歷史失敗與阻塞。刪除範圍須明確指定，不憑檔名或日期批次清除；仍在使用的規格、fixture、原始證據及授權／來源資料不可刪。
- 一次性診斷、校準或探針腳本放 `artifacts/`（Git 忽略），不進 repo；只有長期由 CI 或 runner 使用的工具才放 `frontend/e2e/scripts/` 或 `tools/`。診斷結論整合至所選流程文件。
- `README.md` 只維護產品介紹、功能與支援限制、架構、啟動與設定、開發／測試入口及必要來源連結；除使用者明確要求外，不寫入單次驗證結果、通過數量、執行日期或驗收歷程，功能與支援限制只在實際行為或支援範圍變更時更新。產品使用文件、授權／第三方來源聲明與 pinned 協定雜湊依實際變更維護。
- `docs/`、`openspec/` 與代理工具資料夾依現有 `.gitignore` 留本機，不強制加入 Git，也不為交付改動忽略規則。

## 目錄導覽

| 路徑                                              | 職責                                            |
| ------------------------------------------------- | ----------------------------------------------- |
| `src/RdWeb.Api/Endpoints/`                        | Minimal API 端點與路由群組                      |
| `src/RdWeb.Api/Security/`、`Targets/`             | 認證、授權、Vault 與目標服務                    |
| `src/RdWeb.Api/Data/`                             | 正式 `AppDbContext`、實體與 migrations          |
| `src/RdWeb.Api/Migrations/`                       | M0 `SpikeDbContext` 專用 migration              |
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
| `deploy/prod/`、`deploy/single/`                  | 正式部署：兩容器／單容器 compose 與維運腳本     |
| `tools/`                                          | 共用 fixture、回歸及授權檢查工具                |
| `artifacts/`、`frontend/.cache/`                  | 本機診斷腳本／產出與私有 E2E 紀錄（Git 忽略）   |
| `.github/workflows/ci.yml`                        | CI 分流、日常檢查與發布前 E2E                   |

## 程式與資料規範

- 所有手寫函數、方法與測試函數添加繁體中文註解，說明目的或重要限制；工具生成檔保留原格式。
- 遵守 `.editorconfig`：UTF-8、LF、檔尾換行；C# 四空白，其餘預設兩空白。前端遵循現有 ESLint／Prettier 設定，不做無關的全庫格式化。
- 後端維持 nullable、warnings-as-errors、分析器及 NuGet audit；不以停用檢查、Native AOT 或 trimming 迴避問題。
- 沿用現有服務分層、DTO、錯誤碼與取消機制，避免將業務邏輯堆進 `Program.cs` 或頁面。新增介面行為同步檢查前後端契約。
- 前端沿用現有 Vue／TypeScript、Pinia、Vue Router、vue-i18n 和原生元件；使用既有主題色票，介面文字更新相應語系。
- 資料庫及 API 時間一律 UTC；頁面預設 `Asia/Taipei` 並允許使用者選擇時區；log 預設 UTC，以 `LOG_TIME_ZONE` 獨立設定，不依賴宿主本地時間。
- SQLite 維持 WAL、每連線外鍵檢查、短交易與整數 `Version` 樂觀並發。Redis 不解除 SQLite 單實例限制。
- 正式 migration 指定 `AppDbContext`，輸出至 `src/RdWeb.Api/Data/Migrations`；M0 的 `SpikeDbContext` migration 位於 `src/RdWeb.Api/Migrations`，兩者不可混放。Migration 必須在真實 SQLite 驗證。
- API、WebSocket 與路由須支援執行期 subpath；沿用 `withBase`／`buildWsUrl` 等共用工具，不硬編碼根路徑 `/api` 或手動重複套前綴。

## 資安與協定邊界

- 不把金鑰、密碼、JWT、票證、TOTP secret、備援碼或真實剪貼簿內容放入 log、快照、報告或 commit。錯誤回應及稽核只使用既有安全分類與允許欄位。
- 敏感設定由程序環境或 `<NAME>_FILE` 指向的秘密檔注入（正式部署為 Docker secrets `/run/secrets`，見 `src/RdWeb.Api/Configuration/SecretFileConfiguration.cs`），不放 `.env`、映像、命令列參數或範例常值；不提交資料庫、測試私鑰與認證 fixture。
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

- 修改前確認涉及的檔案、行為、呼叫端及共用契約，簡述調整與預計驗證範圍；範圍明確時直接執行，有歧義才詢問使用者。
- 以能覆蓋受影響行為的最小檢查集合為原則，不因任何修改就跑整套前後端測試、Docker／E2E 矩陣或全部 audit：局部邏輯跑對應測試與修改檔案的 format／lint；涉及型別、編譯、生成或打包時加跑相關型別檢查／build；共用契約、認證、授權、資料庫或協定修改依呼叫關係擴大至相關整合與負向測試，但不必重跑無關模組；依賴／鎖檔／第三方來源變更跑相關 audit 與授權檢查。
- 路徑分類與 CI 一致，以 `tools/ci.mjs` 為準：`isDocumentationPath` 判定純文件快速路徑；`affectsTestTools` 判定需重驗診斷工具的路徑（`tools/`、`frontend/e2e/`、`frontend/src/rdweb/`、`deploy/`、`.github/` 與工具鏈設定）。
- 全面回歸只在里程碑驗收、跨模組廣泛影響、針對性結果顯示可能廣泛回歸，或使用者要求時執行，並先說明理由。CI 依 `frontend/e2e/README.md` 的日常／發布前策略執行，不將 CI 的代表性路徑覆蓋稱為六組完整矩陣。
- 必要檢查通過即可交付；沒有新修改、失敗或疑慮時不重複或擴大測試。保留必要負向案例與 fixture，如實回報未執行的範圍。
- 測試等待優先使用條件等待。固定等待只限模擬已有證據（原始碼或隔離實驗）的第三方／作業系統計時行為，須為具名常數、註解寫明依據並取得使用者同意；不得用以掩蓋產品缺陷或放寬判定。

### 常用指令

所有指令與工具測試（含 `node --test`）皆在儲存庫根目錄執行，與 CI 相同。使用 .NET 10 SDK（依 `global.json`）、Node.js 24／Corepack、`frontend/package.json` 指定的 pnpm 與 Docker Compose。以下僅列常用入口，完整檢查集合（fixture 完整性、fzstd patch、授權、E2E 工具回歸等）以 `.github/workflows/ci.yml` 為準。

```sh
# 還原依賴：不可刪除鎖檔或取消 locked／frozen 模式解決還原失敗
dotnet tool restore && dotnet restore RdWeb.sln --locked-mode
(cd frontend && corepack pnpm install --frozen-lockfile)

# 後端：局部以 --filter 選測；--no-build 前須已建置目前修改。真實 Redis 契約測試須提供 TEST_REDIS_URL，
# 需要時才啟動 deploy/dev/docker-compose.redis-test.yml，本次啟動者用畢 down
dotnet build RdWeb.sln -c Release --no-restore
TEST_REDIS_URL=redis://127.0.0.1:16379 dotnet test RdWeb.sln -c Release --no-build --filter "Category!=RustDeskReal"
dotnet format RdWeb.sln --verify-no-changes --no-restore

# 前端：局部用 (cd frontend && corepack pnpm test src/相關檔案.test.ts)
(cd frontend && corepack pnpm lint)
(cd frontend && corepack pnpm test)    # 含 proto 生成與 Vitest
(cd frontend && corepack pnpm build)   # 含 proto 生成、vue-tsc 與 Vite

# 工具與文件
frontend/node_modules/.bin/eslint tools
git diff --check
```

- 首次 build／test 可能下載 pinned proto；離線快取仍須通過雜湊驗證。
- 工具修改跑 ESLint、對應 `tools/test-*.mjs` 或 `frontend/e2e/scripts/test-*.mjs` 與指定檔案的 Prettier；依賴或第三方來源修改跑 `pnpm audit`、`dotnet list RdWeb.sln package --vulnerable --include-transitive`、`node tools/licenses.mjs` 並更新 `THIRD_PARTY_NOTICES.md`；純 Markdown 修改只跑 `frontend/node_modules/.bin/prettier --check <修改的檔案>`；修改 `README.md`、`AGENTS.md` 或 `frontend/e2e/README.md` 時可改跑 `node tools/ci.mjs docs`（與 CI 相同的格式與相對連結檢查）。
- Python 工具以 `python3 -B` 執行，例如 `python3 -B frontend/e2e/scripts/test_build_receiver_native_supervisor.py`；`tools/prepare-*.py` 只在重新產生 fixture 時使用（指令見 `frontend/src/rdweb/__fixtures__/CLIPBOARD_FIXTURES.md`），產生後跑 `node --test tools/test-clipboard-fixture-integrity.mjs` 等對應完整性檢查。
- `frontend/e2e/scripts/` 的 `.ps1`／`.cs` 需 Windows 真機或操作者 runtime；Linux 只能跑對應 `test-windows-*.mjs` 的契約檢查，須回報 Windows 端未驗。`scripts/test-*.mjs` 也含需要 Docker 或真實 runtime 的診斷，不可整個 glob 當單元測試。

### 真實整合與瀏覽器驗收

先準備 Chromium：`(cd frontend && corepack pnpm exec playwright install chromium)`。按影響範圍選用 runner，環境需求詳見 README、腳本與對應本機設計：

| 變更範圍                    | 指令                                              |
| --------------------------- | ------------------------------------------------- |
| 認證、管理頁、subpath／代理 | `bash frontend/e2e/scripts/test-subpaths.sh`      |
| RustDesk TCP／WS relay      | `bash frontend/e2e/scripts/test-m3a-relay.sh`     |
| 瀏覽器 RustDesk 加密登入    | `bash frontend/e2e/scripts/test-m3b1-login.sh`    |
| 真實影像與呈現生命週期      | `bash frontend/e2e/scripts/test-m3b2-video.sh`    |
| M3-B3 輸入／剪貼簿／重連    | `bash frontend/e2e/scripts/test-m3b3-input.sh`    |
| 正式部署（兩容器）          | `bash frontend/e2e/scripts/test-m4-deploy.sh`     |
| 正式部署（單容器）          | `bash frontend/e2e/scripts/test-single-deploy.sh` |

- 重連另有 `test-m3b3-reconnect*.sh`（安全、長時、ingress）與 `test-m3b3-reliability.sh`。部署 runner 預設跑六組矩陣，CI 以 `RDWEB_M4_*`／`RDWEB_SINGLE_*` 縮為 `/rdweb + preserve`；單容器先以 `deploy/single/Dockerfile.single` 建置映像，設 `RDWEB_SINGLE_IMAGE` 跑 `node --test tools/test-single-supervise.mjs`，再跑部署 runner。各 runner 範圍與環境變數見 `frontend/e2e/README.md`。
- `Category=RustDeskReal` 需要官方 runtime fixture，由 relay runner 準備；一般後端測試排除此類別不代表真實協定已通過。
- 管理 E2E 使用隔離 stack 與正式安全限制；直接執行 `pnpm e2e` 不會自動具備 runner 的環境。
- 維持測試的敏感資料防護，不開啟可能保存認證頁面或真實內容的 trace／screenshot／video／自動 DOM snapshot；公開 fixture 的專用驗收依既有規則處理。
- 只清理本次啟動且擁有的容器／程序，預設保留測試 volumes。不得清除宿主 RustDesk 設定、使用廣泛的 Docker prune，或未經確認執行 `down -v`。
- Windows 真機前置（記事本設定與座標量測、受控端無其他控制連線、測試中不操作受控端等）見 `frontend/e2e/README.md`。
- 單組診斷不等於完整矩陣；port／process healthy 不等於收到影像，Linux 結果不等於 Windows 真機結果。本機通過不代表遠端 CI 已執行。

## 完成與交付

- 依「先確認影響範圍，再選擇檢查」完成本次必要驗證；不可用刪除失敗案例或跳過必要 fixture 宣稱通過。
- 回報變更檔案、實際執行的檢查與結果，以及未驗證項目／阻塞；不沿用舊紀錄中的通過數量作本次結果。
- 提交／推送依使用者當次授權。獲准提交時按任務拆分，使用 `feat(scope): ...`、`fix(scope): ...`、`test(scope): ...` 或 `docs(scope): ...`，明確指定本次檔案 stage，避免夾帶既有工作。
