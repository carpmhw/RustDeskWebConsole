// 固定平台、瀏覽器、prefix與模式，不沿用寬範圍預設。
export function assertIngressScope(env: Readonly<Record<string, string | undefined>>): void
// runner入口拒絕所有外部能力值。
export function assertIngressEntry(env: Readonly<Record<string, string | undefined>>): void
// 正式reset前僅讀私有runtime能力，不送browser。
export function readIngressOwner(env: Readonly<Record<string, string | undefined>>): string
