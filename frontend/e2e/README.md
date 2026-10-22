# 前端端對端測試

所有 E2E 專用來源集中在此；沿用 `frontend/package.json` 的依賴，不需另外安裝套件。

| 目錄          | 內容                                                      |
| ------------- | --------------------------------------------------------- |
| `management/` | 真實 API／Nginx 的認證、管理與 subpath 案例及共用 helpers |
| `real/`       | 真實 RustDesk 登入、影像、輸入、剪貼簿與重連驗收          |
| `ui/`         | 公開 UI harness 與瀏覽器案例                              |
| `codecs/`     | 公開影像 fixture 的原生 WebCodecs harness                 |
| `proxy/`      | loopback 代理工具的 Vitest 與 Playwright 案例             |
| `config/`     | 各 suite 的 Playwright、Vite、Vitest 與 TypeScript 設定   |
| `scripts/`    | 隔離 runner、診斷、工具回歸與 Windows 校準來源            |
| `fixtures/`   | E2E 專用公開測試資料                                      |
| `docker/`     | 測試專用 Compose、RustDesk 映像與入口腳本                 |

產品單元測試仍在 `frontend/src/`；與單元測試共用的公開 codec／clipboard fixture 留在 `frontend/src/rdweb/__fixtures__/`。共用開發環境及 Redis Compose 留在 `deploy/dev/`。

## 常用指令

以下均從儲存庫根目錄執行。`pnpm e2e` 預設只選 management，不會混入其他 suite：

```sh
# 收集管理案例，不啟動服務或瀏覽器
corepack pnpm --dir frontend e2e --list

# 真實認證／代理驗收：runner 準備隔離服務及程序環境
bash frontend/e2e/scripts/test-subpaths.sh

# 公開 UI harness：先建置再執行，不連真實 API 或 RustDesk
corepack pnpm --dir frontend exec vite build --config e2e/config/vite.ui.config.ts
corepack pnpm --dir frontend exec playwright test --config e2e/config/playwright.ui.config.ts

# 公開 codec harness：先驗證／準備固定來源 fixture
node frontend/scripts/prepare-codec-fixtures.mjs
corepack pnpm --dir frontend exec playwright test --config e2e/config/playwright.codecs.config.ts

# 代理工具測試與專用型別檢查
corepack pnpm --dir frontend exec vitest run --config e2e/config/vitest.reconnect-proxy.config.ts
corepack pnpm --dir frontend exec tsc --project e2e/config/tsconfig.reconnect.json
corepack pnpm --dir frontend exec vue-tsc --noEmit --project e2e/config/tsconfig.ui.json
corepack pnpm --dir frontend typecheck:text-return-probe

# 目錄、runner 與測試註冊回歸；不連操作者的真機
node --test frontend/e2e/scripts/test-e2e-layout.mjs frontend/e2e/scripts/test-m3b3-runner.mjs frontend/e2e/scripts/test-input-registration.mjs
```

其他真實驗收入口為 `scripts/test-m3a-relay.sh`、`test-m3b1-login.sh`、`test-m3b2-video.sh`、`test-m3b3-input.sh` 與各 reconnect／probe runner。直接呼叫 Playwright 不會自動準備官方 runtime、登入憑證或隔離服務；Windows runtime 必須由操作者透過程序環境提供。`scripts/test-*.mjs` 包含需要 Docker、PowerShell 或真實 runtime 的診斷，不應將整個 glob 視為一般單元測試。

## 路徑與安全界線

- pnpm／Vite 的工作目錄維持 `frontend/`；Playwright 設定以 `config/` 為基準選取案例，webServer 明確回到 frontend 工作目錄。
- 測試產物仍留在既有忽略的 `frontend/test-results/`、`frontend/.cache/` 或根目錄 `artifacts/`，不與來源 fixture 混放。
- Docker build context 為儲存庫根目錄；console overlay 搭配 `deploy/dev/docker-compose.spikes.yml` 使用，不改共用開發 stack。
- 真實驗收維持禁止 trace、screenshot、video 與自動 DOM snapshot；不得保存憑證或真實剪貼簿內容。runner 只清理自己啟動的資源，預設保留 volumes。

## CI 執行範圍

- 一般 PR 與 `dev`／`main` push 執行建置、前後端單元／整合測試、lint、audit 與授權檢查；一般純文件變更只做文件檢查。
- 診斷工具與目錄／runner 契約只在工具、E2E、共用協定 helper、部署、依賴或工具鏈設定變更時執行；發布前驗證一律包含。
- 指向 `main` 的 PR（包含 `dev → main`，即使只有文件變更）以及手動執行 workflow，執行發布前完整驗證。合併後的 `main` push 不重複啟動 E2E。
- 發布前管理頁測試分為 `management` 與 `proxy`：前者在 `/a/b/c + preserve` 執行非 `@proxy` 的功能與布局案例，後者在三種 base path × 兩種代理模式執行標記 `@proxy` 的真實登入／refresh／logout、資源路徑、Cookie／redirect／WebSocket 契約。
- 官方瀏覽器登入仍走原六組路徑 × TCP／WS；影像、輸入與有限重連的完整功能案例在 `/a/b/c + preserve` 執行，TCP／WS 皆保留。這是 CI 的分層覆蓋策略，不宣稱每個功能都已跑過原六組矩陣。
- reconnect-security、longrun、ingress 與原始 50 次 reliability 依既有 scope 在 `/rdweb + preserve` 執行；不縮短期限、退避、限流或可靠性序列。公開 UI 與 proxy browser harness 也納入發布前檢查。Windows 原生操作、SAS／IME 與文字診斷仍需操作者 runtime，不由 Linux CI 代替。
- 未指定 `RDWEB_E2E_MATRIX` 的管理 runner，以及其他 runner 的預設值，仍保留原本完整矩陣，供需要逐項交叉驗收時執行。

```sh
# 一組完整管理功能／布局（排除由代理矩陣執行的契約）
RDWEB_E2E_MATRIX=management bash frontend/e2e/scripts/test-subpaths.sh

# 六組代理契約
RDWEB_E2E_MATRIX=proxy bash frontend/e2e/scripts/test-subpaths.sh
```

`build-test` 彙總本次範圍內所有必要 job；失敗、取消與非預期略過均不通過。要阻擋未通過的 `main` 合併，儲存庫分支保護／ruleset 仍須將此檢查設為必要並要求最新分支檢查；workflow 本身不會修改儲存庫管理設定。
