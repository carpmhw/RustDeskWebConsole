#!/usr/bin/env bash
# 單容器正式部署驗收。階段一：以兩容器版（deploy/prod）在 /rdweb preserve 建立搬移來源資料、以正式腳本備份並記錄安全標頭；
# 階段二：以 deploy/single compose＋容器化外層 nginx（runtime 自簽 TLS）＋官方 Linux RustDesk fixture
# 跑 RDWEB_SINGLE_BASES × RDWEB_SINGLE_MODES（預設 6 組），/rdweb preserve 另驗證生命週期、搬移還原與安全標頭一致。
# 秘密由真正的 deploy/single/gen-secrets.sh（sudo）產生於本 runner 擁有的暫存目錄；需要免密碼 sudo（sudo -n）。
set -euo pipefail
repo=$(pwd)
official=(docker compose -f frontend/e2e/docker/docker-compose.rustdesk-test.yml)
project=rdweb-single-e2e
split_project=rdweb-single-e2e-split
override=$repo/frontend/e2e/docker/docker-compose.single-deploy-test.yml
split_override=$repo/frontend/e2e/docker/docker-compose.deploy-test.yml
deploy=(docker compose -p "$project" -f deploy/single/compose.yml -f "$override")
split=(docker compose -p "$split_project" -f deploy/prod/compose.yml -f "$split_override")
owned=0
deploy_owned=0
split_owned=0
work=''

# 清理本 runner 啟動的 stack 與暫存目錄；保留官方 fixture 以外既有 stack 與 volumes。
cleanup() {
  if [[ "$deploy_owned" == 1 ]]; then "${deploy[@]}" --env-file "$work/single.conf" down; fi
  if [[ "$split_owned" == 1 ]]; then "${split[@]}" --env-file "$work/rdweb.conf" down; fi
  if [[ "$owned" == 1 ]]; then "${official[@]}" down; fi
  # 暫存目錄含 root 與容器 app uid 擁有的檔案，只刪除本 runner 以 mktemp 建立的路徑。
  case "$work" in
    /tmp/rdweb-single-e2e.*) sudo -n rm -rf -- "$work" ;;
  esac
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# 由正式外層 nginx 範例產生本組設定；根目錄部署依範例說明刪除子路徑專用行。
outer_conf() {
  local mode=$1 base=$2 upstream=$3
  sed -e "s|__SERVER_NAME__|127.0.0.1|" -e "s|__CERT__|/etc/rdweb-tls/cert.pem|" \
    -e "s|__KEY__|/etc/rdweb-tls/key.pem|" -e "s|__UPSTREAM__|$upstream|" -e "s|__BASE__|$base|g" \
    "deploy/prod/nginx/$mode-prefix.conf" > "$work/outer.conf"
  if [[ -z "$base" ]]; then sed -i '/# 子路徑專用$/d' "$work/outer.conf"; fi
}

sudo -n true || { echo '需要免密碼 sudo 以執行 gen-secrets.sh／restore.sh。' >&2; exit 2; }
for name in "$project" "$split_project"; do
  if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$name")" ]]; then exit 2; fi
done
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

work=$(mktemp -d /tmp/rdweb-single-e2e.XXXXXX)
mkdir -m 0700 "$work/tls" "$work/backups"
# 自簽憑證只供本次外層 nginx，結束即刪除。
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 \
  -addext subjectAltName=IP:127.0.0.1 -keyout "$work/tls/key.pem" -out "$work/tls/cert.pem" 2>/dev/null
# 依單容器文件執行正式腳本；兩種部署共用此秘密目錄（vault_key 相同才能搬移）。
sudo -n sh deploy/single/gen-secrets.sh --generate-password "$work/secrets" >/dev/null
RDWEB_E2E_PASSWORD=$(sudo -n cat "$work/secrets/bootstrap_admin_password")
RDWEB_E2E_USERNAME=e2e-admin
sudo -n install -d -o 1654 -g 1654 -m 0700 "$work/data-split" "$work/data-single"

RDWEB_BACKUP_DIR=$work/backups
RDWEB_E2E_ORIGIN=https://127.0.0.1:18443
RDWEB_M4_WORK=$work
export RDWEB_RUSTDESK_PUBLIC_KEY RDWEB_RUSTDESK_TARGET_ID RDWEB_RUSTDESK_PASSWORD RDWEB_E2E_USERNAME RDWEB_E2E_PASSWORD
export RDWEB_BACKUP_DIR RDWEB_E2E_ORIGIN RDWEB_M4_WORK

# 階段一：兩容器版搬移來源（固定 /rdweb preserve），與兩容器驗收使用相同 override 與子網。
outer_conf preserve /rdweb web:8080
cat > "$work/rdweb.conf" <<EOF
APP_PUBLIC_URL=$RDWEB_E2E_ORIGIN/rdweb/
APP_BASE_PATH=/rdweb
OUTER_PROXY_ADDRESSES=172.31.81.10
RDWEB_BIND=127.0.0.1:18081
RDWEB_SUBNET=172.31.81.0/24
RDWEB_WEB_ADDRESS=172.31.81.250
RDWEB_SECRETS_DIR=$work/secrets
LOG_TIME_ZONE=UTC
DEFAULT_DISPLAY_TIME_ZONE=Asia/Taipei
BOOTSTRAP_ADMIN_USERNAME=$RDWEB_E2E_USERNAME
RDWEB_M4_DATA_DIR=$work/data-split
RDWEB_M4_OUTER_CONF=$work/outer.conf
RDWEB_M4_TLS_DIR=$work/tls
EOF
split_owned=1
"${split[@]}" --env-file "$work/rdweb.conf" build backend web
docker compose -p "$split_project" -f deploy/prod/compose.yml -f deploy/prod/compose.bootstrap.yml -f "$split_override" \
  --env-file "$work/rdweb.conf" run --rm --no-deps backend bootstrap create-admin
"${split[@]}" --env-file "$work/rdweb.conf" up -d --wait --wait-timeout 120
(cd frontend && env RDWEB_CONF="$work/rdweb.conf" RDWEB_PROJECT="$split_project" RDWEB_COMPOSE_EXTRA="$split_override" \
  APP_BASE_PATH=/rdweb PREFIX_MODE=preserve RDWEB_M4_LIFECYCLE=0 RDWEB_DEPLOY_MODE=split RDWEB_DEPLOY_STAGE=migration-source \
  corepack pnpm exec playwright test --config e2e/config/playwright.deploy.config.ts --grep 'migration source')
"${split[@]}" --env-file "$work/rdweb.conf" down
split_owned=0

# 階段二：單容器矩陣。
RDWEB_CONF=$work/single.conf
RDWEB_PROJECT=$project
RDWEB_COMPOSE_EXTRA=$override
export RDWEB_CONF RDWEB_PROJECT RDWEB_COMPOSE_EXTRA
first=1
for APP_BASE_PATH in ${RDWEB_SINGLE_BASES:-/ /rdweb /a/b/c}; do
  for PREFIX_MODE in ${RDWEB_SINGLE_MODES:-preserve strip}; do
    base=${APP_BASE_PATH%/}
    outer_conf "$PREFIX_MODE" "$base" rdweb:8000
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
RDWEB_M4_DATA_DIR=$work/data-single
RDWEB_M4_OUTER_CONF=$work/outer.conf
RDWEB_M4_TLS_DIR=$work/tls
EOF
    deploy_owned=1
    if [[ "$first" == 1 ]]; then
      "${deploy[@]}" --env-file "$RDWEB_CONF" build rdweb
      # 依文件以一次性 run 疊加 compose.bootstrap.yml 建立初始管理員，再刪除密碼檔；之後重啟仍須健康。
      docker compose -p "$project" -f deploy/single/compose.yml -f deploy/single/compose.bootstrap.yml -f "$override" \
        --env-file "$RDWEB_CONF" run --rm --no-deps rdweb bootstrap create-admin
      sudo -n rm "$work/secrets/bootstrap_admin_password"
      first=0
    fi
    "${deploy[@]}" --env-file "$RDWEB_CONF" up -d --wait --wait-timeout 120 --force-recreate
    RDWEB_M4_LIFECYCLE=0
    if [[ "$APP_BASE_PATH" == /rdweb && "$PREFIX_MODE" == preserve ]]; then RDWEB_M4_LIFECYCLE=1; fi
    export APP_BASE_PATH PREFIX_MODE RDWEB_M4_LIFECYCLE
    (cd frontend && RDWEB_DEPLOY_MODE=single corepack pnpm exec playwright test --config e2e/config/playwright.deploy.config.ts)
  done
done
