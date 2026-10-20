#!/usr/bin/env bash
set +x
set -euo pipefail
# 沿用已驗證的runtime preflight、正式配額、六組前綴與owned stack收尾。
source deploy/dev/test-m3b3-common.sh
run_reconnect_suite playwright.reconnect.config.ts
