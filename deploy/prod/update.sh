#!/bin/sh
# 更新到指定版本：sudo sh update.sh <tag>
# 流程：檢查工作樹 → fetch → 備份 → checkout tag → build → up 並等待健康。
# 主體包在函數內並於最後一行呼叫：checkout 會改寫本檔，sh 必須先讀完整個腳本。
set -eu
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/lib.sh"

# 切換版本後失敗時，輸出回到前一版本的完整順序：先切回並重建舊映像，再以更新前備份離線還原
# （新版可能已升級資料庫 schema，舊程式不能直接沿用）。
rollback_hint() {
  printf '%s\n' '更新失敗，服務可能未正常運作。回到前一版本請依序執行：' \
    "  sudo git -C $repo checkout -q $previous" \
    "  sudo docker compose -p $RDWEB_PROJECT -f $SCRIPT_DIR/compose.yml --env-file $RDWEB_CONF build" \
    "  sudo sh $SCRIPT_DIR/restore.sh --yes --skip-backup $backup" >&2
}

# 依序執行更新步驟；任一步失敗即停止，切換版本後的失敗一律提示回滾步驟。
main() {
  [ $# -eq 1 ] || fail '用法：sudo sh update.sh <tag>'
  tag=$1
  repo=$(CDPATH='' cd -- "$SCRIPT_DIR/../.." && pwd)
  [ -z "$(git -C "$repo" status --porcelain)" ] || fail '工作樹有未提交的修改，拒絕更新。'
  git -C "$repo" fetch --tags
  git -C "$repo" rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null || fail "找不到 tag $tag。"
  previous=$(git -C "$repo" describe --tags --exact-match 2>/dev/null || git -C "$repo" rev-parse HEAD)
  report=$(sh "$SCRIPT_DIR/backup.sh" "$RDWEB_BACKUP_DIR") || fail '更新前備份失敗，未變更版本。' 1
  printf '%s\n' "$report"
  # backup.sh 最後一行為「已備份：<路徑>（…）」，取出路徑供回滾提示使用。
  backup=${report##*已備份：}
  backup=${backup%%（*}
  trap 'status=$?; if [ "$status" != 0 ]; then rollback_hint; fi' EXIT
  git -C "$repo" checkout -q "$tag"
  compose build || exit 1
  compose_up || fail '服務未在時限內恢復健康。' 1
  trap - EXIT
  printf '%s\n' "已更新到 $tag。"
}

main "$@"; exit $?
