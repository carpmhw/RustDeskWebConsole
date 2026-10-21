import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

// 只在RAM取樣隔離的公開clock區域，錯誤不得帶出原始XWD或像素。
function sampleClock() {
  try {
    const bytes = execFileSync(
      'docker',
      [
        'compose',
        '-f',
        'frontend/e2e/docker/docker-compose.rustdesk-test.yml',
        'exec',
        '-T',
        'target',
        'xwd',
        '-root',
        '-silent',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16000000, timeout: 10000 },
    )
    const fields = Array.from({ length: 25 }, (_, index) => bytes.readUInt32BE(index * 4))
    if (
      fields[1] !== 7 ||
      fields[4] !== 1280 ||
      fields[5] !== 720 ||
      fields[11] !== 32 ||
      fields[7] !== 0
    )
      throw new Error()
    const offset = fields[0] + fields[19] * 12
    let blue = 0
    const colors = new Set()
    const hash = createHash('sha256')
    for (let y = 250; y < 370; y++) {
      const row = bytes.subarray(
        offset + y * fields[12] + 200 * 4,
        offset + y * fields[12] + 900 * 4,
      )
      if (row.length !== 2800) throw new Error()
      hash.update(row)
      for (let index = 0; index < row.length; index += 4) {
        if (
          Math.abs(row[index + 2] - 26) <= 20 &&
          Math.abs(row[index + 1] - 102) <= 20 &&
          Math.abs(row[index] - 143) <= 20
        )
          blue++
        if (colors.size < 8) colors.add(row[index + 2] * 65536 + row[index + 1] * 256 + row[index])
      }
    }
    bytes.fill(0)
    if (blue < 1000 || colors.size < 2) throw new Error()
    return hash.digest('hex')
  } catch {
    throw new Error('Public RustDesk clock is unavailable')
  }
}

// 兩次內容更新都是公開fixture的真像素變化，不能用健康狀態代替。
async function verifyClock() {
  let previous = sampleClock()
  for (let index = 0; index < 2; index++) {
    await setTimeout(1500)
    const current = sampleClock()
    if (current === previous) throw new Error('Public RustDesk clock is not updating')
    previous = current
  }
  console.log('公開 RustDesk 時鐘背景與兩次內容更新：PASS')
}

await verifyClock()
