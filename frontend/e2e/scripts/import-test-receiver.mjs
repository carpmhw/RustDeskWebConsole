import { importReceiverResult } from '../receiver/client-control.ts'

// 只接受固定的import --directory <root> --source <result>；不猜其他路徑。
function readArgs(args) {
  if (
    args.length !== 4 ||
    args[0] !== '--directory' ||
    !args[1] ||
    args[2] !== '--source' ||
    !args[3]
  )
    throw new Error()
  return { root: args[1], source: args[3] }
}

// CLI只輸出固定code；match／mismatch／unavailable對應0／1／2。
try {
  const { root, source } = readArgs(process.argv.slice(2))
  const result = importReceiverResult(root, source)
  console.log(result.code)
  process.exitCode =
    result.code === 'receiver_match' ? 0 : result.code === 'receiver_mismatch' ? 1 : 2
} catch {
  console.error('receiver_unavailable')
  process.exitCode = 2
}
