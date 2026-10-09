#!/bin/sh
set -eu

# 測試金鑰只存在目前程序環境，不寫檔、不輸出、不放進映像。
SECRET_KEY=${SECRET_KEY:-$(node -p "require('node:crypto').randomBytes(32).toString('base64')")}
VAULT_KEY=${VAULT_KEY:-$(node -p "require('node:crypto').randomBytes(32).toString('base64')")}
export SECRET_KEY VAULT_KEY

# 真實登入測試的帳號密碼只在程序環境，測試不輸出或保存憑證。
RDWEB_E2E_USERNAME=e2e-admin
RDWEB_E2E_PASSWORD=$(node -p "require('node:crypto').randomBytes(24).toString('base64')")
BOOTSTRAP_ADMIN_USERNAME=$RDWEB_E2E_USERNAME
BOOTSTRAP_ADMIN_PASSWORD=$RDWEB_E2E_PASSWORD
export RDWEB_E2E_USERNAME RDWEB_E2E_PASSWORD BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD

# 在同一映像上逐組切換執行期前綴，失敗或結束皆清理本測試 stack。
cleanup() {
  docker compose -f deploy/dev/docker-compose.spikes.yml down
}
trap cleanup EXIT INT TERM
docker compose -f deploy/dev/docker-compose.spikes.yml build
for APP_BASE_PATH in / /rdweb /a/b/c; do
  for PREFIX_MODE in preserve strip; do
    export APP_BASE_PATH PREFIX_MODE
    docker compose -f deploy/dev/docker-compose.spikes.yml up -d --wait --wait-timeout 60
    corepack pnpm --dir frontend e2e
  done
done
