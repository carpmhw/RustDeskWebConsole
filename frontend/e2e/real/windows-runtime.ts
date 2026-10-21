type Environment = Readonly<Record<string, string | undefined>>
// Node程序runtime只以既有global讀取；不新增Node型別相依至前端build，browser則無runtime。
const runtimeEnv = (globalThis as { process?: { env: Environment } }).process?.env ?? {}
export interface WindowsRuntime {
  endpoints: Record<'tcp' | 'ws', { id: string; relay: string }>
  publicKey: string
  targetId: string
  password: string
  editor: { x: number; y: number; width: number; height: number }
}
// Node-only讀取runtime，不將私有連線欄位帶入browser DTO或錯誤內容。
export function readWindowsRuntime(env: Environment = runtimeEnv): WindowsRuntime {
  // 必要欄位只驗存在性，不輸出原值；密碼保留原始空白語意。
  function required(name: string): string {
    const value = env['RDWEB_WINDOWS_' + name]
    if (!value) throw new Error('Windows runtime fixture unavailable')
    return value
  }
  const endpoints = {
    tcp: { id: required('ID_TCP'), relay: required('RELAY_TCP') },
    ws: { id: required('ID_WS'), relay: required('RELAY_WS') },
  }
  const publicKey = required('PUBLIC_KEY'),
    targetId = required('TARGET_ID'),
    password = required('PASSWORD')
  const values = ['EDITOR_X', 'EDITOR_Y', 'EDITOR_WIDTH', 'EDITOR_HEIGHT'].map(
    // 僅接受十進位整數字串，避免Number把空白或科學記號解讀成geometry。
    (name) => {
      const value = required(name)
      if (!/^\d+$/.test(value)) throw new Error('Public Windows editor geometry invalid')
      return Number(value)
    },
  )
  if (
    values.some(
      /* 與B2的4096單邊上限一致。 */ (value) => !Number.isSafeInteger(value) || value > 4096,
    ) ||
    values[2]! < 21 ||
    values[3]! < 31 ||
    values[0]! + values[2]! > 4096 ||
    values[1]! + values[3]! > 4096
  )
    throw new Error('Public Windows editor geometry invalid')
  return {
    endpoints,
    publicKey,
    targetId,
    password,
    editor: { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! },
  }
}
// 未指定才預設Linux，明確要求Windows時不能skip或默換平台。
export function inputPlatforms(env: Environment = runtimeEnv): ('linux' | 'windows')[] {
  const values = (env.RDWEB_INPUT_PLATFORMS ?? 'linux').split(',')
  if (
    new Set(values).size !== values.length ||
    values.some(/* 平台固定白名單。 */ (value) => value !== 'linux' && value !== 'windows')
  )
    throw new Error('Invalid input platform')
  return values as ('linux' | 'windows')[]
}
