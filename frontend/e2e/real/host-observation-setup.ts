// 只在首click前等人工ready，單調60秒期限不重設原case／產品期限。
export async function waitHostObservationReady(
  control: { pollReady(): boolean },
  now: () => number = /* 同一Node單調clock。 */ () => performance.now(),
  sleep: (ms: number) => Promise<void> = /* 僅setup poll，不影響input cadence。 */ (ms) =>
    new Promise(/* 自有setup timer。 */ (resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  const started = now()
  let last = started
  while (true) {
    const time = now()
    if (!Number.isFinite(time) || time < last || time - started >= 60000)
      throw new Error('host_observation_unavailable')
    last = time
    if (control.pollReady()) return
    await sleep(100)
  }
}
// 不覆寫原strict mismatch；oracle PASS只有整案收尾／log／diagnostic皆完成才保留。
export function hostClientCode(code: string, completed: boolean): string {
  return code === 'host_client_pass' && !completed ? 'host_client_failed' : code
}
