<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="edit-panel">
      <div class="ep-header">
        <span class="ep-title"><Settings :size="14" :stroke-width="2" /> Управление каналами</span>
        <button class="ep-close" @click="$emit('close')"><X :size="14" :stroke-width="2" /></button>
      </div>

      <div class="ep-body">
        <div v-for="(folder, fi) in draft" :key="fi" class="ef-folder">
          <div class="ef-folder-row">
            <input v-model="folder.icon" class="ef-mini" maxlength="4" placeholder="📁" />
            <input v-model="folder.name" class="ef-input" placeholder="Название папки" />
            <button class="ef-del" title="Удалить папку" @click="deleteFolder(fi)"><Trash2 :size="13" :stroke-width="2" /></button>
          </div>
          <div v-for="(ch, ci) in folder.channels" :key="ci" class="ef-ch-row">
            <input v-model="ch.icon" class="ef-mini" maxlength="4" placeholder="#" />
            <input v-model="ch.name" class="ef-input" placeholder="Канал" />
            <button class="ef-del" @click="deleteChannel(fi, ci)"><X :size="13" :stroke-width="2" /></button>
          </div>
          <button class="ef-add-ch" @click="addChannel(fi)"><Plus :size="12" :stroke-width="2.5" /> канал</button>
        </div>

        <button class="ef-add-folder" @click="addFolder"><Plus :size="13" :stroke-width="2.5" /> папка</button>
      </div>

      <div class="ep-footer">
        <button class="ep-btn" @click="$emit('close')">Отмена</button>
        <button class="ep-btn accent" :disabled="saving" @click="save">
          {{ saving ? 'Сохраняем...' : 'Сохранить' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { Settings, X, Trash2, Plus } from 'lucide-vue-next'

const emit  = defineEmits(['close'])
const store = useAppStore()
const saving = ref(false)

// Deep clone для редактирования
const draft = ref(JSON.parse(JSON.stringify(store.folders)))

function addFolder() {
  draft.value.push({ icon: '📁', name: 'Новая папка', channels: [] })
}
function deleteFolder(fi) { draft.value.splice(fi, 1) }
function addChannel(fi) {
  draft.value[fi].channels.push({ icon: '#', name: 'новый-канал' })
}
function deleteChannel(fi, ci) { draft.value[fi].channels.splice(ci, 1) }

async function save() {
  saving.value = true
  try {
    const res = await fetch('/api/folders/update', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(draft.value)
    })
    store.folders = await res.json()
    emit('close')
  } catch (e) {
    alert('Ошибка сохранения: ' + e.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center;
}
.edit-panel {
  width: 420px; max-height: 80vh;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column; overflow: hidden;
}
.ep-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--divider);
}
.ep-title { font-size: var(--text-sm); font-weight: 700; display: flex; align-items: center; gap: 6px; }
.ep-close {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); font-size: .8rem; color: var(--text-muted);
  transition: all var(--transition);
}
.ep-close:hover { background: var(--hover); }

.ep-body { flex: 1; overflow-y: auto; padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }

.ef-folder {
  background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: var(--space-3);
  display: flex; flex-direction: column; gap: var(--space-2);
}
.ef-folder-row, .ef-ch-row {
  display: flex; align-items: center; gap: var(--space-2);
}
.ef-ch-row { padding-left: var(--space-3); }
.ef-mini {
  width: 38px; text-align: center;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: var(--space-1);
  font-size: var(--text-xs); color: var(--text);
}
.ef-input {
  flex: 1;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs); color: var(--text);
}
.ef-input:focus, .ef-mini:focus { outline: none; border-color: var(--accent-line); }
.ef-del {
  font-size: .75rem; color: var(--text-faint); width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); transition: all var(--transition);
}
.ef-del:hover { background: rgba(224,108,117,.15); color: var(--red, #e06c75); }

.ef-add-ch {
  align-self: flex-start; font-size: 11px; color: var(--accent);
  padding: 2px var(--space-2); border-radius: var(--radius-md);
  display: flex; align-items: center; gap: 4px;
  transition: background var(--transition);
}
.ef-add-ch:hover { background: var(--accent-soft); }

.ef-add-folder {
  align-self: flex-start; font-size: var(--text-xs); font-weight: 600;
  color: var(--accent); padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--accent-line); border-radius: var(--radius-md);
  display: flex; align-items: center; gap: 6px;
  transition: all var(--transition);
}
.ef-add-folder:hover { background: var(--accent-soft); }

.ep-footer {
  display: flex; gap: var(--space-3); justify-content: flex-end;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--divider);
}
.ep-btn {
  font-size: var(--text-xs); font-weight: 600;
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-md);
  border: 1px solid var(--border); color: var(--text-muted);
  transition: all var(--transition);
}
.ep-btn:hover { background: var(--hover); color: var(--text); }
.ep-btn.accent { background: var(--accent); color: white; border-color: var(--accent); }
.ep-btn.accent:hover { background: var(--accent-hover); }
.ep-btn:disabled { opacity: .5; cursor: not-allowed; }
</style>