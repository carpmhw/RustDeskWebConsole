#!/usr/bin/env bash
set +x
set -euo pipefail
# 不繼承可能展開API輸入或改變安全測試模式的debug環境。
unset DEBUG PWDEBUG
# 共用runtime與owner生命週期；不修改外部Windows／RustDesk／防火牆。
run_b3_suite() (
  local config="$1"
  case "$config" in playwright.input.config.ts|playwright.reconnect.config.ts|playwright.reliability.config.ts) ;; *) exit 2 ;; esac
  local bases="${RDWEB_B3_BASES-/ /rdweb /a/b/c}" modes="${RDWEB_B3_MODES-preserve strip}"
  [[ -n "${bases//[[:space:]]/}" && -n "${modes//[[:space:]]/}" ]] || { echo 'Invalid input prefix matrix' >&2; exit 2; }
  local prefix mode
  for prefix in $bases; do
    case "$prefix" in /|/rdweb|/a/b/c) ;; *) echo 'Invalid input prefix matrix' >&2; exit 2 ;; esac
  done
  for mode in $modes; do
    case "$mode" in preserve|strip) ;; *) echo 'Invalid input prefix matrix' >&2; exit 2 ;; esac
  done
  # 真Node-only reader驗requested平台／憑證，再開始任何Docker或formal API副作用。
  if ! node --input-type=module <<'JS'
import { inputPlatforms, readWindowsRuntime } from './frontend/e2e-real/windows-runtime.ts'
import { createClipboardTextLogger } from './frontend/e2e-real/clipboard-text-log.ts'
try {
  const platforms = inputPlatforms()
  if (platforms.includes('windows')) {
    readWindowsRuntime()
    createClipboardTextLogger(process.env)
  }
  const channels = (process.env.RDWEB_INPUT_CHANNELS ?? process.env.RDWEB_INPUT_CHANNEL ?? 'chromium').split(',')
  if (new Set(channels).size !== channels.length || channels.some(/* channel固定白名單，不自動下載瀏覽器。 */ (channel) => !['chromium', 'msedge', 'chrome'].includes(channel))) throw new Error()
} catch {
  console.error('Input runtime preflight failed')
  process.exitCode = 2
}
JS
  then exit 2; fi

  local -a official=(docker compose -f deploy/dev/docker-compose.rustdesk-test.yml)
  local -a console=(docker compose -f deploy/dev/docker-compose.spikes.yml -f deploy/dev/docker-compose.browser-login-test.yml)
  local owned=0 console_owned=0
  # Trap只清此函數取得owner的stack，保留volumes與reuse的外部資源。
  cleanup_b3() {
    local status=0
    if [[ "$console_owned" == 1 ]]; then
      console_owned=0
      "${console[@]}" down || status=1
    fi
    if [[ "$owned" == 1 ]]; then
      owned=0
      "${official[@]}" down || status=1
    fi
    return "$status"
  }
  trap cleanup_b3 EXIT
  trap 'exit 130' INT TERM
  if [[ -n "$("${console[@]}" ps --services --status running)" ]]; then exit 2; fi
  local running
  running=$("${official[@]}" ps --services --status running hbbs hbbr target)
  if [[ -z "$running" ]]; then
    owned=1
    "${official[@]}" build hbbs target
    "${official[@]}" up -d --wait --wait-timeout 90 hbbs hbbr target
  else
    local -a services
    mapfile -t services <<< "$running"
    if [[ ${#services[@]} != 3 ]]; then exit 2; fi
  fi
  node tools/wait-rustdesk-online.mjs
  node tools/test-rustdesk-clock.mjs
  node tools/verify-input-fixture.mjs
  # Linuxfixture只讀隔離stack；Windows憑證由操作者runtime環境提供，不fallback至Linux。
  RDWEB_RUSTDESK_PUBLIC_KEY=$("${official[@]}" exec -T hbbs cat /public-key/id_ed25519.pub)
  RDWEB_RUSTDESK_TARGET_ID=$("${official[@]}" exec -T target rustdesk --get-id)
  RDWEB_RUSTDESK_PASSWORD=$("${official[@]}" exec -T target cat /test-state/password)
  SECRET_KEY=$(node -p "require('node:crypto').randomBytes(32).toString('base64')")
  VAULT_KEY=$(node -p "require('node:crypto').randomBytes(32).toString('base64')")
  RDWEB_E2E_USERNAME=e2e-admin
  RDWEB_E2E_PASSWORD=$(node -p "require('node:crypto').randomBytes(24).toString('base64')")
  BOOTSTRAP_ADMIN_USERNAME=$RDWEB_E2E_USERNAME
  BOOTSTRAP_ADMIN_PASSWORD=$RDWEB_E2E_PASSWORD
  RDWEB_E2E_COMPOSE_OVERRIDE=deploy/dev/docker-compose.browser-login-test.yml
  export RDWEB_RUSTDESK_PUBLIC_KEY RDWEB_RUSTDESK_TARGET_ID RDWEB_RUSTDESK_PASSWORD SECRET_KEY VAULT_KEY RDWEB_E2E_USERNAME RDWEB_E2E_PASSWORD BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD RDWEB_E2E_COMPOSE_OVERRIDE
  console_owned=1
  "${console[@]}" build
  if [[ "$config" == playwright.reliability.config.ts ]]; then bases=/rdweb; modes=preserve; fi
  for APP_BASE_PATH in $bases; do
    for PREFIX_MODE in $modes; do
      export APP_BASE_PATH PREFIX_MODE
      corepack pnpm --dir frontend exec playwright test --config "$config"
    done
  done
  # 函數用獨立subshell保留EXIT trap的owner scope；成功路徑清完再移除trap。
  cleanup_b3
  trap - EXIT INT TERM
)
