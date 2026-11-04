#!/usr/bin/env bash
set +x
set -euo pipefail
source frontend/e2e/scripts/test-m3b3-common.sh
run_b3_suite playwright.input.config.ts
