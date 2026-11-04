import { prepareHostInputOnlyObservation } from '../real/host-observation-control.ts'
// CLI只使用固定新root，不回原文、runtime或原生例外。
try {
  if (process.argv.length !== 2) throw new Error()
  prepareHostInputOnlyObservation()
  console.log('host_input_only_prepared')
} catch {
  console.error('host_input_only_unavailable')
  process.exitCode = 2
}
