<template>
  <div class="chat-root">
    <TitleBar />
    <div class="chat-layout">
      <Sidebar />
      <div class="chat-main">
        <ChannelHeader />
        <MessageList />
        <MessageInput />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import TitleBar      from '@/components/TitleBar.vue'
import Sidebar       from '@/components/Sidebar.vue'
import ChannelHeader from '@/components/ChannelHeader.vue'
import MessageList   from '@/components/MessageList.vue'
import MessageInput  from '@/components/MessageInput.vue'

const store  = useAppStore()
const route  = useRoute()
const router = useRouter()

onMounted(async () => {
  if (!store.user) { router.push('/'); return }
  if (!store.folders.length) await store.fetchFolders()
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
</style>
