#!/usr/bin/env bash
set +x
set -euo pipefail
source frontend/e2e/scripts/test-m3b3-common.sh
# 未指定時才補此單案需要的公開prefix設定，不改寫呼叫者明確scope。
export RDWEB_B3_BASES="${RDWEB_B3_BASES-/}"
export RDWEB_B3_MODES="${RDWEB_B3_MODES-preserve}"
run_b3_suite playwright.text-return-probe.config.ts
