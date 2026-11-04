import { importHostInputOnlyObservation } from '../real/host-observation-control.ts'
// 只接ready／result及安全檔案來源，不能指定其他用途current。
try {
  if (process.argv.length !== 4) throw new Error()
  importHostInputOnlyObservation(process.argv[2], process.argv[3])
  console.log('host_input_only_imported')
} catch {
  console.error('host_input_only_unavailable')
  process.exitCode = 2
}
