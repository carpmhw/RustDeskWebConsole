# RustDesk Web Console 單容器部署（Docker）

本文件說明以**一個 compose 服務**部署 RustDesk Web Console：nginx 與後端在同一個映像內，由入口腳本監督。功能、資安設定與外層 nginx 需求和兩容器版（[`deploy/prod/README.md`](../prod/README.md)）相同，差別只在部署形態與維運指令。所有指令都以本目錄提供的腳本為準。

## 架構

```text
瀏覽器 ──HTTPS──▶ 既有 nginx（外層，TLS）──HTTP──▶ rdweb 容器 ┌ nginx :8000（靜態檔＋轉送）
                                                               └ 後端 127.0.0.1:8080（ASP.NET Core）──▶ 另一台主機的 hbbs／hbbr
```

- 一個 compose 專案（`rdweb-single`）只有一個服務 `rdweb`。容器內先啟動後端，健康後才啟動 nginx；任一程序結束，容器即以非零碼結束並由 `restart: unless-stopped` 重啟。
- 後端只聽容器回環位址，只信任同容器 nginx；外層代理位址由 nginx 依 `OUTER_PROXY_ADDRESSES` 採信。
- 資料：SQLite 在 named volume `rdweb-single_rdweb-data`（容器內 `/app/data/app.db`），與兩容器版的 volume 分開。
- 秘密：`secret_key`、`vault_key`、`bootstrap_admin_password` 以 Docker secrets 檔案掛載到 `/run/secrets`，不放在環境變數值、映像或命令列。
- 以非 root（uid 1654）執行、唯讀根檔案系統、去除全部 Linux capability；只綁 `127.0.0.1:8080`（可調）。
- nginx 與兩容器版的 web 使用同一個映像版本與同一份閘道設定。

## 需求

與兩容器版相同，見 [`deploy/prod/README.md` 的〈需求〉](../prod/README.md#需求)。

## 預設路徑

| 用途                   | 路徑                                    |
| ---------------------- | --------------------------------------- |
| 原始碼（git checkout） | `/opt/rdweb`                            |
| 非秘密設定             | `/etc/rdweb/single.conf`                |
| 秘密檔目錄             | `/etc/rdweb/secrets/`（與兩容器版共用） |
| 備份輸出               | `/var/backups/rdweb-single/`            |
| 資料                   | Docker volume `rdweb-single_rdweb-data` |

腳本可用環境變數 `RDWEB_CONF`、`RDWEB_BACKUP_DIR` 改用其他位置；`sudo` 會清除環境變數，需寫成 `sudo env RDWEB_CONF=… sh …`。

## 首次安裝

1. 取得指定版本的原始碼：

   ```sh
   sudo git clone https://github.com/carpmhw/RustDeskWebConsole.git /opt/rdweb
   cd /opt/rdweb
   sudo git checkout <tag>
   ```

2. 建立非秘密設定，依註解修改 `APP_PUBLIC_URL`、`APP_BASE_PATH`、`OUTER_PROXY_ADDRESSES` 等：

   ```sh
   sudo install -d -m 0755 /etc/rdweb
   sudo cp deploy/single/single.conf.example /etc/rdweb/single.conf
   sudo editor /etc/rdweb/single.conf
   ```

3. 產生秘密檔（不會覆寫既有檔案）。**已安裝兩容器版時跳過此步**，直接沿用同一個秘密目錄：

   ```sh
   sudo sh deploy/single/gen-secrets.sh
   ```

   依提示輸入兩次初始管理員密碼（至少 12 字元），或加 `--generate-password` 由腳本產生並只顯示一次。請**另外離線保存 `vault_key`**。

4. 建置映像、建立初始管理員（一次性指令，帳號為 `single.conf` 的 `BOOTSTRAP_ADMIN_USERNAME`），再啟動服務：

   ```sh
   sudo docker compose -p rdweb-single -f deploy/single/compose.yml --env-file /etc/rdweb/single.conf build
   sudo docker compose -p rdweb-single -f deploy/single/compose.yml -f deploy/single/compose.bootstrap.yml \
     --env-file /etc/rdweb/single.conf run --rm --no-deps rdweb bootstrap create-admin
   sudo docker compose -p rdweb-single -f deploy/single/compose.yml --env-file /etc/rdweb/single.conf \
     up -d --wait --wait-timeout 300
   ```

   以參數執行映像時只執行後端指令、不啟動 nginx。建立管理員成功時不輸出內容（結束碼 0），已有管理員時不覆寫。`compose.bootstrap.yml` 只用於這一次的 `run`，不要拿來 `up`。

5. 設定外層 nginx（下一節），重新載入 nginx，以瀏覽器開啟 `APP_PUBLIC_URL` 登入。

6. 首次登入後到「帳號安全」綁定雙重驗證，然後刪除初始密碼檔：`sudo rm /etc/rdweb/secrets/bootstrap_admin_password`。

帳號、密碼與雙重驗證政策的管理方式與兩容器版相同，見 [〈帳號與密碼管理〉](../prod/README.md#帳號與密碼管理)。

## 外層 nginx

使用兩容器版的範例 `deploy/prod/nginx/preserve-prefix.conf` 或 `strip-prefix.conf`，佔位字替換方式見 [〈外層 nginx〉](../prod/README.md#外層-nginx)；`__UPSTREAM__` 填 `single.conf` 的 `RDWEB_BIND`（預設 `127.0.0.1:8080`）。

`OUTER_PROXY_ADDRESSES` 的意義相同，但預設值不同：

- **nginx 與本服務在同一台主機**，連到 `127.0.0.1:8080`：容器看到的來源是本部署網路的 gateway，預設 `172.31.82.1`（即 `RDWEB_SUBNET` 的 `.1`）。使用範例預設值即可。
- **nginx 在另一台主機**：把 `RDWEB_BIND` 改為本機對內網卡位址並以防火牆限制來源；`OUTER_PROXY_ADDRESSES` 設為 nginx 主機的 IP。

子網固定只是為了讓 gateway 位址可預先設定；容器本身沒有固定位址。預設子網 `172.31.82.0/24` 與兩容器版的 `172.31.80.0/24` 錯開。

## 新增 RustDesk 伺服器

與兩容器版相同，見 [〈新增 RustDesk 伺服器〉](../prod/README.md#新增-rustdesk-伺服器)。

## 日常操作

```sh
alias rdweb-single='sudo docker compose -p rdweb-single -f /opt/rdweb/deploy/single/compose.yml --env-file /etc/rdweb/single.conf'
```

| 操作           | 指令                                                         |
| -------------- | ------------------------------------------------------------ |
| 查看狀態與健康 | `rdweb-single ps`                                            |
| 查看 log       | `rdweb-single logs --tail 200 rdweb`                         |
| 停止／啟動     | `rdweb-single stop`／`rdweb-single up -d --wait`             |
| 修改設定後套用 | 編輯 `/etc/rdweb/single.conf` 後 `rdweb-single up -d --wait` |

log 混合後端 JSON 與 nginx 錯誤訊息，後端時間預設 UTC。log 不含密碼、金鑰與票證。

## 更新、備份、還原

指令與行為和兩容器版相同，只是改用本目錄的腳本：

```sh
sudo sh /opt/rdweb/deploy/single/update.sh <新 tag>
sudo sh /opt/rdweb/deploy/single/backup.sh            # 輸出到 /var/backups/rdweb-single/
sudo sh /opt/rdweb/deploy/single/restore.sh /var/backups/rdweb-single/rdweb-<時間>-<編號>.db
```

更新失敗時的回滾步驟、備份不含金鑰、還原會要求確認與結束碼 3 等細節，見兩容器版的 [〈更新〉](../prod/README.md#更新)、[〈備份〉](../prod/README.md#備份)、[〈還原〉](../prod/README.md#還原)。

## 稽核紀錄

稽核頁、匯出與保留天數的行為與兩容器版相同，見 [〈稽核紀錄〉](../prod/README.md#稽核紀錄)；需要縮小資料庫時，照該節步驟改用 `deploy/single/` 的 `backup.sh`、`restore.sh` 與 `/var/backups/rdweb-single/`。

## 從兩容器版搬到單容器版

兩種部署使用不同的 volume，資料只透過備份與還原搬移。兩者都預設綁 `127.0.0.1:8080`，**不要同時啟動**。

1. 以兩容器版線上備份：`sudo sh /opt/rdweb/deploy/prod/backup.sh`。
2. 停止兩容器版（**不要加 `-v`**，保留原 volume 以便回退）：`sudo docker compose -p rdweb -f /opt/rdweb/deploy/prod/compose.yml --env-file /etc/rdweb/rdweb.conf down`。
3. 依〈首次安裝〉第 2、4 步建立 `single.conf` 並建置（秘密目錄沿用，跳過第 3 步與建立管理員）。
4. 還原備份（此時單容器尚無資料可先備份，加 `--skip-backup`）：

   ```sh
   sudo sh /opt/rdweb/deploy/single/restore.sh --skip-backup /var/backups/rdweb/rdweb-<時間>-<編號>.db
   ```

5. 登入確認使用者、目標與連線正常後，外層 nginx 不需修改（同一個 `RDWEB_BIND`）。

`vault_key` 必須和兩容器版相同，否則目標密碼與 TOTP 無法解開。反方向搬移時角色對調。

## 金鑰保管與輪替

說明同兩容器版的 [〈金鑰保管與輪替〉](../prod/README.md#金鑰保管與輪替)，指令改為：

```sh
sudo sh /opt/rdweb/deploy/single/backup.sh
sudo sh -c 'umask 077; head -c 32 /dev/urandom | base64 | tr -d "\n" > /etc/rdweb/secrets/vault_key.new; chown 1654:1654 /etc/rdweb/secrets/vault_key.new; chmod 0400 /etc/rdweb/secrets/vault_key.new'
rdweb-single stop
rdweb-single run --rm --no-deps \
  -e ROTATE_OLD_VERSION=1 -e ROTATE_NEW_VERSION=2 \
  -e ROTATE_OLD_KEY_FILE=/run/secrets/vault_key -e ROTATE_NEW_KEY_FILE=/run/rotate/vault_key.new \
  -v /etc/rdweb/secrets/vault_key.new:/run/rotate/vault_key.new:ro \
  rdweb rotate-key
```

兩種部署共用秘密目錄：換上新金鑰後，另一種部署（若仍保留）的 `VAULT_KEY_VERSION` 與資料也須一致，否則不要再啟動它。

管理員忘記密碼時，在容器內執行救援指令，方式同兩容器版的 [〈管理員忘記密碼或遺失雙重驗證裝置〉](../prod/README.md#管理員忘記密碼或遺失雙重驗證裝置)，進入容器改用 `rdweb-single exec -it rdweb sh`，中斷進行中連線改用 `rdweb-single restart rdweb`。

## 疑難排解

| 現象                                           | 檢查                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `docker compose` 提示 `請在 single.conf 設定…` | 指令缺少 `--env-file /etc/rdweb/single.conf`，或設定檔缺少該項。                                                              |
| 容器反覆重啟或一直不健康                       | `rdweb-single logs rdweb`；`後端在就緒前結束` 多為秘密檔不存在、擁有者不是 1654、`APP_PUBLIC_URL` 與 `APP_BASE_PATH` 不一致。 |
| 容器啟動即結束                                 | `OUTER_PROXY_ADDRESSES` 或 `APP_BASE_PATH` 格式不合法會直接拒絕啟動，錯誤訊息為固定文字。                                     |
| 稽核與限流看到的都是同一個位址                 | `OUTER_PROXY_ADDRESSES` 不是實際來源（同主機時應為 `RDWEB_SUBNET` 的 gateway）。                                              |
| 啟動時報子網衝突                               | 修改 `RDWEB_SUBNET`，並同步 `OUTER_PROXY_ADDRESSES` 的 gateway 位址。                                                         |
| 頁面空白、403、遠端畫面連不上                  | 與兩容器版相同，見其 [〈疑難排解〉](../prod/README.md#疑難排解)。                                                             |
