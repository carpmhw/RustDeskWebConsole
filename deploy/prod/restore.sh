#!/bin/sh
# 離線還原：sudo sh restore.sh [--yes] [--skip-backup] <備份檔>
# 先備份現況、停止服務、驗證並取代資料庫，再啟動服務；備份 schema 較新於目前程式時拒絕（exit 3）。
set -eu
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/lib.sh"

yes=0
skip_backup=0
file=''
for argument in "$@"; do
  case "$argument" in
    --yes) yes=1 ;;
    --skip-backup) skip_backup=1 ;;
    -*) fail '用法：sudo sh restore.sh [--yes] [--skip-backup] <備份檔>' ;;
    *) file=$argument ;;
  esac
done
[ -n "$file" ] && [ -f "$file" ] && [ -r "$file" ] || fail '找不到可讀取的備份檔。'

if [ "$yes" != 1 ]; then
  printf '%s' '還原會以備份取代目前所有資料並短暫停止服務。輸入 yes 繼續：' >&2
  IFS= read -r answer || answer=''
  [ "$answer" = yes ] || fail '已取消，未變更任何資料。' 1
fi

# --skip-backup 只用於服務已無法啟動、無法線上備份現況時。
[ "$skip_backup" = 1 ] || sh "$SCRIPT_DIR/backup.sh" "$RDWEB_BACKUP_DIR"

# 主機備份檔為 root 0600；複製一份交給容器 app 使用者唯讀掛載，結束後刪除。
staging=$(mktemp)
trap 'rm -f "$staging"' EXIT
cp "$file" "$staging"
chown "$APP_UID:$APP_UID" "$staging"
chmod 0400 "$staging"

compose stop
set +e
compose run --rm --no-deps -T -v "$staging:/restore.db:ro" backend restore /restore.db >/dev/null
code=$?
set -e
compose_up || fail '服務未在時限內恢復健康，請以 docker compose ps／logs 檢查。' 1
case "$code" in
  0) printf '%s\n' '還原完成，服務已重新啟動。' ;;
  3) fail '備份的資料庫版本較新於目前程式，未還原；請先更新到相同或更新版本再還原。' 3 ;;
  *) fail '備份檔驗證或還原失敗，現有資料未變更。' 1 ;;
esac
