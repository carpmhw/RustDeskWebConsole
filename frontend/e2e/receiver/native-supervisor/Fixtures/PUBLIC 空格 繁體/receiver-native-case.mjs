import process from 'node:process'

// 只有固定公開案例，沒有檔案／網路／stdin／環境讀取或後代程序。
function runNativeCase() {
  process.exitCode = 2
  const args = process.argv.slice(2)
  if (args[0] === 'A') {
    if (args.length === 3 && args[1] === 'PUBLIC SPACE' && args[2] === 'PUBLIC_繁體中文')
      process.exitCode = 0
    return
  }
  if (args.length !== 1) return
  switch (args[0]) {
    case 'E0':
      process.exitCode = 0
      return
    case 'E1':
      process.exitCode = 1
      return
    case 'E2':
      process.exitCode = 2
      return
    case 'E7':
      process.exitCode = 7
      return
    case 'O':
    case 'R': {
      const stream = args[0] === 'O' ? process.stdout : process.stderr
      const text = args[0] === 'O' ? 'PUBLIC_STDOUT' : 'PUBLIC_STDERR'
      let writeFailed = false
      // 錯誤只收斂exit2，不輸出OS error或stack。
      stream.on('error', () => {
        writeFailed = true
        process.exitCode = 2
      })
      // 固定內容完整write後自然退出，不提前process.exit丟棄尚未排空的資料。
      stream.write(text, (error) => {
        process.exitCode = error || writeFailed ? 2 : 0
      })
      return
    }
    default:
      return
  }
}

runNativeCase()
