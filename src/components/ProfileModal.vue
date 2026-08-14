<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal" :class="{ 'slide-in': mounted }">

        <button class="close-btn" @click="emit('close')" aria-label="Закрыть">
          <X :size="14" :stroke-width="2.5" />
        </button>

        <!-- ═══ Banner + Avatar (shared) ═══ -->
        <div class="banner" :class="'banner-' + (viewOnly ? (user.banner || 'violet') : (form.banner || 'violet'))">
          <div class="banner-pattern"></div>
        </div>

        <div class="identity-block">
          <div class="avatar-wrapper">
            <div class="avatar-ring" :style="{ background: (viewOnly ? user.color : form.color) + '26' }"></div>
            <div class="profile-avatar-big"
              :style="{
                background: (viewOnly ? user.color : form.color) + '1f',
                color: viewOnly ? user.color : form.color,
                borderColor: (viewOnly ? user.color : form.color) + '55'
              }">
              {{ viewOnly ? user.avatar : form.avatar }}
            </div>
            <span v-if="isOnline" class="status-dot" title="Онлайн"></span>
          </div>
        </div>

        <!-- ═══ Просмотр чужого профиля ═══ -->
        <div v-if="viewOnly" class="profile-view">
          <h2 class="profile-name" :style="{ color: user.color }">{{ user.name }}</h2>

          <p v-if="user.description" class="profile-desc">{{ user.description }}</p>
          <p v-else class="profile-desc empty">Пользователь пока ничего не рассказал о себе</p>

          <div class="meta-row">
            <Calendar :size="13" :stroke-width="2" />
            <span>В системе с {{ formatDate(user.created_at) }}</span>
          </div>
        </div>

        <!-- ═══ Редактирование своего профиля ═══ -->
        <div v-else class="profile-edit">
          <div class="edit-header">
            <h2>Настройки профиля</h2>
            <p class="edit-subtitle">Так тебя будут видеть другие участники</p>
          </div>

          <div class="field-group">
            <label>
              <Palette :size="14" :stroke-width="2" />
              Фон профиля
            </label>
            <div class="banner-row">
              <button v-for="b in banners" :key="b"
                class="banner-pick" :class="['banner-' + b, { active: form.banner === b }]"
                @click="form.banner = b" :title="bannerLabels[b]" :aria-label="bannerLabels[b]" />
            </div>
          </div>

          <div class="field-group">
            <label>
              <Smile :size="14" :stroke-width="2" />
              Аватар
            </label>
            <div class="avatar-row">
              <button v-for="a in avatars" :key="a"
                class="avatar-pick" :class="{ active: form.avatar === a }"
                @click="form.avatar = a">{{ a }}</button>
            </div>
          </div>

          <div class="field-group">
            <label>
              <Paintbrush :size="14" :stroke-width="2" />
              Цвет акцента
            </label>
            <div class="color-row">
              <button v-for="c in colors" :key="c"
                class="color-dot" :class="{ active: form.color === c }"
                :style="{ background: c, boxShadow: form.color === c ? `0 0 0 3px ${c}33` : 'none' }"
                @click="form.color = c" />
            </div>
          </div>

          <div class="field-group">
            <label>
              <Pencil :size="14" :stroke-width="2" />
              Имя
            </label>
            <input v-model="form.name" maxlength="24" class="field-input"
              :class="{ 'field-error': touched && !form.name?.trim() }"
              placeholder="Твоё имя..." @blur="touched = true" />
            <span v-if="touched && !form.name?.trim()" class="error-text">Имя не может быть пустым</span>
          </div>

          <div class="field-group">
            <label>
              <MessageCircle :size="14" :stroke-width="2" />
              О себе
            </label>
            <textarea v-model="form.description" maxlength="120" class="field-input field-textarea"
              placeholder="Пара слов о себе..." rows="3" />
            <span class="char-count" :class="{ warn: (form.description?.length || 0) > 100 }">
              {{ form.description?.length || 0 }}/120
            </span>
          </div>

          <div class="modal-footer">
            <button class="btn-ghost" @click="switchAccount" title="Сменить аккаунт">
              <RefreshCw :size="15" :stroke-width="2" />
            </button>
            <button class="btn-ghost btn-danger" @click="logout" title="Выйти">
              <LogOut :size="15" :stroke-width="2" />
            </button>

            <div class="footer-spacer"></div>

            <button class="btn-save" :disabled="saving || !form.name?.trim()" @click="save" title="Сохранить">
              <span v-if="saving" class="spinner"></span>
              <Check v-else :size="16" :stroke-width="2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import {
  X, Calendar, Palette, Smile, Paintbrush,
  Pencil, MessageCircle, RefreshCw, LogOut, Check
} from 'lucide-vue-next'

const props = defineProps({
  user:     { type: Object, required: true },
  viewOnly: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'updated'])

const store   = useAppStore()
const router  = useRouter()
const saving  = ref(false)
const mounted = ref(false)
const touched = ref(false)

const avatars = ['🧑','👩','👨','🧔','👩‍💻','👨‍💻','🦊','🐼','🐻','🐸','🤖','👾']
const colors  = ['#7c6af7','#4caf7d','#e8956d','#e06c75','#e8af34','#61afef','#c678dd','#56b6c2']
const banners = ['violet','forest','sunset','ocean','rose','mono']
const bannerLabels = {
  violet: 'Фиолетовый', forest: 'Лесной', sunset: 'Закат',
  ocean: 'Океан', rose: 'Розовый', mono: 'Монохром'
}

const form = reactive({
  name:        props.user.name,
  avatar:      props.user.avatar,
  color:       props.user.color,
  description: props.user.description || '',
  banner:      props.user.banner || 'violet'
})

// store.onlineList хранит { userId, userName, channelId } для каждого пользователя,
// онлайн-статус профиля не привязан к конкретному каналу — проверяем по всем записям
const isOnline = computed(() => {
  return store.onlineList?.some?.(u => u.userId === props.user.id) ?? false
})

onMounted(() => setTimeout(() => mounted.value = true, 10))

async function save() {
  touched.value = true
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
        description: form.description,
        banner:      form.banner
      })
    })
    const updated = await res.json()
    store.user = updated
    localStorage.setItem('wv-user', JSON.stringify(updated))
    const known = JSON.parse(localStorage.getItem('wv-known-users') || '[]')
    const idx = known.findIndex(u => u.id === updated.id)
    if (idx !== -1) { known[idx] = updated; localStorage.setItem('wv-known-users', JSON.stringify(known)) }
    emit('updated', updated)
    emit('close')
  } finally {
    saving.value = false
  }
}

function switchAccount() {
  store.logout()
  emit('close')
  router.push('/')
}

function logout() {
  if (!confirm('Выйти из аккаунта?')) return
  store.logout()
  emit('close')
  router.push('/')
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
  position: relative;
  width: min(440px, 100%);
  max-height: 88vh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  opacity: 0; transform: translateY(12px) scale(.98);
  transition: opacity .25s ease, transform .25s ease;
}
.modal::-webkit-scrollbar { display: none; }
.modal.slide-in { opacity: 1; transform: translateY(0) scale(1); }

.close-btn {
  position: absolute; top: var(--space-3); right: var(--space-3); z-index: 10;
  width: 30px; height: 30px; border-radius: var(--radius-full);
  color: #fff;
  background: oklch(0 0 0 / 0.28);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.close-btn:hover { background: oklch(0 0 0 / 0.45); transform: scale(1.06); }

/* ── Banner ── */
.banner {
  position: relative;
  height: 108px; width: 100%;
  overflow: hidden;
}
.banner-pattern {
  position: absolute; inset: 0;
  background-image: radial-gradient(circle at 20% 30%, oklch(1 0 0 / 0.14) 0, transparent 45%),
                     radial-gradient(circle at 80% 70%, oklch(1 0 0 / 0.10) 0, transparent 40%);
}
.banner-violet { background: linear-gradient(135deg, #6a5adf, #b968d4); }
.banner-forest { background: linear-gradient(135deg, #276549, #4caf7d); }
.banner-sunset { background: linear-gradient(135deg, #d97a4a, #e8af34); }
.banner-ocean  { background: linear-gradient(135deg, #235c85, #61afef); }
.banner-rose   { background: linear-gradient(135deg, #9c3b53, #e06c75); }
.banner-mono   { background: linear-gradient(135deg, #33333a, #6b6b73); }

/* ── Identity ── */
.identity-block {
  display: flex; justify-content: center;
  margin-top: -44px;
  position: relative; z-index: 2;
}
.avatar-wrapper { position: relative; }
.avatar-ring {
  position: absolute;
  width: 92px; height: 92px;
  border-radius: var(--radius-full);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 0;
}
.profile-avatar-big {
  position: relative; z-index: 1;
  width: 84px; height: 84px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 2.1rem;
  background: var(--surface);
  border: 3px solid var(--surface);
  box-shadow: var(--shadow-md);
  transition: all var(--transition);
}
.status-dot {
  position: absolute; bottom: 2px; right: 2px; z-index: 2;
  width: 16px; height: 16px; border-radius: var(--radius-full);
  background: #4caf7d;
  border: 3px solid var(--surface);
}

/* ── View mode ── */
.profile-view {
  padding: var(--space-4) var(--space-6) var(--space-8);
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
  text-align: center;
}
.profile-name { font-size: var(--text-lg); font-weight: 700; margin-top: var(--space-1); }
.profile-desc { font-size: var(--text-sm); color: var(--text-muted); max-width: 300px; line-height: 1.5; }
.profile-desc.empty { color: var(--text-faint); font-style: italic; }
.meta-row {
  display: flex; align-items: center; gap: var(--space-2);
  font-size: var(--text-xs); color: var(--text-faint);
  margin-top: var(--space-3); padding-top: var(--space-3);
  border-top: 1px solid var(--divider); width: 100%;
  justify-content: center;
}

/* ── Edit mode ── */
.profile-edit {
  padding: var(--space-4) var(--space-6) var(--space-6);
  display: flex; flex-direction: column; gap: var(--space-5);
}
.edit-header { text-align: center; margin-top: var(--space-1); }
.edit-header h2 { font-size: var(--text-base); font-weight: 700; }
.edit-subtitle { font-size: var(--text-xs); color: var(--text-faint); margin-top: 2px; }

.field-group { display: flex; flex-direction: column; gap: var(--space-2); }
.field-group label {
  display: flex; align-items: center; gap: 6px;
  font-size: var(--text-xs); font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .05em;
}
.field-group label svg { flex-shrink: 0; opacity: .85; }

.banner-row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.banner-pick {
  width: 44px; height: 26px; border-radius: var(--radius-sm);
  border: 2px solid transparent; transition: all var(--transition);
  position: relative;
}
.banner-pick:hover { transform: scale(1.08); }
.banner-pick.active { border-color: var(--text); box-shadow: var(--shadow-sm); }

.avatar-row { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.avatar-pick {
  width: 38px; height: 38px; border-radius: var(--radius-md); font-size: 1.15rem;
  border: 2px solid transparent; background: var(--surface-3);
  transition: all var(--transition);
}
.avatar-pick:hover { background: var(--hover); transform: translateY(-1px); }
.avatar-pick.active { border-color: var(--accent); background: var(--accent-soft); }

.color-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.color-dot {
  width: 24px; height: 24px; border-radius: var(--radius-full);
  border: 2px solid transparent; transition: transform var(--transition), border-color var(--transition);
}
.color-dot:hover { transform: scale(1.15); }
.color-dot.active { border-color: var(--text); transform: scale(1.18); }

.field-input {
  background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm); color: var(--text); width: 100%;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.field-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.field-input.field-error { border-color: #e06c75; }
.field-input.field-error:focus { box-shadow: 0 0 0 3px rgba(224,108,117,.15); }
.field-textarea { resize: vertical; min-height: 72px; font-family: inherit; }
.error-text { font-size: 11px; color: #e06c75; font-weight: 600; }
.char-count { font-size: 11px; color: var(--text-faint); text-align: right; }
.char-count.warn { color: #e8af34; font-weight: 600; }

/* ── Footer: единый ряд ── */
.modal-footer {
  display: flex; align-items: center; gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--divider);
}
.footer-spacer { flex: 1; }

.btn-ghost {
  display: flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: var(--radius-md);
  border: 1px solid var(--border); background: var(--surface-3); color: var(--text-muted);
  transition: all var(--transition);
  flex-shrink: 0;
}
.btn-ghost:hover { background: var(--hover); color: var(--text); }
.btn-ghost.btn-danger { color: #e06c75; background: rgba(224,108,117,.08); border-color: rgba(224,108,117,.2); }
.btn-ghost.btn-danger:hover { background: rgba(224,108,117,.16); }

.btn-save {
  display: flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: var(--radius-md);
  background: var(--accent); color: white; border: none;
  transition: all var(--transition);
  flex-shrink: 0;
}
.btn-save:hover:not(:disabled) { background: var(--accent-hover, var(--accent)); }
.btn-save:disabled { opacity: .45; cursor: not-allowed; }

.spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.4); border-top-color: #fff;
  animation: spin .6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .modal, .close-btn, .avatar-pick, .color-dot, .banner-pick, .spinner { transition: none; animation: none; }
}
</style>
