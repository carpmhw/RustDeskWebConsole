import { afterEach, expect, it, vi } from 'vitest'
import * as diagnostics from '../../e2e-real/input-diagnostics'
import { KeyboardInput } from './keyboard-input'

// 每案僅擁有自建window與crypto替身，不接觸OS剪貼簿。
function fixture() {
  vi.stubGlobal('window', {})
  expect(diagnostics.installKeyboardEmissionDiagnostics).toBeTypeOf('function')
  diagnostics.installKeyboardEmissionDiagnostics()
  const port = window.__rdwebKeyboardEmissionObserver!
  const sent: string[] = []
  const keyboard = new KeyboardInput(
    /* 真KeyboardInput提交保持同步。 */ (intent) => {
      if (intent.kind === 'text') sent.push(intent.text)
    },
    /* 本案不應出現產品提示。 */ () => {
      throw new Error('unexpected_issue')
    },
    port,
  )
  return { port, keyboard, sent }
}
// 復原診斷自有globals及clock，不跨案保留scope。
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// 真WebCrypto及Unicode案例抓住UTF-16長度、重編碼、順序與未移除原文等回歸。
it('records paired Unicode counts and real SHA-256 without retaining text', async () => {
  const { port, keyboard, sent } = fixture()
  port.begin('Public 中文😀')
  keyboard.beforeInput('insertText', 'Public 中文😀', false)
  expect(sent).toEqual(['Public 中文😀'])
  const result = await port.take()
  expect(result).toEqual({
    records: [
      {
        sequence: 1,
        eventId: 1,
        phase: 'before',
        type: 'insertText',
        composing: false,
        internalComposing: false,
        confirmed: 'null',
        codePoints: 10,
        utf8Bytes: 17,
        sha256: 'c450fafdb4843d2d27c85f10bc0f5a336f9f8c040bff780ebfd602decfa7aaf0',
      },
      {
        sequence: 2,
        eventId: 1,
        phase: 'after',
        type: 'insertText',
        composing: false,
        internalComposing: false,
        confirmed: 'null',
        codePoints: 10,
        utf8Bytes: 17,
        sha256: 'c450fafdb4843d2d27c85f10bc0f5a336f9f8c040bff780ebfd602decfa7aaf0',
      },
    ],
    overflow: false,
    hashUnavailable: false,
  })
  expect(JSON.stringify(result)).not.toContain('Public 中文😀')
  expect((await port.take()).records).toEqual([])
})

// 不啟用、非公開scope與結束後都不得計算文字雜湊。
it('does not collect or hash outside an explicitly enabled public scope', async () => {
  const { port, keyboard } = fixture()
  const digest = vi.spyOn(crypto.subtle, 'digest')
  keyboard.beforeInput('insertText', 'private input', false)
  expect((await port.take()).records).toEqual([])
  expect(() => port.begin('private scope')).toThrow('keyboard_emission_diagnostics_unavailable')
  keyboard.beforeInput('insertText', 'private input', false)
  expect(digest).not.toHaveBeenCalled()
  digest.mockRestore()
})

// 雜湊拒絕只留null及固定狀態，不把exception或文字寫入結果。
it('preserves synchronous emission when SHA-256 fails', async () => {
  const { port, keyboard, sent } = fixture()
  vi.stubGlobal('crypto', {
    subtle: {
      /* 僅模擬原生hash故障。 */ digest() {
        return Promise.reject(new Error('public_native_failure'))
      },
    },
  })
  port.begin('Public sample')
  keyboard.beforeInput('insertText', 'Public sample', false)
  expect(sent).toEqual(['Public sample'])
  const result = await port.take()
  expect(result.records.map(/* 只看摘要雜湊，不讀原文。 */ (record) => record.sha256)).toEqual([
    null,
    null,
  ])
  expect(result.hashUnavailable).toBe(true)
  expect(JSON.stringify(result)).not.toContain('public_native_failure')
})

// Native雜湊不回覆也不得阻塞輸入，取證等待有界且不回填逾時結果。
it('bounds diagnostic draining without awaiting hashing in the input path', async () => {
  vi.useFakeTimers()
  const { port, keyboard, sent } = fixture()
  const nativeCrypto = crypto
  let finishHash!: (hash: ArrayBuffer) => void
  const lateHash = new Promise<ArrayBuffer>(
    /* 控制原生hash晚到，不改產品輸入。 */ (resolve) => {
      finishHash = resolve
    },
  )
  vi.stubGlobal('crypto', {
    subtle: {
      /* 模擬deadline後才settle的唯一外部邊界。 */ digest() {
        return lateHash
      },
    },
  })
  port.begin('Public sample')
  keyboard.beforeInput('insertText', 'Public sample', false)
  expect(sent).toEqual(['Public sample'])
  const pending = port.take()
  await vi.advanceTimersByTimeAsync(2000)
  const result = await pending
  expect(result.records).toHaveLength(2)
  expect(result.hashUnavailable).toBe(true)
  vi.stubGlobal('crypto', nativeCrypto)
  port.begin('Public 中文😀')
  keyboard.beforeInput('insertText', 'Public 中文😀', false)
  finishHash(new Uint8Array(32).fill(0xab).buffer)
  const next = await port.take()
  expect(result.records.map(/* 已回傳快照不能被晚到hash改寫。 */ (row) => row.sha256)).toEqual([
    null,
    null,
  ])
  expect(next.records.map(/* 新scope只認自己的真hash。 */ (row) => row.sha256)).toEqual([
    'c450fafdb4843d2d27c85f10bc0f5a336f9f8c040bff780ebfd602decfa7aaf0',
    'c450fafdb4843d2d27c85f10bc0f5a336f9f8c040bff780ebfd602decfa7aaf0',
  ])
  expect(
    next.records.map(
      /* 每scope重新編sequence，但eventId保持同Keyboard單調遞增。 */ (row) => [
        row.sequence,
        row.eventId,
      ],
    ),
  ).toEqual([
    [1, 2],
    [2, 2],
  ])
  expect(next.hashUnavailable).toBe(false)
})

// 限制筆數與byte大小，不截斷或無界保存資料。
it('bounds record count without blocking emission', async () => {
  const { port, keyboard, sent } = fixture()
  port.begin('Public sample')
  for (let i = 0; i < 33; i++) keyboard.beforeInput('insertText', 'Public sample', false)
  const result = await port.take()
  expect(sent).toHaveLength(33)
  expect(result.records).toHaveLength(64)
  expect(result.records.at(-1)?.sequence).toBe(64)
  expect(result.overflow).toBe(true)
})

// UTF-16長度及UTF-8 byte額度分開拒絕，不雜湊超額文字或假造截斷紀錄。
it('rejects oversized UTF-16 and UTF-8 input from diagnostic storage', async () => {
  const { port } = fixture()
  const issues: string[] = []
  const keyboard = new KeyboardInput(
    /* 此案兩筆超額輸入都不應提交。 */ () => {
      throw new Error('unexpected_emit')
    },
    /* 原產品額度錯誤必須保持。 */ (issue) => {
      issues.push(issue)
    },
    port,
  )
  const digest = vi.spyOn(crypto.subtle, 'digest')
  try {
    for (const text of ['x'.repeat(4097), '中'.repeat(1366)]) {
      port.begin('Public size probe')
      keyboard.beforeInput('insertText', text, false)
      expect(await port.take()).toEqual({ records: [], overflow: true, hashUnavailable: false })
    }
    expect(issues).toEqual(['input_text_too_large', 'input_text_too_large'])
    expect(digest).not.toHaveBeenCalled()
  } finally {
    digest.mockRestore()
  }
})
