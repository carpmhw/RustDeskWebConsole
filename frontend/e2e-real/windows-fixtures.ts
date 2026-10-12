import type { InputFixture } from './input-fixtures'
import { api, createFixture } from '../e2e/helpers/fixtures'
import { readWindowsRuntime, type WindowsRuntime } from './windows-runtime'
// runtime只留Node與formal Vault request；回傳不含host、公鑰、裝置ID或password。
async function saveWindowsTargets(
  runtime: WindowsRuntime,
  transports: readonly ('tcp' | 'ws')[],
): Promise<InputFixture[]> {
  const fixture = await createFixture('admin')
  try {
    const targets: InputFixture[] = []
    for (const transport of transports) {
      const endpoints = runtime.endpoints[transport]
      const server = await api<{ id: string }>(
        fixture.context,
        'servers',
        'POST',
        {
          name: 'official-windows-' + transport,
          id_server: endpoints.id,
          relay_server: endpoints.relay,
          public_key: runtime.publicKey,
          transport,
          enabled: true,
          allow_private_network: true,
          version: 0,
        },
        fixture.admin.access_token,
      )
      const name = 'official-windows-input-' + transport
      const target = await api<{ id: string }>(
        fixture.context,
        'targets',
        'POST',
        {
          name,
          server_id: server.id,
          rustdesk_id: runtime.targetId,
          password: runtime.password,
        },
        fixture.admin.access_token,
      )
      targets.push({
        context: fixture.context,
        username: fixture.user.username,
        targetId: target.id,
        name,
        platform: 'windows',
        editor: { ...runtime.editor },
      })
    }
    return targets
  } catch {
    await fixture.context.dispose()
    throw new Error('Windows official input fixture unavailable')
  }
}
// 同一formal user／context建立TCP與WS，不在50次run中重新認證來重設quota。
export async function prepareWindowsTargets(
  env?: Readonly<Record<string, string | undefined>>,
): Promise<InputFixture[]> {
  return saveWindowsTargets(readWindowsRuntime(env), ['tcp', 'ws'])
}
// requested單一transport仍先驗全部必要runtime，再做任何formal auth／Vault副作用。
export async function prepareWindowsTarget(transport: 'tcp' | 'ws'): Promise<InputFixture> {
  return (await saveWindowsTargets(readWindowsRuntime(), [transport]))[0]!
}
