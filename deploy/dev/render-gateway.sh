# 由 entrypoint source：兩容器 web 與單容器共用的閘道設定驗證與渲染（POSIX sh）。
# 使用者設定：APP_BASE_PATH、DEFAULT_DISPLAY_TIME_ZONE、OUTER_PROXY_ADDRESSES。
# 映像固定值：GATEWAY_LISTEN_PORT、GATEWAY_UPSTREAM、GATEWAY_HTML_SOURCE。
# 輸出只寫入暫存目錄：GATEWAY_RUNTIME_DIR（index.html、config.js 與其餘靜態檔連結）與 GATEWAY_NGINX_CONF。
GATEWAY_DIR=${GATEWAY_DIR:-/etc/rdweb}
GATEWAY_RUNTIME_DIR=${GATEWAY_RUNTIME_DIR:-/tmp/rdweb-runtime}
GATEWAY_NGINX_CONF=${GATEWAY_NGINX_CONF:-/tmp/nginx.conf}

# 驗證執行期掛載路徑並匯出無結尾斜線的 BASE；只允許可安全注入 HTML 與 nginx 的無歧義路徑，錯誤不回顯輸入。
gateway_validate_base() {
  BASE=${APP_BASE_PATH:-/}
  case "$BASE" in
    *//*) printf '%s\n' 'APP_BASE_PATH 不接受重複斜線。' >&2; exit 2 ;;
  esac
  BASE=${BASE%/}
  case "$BASE" in
    '' | /*) ;;
    *) printf '%s\n' 'APP_BASE_PATH 必須以 / 開頭。' >&2; exit 2 ;;
  esac
  case "$BASE" in
    *[!A-Za-z0-9_/-]* | *//* | */./* | */../*) printf '%s\n' 'APP_BASE_PATH 包含不合法字元。' >&2; exit 2 ;;
  esac
  export BASE
}

# 驗證顯示時區與外層代理位址，產生執行期 index.html／config.js、其餘靜態檔連結及 nginx 設定。
gateway_render() {
  display_zone=${DEFAULT_DISPLAY_TIME_ZONE:-Asia/Taipei}
  case "$display_zone" in
    '' | *[!A-Za-z0-9_+/-]*) printf '%s\n' 'DEFAULT_DISPLAY_TIME_ZONE 格式不合法。' >&2; exit 2 ;;
  esac
  . "$GATEWAY_DIR/validate-outer-proxy.sh"
  rm -rf "$GATEWAY_RUNTIME_DIR"
  mkdir -p "$GATEWAY_RUNTIME_DIR"
  for entry in "$GATEWAY_HTML_SOURCE"/*; do
    case "${entry##*/}" in
      index.html | config.js) ;;
      *) ln -s "$entry" "$GATEWAY_RUNTIME_DIR/" ;;
    esac
  done
  # 只更動 base 標籤與 runtime config，無須重新建置 JS／CSS。
  sed "s|<base href=\"/\" />|<base href=\"${BASE}/\" />|" "$GATEWAY_HTML_SOURCE/index.html" > "$GATEWAY_RUNTIME_DIR/index.html"
  printf 'window.RDWEB_CONFIG = {basePath:"%s",defaultDisplayTimeZone:"%s"};\n' "$BASE" "$display_zone" > "$GATEWAY_RUNTIME_DIR/config.js"
  GATEWAY_ROOT=$GATEWAY_RUNTIME_DIR
  export GATEWAY_ROOT GATEWAY_LISTEN_PORT GATEWAY_UPSTREAM
  envsubst '${BASE} ${REAL_IP_CONFIG} ${GATEWAY_LISTEN_PORT} ${GATEWAY_UPSTREAM} ${GATEWAY_ROOT}' \
    < "$GATEWAY_DIR/nginx.conf.template" > "$GATEWAY_NGINX_CONF"
}
