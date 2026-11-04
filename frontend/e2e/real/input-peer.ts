// 各平台核准版本：Linux 為 pinned fixture；Windows 真機於 2026-11-04 自動升級至 1.5.1，
// 經上游 1.5.0→1.5.1 差異核對（enigo win_impl、rdev Windows、input_service Windows 路徑皆未變）後核准。
const APPROVED_VERSION = { linux: '1.5.0', windows: '1.5.1' } as const
// 完整platform／version門檻只用於native驗收，錯誤不回顯peer自報摘要。
export function assertInputPeer(metadata: string | null, platform: 'linux' | 'windows'): void {
  const summary = metadata?.trim()
  const separator = summary?.indexOf(' · ') ?? -1
  if (!summary || separator < 1 || separator + 3 >= summary.length)
    throw new Error('input_peer_summary_unavailable')
  const label = platform === 'linux' ? 'Linux' : 'Windows'
  if (summary.slice(0, separator) !== label) throw new Error('input_peer_platform_mismatch')
  if (summary.slice(separator + 3) !== APPROVED_VERSION[platform])
    throw new Error('input_peer_version_mismatch')
}
