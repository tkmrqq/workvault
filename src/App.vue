<template>
  <div :data-theme="store.theme">
    <router-view />
  </div>
</template>

<script setup>
import { useAppStore } from '@/stores/app'
const store = useAppStore()
</script>
