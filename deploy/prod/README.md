# RustDesk Web Console 正式部署（Docker）

本文件說明如何在既有 Docker 主機、既有 nginx（提供 HTTPS）後方長期部署 RustDesk Web Console，以及日常維運（更新、備份、還原、金鑰保管）。所有指令都以本目錄提供的腳本為準。

## 架構

```text
瀏覽器 ──HTTPS──▶ 既有 nginx（外層，TLS）──HTTP──▶ web 容器（nginx，靜態檔＋轉送）──▶ backend 容器（ASP.NET Core）
                                                                                          │
                                                                    另一台主機的 hbbs／hbbr ◀┘
```

- 一個 compose 專案（`rdweb`）包含 `backend` 與 `web` 兩個容器，以 compose 與本目錄腳本整體操作，不需要分別管理兩個容器。
- 資料：SQLite 資料庫在 named volume `rdweb_rdweb-data`（容器內 `/app/data/app.db`）。
- 秘密：`secret_key`、`vault_key`、`bootstrap_admin_password` 以 Docker secrets 檔案掛載到 `/run/secrets`，不放在環境變數值、映像或命令列。
- 兩個容器都以非 root 執行、去除全部 Linux capability；backend 使用唯讀根檔案系統。
- web 只綁 `127.0.0.1:8080`（可調），由既有 nginx 轉入；backend 不對外發布。

## 需求

- Linux Docker 主機，Docker Engine 與 Docker Compose v2（需支援 `docker compose up --wait`）。
- 可用 `sudo` 執行腳本（秘密檔需設定為容器使用者擁有）。
- 既有 nginx 已能提供 HTTPS（憑證由你既有的方式管理）。
- `git`；主機能連到 GitHub（或你的鏡像）取得原始碼與建置時的套件。
- Docker 主機能連到 RustDesk 伺服器（hbbs／hbbr）的 TCP 21116／21117；若伺服器使用 WebSocket，則為 21118／21119。

## 預設路徑

| 用途                   | 路徑                               |
| ---------------------- | ---------------------------------- |
| 原始碼（git checkout） | `/opt/rdweb`                       |
| 非秘密設定             | `/etc/rdweb/rdweb.conf`            |
| 秘密檔目錄             | `/etc/rdweb/secrets/`（root 0700） |
| 備份輸出               | `/var/backups/rdweb/`              |
| 資料                   | Docker volume `rdweb_rdweb-data`   |

設定檔與備份都放在 checkout 之外，更新時工作樹保持乾淨。腳本可用環境變數 `RDWEB_CONF`、`RDWEB_BACKUP_DIR` 改用其他位置。

## 首次安裝

1. 取得指定版本的原始碼（以 tag 為單位部署）：

   ```sh
   sudo git clone https://github.com/carpmhw/RustDeskWebConsole.git /opt/rdweb
   cd /opt/rdweb
   sudo git checkout <tag>
   ```

2. 建立非秘密設定，依註解修改 `APP_PUBLIC_URL`、`APP_BASE_PATH`、`OUTER_PROXY_ADDRESSES` 等：

   ```sh
   sudo install -d -m 0755 /etc/rdweb
   sudo cp deploy/prod/rdweb.conf.example /etc/rdweb/rdweb.conf
   sudo editor /etc/rdweb/rdweb.conf
   ```

   - `APP_PUBLIC_URL` 必須是使用者瀏覽器看到的完整網址，路徑須與 `APP_BASE_PATH` 一致，例如 `https://remote.example.com/rdweb`。
   - `OUTER_PROXY_ADDRESSES` 見下方〈外層 nginx〉。

3. 產生秘密檔（不會覆寫既有檔案）：

   ```sh
   sudo sh deploy/prod/gen-secrets.sh
   ```

   依提示輸入兩次初始管理員密碼（至少 12 字元）；或加 `--generate-password` 由腳本產生並只顯示一次。之後請**另外離線保存 `vault_key`**：遺失後已加密的 TOTP 與目標密碼將無法解開，資料庫備份也無法單獨還原這些資料。

4. 首次啟動（疊加 `compose.bootstrap.yml` 建立初始管理員，帳號為 `rdweb.conf` 的 `BOOTSTRAP_ADMIN_USERNAME`）：

   ```sh
   sudo docker compose -p rdweb -f deploy/prod/compose.yml -f deploy/prod/compose.bootstrap.yml \
     --env-file /etc/rdweb/rdweb.conf up -d --build --wait --wait-timeout 300
   ```

   首次建置需下載映像與套件，時間較長。之後的啟動與更新一律只用 `compose.yml`（腳本已處理），已有管理員時不會覆寫。

5. 設定外層 nginx（下一節），重新載入 nginx，以瀏覽器開啟 `APP_PUBLIC_URL` 登入。

6. 首次登入後，到「帳號安全」綁定雙重驗證並更改密碼，然後刪除初始密碼檔：

   ```sh
   sudo rm /etc/rdweb/secrets/bootstrap_admin_password
   ```

## 外層 nginx

`nginx/` 提供兩份範例，放在既有 nginx 的 `http {}` 內（例如 `/etc/nginx/conf.d/rdweb.conf`）：

| 範例                   | 適用情況                                   |
| ---------------------- | ------------------------------------------ |
| `preserve-prefix.conf` | 外層把含子路徑的原始路徑轉給 web（建議）。 |
| `strip-prefix.conf`    | 外層在轉送前去掉子路徑。                   |

兩者對應用程式的效果相同，擇一即可。替換範例中的佔位字：

- `__SERVER_NAME__`：對外網域。
- `__CERT__`、`__KEY__`：既有 TLS 憑證與私鑰路徑。
- `__BASE__`：`APP_BASE_PATH`，不含結尾斜線，例如 `/rdweb`；部署在網域根目錄時改為空字串，並刪除標示「子路徑專用」的那一行。
- `__UPSTREAM__`：`rdweb.conf` 的 `RDWEB_BIND`，預設 `127.0.0.1:8080`。

若你的 nginx 已有相同網域的 `server`，只要把範例中的 `map` 與 `location` 區塊併入既有設定即可。範例已包含 WebSocket 升級、3600 秒逾時與關閉緩衝，這些是遠端桌面長連線所必需。

### `OUTER_PROXY_ADDRESSES`（真實用戶端 IP）

web 容器只採信這裡列出的來源所送來的 `X-Forwarded-For`，藉此把真實用戶端 IP 交給後端做限流與稽核；其他來源送來的 `X-Forwarded-For` 一律不採信。值為逗號分隔的 IPv4／IPv6 位址或 CIDR，不接受 `0.0.0.0/0`、`::/0`。

- **nginx 與本服務在同一台主機**，連到 `127.0.0.1:8080`：容器看到的來源是 compose 網路的 gateway，預設 `172.31.80.1`（即 `RDWEB_SUBNET` 的 `.1`）。使用範例預設值即可。
- **nginx 在另一台主機**：把 `RDWEB_BIND` 改為本機對內網卡位址（例如 `192.168.1.20:8080`），並以防火牆限制只有 nginx 主機能連入；`OUTER_PROXY_ADDRESSES` 設為 nginx 主機的 IP。

設定錯誤時服務仍可使用，但稽核與限流看到的會是 nginx 的位址而非用戶端位址。

## 新增 RustDesk 伺服器

hbbs／hbbr 在另一台主機。以管理員登入後在「伺服器」頁新增：

- ID 伺服器與中繼伺服器填 `主機:port`（例如 `192.168.1.30:21116`、`192.168.1.30:21117`），公鑰填 hbbs 的 `id_ed25519.pub` 內容。
- 伺服器位址若是私有網段（例如區網 `192.168.x.x`、`10.x.x.x`），必須勾選「明確允許私網／同機端點」；預設會拒絕私網位址。
- 連線失敗時先確認 Docker 主機能連到上述 port（例如 `nc -vz 192.168.1.30 21116`）。

## 日常操作

為方便操作，可設定別名（之後的 `rdweb-compose` 都指這個）：

```sh
alias rdweb-compose='sudo docker compose -p rdweb -f /opt/rdweb/deploy/prod/compose.yml --env-file /etc/rdweb/rdweb.conf'
```

| 操作           | 指令                                                         |
| -------------- | ------------------------------------------------------------ |
| 查看狀態與健康 | `rdweb-compose ps`                                           |
| 查看 log       | `rdweb-compose logs --tail 200 backend web`                  |
| 停止／啟動     | `rdweb-compose stop`／`rdweb-compose up -d --wait`           |
| 修改設定後套用 | 編輯 `/etc/rdweb/rdweb.conf` 後 `rdweb-compose up -d --wait` |

log 為 JSON，預設時間為 UTC（`LOG_TIME_ZONE` 可改）。log 不含密碼、金鑰與票證。

## 更新

```sh
sudo sh /opt/rdweb/deploy/prod/update.sh <新 tag>
```

腳本依序：檢查工作樹乾淨 → `git fetch --tags` → 確認 tag 存在 → 線上備份 → `git checkout <tag>` → 重新建置 → 啟動並等待兩個服務都健康（上限 120 秒）。備份失敗時不會切換版本。

切換版本後若建置或啟動失敗，腳本會印出回到前一版本的三個指令，請依序執行：

1. `git checkout` 回前一版本；
2. 重新建置舊版映像；
3. 以本次更新前的備份執行 `restore.sh --yes --skip-backup <備份檔>`。

新版啟動時可能已升級資料庫，舊版程式不能直接沿用，所以必須先換回舊版映像、再還原更新前的備份；更新開始後新增的資料會遺失。

## 備份

```sh
sudo sh /opt/rdweb/deploy/prod/backup.sh            # 輸出到 /var/backups/rdweb/
sudo sh /opt/rdweb/deploy/prod/backup.sh /其他目錄
```

- 線上備份，服務不中斷；使用 SQLite 備份 API，含尚未寫回主檔的已提交資料，並在完成前檢查完整性。
- 檔名為 `rdweb-<UTC 時間>-<編號>.db`，權限 0600。
- 備份**不含**任何金鑰。還原後要讀取 TOTP 與目標密碼，需要原本的 `vault_key`（以及 `secret_key`，否則所有人需重新登入）。請把 `/etc/rdweb/secrets/` 另外離線保管，不要和資料庫備份放在一起。
- 需要定期備份時，可自行加入 root 的 crontab，例如每日 03:00：`0 3 * * * sh /opt/rdweb/deploy/prod/backup.sh`，並自行清理舊檔。

## 還原

```sh
sudo sh /opt/rdweb/deploy/prod/restore.sh /var/backups/rdweb/rdweb-<時間>-<編號>.db
```

- 會要求輸入 `yes` 確認（`--yes` 可略過）。
- 流程：先線上備份目前資料 → 停止服務 → 驗證備份完整性與資料庫版本 → 取代資料庫 → 啟動並等待健康。
- 備份的資料庫版本比目前程式新時拒絕還原（結束碼 3），現有資料不變；請先更新到相同或更新版本再還原。
- 服務已無法啟動、無法先做線上備份時，可加 `--skip-backup`。
- 已登入的使用者需重新登入；進行中的遠端連線會中斷。

## 金鑰保管與輪替

- `secret_key`：簽署登入權杖。更換後所有人需重新登入，不影響資料。
- `vault_key`：加密 TOTP 與目標密碼。**不可直接更換**，必須以 `rotate-key` 重新加密資料庫內容：

```sh
cd /opt/rdweb
sudo sh deploy/prod/backup.sh
# 產生新金鑰（暫存於秘密目錄，擁有者為容器使用者 1654）
sudo sh -c 'umask 077; head -c 32 /dev/urandom | base64 | tr -d "\n" > /etc/rdweb/secrets/vault_key.new; chown 1654:1654 /etc/rdweb/secrets/vault_key.new; chmod 0400 /etc/rdweb/secrets/vault_key.new'
rdweb-compose stop
# 舊版本號為 rdweb.conf 的 VAULT_KEY_VERSION（預設 1），新版本號須更大
rdweb-compose run --rm --no-deps \
  -e ROTATE_OLD_VERSION=1 -e ROTATE_NEW_VERSION=2 \
  -e ROTATE_OLD_KEY_FILE=/run/secrets/vault_key -e ROTATE_NEW_KEY_FILE=/run/rotate/vault_key.new \
  -v /etc/rdweb/secrets/vault_key.new:/run/rotate/vault_key.new:ro \
  backend rotate-key
```

成功時只輸出輪替筆數與新版本號。接著：

1. 把舊金鑰移出（離線保存一段時間後再銷毀）並換上新金鑰：`sudo mv /etc/rdweb/secrets/vault_key /root/vault_key.v1 && sudo mv /etc/rdweb/secrets/vault_key.new /etc/rdweb/secrets/vault_key`。
2. 把 `/etc/rdweb/rdweb.conf` 的 `VAULT_KEY_VERSION` 改為新版本號。
3. `rdweb-compose up -d --wait`，並登入確認目標連線與 TOTP 正常。

輪替失敗時資料庫不變，刪除 `vault_key.new` 後以 `rdweb-compose up -d --wait` 恢復即可。

輪替前的備份是以舊 `vault_key` 加密：日後若要還原輪替前的備份，需先換回對應的舊金鑰與 `VAULT_KEY_VERSION`，因此舊金鑰應保存到不再需要那些備份為止。

## 疑難排解

| 現象                                          | 檢查                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docker compose` 提示 `請在 rdweb.conf 設定…` | 指令缺少 `--env-file /etc/rdweb/rdweb.conf`，或設定檔缺少該項。                                                           |
| backend 一直不健康                            | `rdweb-compose logs backend`；常見原因為秘密檔不存在、權限或擁有者不是 1654、`APP_PUBLIC_URL` 與 `APP_BASE_PATH` 不一致。 |
| web 啟動即結束                                | `rdweb-compose logs web`；`OUTER_PROXY_ADDRESSES` 或 `APP_BASE_PATH` 格式不合法會直接拒絕啟動。                           |
| 頁面空白或資源 404                            | 外層 nginx 的 `__BASE__` 與 `APP_BASE_PATH` 不一致，或根目錄部署未刪除「子路徑專用」行。                                  |
| 登入或連線一律被拒（HTTP 403）                | 瀏覽器網址與 `APP_PUBLIC_URL`（協定、網域、port）不一致；後端以此檢查 Origin。                                            |
| 遠端畫面連不上、立即斷線                      | 外層 nginx 缺少 WebSocket 升級標頭或逾時設定；伺服器為私網位址卻未勾選允許私網；Docker 主機連不到 hbbs／hbbr。            |
| 啟動時報子網衝突                              | 修改 `RDWEB_SUBNET`（並同步 `OUTER_PROXY_ADDRESSES` 的 gateway 位址）。                                                   |

## 其他反向代理的必要條件（未驗證）

正式驗證只涵蓋 nginx。若改用其他反向代理，至少需要：TLS 終止、轉送 WebSocket 升級（`Upgrade`／`Connection`）、長連線逾時至少 3600 秒並關閉回應緩衝、保留 `Host`、以「附加」方式設定 `X-Forwarded-For`、子路徑保留或剝除擇一並與 `APP_BASE_PATH` 一致，以及把它連到 web 的來源位址填入 `OUTER_PROXY_ADDRESSES`。
