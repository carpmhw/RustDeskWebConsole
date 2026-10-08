import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { setTimeout } from 'node:timers/promises'

const compose = ['compose', '-f', 'deploy/dev/docker-compose.rustdesk-test.yml', 'exec', '-T']

// 產生具有正確 CRC 的 PNG 區塊，只使用 Node 內建模組。
function chunk(name, data) {
  const type = Buffer.from(name)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])))
  return Buffer.concat([length, type, data, checksum])
}

// 將本測試 Xvfb 的 TrueColor XWD 轉為 PNG，不讀取或輸出任何認證設定。
function pngFromXwd(source) {
  const fields = Array.from({ length: 25 }, (_, index) => source.readUInt32BE(index * 4))
  const [width, height] = [fields[4], fields[5]]
  const bytesPerPixel = fields[11] / 8
  if (
    fields[1] !== 7 ||
    fields[2] !== 2 ||
    ![3, 4].includes(bytesPerPixel) ||
    fields[7] !== 0 ||
    fields[14] !== 0xff0000 ||
    fields[15] !== 0xff00 ||
    fields[16] !== 0xff ||
    width > 4096 ||
    height > 2160
  ) {
    throw new Error('不支援的 XWD 格式')
  }
  const offset = fields[0] + fields[19] * 12
  const stride = fields[12]
  const pixels = Buffer.alloc(height * (1 + width * 3))
  let clockPixels = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const input = offset + y * stride + x * bytesPerPixel
      const output = y * (1 + width * 3) + 1 + x * 3
      pixels[output] = source[input + 2]
      pixels[output + 1] = source[input + 1]
      pixels[output + 2] = source[input]
      // 受控端時鐘的專用背景色；容許視訊壓縮造成少量色差。
      if (
        Math.abs(pixels[output] - 26) < 12 &&
        Math.abs(pixels[output + 1] - 102) < 12 &&
        Math.abs(pixels[output + 2] - 143) < 12
      )
        clockPixels++
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return {
    png: Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
    clockPixels,
  }
}

// 僅擷取遠端桌面視窗；禁止擷取可能顯示臨時密碼的 RustDesk 首頁。
async function captureRemoteWindow(destination) {
  // 純軟體圖形的首次解碼初始化可能超過一分鐘；仍以實際影像為條件且限制總等待。
  for (let attempt = 0; attempt < 300; attempt++) {
    let tree
    try {
      tree = execFileSync('docker', [...compose, 'controller', 'xwininfo', '-root', '-tree'], {
        encoding: 'utf8',
        timeout: 10000,
      })
    } catch (error) {
      if (!process.argv.includes('--verify')) throw error
      await setTimeout(1000)
      continue
    }
    const match = tree.match(/(0x[0-9a-f]+) "[0-9]+ - Remote Desktop - RustDesk"/)
    if (!match) {
      if (!process.argv.includes('--verify'))
        throw new Error('遠端桌面視窗尚未建立，不能宣告驗收成功')
      await setTimeout(1000)
      continue
    }
    const xwd = execFileSync(
      'docker',
      [...compose, 'controller', 'xwd', '-id', match[1], '-silent'],
      { timeout: 10000, maxBuffer: 16000000 },
    )
    const frame = pngFromXwd(xwd)
    if (process.argv.includes('--verify') && frame.clockPixels < 1000) {
      await setTimeout(1000)
      continue
    }
    writeFileSync(destination, frame.png)
    console.log('已擷取獨立測試遠端桌面：' + destination)
    if (process.argv.includes('--verify')) console.log('官方客戶端已收到受控端時鐘畫面：PASS')
    return
  }
  throw new Error('官方客戶端未收到受控端畫面，M0 驗收失敗')
}

if (!process.argv[2]) throw new Error('請指定 PNG 輸出檔案')
await captureRemoteWindow(process.argv[2])
