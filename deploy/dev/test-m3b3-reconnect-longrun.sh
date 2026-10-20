#!/usr/bin/env bash
set +x
set -euo pipefail
# 固定scope長觀察只沿原owned proxy runner，沒有手動Compose入口。
source deploy/dev/test-m3b3-common.sh
run_reconnect_suite playwright.reconnect-longrun.config.ts
