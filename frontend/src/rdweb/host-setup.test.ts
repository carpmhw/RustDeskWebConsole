import { expect, it } from 'vitest'
import { waitHostObservationReady, hostClientCode } from '../../e2e/real/host-observation-setup'
// 若將setup等待移到input／copy之間或讓late ready延長窗口，此純控制測試會抓到。
it('waits for setup readiness only within the original 60000ms window', async () => {
  let time = 0,
    calls = 0
  await waitHostObservationReady(
    { pollReady: /* 公開假檔案，只控制ready時點。 */ () => ++calls === 3 },
    /* 單調clock。 */ () => time,
    /* 推進setup clock，不送任何操作。 */ async (ms) => {
      time += ms
    },
  )
  expect(calls).toBe(3)
  expect(time).toBe(200)
})
// 缺ready／倒序clock不得改成PASS或無期限等。
it('rejects missing or late readiness at 60000ms', async () => {
  let time = 0
  await expect(
    waitHostObservationReady(
      { pollReady: /* 到期後才ready，也不能接納。 */ () => time >= 60000 },
      /* 可控clock。 */ () => time,
      /* 不使用真sleep。 */ async (ms) => {
        time += ms
      },
    ),
  ).rejects.toThrow('host_observation_unavailable')
  expect(time).toBe(60000)
})
// 原oracle成功但cleanup／log／diagnostic失敗，不得在joined.json冒稱整案PASS。
it('preserves strict mismatches and refuses to promote incomplete cleanup to PASS', () => {
  expect(hostClientCode('host_client_pass', false)).toBe('host_client_failed')
  expect(hostClientCode('host_client_pass', true)).toBe('host_client_pass')
  expect(hostClientCode('input_clipboard_remote_input_mismatch', false)).toBe(
    'input_clipboard_remote_input_mismatch',
  )
})
