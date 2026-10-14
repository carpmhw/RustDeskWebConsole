import { afterEach, expect, it, vi } from 'vitest'
import { installInputDiagnostics } from '../../e2e-real/input-diagnostics'
// 原transport只配送本公開fixture，時間線不得保留原payload或改送出。
function fixture() {
  class Worker extends EventTarget {
    // 真observer仍包住原同步提交。
    postMessage(value: unknown): void {
      void value
    }
    // 只從本案回覆metadata，不讀外部Worker。
    reply(data: unknown): void {
      this.dispatchEvent(new MessageEvent('message', { data }))
    }
  }
  vi.stubGlobal('window', { Worker })
  vi.stubGlobal('navigator', {
    clipboard: { writeText: /* 假native API保留Promise。 */ () => Promise.resolve() },
  })
  installInputDiagnostics()
  const port = window.__rdwebInputDiagnostics!
  port.begin('Public test', false, true)
  const worker = new window.Worker('public') as unknown as Worker
  return { port, worker }
}
// 每案恢復自己的globals／clock。
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
// 缺時間線或讀payload getter／額外欄位，正負兩個情境會抓到。
it('captures only owned submit/ack/pull/data/native metadata in monotonic order', async () => {
  const { port, worker } = fixture()
  port.beginTimeline()
  worker.postMessage({
    type: 'input-batch',
    revision: 1,
    input_generation: 1,
    batch_id: 1,
    events: [{ kind: 'text', text: 'Public test', modifiers: [] }],
  })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  worker.reply({
    type: 'clipboard-data',
    revision: 1,
    request_id: 7,
    // 沒有payload opt-in，時間線不可碰bytes。
    get bytes() {
      throw new Error('public_must_not_read')
    },
  })
  await navigator.clipboard.writeText('Public other')
  const timeline = port.takeTimeline()
  expect(timeline.events.map(/* 只比固定事件標籤。 */ (row) => row.kind)).toEqual([
    'batch_submit',
    'batch_ack',
    'pull_submit',
    'clipboard_data',
    'native_write',
  ])
  expect(timeline.events[1]).toMatchObject({ batchId: 1, code: 'sent' })
  expect(
    timeline.events.every(
      /* 單一scope內不可倒序。 */ (row, i) =>
        row.tUs >= 0 && (!i || row.tUs >= timeline.events[i - 1]!.tUs),
    ),
  ).toBe(true)
  expect(JSON.stringify(timeline)).not.toContain('Public')
  expect(port.takeTimeline().events).toEqual([])
})
// default-off／begin換輪不能沿用舊timeline，超限標不完整而不截斷成正常。
it('does not collect by default and bounds explicit timelines', () => {
  const { port, worker } = fixture()
  worker.postMessage({ type: 'clipboard-pull', revision: 1, request_id: 7 })
  expect(port.takeTimeline().events).toEqual([])
  port.beginTimeline()
  for (let n = 1; n <= 129; n++)
    worker.postMessage({
      type: 'input-batch',
      revision: 1,
      input_generation: 1,
      batch_id: n,
      events: [],
    })
  expect(port.takeTimeline()).toMatchObject({ overflow: true })
  port.beginTimeline()
  port.begin()
  expect(port.takeTimeline().events).toEqual([])
})
// pointer edge的matching ACK也屬Main時間線，不得受原文字mask過濾；另一revision會停止當輪。
it('records all matching acknowledgements and stops on scope changes', () => {
  const { port, worker } = fixture()
  port.beginTimeline()
  worker.postMessage({
    type: 'input-batch',
    revision: 1,
    input_generation: 1,
    batch_id: 1,
    events: [{ kind: 'pointer', x: 1, y: 1 }],
  })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 999, sent: true })
  worker.postMessage({
    type: 'input-batch',
    revision: 2,
    input_generation: 1,
    batch_id: 2,
    events: [],
  })
  worker.postMessage({
    type: 'input-batch',
    revision: 2,
    input_generation: 1,
    batch_id: 3,
    events: [],
  })
  expect(port.takeTimeline()).toMatchObject({
    unavailable: true,
    events: [
      { kind: 'batch_submit', revision: 1 },
      { kind: 'batch_ack', batchId: 1 },
      { kind: 'terminal', code: 'unavailable' },
    ],
  })
})
// 取消與terminal關閉後晚到ACK／data不得恢复timeline；不保存任何真payload。
it('stops on cancellation and marks rollback unavailable', () => {
  const { port, worker } = fixture()
  port.beginTimeline()
  worker.postMessage({
    type: 'input-batch',
    revision: 1,
    input_generation: 1,
    batch_id: 1,
    events: [],
  })
  worker.reply({ type: 'disposed', revision: 1 })
  worker.reply({ type: 'input-ack', revision: 1, input_generation: 1, batch_id: 1, sent: true })
  expect(port.takeTimeline().events.map(/* 固定kind。 */ (row) => row.kind)).toEqual([
    'batch_submit',
    'terminal',
  ])
  vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(99)
  port.beginTimeline()
  worker.postMessage({
    type: 'input-batch',
    revision: 1,
    input_generation: 1,
    batch_id: 2,
    events: [],
  })
  expect(port.takeTimeline()).toMatchObject({ unavailable: true, events: [] })
  vi.restoreAllMocks()
})
