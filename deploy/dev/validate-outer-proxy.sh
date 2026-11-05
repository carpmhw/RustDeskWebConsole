# 由 entrypoint source：驗證 OUTER_PROXY_ADDRESSES 並產生 nginx realip 設定至 REAL_IP_CONFIG。
# 只信任明確列出的外層反向代理；未設定時輸出空字串，維持 dev 既有行為。錯誤訊息不回顯輸入。

# 拒絕並結束；只輸出固定訊息。
reject_outer_proxy() {
  printf '%s\n' 'OUTER_PROXY_ADDRESSES 格式不合法（需為逗號分隔的 IPv4／IPv6 位址或 CIDR，且不得為萬用範圍）。' >&2
  exit 2
}

# 驗證單一 IPv4 位址：四段十進位、每段 0–255。
valid_ipv4() {
  case "$1" in
    *[!0-9.]* | .* | *. | *..*) return 1 ;;
  esac
  set -f
  old_ifs=$IFS
  IFS=.
  # shellcheck disable=SC2086
  set -- $1
  IFS=$old_ifs
  set +f
  [ $# -eq 4 ] || return 1
  for octet in "$@"; do
    [ ${#octet} -le 3 ] && [ "$octet" -le 255 ] || return 1
  done
}

# 驗證單一 IPv6 位址：僅十六進位與冒號、每組至多 4 字元、最多一個 ::、不得出現 :::。
valid_ipv6() {
  case "$1" in
    *[!0-9A-Fa-f:]* | *:::* | *::*::* | :[!:]* | *[!:]:) return 1 ;;
    *:*) ;;
    *) return 1 ;;
  esac
  rest=$1
  groups=0
  while [ -n "$rest" ]; do
    group=${rest%%:*}
    [ ${#group} -le 4 ] || return 1
    [ -n "$group" ] && groups=$((groups + 1))
    case "$rest" in
      *:*) rest=${rest#*:} ;;
      *) rest='' ;;
    esac
  done
  [ "$groups" -le 8 ]
}

REAL_IP_CONFIG=''
if [ "${OUTER_PROXY_ADDRESSES+set}" = set ]; then
  list=$OUTER_PROXY_ADDRESSES
  case "$list" in
    '' | ,* | *, | *,,*) reject_outer_proxy ;;
  esac
  remaining=$list
  while [ -n "$remaining" ]; do
    item=${remaining%%,*}
    case "$remaining" in
      *,*) remaining=${remaining#*,} ;;
      *) remaining='' ;;
    esac
    address=${item%/*}
    prefix=''
    case "$item" in
      */*)
        prefix=${item#*/}
        case "$prefix" in
          '' | *[!0-9]*) reject_outer_proxy ;;
        esac
        [ ${#prefix} -le 3 ] && [ "$prefix" -gt 0 ] || reject_outer_proxy
        ;;
    esac
    if valid_ipv4 "$address"; then
      [ -z "$prefix" ] || [ "$prefix" -le 32 ] || reject_outer_proxy
    elif valid_ipv6 "$address"; then
      [ -z "$prefix" ] || [ "$prefix" -le 128 ] || reject_outer_proxy
    else
      reject_outer_proxy
    fi
    REAL_IP_CONFIG="${REAL_IP_CONFIG}set_real_ip_from ${item};
"
  done
  REAL_IP_CONFIG="${REAL_IP_CONFIG}real_ip_header X-Forwarded-For;
real_ip_recursive off;"
fi
export REAL_IP_CONFIG
