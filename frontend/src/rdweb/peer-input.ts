import type { hbb } from './codec'
import type { PeerInputMetadata, RemoteInputGeometry, PeerPlatform } from './interaction-types'
import { checkDisplay } from './video-limits'
import { int32 } from './interaction-limits'
// 完整驗明原點與末端座標後才存入私有 cache。
function geometry(value: RemoteInputGeometry): RemoteInputGeometry {
  checkDisplay(value)
  int32(value.x)
  int32(value.y)
  int32(value.x + value.width - 1)
  int32(value.y + value.height - 1)
  return value
}
export class PeerInputMetadataCache {
  private index = 0
  private displays: RemoteInputGeometry[] = []
  private platform: PeerPlatform = 'unsupported'
  private sas = false
  // 部分 PeerInfo 保留所選 index 及未重送的 platform／SAS。
  accept(info: hbb.IPeerInfo, initial: boolean): PeerInputMetadata {
    const displays = info.displays ?? []
    if (!displays.length || displays.length > 32) throw new Error('peer_display_invalid')
    const index = initial ? (info.currentDisplay ?? 0) : this.index
    if (!Number.isInteger(index) || index < 0 || index >= displays.length)
      throw new Error('peer_display_invalid')
    const values = displays.map(
      /* 每筆幾何在存入前完整驗證。 */ (d, display) =>
        geometry({ display, width: d.width ?? 0, height: d.height ?? 0, x: d.x ?? 0, y: d.y ?? 0 }),
    )
    if (initial || info.platform)
      this.platform =
        info.platform === 'Windows'
          ? 'windows'
          : info.platform === 'Linux'
            ? 'linux'
            : 'unsupported'
    if (initial || Object.hasOwn(info, 'sasEnabled')) this.sas = info.sasEnabled ?? false
    this.index = index
    this.displays = values
    return this.snapshot()
  }
  // 只容許換至已驗明 index，驗完新幾何才替換舊值。
  switchDisplay(info: hbb.ISwitchDisplay): PeerInputMetadata {
    const index = info.display ?? 0
    if (!Number.isInteger(index) || !this.displays[index]) throw new Error('peer_display_invalid')
    const g = geometry({
      display: index,
      width: info.width ?? 0,
      height: info.height ?? 0,
      x: info.x ?? 0,
      y: info.y ?? 0,
    })
    this.displays[index] = g
    this.index = index
    return this.snapshot()
  }
  // 回傳 copy，呼叫端不可變更 Worker 私有 cache。
  snapshot(): PeerInputMetadata {
    const g = this.displays[this.index]
    if (!g) throw new Error('peer_display_invalid')
    return { geometry: { ...g }, platform: this.platform, sas: this.sas }
  }
}
