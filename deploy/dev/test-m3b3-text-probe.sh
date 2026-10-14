#!/usr/bin/env bash
set +x
set -euo pipefail
source deploy/dev/test-m3b3-common.sh
# 僅補公開scope預設，操作者明確的非法值仍交preflight拒絕。
export RDWEB_B3_BASES="${RDWEB_B3_BASES-/}"
export RDWEB_B3_MODES="${RDWEB_B3_MODES-preserve}"
run_b3_suite playwright.text-probe.config.ts
