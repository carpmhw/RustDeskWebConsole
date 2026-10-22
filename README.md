<div align="center">
  <img src="frontend/public/favicon.svg" alt="RustDesk Web Console 圖示" width="64" />
  <h1>RustDesk Web Console</h1>
  <p>自架式 RustDesk 瀏覽器遠端主控台</p>
  <p>
    <a href="#功能">功能</a> ·
    <a href="#架構">架構</a> ·
    <a href="#快速啟動開發環境">快速啟動</a> ·
    <a href="#本機開發與驗證">本機開發</a>
  </p>
</div>

RustDesk Web Console 使用瀏覽器管理並連線至既有 RustDesk 受控端。前端以 Vue 3 建置，後端使用 ASP.NET Core；RustDesk hbbs／hbbr 仍由你自行部署與管理，本專案不取代 RustDesk server。

> [!IMPORTANT]
> 專案仍在開發與驗收階段。鍵鼠、文字剪貼簿、自動重連及不同 RustDesk 用戶端／作業系統組合尚未完成完整驗收，請勿視為已具備完整跨平台支援。

## 功能

- 帳密登入、TOTP 多因素驗證與備援碼；支援管理員、操作員、檢視者角色。
- 管理 RustDesk server、目標與存取控制清單（ACL）；目標密碼以後端 Vault 保護，敏感操作需重新驗證。
- 瀏覽器遠端主控台提供即時影像、縮放、全螢幕與畫質選項。
- 支援 TCP／WebSocket relay、反向代理子路徑、中英文介面，以及主題和時區偏好。
- 目標 CSV 匯入／匯出只處理 metadata，不包含密碼或 ACL。

## 架構

```text
瀏覽器（Vue 3）
    │ HTTPS／WebSocket
    ▼
web（Nginx 靜態前端與 API／WebSocket 代理）
    │
    ▼
API（ASP.NET Core）── SQLite（正式資料）
    │                └─ 行程內 KV（可選 Redis）
    └─ TCP／WebSocket → 已設定的 hbbs／hbbr → RustDesk 受控端
```

瀏覽器不會指定任意遠端主機；後端只連線至管理員設定並通過驗證的 RustDesk server。SQLite 為單一 API 執行個體設計；Redis 只替換短期 KV，不會讓 SQLite 支援多個 API 執行個體。

## 快速啟動（開發環境）

需要 Docker Compose 與 Node.js 24（含 Corepack）。以下指令使用 Bash，在專案根目錄執行：

```sh
# 產生僅供本機開發使用的兩把獨立金鑰
export SECRET_KEY="$(node -p "require('node:crypto').randomBytes(32).toString('base64')")"
export VAULT_KEY="$(node -p "require('node:crypto').randomBytes(32).toString('base64')")"
export BOOTSTRAP_ADMIN_USERNAME=admin

# 密碼不會顯示在終端
read -r -s -p '初始管理員密碼（至少 12 字元）: ' BOOTSTRAP_ADMIN_PASSWORD
printf '\n'
export BOOTSTRAP_ADMIN_PASSWORD

APP_BASE_PATH=/rdweb LOG_TIME_ZONE=Asia/Taipei \
  docker compose -f deploy/dev/docker-compose.spikes.yml up -d --build --wait
```

開啟 <http://127.0.0.1:18080/rdweb/>，並使用剛設定的管理員帳密登入。停止開發服務：

```sh
docker compose -f deploy/dev/docker-compose.spikes.yml down
```

> [!WARNING]
> `deploy/dev/docker-compose.spikes.yml` 僅供本機開發與驗收，HTTP 入口綁定 `127.0.0.1`，且未掛載持久化資料 volume。請勿直接公開到網際網路，也不要用它保存正式資料。正式對外服務需要 HTTPS；瀏覽器影像解碼等能力需要安全內容環境（HTTPS 或 localhost）。

## 設定摘要

| 變數                                                   | 用途                                                      |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `APP_BASE_PATH`                                        | 應用程式子路徑，例如 `/rdweb`；須與反向代理設定一致。     |
| `SECRET_KEY`、`VAULT_KEY`                              | 必填且彼此獨立的 Base64 隨機 32-byte 金鑰；沒有預設值。   |
| `BOOTSTRAP_ADMIN_USERNAME`、`BOOTSTRAP_ADMIN_PASSWORD` | 建立首位管理員；密碼至少 12 個字元。                      |
| `DATA_PATH`                                            | SQLite 資料庫路徑，預設 `data/app.db`。                   |
| `REDIS_URL`                                            | 選用 Redis KV；未設定時使用行程內記憶體 KV。              |
| `LOG_TIME_ZONE`                                        | JSON log 時區，預設 `UTC`；頁面預設時區為 `Asia/Taipei`。 |

金鑰與初始密碼請透過程序環境或正式的祕密管理機制注入，不要寫入 `.env`、命令列、Git 或日誌。若需要持久資料，請自行確保 SQLite 資料檔、金鑰和備份的安全保存；目前的 `deploy/dev` Compose 不提供正式部署與備份流程。

## 本機開發與驗證

需要 .NET 10 SDK（依 `global.json`）、Node.js 24（含 Corepack）、`frontend/package.json` 指定的 pnpm 及 Docker Compose。以下指令皆從專案根目錄執行，依變更範圍選用；開發規範見 [`AGENTS.md`](AGENTS.md)。

### 還原與建置

```sh
dotnet tool restore
dotnet restore RdWeb.sln --locked-mode
corepack pnpm --dir frontend install --frozen-lockfile
dotnet build RdWeb.sln -c Release --no-restore
```

### 後端一般測試

先啟動測試用 Redis；此篩選會排除需要官方 RustDesk runtime fixture 的案例：

```sh
docker compose -f deploy/dev/docker-compose.redis-test.yml up -d --wait
TEST_REDIS_URL=redis://127.0.0.1:16379 \
  dotnet test RdWeb.sln -c Release --no-build --filter "Category!=RustDeskReal"
docker compose -f deploy/dev/docker-compose.redis-test.yml down
```

### 前端檢查

```sh
corepack pnpm --dir frontend lint
corepack pnpm --dir frontend test
corepack pnpm --dir frontend build
```

### 真實整合與瀏覽器測試

前端 E2E 案例、設定、專用工具與 Docker 環境集中於 [`frontend/e2e/`](frontend/e2e/README.md)。真實 relay、瀏覽器登入、影像與輸入測試使用該目錄的隔離 runner；依測試需求先安裝 Chromium，並準備對應的 Docker／官方 fixture 環境。直接執行 `pnpm e2e` 不會自動準備這些環境。

Windows 真機、SAS 與 IME 測試需要操作者提供 runtime 與對應環境；Linux 測試不能代表 Windows 或完整跨平台支援。已接入 CI 的檢查以 [GitHub Actions workflow](.github/workflows/ci.yml) 為準。

## 專案結構

| 路徑               | 內容                                                |
| ------------------ | --------------------------------------------------- |
| `src/RdWeb.Api/`   | ASP.NET Core API、認證、資料儲存與 RustDesk relay。 |
| `src/RdWeb.Tests/` | xUnit 單元與整合測試。                              |
| `frontend/`        | Vue 介面、瀏覽器 API 與 RustDesk Protocol Worker。  |
| `frontend/e2e/`    | E2E 案例、設定、fixture、工具與專用容器環境。       |
| `deploy/dev/`      | 共用開發 Compose、API／web 映像與 Redis 測試環境。  |
| `tools/`           | 共用 fixture、回歸與授權檢查工具。                  |

協定來源與雜湊見 [RustDesk 上游來源說明](src/RdWeb.Api/RustDesk/Protos/UPSTREAM.md)；第三方套件與來源資訊見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
