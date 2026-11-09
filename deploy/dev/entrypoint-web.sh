#!/bin/sh
set -eu

# 兩容器 web：閘道設定由與單容器共用的腳本驗證與渲染，執行期檔案只寫入 /tmp。
GATEWAY_LISTEN_PORT=8080
GATEWAY_UPSTREAM=backend:8080
GATEWAY_HTML_SOURCE=/usr/share/nginx/html
. /etc/rdweb/render-gateway.sh
gateway_validate_base

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
  gateway_render
fi
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
