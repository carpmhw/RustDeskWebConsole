import { importHostObservation } from '../frontend/e2e-real/host-observation-control.ts'
// 只接檔案路徑及ready/result分類，不接受憑證或任意輸入。
try {
  if (process.argv.length !== 4) throw new Error()
  importHostObservation(process.argv[2], process.argv[3])
  console.log('host_observer_imported')
} catch {
  console.error('host_observation_unavailable')
  process.exitCode = 2
}
