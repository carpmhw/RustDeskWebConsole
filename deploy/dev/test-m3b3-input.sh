#!/usr/bin/env bash
set +x
set -euo pipefail
source deploy/dev/test-m3b3-common.sh
run_b3_suite playwright.input.config.ts
