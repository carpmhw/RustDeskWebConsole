// 完整platform／version門檻只用於native驗收，錯誤不回顯peer自報摘要。
export function assertInputPeer(metadata: string | null, platform: 'linux' | 'windows'): void {
  const summary = metadata?.trim()
  const separator = summary?.indexOf(' · ') ?? -1
  if (!summary || separator < 1 || separator + 3 >= summary.length)
    throw new Error('input_peer_summary_unavailable')
  const label = platform === 'linux' ? 'Linux' : 'Windows'
  if (summary.slice(0, separator) !== label) throw new Error('input_peer_platform_mismatch')
  if (summary.slice(separator + 3) !== '1.5.0') throw new Error('input_peer_version_mismatch')
}
