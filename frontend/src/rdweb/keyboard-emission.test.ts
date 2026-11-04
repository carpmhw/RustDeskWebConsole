import { expect, it } from 'vitest'
import { KeyboardInput, type KeyboardEmissionSnapshot } from './keyboard-input'
import type { InputIntent } from './interaction-types'

// 前後紀錄必須包住實際提交，並保存各時點狀態而非最後狀態。
it('observes before and after text emission without changing synchronous delivery', () => {
  const order: string[] = [],
    snapshots: KeyboardEmissionSnapshot[] = [],
    sent: InputIntent[] = []
  const keyboard = new KeyboardInput(
    /* 真正接收提交的 primitive，不等待診斷。 */ (intent) => {
      order.push('emit')
      sent.push(intent)
    },
    /* 此案不應發生產品錯誤。 */ () => {
      throw new Error('unexpected_issue')
    },
    {
      /* 被動保存時點資料，不保留原文。 */ record(snapshot) {
        order.push(snapshot.phase)
        snapshots.push(snapshot)
      },
    },
  )
  keyboard.compositionStart()
  keyboard.compositionEnd('Public previous')
  order.length = 0
  sent.length = 0
  keyboard.beforeInput('insertText', 'Public 中文😀', false)
  keyboard.beforeInput('insertFromComposition', 'Public second', false)
  expect(order).toEqual(['before', 'emit', 'after', 'before', 'emit', 'after'])
  expect(sent).toEqual([
    { kind: 'text', text: 'Public 中文😀', modifiers: [] },
    { kind: 'text', text: 'Public second', modifiers: [] },
  ])
  expect(snapshots).toEqual([
    {
      eventId: 1,
      phase: 'before',
      type: 'insertText',
      composing: false,
      internalComposing: false,
      confirmed: 'other',
    },
    {
      eventId: 1,
      phase: 'after',
      type: 'insertText',
      composing: false,
      internalComposing: false,
      confirmed: 'null',
    },
    {
      eventId: 2,
      phase: 'before',
      type: 'insertFromComposition',
      composing: false,
      internalComposing: false,
      confirmed: 'null',
    },
    {
      eventId: 2,
      phase: 'after',
      type: 'insertFromComposition',
      composing: false,
      internalComposing: false,
      confirmed: 'null',
    },
  ])
})

// 去重、組字中及不支援paste沒有呼叫emitText，因此不得假造前後紀錄。
it('does not report emissions for ignored input branches', () => {
  const snapshots: KeyboardEmissionSnapshot[] = []
  const keyboard = new KeyboardInput(
    /* 無需保存本案輸出。 */ () => {},
    /* 不應出錯。 */ () => {},
    {
      /* 只保存紀錄的固定欄位。 */ record(snapshot) {
        snapshots.push(snapshot)
      },
    },
  )
  keyboard.compositionStart()
  keyboard.beforeInput('insertText', 'Public composing', false)
  keyboard.compositionEnd('Public confirmed')
  keyboard.beforeInput('insertFromComposition', 'Public confirmed', false)
  keyboard.beforeInput('insertText', 'Public composing', true)
  keyboard.beforeInput('insertFromPaste', 'Public paste', false)
  keyboard.beforeInput('insertText', null, false)
  expect(snapshots).toEqual([])
})

// Observer前後皆拋錯，也不能阻斷、重送或改寫輸入。
it('isolates diagnostic failures from input delivery and product issues', () => {
  const sent: InputIntent[] = [],
    issues: string[] = []
  const keyboard = new KeyboardInput(
    /* 驗證真產品的輸出。 */ (intent) => {
      sent.push(intent)
    },
    /* 保存產品操作提示，不以mock成功代替行為。 */ (issue) => {
      issues.push(issue)
    },
    {
      /* 模擬唯一外部故障邊界。 */ record() {
        throw new Error('public_observer_failure')
      },
    },
  )
  keyboard.beforeInput('insertText', 'Public sample', false)
  expect(sent).toEqual([{ kind: 'text', text: 'Public sample', modifiers: [] }])
  expect(issues).toEqual([])
})
