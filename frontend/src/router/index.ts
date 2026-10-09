import { createRouter, createWebHistory } from 'vue-router'
import { runtimeBase } from '../utils/basePath'
import { useAuthStore } from '../stores/auth'
import { routeDecision, safeNext, type AppRoute } from './policy'
import Login from '../views/Login.vue'
import Security from '../views/Security.vue'
import Overview from '../views/Overview.vue'
import Preferences from '../views/Preferences.vue'
import NotFound from '../views/NotFound.vue'
import Servers from '../views/Servers.vue'
import Targets from '../views/Targets.vue'
import Console from '../views/Console.vue'

export const router = createRouter({
  history: createWebHistory(runtimeBase() || '/'),
  routes: [
    { path: '/', name: 'overview', component: Overview, meta: { auth: true } },
    { path: '/login', name: 'login', component: Login },
    { path: '/security', name: 'security', component: Security, meta: { auth: true } },
    { path: '/preferences', name: 'preferences', component: Preferences, meta: { auth: true } },
    { path: '/servers', name: 'servers', component: Servers, meta: { auth: true } },
    { path: '/targets', name: 'targets', component: Targets, meta: { auth: true } },
    { path: '/console/:targetId', name: 'console', component: Console, meta: { auth: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound },
  ],
})

// 初始化完成前不誤判匿名；任何直接網址都套用同一MFA規則。
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (auth.phase === 'unknown') {
    try {
      await auth.restore()
    } catch (error) {
      auth.notice = auth.errorCode(error)
    }
  }
  const decision = routeDecision(
    { phase: auth.phase, user: auth.user },
    to.name as AppRoute,
    to.meta.auth === true,
  )
  if (decision)
    return { name: decision, query: decision === 'login' ? { next: safeNext(to.name) } : {} }
  return true
})
