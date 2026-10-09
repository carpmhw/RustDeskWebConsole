# RustDesk Web Console

依 C#／ASP.NET Core v0.2 計畫開發的自架瀏覽器遠端主控台，採 AGPL-3.0-or-later。

目前階段為 **M3-A：單次 ticket 與後端 relay bridge 已完成本機驗收**。M0、完整 M1、M2-A／B／C 與 M3-A 均已通過；下一工作單元為 M3-B 瀏覽器主控台。

提供帳密／TOTP／備援碼登入、JWT／refresh 輪替、強制 MFA、使用者管理與 bootstrap。前端已有 Login／Security、伺服器／目標管理、ACL、獨立 30 秒密碼顯示、metadata CSV／批刪、頂部導覽、中英文及主題／時區偏好。最新驗證為後端一般套件 206 項、官方 RustDesk relay 整合 2 項、前端 41 項及完整管理／認證 subpath E2E 72 項通過；本機驗收紀錄見 `docs/M3A_ACCEPTANCE.md`、`docs/M2C_ACCEPTANCE.md` 與 `docs/M2_ACCEPTANCE.md`。

## 時間與時區

| 項目             | 預設        | 設定方式                                     |
| ---------------- | ----------- | -------------------------------------------- |
| 資料庫與 API     | UTC         | 固定使用 UTC；API ISO 8601 時間帶 `Z`        |
| 頁面顯示         | Asia/Taipei | 頁面「個人顯示偏好」選擇時區，儲存在此瀏覽器 |
| 新使用者頁面預設 | Asia/Taipei | web 容器 `DEFAULT_DISPLAY_TIME_ZONE`         |
| JSON log         | UTC         | backend 容器 `LOG_TIME_ZONE`，重啟後生效     |

Docker 容器可以保持 `TZ=UTC`；應用明確轉換時區，不依賴宿主機本地時間或 `/etc/localtime`。Log 包含 ISO 8601 offset 與 `LogTimeZone`。無效 log 時區拒絕啟動；已實測台北跨日及紐約夏令時間。

## 啟動開發主控台

在專案根目錄執行：

```sh
export SECRET_KEY="$(node -p "require('node:crypto').randomBytes(32).toString('base64')")"
export VAULT_KEY="$(node -p "require('node:crypto').randomBytes(32).toString('base64')")"
export BOOTSTRAP_ADMIN_USERNAME=admin
read -r -s -p 'Initial admin password (12+ characters): ' BOOTSTRAP_ADMIN_PASSWORD
export BOOTSTRAP_ADMIN_PASSWORD
APP_BASE_PATH=/rdweb LOG_TIME_ZONE=Asia/Taipei \
  docker compose -f deploy/dev/docker-compose.spikes.yml up -d --build --wait
```

開啟 `http://127.0.0.1:18080/rdweb/`。不需要為不同 subpath 重建映像。
使用上方輸入的管理員帳密登入。這段 Bash 範例只供開發；兩個金鑰與密碼不寫入 repo 或輸出。開發 Compose 的 `/app/data` 隨容器重建清空，正式資料 volume 在 M4 接續。
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
docker compose -f deploy/dev/docker-compose.redis-test.yml up -d --wait
dotnet build RdWeb.sln -c Release
TEST_REDIS_URL=redis://127.0.0.1:16379 dotnet test RdWeb.sln -c Release --filter "Category!=RustDeskReal"
dotnet format RdWeb.sln --verify-no-changes
dotnet list RdWeb.sln package --vulnerable --include-transitive
corepack pnpm --dir frontend install --frozen-lockfile
node tools/test-url-lint.mjs
corepack pnpm --dir frontend lint
corepack pnpm --dir frontend test
corepack pnpm --dir frontend build
corepack pnpm --dir frontend audit --audit-level high
node tools/licenses.mjs
frontend/node_modules/.bin/eslint tools
docker compose -f deploy/dev/docker-compose.redis-test.yml down
```

Pinned 官方 RustDesk relay 整合須另外執行 `bash deploy/dev/test-m3a-relay.sh`。Runner 使用 hbbs／hbbr 1.1.14 及受控端 1.4.2，驗證 TCP／WS 兩條 Stage A 路徑；只清理自己啟動的容器、保留測試 volumes。WS 宿主映射預設為 31118／31119，可用 `RDWEB_TEST_ID_WS_PORT`／`RDWEB_TEST_RELAY_WS_PORT` 覆寫，容器內仍是 21118／21119。缺少 runtime fixture 的 `RustDeskReal` 測試會明確失敗，不會冒稱通過。

首次 build 會從固定 RustDesk `1.4.2` 對應的 hbb_common commit 下載完整 proto 到 `obj`，驗證 SHA-256 後由 Grpc.Tools 產生 C#。
來源與離線快取方式見 [`UPSTREAM.md`](src/RdWeb.Api/RustDesk/Protos/UPSTREAM.md)。

```sh
docker build -f deploy/dev/Dockerfile.api -t rdweb-m0-api .
node tools/test-container-timezones.mjs
corepack pnpm --dir frontend exec playwright install chromium
bash deploy/dev/test-subpaths.sh
```

Subpath 腳本驗證 `/`、`/rdweb`、`/a/b/c` × 保留／剝除前綴，每組包含真實登入、TOTP／備援碼、強制 MFA、reload／雙分頁／logout、主題／語言／時區及代理 WebSocket，另含 server CRUD／probe、operator target CRUD／CSV／批刪、admin ACL／viewer、版本衝突與密碼顯示清除，共 6 × 12＝72 個 Playwright 案例，結束時清理測試容器。外層 nginx／Traefik／Caddy 全矩陣於 M4 擴充。

E2E 的管理員密碼與金鑰在程序環境隨機產生；auth 每案例重建隔離 stack，不調低正式配額。測試停用 trace／screenshot／video、下載保存及 Playwright 自動 AI 頁面快照，避免認證資訊進入 report。直接執行 `pnpm e2e` 需要 runner 的 E2E 環境，建議使用上述 subpath 腳本。

nginx 請求層錯誤日誌也停用，避免 upstream 失敗時附帶 query 中的票證。
主層保留啟動診斷，應用維運事件由可設定時區的 Serilog 輸出。
`node tools/test-proxy-log-redaction.mjs` 在啟動的 spike stack 上以無敏感值的 marker 重現失敗並驗證日誌保護。
加上 `--start` 可由工具在程序環境產生金鑰、啟動 stack 並在結束時清理；subpath 腳本也會自動產生測試金鑰。

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
不提交 `.env`、資料檔、測試私鑰。SQLite 使用 WAL、每連線外鍵檢查與短交易；M0 schema 僅為 spike，M1-A 正式 schema 與 migration 使用獨立 `AppDbContext`。

## M1-A 執行期設定

| 設定             | 預設          | 行為                                                                     |
| ---------------- | ------------- | ------------------------------------------------------------------------ |
| `DATA_PATH`      | `data/app.db` | 啟動時 migration／WAL；Linux 檔案 0600、資料目錄 0700                    |
| `INSTANCE_COUNT` | `1`           | SQLite 只支援單實例，其他值拒絕啟動，使用 Redis 也不例外                 |
| `REDIS_URL`      | 空值          | 預設 Memory KV；可設 `redis://host:6379/0` 或 TLS `rediss://host:6379/0` |
| `TEST_REDIS_URL` | 無            | 僅測試使用；真實 Redis 契約與 health 測試必須提供，未設定會明確失敗      |

Redis URL 可含 ACL 使用者／密碼（需要時 URL encode）；只由環境注入，不加入檔案或 log。KV 使用 `rdweb:` 前綴；請勿讓多個部署共用同一 Redis database。啟動會重設本應用 `conn:*`，其餘 key 不清除。Memory KV 重啟即清空，帳號鎖定狀態由正式資料庫保存。

`/api/v1/health` 無需登入，回 `status`、`version`、UTC `timestamp`、`database`、`kv`；依賴不可用回 HTTP 503。`dotnet RdWeb.Api.dll healthcheck` 探測 localhost:8080，只在 HTTP 與應用狀態皆成功時回 exit code 0。`spikes` 獨立執行 M0，不初始化正式資料庫。

稽核採容量 256 的有界佇列與單一批次 writer；容量滿時等待、正常停止時排空，寫入錯誤會停止主機。事件 detail 僅接受分類原因、時長與流量，不能傳入密碼、票證或任意 request body。

正式 migration 命令請指定 `--context AppDbContext --output-dir Data/Migrations`；既有 spike 則指定 `--context SpikeDbContext`。

## M1-B 認證設定與 API

| 設定                       | 要求                                                 |
| -------------------------- | ---------------------------------------------------- |
| `SECRET_KEY`               | Base64 編碼的隨機 32 bytes；JWT／CSRF 簽章，無預設值 |
| `VAULT_KEY`                | 獨立隨機 32 bytes 的 Base64；AES-256-GCM，無預設值   |
| `VAULT_KEY_VERSION`        | 正整數，預設 `1`                                     |
| `BOOTSTRAP_ADMIN_USERNAME` | 首位管理員帳號，3–128 ASCII 字母／數字／`._-`        |
| `BOOTSTRAP_ADMIN_PASSWORD` | 至少 12 字元；只透過環境注入，不接受命令列密碼       |
| `BOOTSTRAP_ADMIN_EMAIL`    | 選填                                                 |

正式部署須保存兩個固定金鑰；以上隨機產生例子只供開發驗證，不寫入檔案或輸出金鑰。資料庫 keycheck 會拒絕錯誤 Vault key／版本；更換應使用下方維護期間的 `rotate-key`。

`dotnet RdWeb.Api.dll bootstrap create-admin` 及首次 Web 啟動共用建立流程；已有任何 admin 時 no-op，不覆寫密碼、不重新啟用停用帳號。CLI、`spikes` 與 `healthcheck` 不要求 JWT／Vault key。

認證 API 位於 `{BASE}/api/v1/auth`：`login`、`mfa/verify`、`me`、`csrf`、`refresh`、`logout`、`totp/enroll`、`totp/confirm`、`totp/disable`、`recovery-codes`。管理 API 為 `/users`（list/create/update/reset-password/reset-totp）與 `/settings/security`（require_mfa=off/admins/all）。讀取使用 GET、修改使用 POST／PATCH／PUT。

- Access JWT 有效 15 分鐘，前端只存記憶體；refresh 最長 7 天，資料庫只存摘要，每次刷新輪替，重用撤銷同一登入工作階段。登出、停用及密碼重設立即撤銷 access。
- Refresh 放 `rdweb_refresh` httpOnly／SameSite=Strict cookie，Path 為 `{BASE}/api/v1/auth`；HTTPS 公開網址加 Secure。
- 修改端點要求 JSON 與精確 `Origin`；refresh／logout 另需 `X-Rdweb-CSRF`，由登入結果或唯讀 `GET /auth/csrf` 取得，輪替後更新。
- 帳密、MFA、二次驗證各有帳號／IP 5 次／分鐘限制；HTTP 認證工作同時最多 4 個，SQLite 認證寫入序列化。漸進鎖定落庫，重啟不重設。
- TOTP secret 加密、AAD 綁使用者；確認前不啟用。備援碼只在建立／重產時回明文一次。強制 MFA 使用者完成綁定前只可使用必要認證／綁定端點。
- 認證 API 一律 no-store、安全標頭、16 KiB body 限制與固定錯誤碼，不回傳例外或輸入內容。

詳細契約及驗收證據見本機 `docs/superpowers/specs/2026-10-09-m1b-authentication-design.md` 與 `docs/M1B_ACCEPTANCE.md`。

## M1-C 前端行為

- 配色採 `#868686`／`#e8eaec`／`#81b8b2`／`#82a294`／`#507f69` 與衍生深色底，版型固定頂部導覽，手機換行。
- 外觀 light／dark／system，首次跟隨系統；`rdweb.colorMode`、`rdweb.locale`、`rdweb.displayTimeZone` 是唯一持久化的前端偏好。主題在外部 `theme.js` 預先套用，不放寬 CSP。
- Access／MFA 票證放私有 RAM，Pinia 公開狀態只有安全 user／phase。重新整理從 HttpOnly refresh cookie 恢復；Web Locks 協調同源分頁，BroadcastChannel 只送狀態訊號。
- Login 分帳密與 TOTP／recovery；強制綁定者只能到 Security。QR／手動 secret／備援碼離頁清除；確認失敗需要重新開始，備援碼不提供再次讀取 API。
- HTTP 有 15 秒上限；授權回應的 epoch 防止登出後舊回應回寫。登出先清本機，遠端撤銷失敗會保留明確重試入口。

前端僅使用計畫內 Vue Router、Pinia、vue-i18n、qrcode，沒有 UI framework 或外部 QR 服務。

## M2-A 伺服器 API 與 Vault

完整認證的 admin 可使用 `{BASE}/api/v1/servers` 的 GET／POST，`/{id}` 的 GET／PUT／DELETE，以及 `/{id}/connection-test` 的 GET。設定欄位為 name、id_server、relay_server、public_key、transport=tcp/ws、enabled、allow_private_network、notes、version；更新及刪除需要正確 version，過期回 409。

端點格式只接受 `host:port` 或 `[IPv6]:port`。Private／loopback 預設不允許，需 admin 逐筆明確設定；metadata、link-local、unspecified／multicast 及危險映射表示始終拒絕。DNS 每次使用重新驗證所有結果，通過後固定 IP 連線。Probe 只使用已保存且啟用的端點，每 admin 5 次／分鐘、全站 2 個同時 probe、每端點 3 秒。

Probe 只做 TCP 可達性及公鑰格式檢查，回 `check=tcp_socket`、`protocol_verified=false`，ws 設定也只測底層 TCP。真正 RustDesk 協定與簽章握手於 M3 驗證。

`EncryptedSecretStore` 只供內部使用，不直接提供 store 讀取端點；目標密碼僅透過 M2-B 的權限與二次驗證 reveal API 顯示。Target 密碼以 AES-GCM、AAD `target:{uuid}:password` 保存；TOTP 與目標祕密都支援原子輪替。

### 維護期間輪替 Vault key

停止使用同一 DB 的 backend 後，指定正確 DATA_PATH，從環境提供以下四項：

| 設定                 | 要求                          |
| -------------------- | ----------------------------- |
| `ROTATE_OLD_KEY`     | 目前 Base64 32-byte key       |
| `ROTATE_NEW_KEY`     | 新的、不同 Base64 32-byte key |
| `ROTATE_OLD_VERSION` | 目前正整數版本                |
| `ROTATE_NEW_VERSION` | 大於目前版本的正整數          |

執行 `dotnet RdWeb.Api.dll rotate-key`，成功 exit 0，輸出只有新版本與輪替筆數。同一 SQLite transaction 更新所有 TOTP、target secrets、keycheck、版本及稽核；錯 key／AAD／密文／混合版本全部回滾。完成後將 backend 的 VAULT_KEY／VAULT_KEY_VERSION 改成新值再啟動。CLI 不接受命令列金鑰，也不需要 JWT SECRET_KEY。

既有 M1 資料首次建立 keycheck 前也會驗證原有 secret，不能以錯 key 建立新的檢查標記掩蓋不可讀資料。詳細驗收與下一階段見本機 `docs/M2A_ACCEPTANCE.md`。

## M2-B 目標／ACL／CSV API

`{BASE}/api/v1/targets` 支援可見清單 GET（q／group／page／page_size，最多100）、新增 POST，`/{id}` 的安全詳情 GET／Version PUT／DELETE。DTO只回 `has_password` 與有效權限，不回 plaintext、secret ID、cipher、nonce。Password省略／null保持，空字串清除，非空替換；即使只替換密碼，TargetVersion也增加。

- admin全權且獨占ACL管理；operator預設管理自己建立的目標，額外目標由明確user／role grant授權；viewer只看明確授權metadata，不能因flag升權。
- `/{id}/permissions` GET／PUT使用TargetVersion，完整替換grants；group_name僅分類，沒有群組繼承或operator轉授權。
- `/{id}/password/reveal` POST需can_view_password及當次password／TOTP二次驗證，先權限後proof；回password與expires_in=30，no-store與稽核。前端真正 30 秒自動遮蔽、Esc／離頁／背景事件／跨分頁登出清除，以及晚到回應不復活，均已通過完整矩陣。
- `/bulk-delete` POST最多100項UUID／Version，全部權限與版本成功才整批交易；清除metadata、ACL及secret。
- `/import` POST接JSON csv，最多10000chars／50資料列；維持16KiB body上限，僅新增metadata、不匯入密碼或ACL。
- `/export` GET最多1000可見目標，CSV attachment，沒有密碼欄，RFC4180 quoting及formula防護。
- CSV固定server_id,name,rustdesk_id,group_name,tags,notes；tags為JSON array。拒絕unknown／duplicate／password headers、損壞quotes，任何列失敗全部回滾。匯出防formula的apostrophe在重新匯入時作literal保留。
- `/servers/available` 只提供enabled UUID／name，operator／viewer不可藉此取得內部hostname或公鑰；server被target使用時不能刪除。

詳細契約與後端證據位於本機 `docs/superpowers/specs/2026-10-09-m2b-targets-design.md`、`docs/M2B_ACCEPTANCE.md`；管理前端驗收見下一節。

## M2-C 管理前端

- 完整登入後可使用 `{BASE}/targets`；`{BASE}/servers` 僅 admin 可進入，網址直接存取同樣受角色與 MFA 限制。
- 目標列表依有效權限顯示編輯、二次驗證密碼與刪除入口；viewer 僅可看明確授權的 metadata，ACL 管理只提供給 admin。
- 密碼表單只保存短命 RAM，編輯時保持／替換／清除三種語意，不預填顯示過的明文。獨立顯示 dialog 使用實際 deadline，關閉／離頁／登出／頁面背景立即清除並取消請求。
- 匯入／匯出僅 metadata；批刪使用選取 UUID／Version。版本衝突不自動重送；批刪失敗會刷新列表、清除選取並保留錯誤提示。
- 六組真實代理矩陣使用正式權限與限流，驗證真正 30 秒期限、CSP／base／390px 頁寬。背景清除以標準 DOM visibility 事件驗證，延遲回應以真正後端 response 延後交付驗證，沒有 mock 認證。

## M3-A Ticket 與後端橋接

- 完整登入且有 `can_connect` 權限者呼叫 `POST {BASE}/api/v1/targets/{id}/connect-ticket`（JSON `{}`），取得 `ticket`／`expires_in=30`；KV 僅存 ticket digest 與 user／target binding。
- `GET {BASE}/api/v1/targets/{id}/connect` WebSocket 握手必須提出 `rdweb.v1` 與 `rdweb.ticket.{ticket}`，精確同源 Origin 驗證後原子取用票證、重驗有效權限。回應只協商 `rdweb.v1`，不把票證放 URL。
- 後端只連 admin-saved hbbs／hbbr，重新解析並驗證所有 DNS IP。強制 relay 的 signed IdPk／target ID／UUID 必須有效才連 hbbr；300 ms 等待後送 RequestRelay，送出結果不明時不重放 UUID。
- `rdweb.ready` 帶 saved `transport`：TCP 轉送 BytesCodec byte stream，WS 保留 binary message／fragment 邊界。`transport=ws` 使用保存的實際 WS listener `host:port` 根路徑，不自動 +2 或推導 TLS／proxy path。
- 全站最多五條，兩方向各有 16 × 16 KiB bounded queue，背壓無進展 30 秒斷線；結束／取消歸還 `conn:*`，稽核只含 target UUID、固定分類、時長與流量。
- 此階段只交付 opaque relay。瀏覽器 RustDesk 加密登入、Vault login-assist、影像解碼、輸入／剪貼簿與 50 次連線成功率驗收接續於 M3-B。

計畫、決策、版本矩陣與驗收結果位於本機 `docs/`，依使用者既有 `.gitignore` 保留在本機。
可追蹤的第三方來源與授權摘要見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)；CI 產出完整依賴授權清單。
