import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const script = 'deploy/dev/validate-outer-proxy.sh'

// 以 sh source 驗證腳本，回傳結束碼、REAL_IP_CONFIG 與 stderr；未傳 value 代表未設定變數。
function run(value) {
  const env = { PATH: process.env.PATH }
  if (value !== undefined) env.OUTER_PROXY_ADDRESSES = value
  const result = spawnSync('sh', ['-c', `. ./${script}; printf '%s' "$REAL_IP_CONFIG"`], {
    env,
    encoding: 'utf8',
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

// 未設定時不產生 realip 設定，dev 行為維持不變。
test('unset OUTER_PROXY_ADDRESSES yields empty config', () => {
  assert.deepEqual(run(), { status: 0, stdout: '', stderr: '' })
})

// 合法位址與 CIDR 各產生一行 set_real_ip_from，並固定只取一層 XFF。
test('valid addresses produce set_real_ip_from lines', () => {
  for (const [input, expected] of [
    ['192.168.1.10', ['192.168.1.10']],
    ['10.0.0.0/8', ['10.0.0.0/8']],
    ['::1', ['::1']],
    ['fd00::/8', ['fd00::/8']],
    ['172.17.0.1,fd00:1:2::3/64', ['172.17.0.1', 'fd00:1:2::3/64']],
  ]) {
    const result = run(input)
    assert.equal(result.status, 0, input)
    assert.equal(
      result.stdout,
      [
        ...expected.map((item) => `set_real_ip_from ${item};`),
        'real_ip_header X-Forwarded-For;',
        'real_ip_recursive off;',
      ].join('\n'),
    )
  }
})

// 萬用範圍、非法格式與注入字元一律以 exit 2 拒絕，且不回顯輸入。
test('wildcard and malformed addresses are rejected without echo', () => {
  for (const input of [
    '',
    '0.0.0.0/0',
    '::/0',
    '10.0.0.0/0',
    '10.0.0.0/33',
    'fd00::/129',
    '256.1.1.1',
    '1.2.3',
    'abc',
    '1.2.3.4 ',
    '1.2.3.4;deny',
    '1.2.3.4,,',
    ',1.2.3.4',
    'fd00:::1',
    'fd00::1::2',
    '12345::1',
    '1.2.3.4/',
    '1.2.3.4/x',
  ]) {
    const result = run(input)
    assert.equal(result.status, 2, JSON.stringify(input))
    assert.equal(result.stdout, '')
    if (input) assert.ok(!result.stderr.includes(input), JSON.stringify(input))
  }
})
