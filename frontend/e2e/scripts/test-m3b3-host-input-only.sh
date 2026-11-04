#!/usr/bin/env bash
set +x
set -euo pipefail
source frontend/e2e/scripts/test-m3b3-common.sh
# 只補單案公開prefix；不prepare、改寫旗標或啟動Windows helper。
export RDWEB_B3_BASES="${RDWEB_B3_BASES-/}"
export RDWEB_B3_MODES="${RDWEB_B3_MODES-preserve}"
run_b3_suite playwright.host-input-only.config.ts
