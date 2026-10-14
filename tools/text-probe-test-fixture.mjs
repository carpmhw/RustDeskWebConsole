import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
// 只複製測試工具來源到自有tmp，讓固定CLI/current路徑不接觸操作者私有檔。
export function copyTextProbeTools(root) {
  for (const path of [
    'frontend/e2e-real/text-probe-control.ts',
    'frontend/e2e-real/text-probe-runtime.ts',
    'frontend/e2e-real/windows-runtime.ts',
    'frontend/e2e-real/host-observation-control.ts',
    'frontend/e2e-real/host-observation-schema.ts',
    'frontend/e2e-real/clipboard-text-log.ts',
    'frontend/src/rdweb/interaction-limits.ts',
    'tools/finish-windows-text-probe.mjs',
    'deploy/dev/test-m3b3-text-probe.sh',
    'deploy/dev/test-m3b3-text-return-probe.sh',
    'deploy/dev/test-m3b3-common.sh',
  ]) {
    const destination = join(root, path)
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
    copyFileSync(path, destination)
  }
  return join(root, 'frontend/.cache/windows-text-probe/current')
}
