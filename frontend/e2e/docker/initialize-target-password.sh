#!/bin/sh
# 只補owned fixture缺失的root密碼，保留既有identity／非空storage，秘密不進argv或log。
initialize_target_password() (
  set +x
  umask 077
  config_path=$1
  password_path=$2
  if [ ! -s "$password_path" ] || ! fixture_password=$(tr -d '\r\n' < "$password_path" 2>/dev/null); then
    printf '%s\n' 'Target password fixture unavailable' >&2
    return 1
  fi
  case "$fixture_password" in ''|*[!0123456789abcdef]*)
    printf '%s\n' 'Target password fixture unavailable' >&2
    return 1 ;;
  esac
  if [ "${#fixture_password}" -ne 48 ]; then
    printf '%s\n' 'Target password fixture unavailable' >&2
    return 1
  fi
  config_status=2
  if [ -f "$config_path" ]; then
    config_status=0
    # 只辨識root欄位；duplicate拒絕，非空既有storage不被初始化覆寫。
    awk '
      BEGIN { root = 1; count = 0; present = 0 }
      /^[[:space:]]*\[/ { root = 0 }
      root && /^[[:space:]]*password[[:space:]]*=/ {
        count++
        value = $0
        sub(/^[^=]*=[[:space:]]*/, "", value)
        sub(/[[:space:]]*$/, "", value)
        if (value != "\"\"" && value != sprintf("%c%c", 39, 39)) present = 1
      }
      END { if (count > 1) exit 3; if (present) exit 0; exit 2 }
    ' "$config_path" > /dev/null 2>&1 || config_status=$?
  elif [ -e "$config_path" ]; then
    config_status=3
  fi
  case "$config_status" in
    0) return 0 ;;
    2) ;;
    *) printf '%s\n' 'Target password fixture unavailable' >&2; return 1 ;;
  esac
  if ! config_temp=$(mktemp "${config_path}.XXXXXX" 2>/dev/null); then
    printf '%s\n' 'Target password fixture unavailable' >&2
    return 1
  fi
  # 同目錄0600暫檔原子替換，不丟掉salt／key／ID與子section。
  if {
    printf "password = '%s'\n" "$fixture_password"
    if [ -f "$config_path" ]; then
      awk '
        BEGIN { root = 1 }
        /^[[:space:]]*\[/ { root = 0 }
        root && /^[[:space:]]*password[[:space:]]*=/ { next }
        { print }
      ' "$config_path" 2>/dev/null
    fi
  } > "$config_temp" && mv "$config_temp" "$config_path" 2>/dev/null; then
    return 0
  fi
  rm -f "$config_temp"
  printf '%s\n' 'Target password fixture unavailable' >&2
  return 1
)
