<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="edit-panel">
      <div class="ep-header">
        <span class="ep-title"><Settings :size="14" :stroke-width="2" /> Настройки</span>
        <button class="ep-close" @click="$emit('close')"><X :size="14" :stroke-width="2" /></button>
      </div>

      <div class="ep-body settings-body">
        <section class="settings-section">
          <div class="settings-section-title">Оформление</div>
          <div class="setting-row static">
            <span class="setting-icon"><Moon v-if="store.theme === 'dark'" :size="16" /><Sun v-else :size="16" /></span>
            <span class="setting-copy"><strong>Тема</strong><small>Светлая или тёмная</small></span>
            <div class="seg" role="radiogroup" aria-label="Тема">
              <button role="radio" :aria-checked="store.theme === 'dark'" :class="{ active: store.theme === 'dark' }" @click="setTheme('dark')">Тёмная</button>
              <button role="radio" :aria-checked="store.theme === 'light'" :class="{ active: store.theme === 'light' }" @click="setTheme('light')">Светлая</button>
            </div>
          </div>
          <div class="setting-row static scheme-row">
            <span class="setting-icon"><Palette :size="16" /></span>
            <span class="setting-copy"><strong>Цветовая схема</strong><small>{{ currentSchemeName }}</small></span>
          </div>
          <div class="scheme-grid" role="radiogroup" aria-label="Цветовая схема">
            <button
              v-for="s in COLOR_SCHEMES" :key="s.id"
              class="scheme-chip" role="radio"
              :aria-checked="uiPreferences.colorScheme === s.id"
              :class="{ active: uiPreferences.colorScheme === s.id }"
              :data-scheme="s.id" :data-theme="store.theme"
              :title="s.name"
              @click="setUiPreference('colorScheme', s.id)"
            >
              <span class="scheme-preview">
                <span class="sp-bg"></span>
                <span class="sp-accent"></span>
                <Check v-if="uiPreferences.colorScheme === s.id" class="sp-check" :size="12" :stroke-width="3" />
              </span>
              <span class="scheme-name">{{ s.name }}</span>
            </button>
          </div>
        </section>

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

        <!-- Каналы теперь редактируются только в /admin (сервер всё равно пускал только админов) -->
        <section v-if="isAdmin" class="settings-section">
          <div class="settings-section-title">Администрирование</div>
          <a class="setting-row link" :href="adminUrl" target="_blank" rel="noopener">
            <span class="setting-icon"><Hash :size="16" /></span>
            <span class="setting-copy"><strong>Каналы и папки</strong><small>Переименование, порядок, удаление — в админке</small></span>
            <ExternalLink :size="14" class="link-ico" />
          </a>
        </section>
      </div>

      <div class="ep-footer">
        <button class="ep-btn accent" @click="$emit('close')">Готово</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { Settings, X, Sparkles, Volume2, VolumeX, Maximize2, Minimize2, Moon, Sun, Palette, Check, Hash, ExternalLink } from 'lucide-vue-next'
import { setUiPreference, uiPreferences, COLOR_SCHEMES } from '@/composables/useUiPreferences'
import { getApiBase } from '@/lib/apiBase'

defineEmits(['close'])
const store = useAppStore()

const isAdmin = computed(() => store.user?.role === 'admin')
const adminUrl = computed(() => `${getApiBase() || window.location.origin}/admin`)
const currentSchemeName = computed(() => COLOR_SCHEMES.find(s => s.id === uiPreferences.colorScheme)?.name || '')

function setTheme(t) {
  if (store.theme !== t) store.toggleTheme()
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
.ep-btn.accent { background: var(--accent); color: var(--on-accent, #fff); border-color: var(--accent); }
.ep-btn.accent:hover { background: var(--accent-hover); }
.ep-btn:disabled { opacity: .5; cursor: not-allowed; }

/* ── Оформление ── */
.setting-row.static { cursor: default; }
.setting-row.link { text-decoration: none; color: inherit; cursor: pointer; }
.setting-row.link:hover .link-ico { color: var(--accent); }
.link-ico { color: var(--text-faint); transition: color var(--transition); }
.seg { display: inline-flex; padding: 2px; border-radius: var(--radius-md); background: var(--surface-3); border: 1px solid var(--border); }
.seg button {
  border: none; background: none; color: var(--text-muted); cursor: pointer;
  font: inherit; font-size: var(--text-xs); font-weight: 600;
  padding: 4px 10px; border-radius: calc(var(--radius-md) - 2px);
  transition: background var(--transition), color var(--transition);
}
.seg button.active { background: var(--accent-soft); color: var(--accent); }
.scheme-row { margin-bottom: -2px; }
.scheme-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 0 2px 2px; }
.scheme-chip {
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 7px 4px 6px; border-radius: var(--radius-md);
  border: 1px solid var(--border); background: var(--surface-2); cursor: pointer;
  font: inherit; color: var(--text-muted);
  transition: border-color var(--transition), background var(--transition), transform var(--transition);
}
.scheme-chip:hover { border-color: var(--accent-line); transform: translateY(-1px); }
.scheme-chip.active { border-color: var(--accent); background: var(--accent-soft); color: var(--text); }
.scheme-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* Внутри чипа свои data-theme/data-scheme — превью рисуется цветами самой схемы */
.scheme-preview {
  position: relative; width: 100%; height: 26px; border-radius: var(--radius-sm);
  overflow: hidden; display: block; border: 1px solid var(--divider);
}
.sp-bg { position: absolute; inset: 0; background: linear-gradient(135deg, var(--surface) 0 55%, var(--surface-3) 55%); }
.sp-accent { position: absolute; left: 6px; bottom: 6px; width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.sp-check { position: absolute; right: 5px; top: 6px; color: var(--accent); }
.scheme-name { font-size: 10px; font-weight: 600; color: var(--text-muted); }
.scheme-chip.active .scheme-name { color: var(--text); }
</style>
