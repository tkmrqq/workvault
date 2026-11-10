<template>
  <Teleport to="body">
    <div class="pm-overlay" :class="{ shown: mounted }" @mousedown.self="requestClose">
      <div class="pm" :class="{ shown: mounted, 'pm-edit': !viewOnly }" role="dialog" aria-modal="true">

        <!-- ═══════════════ ПРОСМОТР ═══════════════ -->
        <template v-if="viewOnly">
          <div class="pv-banner" :class="'banner-' + bannerId(u.banner)" :style="{ '--bc': u.color }"><div class="banner-pattern" /></div>
          <button class="pm-close on-banner" @click="emit('close')" aria-label="Закрыть">
            <X :size="15" :stroke-width="2.5" />
          </button>

          <div class="pv-head">
            <div class="pv-avatar" :style="avatarStyle(u.color)">
              <AvatarContent :value="u.avatar" :name="u.name" />
              <span v-if="isOnline" class="online-dot" title="Онлайн" />
            </div>
            <div v-if="!isSelf" class="pv-actions">
              <button type="button" class="btn btn-primary" @click="mention">
                <AtSign :size="15" :stroke-width="2.2" /> Упомянуть
              </button>
            </div>
          </div>

          <div class="pv-body">
            <h2 class="pv-name">{{ u.name }}</h2>
            <p v-if="u.title" class="pv-title">{{ u.title }}</p>

            <div v-if="activeStatus" class="status-pill">
              <span class="sp-emoji">{{ activeStatus.emoji || '💬' }}</span>
              <span v-if="activeStatus.text" class="sp-text">{{ activeStatus.text }}</span>
              <span v-if="activeStatus.until" class="sp-until">до {{ activeStatus.until }}</span>
            </div>

            <p v-if="u.description" class="pv-desc">{{ u.description }}</p>

            <dl class="pv-info">
              <div v-if="localTime" class="pv-info-row">
                <dt><Clock :size="14" :stroke-width="2" /> Местное время</dt>
                <dd>{{ localTime.time }}<span v-if="localTime.diff" class="muted"> · {{ localTime.diff }}</span></dd>
              </div>
              <div v-if="stats?.last_message_at" class="pv-info-row">
                <dt><MessageSquare :size="14" :stroke-width="2" /> Последнее сообщение</dt>
                <dd>{{ relTime(stats.last_message_at) }}</dd>
              </div>
              <div class="pv-info-row">
                <dt><Calendar :size="14" :stroke-width="2" /> В команде с</dt>
                <dd>{{ formatDate(u.created_at) }}</dd>
              </div>
            </dl>

            <div class="pv-stats" :class="{ loading: !stats }">
              <div class="stat">
                <b>{{ stats ? stats.messages : '—' }}</b>
                <span>{{ stats ? plural(stats.messages, ['сообщение', 'сообщения', 'сообщений']) : 'сообщений' }}</span>
              </div>
              <div class="stat">
                <b>{{ stats ? stats.tasks_open : '—' }}</b>
                <span>в работе</span>
              </div>
              <div class="stat">
                <b>{{ stats ? stats.tasks_done : '—' }}</b>
                <span>закрыто</span>
              </div>
            </div>
          </div>
        </template>

        <!-- ═══════════════ НАСТРОЙКИ ═══════════════ -->
        <template v-else>
          <header class="pe-head">
            <div>
              <h2>Настройки профиля</h2>
              <p>Так тебя видят другие участники</p>
            </div>
            <button class="pm-close" @click="requestClose" aria-label="Закрыть">
              <X :size="15" :stroke-width="2.5" />
            </button>
          </header>

          <!-- Живое превью карточки -->
          <div class="pe-preview">
            <div class="pp-banner" :class="'banner-' + form.banner" :style="{ '--bc': form.color }"><div class="banner-pattern" /></div>
            <div class="pp-row">
              <button type="button" class="pp-avatar" :class="{ over: dragOver }" :style="avatarStyle(form.color)"
                title="Загрузить фото" @click="pickFile"
                @dragenter.prevent="dragOver = true" @dragover.prevent="dragOver = true"
                @dragleave.prevent="dragOver = false" @drop.prevent="onDrop">
                <AvatarContent :value="previewAvatar" :name="form.name" />
                <span class="pp-avatar-overlay"><Camera :size="18" :stroke-width="2" /></span>
              </button>
              <div class="pp-text">
                <div class="pp-name" :style="{ color: form.color }">{{ form.name.trim() || 'Без имени' }}</div>
                <div class="pp-sub">
                  <span v-if="form.title.trim()">{{ form.title }}</span>
                  <span v-if="form.status_emoji || form.status_text.trim()" class="pp-status">
                    {{ form.status_emoji }} {{ form.status_text }}
                  </span>
                  <span v-if="!form.title.trim() && !form.status_emoji && !form.status_text.trim()" class="muted">
                    Добавь должность или статус
                  </span>
                </div>
              </div>
            </div>
          </div>

          <nav class="pe-tabs" role="tablist">
            <button v-for="t in TABS" :key="t.id" type="button" role="tab"
              class="pe-tab" :class="{ active: tab === t.id }" :aria-selected="tab === t.id" @click="tab = t.id">
              <component :is="t.icon" :size="14" :stroke-width="2" />
              <span>{{ t.label }}</span>
            </button>
            <span class="pe-ink" :style="{ transform: `translateX(${tabIndex * 100}%)` }" />
          </nav>

          <div class="pe-body">
            <Transition name="pe-fade" mode="out-in">

              <!-- ── Профиль ── -->
              <section v-if="tab === 'profile'" key="profile" class="pe-section">
                <div class="field">
                  <span class="field-label">Аватар</span>
                  <div class="avatar-tools">
                    <button type="button" class="btn btn-soft" @click="pickFile">
                      <Upload :size="14" :stroke-width="2.2" /> {{ hasPhoto ? 'Заменить фото' : 'Загрузить фото' }}
                    </button>
                    <button v-if="hasPhoto" type="button" class="btn btn-ghost danger" @click="removePhoto">
                      <Trash2 :size="14" :stroke-width="2.2" /> Убрать
                    </button>
                  </div>
                  <p class="field-hint">PNG, JPG, WebP или GIF. Картинку можно перетащить прямо на аватар.</p>
                  <div class="emoji-grid" :class="{ dim: hasPhoto }">
                    <button v-for="a in EMOJI_AVATARS" :key="a" type="button" class="emoji-pick"
                      :class="{ active: !hasPhoto && form.avatar === a }" @click="pickEmoji(a)">{{ a }}</button>
                  </div>
                </div>

                <div class="field-pair">
                  <div class="field">
                    <label class="field-label" for="pf-name">Имя <span class="count">{{ form.name.length }}/24</span></label>
                    <input id="pf-name" v-model="form.name" maxlength="24" class="input"
                      :class="{ invalid: touched && !form.name.trim() }" placeholder="Как тебя зовут" @blur="touched = true" />
                    <span v-if="touched && !form.name.trim()" class="field-error">Имя не может быть пустым</span>
                  </div>
                  <div class="field">
                    <label class="field-label" for="pf-title">Должность</label>
                    <input id="pf-title" v-model="form.title" maxlength="40" class="input" placeholder="Например, дизайнер" />
                  </div>
                </div>

                <div class="field">
                  <label class="field-label" for="pf-about">О себе
                    <span class="count" :class="{ warn: form.description.length > 100 }">{{ form.description.length }}/120</span>
                  </label>
                  <textarea id="pf-about" v-model="form.description" maxlength="120" rows="2" class="input textarea"
                    placeholder="Пара слов о себе" />
                </div>

                <div class="field">
                  <label class="field-label" for="pf-tz">Часовой пояс</label>
                  <div class="select-wrap">
                    <Globe :size="14" :stroke-width="2" class="select-icon" />
                    <select id="pf-tz" v-model="form.timezone" class="input select with-icon">
                      <option v-for="o in tzOptions" :key="o.tz" :value="o.tz">{{ o.label }}</option>
                    </select>
                  </div>
                  <p class="field-hint">Коллеги увидят твоё местное время в профиле.</p>
                </div>
              </section>

              <!-- ── Статус ── -->
              <section v-else-if="tab === 'status'" key="status" class="pe-section">
                <div class="field">
                  <span class="field-label">Текущий статус</span>
                  <div class="status-input">
                    <button type="button" class="status-emoji" :class="{ empty: !form.status_emoji }"
                      @click="emojiOpen = !emojiOpen" title="Выбрать эмодзи">{{ form.status_emoji || '🙂' }}</button>
                    <input v-model="form.status_text" maxlength="80" class="status-text" placeholder="Что у тебя сейчас?" />
                    <button v-if="form.status_text || form.status_emoji" type="button" class="status-clear"
                      @click="clearStatus" title="Сбросить статус">
                      <X :size="13" :stroke-width="2.5" />
                    </button>
                  </div>
                  <Transition name="pe-pop">
                    <div v-if="emojiOpen" class="status-emojis">
                      <button v-for="e in STATUS_EMOJIS" :key="e" type="button"
                        :class="{ active: form.status_emoji === e }"
                        @click="form.status_emoji = e; emojiOpen = false">{{ e }}</button>
                    </div>
                  </Transition>
                </div>

                <div class="field">
                  <span class="field-label">Быстрый выбор</span>
                  <div class="preset-list">
                    <button v-for="p in STATUS_PRESETS" :key="p.text" type="button" class="preset"
                      :class="{ active: form.status_text === p.text && form.status_emoji === p.emoji }" @click="applyPreset(p)">
                      <span class="preset-emoji">{{ p.emoji }}</span>
                      <span class="preset-text">{{ p.text }}</span>
                      <span class="preset-until">{{ untilLabel(p.until) }}</span>
                    </button>
                  </div>
                </div>

                <div class="field" :class="{ disabled: !form.status_text && !form.status_emoji }">
                  <label class="field-label" for="pf-until">Сбросить статус</label>
                  <div class="select-wrap">
                    <Clock :size="14" :stroke-width="2" class="select-icon" />
                    <select id="pf-until" v-model="form.until" class="input select with-icon"
                      :disabled="!form.status_text && !form.status_emoji">
                      <option v-for="o in untilOptions" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
                    </select>
                  </div>
                </div>
              </section>

              <!-- ── Оформление ── -->
              <section v-else-if="tab === 'look'" key="look" class="pe-section">
                <div class="field">
                  <span class="field-label">Фон профиля</span>
                  <div class="banner-grid">
                    <button v-for="b in BANNERS" :key="b.id" type="button" class="banner-tile"
                      :class="['banner-' + b.id, { active: form.banner === b.id }]" :style="{ '--bc': form.color }"
                      :aria-pressed="form.banner === b.id" :title="b.label" @click="form.banner = b.id">
                      <span class="banner-pattern" />
                      <span class="bt-label">{{ b.label }}</span>
                      <span v-if="form.banner === b.id" class="bt-check"><Check :size="12" :stroke-width="3" /></span>
                    </button>
                  </div>
                </div>

                <div class="field">
                  <span class="field-label">Цвет имени</span>
                  <div class="color-row">
                    <button v-for="c in COLORS" :key="c" type="button" class="color-dot"
                      :class="{ active: form.color === c }" :style="{ '--c': c }" @click="form.color = c" :aria-label="c">
                      <Check v-if="form.color === c" :size="13" :stroke-width="3" />
                    </button>
                  </div>
                  <p class="field-hint">Используется для имени в чате и фона эмодзи-аватара.</p>
                </div>
              </section>

              <!-- ── Аккаунт ── -->
              <section v-else key="account" class="pe-section">
                <div class="acc-card">
                  <div class="acc-row">
                    <span class="acc-k">В команде с</span>
                    <span class="acc-v">{{ formatDate(user.created_at) }}</span>
                  </div>
                  <div class="acc-row">
                    <span class="acc-k">Роль</span>
                    <span class="acc-v">{{ user.role === 'admin' ? 'Администратор' : 'Участник' }}</span>
                  </div>
                </div>

                <button type="button" class="acc-action" @click="switchAccount">
                  <span class="acc-icon"><RefreshCw :size="16" :stroke-width="2" /></span>
                  <span class="acc-text"><b>Сменить аккаунт</b><small>Выйти и войти под другим пользователем</small></span>
                  <ChevronRight :size="16" :stroke-width="2" class="acc-chev" />
                </button>
                <button type="button" class="acc-action danger" @click="logout">
                  <span class="acc-icon"><LogOut :size="16" :stroke-width="2" /></span>
                  <span class="acc-text"><b>Выйти</b><small>Завершить сессию на этом устройстве</small></span>
                  <ChevronRight :size="16" :stroke-width="2" class="acc-chev" />
                </button>
              </section>
            </Transition>
          </div>

          <footer class="pe-foot">
            <span class="pe-hint" :class="{ err: !!error, dirty: dirty && !error }">
              {{ error || (dirty ? 'Есть несохранённые изменения' : '') }}
            </span>
            <button type="button" class="btn btn-ghost" @click="requestClose">Отмена</button>
            <button type="button" class="btn btn-primary" :disabled="!dirty || saving || !form.name.trim()"
              :title="(isMac ? '⌘' : 'Ctrl') + ' + Enter'" @click="save">
              <span v-if="saving" class="spinner" />
              <Check v-else :size="15" :stroke-width="2.5" />
              Сохранить
            </button>
          </footer>

          <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="onFileInput" />

          <Transition name="pe-fade">
            <div v-if="cropFile" class="crop-layer" @mousedown.self="cropFile = null">
              <div class="crop-card">
                <h3>Фото профиля</h3>
                <p>Перетащи и приблизь, чтобы выбрать область</p>
                <AvatarCropper :file="cropFile" @cancel="cropFile = null" @done="onCropped" />
              </div>
            </div>
          </Transition>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { getApiBase } from '@/lib/apiBase'
import { isImageAvatar } from '@/lib/avatar'
import { confirmDialog } from '@/composables/useConfirm'
import AvatarCropper from './AvatarCropper.vue'
import {
  X, Calendar, Clock, Globe, AtSign, MessageSquare, Camera, Upload, Trash2,
  RefreshCw, LogOut, Check, ChevronRight, User, Smile, Palette, Shield
} from 'lucide-vue-next'

const props = defineProps({
  user:     { type: Object, required: true },
  viewOnly: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'updated'])

const store   = useAppStore()
const router  = useRouter()
const mounted = ref(false)
const saving  = ref(false)
const touched = ref(false)
const error   = ref('')
const isMac   = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')

// В режиме просмотра соединяем то, что передали (часто только имя/аватар из
// сообщения), с полной и актуальной карточкой из store — она обновляется по сокету.
const u = computed(() => ({ ...props.user, ...(store.usersById?.[props.user.id] || {}) }))
const isSelf = computed(() => props.user.id === store.user?.id)
const isOnline = computed(() => store.onlineList?.some?.(o => o.userId === props.user.id) ?? false)

const TABS = [
  { id: 'profile', label: 'Профиль',    icon: User },
  { id: 'status',  label: 'Статус',     icon: Smile },
  { id: 'look',    label: 'Вид',        icon: Palette },
  { id: 'account', label: 'Аккаунт',    icon: Shield }
]
const tab = ref('profile')
const tabIndex = computed(() => Math.max(0, TABS.findIndex(t => t.id === tab.value)))

const EMOJI_AVATARS = ['🧑', '👩', '👨', '🧔', '👩‍💻', '👨‍💻', '🦊', '🐼', '🐻', '🐸', '🤖', '👾', '🐱', '🦉', '🐙', '🌵']
const COLORS  = ['#7c6af7', '#4caf7d', '#e8956d', '#e06c75', '#e8af34', '#61afef', '#c678dd', '#56b6c2']
// Список должен совпадать с ALLOWED_BANNERS в server/server.js
const BANNERS = [
  { id: 'auto',   label: 'Под цвет' }, { id: 'violet', label: 'Фиолетовый' }, { id: 'aurora', label: 'Аврора' },
  { id: 'cosmos', label: 'Космос' },   { id: 'ocean',  label: 'Океан' },      { id: 'forest', label: 'Лес' },
  { id: 'mint',   label: 'Мята' },     { id: 'sunset', label: 'Закат' },      { id: 'peach',  label: 'Персик' },
  { id: 'rose',   label: 'Розовый' },  { id: 'mono',   label: 'Моно' }
]
const bannerId = (id) => (BANNERS.some(b => b.id === id) ? id : 'violet')

function initForm() {
  const p = props.user
  return {
    name:         p.name || '',
    avatar:       p.avatar || EMOJI_AVATARS[0],
    color:        p.color || COLORS[0],
    description:  p.description || '',
    banner:       bannerId(p.banner),
    title:        p.title || '',
    timezone:     p.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    status_emoji: p.status_emoji || '',
    status_text:  p.status_text || '',
    until:        p.status_until ? 'keep' : ''
  }
}
const form = reactive(initForm())
const initialSnapshot = JSON.stringify(initForm())

// ── Аватар ──
const fileInput  = ref(null)
const cropFile   = ref(null)
const dragOver   = ref(false)
const pendingBlob = ref(null)
const pendingUrl  = ref('')
const lastEmoji = isImageAvatar(props.user.avatar) ? EMOJI_AVATARS[0] : (props.user.avatar || EMOJI_AVATARS[0])

const previewAvatar = computed(() => pendingUrl.value || form.avatar)
const hasPhoto = computed(() => !!pendingUrl.value || isImageAvatar(form.avatar))
const dirty = computed(() => !!pendingBlob.value || JSON.stringify({ ...form }) !== initialSnapshot)

function clearPending() {
  if (pendingUrl.value) URL.revokeObjectURL(pendingUrl.value)
  pendingUrl.value = ''
  pendingBlob.value = null
}
function pickFile() { fileInput.value?.click() }
function acceptFile(f) {
  error.value = ''
  if (!f) return
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { error.value = 'Нужна картинка: PNG, JPG, WebP или GIF'; return }
  if (f.size > 15 * 1024 * 1024) { error.value = 'Картинка больше 15 МБ'; return }
  cropFile.value = f
}
function onFileInput(e) { acceptFile(e.target.files?.[0]); e.target.value = '' }
function onDrop(e) { dragOver.value = false; acceptFile(e.dataTransfer?.files?.[0]) }
function onCropped(blob) {
  clearPending()
  pendingBlob.value = blob
  pendingUrl.value = URL.createObjectURL(blob)
  cropFile.value = null
}
function pickEmoji(e) { clearPending(); form.avatar = e }
function removePhoto() {
  clearPending()
  if (isImageAvatar(form.avatar)) form.avatar = lastEmoji
}

// ── Статус ──
const STATUS_EMOJIS = ['💬', '📅', '🎯', '🚌', '🍽️', '🤒', '🌴', '🏠', '🎧', '☕', '🔥', '✅', '📚', '🛠️', '✈️', '🌙']
const STATUS_PRESETS = [
  { emoji: '📅', text: 'На встрече',          until: '1h' },
  { emoji: '🎯', text: 'Фокус, не отвлекать', until: '4h' },
  { emoji: '🚌', text: 'В пути',              until: '1h' },
  { emoji: '🍽️', text: 'Обед',                until: '1h' },
  { emoji: '🤒', text: 'Болею',               until: 'today' },
  { emoji: '🌴', text: 'В отпуске',           until: 'week' }
]
const UNTIL_LABELS = { '': 'Не сбрасывать', '1h': 'Через час', '4h': 'Через 4 часа', today: 'В конце дня', week: 'Через неделю' }
const UNTIL_SHORT  = { '': '', '1h': '1 ч', '4h': '4 ч', today: 'до вечера', week: 'неделя' }
function untilLabel(k) { return UNTIL_SHORT[k] || '' }

const emojiOpen = ref(false)
const now = ref(Date.now())
const tick = setInterval(() => { now.value = Date.now() }, 30000)

function fmtUntil(ts) {
  const d = new Date(ts * 1000)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const untilOptions = computed(() => {
  const opts = Object.entries(UNTIL_LABELS)
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
function clearStatus()  { form.status_emoji = ''; form.status_text = ''; form.until = ''; emojiOpen.value = false }

const activeStatus = computed(() => {
  const x = u.value
  if (!x || !(x.status_text || x.status_emoji)) return null
  if (x.status_until && x.status_until * 1000 < now.value) return null
  return { emoji: x.status_emoji, text: x.status_text || '', until: x.status_until ? fmtUntil(x.status_until) : '' }
})

// ── Часовой пояс ──
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
  return list
    .map(tz => ({ tz, off: tzOffsetMin(tz) ?? 0 }))
    .sort((a, b) => a.off - b.off || a.tz.localeCompare(b.tz))
    .map(({ tz, off }) => {
      const a = Math.abs(off)
      const s = (off >= 0 ? '+' : '−') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0')
      return { tz, label: `UTC${s} · ${tz.replace(/_/g, ' ')}` }
    })
})
const localTime = computed(() => {
  const tz = u.value?.timezone
  if (!tz) return null
  const d = new Date(now.value)
  let time
  try { time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', timeZone: tz }) } catch { return null }
  let diff = ''
  const a = tzOffsetMin(tz, d), b = tzOffsetMin(myTz, d)
  if (a != null && b != null && a !== b && !isSelf.value) {
    const h = (a - b) / 60
    diff = (h > 0 ? '+' : '−') + String(Math.abs(h)).replace('.', ',') + ' ч от тебя'
  }
  return { time, diff }
})

// ── Статистика ──
const stats = ref(null)
async function loadStats() {
  if (!props.viewOnly || !props.user?.id) return
  try {
    const r = await fetch(`${getApiBase()}/api/users/${props.user.id}/stats`)
    if (r.ok) stats.value = await r.json()
  } catch { /* офлайн — просто без статистики */ }
}
function plural(n, f) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return f[2]
  if (b > 1 && b < 5) return f[1]
  if (b === 1) return f[0]
  return f[2]
}
function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
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
function avatarStyle(c) {
  const col = c || COLORS[0]
  return { background: col + '24', color: col }
}
function mention() {
  store.insertIntoComposer('@' + u.value.name + ' ', null)
  emit('close')
}

// ── Сохранение / закрытие ──
async function save() {
  touched.value = true
  if (!form.name.trim() || saving.value || !dirty.value) return
  saving.value = true
  error.value = ''
  try {
    const API = getApiBase()
    let avatar = form.avatar
    if (pendingBlob.value) {
      const fd = new FormData()
      fd.append('file', pendingBlob.value, pendingBlob.value.type === 'image/webp' ? 'avatar.webp' : 'avatar.png')
      const r = await fetch(`${API}/api/users/${props.user.id}/avatar`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.url) throw new Error(j.error || 'Не удалось загрузить фото')
      avatar = j.url
    }
    const res = await fetch(`${API}/api/users/${props.user.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:         form.name.trim(),
        avatar,
        color:        form.color,
        description:  form.description,
        banner:       form.banner,
        title:        form.title,
        timezone:     form.timezone,
        status_emoji: form.status_emoji,
        status_text:  form.status_text,
        status_until: untilTs(form.until)
      })
    })
    const updated = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(updated.error || 'Не удалось сохранить')
    clearPending()
    store.user = { ...store.user, ...updated }
    emit('updated', updated)
    emit('close')
  } catch (e) {
    error.value = e.message || 'Не удалось сохранить'
  } finally {
    saving.value = false
  }
}

let closing = false
async function requestClose() {
  if (closing) return
  if (!props.viewOnly && dirty.value) {
    closing = true
    const ok = await confirmDialog('Закрыть без сохранения? Изменения пропадут.')
    closing = false
    if (!ok) return
  }
  clearPending()
  emit('close')
}

function onKey(e) {
  if (closing) return
  if (e.key === 'Escape') {
    if (cropFile.value) { cropFile.value = null; return }
    if (emojiOpen.value) { emojiOpen.value = false; return }
    requestClose()
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !props.viewOnly) {
    e.preventDefault()
    save()
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

onMounted(() => {
  requestAnimationFrame(() => { mounted.value = true })
  window.addEventListener('keydown', onKey)
  loadStats()
})
onUnmounted(() => {
  clearInterval(tick)
  window.removeEventListener('keydown', onKey)
  if (pendingUrl.value) URL.revokeObjectURL(pendingUrl.value)
})
</script>

<style scoped>
/* ── Оверлей и каркас ── */
.pm-overlay {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4);
  background: oklch(0 0 0 / 0);
  backdrop-filter: blur(0);
  transition: background .22s ease, backdrop-filter .22s ease;
}
.pm-overlay.shown { background: oklch(0 0 0 / 0.55); backdrop-filter: blur(4px); }

.pm {
  position: relative;
  width: min(400px, 100%);
  max-height: min(720px, 90vh);
  display: flex; flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  opacity: 0;
  transform: translateY(10px) scale(.975);
  transition: opacity .24s var(--ease-out, ease), transform .28s var(--ease-out, ease);
}
.pm.shown { opacity: 1; transform: none; }
.pm.pm-edit { width: min(500px, 100%); }

.pm-close {
  flex: none;
  width: 30px; height: 30px; border-radius: var(--radius-full);
  display: grid; place-items: center;
  color: var(--text-muted);
  transition: background .15s ease, color .15s ease, transform .15s ease;
}
.pm-close:hover { background: var(--hover); color: var(--text); }
.pm-close.on-banner {
  position: absolute; top: 12px; right: 12px; z-index: 3;
  color: #fff; background: oklch(0 0 0 / 0.28);
}
.pm-close.on-banner:hover { background: oklch(0 0 0 / 0.45); color: #fff; }

/* ── Баннеры ──
   Каждый баннер = фон (меш из градиентов) + свой узор (--pat) + общий слой зерна.
   Узор живёт в .banner-pattern, поэтому разметку менять не нужно. */
.banner-pattern {
  position: absolute; inset: 0; overflow: hidden;
  background-image: var(--pat, none);
  background-size: var(--pat-size, auto);
  background-position: var(--pat-pos, 0 0);
  background-repeat: var(--pat-repeat, repeat);
  -webkit-mask-image: var(--pat-mask, none);
          mask-image: var(--pat-mask, none);
  pointer-events: none;
}
/* Плёночное зерно — убирает «пластиковость» градиентов */
.banner-pattern::after {
  content: ''; position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: .14; mix-blend-mode: overlay;
}

/* Фиолетовый — мягкие световые пятна */
.banner-violet {
  background:
    radial-gradient(120% 140% at 12% 0%, #9d8cff 0, transparent 55%),
    radial-gradient(90% 120% at 100% 100%, #e27fd6 0, transparent 60%),
    linear-gradient(135deg, #5847d4, #9a57cf);
  --pat: radial-gradient(circle at 22% 38%, oklch(1 0 0 / .22) 0, transparent 26%),
         radial-gradient(circle at 78% 18%, oklch(1 0 0 / .14) 0, transparent 20%),
         radial-gradient(circle at 62% 92%, oklch(1 0 0 / .10) 0, transparent 30%);
}
/* Лес — топографические кольца */
.banner-forest {
  background:
    radial-gradient(100% 140% at 0% 100%, #5cc48d 0, transparent 55%),
    linear-gradient(135deg, #17432f, #2f7d56);
  --pat: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='160'%3E%3Cg fill='none' stroke='white' stroke-opacity='.17' stroke-width='1.2'%3E%3Cellipse cx='260' cy='130' rx='26' ry='18'/%3E%3Cellipse cx='256' cy='128' rx='52' ry='36'/%3E%3Cellipse cx='252' cy='126' rx='80' ry='56'/%3E%3Cellipse cx='246' cy='124' rx='110' ry='78'/%3E%3Cellipse cx='240' cy='122' rx='142' ry='102'/%3E%3Cellipse cx='232' cy='120' rx='178' ry='128'/%3E%3Cellipse cx='224' cy='118' rx='218' ry='156'/%3E%3C/g%3E%3C/svg%3E");
  --pat-size: cover; --pat-repeat: no-repeat; --pat-pos: right bottom;
}
/* Закат — солнце и полосы горизонта */
.banner-sunset {
  background:
    radial-gradient(38% 90% at 80% 105%, #ffe08a 0, #ffc25a 40%, transparent 72%),
    linear-gradient(180deg, #c9506a 0%, #e27a45 55%, #efab3a 100%);
  --pat: repeating-linear-gradient(180deg, transparent 0 9px, oklch(1 0 0 / .20) 9px 11px);
  --pat-mask: linear-gradient(180deg, transparent 45%, #000 100%);
}
/* Океан — волны */
.banner-ocean {
  background:
    radial-gradient(90% 140% at 100% 0%, #6fc3ff 0, transparent 55%),
    linear-gradient(160deg, #163f66, #2d7fc0);
  --pat: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='22'%3E%3Cpath d='M0 11 Q15 3 30 11 T60 11 T90 11 T120 11' fill='none' stroke='white' stroke-opacity='.2' stroke-width='1.4'/%3E%3C/svg%3E");
  --pat-size: 120px 22px;
  --pat-mask: linear-gradient(180deg, transparent 10%, #000 85%);
}
/* Розовый — точечная сетка */
.banner-rose {
  background:
    radial-gradient(100% 140% at 100% 0%, #f08a8a 0, transparent 55%),
    linear-gradient(135deg, #7d2945, #d25a6c);
  --pat: radial-gradient(oklch(1 0 0 / .28) 1.1px, transparent 1.6px);
  --pat-size: 14px 14px;
  --pat-mask: linear-gradient(110deg, #000 0%, transparent 70%);
}
/* Моно — инженерная сетка */
.banner-mono {
  background:
    radial-gradient(90% 140% at 0% 0%, #6e6e78 0, transparent 60%),
    linear-gradient(135deg, #222227, #47474f);
  --pat: linear-gradient(oklch(1 0 0 / .08) 1px, transparent 1px),
         linear-gradient(90deg, oklch(1 0 0 / .08) 1px, transparent 1px);
  --pat-size: 18px 18px;
  --pat-mask: radial-gradient(120% 120% at 100% 0%, #000 0%, transparent 75%);
}
/* Аврора — переливающиеся ленты (анимируются в большом баннере) */
.banner-aurora {
  background: linear-gradient(180deg, #0b1026, #141a3a);
  --pat: radial-gradient(60% 80% at 20% 60%, oklch(0.8 0.17 160 / .65) 0, transparent 70%),
         radial-gradient(50% 70% at 55% 30%, oklch(0.75 0.13 200 / .55) 0, transparent 70%),
         radial-gradient(55% 80% at 85% 65%, oklch(0.65 0.2 300 / .6) 0, transparent 70%);
  --pat-size: 160% 100%;
}
/* Космос — звёзды */
.banner-cosmos {
  background:
    radial-gradient(70% 120% at 85% 120%, #4b3aa8 0, transparent 60%),
    radial-gradient(50% 90% at 10% -10%, #26306b 0, transparent 60%),
    #0e0c1f;
  --pat: radial-gradient(1.2px 1.2px at 12px 18px, #fff 50%, transparent 100%),
         radial-gradient(1px 1px at 64px 44px, oklch(1 0 0 / .8) 50%, transparent 100%),
         radial-gradient(1.6px 1.6px at 102px 12px, #fff 50%, transparent 100%),
         radial-gradient(1px 1px at 38px 70px, oklch(1 0 0 / .6) 50%, transparent 100%),
         radial-gradient(1.3px 1.3px at 128px 62px, oklch(1 0 0 / .9) 50%, transparent 100%),
         radial-gradient(1px 1px at 88px 84px, oklch(1 0 0 / .5) 50%, transparent 100%);
  --pat-size: 150px 96px;
}
/* Персик — светлый, тёплый */
.banner-peach {
  background:
    radial-gradient(90% 140% at 0% 0%, #ffd9b8 0, transparent 60%),
    radial-gradient(80% 120% at 100% 100%, #f4a3bf 0, transparent 60%),
    linear-gradient(135deg, #f7b98f, #ee9bb0);
  --pat: repeating-radial-gradient(circle at 100% 0%, transparent 0 14px, oklch(1 0 0 / .28) 14px 15.5px);
  --pat-mask: linear-gradient(225deg, #000 0%, transparent 65%);
}
/* Мята — диагональная штриховка */
.banner-mint {
  background:
    radial-gradient(90% 140% at 100% 0%, #b9f0d6 0, transparent 60%),
    linear-gradient(135deg, #1f8f84, #4fc39b);
  --pat: repeating-linear-gradient(-45deg, oklch(1 0 0 / .14) 0 1.5px, transparent 1.5px 11px);
  --pat-mask: linear-gradient(90deg, transparent 0%, #000 100%);
}
/* Под цвет — строится из «Цвета имени» (переменная --bc задаётся в разметке) */
.banner-auto {
  --bc: #7c6af7;
  background:
    radial-gradient(90% 140% at 0% 0%, color-mix(in oklab, var(--bc) 50%, white) 0, transparent 60%),
    radial-gradient(80% 120% at 100% 100%, color-mix(in oklab, var(--bc) 75%, black) 0, transparent 65%),
    linear-gradient(135deg, color-mix(in oklab, var(--bc) 85%, white), var(--bc));
  --pat: radial-gradient(oklch(1 0 0 / .22) 1px, transparent 1.5px);
  --pat-size: 12px 12px;
  --pat-mask: linear-gradient(250deg, #000 0%, transparent 55%);
}

/* Плавное движение авроры — только в больших баннерах */
.pv-banner.banner-aurora .banner-pattern,
.pp-banner.banner-aurora .banner-pattern { animation: aurora-drift 14s ease-in-out infinite alternate; }
@keyframes aurora-drift {
  from { background-position: 0% 0; }
  to   { background-position: 100% 0; }
}

/* ── Общие кнопки ── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 34px; padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: var(--text-sm); font-weight: 600;
  white-space: nowrap;
  transition: background .15s ease, color .15s ease, border-color .15s ease, opacity .15s ease, transform .1s ease;
}
.btn:active:not(:disabled) { transform: scale(.98); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover, var(--accent)); }
.btn-soft { background: var(--surface-2); border-color: var(--border); color: var(--text); }
.btn-soft:hover { background: var(--hover); }
.btn-ghost { color: var(--text-muted); }
.btn-ghost:hover { background: var(--hover); color: var(--text); }
.btn-ghost.danger { color: var(--danger, #e06c75); }
.btn-ghost.danger:hover { background: color-mix(in oklab, var(--danger, #e06c75) 12%, transparent); }
.muted { color: var(--text-faint); }

/* ═════ Просмотр ═════ */
.pm:not(.pm-edit) { overflow-y: auto; scrollbar-width: none; }
.pv-banner { position: relative; flex: none; height: 116px; overflow: hidden; }
.pv-head {
  display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-3);
  padding: 0 var(--space-5);
  margin-top: -40px;
  position: relative; z-index: 2;
}
.pv-avatar {
  position: relative;
  width: 84px; height: 84px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 2.2rem;
  border: 4px solid var(--surface);
  background-clip: padding-box;
  box-shadow: var(--shadow-sm);
}
.pv-avatar .online-dot {
  position: absolute; right: 2px; bottom: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #4caf7d; border: 3px solid var(--surface);
}
.pv-actions { padding-bottom: 6px; }
.pv-body {
  padding: var(--space-3) var(--space-5) var(--space-5);
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
}
.pv-name { font-size: var(--text-lg); font-weight: 700; line-height: 1.25; color: var(--text); }
.pv-title { font-size: var(--text-sm); color: var(--text-muted); margin-top: -4px; }
.pv-desc { font-size: var(--text-sm); color: var(--text); line-height: 1.5; margin-top: 4px; white-space: pre-wrap; overflow-wrap: anywhere; }

.status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  max-width: 100%;
  margin-top: 4px; padding: 4px 10px 4px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
}
.sp-emoji { line-height: 1; }
.sp-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-until { flex: none; font-size: 11px; color: var(--text-faint); }

.pv-info {
  width: 100%;
  margin: var(--space-3) 0 0;
  border-top: 1px solid var(--divider);
}
.pv-info-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  padding: 9px 0;
  border-bottom: 1px solid var(--divider);
  font-size: var(--text-sm);
}
.pv-info-row dt { display: inline-flex; align-items: center; gap: 8px; color: var(--text-muted); }
.pv-info-row dt svg { color: var(--text-faint); }
.pv-info-row dd { margin: 0; color: var(--text); text-align: right; }

.pv-stats { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: var(--space-3); }
.stat {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 10px 4px;
  background: var(--surface-2);
  border-radius: var(--radius-md);
  transition: opacity .25s ease;
}
.pv-stats.loading .stat { opacity: .5; }
.stat b { font-size: 17px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.stat span { font-size: 11px; color: var(--text-faint); }

/* ═════ Настройки ═════ */
.pe-head {
  flex: none;
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-3) var(--space-5);
}
.pe-head h2 { font-size: var(--text-base); font-weight: 700; color: var(--text); }
.pe-head p { font-size: var(--text-xs); color: var(--text-faint); margin-top: 2px; }

.pe-preview {
  flex: none;
  margin: 0 var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--surface-2);
}
.pp-banner { position: relative; height: 56px; overflow: hidden; }
.pp-row { display: flex; align-items: flex-end; gap: var(--space-3); padding: 0 var(--space-3) var(--space-3); margin-top: -24px; position: relative; }
.pp-avatar {
  position: relative; flex: none;
  width: 64px; height: 64px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 1.75rem;
  border: 3px solid var(--surface-2);
  background-clip: padding-box;
  cursor: pointer;
  transition: transform .18s var(--ease-out, ease), box-shadow .18s ease;
}
.pp-avatar:hover { transform: scale(1.03); }
.pp-avatar.over { box-shadow: 0 0 0 3px var(--accent); transform: scale(1.06); }
.pp-avatar-overlay {
  position: absolute; inset: 0; border-radius: 50%;
  display: grid; place-items: center;
  color: #fff; background: oklch(0 0 0 / 0.45);
  opacity: 0; transition: opacity .15s ease;
}
.pp-avatar:hover .pp-avatar-overlay, .pp-avatar.over .pp-avatar-overlay, .pp-avatar:focus-visible .pp-avatar-overlay { opacity: 1; }
.pp-text { min-width: 0; padding-bottom: 4px; }
.pp-name { font-weight: 700; font-size: var(--text-base); line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color .2s ease; }
.pp-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px; }
.pp-status { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

/* Вкладки */
.pe-tabs {
  flex: none;
  position: relative;
  display: grid; grid-template-columns: repeat(4, 1fr);
  margin: var(--space-4) var(--space-5) 0;
  padding: 3px;
  background: var(--surface-2);
  border-radius: var(--radius-md);
}
.pe-tab {
  position: relative; z-index: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 30px;
  font-size: 13px; font-weight: 600;
  color: var(--text-muted);
  border-radius: calc(var(--radius-md) - 2px);
  transition: color .18s ease;
}
.pe-tab:hover { color: var(--text); }
.pe-tab.active { color: var(--text); }
.pe-ink {
  position: absolute; top: 3px; left: 3px; bottom: 3px;
  width: calc((100% - 6px) / 4);
  background: var(--surface);
  border-radius: calc(var(--radius-md) - 2px);
  box-shadow: var(--shadow-sm);
  transition: transform .28s var(--ease-spring, cubic-bezier(.3, 1.3, .5, 1));
}

.pe-body {
  flex: 1; min-height: 0;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
  scrollbar-width: thin;
}
.pe-section { display: flex; flex-direction: column; gap: var(--space-5); }

.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; transition: opacity .2s ease; }
.field.disabled { opacity: .5; }
.field-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.field-label {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  font-size: 12px; font-weight: 600; color: var(--text-muted);
}
.count { font-weight: 500; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.count.warn { color: var(--warning, #e8af34); }
.field-hint { font-size: 12px; color: var(--text-faint); line-height: 1.4; }
.field-error { font-size: 12px; color: var(--danger, #e06c75); font-weight: 600; }

.input {
  width: 100%;
  height: 36px; padding: 0 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  font: inherit; font-size: var(--text-sm);
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.input::placeholder { color: var(--text-faint); }
.input:hover { border-color: color-mix(in oklab, var(--border) 60%, var(--text-faint)); }
.input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); background: var(--surface); }
.input.invalid { border-color: var(--danger, #e06c75); }
.textarea { height: auto; padding: 8px 10px; resize: none; line-height: 1.45; }
.select { cursor: pointer; }
.select-wrap { position: relative; }
.select-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-faint); pointer-events: none; }
.select.with-icon { padding-left: 32px; }

/* Аватар */
.avatar-tools { display: flex; flex-wrap: wrap; gap: 6px; }
.emoji-grid {
  display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;
  margin-top: 4px;
  transition: opacity .2s ease;
}
.emoji-grid.dim { opacity: .55; }
.emoji-grid.dim:hover { opacity: 1; }
.emoji-pick {
  aspect-ratio: 1; border-radius: var(--radius-md);
  font-size: 1.2rem;
  border: 1.5px solid transparent;
  transition: background .15s ease, border-color .15s ease, transform .15s var(--ease-out, ease);
}
.emoji-pick:hover { background: var(--hover); transform: translateY(-1px); }
.emoji-pick.active { border-color: var(--accent); background: var(--accent-soft); }

/* Статус */
.status-input {
  display: flex; align-items: center; gap: 4px;
  height: 40px; padding: 0 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color .15s ease, box-shadow .15s ease;
}
.status-input:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.status-emoji {
  flex: none; width: 32px; height: 32px; border-radius: var(--radius-md);
  font-size: 18px; line-height: 1;
  transition: background .15s ease, transform .15s ease;
}
.status-emoji:hover { background: var(--hover); transform: scale(1.06); }
.status-emoji.empty { opacity: .55; }
.status-text {
  flex: 1; min-width: 0; height: 100%;
  background: transparent; border: 0; outline: none;
  color: var(--text); font: inherit; font-size: var(--text-sm);
}
.status-text::placeholder { color: var(--text-faint); }
.status-clear {
  flex: none; width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  color: var(--text-faint);
  transition: background .15s ease, color .15s ease;
}
.status-clear:hover { background: var(--hover); color: var(--text); }
.status-emojis {
  display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px;
  padding: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transform-origin: top left;
}
.status-emojis button { aspect-ratio: 1; border-radius: var(--radius-md); font-size: 17px; transition: background .12s ease; }
.status-emojis button:hover, .status-emojis button.active { background: var(--accent-soft); }

.preset-list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.preset {
  display: flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: left;
  font-size: var(--text-sm); color: var(--text);
  transition: background .15s ease, border-color .15s ease;
}
.preset:hover { background: var(--hover); }
.preset.active { border-color: var(--accent); background: var(--accent-soft); }
.preset-emoji { flex: none; font-size: 15px; }
.preset-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preset-until { flex: none; font-size: 11px; color: var(--text-faint); }

/* Оформление */
.banner-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
@media (max-width: 420px) { .banner-grid { grid-template-columns: repeat(3, 1fr); } }
.banner-tile {
  position: relative;
  height: 56px; border-radius: var(--radius-md);
  overflow: hidden;
  display: flex; align-items: flex-end;
  padding: 6px 8px;
  outline: 2px solid transparent; outline-offset: 2px;
  transition: transform .18s var(--ease-out, ease), outline-color .15s ease;
}
.banner-tile:hover { transform: translateY(-2px); }
.banner-tile.active { outline-color: var(--accent); }
.banner-tile:focus-visible { outline-color: var(--accent-line); }
.bt-label { position: relative; z-index: 1; font-size: 11px; font-weight: 600; color: #fff; text-shadow: 0 1px 2px oklch(0 0 0 / 0.35); }
.bt-check {
  position: absolute; top: 6px; right: 6px; z-index: 1;
  width: 18px; height: 18px; border-radius: 50%;
  display: grid; place-items: center;
  background: #fff; color: #222;
  animation: pop .22s var(--ease-spring, ease) both;
}
.color-row { display: flex; flex-wrap: wrap; gap: 10px; }
.color-dot {
  width: 30px; height: 30px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--c); color: #fff;
  box-shadow: 0 0 0 0 var(--c);
  transition: transform .15s var(--ease-out, ease), box-shadow .15s ease;
}
.color-dot:hover { transform: scale(1.1); }
.color-dot.active { box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--c); }
.color-dot svg { animation: pop .22s var(--ease-spring, ease) both; }
@keyframes pop { from { transform: scale(.4); opacity: 0; } }

/* Аккаунт */
.acc-card { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.acc-row { display: flex; justify-content: space-between; gap: var(--space-3); padding: 10px 12px; font-size: var(--text-sm); }
.acc-row + .acc-row { border-top: 1px solid var(--divider); }
.acc-k { color: var(--text-muted); }
.acc-v { color: var(--text); font-weight: 500; }
.acc-action {
  display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: left;
  transition: background .15s ease, border-color .15s ease;
}
.pe-section > .acc-action { margin-top: calc(var(--space-5) * -0.6); }
.pe-section > .acc-card + .acc-action { margin-top: 0; }
.acc-action:hover { background: var(--hover); }
.acc-icon {
  flex: none; width: 32px; height: 32px; border-radius: var(--radius-md);
  display: grid; place-items: center;
  background: var(--surface-2); color: var(--text-muted);
}
.acc-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.acc-text b { font-size: var(--text-sm); font-weight: 600; color: var(--text); }
.acc-text small { font-size: 12px; color: var(--text-faint); }
.acc-chev { color: var(--text-faint); transition: transform .15s ease; }
.acc-action:hover .acc-chev { transform: translateX(2px); }
.acc-action.danger .acc-icon { color: var(--danger, #e06c75); background: color-mix(in oklab, var(--danger, #e06c75) 12%, transparent); }
.acc-action.danger b { color: var(--danger, #e06c75); }

/* Футер */
.pe-foot {
  flex: none;
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--divider);
  background: var(--surface);
}
.pe-hint { flex: 1; min-width: 0; font-size: 12px; color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pe-hint.dirty { color: var(--text-muted); }
.pe-hint.err { color: var(--danger, #e06c75); font-weight: 600; }
.spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid oklch(1 0 0 / 0.4); border-top-color: #fff;
  animation: spin .6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Кадрирование */
.crop-layer {
  position: absolute; inset: 0; z-index: 5;
  display: grid; place-items: center;
  padding: var(--space-4);
  background: color-mix(in oklab, var(--surface) 82%, transparent);
  backdrop-filter: blur(6px);
}
.crop-card {
  width: min(320px, 100%);
  padding: var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.crop-card h3 { font-size: var(--text-base); font-weight: 700; color: var(--text); }
.crop-card p { font-size: 12px; color: var(--text-faint); margin: 2px 0 var(--space-4); }

/* Переходы */
.pe-fade-enter-active, .pe-fade-leave-active { transition: opacity .16s ease, transform .16s var(--ease-out, ease); }
.pe-fade-enter-from { opacity: 0; transform: translateY(6px); }
.pe-fade-leave-to   { opacity: 0; transform: translateY(-4px); }
.pe-pop-enter-active, .pe-pop-leave-active { transition: opacity .15s ease, transform .18s var(--ease-out, ease); }
.pe-pop-enter-from, .pe-pop-leave-to { opacity: 0; transform: scale(.96) translateY(-4px); }

@media (max-width: 480px) {
  .pm-overlay { padding: 0; align-items: flex-end; }
  .pm, .pm.pm-edit { width: 100%; max-height: 94vh; border-radius: var(--radius-xl) var(--radius-xl) 0 0; }
  .pe-tab svg { display: none; }
  .field-pair, .preset-list { grid-template-columns: 1fr; }
  .emoji-grid, .status-emojis { grid-template-columns: repeat(6, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .pm, .pm-overlay, .pe-ink, .pp-avatar, .banner-tile, .color-dot, .emoji-pick { transition: none; }
  .pe-fade-enter-active, .pe-fade-leave-active, .pe-pop-enter-active, .pe-pop-leave-active { transition: none; }
  .bt-check, .color-dot svg, .spinner, .banner-pattern { animation: none !important; }
}
</style>
