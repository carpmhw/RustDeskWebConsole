import { expect, it } from 'vitest'
import { withIngressComposeProject } from '../real/reconnect-ingress-compose'
// 同一worker內的同步reset與Linux fixture不可繼承另一個Compose project。
it('scopes console and official project independently and restores on failure', async () => {
  const previous = process.env.COMPOSE_PROJECT_NAME
  await withIngressComposeProject('console', async () => {
    expect(process.env.COMPOSE_PROJECT_NAME).toBe('rdweb-m0')
  })
  expect(process.env.COMPOSE_PROJECT_NAME).toBe(previous)
  await expect(
    withIngressComposeProject('official', async () => {
      expect(process.env.COMPOSE_PROJECT_NAME).toBe('rdweb-rustdesk-test')
      throw new Error('public')
    }),
  ).rejects.toThrow('public')
  expect(process.env.COMPOSE_PROJECT_NAME).toBe(previous)
})
