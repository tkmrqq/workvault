<template>
  <div :data-theme="store.theme" :data-scheme="uiPreferences.colorScheme">
    <router-view />
    <ConfirmModal />
    <CommandPalette v-if="store.user" />
    <ContextMenu />
  </div>
</template>

<script setup>
import { useAppStore } from '@/stores/app'
import ConfirmModal from '@/components/ConfirmModal.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import { uiPreferences } from '@/composables/useUiPreferences'
const store = useAppStore()
</script>