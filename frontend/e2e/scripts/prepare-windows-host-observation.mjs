import { prepareHostObservation } from '../real/host-observation-control.ts'
// CLI只回固定marker，任何runtime／fixture原文都不輸出。
try {
  if (process.argv.length !== 2) throw new Error()
  prepareHostObservation()
  console.log('host_observer_prepared')
} catch {
  console.error('host_observation_unavailable')
  process.exitCode = 2
}
