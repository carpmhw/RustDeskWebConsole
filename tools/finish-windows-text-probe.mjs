import { completeTextProbe } from '../frontend/e2e-real/text-probe-control.ts'
// 僅固定分類argv，不收路徑、文字或憑證，錯誤一律固定code。
try {
  if (process.argv.length !== 3) throw new Error()
  completeTextProbe(process.argv[2])
  console.log('text_probe_observation_submitted')
} catch {
  console.error('text_probe_control_unavailable')
  process.exitCode = 2
}
