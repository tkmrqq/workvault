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
            <span v-if="activeStatus?.emoji" class="avatar-status" :title="activeStatus.text">{{ activeStatus.emoji }}</span>
          </div>
        </div>

        <!-- ═══ Просмотр чужого профиля ═══ -->
        <div v-if="viewOnly" class="profile-view">
          <h2 class="profile-name" :style="{ color: user.color }">{{ user.name }}</h2>
          <p v-if="user.title" class="profile-title">{{ user.title }}</p>
          <div v-if="activeStatus" class="status-pill">
            <span>{{ activeStatus.emoji || '💬' }}</span>
            <span v-if="activeStatus.text" class="sp-text">{{ activeStatus.text }}</span>
            <span v-if="activeStatus.until" class="sp-until">до {{ activeStatus.until }}</span>
          </div>

          <p v-if="user.description" class="profile-desc">{{ user.description }}</p>
          <p v-else class="profile-desc empty">Пользователь пока ничего не рассказал о себе</p>

          <div class="meta-row">
            <Calendar :size="13" :stroke-width="2" />
            <span>В системе с {{ formatDate(user.created_at) }}</span>
          </div>
          <div v-if="localTime" class="meta-row">
            <Clock :size="13" :stroke-width="2" />
            <span>Местное время {{ localTime.time }}<template v-if="localTime.diff"> · {{ localTime.diff }}</template></span>
          </div>
          <div v-if="stats?.last_message_at" class="meta-row faint">
            <MessageSquare :size="13" :stroke-width="2" />
            <span>Последнее сообщение {{ relTime(stats.last_message_at) }}</span>
          </div>

          <div v-if="stats" class="stats-grid">
            <div class="stat"><b>{{ stats.messages }}</b><span>{{ plural(stats.messages, ['сообщение', 'сообщения', 'сообщений']) }}</span></div>
            <div class="stat"><b>{{ stats.tasks_open }}</b><span>задач в работе</span></div>
            <div class="stat"><b>{{ stats.tasks_done }}</b><span>закрыто</span></div>
          </div>

          <div v-if="user.id !== store.user?.id" class="profile-actions">
            <button type="button" class="pa-btn" @click="mention">
              <AtSign :size="14" :stroke-width="2" /> Упомянуть
            </button>
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
              <Smile :size="14" :stroke-width="2" />
              Статус
            </label>
            <div class="status-row">
              <button type="button" class="status-emoji-btn" :class="{ empty: !form.status_emoji }"
                @click="emojiOpen = !emojiOpen" title="Выбрать эмодзи">{{ form.status_emoji || '🙂' }}</button>
              <input v-model="form.status_text" maxlength="80" class="field-input" placeholder="Что у тебя сейчас?" />
              <button v-if="form.status_text || form.status_emoji" type="button" class="status-clear"
                @click="clearStatus" title="Сбросить статус">
                <X :size="13" :stroke-width="2.5" />
              </button>
            </div>
            <div v-if="emojiOpen" class="status-emojis">
              <button v-for="e in STATUS_EMOJIS" :key="e" type="button"
                :class="{ active: form.status_emoji === e }"
                @click="form.status_emoji = e; emojiOpen = false">{{ e }}</button>
            </div>
            <div class="status-presets">
              <button v-for="p in STATUS_PRESETS" :key="p.text" type="button" class="preset"
                @click="applyPreset(p)">{{ p.emoji }} {{ p.text }}</button>
            </div>
            <div v-if="form.status_text || form.status_emoji" class="status-until">
              <span>Сбросить</span>
              <select v-model="form.until" class="field-input field-select">
                <option v-for="o in untilOptions" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
              </select>
            </div>
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
              <Briefcase :size="14" :stroke-width="2" />
              Должность
            </label>
            <input v-model="form.title" maxlength="40" class="field-input" placeholder="Например, дизайнер" />
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

          <div class="field-group">
            <label>
              <Globe :size="14" :stroke-width="2" />
              Часовой пояс
            </label>
            <select v-model="form.timezone" class="field-input field-select">
              <option v-for="o in tzOptions" :key="o.tz" :value="o.tz">{{ o.label }}</option>
            </select>
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
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { getApiBase } from '@/lib/apiBase'
import { confirmDialog } from '@/composables/useConfirm'
import {
  X, Calendar, Palette, Smile, Paintbrush,
  Pencil, MessageCircle, RefreshCw, LogOut, Check,
  Briefcase, Clock, Globe, AtSign, MessageSquare
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
  banner:      props.user.banner || 'violet',
  title:        props.user.title || '',
  timezone:     props.user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  status_emoji: props.user.status_emoji || '',
  status_text:  props.user.status_text || '',
  until:        props.user.status_until ? 'keep' : ''
})

// store.onlineList хранит { userId, userName, channelId } для каждого пользователя,
// онлайн-статус профиля не привязан к конкретному каналу — проверяем по всем записям
const isOnline = computed(() => {
  return store.onlineList?.some?.(u => u.userId === props.user.id) ?? false
})

onMounted(() => setTimeout(() => mounted.value = true, 10))

// ── Статус ──
const STATUS_EMOJIS = ['💬', '📅', '🎯', '🚌', '🍽️', '🤒', '🌴', '🏠', '🎧', '☕', '🔥', '✅']
const STATUS_PRESETS = [
  { emoji: '📅', text: 'На встрече',          until: '1h' },
  { emoji: '🎯', text: 'Фокус, не отвлекать', until: '4h' },
  { emoji: '🚌', text: 'В пути',              until: '1h' },
  { emoji: '🍽️', text: 'Обед',                until: '1h' },
  { emoji: '🤒', text: 'Болею',               until: 'today' },
  { emoji: '🌴', text: 'В отпуске',           until: 'week' },
]
const emojiOpen = ref(false)
const now = ref(Date.now())
const tick = setInterval(() => { now.value = Date.now() }, 30000)
onUnmounted(() => clearInterval(tick))

function fmtUntil(ts) {
  const d = new Date(ts * 1000)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const untilOptions = computed(() => {
  const opts = [['', 'Не сбрасывать'], ['1h', 'Через час'], ['4h', 'Через 4 часа'], ['today', 'В конце дня'], ['week', 'Через неделю']]
  if (props.user.status_until) opts.unshift(['keep', 'Как сейчас — до ' + fmtUntil(props.user.status_until)])
  return opts
})
function untilTs(opt) {
  const s = Math.floor(Date.now() / 1000)
  if (opt === 'keep')  return props.user.status_until || null
  if (opt === '1h')    return s + 3600
  if (opt === '4h')    return s + 4 * 3600
  if (opt === 'week')  return s + 7 * 86400
  if (opt === 'today') { const d = new Date(); d.setHours(23, 59, 0, 0); return Math.floor(d.getTime() / 1000) }
  return null
}
function applyPreset(p) { form.status_emoji = p.emoji; form.status_text = p.text; form.until = p.until; emojiOpen.value = false }
function clearStatus()  { form.status_emoji = ''; form.status_text = ''; form.until = '' }

const activeStatus = computed(() => {
  const u = props.user
  if (!u || !(u.status_text || u.status_emoji)) return null
  if (u.status_until && u.status_until * 1000 < now.value) return null
  return { emoji: u.status_emoji, text: u.status_text || '', until: u.status_until ? fmtUntil(u.status_until) : '' }
})

// ── Часовой пояс и местное время ──
const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone
function tzOffsetMin(tz, d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(d)
    const g = t => Number(parts.find(p => p.type === t).value)
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
    return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000)
  } catch { return null }
}
const tzOptions = computed(() => {
  if (props.viewOnly) return []
  let list = []
  try { list = Intl.supportedValuesOf('timeZone') } catch { }
  if (!list.length) list = ['Europe/Minsk', 'Europe/Moscow', 'Europe/Kyiv', 'Europe/Warsaw', 'Europe/Berlin', 'Europe/London', 'Asia/Almaty', 'Asia/Tbilisi', 'America/New_York', 'UTC']
  if (!list.includes(form.timezone)) list = [form.timezone, ...list]
  return list.map(tz => {
    const m = tzOffsetMin(tz)
    if (m == null) return { tz, label: tz }
    const a = Math.abs(m)
    const off = (m >= 0 ? '+' : '−') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0')
    return { tz, label: 'UTC' + off + ' · ' + tz.replace(/_/g, ' ') }
  })
})
const localTime = computed(() => {
  const tz = props.user?.timezone
  if (!tz) return null
  const d = new Date(now.value)
  let time
  try { time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: tz }) } catch { return null }
  let diff = ''
  const a = tzOffsetMin(tz, d), b = tzOffsetMin(myTz, d)
  if (a != null && b != null && a !== b && props.user.id !== store.user?.id) {
    const h = (a - b) / 60
    diff = (h > 0 ? '+' : '−') + String(Math.abs(h)).replace('.', ',') + ' ч от тебя'
  }
  return { time, diff }
})

// ── Статистика ──
const stats = ref(null)
onMounted(async () => {
  if (!props.viewOnly || !props.user?.id) return
  try {
    const r = await fetch(`${getApiBase()}/api/users/${props.user.id}/stats`)
    if (r.ok) stats.value = await r.json()
  } catch { /* офлайн — просто без статистики */ }
})
function plural(n, f) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return f[2]
  if (b > 1 && b < 5) return f[1]
  if (b === 1) return f[0]
  return f[2]
}
function relTime(ts) {
  const d = new Date(ts * 1000)
  const t = new Date()
  const start = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  if (d.getTime() >= start) return 'сегодня в ' + time
  if (d.getTime() >= start - 86400000) return 'вчера в ' + time
  return formatDate(ts)
}
function mention() {
  store.insertIntoComposer('@' + props.user.name + ' ', null)
  emit('close')
}

async function save() {
  touched.value = true
  if (!form.name?.trim() || saving.value) return
  saving.value = true
  try {
    const API = getApiBase()
    const res = await fetch(`${API}/api/users/${props.user.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:        form.name.trim(),
        avatar:      form.avatar,
        color:       form.color,
        description: form.description,
        banner:      form.banner,
        title:        form.title,
        timezone:     form.timezone,
        status_emoji: form.status_emoji,
        status_text:  form.status_text,
        status_until: untilTs(form.until)
      })
    })
    const updated = await res.json()
    store.user = updated
    emit('updated', updated)
    emit('close')
  } finally {
    saving.value = false
  }
}

async function switchAccount() {
  await store.logout()
  emit('close')
  router.push('/')
}

async function logout() {
  if (!await confirmDialog('Выйти из аккаунта?')) return
  await store.logout()
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

/* ── Статус, должность, статистика ── */
.avatar-status {
  position: absolute; top: -4px; right: -6px;
  width: 28px; height: 28px;
  display: grid; place-items: center;
  font-size: 15px; line-height: 1;
  background: var(--surface);
  border: 2px solid var(--surface);
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
  animation: statIn .3s var(--ease-out, ease) both;
}
.profile-title { margin: 2px 0 0; font-size: var(--text-sm); font-weight: 500; color: var(--text-muted); }
.status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  max-width: 100%;
  margin-top: 10px; padding: 5px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-full, 999px);
  font-size: var(--text-sm); color: var(--text);
}
.status-pill .sp-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-pill .sp-until { flex: none; font-size: 11px; color: var(--text-faint); }
.meta-row.faint { color: var(--text-faint); }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
.stat {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  animation: statIn .35s var(--ease-out, ease) both;
}
.stat:nth-child(2) { animation-delay: .05s; }
.stat:nth-child(3) { animation-delay: .1s; }
.stat b { font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.stat span { font-size: 11px; color: var(--text-faint); text-align: center; }
@keyframes statIn { from { opacity: 0; transform: translateY(6px); } }
.profile-actions { display: flex; gap: 8px; margin-top: 16px; }
.pa-btn {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  font: inherit; font-size: var(--text-sm); font-weight: 600;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.pa-btn:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

.status-row { display: flex; align-items: center; gap: 8px; }
.status-row .field-input { flex: 1; min-width: 0; }
.status-emoji-btn {
  flex: none; width: 40px; height: 40px;
  display: grid; place-items: center;
  font-size: 18px; line-height: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: transform .15s var(--ease-out, ease);
}
.status-emoji-btn.empty { opacity: .6; }
.status-emoji-btn:hover { transform: scale(1.06); }
.status-clear {
  flex: none; width: 30px; height: 30px;
  display: grid; place-items: center;
  background: transparent; border: 0; border-radius: 50%;
  color: var(--text-faint); cursor: pointer;
}
.status-clear:hover { background: var(--surface-2); color: var(--text); }
.status-emojis {
  display: flex; flex-wrap: wrap; gap: 4px;
  margin-top: 8px; padding: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  animation: statIn .2s var(--ease-out, ease);
}
.status-emojis button {
  width: 32px; height: 32px;
  background: transparent; border: 0;
  border-radius: var(--radius-md);
  font-size: 17px; cursor: pointer;
}
.status-emojis button:hover, .status-emojis button.active { background: var(--accent-soft); }
.status-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.preset {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-full, 999px);
  color: var(--text-muted);
  font: inherit; font-size: 12px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.preset:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.status-until { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12px; color: var(--text-muted); }
.status-until .field-input { flex: 1; }
.field-select { appearance: auto; cursor: pointer; }
@media (prefers-reduced-motion: reduce) {
  .stat, .avatar-status, .status-emojis { animation: none; }
}
</style>
