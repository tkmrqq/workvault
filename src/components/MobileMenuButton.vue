<template>
  <button class="mobile-menu-btn" @click="mobile.toggle()" title="Меню">
    <Menu :size="18" :stroke-width="2.2" />
  </button>
</template>

<script setup>
import { Menu } from 'lucide-vue-next'
import { useMobileSidebar } from '@/composables/useMobileSidebar'

const mobile = useMobileSidebar()
</script>

<style scoped>
.mobile-menu-btn {
  display: none; /* появляется только на узких экранах, см. брейкпоинт ниже */
  align-items: center; justify-content: center;
  width: 32px; height: 32px; flex-shrink: 0;
  border-radius: var(--radius-md); color: var(--text-muted);
  transition: background var(--transition), color var(--transition);
}
.mobile-menu-btn:hover { background: var(--hover); color: var(--text); }

@media (max-width: 860px) {
  .mobile-menu-btn { display: flex; }
}
</style>