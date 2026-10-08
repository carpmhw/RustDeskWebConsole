#!/bin/sh
set -eu
umask 077

# 官方 server 可能輸出金鑰，測試環境不將這些輸出寫入任何 log。
if [ "$1" = hbbs ]; then
  "$@" > /dev/null 2>&1 &
  SERVER_PID=$!
  # 結束或中斷時回收背景 server。
  cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
  trap cleanup EXIT INT TERM
  for attempt in $(seq 1 30); do
    if [ -s /data/id_ed25519.pub ]; then
      cp /data/id_ed25519.pub /public-key/id_ed25519.pub
      chmod 644 /public-key/id_ed25519.pub
      break
    fi
    kill -0 "$SERVER_PID"
    sleep 1
  done
  wait "$SERVER_PID"
else
  exec "$@" > /dev/null 2>&1
fi
