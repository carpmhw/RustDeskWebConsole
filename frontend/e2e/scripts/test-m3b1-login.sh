#!/usr/bin/env bash
set -euo pipefail
official=(docker compose -f frontend/e2e/docker/docker-compose.rustdesk-test.yml)
console=(docker compose -f deploy/dev/docker-compose.spikes.yml -f frontend/e2e/docker/docker-compose.browser-login-test.yml)
owned=0
console_owned=0
# 清理由此runner啟動的stack，保留volumes與宿主RustDesk。
cleanup() {
  if [[ "$console_owned" == 1 ]]; then "${console[@]}" down; fi
  if [[ "$owned" == 1 ]]; then "${official[@]}" down; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
if [[ -n "$("${console[@]}" ps --services --status running)" ]]; then exit 2; fi
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
# 測試fixture只存程序RAM，密碼只經admin API送Vault，不傳browser或輸出。
RDWEB_RUSTDESK_PUBLIC_KEY=$("${official[@]}" exec -T hbbs cat /public-key/id_ed25519.pub)
RDWEB_RUSTDESK_TARGET_ID=$("${official[@]}" exec -T target rustdesk --get-id)
RDWEB_RUSTDESK_PASSWORD=$("${official[@]}" exec -T target cat /test-state/password)
SECRET_KEY=$(node -p "require('node:crypto').randomBytes(32).toString('base64')")
VAULT_KEY=$(node -p "require('node:crypto').randomBytes(32).toString('base64')")
RDWEB_E2E_USERNAME=e2e-admin
RDWEB_E2E_PASSWORD=$(node -p "require('node:crypto').randomBytes(24).toString('base64')")
BOOTSTRAP_ADMIN_USERNAME=$RDWEB_E2E_USERNAME
BOOTSTRAP_ADMIN_PASSWORD=$RDWEB_E2E_PASSWORD
RDWEB_E2E_COMPOSE_OVERRIDE=frontend/e2e/docker/docker-compose.browser-login-test.yml
export RDWEB_RUSTDESK_PUBLIC_KEY RDWEB_RUSTDESK_TARGET_ID RDWEB_RUSTDESK_PASSWORD SECRET_KEY VAULT_KEY RDWEB_E2E_USERNAME RDWEB_E2E_PASSWORD BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD RDWEB_E2E_COMPOSE_OVERRIDE
console_owned=1
"${console[@]}" build
# 單組診斷可由runner參數選定，預設仍執行完整六組。
for APP_BASE_PATH in ${RDWEB_B1_BASES:-/ /rdweb /a/b/c}; do
  for PREFIX_MODE in ${RDWEB_B1_MODES:-preserve strip}; do
    export APP_BASE_PATH PREFIX_MODE
    corepack pnpm --dir frontend exec playwright test --config e2e/config/playwright.real-login.config.ts
  done
done
