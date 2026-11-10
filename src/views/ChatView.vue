<template>
  <div class="chat-root">
    <TitleBar />
    <div class="chat-layout" :class="{ 'with-thread': threadVisible || !!store.threadParentId }">
      <Sidebar />
      <div class="chat-main">
        <ChannelHeader />
        <MessageList />
        <MessageInput />
      </div>
      <Transition name="thread-slide" @before-enter="threadVisible = true" @after-leave="threadVisible = false">
        <ThreadPanel v-if="store.threadParentId" />
      </Transition>
    </div>
    <UpdateBanner />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import TitleBar      from '@/components/TitleBar.vue'
import Sidebar       from '@/components/Sidebar.vue'
import ChannelHeader from '@/components/ChannelHeader.vue'
import MessageList   from '@/components/MessageList.vue'
import MessageInput  from '@/components/MessageInput.vue'
import UpdateBanner from '@/components/UpdateBanner.vue'
import ThreadPanel   from '@/components/ThreadPanel.vue'

const store  = useAppStore()
const route  = useRoute()
const router = useRouter()
// Держим третью колонку до конца leave-анимации, иначе панель «выпадает» из сетки
const threadVisible = ref(false)

onUnmounted(() => store.closeThread())

onMounted(async () => {
  if (!store.user) { router.push('/'); return }
  if (!store.folders.length) await store.fetchFolders()
  store.loadUsers()
  const id = Number(route.params.channelId) || store.allChannels[0]?.id
  if (id) store.setChannel(id)
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
})
</script>

<style scoped>
.chat-root {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
}
.chat-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.chat-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg);
}

.chat-layout.with-thread { grid-template-columns: 240px minmax(0, 1fr) clamp(320px, 30vw, 420px); }

/* Колонку под тред выделяем сразу (одна перекладка вместо анимации grid
   на каждом кадре — от неё лента и дёргалась), а сама панель мягко
   выезжает на transform/opacity, которые считаются на GPU */
.thread-slide-enter-active {
  transition: opacity .22s var(--ease-out, ease), transform .3s cubic-bezier(.22, 1, .36, 1);
  will-change: transform, opacity;
}
.thread-slide-leave-active {
  transition: opacity .14s ease, transform .18s ease;
  will-change: transform, opacity;
}
.thread-slide-enter-from { opacity: 0; transform: translateX(20px); }
.thread-slide-leave-to   { opacity: 0; transform: translateX(10px); }

@media (max-width: 860px) {
  .thread-slide-enter-active, .thread-slide-leave-active { transition: transform .3s cubic-bezier(.22, 1, .36, 1); }
  .thread-slide-enter-from, .thread-slide-leave-to { opacity: 1; transform: translateX(100%); }
  .chat-layout, .chat-layout.with-thread { grid-template-columns: 1fr; } /* сайдбар теперь fixed-drawer поверх, колонку под него не резервируем */
}
</style>