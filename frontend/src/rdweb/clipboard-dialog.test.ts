import { expect, it, vi } from 'vitest'
import { ClipboardDialog } from './clipboard-dialog'
// 最小DOM ports，不新增jsdom或將公開fixture冒稱真clipboard支持。
function fixture() {
  const element = {
    open: false,
    showModal: vi.fn(
      /* 原生開框的可控port。 */ () => {
        element.open = true
      },
    ),
    close: vi.fn(
      /* 模擬同步close重入。 */ () => {
        element.open = false
        view.close()
      },
    ),
  }
  const text = { value: '', readOnly: false }
  const lease = {
      text: vi.fn(/* 公開fixture只留在private lease port。 */ () => 'public fallback'),
      close: vi.fn(),
    },
    issue = vi.fn()
  const view = new ClipboardDialog(
    element as unknown as HTMLDialogElement,
    text as HTMLTextAreaElement,
    lease,
    issue,
  )
  return { view, element, text, lease, issue }
}
// UI摘要決定readonly，實際文字由private lease短讀，重複tick不重開框。
it('shows private text only in the owned DOM and does not reopen an active dialog', () => {
  const f = fixture()
  f.view.update({ busy: false, receiving: false, fallback: 'copy' })
  expect(f.text.value).toBe('public fallback')
  expect(f.text.readOnly).toBe(true)
  expect(f.element.showModal).toHaveBeenCalledOnce()
  f.view.tick()
  f.view.tick()
  expect(f.element.showModal).toHaveBeenCalledOnce()
  f.view.update({ busy: false, receiving: false, fallback: 'send' })
  expect(f.text.readOnly).toBe(false)
  f.view.dispose()
})
// controller到期清lease時notify可在text()內重入；不得復活已清文字框。
it('does not reopen the dialog when reading the lease expires it reentrantly', () => {
  const f = fixture()
  f.lease.text.mockImplementationOnce(
    /* getter到期同步清UI。 */ () => {
      f.view.update({ busy: false, receiving: false, fallback: 'none' })
      return ''
    },
  )
  f.view.update({ busy: false, receiving: false, fallback: 'copy' })
  expect(f.element.showModal).not.toHaveBeenCalled()
  expect(f.text.value).toBe('')
  expect(f.element.open).toBe(false)
  f.view.dispose()
})
// close先清DOM，重入事件不再close lease兩次，disposed後不修改新文字。
it('clears owned DOM and closes the lease once on reentrant disposal', () => {
  const f = fixture()
  f.view.update({ busy: false, receiving: false, fallback: 'send' })
  f.view.close()
  expect(f.text.value).toBe('')
  expect(f.element.open).toBe(false)
  expect(f.lease.close).toHaveBeenCalledOnce()
  f.view.dispose()
  const count = f.lease.close.mock.calls.length
  f.view.dispose()
  f.view.update({ busy: false, receiving: false, fallback: 'copy' })
  f.view.tick()
  expect(f.text.value).toBe('')
  expect(f.lease.close).toHaveBeenCalledTimes(count)
})
// showModal原生錯誤只提示固定分類，不每100ms無限重試DOM或洩漏文字。
it('fails a native dialog open once with a fixed safe operation code', () => {
  const f = fixture()
  f.element.showModal.mockImplementationOnce(
    /* 原生例外不轉送內容。 */ () => {
      throw new Error('private native detail')
    },
  )
  f.view.update({ busy: false, receiving: false, fallback: 'copy' })
  f.view.tick()
  f.view.tick()
  expect(f.element.showModal).toHaveBeenCalledOnce()
  expect(f.issue).toHaveBeenCalledExactlyOnceWith('clipboard_unavailable')
  expect(f.text.value).toBe('')
  f.view.dispose()
})
