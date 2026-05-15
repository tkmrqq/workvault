import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import LoginView from './views/LoginView.vue'
import ChatView from './views/ChatView.vue'
import './assets/base.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: LoginView },
    { path: '/chat/:channelId?', component: ChatView, name: 'chat' }
  ]
})

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')
