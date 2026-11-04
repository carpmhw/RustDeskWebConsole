import { expect, it, vi } from 'vitest'
import { hbb, encodeMessage, decodeMessage } from './codec'
import { WorkerClipboard } from './worker-clipboard'
import type { ClipboardReply } from './interaction-types'
// 唯一同步 sender 收集公開 wire，不假造 MAC 或 native clipboard 支援。
function fixture() {
  let now = 0
  const wire: Uint8Array[] = [],
    replies: ClipboardReply[] = []
  // 提交時同步編碼，之後原 bytes 清除不影響已送 wire。
  const send = vi.fn((m: hbb.IMessage) => {
    wire.push(encodeMessage(m))
  })
  // fake transfer port 僅收 owned bytes，實際 browser transfer 另驗。
  const reply = vi.fn((r: ClipboardReply, t?: Transferable[]) => {
    if (r.type === 'clipboard-data') expect(t).toEqual([r.bytes.buffer])
    else expect(t).toBeUndefined()
    replies.push(r)
  })
  // 可控實際時間，不用 timer 呼叫次數冒充期限。
  const c = new WorkerClipboard(2, send, reply, () => now)
  return {
    c,
    send,
    reply,
    wire,
    replies,
    advance: /* 推進指定 deadline。 */ (n: number) => {
      now = n
    },
  }
}
// 僅 pull 才訂閱，無資料五秒也須關閉；取消確認不能因 timeout 競態遺失。
it('closes the subscription at its deadline and confirms a raced cancellation', () => {
  const f = fixture()
  expect(f.send).not.toHaveBeenCalled()
  f.c.pull({ revision: 2, request_id: 1 })
  expect(f.send).toHaveBeenCalledWith({ misc: { option: { disableClipboard: 1 } } })
  f.advance(5000)
  f.c.tick()
  expect(f.send).toHaveBeenLastCalledWith({ misc: { option: { disableClipboard: 2 } } })
  expect(f.reply).toHaveBeenLastCalledWith({
    type: 'clipboard-error',
    revision: 2,
    request_id: 1,
    code: 'clipboard_timeout',
  })
  f.c.cancel({ revision: 2, request_id: 1 })
  expect(f.reply).toHaveBeenLastCalledWith({
    type: 'clipboard-cancelled',
    revision: 2,
    request_id: 1,
  })
  expect(f.send).toHaveBeenCalledTimes(2)
  f.c.dispose()
  f.c.receive(hbb.Message.create({ clipboard: { content: new Uint8Array([65]) } }))
  expect(f.reply).toHaveBeenCalledTimes(2)
})
// permission keyboard 是 pull 條件，outbound 僅需 clipboard，不暗中升權。
it('keeps peer permission gates independent and closes on revocation', () => {
  const f = fixture()
  f.c.permission({ keyboard: false, clipboard: true })
  f.c.pull({ revision: 2, request_id: 1 })
  expect(f.send).not.toHaveBeenCalled()
  expect(f.reply).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'clipboard_unavailable' }),
  )
  const bytes = new Uint8Array([65])
  f.c.push({ revision: 2, request_id: 2 }, bytes)
  expect(bytes).toEqual(new Uint8Array([0]))
  expect(
    f.wire.map(
      /* 解碼公開wire驗真正的開關順序。 */ (wire) =>
        decodeMessage(wire).misc?.option?.disableClipboard,
    ),
  ).toEqual([1, undefined, 2])
  expect(decodeMessage(f.wire[1]!).multiClipboards?.clipboards?.[0]?.content).toEqual(
    new Uint8Array([65]),
  )
  expect(f.reply).toHaveBeenLastCalledWith({ type: 'clipboard-sent', revision: 2, request_id: 2 })
  f.c.permission({ keyboard: true, clipboard: true })
  f.c.pull({ revision: 2, request_id: 3 })
  f.c.permission({ keyboard: true, clipboard: false })
  expect(f.send).toHaveBeenLastCalledWith({ misc: { option: { disableClipboard: 2 } } })
  expect(f.reply).toHaveBeenLastCalledWith(
    expect.objectContaining({ request_id: 3, code: 'clipboard_unavailable' }),
  )
})
// 未開官方clipboard gate的outbound會被忽略；成功reply只能晚於關閉提交。
it('brackets one outbound text with enable and disable before reporting sent', () => {
  const f = fixture()
  const bytes = new Uint8Array([65])
  f.reply.mockImplementationOnce(
    /* 回覆時三筆必須已由原encoder送出。 */ () => {
      expect(f.wire).toHaveLength(3)
      expect(decodeMessage(f.wire[2]!).misc?.option?.disableClipboard).toBe(2)
    },
  )
  f.c.push({ revision: 2, request_id: 1 }, bytes)
  expect(
    f.wire.map(
      /* payload與options共用順序。 */ (wire) => decodeMessage(wire).misc?.option?.disableClipboard,
    ),
  ).toEqual([1, undefined, 2])
  expect(decodeMessage(f.wire[1]!).multiClipboards?.clipboards?.[0]?.content).toEqual(
    new Uint8Array([65]),
  )
  expect(f.reply).toHaveBeenCalledExactlyOnceWith({
    type: 'clipboard-sent',
    revision: 2,
    request_id: 1,
  })
  expect(bytes).toEqual(new Uint8Array([0]))
  f.advance(6000)
  f.c.tick()
  expect(f.send).toHaveBeenCalledTimes(3)
  f.c.pull({ revision: 2, request_id: 2 })
  expect(f.send).toHaveBeenCalledTimes(4)
  f.advance(11000)
  f.c.tick()
  expect(f.reply).toHaveBeenLastCalledWith({
    type: 'clipboard-error',
    revision: 2,
    request_id: 2,
    code: 'clipboard_timeout',
  })
})
// 三個邊界失敗均無假成功；開啟與文字失敗後仍有一次關閉嘗試。
it.each([0, 1, 2])('best-effort closes an outbound gate after sender failure %s', (failure) => {
  const f = fixture()
  let index = 0
  const attempted: Array<number | undefined> = []
  f.send.mockImplementation(
    /* 僅替換外部sender故障，保留真Worker流程。 */ (message: hbb.IMessage) => {
      attempted.push(message.misc?.option?.disableClipboard ?? undefined)
      if (index++ === failure) throw new Error('connection_failed')
    },
  )
  const bytes = new Uint8Array([65])
  expect(() => f.c.push({ revision: 2, request_id: 1 }, bytes)).toThrow('connection_failed')
  expect(attempted).toEqual(failure === 0 ? [1, 2] : [1, undefined, 2])
  expect(f.reply).not.toHaveBeenCalled()
  expect(bytes).toEqual(new Uint8Array([0]))
  f.c.dispose()
  expect(attempted).toHaveLength(failure === 0 ? 2 : 3)
})
// malformed bytes、被否定權限及舊scope都不得短暫開官方gate。
it.each(['denied', 'invalid', 'oversize', 'stale', 'closed', 'busy'] as const)(
  'does not open outbound gates for %s requests',
  (kind) => {
    const f = fixture()
    if (kind === 'denied') f.c.permission({ keyboard: true, clipboard: false })
    if (kind === 'closed') f.c.dispose()
    if (kind === 'busy') f.c.pull({ revision: 2, request_id: 1 })
    const bytes =
      kind === 'invalid'
        ? new Uint8Array([0])
        : new Uint8Array(kind === 'oversize' ? 33 * 1024 : 1).fill(65)
    const before = f.send.mock.calls.length
    f.c.push({ revision: kind === 'stale' ? 1 : 2, request_id: 2 }, bytes)
    expect(f.send).toHaveBeenCalledTimes(before)
    expect(bytes.every(/* 原owned資料在所有終態歸零。 */ (byte) => byte === 0)).toBe(true)
    if (kind === 'busy') {
      expect(f.reply).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'clipboard_busy' }))
      f.c.receive(hbb.Message.create({ clipboard: { content: new Uint8Array([66]) } }))
      expect(f.replies.at(-1)).toMatchObject({
        type: 'clipboard-data',
        request_id: 1,
        bytes: new Uint8Array([66]),
      })
    }
    f.c.dispose()
  },
)
// 無pull的unsolicited資料不解壓，即使gate短暫開啟也不轉送到Main。
it('ignores unsolicited clipboard while the outbound gate is enabled', () => {
  const f = fixture()
  let enabled = 0
  f.send.mockImplementation(
    /* 在外部送出No邊界模擬peer回傳，不mockdecoder結果。 */ (message: hbb.IMessage) => {
      f.wire.push(encodeMessage(message))
      if (message.misc?.option?.disableClipboard === 1) {
        enabled++
        f.c.receive(
          hbb.Message.create({ clipboard: { compress: true, content: new Uint8Array([255]) } }),
        )
      }
    },
  )
  f.c.push({ revision: 2, request_id: 1 }, new Uint8Array([65]))
  expect(enabled).toBe(1)
  expect(f.reply).toHaveBeenCalledExactlyOnceWith({
    type: 'clipboard-sent',
    revision: 2,
    request_id: 1,
  })
  f.c.receive(hbb.Message.create({ clipboard: { content: new Uint8Array([66]) } }))
  f.advance(6000)
  f.c.tick()
  expect(f.reply).toHaveBeenCalledTimes(1)
  expect(f.send).toHaveBeenCalledTimes(3)
})
// 結果 owned copy 在 option 關閉後才交付，原 plaintext 清除不會破壞結果。
it('transfers one owned snapshot and handles empty text without cached fallback', () => {
  const f = fixture(),
    source = new Uint8Array([65])
  f.c.pull({ revision: 2, request_id: 1 })
  f.c.receive(hbb.Message.create({ clipboard: { content: source } }))
  expect(f.send).toHaveBeenLastCalledWith({ misc: { option: { disableClipboard: 2 } } })
  source.fill(0)
  const first = f.replies.at(-1)!
  expect(first.type).toBe('clipboard-data')
  if (first.type !== 'clipboard-data') throw new Error('public_fixture_failed')
  expect(first.bytes).toEqual(new Uint8Array([65]))
  expect(f.reply).toHaveBeenLastCalledWith(first, [first.bytes.buffer])
  first.bytes.fill(0)
  f.c.pull({ revision: 2, request_id: 2 })
  f.c.receive(hbb.Message.create({ clipboard: {} }))
  expect(f.replies.at(-1)).toMatchObject({
    type: 'clipboard-data',
    request_id: 2,
    bytes: new Uint8Array(),
  })
})
// busy 不排 queue；非文字不解壓且等待有限，old cancel 不關新 request。
it('bounds concurrent requests and ignores non-text or late cancellation', () => {
  const f = fixture()
  f.c.pull({ revision: 2, request_id: 1 })
  f.c.pull({ revision: 2, request_id: 2 })
  expect(f.reply).toHaveBeenLastCalledWith(
    expect.objectContaining({ request_id: 2, code: 'clipboard_busy' }),
  )
  f.c.receive(
    hbb.Message.create({
      clipboard: { format: 1, compress: true, content: new Uint8Array([255]) },
    }),
  )
  expect(f.send).toHaveBeenCalledOnce()
  f.c.cancel({ revision: 2, request_id: 1 })
  f.c.pull({ revision: 2, request_id: 3 })
  f.c.cancel({ revision: 2, request_id: 1 })
  expect(f.send).toHaveBeenCalledTimes(3)
  f.c.receive(hbb.Message.create({ clipboard: { content: new Uint8Array([66]) } }))
  expect(f.replies.at(-1)).toMatchObject({ type: 'clipboard-data', request_id: 3 })
})
// 格式錯誤只回固定操作分類，wire protocol 與 sender／transfer 故障仍向外拋。
it('separates text errors from fatal send and transfer failures', () => {
  const f = fixture()
  f.c.pull({ revision: 2, request_id: 1 })
  f.c.receive(hbb.Message.create({ clipboard: { content: new Uint8Array([0]) } }))
  expect(f.reply).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'clipboard_invalid' }))
  f.c.pull({ revision: 2, request_id: 2 })
  f.reply.mockImplementationOnce(
    /* 模擬 transfer exception，但不輸出原生內容。 */ () => {
      throw new Error('connection_failed')
    },
  )
  // transfer 的例外不可被當成文字格式錯誤而繼續影像。
  expect(() =>
    f.c.receive(hbb.Message.create({ clipboard: { content: new Uint8Array([65]) } })),
  ).toThrow('connection_failed')
  const result = f.reply.mock.calls.at(-1)![0]
  if (result.type === 'clipboard-data') expect(result.bytes).toEqual(new Uint8Array([0]))
  const bytes = new Uint8Array([65])
  f.send.mockImplementationOnce(
    /* 模擬同一 socket sender 已關閉。 */ () => {
      throw new Error('connection_failed')
    },
  )
  // outbound 故障仍必須清原 bytes。
  expect(() => f.c.push({ revision: 2, request_id: 3 }, bytes)).toThrow('connection_failed')
  expect(bytes).toEqual(new Uint8Array([0]))
})
// 單次 request_id 精確遞增，stale owned outbound 無論是否採納都要清。
it('validates tags and cleans stale and disposed outbound bytes', () => {
  const f = fixture()
  const old = new Uint8Array([65])
  f.c.push({ revision: 1, request_id: 1 }, old)
  expect(old).toEqual(new Uint8Array([0]))
  expect(f.send).not.toHaveBeenCalled()
  f.c.pull({ revision: 2, request_id: 1 })
  // 重用 tag 不能變成另一個 active operation。
  expect(() => f.c.pull({ revision: 2, request_id: 1 })).toThrow('protocol_error')
  // 非精確 integer 不進入協定。
  expect(() => f.c.pull({ revision: 2, request_id: NaN })).toThrow('protocol_error')
  f.c.dispose()
  f.c.dispose()
  const bytes = new Uint8Array([65])
  f.c.push({ revision: 2, request_id: 2 }, bytes)
  expect(bytes).toEqual(new Uint8Array([0]))
  expect(f.send).toHaveBeenCalledTimes(2)
})

// nested wire 額度屬 protocol 終態，不能變成本次文字提示或成功 reply。
it('propagates protocol admission failures for the session owner to terminate', () => {
  const f = fixture()
  f.c.pull({ revision: 2, request_id: 1 })
  // nine entries 由純 codec 再守一次，正式 raw admission 已在 Task7 測。
  expect(() =>
    f.c.receive(
      hbb.Message.create({
        multiClipboards: {
          clipboards: Array.from({ length: 9 }, /* 公開 malformed fixture。 */ () => ({})),
        },
      }),
    ),
  ).toThrow('protocol_error')
  expect(f.reply).not.toHaveBeenCalled()
  f.c.dispose()
  expect(f.send).toHaveBeenLastCalledWith({ misc: { option: { disableClipboard: 2 } } })
})
