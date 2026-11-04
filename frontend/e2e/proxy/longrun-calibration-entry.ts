import { createApp } from 'vue'
import ConsoleView from '../../src/views/Console.vue'
import { calibration } from './longrun-calibration-ports'

const app = createApp(ConsoleView)
let failed = false
let sawConnectionFailure = false
// 獨立oracle只記固定code出現布林，不存DOM、原文或MutationRecord。
const observer = new MutationObserver((records) => {
  sawConnectionFailure ||= !!document.querySelector('[data-error-code="connection_failed"]')
  for (const record of records) {
    if (record.type === 'attributes' && record.oldValue === 'connection_failed')
      sawConnectionFailure = true
    for (const node of Array.from(record.removedNodes)) {
      if (
        node instanceof Element &&
        (node.matches('[data-error-code="connection_failed"]') ||
          node.querySelector('[data-error-code="connection_failed"]'))
      )
        sawConnectionFailure = true
    }
  }
})
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-error-code'],
  attributeOldValue: true,
})
app.config.errorHandler = /* 不回原始例外，只保留公開fixture失敗布林。 */ () => {
  failed = true
}
app.mount(document.body.appendChild(document.createElement('div')))
Object.assign(window, {
  publicLongrunCalibration: {
    ...calibration,
    failed: /* 讓Node在起跑前拒絕Vue吞掉例外的假空頁面。 */ () => failed,
    sawConnectionFailure: /* 僅回固定code曾出現布林，與正式page probe獨立。 */ () =>
      sawConnectionFailure,
    close: /* 卸載真Vue元件，清其ticker／observer及公開port。 */ () => {
      app.unmount()
      observer.disconnect()
    },
  },
})
