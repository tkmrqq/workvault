<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal" :class="{ 'slide-in': mounted }">
        <div class="modal-header">
          <h2>{{ viewOnly ? 'Профиль' : 'Настройки профиля' }}</h2>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>

        <!-- Просмотр чужого профиля -->
        <div v-if="viewOnly" class="profile-view">
          <div class="profile-avatar-big"
            :style="{ background: user.color + '22', color: user.color }">
            {{ user.avatar }}
          </div>
          <div class="profile-name" :style="{ color: user.color }">{{ user.name }}</div>
          <div v-if="user.description" class="profile-desc">{{ user.description }}</div>
          <div class="profile-meta">В системе с {{ formatDate(user.created_at) }}</div>
        </div>

        <!-- Редактирование своего профиля -->
        <div v-else class="profile-edit">
          <div class="profile-avatar-big"
            :style="{ background: form.color + '22', color: form.color }">
            {{ form.avatar }}
          </div>

          <div class="field-group">
            <label>Аватар</label>
            <div class="avatar-row">
              <button v-for="a in avatars" :key="a"
                class="avatar-pick" :class="{ active: form.avatar === a }"
                @click="form.avatar = a">{{ a }}</button>
            </div>
          </div>

          <div class="field-group">
            <label>Цвет</label>
            <div class="color-row">
              <button v-for="c in colors" :key="c"
                class="color-dot" :class="{ active: form.color === c }"
                :style="{ background: c }"
                @click="form.color = c" />
            </div>
          </div>

          <div class="field-group">
            <label>Имя</label>
            <input v-model="form.name" maxlength="24" class="field-input"
              placeholder="Твоё имя..." />
          </div>

          <div class="field-group">
            <label>О себе</label>
            <textarea v-model="form.description" maxlength="120" class="field-input field-textarea"
              placeholder="Пара слов о себе..." />
            <span class="char-count">{{ form.description?.length || 0 }}/120</span>
          </div>

          <div class="modal-footer">
            <button class="btn-switch" @click="switchAccount">Сменить аккаунт</button>
            <button class="btn-logout" @click="logout">Выйти</button>
            <div class="modal-footer-actions">
              <button class="btn-cancel" @click="emit('close')">Отмена</button>
              <button class="btn-save" :disabled="saving || !form.name?.trim()" @click="save">
                {{ saving ? 'Сохраняем...' : 'Сохранить' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const props = defineProps({
  user:     { type: Object, required: true },
  viewOnly: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'updated'])

const store   = useAppStore()
const saving  = ref(false)
const mounted = ref(false)

const avatars = ['🧑','👩','👨','🧔','👩‍💻','👨‍💻','🦊','🐼','🐻','🐸','🤖','👾']
const colors  = ['#7c6af7','#4caf7d','#e8956d','#e06c75','#e8af34','#61afef','#c678dd','#56b6c2']

const form = reactive({
  name:        props.user.name,
  avatar:      props.user.avatar,
  color:       props.user.color,
  description: props.user.description || ''
})

onMounted(() => setTimeout(() => mounted.value = true, 10))

async function save() {
  if (!form.name?.trim() || saving.value) return
  saving.value = true
  try {
    const API = import.meta.env.VITE_API_URL || ''
    const res = await fetch(`${API}/api/users/${props.user.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:        form.name.trim(),
        avatar:      form.avatar,
        color:       form.color,
        description: form.description
      })
    })
    const updated = await res.json()
    // Обновляем текущего юзера в store
    store.user = updated
    localStorage.setItem('wv-user', JSON.stringify(updated))
    // Обновляем в списке устройства
    const known = JSON.parse(localStorage.getItem('wv-known-users') || '[]')
    const idx = known.findIndex(u => u.id === updated.id)
    if (idx !== -1) { known[idx] = updated; localStorage.setItem('wv-known-users', JSON.stringify(known)) }
    emit('updated', updated)
    emit('close')
  } finally {
    saving.value = false
  }
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: oklch(0 0 0 / 0.6);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4);
  backdrop-filter: blur(4px);
}
.modal {
  width: min(420px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  opacity: 0; transform: translateY(12px) scale(.98);
  transition: opacity .25s ease, transform .25s ease;
}
.modal.slide-in { opacity: 1; transform: translateY(0) scale(1); }

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-5) var(--space-6) var(--space-4);
  border-bottom: 1px solid var(--divider);
}
.modal-header h2 { font-size: var(--text-base); font-weight: 700; }
.close-btn {
  width: 28px; height: 28px; border-radius: var(--radius-md);
  font-size: 12px; color: var(--text-faint);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.close-btn:hover { background: var(--hover); color: var(--text); }

.profile-view, .profile-edit {
  padding: var(--space-6);
  display: flex; flex-direction: column; align-items: center; gap: var(--space-4);
}
.profile-edit { align-items: stretch; }

.profile-avatar-big {
  width: 72px; height: 72px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; align-self: center;
  transition: all var(--transition);
}
.profile-name { font-size: var(--text-lg); font-weight: 700; }
.profile-desc { font-size: var(--text-sm); color: var(--text-muted); text-align: center; max-width: 280px; }
.profile-meta { font-size: var(--text-xs); color: var(--text-faint); }

.field-group { display: flex; flex-direction: column; gap: var(--space-2); }
.field-group label { font-size: var(--text-xs); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }

.avatar-row { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.avatar-pick {
  width: 36px; height: 36px; border-radius: var(--radius-md); font-size: 1.1rem;
  border: 2px solid transparent; background: var(--surface-3);
  transition: all var(--transition);
}
.avatar-pick:hover { background: var(--hover); }
.avatar-pick.active { border-color: var(--accent); background: var(--accent-soft); }

.color-row { display: flex; gap: var(--space-2); }
.color-dot {
  width: 22px; height: 22px; border-radius: var(--radius-full);
  border: 2px solid transparent; transition: transform var(--transition), border-color var(--transition);
}
.color-dot:hover { transform: scale(1.15); }
.color-dot.active { border-color: var(--text); transform: scale(1.2); }

.field-input {
  background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm); color: var(--text); width: 100%;
  transition: border-color var(--transition);
}
.field-input:focus { outline: none; border-color: var(--accent-line, var(--accent)); }
.field-textarea { resize: vertical; min-height: 80px; font-family: inherit; }
.char-count { font-size: 11px; color: var(--text-faint); text-align: right; }

.modal-footer {
  display: flex; gap: var(--space-3); justify-content: flex-end;
  padding-top: var(--space-2);
}
.btn-cancel {
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-md);
  font-size: var(--text-sm); color: var(--text-muted);
  border: 1px solid var(--border); transition: all var(--transition);
}
.btn-cancel:hover { background: var(--hover); color: var(--text); }
.btn-save {
  padding: var(--space-2) var(--space-5); border-radius: var(--radius-md);
  font-size: var(--text-sm); font-weight: 700;
  background: var(--accent); color: white;
  transition: all var(--transition);
}
.btn-save:hover:not(:disabled) { background: var(--accent-hover, var(--accent)); }
.btn-save:disabled { opacity: .45; cursor: not-allowed; }
</style>