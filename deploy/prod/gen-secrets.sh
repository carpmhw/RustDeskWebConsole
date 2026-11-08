#!/bin/sh
# 產生正式部署的 Docker secrets 檔案：secret_key、vault_key、bootstrap_admin_password。
# 用法：sudo sh gen-secrets.sh [--generate-password] [目錄（預設 /etc/rdweb/secrets）]
# 已存在任一目標檔即拒絕，絕不覆寫；金鑰內容不輸出到終端。
set -eu
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/lib.sh"
NAMES='secret_key vault_key bootstrap_admin_password'

generate_password=0
dir=/etc/rdweb/secrets
for argument in "$@"; do
  case "$argument" in
    --generate-password) generate_password=1 ;;
    -*) fail '用法：sudo sh gen-secrets.sh [--generate-password] [目錄]' ;;
    *) dir=$argument ;;
  esac
done

[ "$(id -u)" = 0 ] || fail '請以 sudo 執行：秘密檔需設定為容器 app 使用者擁有。'
for name in $NAMES; do
  [ ! -e "$dir/$name" ] || fail "$dir 已有秘密檔，拒絕覆寫。若要更換金鑰請參考部署文件的金鑰輪替。"
done

if [ "$generate_password" = 1 ]; then
  password=$(head -c 18 /dev/urandom | base64 | tr -d '\n')
else
  # 互動輸入時關閉回顯；非終端輸入（例如管線）直接讀取。
  if [ -t 0 ]; then stty -echo; fi
  printf '%s' '初始管理員密碼（至少 12 字元）：' >&2
  IFS= read -r password || password=''
  printf '\n%s' '再輸入一次：' >&2
  IFS= read -r confirm || confirm=''
  if [ -t 0 ]; then stty echo; fi
  printf '\n' >&2
  [ "$password" = "$confirm" ] || fail '兩次輸入的密碼不一致。'
  [ ${#password} -ge 12 ] && [ ${#password} -le 1024 ] || fail '密碼長度須為 12 至 1024 字元。'
fi

umask 077
mkdir -p "$dir"
chmod 0700 "$dir"
# 先寫入暫存檔，全部成功後才改名；中途失敗時清除暫存檔，避免留下半套秘密阻擋重跑。
trap 'for name in $NAMES; do rm -f "$dir/.$name.tmp"; done' EXIT
head -c 32 /dev/urandom | base64 | tr -d '\n' > "$dir/.secret_key.tmp"
head -c 32 /dev/urandom | base64 | tr -d '\n' > "$dir/.vault_key.tmp"
printf '%s' "$password" > "$dir/.bootstrap_admin_password.tmp"
for name in $NAMES; do
  chmod 0400 "$dir/.$name.tmp"
done
for name in $NAMES; do
  mv "$dir/.$name.tmp" "$dir/$name"
  chown "$APP_UID:$APP_UID" "$dir/$name"
done
trap - EXIT

if [ "$generate_password" = 1 ]; then
  printf '初始管理員密碼（只顯示這一次，首次登入後可在帳號安全頁變更）：%s\n' "$password"
fi
printf '%s\n' "已建立 $dir/secret_key、vault_key、bootstrap_admin_password。"
printf '%s\n' '請另外離線保存 vault_key：遺失後已加密的 TOTP 與目標密碼將無法解開。'
