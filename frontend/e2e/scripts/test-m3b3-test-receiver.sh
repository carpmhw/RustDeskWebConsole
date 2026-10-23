#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
# 不繼承可能展開API輸入或改變安全測試模式的debug環境。
unset DEBUG PWDEBUG
# 本入口不接受位置參數；所有runtime只從明確程序環境讀取。
[[ $# == 0 ]] || exit 2
# 先驗全部runtime及既有target授權模式，再允許prepare或browser副作用。
node --input-type=module <<'JS'
import { readReceiverCaseEnvironment } from './frontend/e2e/real/test-receiver-control.ts'
try {
  readReceiverCaseEnvironment(process.env)
  const password = process.env.RDWEB_TEST_RECEIVER_PASSWORD
  if (typeof password !== 'string' || password.length < 1 || password.length > 4096) throw new Error()
} catch {
  console.error('receiver_unavailable')
  process.exitCode = 2
}
JS
[[ ! -e "${RDWEB_TEST_RECEIVER_ROOT}" ]] || { echo 'receiver_unavailable' >&2; exit 2; }
# 只建立本輪private root並claim一次；不啟stack、不建立target或使用者。
node frontend/e2e/scripts/prepare-test-receiver.mjs --directory "$RDWEB_TEST_RECEIVER_ROOT"
# 單案config固定；不跑prefix matrix，也不以runner代替正式Origin／CSRF／ACL。
(cd frontend && corepack pnpm exec playwright test --config e2e/config/playwright.test-receiver.config.ts --max-failures=1)
# 操作者帶回結果時才匯入；沒有結果仍只停在client完成，不輪詢或延長claim。
if [[ -n "${RDWEB_TEST_RECEIVER_RESULT-}" ]]; then
  node frontend/e2e/scripts/import-test-receiver.mjs --directory "$RDWEB_TEST_RECEIVER_ROOT" --source "$RDWEB_TEST_RECEIVER_RESULT"
else
  echo 'receiver_client_ready'
fi
