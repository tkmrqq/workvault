<template>
  <div :data-theme="store.theme">
    <router-view />
    <ConfirmModal />
  </div>
</template>

<script setup>
import { useAppStore } from '@/stores/app'
import ConfirmModal from '@/components/ConfirmModal.vue'
const store = useAppStore()
</script>
