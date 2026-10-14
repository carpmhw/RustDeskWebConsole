import { afterEach, expect, it, vi } from 'vitest'
import { hbb } from './codec'
import { WorkerClipboard } from './worker-clipboard'
import {
  observeIncomingClipboard,
  type IncomingClipboardObserver,
  type IncomingClipboardSnapshot,
} from './incoming-clipboard-observer'
import type { ClipboardReply } from './interaction-types'

const expected = 'Public 中文 RdWeb',
  tag = { revision: 1, request_id: 7 }
// 只恢復本案diagnostic decoder故障，不影響其他測試。
afterEach(() => vi.unstubAllGlobals())
// observer只保存測試自有布林DTO，測試不收真正raw text或payload。
function fixture(publicExpected: string | null = expected) {
  const rows: IncomingClipboardSnapshot[] = []
  const failed: boolean[] = []
  const observer: IncomingClipboardObserver = {
    // 公開fixture不來自任何remote／runtime秘密。
    expected: () => publicExpected,
    // 收下獨立布林供測試helper是否正確，不反射產品message。
    record: (value) => rows.push({ ...value }),
    // 故障分類不可回原生例外文字。
    unavailable: (_tag, overflow = false) => failed.push(overflow),
  }
  return { observer, rows, failed }
}
// 若比較移到原decoder後、改用字串normalize或把compressed硬比，都會失敗。
it.each([
  ['single exact', expected, false, true, true, false],
  ['single mismatch', 'Public other', false, true, false, false],
  ['BOM mismatch', '\uFEFF' + expected, false, true, false, false],
  ['empty', '', false, true, false, false],
  ['compressed opaque', 'Public invalid compressed bytes', true, false, false, false],
  ['multi exact', expected, false, true, true, true],
])(
  'reports only tagged primitive evidence before text decoding: %s',
  (_name, text, compressed, compared, exact, multi) => {
    const f = fixture(),
      content = new TextEncoder().encode(text)
    const clip = { content, compress: compressed }
    const message = hbb.Message.create(
      multi ? { multiClipboards: { clipboards: [{ format: 1 }, clip] } } : { clipboard: clip },
    )
    const original = new Uint8Array(content)
    observeIncomingClipboard(message, tag, f.observer)
    expect(f.rows).toEqual([
      {
        ...tag,
        observed: true,
        compressed,
        uncompressedCompared: compared,
        uncompressedExact: exact,
        overflow: false,
        unavailable: false,
      },
    ])
    expect(f.failed).toEqual([])
    expect(content).toEqual(original)
  },
)
// 未opt-in在message getter之前返回，不碰任意payload。
it.each([undefined, null])(
  'does not inspect message without an active expectation: %s',
  (value) => {
    const f = fixture(value === null ? null : expected)
    let reads = 0
    const message = {
      // 此getter只驗helper未啟用分支，不餵產品decoder。
      get clipboard() {
        reads++
        throw new Error('public_must_not_read')
      },
    } as unknown as hbb.Message
    observeIncomingClipboard(message, tag, value === undefined ? undefined : f.observer)
    expect(reads).toBe(0)
    expect(f.rows).toEqual([])
  },
)
// 非Text不得消費首次Text的觀察slot；ambiguous／非法形狀不能當有效mismatch。
it('ignores non-text and refuses ambiguous text or metadata', () => {
  const f = fixture()
  observeIncomingClipboard(hbb.Message.create({ clipboard: { format: 1 } }), tag, f.observer)
  expect(f.rows).toEqual([])
  expect(f.failed).toEqual([])
  for (const message of [
    { multiClipboards: { clipboards: [{}, {}] } },
    { clipboard: { width: 1 } },
    { clipboard: { specialName: 'Public denied' } },
    { multiClipboards: { clipboards: Array(9).fill({ format: 1 }) } },
  ])
    observeIncomingClipboard(hbb.Message.create(message), tag, f.observer)
  expect(f.rows).toEqual([])
  expect(f.failed).toEqual([false, false, false, true])
})
// 壓縮wire只受metadata界限，不解壓；raw32KiB／wire64KiB一超額即不可用。
it.each([
  [false, 32769],
  [true, 65537],
] as const)('bounds raw and compressed wire content: %s', (compress, length) => {
  const f = fixture()
  observeIncomingClipboard(
    hbb.Message.create({ clipboard: { compress, content: new Uint8Array(length) } }),
    tag,
    f.observer,
  )
  expect(f.failed).toEqual([true])
  expect(f.rows).toEqual([])
})
// 無效public expected不得拿去比，也不截斷或替換Unicode。
it.each([
  'Private value',
  'Public \0invalid',
  'Public \uD800invalid',
  'Public ' + '中'.repeat(2000),
])('refuses invalid expected fixtures: %#', (value) => {
  const f = fixture(value)
  observeIncomingClipboard(
    hbb.Message.create({ clipboard: { content: new Uint8Array([65]) } }),
    tag,
    f.observer,
  )
  expect(f.rows).toEqual([])
  expect(f.failed).toHaveLength(1)
})
// callback只能改獨立DTO；tag mutation也不能改active ownership或message。
it('isolates observer mutation and exceptions from real WorkerClipboard replies', () => {
  const f = fixture(),
    replies: ClipboardReply[] = [],
    bytes = new TextEncoder().encode(expected)
  const original = new Uint8Array(bytes)
  f.observer.expected = /* 破壞callback tag不能污染真正active。 */ (callbackTag) => {
    callbackTag.request_id = 999
    return expected
  }
  f.observer.record = /* 故障僅來自公開synthetic observer。 */ (value) => {
    f.rows.push({ ...value })
    value.request_id = 999
    value.uncompressedExact = false
    throw new Error('public_fault')
  }
  const clipboard = new WorkerClipboard(
    1,
    /* option提交使用原同步sender。 */ () => undefined,
    /* 收下正式產品reply，不讓diagnostic冒充資料。 */ (value) => replies.push(value),
    /* 固定公開測試clock。 */ () => 0,
    f.observer,
  )
  clipboard.pull(tag)
  clipboard.receive(hbb.Message.create({ clipboard: { content: bytes } }))
  expect(f.rows[0]).toMatchObject({ ...tag, uncompressedExact: true })
  expect(f.failed).toEqual([false])
  expect(replies).toEqual([{ type: 'clipboard-data', ...tag, bytes: original }])
  expect(bytes).toEqual(original)
  clipboard.dispose()
})
// true active gate之後才讀provider；過期／取消／未pull全部不碰觀察器。
it('reads a late-installed provider only for a live pull before the real decoder', () => {
  const f = fixture(),
    replies: ClipboardReply[] = []
  const holder: { observer?: IncomingClipboardObserver } = {}
  let calls = 0,
    now = 0
  const clipboard = new WorkerClipboard(
    1,
    /* 保留正式option順序。 */ () => undefined,
    /* 原reply只在decoder完成後回覆。 */ (value) => {
      expect(f.rows).toHaveLength(1)
      replies.push(value)
    },
    /* 逾時仍依產品clock驗證。 */ () => now,
    /* 同一已建立Worker可晚安裝provider。 */ () => {
      calls++
      return holder.observer
    },
  )
  const message = hbb.Message.create({ clipboard: { content: new TextEncoder().encode(expected) } })
  clipboard.receive(message)
  expect(calls).toBe(0)
  clipboard.pull(tag)
  holder.observer = f.observer
  clipboard.receive(message)
  expect(calls).toBe(1)
  expect(replies).toHaveLength(1)
  clipboard.pull({ revision: 1, request_id: 8 })
  clipboard.cancel({ revision: 1, request_id: 8 })
  now = 6000
  clipboard.receive(message)
  expect(calls).toBe(1)
  clipboard.dispose()
})
// provider自身拋錯也不能中斷產品解碼／transfer。
it('keeps product behavior when the observer provider throws', () => {
  const replies: ClipboardReply[] = []
  const clipboard = new WorkerClipboard(
    1,
    /* 同步sender無Windows副作用。 */ () => undefined,
    /* 拋diagnostic錯誤仍須有真正產品data。 */ (value) => replies.push(value),
    /* 使用原clock契約。 */ () => 0,
    /* synthetic provider fault，不能改產品錯誤碼。 */ () => {
      throw new Error('public_provider_fault')
    },
  )
  clipboard.pull(tag)
  expect(() =>
    clipboard.receive(
      hbb.Message.create({ clipboard: { content: new TextEncoder().encode(expected) } }),
    ),
  ).not.toThrow()
  expect(replies[0]?.type).toBe('clipboard-data')
  clipboard.dispose()
})
// 若以expected代填、在callback後改bytes、或不讀原content，本案decoder來源斷言會失敗。
it('decodes only exact uncompressed public content through the explicit text hook', () => {
  const f = fixture(),
    bytes = new TextEncoder().encode(expected),
    original = new Uint8Array(bytes)
  const decoded: Uint8Array[] = [],
    rows: unknown[] = [],
    Native = TextDecoder
  // 僅紀錄本案公開bytes的decoder輸入，不讀外部資料。
  vi.stubGlobal(
    'TextDecoder',
    class extends Native {
      // 真UTF8 decoder保留fatal與ignoreBOM語意。
      override decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string {
        expect(input).toBe(bytes)
        decoded.push(new Uint8Array(input as Uint8Array))
        return super.decode(input, options)
      }
    },
  )
  f.observer.recordText = /* 字串與獨立tag才可以給callback。 */ (localTag, text) => {
    rows.push({ ...localTag, text })
    localTag.request_id = 999
  }
  observeIncomingClipboard(hbb.Message.create({ clipboard: { content: bytes } }), tag, f.observer)
  expect(rows).toEqual([{ ...tag, text: 'Public 中文 RdWeb' }])
  expect(decoded).toHaveLength(1)
  expect(bytes).toEqual(original)
  expect(f.failed).toEqual([])
})
// 未明確opt-in、raw不相等或compressed均不得額外解碼或洩漏未知內容。
it.each(['off', 'mismatch', 'compressed'])('never decodes diagnostic text for %s', (mode) => {
  const f = fixture(),
    recordText = vi.fn()
  if (mode !== 'off') f.observer.recordText = recordText
  vi.stubGlobal(
    'TextDecoder',
    class {
      // 如果誤開diag decoder就作廢診斷，使本案FAIL。
      constructor() {
        throw new Error('public_must_not_decode')
      }
    },
  )
  observeIncomingClipboard(
    hbb.Message.create({
      clipboard: {
        content: new TextEncoder().encode(mode === 'mismatch' ? 'Public unknown' : expected),
        compress: mode === 'compressed',
      },
    }),
    tag,
    f.observer,
  )
  expect(recordText).not.toHaveBeenCalled()
  expect(f.failed).toEqual([])
  expect(f.rows).toHaveLength(1)
})
// 同一callback若僅繼承而非明確own opt-in，不應增加diag UTF8 decoder。
it('requires an own text hook and preserves the exact 4096-byte public boundary', () => {
  const publicText = 'Public ' + '中'.repeat(1363),
    f = fixture(publicText),
    texts: string[] = []
  Object.setPrototypeOf(f.observer, {
    recordText: /* 繼承callback不是opt-in。 */ () => {
      throw new Error('public_inherited_hook')
    },
  })
  const message = hbb.Message.create({
    clipboard: { content: new TextEncoder().encode(publicText) },
  })
  observeIncomingClipboard(message, tag, f.observer)
  expect(f.failed).toEqual([])
  f.observer.recordText = /* 明確own callback只接這個公開字串。 */ (_tag, text) => texts.push(text)
  observeIncomingClipboard(message, tag, f.observer)
  expect(texts).toEqual([publicText])
})
// 額外診斷decoder或callback失效，原WorkerClipboard的真正decoder／transfer仍照常。
it.each(['decoder', 'callback', 'wrong-decoded-value'])(
  'isolates %s text-observation faults from original replies',
  (mode) => {
    const f = fixture(),
      rows: string[] = [],
      replies: ClipboardReply[] = [],
      Native = TextDecoder
    let decodes = 0
    f.observer.recordText = /* 故障只能由本公開callback注入。 */ (_tag, text) => {
      if (mode === 'callback') throw new Error('public_callback_fault')
      rows.push(text)
    }
    if (mode !== 'callback')
      vi.stubGlobal(
        'TextDecoder',
        class extends Native {
          // 僅第一個diag decoder故障；第二個產品decoder完全保持原行為。
          override decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string {
            if (++decodes === 1) {
              if (mode === 'decoder') throw new Error('public_diag_decoder_fault')
              return 'Public unknown_from_decoder'
            }
            return super.decode(input, options)
          }
        },
      )
    const clipboard = new WorkerClipboard(
      1,
      /* 原sender不改option順序。 */ () => undefined,
      /* 真產品reply仍由原codec形成。 */ (reply) => replies.push(reply),
      /* 不延長任何產品期限。 */ () => 0,
      f.observer,
    )
    clipboard.pull(tag)
    clipboard.receive(
      hbb.Message.create({ clipboard: { content: new TextEncoder().encode(expected) } }),
    )
    expect(rows).toEqual([])
    expect(f.failed).toEqual([false])
    expect(replies).toEqual([
      { type: 'clipboard-data', ...tag, bytes: new TextEncoder().encode(expected) },
    ])
    clipboard.dispose()
  },
)
