// 純Node scope的精確型別，不以任意mjs或any放寬前端strict。
export function assertLongrunScope(env: Readonly<Record<string, string | undefined>>): void
