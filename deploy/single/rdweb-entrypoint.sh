#!/bin/bash
# 單容器入口。有參數：直接執行後端 CLI（bootstrap、backup、restore、recover-admin、healthcheck）。
# 無參數：驗證並渲染閘道設定 → 啟動後端 → 後端健康後才啟動 nginx → 任一程序結束即停止另一個並以非零碼結束。
set -euo pipefail

if [ $# -gt 0 ]; then
  exec dotnet /app/RdWeb.Api.dll "$@"
fi

# 後端只聽容器回環位址，只信任同容器 nginx 的轉送標頭；固定值不接受外部覆寫。
export ASPNETCORE_URLS=http://127.0.0.1:8080
export TRUSTED_PROXIES=127.0.0.1
unset ASPNETCORE_HTTP_PORTS ASPNETCORE_HTTPS_PORTS

GATEWAY_LISTEN_PORT=8000
GATEWAY_UPSTREAM=127.0.0.1:8080
GATEWAY_HTML_SOURCE=/usr/share/nginx/html
. /etc/rdweb/render-gateway.sh
gateway_validate_base
gateway_render

# 後端就緒時限；超過即視為啟動失敗，交由重啟策略處理。
readonly BACKEND_START_SECONDS=120
children=()

# 停止仍在執行的子程序並回收，避免留下孤兒程序。
stop_children() {
  local pid
  for pid in "${children[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "${children[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}

# 收到停止訊號：轉送給兩個程序，等待結束後以 0 結束（正常停止）。
on_stop_signal() {
  trap - TERM INT
  stop_children
  exit 0
}
trap on_stop_signal TERM INT

dotnet /app/RdWeb.Api.dll &
backend=$!
children=("$backend")

started=$SECONDS
until dotnet /app/RdWeb.Api.dll healthcheck >/dev/null 2>&1; do
  if ! kill -0 "$backend" 2>/dev/null; then
    printf '%s\n' '後端在就緒前結束。' >&2
    stop_children
    exit 1
  fi
  if ((SECONDS - started >= BACKEND_START_SECONDS)); then
    printf '%s\n' '後端未在時限內就緒。' >&2
    stop_children
    exit 1
  fi
  sleep 1
done

nginx -e stderr -c /tmp/nginx.conf -g 'daemon off;' &
children+=("$!")

# 任一程序結束（含正常結束）都代表服務已不完整：停止另一個並以非零碼結束，交給重啟策略。
set +e
wait -n "${children[@]}"
set -e
trap - TERM INT
printf '%s\n' '受監督的程序已結束，停止容器。' >&2
stop_children
exit 1
