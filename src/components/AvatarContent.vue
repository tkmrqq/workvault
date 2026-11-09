<template>
  <img v-if="src && !broken" :src="src" class="av-img" alt="" draggable="false" loading="lazy" @error="broken = true" />
  <template v-else>{{ fallback }}</template>
</template>

<script setup>
// Содержимое аватара: картинка, если загружено фото, иначе эмодзи.
// Кружок/фон/размер задаёт родитель — компонент вставляется внутрь него.
import { computed, ref, watch } from 'vue'
import { avatarSrc, isImageAvatar } from '@/lib/avatar'

const props = defineProps({
  value: { type: String, default: '' },
  name:  { type: String, default: '' }
})
const broken = ref(false)
watch(() => props.value, () => { broken.value = false })

const src = computed(() => avatarSrc(props.value))
const initial = computed(() => props.name?.trim()?.[0]?.toUpperCase() || '')
const fallback = computed(() => isImageAvatar(props.value)
  ? (initial.value || '🙂')
  : (props.value || initial.value || '?'))
</script>
