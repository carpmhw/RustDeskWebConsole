import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import { i18n } from './i18n'
import { router } from './router'
import { installUserInvalidSync } from './utils/userInvalid'
import './styles.css'

installUserInvalidSync(document)
createApp(App).use(createPinia()).use(i18n).use(router).mount('#app')
