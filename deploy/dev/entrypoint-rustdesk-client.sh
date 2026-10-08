#!/bin/sh
set -eu
umask 077

# 設定只寫入隔離的容器 HOME，受控端僅取得公開金鑰，不掛載 server 私鑰。
for attempt in $(seq 1 30); do
  [ ! -s /public-key/id_ed25519.pub ] || break
  sleep 1
done
[ -s /public-key/id_ed25519.pub ]
PUBLIC_KEY=$(tr -d '\r\n' < /public-key/id_ed25519.pub)
# 保留受控端身分與金鑰，不因容器重建而讓 server 偵測到 UUID／key 衝突。
if [ "${CLIENT_ROLE:-target}" = target ]; then
  XDG_CONFIG_HOME=/target-config
  export XDG_CONFIG_HOME
  rm -f /test-state/target-id
fi
mkdir -p "$XDG_CONFIG_HOME/rustdesk"
printf "rendezvous_server = 'hbbs:21116'\n[options]\ncustom-rendezvous-server = 'hbbs:21116'\nrelay-server = 'hbbr:21117'\nkey = '%s'\nverification-method = 'use-permanent-password'\napprove-mode = 'password'\nallow-always-software-render = 'Y'\n" "$PUBLIC_KEY" > "$XDG_CONFIG_HOME/rustdesk/RustDesk2.toml"

# 固定測試密碼在首次啟動時隨機產生並保存在私有 volume，永不輸出。
if [ "${CLIENT_ROLE:-target}" = target ]; then
  if [ ! -s /test-state/password ]; then
    od -An -N24 -tx1 /dev/urandom | tr -d ' \n' > /test-state/password
  fi
  PASSWORD=$(tr -d '\r\n' < /test-state/password)
  if [ ! -s "$XDG_CONFIG_HOME/rustdesk/RustDesk.toml" ]; then
    printf "password = '%s'\n" "$PASSWORD" > "$XDG_CONFIG_HOME/rustdesk/RustDesk.toml"
  fi
fi

# 僅清理此容器固定測試顯示的殘留檔，確保 docker restart 可重新建立 Xvfb。
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb "$DISPLAY" -screen 0 1280x720x24 -nolisten tcp > /dev/null 2>&1 &
XVFB_PID=$!
# 結束或中斷時回收虛擬顯示，不留下宿主機背景行程。
cleanup() { kill "$XVFB_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
for attempt in $(seq 1 30); do
  xdpyinfo > /dev/null 2>&1 && break
  sleep 1
done
mkdir -p "$HOME/.fluxbox"
printf 'session.screen0.rootCommand: xsetroot -solid black\n' > "$HOME/.fluxbox/init"
fluxbox > /dev/null 2>&1 &
if [ "${CLIENT_ROLE:-target}" = target ]; then
  xclock -digital -update 1 -geometry 700x120+200+250 -bg '#1a668f' -fg white > /dev/null 2>&1 &
  dbus-run-session -- rustdesk --server > /dev/null 2>&1 &
  SERVER_PID=$!
  LAST_ID=''
  STABLE=0
  # 等待 IPC 回傳穩定的實際 ID，不能假設 server 接受自行指定的 ID。
  for attempt in $(seq 1 30); do
    CURRENT_ID=$(rustdesk --get-id 2>/dev/null)
    case "$CURRENT_ID" in ''|*[!0-9]*) STABLE=0 ;; *)
      if [ "$CURRENT_ID" = "$LAST_ID" ]; then STABLE=$((STABLE + 1)); else STABLE=0; fi
      LAST_ID=$CURRENT_ID
      if [ "$STABLE" -ge 2 ]; then printf '%s' "$CURRENT_ID" > /test-state/target-id; break; fi
    ;; esac
    kill -0 "$SERVER_PID"
    sleep 2
  done
  [ -s /test-state/target-id ]
  wait "$SERVER_PID"
else
  # 啟動官方桌面客戶端；必須由實際畫面確認配對，不把 port 檢查當成驗收。
  PASSWORD=$(tr -d '\r\n' < /test-state/password)
  TARGET_ID=$(tr -d '\r\n' < /test-state/target-id)
  exec dbus-run-session -- rustdesk --connect "$TARGET_ID" --password "$PASSWORD" --relay > /dev/null 2>&1
fi
