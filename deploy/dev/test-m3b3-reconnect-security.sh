#!/usr/bin/env bash
set +x
set -euo pipefail
# 獨立安全case使用相同proxy拓撲及owned stack，不能直接沿舊入口啟服務。
source deploy/dev/test-m3b3-common.sh
run_reconnect_suite playwright.reconnect-security.config.ts
