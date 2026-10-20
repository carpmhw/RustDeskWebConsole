let busy = false
// 只有單worker的兩個固定Compose scope，完成或失敗都還原環境，不新增CLI入口。
export async function withIngressComposeProject<T>(
  kind: 'console' | 'official',
  operation: () => Promise<T>,
): Promise<T> {
  if (busy || !['console', 'official'].includes(kind)) throw new Error('ingress_control_failed')
  const previous = process.env.COMPOSE_PROJECT_NAME
  busy = true
  process.env.COMPOSE_PROJECT_NAME = kind === 'console' ? 'rdweb-m0' : 'rdweb-rustdesk-test'
  try {
    return await operation()
  } finally {
    if (previous === undefined) delete process.env.COMPOSE_PROJECT_NAME
    else process.env.COMPOSE_PROJECT_NAME = previous
    busy = false
  }
}
