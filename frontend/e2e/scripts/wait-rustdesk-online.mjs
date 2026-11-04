import { execFileSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { setTimeout } from 'node:timers/promises'

// 依固定上游 proto 與 BytesCodec 行為建立只查詢一個測試 peer 的短封包。
// OnlineRequest 位於 RendezvousMessage 欄位 23，peers 為欄位 2；不處理認證或橋接。
function onlineRequest(id) {
  if (!/^[0-9]{6,16}$/.test(id)) throw new Error('測試 ID 不合法')
  const peer = Buffer.from(id)
  const inner = Buffer.concat([Buffer.from([0x12, peer.length]), peer])
  const message = Buffer.concat([Buffer.from([0xba, 0x01, inner.length]), inner])
  return Buffer.concat([Buffer.from([message.length << 2]), message])
}

// 查詢 hbbs NAT listener 的 OnlineResponse，處理 TCP 分段並限制讀取大小。
function isOnline(id) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: 21115 })
    let received = Buffer.alloc(0)
    // 不把網路失敗視為 ready，關閉所有探測 socket。
    function finish(value) {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(2000)
    // 建立 TCP 後才送查詢，避免本機行程啟動被誤判成 server 已登記。
    socket.on('connect', () => socket.write(onlineRequest(id)))
    // 第一個 peer 的狀態為 byte 的最高位，依固定 server 原始碼驗證。
    socket.on('data', (data) => {
      received = Buffer.concat([received, data])
      if (received.length > 1024) return finish(false)
      if (received.length >= 7)
        finish(
          received.subarray(0, 7).equals(Buffer.from([0x18, 0xc2, 0x01, 0x03, 0x0a, 0x01, 0x80])),
        )
    })
    // 逾時、關閉或連線錯誤皆不宣告就緒。
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
    socket.on('end', () => finish(false))
  })
}

// 在官方受控端實際完成 server 註冊後才啟動官方控制端，不依賴任意固定 sleep。
let ready = false
for (let attempt = 0; attempt < 60; attempt++) {
  const id = execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'frontend/e2e/docker/docker-compose.rustdesk-test.yml',
      'exec',
      '-T',
      'target',
      'rustdesk',
      '--get-id',
    ],
    { encoding: 'utf8', timeout: 10000 },
  ).trim()
  if (await isOnline(id)) {
    ready = true
    console.log('hbbs 已確認測試受控端 online：PASS')
    break
  }
  await setTimeout(1000)
}
if (!ready) throw new Error('hbbs 尚未登記測試受控端，不能啟動桌面驗收')
