#!/usr/bin/env bash
set +x
set -euo pipefail
# 不繼承可能展開API輸入或改變安全測試模式的debug環境。
unset DEBUG PWDEBUG
# 共用runtime與owner生命週期；不修改外部Windows／RustDesk／防火牆。
run_b3_suite_owned() {
  local config="$1"
  case "$config" in playwright.input.config.ts|playwright.reconnect.config.ts|playwright.reconnect-security.config.ts|playwright.reconnect-longrun.config.ts|playwright.reconnect-ingress.config.ts|playwright.reliability.config.ts|playwright.text-probe.config.ts|playwright.text-return-probe.config.ts) ;; *) exit 2 ;; esac
  local reconnect=0
  case "$config" in playwright.reconnect.config.ts|playwright.reconnect-security.config.ts|playwright.reconnect-longrun.config.ts|playwright.reconnect-ingress.config.ts) reconnect=1 ;; esac
  local bases="${RDWEB_B3_BASES-/ /rdweb /a/b/c}" modes="${RDWEB_B3_MODES-preserve strip}"
  [[ -n "${bases//[[:space:]]/}" && -n "${modes//[[:space:]]/}" ]] || { echo 'Invalid input prefix matrix' >&2; exit 2; }
  local prefix mode
  for prefix in $bases; do
    case "$prefix" in /|/rdweb|/a/b/c) ;; *) echo 'Invalid input prefix matrix' >&2; exit 2 ;; esac
  done
  for mode in $modes; do
    case "$mode" in preserve|strip) ;; *) echo 'Invalid input prefix matrix' >&2; exit 2 ;; esac
  done
  if [[ "$config" == playwright.text-return-probe.config.ts && ( "$bases" != / || "$modes" != preserve ) ]]; then
    echo 'Text return probe scope unavailable' >&2
    exit 2
  fi
  # 真Node-only reader驗requested平台／憑證，再開始任何Docker或formal API副作用。
  if ! RDWEB_B3_SUITE_CONFIG="$config" node --input-type=module <<'JS'
import { inputPlatforms, readWindowsRuntime } from './frontend/e2e-real/windows-runtime.ts'
import { createClipboardTextLogger } from './frontend/e2e-real/clipboard-text-log.ts'
import { readTextProbeRuntime } from './frontend/e2e-real/text-probe-runtime.ts'
import { assertTextProbeAvailable } from './frontend/e2e-real/text-probe-control.ts'
import { readHostObservation } from './frontend/e2e-real/host-observation-control.ts'
try {
  const textProbe = process.env.RDWEB_B3_SUITE_CONFIG === 'playwright.text-probe.config.ts'
  const textReturnProbe = process.env.RDWEB_B3_SUITE_CONFIG === 'playwright.text-return-probe.config.ts'
  const reconnect = ['playwright.reconnect.config.ts', 'playwright.reconnect-security.config.ts', 'playwright.reconnect-longrun.config.ts', 'playwright.reconnect-ingress.config.ts'].includes(process.env.RDWEB_B3_SUITE_CONFIG)
  if (reconnect && Object.hasOwn(process.env, 'RDWEB_RECONNECT_INGRESS_OWNER')) throw new Error()
  if (process.env.RDWEB_B3_SUITE_CONFIG === 'playwright.reconnect-ingress.config.ts') {
    const { assertIngressEntry } = await import('./tools/reconnect-ingress-scope.mjs')
    assertIngressEntry(process.env)
  }
  if (process.env.RDWEB_B3_SUITE_CONFIG === 'playwright.reconnect-longrun.config.ts') {
    const { assertLongrunScope } = await import('./tools/reconnect-longrun-scope.mjs')
    assertLongrunScope(process.env)
  }
  if (reconnect) {
    const { assertReconnectEnvironment } = await import('./tools/reconnect-preflight.mjs')
    assertReconnectEnvironment(process.env)
  }
  if (process.env.RDWEB_WINDOWS_HOST_OBSERVE !== undefined && process.env.RDWEB_WINDOWS_HOST_OBSERVE !== '0') {
    if (!textReturnProbe) throw new Error()
    readHostObservation()
  }
  if (textProbe) {
    readTextProbeRuntime()
    assertTextProbeAvailable()
  }
  const platforms = inputPlatforms()
  if (process.env.RDWEB_B3_SUITE_CONFIG === 'playwright.reconnect-security.config.ts' && (platforms.length !== 1 || platforms[0] !== 'linux')) throw new Error()
  const channels = (process.env.RDWEB_INPUT_CHANNELS ?? process.env.RDWEB_INPUT_CHANNEL ?? 'chromium').split(',')
  if (textReturnProbe && (
    platforms.length !== 1 || platforms[0] !== 'windows' ||
    channels.length !== 1 || channels[0] !== 'chromium' ||
    process.env.RDWEB_B3_BASES !== '/' || process.env.RDWEB_B3_MODES !== 'preserve' ||
    process.env.RDWEB_WINDOWS_CLIPBOARD_TEXT_LOG !== '1'
  )) throw new Error()
  if (platforms.includes('windows')) {
    readWindowsRuntime()
    if (!textProbe) {
      const logger = createClipboardTextLogger(process.env)
      if (textReturnProbe && !logger) throw new Error()
    }
  }
  if (new Set(channels).size !== channels.length || channels.some(/* channel固定白名單，不自動下載瀏覽器。 */ (channel) => !['chromium', 'msedge', 'chrome'].includes(channel))) throw new Error()
} catch {
  console.error('Input runtime preflight failed')
  process.exitCode = 2
}
JS
  then exit 2; fi

  if [[ "$reconnect" == 1 ]]; then
    node tools/reconnect-preflight.mjs || exit 2
    RDWEB_DEV_PORT=18081
    RDWEB_E2E_COMPOSE_OVERRIDE=deploy/dev/docker-compose.reconnect-test.yml
    export RDWEB_DEV_PORT RDWEB_E2E_COMPOSE_OVERRIDE
  fi

  local -a official=(docker compose -f deploy/dev/docker-compose.rustdesk-test.yml)
  local -a console=(docker compose -f deploy/dev/docker-compose.spikes.yml -f deploy/dev/docker-compose.browser-login-test.yml)
  if [[ "$reconnect" == 1 ]]; then console+=(-f deploy/dev/docker-compose.reconnect-test.yml); fi
  # 新suite的兩個project各自固定，不能用一個全域project混淆官方stack與console。
  if [[ "$config" == playwright.reconnect-ingress.config.ts ]]; then
    official+=(--project-name rdweb-rustdesk-test)
    console+=(--project-name rdweb-m0)
  fi
  local owned=0 console_owned=0 suite_pid=''
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
  # 只對自有Node wrapper傳終止訊號，等fixture收尾後才進EXIT的stack清理。
  stop_reconnect_b3() {
    trap '' INT TERM
    local result=130 status=0
    if [[ -n "$suite_pid" ]]; then
      kill -TERM "$suite_pid" 2>/dev/null || true
      wait "$suite_pid" || status=$?
      suite_pid=''
      if [[ "$status" == 1 ]]; then result=1; fi
    fi
    exit "$result"
  }
  if [[ "$reconnect" == 1 ]]; then trap stop_reconnect_b3 INT TERM; else trap 'exit 130' INT TERM; fi
  # Ingress新suite連停止中的console也不接管；不能先reset外部容器再貼owner label。
  if [[ "$config" == playwright.reconnect-ingress.config.ts ]]; then
    local ingress_existing
    ingress_existing=$("${console[@]}" ps --all --quiet) || exit 2
    [[ -z "$ingress_existing" ]] || exit 2
  fi
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
  if [[ "$config" == playwright.reconnect-ingress.config.ts ]]; then
    COMPOSE_PROJECT_NAME=rdweb-rustdesk-test node tools/wait-rustdesk-online.mjs
    COMPOSE_PROJECT_NAME=rdweb-rustdesk-test node tools/test-rustdesk-clock.mjs
    COMPOSE_PROJECT_NAME=rdweb-rustdesk-test node tools/verify-input-fixture.mjs
  else
    node tools/wait-rustdesk-online.mjs
    node tools/test-rustdesk-clock.mjs
    node tools/verify-input-fixture.mjs
  fi
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
  if [[ "$reconnect" != 1 ]]; then RDWEB_E2E_COMPOSE_OVERRIDE=deploy/dev/docker-compose.browser-login-test.yml; fi
  export RDWEB_RUSTDESK_PUBLIC_KEY RDWEB_RUSTDESK_TARGET_ID RDWEB_RUSTDESK_PASSWORD SECRET_KEY VAULT_KEY RDWEB_E2E_USERNAME RDWEB_E2E_PASSWORD BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD RDWEB_E2E_COMPOSE_OVERRIDE
  console_owned=1
  if [[ "$config" == playwright.reconnect-ingress.config.ts ]]; then
    RDWEB_RECONNECT_INGRESS_OWNER=$(node -p "require('node:crypto').randomBytes(32).toString('hex')")
    [[ "$RDWEB_RECONNECT_INGRESS_OWNER" =~ ^[a-f0-9]{64}$ ]] || exit 2
    RDWEB_B3_SUITE_CONFIG=$config
    export RDWEB_RECONNECT_INGRESS_OWNER RDWEB_B3_SUITE_CONFIG
  fi
  "${console[@]}" build
  if [[ "$config" == playwright.reliability.config.ts ]]; then bases=/rdweb; modes=preserve; fi
  for APP_BASE_PATH in $bases; do
    for PREFIX_MODE in $modes; do
      export APP_BASE_PATH PREFIX_MODE
      if [[ "$reconnect" == 1 ]]; then
        # Wrapper持有真正CLI的ChildProcess，避免corepack／pnpm多層signal傳遞歧義。
        node tools/run-reconnect-playwright.mjs "$config" &
        suite_pid=$!
        if wait "$suite_pid"; then
          suite_pid=''
        else
          local status=$?
          suite_pid=''
          exit "$status"
        fi
      else
        corepack pnpm --dir frontend exec playwright test --config "$config"
      fi
    done
  done
  # 函數用獨立subshell保留EXIT trap的owner scope；成功路徑清完再移除trap。
  cleanup_b3
  trap - EXIT INT TERM
}

# 其他suite仍沿原單一subshell保留EXIT owner與環境隔離。
run_b3_suite() (
  run_b3_suite_owned "$@"
)

# 原suite用subshell保留EXIT owner；入口Bash亦須轉送訊號，不能只終止外殼。
run_reconnect_suite() {
  [[ $# == 1 ]] || return 2
  case "$1" in playwright.reconnect.config.ts|playwright.reconnect-security.config.ts|playwright.reconnect-longrun.config.ts|playwright.reconnect-ingress.config.ts) ;; *) return 2 ;; esac
  local owner_pid='' status=0
  run_b3_suite_owned "$1" &
  owner_pid=$!
  # 每一層只等待自己啟動的child，最內層完成proxy／stack收尾才退出。
  stop_reconnect_owner() {
    trap '' INT TERM
    local result=130 child_status=0
    kill -TERM "$owner_pid" 2>/dev/null || true
    wait "$owner_pid" || child_status=$?
    if [[ "$child_status" == 1 ]]; then result=1; fi
    exit "$result"
  }
  trap stop_reconnect_owner INT TERM
  wait "$owner_pid" || status=$?
  trap - INT TERM
  return "$status"
}
