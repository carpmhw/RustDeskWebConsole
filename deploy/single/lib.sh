# 單容器部署維運腳本共用設定；由各腳本 source，不單獨執行。與兩容器版（deploy/prod）各自獨立。

# 映像內 app 使用者的 uid／gid（與兩容器版 aspnet 映像相同）。
APP_UID=1654
# 腳本所在目錄（deploy/single）；呼叫端需先設定 SCRIPT_DIR。
RDWEB_CONF=${RDWEB_CONF:-/etc/rdweb/single.conf}
RDWEB_BACKUP_DIR=${RDWEB_BACKUP_DIR:-/var/backups/rdweb-single}
RDWEB_PROJECT=${RDWEB_PROJECT:-rdweb-single}
# 選用：以空白分隔的額外 compose 檔（絕對路徑），疊加在 compose.yml 之後，例如主機自訂網路。
RDWEB_COMPOSE_EXTRA=${RDWEB_COMPOSE_EXTRA:-}

# 輸出固定錯誤訊息並以指定結束碼（預設 2）結束。
fail() {
  printf '%s\n' "$1" >&2
  exit "${2:-2}"
}

# 以固定專案名稱、compose 檔與非秘密設定檔操作整個部署。
compose() {
  [ -r "$RDWEB_CONF" ] || fail "找不到設定檔 $RDWEB_CONF（可用 RDWEB_CONF 指定）。"
  # 先在參數尾端依序加入 -f 檔案，再把原本的子命令參數輪轉到最後，保持 compose.yml 在前。
  count=$#
  set -- "$@" -f "$SCRIPT_DIR/compose.yml"
  for extra in $RDWEB_COMPOSE_EXTRA; do
    set -- "$@" -f "$extra"
  done
  while [ "$count" -gt 0 ]; do
    set -- "$@" "$1"
    shift
    count=$((count - 1))
  done
  docker compose -p "$RDWEB_PROJECT" --env-file "$RDWEB_CONF" "$@"
}

# 啟動（或重建）服務並等待 rdweb（後端與 nginx）健康，上限 120 秒。
compose_up() {
  compose up -d --wait --wait-timeout 120
}
