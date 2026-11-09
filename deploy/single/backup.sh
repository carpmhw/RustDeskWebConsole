#!/bin/sh
# 線上備份（服務不中斷）：sudo sh backup.sh [輸出目錄（預設 /var/backups/rdweb-single）]
# 備份檔只含資料庫，不含任何金鑰；還原時需搭配原本的 vault_key／secret_key。
set -eu
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/lib.sh"

out=${1:-$RDWEB_BACKUP_DIR}
# 檔名以 UTC 時間開頭（字典序即時間序），加上程序編號避免同一秒內連續備份撞名。
name=rdweb-$(date -u +%Y%m%dT%H%M%SZ)-$$.db
[ ! -e "$out/$name" ] || fail "$out/$name 已存在。"
compose exec -T rdweb dotnet RdWeb.Api.dll backup "/app/data/backups/$name" >/dev/null || fail '資料庫備份失敗。' 1
# 不論複製成功與否都清除容器內暫存快照。
trap 'compose exec -T rdweb rm -f "/app/data/backups/$name" >/dev/null 2>&1 || true' EXIT
umask 077
mkdir -p "$out"
compose cp "rdweb:/app/data/backups/$name" "$out/$name" >/dev/null 2>&1 || { rm -f "$out/$name"; fail '複製備份檔失敗。' 1; }
chmod 0600 "$out/$name"
printf '%s\n' "已備份：$out/$name（不含金鑰，請另外保管 vault_key 與 secret_key）。"
