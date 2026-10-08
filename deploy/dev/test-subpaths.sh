#!/bin/sh
set -eu

# 在同一映像上逐組切換執行期前綴，失敗或結束皆清理本測試 stack。
cleanup() {
  docker compose -f deploy/dev/docker-compose.spikes.yml down
}
trap cleanup EXIT INT TERM
docker compose -f deploy/dev/docker-compose.spikes.yml build
for APP_BASE_PATH in / /rdweb /a/b/c; do
  for PREFIX_MODE in preserve strip; do
    export APP_BASE_PATH PREFIX_MODE
    docker compose -f deploy/dev/docker-compose.spikes.yml up -d --wait --wait-timeout 60
    corepack pnpm --dir frontend e2e
  done
done
