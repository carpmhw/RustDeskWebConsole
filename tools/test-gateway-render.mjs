import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const gatewayDir = resolve('deploy/dev')

// 建立本測試擁有的暫存目錄與假靜態檔，結束後一律清除。
function fixture(action) {
  const root = mkdtempSync(join(tmpdir(), 'rdweb-gateway-'))
  try {
    const html = join(root, 'html')
    mkdirSync(join(html, 'assets'), { recursive: true })
    writeFileSync(join(html, 'index.html'), '<head><base href="/" /></head>')
    writeFileSync(join(html, 'favicon.svg'), '<svg/>')
    writeFileSync(join(html, 'assets', 'app.js'), 'export {}')
    return action(root, html)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// 以 sh source 共用閘道腳本並呼叫驗證與渲染；只傳入明確列出的環境變數。
function render(root, html, overrides = {}) {
  const env = {
    PATH: process.env.PATH,
    GATEWAY_DIR: gatewayDir,
    GATEWAY_HTML_SOURCE: html,
    GATEWAY_RUNTIME_DIR: join(root, 'runtime'),
    GATEWAY_NGINX_CONF: join(root, 'nginx.conf'),
    GATEWAY_LISTEN_PORT: '8000',
    GATEWAY_UPSTREAM: '127.0.0.1:8080',
    APP_BASE_PATH: '/rdweb',
    ...overrides,
  }
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key]
  const result = spawnSync(
    'sh',
    ['-c', `. "$GATEWAY_DIR/render-gateway.sh" && gateway_validate_base && gateway_render`],
    { env, encoding: 'utf8' },
  )
  return { status: result.status, stderr: result.stderr }
}

// listen 與 upstream 由呼叫端決定，兩容器與單容器共用同一份範本。
test('template takes listen port and upstream from the caller', () => {
  fixture((root, html) => {
    assert.deepEqual(render(root, html), { status: 0, stderr: '' })
    const conf = readFileSync(join(root, 'nginx.conf'), 'utf8')
    assert.match(conf, /^\s*listen 8000;$/m)
    assert.match(conf, /^\s*proxy_pass http:\/\/127\.0\.0\.1:8080;$/m)
    assert.match(conf, new RegExp(`^\\s*root ${join(root, 'runtime')};$`, 'm'))
    assert.doesNotMatch(conf, /\$\{/)
  })
})

// 執行期檔案只寫入暫存目錄，映像內靜態目錄維持原樣（容器可唯讀）。
test('runtime files are written outside the static directory', () => {
  fixture((root, html) => {
    assert.equal(render(root, html, { DEFAULT_DISPLAY_TIME_ZONE: 'Asia/Tokyo' }).status, 0)
    const runtime = join(root, 'runtime')
    assert.equal(
      readFileSync(join(runtime, 'index.html'), 'utf8'),
      '<head><base href="/rdweb/" /></head>',
    )
    assert.equal(
      readFileSync(join(runtime, 'config.js'), 'utf8'),
      'window.RDWEB_CONFIG = {basePath:"/rdweb",defaultDisplayTimeZone:"Asia/Tokyo"};\n',
    )
    assert.equal(readFileSync(join(html, 'index.html'), 'utf8'), '<head><base href="/" /></head>')
    for (const name of ['assets', 'favicon.svg']) {
      assert.ok(lstatSync(join(runtime, name)).isSymbolicLink(), name)
      assert.equal(readlinkSync(join(runtime, name)), join(html, name))
    }
  })
})

// 根路徑部署的 base 為空字串，index 維持根 base href。
test('root base path keeps the root base href', () => {
  fixture((root, html) => {
    assert.equal(render(root, html, { APP_BASE_PATH: '/' }).status, 0)
    assert.equal(
      readFileSync(join(root, 'runtime', 'index.html'), 'utf8'),
      '<head><base href="/" /></head>',
    )
  })
})

// 不合法的掛載路徑或顯示時區以 exit 2 拒絕，不回顯輸入、不產生設定。
test('invalid base path or zone is rejected without echo', () => {
  fixture((root, html) => {
    for (const overrides of [
      { APP_BASE_PATH: 'rdweb' },
      { APP_BASE_PATH: '/a//b' },
      { APP_BASE_PATH: '/a/../b' },
      { APP_BASE_PATH: '/a b' },
      { DEFAULT_DISPLAY_TIME_ZONE: 'Asia/Taipei;x' },
    ]) {
      const result = render(root, html, overrides)
      assert.equal(result.status, 2, JSON.stringify(overrides))
      for (const value of Object.values(overrides))
        assert.ok(!result.stderr.includes(value), JSON.stringify(overrides))
      assert.throws(() => lstatSync(join(root, 'nginx.conf')))
    }
  })
})
