#!/bin/sh
# 更新到指定版本：sudo sh update.sh <tag>
# 流程：檢查工作樹 → fetch → 備份 → checkout tag → build → up 並等待健康。
# 主體包在函數內並於最後一行呼叫：checkout 會改寫本檔，sh 必須先讀完整個腳本。
set -eu
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/lib.sh"

# 依序執行更新步驟；任一步失敗即停止，啟動失敗時提示回到前一版本。
main() {
  [ $# -eq 1 ] || fail '用法：sudo sh update.sh <tag>'
  tag=$1
  repo=$SCRIPT_DIR/../..
  [ -z "$(git -C "$repo" status --porcelain)" ] || fail '工作樹有未提交的修改，拒絕更新。'
  git -C "$repo" fetch --tags
  git -C "$repo" rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null || fail "找不到 tag $tag。"
  previous=$(git -C "$repo" describe --tags --exact-match 2>/dev/null || git -C "$repo" rev-parse HEAD)
  sh "$SCRIPT_DIR/backup.sh" "$RDWEB_BACKUP_DIR" || fail '更新前備份失敗，未變更版本。' 1
  git -C "$repo" checkout -q "$tag"
  compose build
  compose_up || fail "服務未在時限內恢復健康。可回到前一版本：sudo sh $SCRIPT_DIR/update.sh $previous" 1
  printf '%s\n' "已更新到 $tag。"
}

main "$@"; exit $?
