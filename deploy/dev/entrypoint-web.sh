#!/bin/sh
set -eu

# 啟動時只允許可安全注入 HTML 與 nginx 的無歧義路徑。
BASE=${APP_BASE_PATH:-/}
case "$BASE" in
  *//*) printf '%s\n' 'APP_BASE_PATH 不接受重複斜線。' >&2; exit 2 ;;
esac
BASE=${BASE%/}
case "$BASE" in
  ''|/*) ;;
  *) printf '%s\n' 'APP_BASE_PATH 必須以 / 開頭。' >&2; exit 2 ;;
esac
case "$BASE" in
  *[!A-Za-z0-9_/-]*|*//*|*/./*|*/../*) printf '%s\n' 'APP_BASE_PATH 包含不合法字元。' >&2; exit 2 ;;
esac
DISPLAY_ZONE=${DEFAULT_DISPLAY_TIME_ZONE:-Asia/Taipei}
case "$DISPLAY_ZONE" in
  ''|*[!A-Za-z0-9_+/-]*) printf '%s\n' 'DEFAULT_DISPLAY_TIME_ZONE 格式不合法。' >&2; exit 2 ;;
esac
export BASE

# M0 ingress 角色只用於驗證外層代理保留／剝除模式，正式部署不需要此容器。
if [ "${WEB_ROLE:-web}" = ingress ]; then
  case "${PREFIX_MODE:-preserve}" in
    preserve) STRIP_REWRITE='' ;;
    strip) STRIP_REWRITE="rewrite ^${BASE}(/.*)\$ \$1 break;" ;;
    *) printf '%s\n' 'PREFIX_MODE 必須是 preserve 或 strip。' >&2; exit 2 ;;
  esac
  export STRIP_REWRITE
  envsubst '${BASE} ${STRIP_REWRITE}' < /etc/rdweb/ingress.conf.template > /tmp/nginx.conf
else
  # 只更動 runtime config 與 base 標籤，無須重新建置 JS／CSS。
  sed "s|<base href=\"/\" />|<base href=\"${BASE}/\" />|" /usr/share/nginx/html/index.html > /tmp/index.html
  cp /tmp/index.html /usr/share/nginx/html/index.html
  printf 'window.RDWEB_CONFIG = {basePath:"%s",defaultDisplayTimeZone:"%s"};\n' "$BASE" "$DISPLAY_ZONE" > /usr/share/nginx/html/config.js
  envsubst '${BASE}' < /etc/rdweb/nginx.conf.template > /tmp/nginx.conf
fi
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
