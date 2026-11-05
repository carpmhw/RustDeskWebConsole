#!/usr/bin/env bash
# M4 正式部署驗收：以 deploy/prod compose＋容器化外層 nginx（runtime 自簽 TLS）＋官方 Linux RustDesk fixture
# 跑 RDWEB_M4_BASES × RDWEB_M4_MODES（預設 6 組）。秘密由真正的 gen-secrets.sh（sudo）產生於本 runner 擁有的暫存目錄。
# 需要免密碼 sudo（sudo -n），只用於本 runner 擁有的暫存目錄與 deploy/prod 腳本。
set -euo pipefail
repo=$(pwd)
official=(docker compose -f frontend/e2e/docker/docker-compose.rustdesk-test.yml)
project=rdweb-m4-e2e
override=$repo/frontend/e2e/docker/docker-compose.deploy-test.yml
deploy=(docker compose -p "$project" -f deploy/prod/compose.yml -f "$override")
owned=0
deploy_owned=0
work=''

# 清理本 runner 啟動的 stack 與暫存目錄；保留官方 fixture 以外既有 stack 與 volumes。
cleanup() {
  if [[ "$deploy_owned" == 1 ]]; then "${deploy[@]}" --env-file "$work/rdweb.conf" down; fi
  if [[ "$owned" == 1 ]]; then "${official[@]}" down; fi
  # 暫存目錄含 root 與容器 app uid 擁有的檔案，只刪除本 runner 以 mktemp 建立的路徑。
  case "$work" in
    /tmp/rdweb-m4-e2e.*) sudo -n rm -rf -- "$work" ;;
  esac
}
trap cleanup EXIT
trap 'exit 130' INT TERM

sudo -n true || { echo '需要免密碼 sudo 以執行 gen-secrets.sh／restore.sh。' >&2; exit 2; }
if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ]]; then exit 2; fi
running=$("${official[@]}" ps --services --status running hbbs hbbr target)
if [[ -z "$running" ]]; then
  owned=1
  "${official[@]}" build hbbs target
  "${official[@]}" up -d --wait --wait-timeout 90 hbbs hbbr target
else
  mapfile -t services <<< "$running"
  if [[ ${#services[@]} != 3 ]]; then exit 2; fi
fi
node frontend/e2e/scripts/wait-rustdesk-online.mjs
RDWEB_RUSTDESK_PUBLIC_KEY=$("${official[@]}" exec -T hbbs cat /public-key/id_ed25519.pub)
RDWEB_RUSTDESK_TARGET_ID=$("${official[@]}" exec -T target rustdesk --get-id)
RDWEB_RUSTDESK_PASSWORD=$("${official[@]}" exec -T target cat /test-state/password)

work=$(mktemp -d /tmp/rdweb-m4-e2e.XXXXXX)
mkdir -m 0700 "$work/tls" "$work/backups"
# 自簽憑證只供本次外層 nginx，結束即刪除。
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 \
  -addext subjectAltName=IP:127.0.0.1 -keyout "$work/tls/key.pem" -out "$work/tls/cert.pem" 2>/dev/null
# 真正執行正式腳本；產生的一次性密碼輸出丟棄，改由 app uid 可讀的檔案讀回程序環境。
sudo -n sh deploy/prod/gen-secrets.sh --generate-password "$work/secrets" >/dev/null
RDWEB_E2E_PASSWORD=$(sudo -n cat "$work/secrets/bootstrap_admin_password")
RDWEB_E2E_USERNAME=e2e-admin
sudo -n install -d -o 1654 -g 1654 -m 0700 "$work/data"

RDWEB_CONF=$work/rdweb.conf
RDWEB_PROJECT=$project
RDWEB_COMPOSE_EXTRA=$override
RDWEB_BACKUP_DIR=$work/backups
RDWEB_E2E_ORIGIN=https://127.0.0.1:18443
RDWEB_M4_WORK=$work
export RDWEB_RUSTDESK_PUBLIC_KEY RDWEB_RUSTDESK_TARGET_ID RDWEB_RUSTDESK_PASSWORD RDWEB_E2E_USERNAME RDWEB_E2E_PASSWORD
export RDWEB_CONF RDWEB_PROJECT RDWEB_COMPOSE_EXTRA RDWEB_BACKUP_DIR RDWEB_E2E_ORIGIN RDWEB_M4_WORK

first=1
for APP_BASE_PATH in ${RDWEB_M4_BASES:-/ /rdweb /a/b/c}; do
  for PREFIX_MODE in ${RDWEB_M4_MODES:-preserve strip}; do
    base=${APP_BASE_PATH%/}
    # 由正式範例產生本組外層 nginx 設定；根目錄部署依範例說明刪除子路徑專用行。
    sed -e "s|__SERVER_NAME__|127.0.0.1|" -e "s|__CERT__|/etc/rdweb-tls/cert.pem|" \
      -e "s|__KEY__|/etc/rdweb-tls/key.pem|" -e "s|__UPSTREAM__|web:8080|" -e "s|__BASE__|$base|g" \
      "deploy/prod/nginx/$PREFIX_MODE-prefix.conf" > "$work/outer.conf"
    if [[ -z "$base" ]]; then sed -i '/# 子路徑專用$/d' "$work/outer.conf"; fi
    cat > "$RDWEB_CONF" <<EOF
APP_PUBLIC_URL=$RDWEB_E2E_ORIGIN$base/
APP_BASE_PATH=$APP_BASE_PATH
OUTER_PROXY_ADDRESSES=172.31.81.10
RDWEB_BIND=127.0.0.1:18081
RDWEB_SUBNET=172.31.81.0/24
RDWEB_SECRETS_DIR=$work/secrets
LOG_TIME_ZONE=UTC
DEFAULT_DISPLAY_TIME_ZONE=Asia/Taipei
BOOTSTRAP_ADMIN_USERNAME=$RDWEB_E2E_USERNAME
RDWEB_M4_DATA_DIR=$work/data
RDWEB_M4_OUTER_CONF=$work/outer.conf
RDWEB_M4_TLS_DIR=$work/tls
EOF
    deploy_owned=1
    if [[ "$first" == 1 ]]; then
      "${deploy[@]}" --env-file "$RDWEB_CONF" build backend web
      # 首次啟動依文件疊加 compose.bootstrap.yml 建立初始管理員。
      docker compose -p "$project" -f deploy/prod/compose.yml -f deploy/prod/compose.bootstrap.yml -f "$override" \
        --env-file "$RDWEB_CONF" up -d --wait --wait-timeout 120
      first=0
    fi
    "${deploy[@]}" --env-file "$RDWEB_CONF" up -d --wait --wait-timeout 120 --force-recreate
    RDWEB_M4_LIFECYCLE=0
    if [[ "$APP_BASE_PATH" == /rdweb && "$PREFIX_MODE" == preserve ]]; then RDWEB_M4_LIFECYCLE=1; fi
    export APP_BASE_PATH PREFIX_MODE RDWEB_M4_LIFECYCLE
    (cd frontend && corepack pnpm exec playwright test --config e2e/config/playwright.deploy.config.ts)
  done
done
