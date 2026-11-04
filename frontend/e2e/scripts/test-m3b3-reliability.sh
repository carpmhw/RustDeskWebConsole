#!/usr/bin/env bash
set +x
set -euo pipefail
source frontend/e2e/scripts/test-m3b3-common.sh
# 平台必須由操作者明確指定；不以預設Linux或混合矩陣代替單一平台50次run。
platform="${RDWEB_RELIABILITY_PLATFORM-}"
case "$platform" in linux|windows) ;; *)
  echo 'RDWEB_RELIABILITY_PLATFORM must be linux or windows' >&2
  exit 2
  ;;
esac
# 只跑已功能驗證的 /rdweb + preserve；不默默覆寫呼叫端給錯的prefix scope。
if [[ "${RDWEB_B3_BASES-}" != /rdweb || "${RDWEB_B3_MODES-}" != preserve ]]; then
  echo 'Reliability scope requires RDWEB_B3_BASES=/rdweb and RDWEB_B3_MODES=preserve' >&2
  exit 2
fi
# 平台清單、channel與prefix由共用preflight再次驗證，這裡先拒絕明顯不一致的呼叫。
if [[ "${RDWEB_INPUT_PLATFORMS-}" != "$platform" ]]; then
  echo 'RDWEB_INPUT_PLATFORMS must equal RDWEB_RELIABILITY_PLATFORM' >&2
  exit 2
fi
# 同一份原始50筆證據不因重跑而遺失；需要新run時由操作者先明確歸檔舊報告。
if [[ -e "artifacts/m3b3-$platform-reliability.json" ]]; then
  echo "Reliability report already exists: artifacts/m3b3-$platform-reliability.json" >&2
  echo 'Archive the previous original 50 results before starting a new complete run' >&2
  exit 2
fi
run_b3_suite playwright.reliability.config.ts
