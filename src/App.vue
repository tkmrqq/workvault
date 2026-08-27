<template>
  <div :data-theme="store.theme">
    <router-view />
    <ConfirmModal />
    <CommandPalette />
  </div>
</template>

<script setup>
import { useAppStore } from '@/stores/app'
import ConfirmModal from '@/components/ConfirmModal.vue'
import CommandPalette from '@/components/CommandPalette.vue'
const store = useAppStore()
</script>