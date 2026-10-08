# RustDesk Web Console

依 C#／ASP.NET Core v0.2 計畫開發的自架瀏覽器遠端主控台，採 AGPL-3.0-or-later。

目前階段為 **M0：環境與 spike**。已建立 .NET 10 API、Vue 3 環境驗證頁、SQLite migration／並發測試、原生加密與上游 protobuf 生成，以及真實 RustDesk 測試桌面。

## 時間與時區

| 項目             | 預設        | 設定方式                                     |
| ---------------- | ----------- | -------------------------------------------- |
| 資料庫與 API     | UTC         | 固定使用 UTC；API ISO 8601 時間帶 `Z`        |
| 頁面顯示         | Asia/Taipei | 頁面「個人顯示偏好」選擇時區，儲存在此瀏覽器 |
| 新使用者頁面預設 | Asia/Taipei | web 容器 `DEFAULT_DISPLAY_TIME_ZONE`         |
| JSON log         | UTC         | backend 容器 `LOG_TIME_ZONE`，重啟後生效     |

Docker 容器可以保持 `TZ=UTC`；應用明確轉換時區，不依賴宿主機本地時間或 `/etc/localtime`。Log 包含 ISO 8601 offset 與 `LogTimeZone`。無效 log 時區拒絕啟動；已實測台北跨日及紐約夏令時間。

## 啟動 M0 驗證頁

在專案根目錄執行：

```sh
APP_BASE_PATH=/rdweb LOG_TIME_ZONE=Asia/Taipei \
  docker compose -f deploy/dev/docker-compose.spikes.yml up -d --build --wait
```

開啟 `http://127.0.0.1:18080/rdweb/`。不需要為不同 subpath 重建映像。
`PREFIX_MODE=preserve`（預設）或 `strip` 可切換測試外層 nginx 的前綴處理。
開發 Compose 的 ingress 僅供 M0 驗證；正式雙容器部署與 HTTPS 外層代理在 M4 完成。

```sh
docker compose -f deploy/dev/docker-compose.spikes.yml down
```

M0 使用 Development-only 的 `/api/v1/spikes/*` 端點測 redirect、Cookie 與 WebSocket；Production 不註冊它們。健康端點為 `/api/v1/health`。

## 本機建置與驗證

需要 .NET 10 SDK、Node.js 24（含 Corepack）及 Docker Compose。

```sh
dotnet tool restore
dotnet restore RdWeb.sln --locked-mode
dotnet build RdWeb.sln -c Release
dotnet test RdWeb.sln -c Release
dotnet format RdWeb.sln --verify-no-changes
dotnet list RdWeb.sln package --vulnerable --include-transitive
corepack pnpm --dir frontend install --frozen-lockfile
corepack pnpm --dir frontend lint
corepack pnpm --dir frontend test
corepack pnpm --dir frontend build
corepack pnpm --dir frontend audit --audit-level high
node tools/licenses.mjs
frontend/node_modules/.bin/eslint tools
```

首次 build 會從固定 RustDesk `1.4.2` 對應的 hbb_common commit 下載完整 proto 到 `obj`，驗證 SHA-256 後由 Grpc.Tools 產生 C#。
來源與離線快取方式見 [`UPSTREAM.md`](src/RdWeb.Api/RustDesk/Protos/UPSTREAM.md)。

```sh
docker build -f deploy/dev/Dockerfile.api -t rdweb-m0-api .
node tools/test-container-timezones.mjs
corepack pnpm --dir frontend exec playwright install chromium
bash deploy/dev/test-subpaths.sh
```

Subpath 腳本驗證 `/`、`/rdweb`、`/a/b/c` × 保留／剝除前綴，結束時清理測試容器。
完整登入／TOTP 及 nginx／Traefik／Caddy 矩陣於 M1／M4 擴充。

nginx 請求層錯誤日誌也停用，避免 upstream 失敗時附帶 query 中的票證。
主層保留啟動診斷，應用維運事件由可設定時區的 Serilog 輸出。
`node tools/test-proxy-log-redaction.mjs` 在啟動的 spike stack 上以無敏感值的 marker 重現失敗並驗證日誌保護。

## 真實 RustDesk 桌面驗收

官方 server `1.1.14` 與桌面 client `1.4.2` 已固定版本／digest。測試受控端使用獨立 Xvfb／Fluxbox 桌面，為 `linux/amd64`；不掛載或修改宿主機現有 RustDesk 設定。

```sh
docker compose -f deploy/dev/docker-compose.rustdesk-test.yml build
docker compose -f deploy/dev/docker-compose.rustdesk-test.yml up -d --wait
node tools/wait-rustdesk-online.mjs
docker compose -f deploy/dev/docker-compose.rustdesk-test.yml --profile acceptance up -d --wait
mkdir -p artifacts
node tools/capture-rustdesk.mjs artifacts/rustdesk-desktop.png --verify
docker compose -f deploy/dev/docker-compose.rustdesk-test.yml --profile acceptance down
```

`--verify` 必須在官方桌面客戶端收到受控端專用背景色的時鐘畫面才成功，不以 port 或行程健康檢查替代。
啟動前依固定上游 proto 向 hbbs 確認實際登記，避免冷啟動時編碼器初始化完成前就嘗試連線。
受控端實際 ID 由 server 登記後寫入私有 volume，測試控制端自動讀取；固定測試密碼於首次啟動隨機產生並持續保留。測試 server／client 日誌停用以防上游輸出金鑰或認證資訊。
server 私鑰、受控端私鑰、僅公開公鑰與測試認證資料使用不同 volume；只有測試認證 volume 在受控端與測試控制端間共享。
一般 `down` 保留這些測試 volume；需要重設身分與密碼時，以 `down -v` 刪除**此測試 stack** 的資料。

## 開發規範與來源

手寫函數及測試附繁體中文註解。資料庫／API 維持 UTC；金鑰、密碼、票證不進 log、快照或 Git。
不提交 `.env`、資料檔、測試私鑰。SQLite 使用 WAL、每連線外鍵檢查與短交易；M0 schema 僅為 spike，M1 將建立正式模型。

計畫、決策、版本矩陣與驗收結果位於本機 `docs/`，依使用者既有 `.gitignore` 保留在本機。
可追蹤的第三方來源與授權摘要見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)；CI 產出完整依賴授權清單。
