#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f deploy/dev/docker-compose.rustdesk-test.yml)
owned=0

# 只清理由此runner啟動的stack，保留測試身份與public-key volumes。
cleanup() {
  if [[ "$owned" == 1 ]]; then "${compose[@]}" down; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

running=$("${compose[@]}" ps --services --status running hbbs hbbr target)
if [[ -z "$running" ]]; then
  owned=1
  "${compose[@]}" build hbbs target
  "${compose[@]}" up -d --wait --wait-timeout 90 hbbs hbbr target
else
  mapfile -t services <<< "$running"
  if [[ ${#services[@]} != 3 ]]; then exit 2; fi
fi

node tools/wait-rustdesk-online.mjs
# 只有public key與peer ID進入程序環境；不讀server／target私鑰或目標密碼。
RDWEB_RUSTDESK_PUBLIC_KEY=$("${compose[@]}" exec -T hbbs cat /public-key/id_ed25519.pub)
RDWEB_RUSTDESK_TARGET_ID=$("${compose[@]}" exec -T target rustdesk --get-id)
export RDWEB_RUSTDESK_PUBLIC_KEY RDWEB_RUSTDESK_TARGET_ID
dotnet test src/RdWeb.Tests/RdWeb.Tests.csproj -c Release --filter 'Category=RustDeskReal'
