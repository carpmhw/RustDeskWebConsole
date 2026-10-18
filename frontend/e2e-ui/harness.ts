import { createApp } from 'vue'
import { createPinia } from 'pinia'
import UiHarness from './UiHarness.vue'
import { i18n } from '../src/i18n'
import '../src/styles.css'

// 入口只掛公開元件與正式樣式，不載入app、auth、router或Protocol Worker。
createApp(UiHarness).use(createPinia()).use(i18n).mount('#app')
