import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { URL } from 'node:url'

// 先以能力斷言取得RED，避免把缺module的例外當作行為測試。
async function api() {
  assert.equal(existsSync(new URL('./run-receiver-isolated.mjs', import.meta.url)), true)
  return import('./run-receiver-isolated.mjs')
}

// 外部port回的診斷也要strict投影，getter／extra不得被執行或輸出。
test('projects receiver diagnostics without changing the original classification', async () => {
  const c = await api()
  const good = {
    version: 1,
    phase: 'register_pk',
    reason: 'registration_rejected',
    udpClose: 'confirmed',
    hbbsClose: 'not_acquired',
    hbbrClose: 'not_acquired',
    sessionClose: 'confirmed',
    timersClose: 'confirmed',
    cleanupBudgetExceeded: false,
  }
  let touched = false
  for (const value of [
    good,
    { ...good, extra: 'PUBLIC_SECRET_SENTINEL' },
    Object.defineProperty({ ...good }, 'phase', {
      get() {
        touched = true
        return 'register_pk'
      },
    }),
  ]) {
    const p = ports()
    p.run = async () => ({
      code: 'receiver_unavailable',
      resourcesClosed: false,
      receiverDiagnostic: value,
    })
    const result = await c.executeIsolation(p)
    assert.equal(result.code, 'receiver_unavailable')
    assert.equal(result.resourcesClosed, false)
    assert.equal(typeof result.receiverDiagnostic, 'object')
    assert.equal(result.receiverDiagnostic.phase, value === good ? 'register_pk' : 'unknown')
    assert.equal(JSON.stringify(result).includes('PUBLIC_SECRET_SENTINEL'), false)
  }
  assert.equal(touched, false)
})

// 結果匯入失敗也要保留自有child診斷，不能只有import成功才看得到失敗分支。
test('retains owned child diagnostics even if run or result import fails', async () => {
  const c = await api()
  const p = ports('run')
  p.diagnostic = () => ({
    version: 1,
    phase: 'result_write',
    reason: 'result_write_failed',
    udpClose: 'confirmed',
    hbbsClose: 'confirmed',
    hbbrClose: 'confirmed',
    sessionClose: 'confirmed',
    timersClose: 'confirmed',
    cleanupBudgetExceeded: false,
  })
  const result = await c.executeIsolation(p)
  assert.equal(result.stage, 'run')
  assert.equal(result.code, 'receiver_unavailable')
  assert.equal(typeof result.receiverDiagnostic, 'object')
  assert.equal(result.receiverDiagnostic.phase, 'result_write')
})

// 只替換Docker／HTTP／child外部邊界，真正owner／單輪／收尾邏輯仍由driver執行。
function ports(failAt) {
  const calls = []
  const p = { calls }
  for (const stage of ['preflight', 'claim', 'build', 'up', 'provision', 'run', 'down']) {
    // 不開socket或啟服務；故障只在指定外部階段注入一次。
    p[stage] = async () => {
      calls.push(stage)
      if (stage === failAt) throw new Error('public_failure')
      return stage === 'run' ? { code: 'receiver_match', resourcesClosed: true } : true
    }
  }
  return p
}

// 缺授權／CI／混用舊host用途時，在建立目錄或呼叫Docker前拒絕。
test('requires the exact isolated authorization and rejects mixed purposes', async () => {
  const c = await api(),
    key = 'RDWEB_RECEIVER_ISOLATED_AUTHORIZE'
  assert.equal(c.authorizeIsolation({ [key]: 'rdweb-receiver-isolated-20261023-01' }), true)
  for (const env of [
    {},
    { [key]: '1' },
    { [key]: 'rdweb-receiver-isolated-20261023-01', CI: '1' },
    { [key]: 'rdweb-receiver-isolated-20261023-01', RDWEB_WINDOWS_HOST_INPUT_ONLY: '1' },
  ])
    assert.throws(() => c.authorizeIsolation(env), /^Error: receiver_unavailable$/)
})

// 02是精確新scope，不是01的任意reuse旗標，也不能推算03或覆寫root／image。
test('binds the approved second attempt to its new root and pinned images', async () => {
  const c = await api()
  assert.equal(typeof c.readIsolationScope, 'function')
  const env = { RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261023-02' }
  const scope = c.readIsolationScope(env)
  assert.equal(c.authorizeIsolation(env), true)
  assert.equal(scope.project, 'rdweb-receiver-isolated-20261023-02')
  assert.equal(scope.root, '/tmp/opencode/rdweb-test-receiver-isolated-20261023-02')
  assert.equal(scope.reuseImages, true)
  assert.deepEqual(scope.images, {
    server: 'sha256:993e1615cd733264573f2440e6c1daeff7a8627c572c34085d6c5a0d7b8d504d',
    api: 'sha256:2fa3aca31b154641864ccd327e9748d9c303b3cf58106e7f0254da04bf29e5fc',
    web: 'sha256:470c199b6d9ec02b5e11156395482c69ea921a0251383d5257082aec2c396ad3',
  })
  assert.throws(
    () =>
      c.readIsolationScope({
        RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261023-04',
      }),
    /^Error: receiver_unavailable$/,
  )
})

// 03只能使用修正後新包，不能把02的舊bundle或任意輸出目錄視為等價來源。
test('binds the approved third attempt to the rebuilt receiver package', async () => {
  const c = await api()
  const scope = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261023-03',
  })
  assert.equal(scope.project, 'rdweb-receiver-isolated-20261023-03')
  assert.equal(scope.root, '/tmp/opencode/rdweb-test-receiver-isolated-20261023-03')
  assert.equal(
    scope.packageDirectory.endsWith(
      '/frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261023-02/portable',
    ),
    true,
  )
  assert.equal(
    scope.packageSha256,
    'b4e2f86f7d0f2f753e420f06ce808fc6f76c84a7549612a1b8a3aa96b2c6d3d1',
  )
  assert.equal(
    scope.integritySha256,
    'e1bd76c075ff50f9f965cbfbc55fcd871466798eaca448e6f939c4586cd9065f',
  )
  assert.equal(
    scope.bundleSha256,
    '29450fd437c30dbb9da972dcd8de1bf1e5a34268bf6fef2cd80692805d407f2e',
  )
  assert.equal(c.isolationCommands(scope).build, null)
  assert.deepEqual(c.isolationCommands(scope).up, [
    'up',
    '--no-build',
    '--pull',
    'never',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
  ])
})

// 包的完整性與實際執行bundle各有獨立pin；同時替換bundle及其manifest亦不能過關。
test('refuses old package fallback and substituted package metadata', async () => {
  const c = await api()
  assert.equal(typeof c.assertIsolationPackage, 'function')
  const scope = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261023-03',
  })
  const actual = {
    directory: scope.packageDirectory,
    zipSha256: 'b4e2f86f7d0f2f753e420f06ce808fc6f76c84a7549612a1b8a3aa96b2c6d3d1',
    integritySha256: 'e1bd76c075ff50f9f965cbfbc55fcd871466798eaca448e6f939c4586cd9065f',
    bundleSha256: '29450fd437c30dbb9da972dcd8de1bf1e5a34268bf6fef2cd80692805d407f2e',
  }
  assert.equal(c.assertIsolationPackage(scope, actual), true)
  for (const change of [
    { directory: '/tmp/opencode/unapproved-package' },
    { zipSha256: 'cb2f2cb4000fb5ec09e3906b094e2d29547d866d34ae50acc7a59ed9d63a77e8' },
    { integritySha256: '26713ce11ede4a3e2ba4b09d01d582ce78a0278bb1b325b5dbfc26b310dced92' },
    { bundleSha256: 'cb59fa56e4661015aeab78f36caf4bf5bef90ccc4854cba164bbb2774f5fb9f8' },
    { extra: true },
  ])
    assert.throws(
      () => c.assertIsolationPackage(scope, { ...actual, ...change }),
      /^Error: receiver_unavailable$/,
    )
})

// 精確重用分支缺檔／錯ID只能停，不得fallback成pull／build。
test('binds the fourth diagnostic attempt to its approved new root and package', async () => {
  const c = await api()
  const env = { RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-04' }
  assert.doesNotThrow(() => c.authorizeIsolation(env))
  const scope = c.readIsolationScope(env)
  assert.equal(scope.project, 'rdweb-receiver-isolated-20261024-04')
  assert.equal(scope.root, '/tmp/opencode/rdweb-test-receiver-isolated-20261024-04')
  assert.equal(
    scope.packageDirectory.endsWith(
      '/frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-01/portable',
    ),
    true,
  )
  assert.equal(
    scope.packageSha256,
    '9704428f76582c421b862d4cd49461611fe65b6f1a54b23d648e80a8a52deb09',
  )
  assert.equal(
    scope.integritySha256,
    'ade33ca425883e6b99b6293fe9d290efe29885f280de74c7c1d8f2b18e08163c',
  )
  assert.equal(
    scope.bundleSha256,
    '8d369024c7a0dadf8e6221cdd976360c6b735b450e710fd7da1a4258adf8e8a2',
  )
  assert.equal(scope.reuseImages, true)
  assert.equal(c.isolationCommands(scope).build, null)
  assert.deepEqual(c.isolationCommands(scope).up, [
    'up',
    '--no-build',
    '--pull',
    'never',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
  ])
  for (const id of ['rdweb-receiver-isolated-20261023-04', 'rdweb-receiver-isolated-20261024-09'])
    assert.throws(
      () => c.readIsolationScope({ RDWEB_RECEIVER_ISOLATED_AUTHORIZE: id }),
      /^Error: receiver_unavailable$/,
    )
})

// R8來源不符不能退回03或01／02包，未知extra與同時竄改manifest也拒絕。
test('rejects pre-diagnostic package fallback for the fourth attempt', async () => {
  const c = await api()
  const scope = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-04',
  })
  const actual = {
    directory: scope.packageDirectory,
    zipSha256: '9704428f76582c421b862d4cd49461611fe65b6f1a54b23d648e80a8a52deb09',
    integritySha256: 'ade33ca425883e6b99b6293fe9d290efe29885f280de74c7c1d8f2b18e08163c',
    bundleSha256: '8d369024c7a0dadf8e6221cdd976360c6b735b450e710fd7da1a4258adf8e8a2',
  }
  assert.equal(c.assertIsolationPackage(scope, actual), true)
  for (const id of [
    'rdweb-receiver-isolated-20261023-01',
    'rdweb-receiver-isolated-20261023-02',
    'rdweb-receiver-isolated-20261023-03',
  ]) {
    const old = c.readIsolationScope({ RDWEB_RECEIVER_ISOLATED_AUTHORIZE: id })
    for (const change of [
      { directory: old.packageDirectory },
      { zipSha256: old.packageSha256 },
      { integritySha256: old.integritySha256 },
      { bundleSha256: old.bundleSha256 },
      { extra: true },
    ])
      assert.throws(
        () => c.assertIsolationPackage(scope, { ...actual, ...change }),
        /^Error: receiver_unavailable$/,
      )
    assert.throws(() => c.assertIsolationPackage(old, actual), /^Error: receiver_unavailable$/)
  }
})

// 精確重用分支缺檔／錯ID只能停，不得fallback成pull／build。
test('binds the fifth attempt to the approved EOF-fixed package without build or pull', async () => {
  const c = await api()
  const env = { RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-05' }
  assert.doesNotThrow(() => c.authorizeIsolation(env))
  const scope = c.readIsolationScope(env)
  assert.equal(scope.project, 'rdweb-receiver-isolated-20261024-05')
  assert.equal(scope.root, '/tmp/opencode/rdweb-test-receiver-isolated-20261024-05')
  assert.equal(
    scope.packageDirectory.endsWith(
      '/frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-02/portable',
    ),
    true,
  )
  assert.equal(
    scope.packageSha256,
    '58623ffa2e41533cc887b5cb13cd509ca3030959ea1717027937705b6473807c',
  )
  assert.equal(
    scope.integritySha256,
    'c9e19ac93745b5fe57e21398ac5d2e062fe250bdc1cd0591add75c9b0081e206',
  )
  assert.equal(
    scope.bundleSha256,
    '005b51a5084246dfeb109a42ffcf2953198c220a116bf61015e9e386a8e899b4',
  )
  assert.equal(scope.reuseImages, true)
  assert.equal(c.isolationCommands(scope).build, null)
  assert.deepEqual(c.isolationCommands(scope).up, [
    'up',
    '--no-build',
    '--pull',
    'never',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
  ])
  assert.throws(
    () =>
      c.readIsolationScope({
        RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-09',
      }),
    /^Error: receiver_unavailable$/,
  )
})

// 05須精確使用EOF修正版，含診斷但尚未修正的04包亦不得fallback。
test('rejects every historical package as a fallback for the fifth attempt', async () => {
  const c = await api()
  const scope = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-05',
  })
  const actual = {
    directory: scope.packageDirectory,
    zipSha256: '58623ffa2e41533cc887b5cb13cd509ca3030959ea1717027937705b6473807c',
    integritySha256: 'c9e19ac93745b5fe57e21398ac5d2e062fe250bdc1cd0591add75c9b0081e206',
    bundleSha256: '005b51a5084246dfeb109a42ffcf2953198c220a116bf61015e9e386a8e899b4',
  }
  assert.equal(c.assertIsolationPackage(scope, actual), true)
  for (const id of [
    'rdweb-receiver-isolated-20261023-01',
    'rdweb-receiver-isolated-20261023-02',
    'rdweb-receiver-isolated-20261023-03',
    'rdweb-receiver-isolated-20261024-04',
  ]) {
    const old = c.readIsolationScope({ RDWEB_RECEIVER_ISOLATED_AUTHORIZE: id })
    for (const change of [
      { directory: old.packageDirectory },
      { zipSha256: old.packageSha256 },
      { integritySha256: old.integritySha256 },
      { bundleSha256: old.bundleSha256 },
      { extra: true },
    ])
      assert.throws(
        () => c.assertIsolationPackage(scope, { ...actual, ...change }),
        /^Error: receiver_unavailable$/,
      )
    assert.throws(() => c.assertIsolationPackage(old, actual), /^Error: receiver_unavailable$/)
  }
})

// 06若誤綁舊包／root或產生build／pull會失敗；未知07仍不得自動取得scope。
test('binds the sixth attempt to the approved UUID-fixed package without build or pull', async () => {
  const c = await api()
  const env = { RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-06' }
  assert.doesNotThrow(() => c.authorizeIsolation(env))
  const scope = c.readIsolationScope(env)
  assert.equal(scope.project, 'rdweb-receiver-isolated-20261024-06')
  assert.equal(scope.root, '/tmp/opencode/rdweb-test-receiver-isolated-20261024-06')
  assert.equal(
    scope.packageDirectory.endsWith(
      '/frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-03/portable',
    ),
    true,
  )
  assert.equal(
    scope.packageSha256,
    '86395b36604383fd0068785381eaf5e68e5bcb040ef50b7a190ef2f506837399',
  )
  assert.equal(
    scope.integritySha256,
    '850dc4f40457651d6dba9d5c1da071d29487d56cdd4d3e4d6f8130e91e1a3d0d',
  )
  assert.equal(
    scope.bundleSha256,
    '657e7cac66d9803ef7074f59988015220702d77d8caa5bb30a5430e806b6ef20',
  )
  assert.equal(scope.reuseImages, true)
  assert.equal(c.isolationCommands(scope).build, null)
  assert.deepEqual(c.isolationCommands(scope).up, [
    'up',
    '--no-build',
    '--pull',
    'never',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
  ])
  assert.throws(
    () =>
      c.readIsolationScope({
        RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-09',
      }),
    /^Error: receiver_unavailable$/,
  )
})

// 06即使退回已有EOF修正的05包仍是錯來源；任一舊pin、跨scope或多餘欄位皆拒絕。
test('rejects every historical package as a fallback for the sixth attempt', async () => {
  const c = await api()
  const scope = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-06',
  })
  const actual = {
    directory: scope.packageDirectory,
    zipSha256: '86395b36604383fd0068785381eaf5e68e5bcb040ef50b7a190ef2f506837399',
    integritySha256: '850dc4f40457651d6dba9d5c1da071d29487d56cdd4d3e4d6f8130e91e1a3d0d',
    bundleSha256: '657e7cac66d9803ef7074f59988015220702d77d8caa5bb30a5430e806b6ef20',
  }
  assert.equal(c.assertIsolationPackage(scope, actual), true)
  for (const id of [
    'rdweb-receiver-isolated-20261023-01',
    'rdweb-receiver-isolated-20261023-02',
    'rdweb-receiver-isolated-20261023-03',
    'rdweb-receiver-isolated-20261024-04',
    'rdweb-receiver-isolated-20261024-05',
  ]) {
    const old = c.readIsolationScope({ RDWEB_RECEIVER_ISOLATED_AUTHORIZE: id })
    for (const change of [
      { directory: old.packageDirectory },
      { zipSha256: old.packageSha256 },
      { integritySha256: old.integritySha256 },
      { bundleSha256: old.bundleSha256 },
      { extra: true },
    ])
      assert.throws(
        () => c.assertIsolationPackage(scope, { ...actual, ...change }),
        /^Error: receiver_unavailable$/,
      )
    assert.throws(() => c.assertIsolationPackage(old, actual), /^Error: receiver_unavailable$/)
  }
})

// 07必須綁R8.1新包與新root，明列固定image ID且不產生build／pull命令。
test('binds the seventh attempt to the approved read-source diagnostic package', async () => {
  const c = await api()
  const env = { RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-07' }
  assert.doesNotThrow(() => c.authorizeIsolation(env))
  const scope = c.readIsolationScope(env)
  assert.equal(scope.project, 'rdweb-receiver-isolated-20261024-07')
  assert.equal(scope.root, '/tmp/opencode/rdweb-test-receiver-isolated-20261024-07')
  assert.equal(
    scope.packageDirectory.endsWith(
      '/frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-04/portable',
    ),
    true,
  )
  assert.equal(
    scope.packageSha256,
    'e7094d12b644df510a2e45ade29641f5a8ac80df9021e2d3f3bd359b2d23e3b8',
  )
  assert.equal(
    scope.integritySha256,
    'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
  )
  assert.equal(
    scope.bundleSha256,
    '03d6c730119b941e20454e3f52ad9e920a08a6ef4473ac1e61d9c341ff559947',
  )
  assert.equal(scope.reuseImages, true)
  assert.deepEqual(scope.images, {
    server: 'sha256:993e1615cd733264573f2440e6c1daeff7a8627c572c34085d6c5a0d7b8d504d',
    api: 'sha256:2fa3aca31b154641864ccd327e9748d9c303b3cf58106e7f0254da04bf29e5fc',
    web: 'sha256:470c199b6d9ec02b5e11156395482c69ea921a0251383d5257082aec2c396ad3',
  })
  assert.equal(c.isolationCommands(scope).build, null)
  assert.deepEqual(c.isolationCommands(scope).up, [
    'up',
    '--no-build',
    '--pull',
    'never',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
  ])
  assert.throws(
    () =>
      c.readIsolationScope({
        RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-09',
      }),
    /^Error: receiver_unavailable$/,
  )
})

// 包含UUID修正但缺讀取來源的06包也不能fallback；所有舊pin與跨scope都必須拒絕。
test('rejects every historical package as a fallback for the seventh attempt', async () => {
  const c = await api()
  const scope = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-07',
  })
  const actual = {
    directory: scope.packageDirectory,
    zipSha256: 'e7094d12b644df510a2e45ade29641f5a8ac80df9021e2d3f3bd359b2d23e3b8',
    integritySha256: 'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
    bundleSha256: '03d6c730119b941e20454e3f52ad9e920a08a6ef4473ac1e61d9c341ff559947',
  }
  assert.equal(c.assertIsolationPackage(scope, actual), true)
  for (const id of [
    'rdweb-receiver-isolated-20261023-01',
    'rdweb-receiver-isolated-20261023-02',
    'rdweb-receiver-isolated-20261023-03',
    'rdweb-receiver-isolated-20261024-04',
    'rdweb-receiver-isolated-20261024-05',
    'rdweb-receiver-isolated-20261024-06',
  ]) {
    const old = c.readIsolationScope({ RDWEB_RECEIVER_ISOLATED_AUTHORIZE: id })
    for (const change of [
      { directory: old.packageDirectory },
      { zipSha256: old.packageSha256 },
      { integritySha256: old.integritySha256 },
      { bundleSha256: old.bundleSha256 },
      { extra: true },
    ])
      assert.throws(
        () => c.assertIsolationPackage(scope, { ...actual, ...change }),
        /^Error: receiver_unavailable$/,
      )
    assert.throws(() => c.assertIsolationPackage(old, actual), /^Error: receiver_unavailable$/)
  }
})

// 08只新增獨立root，不出新包；三個來源pins與image ID仍須逐項精確核對。
test('binds the eighth attempt to a fresh root and the approved existing receiver package', async () => {
  const c = await api()
  const env = { RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-08' }
  assert.doesNotThrow(() => c.authorizeIsolation(env))
  const scope = c.readIsolationScope(env)
  assert.equal(scope.project, 'rdweb-receiver-isolated-20261024-08')
  assert.equal(scope.root, '/tmp/opencode/rdweb-test-receiver-isolated-20261024-08')
  assert.equal(
    scope.packageDirectory.endsWith(
      '/frontend/.cache/test-receiver-portable-v24.22.1-win-x64-20261024-04/portable',
    ),
    true,
  )
  assert.equal(
    scope.packageSha256,
    'e7094d12b644df510a2e45ade29641f5a8ac80df9021e2d3f3bd359b2d23e3b8',
  )
  assert.equal(
    scope.integritySha256,
    'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
  )
  assert.equal(
    scope.bundleSha256,
    '03d6c730119b941e20454e3f52ad9e920a08a6ef4473ac1e61d9c341ff559947',
  )
  assert.equal(scope.reuseImages, true)
  assert.deepEqual(scope.images, {
    server: 'sha256:993e1615cd733264573f2440e6c1daeff7a8627c572c34085d6c5a0d7b8d504d',
    api: 'sha256:2fa3aca31b154641864ccd327e9748d9c303b3cf58106e7f0254da04bf29e5fc',
    web: 'sha256:470c199b6d9ec02b5e11156395482c69ea921a0251383d5257082aec2c396ad3',
  })
  assert.equal(c.isolationCommands(scope).build, null)
  assert.deepEqual(c.isolationCommands(scope).up, [
    'up',
    '--no-build',
    '--pull',
    'never',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
  ])
  const seven = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-07',
  })
  assert.equal(seven.root, '/tmp/opencode/rdweb-test-receiver-isolated-20261024-07')
  assert.notEqual(scope.root, seven.root)
  assert.equal(seven.packageDirectory, scope.packageDirectory)
  assert.throws(
    () =>
      c.readIsolationScope({
        RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-09',
      }),
    /^Error: receiver_unavailable$/,
  )
})

// 07的程式包是08明確核准重用來源；更舊版本或extra欄位仍不得fallback。
test('rejects older package fallbacks for the eighth attempt while allowing the exact shared package', async () => {
  const c = await api()
  const scope = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-08',
  })
  const actual = {
    directory: scope.packageDirectory,
    zipSha256: 'e7094d12b644df510a2e45ade29641f5a8ac80df9021e2d3f3bd359b2d23e3b8',
    integritySha256: 'f84ff6df70d16db2225099242fc24e8c8b113015a1bb05258fe4c3e5b9f2e87b',
    bundleSha256: '03d6c730119b941e20454e3f52ad9e920a08a6ef4473ac1e61d9c341ff559947',
  }
  assert.equal(c.assertIsolationPackage(scope, actual), true)
  assert.equal(
    c.assertIsolationPackage(
      c.readIsolationScope({
        RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261024-07',
      }),
      actual,
    ),
    true,
  )
  for (const id of [
    'rdweb-receiver-isolated-20261023-01',
    'rdweb-receiver-isolated-20261023-02',
    'rdweb-receiver-isolated-20261023-03',
    'rdweb-receiver-isolated-20261024-04',
    'rdweb-receiver-isolated-20261024-05',
    'rdweb-receiver-isolated-20261024-06',
  ]) {
    const old = c.readIsolationScope({ RDWEB_RECEIVER_ISOLATED_AUTHORIZE: id })
    for (const change of [
      { directory: old.packageDirectory },
      { zipSha256: old.packageSha256 },
      { integritySha256: old.integritySha256 },
      { bundleSha256: old.bundleSha256 },
      { extra: true },
    ])
      assert.throws(
        () => c.assertIsolationPackage(scope, { ...actual, ...change }),
        /^Error: receiver_unavailable$/,
      )
  }
})

// 精確重用分支缺檔／錯ID只能停，不得fallback成pull／build。
test('rejects missing or substituted reuse images while keeping first-attempt protection', async () => {
  const c = await api()
  assert.equal(typeof c.assertIsolationImage, 'function')
  const two = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261023-02',
  })
  for (const role of ['server', 'api', 'web']) {
    assert.equal(c.assertIsolationImage(two, role, two.images[role]), true)
    for (const bad of [null, '', 'sha256:' + '0'.repeat(64)])
      assert.throws(() => c.assertIsolationImage(two, role, bad), /^Error: receiver_unavailable$/)
  }
  const one = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261023-01',
  })
  assert.equal(c.assertIsolationImage(one, 'server', null), true)
  assert.throws(
    () => c.assertIsolationImage(one, 'server', two.images.server),
    /^Error: receiver_unavailable$/,
  )
})

// 真正native消費的命令計畫在02不能產生build／pull；不是只檢查source字串。
test('the reuse command plan never builds or pulls', async () => {
  const c = await api()
  assert.equal(typeof c.isolationCommands, 'function')
  const commands = c.isolationCommands(
    c.readIsolationScope({
      RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261023-02',
    }),
  )
  assert.equal(commands.build, null)
  assert.deepEqual(commands.up, [
    'up',
    '--no-build',
    '--pull',
    'never',
    '-d',
    '--wait',
    '--wait-timeout',
    '90',
  ])
})

// 階段只能是白名單，不把child原始輸出／exception複製到結果或用其改判成功。
test('preserves only a safe client stage in the orchestration outcome', async () => {
  const c = await api(),
    p = ports()
  for (const stage of [
    'target_selection',
    'ready_policy',
    'ready_streaming',
    'ready_peer',
    'ready_canvas',
    'ready_snapshot',
    'ready_diagnostics',
  ]) {
    // driver須保留已核准literal，但不得據此把原不可用結果升為成功。
    p.run = async () => ({
      code: 'receiver_unavailable',
      resourcesClosed: false,
      clientStage: stage,
    })
    const result = await c.executeIsolation(p)
    assert.equal(result.clientStage, stage)
    assert.equal(result.code, 'receiver_unavailable')
    assert.equal(result.resourcesClosed, false)
  }
  p.run = async () => ({
    code: 'receiver_unavailable',
    resourcesClosed: false,
    clientStage: 'public-secret-sentinel',
  })
  const result = await c.executeIsolation(p)
  assert.equal(result.clientStage, 'unknown')
  assert.doesNotMatch(JSON.stringify(result), /public-secret-sentinel/)
})

// 同名image也屬既有工作；即使project不存在，仍不能覆寫別人的tag。
test('rejects every existing isolation resource before claiming the run', async () => {
  const c = await api()
  assert.equal(typeof c.assertIsolationFresh, 'function')
  const empty = { root: false, containers: false, volumes: false, networks: false, images: false }
  assert.equal(c.assertIsolationFresh(empty), true)
  for (const key of Object.keys(empty))
    assert.throws(
      () => c.assertIsolationFresh({ ...empty, [key]: true }),
      /^Error: receiver_unavailable$/,
    )
})

// CLI缺授權必須固定exit2，不接觸Docker；import本身也不得自動執行native。
test('the native entry refuses missing authorization without revealing environment', async () => {
  await api()
  const result = spawnSync(
    process.execPath,
    [new URL('./run-receiver-isolated.mjs', import.meta.url).pathname],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        RDWEB_PUBLIC_PRIVACY_SENTINEL: 'public-do-not-print',
      },
    },
  )
  assert.equal(result.status, 2)
  assert.doesNotMatch(result.stdout + result.stderr, /public-do-not-print|Error:|\/tmp\//)
  assert.match(result.stdout, /receiver_unavailable/)
})

// 重複／錯start request不得啟receiver，且結果不能只依receiver單方match。
test('binds the start request to the same validated run', async () => {
  const c = await api()
  const binding = {
    schemaVersion: 1,
    purpose: 'rustdesk_test_receiver_v1',
    runId: '11111111-1111-4111-8111-111111111111',
    requestId: '22222222-2222-4222-8222-222222222222',
    peerId: '987654321',
    createdUtc: '2026-10-23T00:00:00.000Z',
    expiresUtc: '2026-10-23T00:30:00.000Z',
  }
  const header = {
    schemaVersion: 1,
    purpose: binding.purpose,
    runId: binding.runId,
    requestId: binding.requestId,
  }
  assert.equal(c.isIsolationStart(header, binding), true)
  assert.equal(c.isIsolationStart({ ...header, requestId: binding.runId }, binding), false)
  assert.equal(c.isIsolationStart({ ...header, extra: 'public' }, binding), false)
})

// 正常路徑只能run一次，down在證據之後；不借用官方client fixture或resetStack。
test('runs exactly one provisioned case and closes only its owned stack', async () => {
  const c = await api(),
    p = ports()
  assert.deepEqual(await c.executeIsolation(p), {
    code: 'receiver_match',
    stage: 'complete',
    resourcesClosed: true,
  })
  assert.deepEqual(p.calls, ['preflight', 'claim', 'build', 'up', 'provision', 'run', 'down'])
})

// preflight／claim／build失敗尚未有stack，不能down外部資源；不重試或換run。
test('never tears down resources when ownership was not acquired', async () => {
  const c = await api()
  for (const stage of ['preflight', 'claim', 'build']) {
    const p = ports(stage),
      result = await c.executeIsolation(p)
    assert.equal(result.code, 'receiver_unavailable')
    assert.equal(result.stage, stage)
    assert.equal(p.calls.includes('down'), false)
    assert.equal(p.calls.filter((value) => value === stage).length, 1)
  }
})

// up可能只完成部分服務；任何後續失敗仍須收本次project，但不可宣稱正常協定成功。
test('closes partially started owned resources and preserves failures', async () => {
  const c = await api()
  for (const stage of ['up', 'provision', 'run', 'down']) {
    const p = ports(stage),
      result = await c.executeIsolation(p)
    assert.equal(result.code, 'receiver_unavailable')
    assert.equal(p.calls.at(-1), 'down')
    assert.equal(p.calls.filter((value) => value === 'run').length <= 1, true)
    if (stage === 'run') assert.equal(result.resourcesClosed, false)
    if (stage === 'down') assert.equal(result.resourcesClosed, false)
  }
})

// 原本mismatch不能因基礎設施關閉成功改判match；cleanup缺證據優先unavailable。
test('preserves mismatch and rejects missing receiver cleanup evidence', async () => {
  const c = await api(),
    p = ports()
  p.run = async () => ({ code: 'receiver_mismatch', resourcesClosed: true })
  assert.equal((await c.executeIsolation(p)).code, 'receiver_mismatch')
  p.run = async () => ({ code: 'receiver_match', resourcesClosed: false })
  assert.equal((await c.executeIsolation(p)).code, 'receiver_unavailable')
})

// 解析真正compose而非grep YAML；只用公開非秘密placeholder，不連Docker daemon。
test('limits the compose to new isolated services, volumes and loopback ports', () => {
  const file = new URL('../docker/docker-compose.receiver-test.yml', import.meta.url)
  assert.equal(existsSync(file), true)
  const output = spawnSync(
    'docker',
    ['compose', '-f', file.pathname, 'config', '--format', 'json'],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        SECRET_KEY: 'public-contract-placeholder',
        VAULT_KEY: 'public-contract-placeholder',
        BOOTSTRAP_ADMIN_PASSWORD: 'public-contract-password',
      },
    },
  )
  assert.equal(output.status, 0, output.stderr)
  const config = JSON.parse(output.stdout)
  assert.equal(config.name, 'rdweb-receiver-isolated-20261023-01')
  assert.deepEqual(Object.keys(config.services).sort(), [
    'backend',
    'hbbr',
    'hbbs',
    'ingress',
    'web',
  ])
  assert.deepEqual(Object.keys(config.volumes).sort(), [
    'api-data',
    'public-key',
    'relay-data',
    'server-data',
  ])
  const published = Object.values(config.services).flatMap((s) => s.ports ?? [])
  assert.deepEqual(published.map((p) => `${p.host_ip}:${p.published}/${p.protocol}`).sort(), [
    '127.0.0.1:18080/tcp',
    '127.0.0.1:21136/tcp',
    '127.0.0.1:21136/udp',
    '127.0.0.1:21137/tcp',
  ])
  for (const service of Object.values(config.services)) {
    assert.equal(service.logging.driver, 'none')
    assert.equal(service.network_mode, undefined)
    assert.equal(service.privileged, undefined)
  }
  assert.equal(config.networks.isolation.external, undefined)
  assert.equal(config.networks.isolation.ipam.config[0].subnet, '172.30.91.0/24')
})

// 02的實際compose模型必須使用精確ID及新project的volume／network，不引用01狀態。
test('renders second-attempt compose with pinned local images and new resource names', async () => {
  const c = await api()
  assert.equal(typeof c.readIsolationScope, 'function')
  const scope = c.readIsolationScope({
    RDWEB_RECEIVER_ISOLATED_AUTHORIZE: 'rdweb-receiver-isolated-20261023-02',
  })
  const output = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      '/dev/null',
      '-p',
      scope.project,
      '-f',
      new URL('../docker/docker-compose.receiver-test.yml', import.meta.url).pathname,
      'config',
      '--format',
      'json',
    ],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        SECRET_KEY: 'public-contract-placeholder',
        VAULT_KEY: 'public-contract-placeholder',
        BOOTSTRAP_ADMIN_PASSWORD: 'public-contract-password',
        RDWEB_RECEIVER_SERVER_IMAGE: scope.images.server,
        RDWEB_RECEIVER_API_IMAGE: scope.images.api,
        RDWEB_RECEIVER_WEB_IMAGE: scope.images.web,
      },
    },
  )
  assert.equal(output.status, 0, output.stderr)
  const model = JSON.parse(output.stdout)
  assert.equal(model.name, scope.project)
  assert.equal(model.services.hbbs.image, scope.images.server)
  assert.equal(model.services.hbbr.image, scope.images.server)
  assert.equal(model.services.backend.image, scope.images.api)
  assert.equal(model.services.web.image, scope.images.web)
  assert.equal(model.services.ingress.image, scope.images.web)
  for (const item of [...Object.values(model.volumes), ...Object.values(model.networks)])
    assert.equal(item.name.startsWith('rdweb-receiver-isolated-20261023-02_'), true)
})
