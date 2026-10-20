#!/usr/bin/env bash
set -euo pipefail
# 入口不接受任意suite／命令參數，runtime scope由common先驗。
source deploy/dev/test-m3b3-common.sh
[[ $# == 0 ]] || exit 2
run_reconnect_suite playwright.reconnect-ingress.config.ts
