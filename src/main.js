import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import LoginView from './views/LoginView.vue'
import ChatView from './views/ChatView.vue'
import KanbanView from './views/KanbanView.vue'
import KanbanCardView from './views/KanbanCardView.vue'
import './assets/base.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: LoginView },
    { path: '/chat/:channelId?', component: ChatView, name: 'chat', meta: { requiresAuth: true } },
    { path: '/kanban', component: KanbanView, name: 'kanban', meta: { requiresAuth: true } },
    { path: '/kanban/:cardId', component: KanbanCardView, name: 'kanban-card', meta: { requiresAuth: true } }
  ]
})

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)

// Сессия живёт в httpOnly-куке — единственный способ узнать, залогинен ли
// человек, это спросить сервер. Делаем это один раз здесь, ДО того как
// роутер решит, куда вести (иначе на обновлении страницы человека на долю
// секунды кидало бы на логин, даже если сессия на самом деле жива).
import { useAppStore } from './stores/app'

router.beforeEach(async (to) => {
  const store = useAppStore()
  if (!store.sessionChecked) await store.checkSession()
  if (to.meta.requiresAuth && !store.user) return '/'
  if (to.path === '/' && store.user) return { name: 'chat' } // уже залогинен — логин-страницу смысла нет показывать
  return true
})

app.mount('#app')