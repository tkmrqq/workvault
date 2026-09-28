<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="edit-panel">
      <div class="ep-header">
        <span class="ep-title"><Settings :size="14" :stroke-width="2" /> Настройки</span>
        <button class="ep-close" @click="$emit('close')"><X :size="14" :stroke-width="2" /></button>
      </div>

      <div class="ep-tabs" role="tablist" aria-label="Разделы настроек">
        <button role="tab" :aria-selected="activeTab === 'general'" :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">Общие</button>
        <button role="tab" :aria-selected="activeTab === 'channels'" :class="{ active: activeTab === 'channels' }" @click="activeTab = 'channels'">Каналы</button>
      </div>

      <div v-if="activeTab === 'general'" class="ep-body settings-body">
        <section class="settings-section">
          <div class="settings-section-title">Интерфейс</div>
          <label class="setting-row">
            <span class="setting-icon"><Sparkles :size="16" /></span>
            <span class="setting-copy"><strong>Анимации интерфейса</strong><small>Карточки и появление сообщений</small></span>
            <input type="checkbox" :checked="uiPreferences.animationsEnabled" @change="setUiPreference('animationsEnabled', $event.target.checked)" />
            <span class="setting-switch"></span>
          </label>
          <label class="setting-row">
            <span class="setting-icon"><Sparkles :size="16" /></span>
            <span class="setting-copy"><strong>Плавное открытие окон</strong><small>Модальные окна, панели и меню</small></span>
            <input type="checkbox" :checked="uiPreferences.modalAnimationsEnabled" @change="setUiPreference('modalAnimationsEnabled', $event.target.checked)" />
            <span class="setting-switch"></span>
          </label>
        </section>

        <section class="settings-section">
          <div class="settings-section-title">Канбан</div>
          <label class="setting-row">
            <span class="setting-icon"><Volume2 v-if="uiPreferences.doneSoundEnabled" :size="16" /><VolumeX v-else :size="16" /></span>
            <span class="setting-copy"><strong>Звук завершения</strong><small>Короткий сигнал при переносе в «Готово»</small></span>
            <input type="checkbox" :checked="uiPreferences.doneSoundEnabled" @change="setUiPreference('doneSoundEnabled', $event.target.checked)" />
            <span class="setting-switch"></span>
          </label>
          <label class="setting-row">
            <span class="setting-icon"><Minimize2 v-if="uiPreferences.kanbanWide" :size="16" /><Maximize2 v-else :size="16" /></span>
            <span class="setting-copy"><strong>Растянуть колонки</strong><small>Заполнить доской всю ширину окна</small></span>
            <input type="checkbox" :checked="uiPreferences.kanbanWide" @change="setUiPreference('kanbanWide', $event.target.checked)" />
            <span class="setting-switch"></span>
          </label>
        </section>
      </div>

      <div v-else class="ep-body">
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

      <div v-if="activeTab === 'channels'" class="ep-footer">
        <button class="ep-btn" @click="$emit('close')">Отмена</button>
        <button class="ep-btn accent" :disabled="saving" @click="save">
          {{ saving ? 'Сохраняем...' : 'Сохранить' }}
        </button>
      </div>
      <div v-else class="ep-footer">
        <button class="ep-btn accent" @click="$emit('close')">Готово</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { Settings, X, Trash2, Plus, Sparkles, Volume2, VolumeX, Maximize2, Minimize2 } from 'lucide-vue-next'
import { setUiPreference, uiPreferences } from '@/composables/useUiPreferences'

const emit  = defineEmits(['close'])
const store = useAppStore()
const saving = ref(false)
const activeTab = ref('general')

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
  animation: settingsOverlayIn .22s ease both;
}
.edit-panel {
  width: 420px; max-height: 80vh;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column; overflow: hidden;
  animation: settingsPanelIn .26s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes settingsOverlayIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes settingsPanelIn { from { opacity: 0; transform: translateY(9px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
.ep-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--divider);
}
.ep-tabs {
  display: flex; gap: 5px;
  padding: 8px var(--space-5) 0;
  border-bottom: 1px solid var(--divider);
}
.ep-tabs button {
  padding: 8px 12px;
  border-bottom: 2px solid transparent;
  color: var(--text-muted); font-size: var(--text-xs); font-weight: 600;
}
.ep-tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
.ep-title { font-size: var(--text-sm); font-weight: 700; display: flex; align-items: center; gap: 6px; }
.ep-close {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); font-size: .8rem; color: var(--text-muted);
  transition: all var(--transition);
}
.ep-close:hover { background: var(--hover); }

.ep-body { flex: 1; overflow-y: auto; padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }
.settings-body { min-height: 240px; }
.settings-section { display: flex; flex-direction: column; gap: 6px; }
.settings-section-title { padding: 0 2px 3px; color: var(--text-faint); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.setting-row {
  position: relative;
  display: flex; align-items: center; gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  background: var(--surface-3); cursor: pointer;
}
.setting-icon { display: flex; color: var(--accent); }
.setting-copy { display: flex; flex: 1; flex-direction: column; gap: 2px; }
.setting-copy strong { color: var(--text); font-size: var(--text-xs); font-weight: 600; }
.setting-copy small { color: var(--text-faint); font-size: 10px; }
.setting-row input { position: absolute; opacity: 0; pointer-events: none; }
.setting-switch {
  position: relative; width: 32px; height: 18px; flex: 0 0 32px;
  border-radius: 999px; background: var(--surface);
  border: 1px solid var(--border); transition: background .18s ease, border-color .18s ease;
}
.setting-switch::after {
  content: ''; position: absolute; left: 2px; top: 2px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--text-faint); transition: transform .18s ease, background .18s ease;
}
.setting-row input:checked + .setting-switch { background: var(--accent-soft); border-color: var(--accent-line); }
.setting-row input:checked + .setting-switch::after { transform: translateX(14px); background: var(--accent); }
.setting-row input:focus-visible + .setting-switch { outline: 2px solid var(--accent); outline-offset: 2px; }

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
