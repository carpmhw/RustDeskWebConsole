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
  # Config整檔存在但credential缺失時仍需補齊；不覆寫非空storage或其它身分欄位。
  . /initialize-target-password.sh
  initialize_target_password "$XDG_CONFIG_HOME/rustdesk/RustDesk.toml" /test-state/password
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
if [ "${CLIENT_ROLE:-target}" = target ]; then
  # 公開clock不需視窗管理器，避免桌布警告遮擋它並暫停X11更新。
  xclock -digital -update 1 -geometry 700x120+200+250 -bg '#1a668f' -fg white > /dev/null 2>&1 &
  # 公開editor專用UTF8 locale；具名resource覆寫Xedit預設快捷鍵，不改RustDesk設定。
  LANG=C.UTF-8 xedit -geometry 700x220+100+410 -xrm '*international: True' \
    -xrm '*editWindow.translations: #override\n<Btn1Down>: xedit-focus() select-start()\nCtrl<Key>a: select-all()\nCtrl<Key>c: select-save(CLIPBOARD)\nCtrl<Key>v: insert-selection(CLIPBOARD)\nCtrl<Key>z: undo()' \
    > /dev/null 2>&1 &
  # xev只觀測其公開fixture視窗，事件不輸出至容器日誌或驗收report。
  LANG=C.UTF-8 xev -geometry 240x220+1000+410 -event mouse -event keyboard \
    > /test-state/public-input-events 2>/dev/null &
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
  # 官方控制端仍需視窗管理器管理遠端桌面視窗。
  fluxbox > /dev/null 2>&1 &
  # 啟動官方桌面客戶端；必須由實際畫面確認配對，不把 port 檢查當成驗收。
  PASSWORD=$(tr -d '\r\n' < /test-state/password)
  TARGET_ID=$(tr -d '\r\n' < /test-state/target-id)
  exec dbus-run-session -- rustdesk --connect "$TARGET_ID" --password "$PASSWORD" --relay > /dev/null 2>&1
fi
