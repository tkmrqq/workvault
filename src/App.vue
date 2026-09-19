<template>
  <div :data-theme="store.theme">
    <router-view />
    <ConfirmModal />
    <CommandPalette v-if="store.user" />
  </div>
</template>

<script setup>
import { useAppStore } from '@/stores/app'
import ConfirmModal from '@/components/ConfirmModal.vue'
import CommandPalette from '@/components/CommandPalette.vue'
const store = useAppStore()
</script>