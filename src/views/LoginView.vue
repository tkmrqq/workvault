<template>
  <div class="login-wrap">
    <div class="login-box" :class="{ 'slide-in': mounted }">

      <!-- Logo -->
      <div class="login-logo">
        <svg viewBox="0 0 40 40" fill="none" aria-label="WorkVault">
          <rect width="40" height="40" rx="10" fill="var(--accent)" opacity=".18"/>
          <path d="M20 7L31 13.5V26.5L20 33L9 26.5V13.5L20 7Z"
            fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round"/>
          <circle cx="20" cy="20" r="4" fill="var(--accent)" opacity=".9"/>
          <path d="M20 7v7M20 26v7M9 13.5l6 3.5M25 23l6 3.5"
            stroke="var(--accent)" stroke-width="1" opacity=".4"/>
        </svg>
        <span>WorkVault</span>
      </div>

      <!-- ═══ ШАГ 1: выбор пользователя ═══ -->
      <template v-if="step === 'pick'">
        <h1>Привет 👋</h1>
        <p class="subtitle">Выбери профиль или создай новый</p>

        <div v-if="loadingUsers" class="users-loading">
          <div class="skeleton" style="height:52px;border-radius:12px" v-for="i in 3" :key="i"/>
        </div>

        <div v-else-if="allUsers.length" class="user-list">
          <button
            v-for="u in allUsers" :key="u.id"
            class="user-btn"
            @click="pickUser(u)"
          >
            <span class="avatar" :style="{ background: u.color + '22', color: u.color }">{{ u.avatar }}</span>
            <span class="uname">{{ u.name }}</span>
            <ChevronRight class="arrow" :size="15" :stroke-width="2" />
          </button>
        </div>

        <p v-else class="no-users">Пока нет ни одного пользователя</p>

        <div class="divider-line"><span>или создать новый</span></div>

        <button class="create-btn" @click="step = 'create'">
          <Plus :size="15" :stroke-width="2.5" style="vertical-align:-2px;margin-right:4px" />Создать профиль
        </button>

        <a v-if="!isElectron" :href="downloadUrl" class="download-link" download>
          Скачать приложение для Windows
        </a>
      </template>

      <!-- ═══ ШАГ 2: ввод PIN (если есть) ═══ -->
      <template v-else-if="step === 'pin'">
        <button class="back-btn" @click="step = 'pick'; pinError = ''"><ArrowLeft :size="12" :stroke-width="2.5" style="vertical-align:-1px;margin-right:3px" />Назад</button>

        <div class="pin-profile">
          <span class="avatar-lg" :style="{ background: selectedUser.color + '22', color: selectedUser.color }">
            {{ selectedUser.avatar }}
          </span>
          <span class="pin-name">{{ selectedUser.name }}</span>
        </div>

        <p class="subtitle">Введи PIN-код</p>

        <div class="pin-dots">
          <div v-for="i in 4" :key="i" class="pin-dot" :class="{ filled: pin.length >= i }"/>
        </div>

        <div class="pin-pad">
          <button v-for="n in [1,2,3,4,5,6,7,8,9,'',0,'⌫']" :key="n"
            class="pin-key"
            :class="{ ghost: n === '' }"
            @click="pinPress(n)"
          ><Delete v-if="n === '⌫'" :size="18" :stroke-width="2" /><template v-else>{{ n }}</template></button>
        </div>

        <p v-if="pinError" class="pin-error">{{ pinError }}</p>
      </template>

      <!-- ═══ ШАГ 3: создание нового пользователя ═══ -->
      <template v-else-if="step === 'create'">
        <button class="back-btn" @click="step = 'pick'"><ArrowLeft :size="12" :stroke-width="2.5" style="vertical-align:-1px;margin-right:3px" />Назад</button>
        <h1>Новый профиль</h1>
        <p class="subtitle">Настрой свой аватар и имя</p>

        <div class="new-user-form">
          <div class="avatar-row">
            <button
              v-for="a in avatars" :key="a"
              class="avatar-pick" :class="{ active: newAvatar === a }"
              @click="newAvatar = a"
            >{{ a }}</button>
          </div>
          <div class="color-row">
            <button
              v-for="c in colors" :key="c"
              class="color-dot" :class="{ active: newColor === c }"
              :style="{ background: c }"
              @click="newColor = c"
            />
          </div>
          <input
            v-model="newName"
            placeholder="Имя..."
            maxlength="24"
            class="name-input"
            @input="createError = ''"
            @keydown.enter="newName.trim() && (step = 'setpin')"
          />
        </div>

        <p v-if="createError" class="pin-error">{{ createError }}</p>

        <button class="login-btn" :disabled="!newName.trim()" @click="step = 'setpin'">
          Далее <ArrowRight :size="15" :stroke-width="2.5" style="vertical-align:-2px;margin-left:2px" />
        </button>
      </template>

      <!-- ═══ ШАГ 4: установить PIN (опционально) ═══ -->
      <template v-else-if="step === 'setpin'">
        <button class="back-btn" @click="step = 'create'"><ArrowLeft :size="12" :stroke-width="2.5" style="vertical-align:-1px;margin-right:3px" />Назад</button>
        <h1>Установить PIN?</h1>
        <p class="subtitle">Защити профиль 4-значным PIN-кодом. Можно пропустить.</p>

        <div class="pin-dots">
          <div v-for="i in 4" :key="i" class="pin-dot" :class="{ filled: newPin.length >= i }"/>
        </div>

        <div class="pin-pad">
          <button v-for="n in [1,2,3,4,5,6,7,8,9,'',0,'⌫']" :key="n"
            class="pin-key"
            :class="{ ghost: n === '' }"
            @click="newPinPress(n)"
          ><Delete v-if="n === '⌫'" :size="18" :stroke-width="2" /><template v-else>{{ n }}</template></button>
        </div>

        <div class="setpin-actions">
          <button class="skip-btn" @click="createAndLogin(false)">Без PIN</button>
          <button class="login-btn" style="flex:1" :disabled="newPin.length < 4" @click="createAndLogin(true)">
            <span v-if="!loading" class="login-btn-row">Создать <ArrowRight :size="15" :stroke-width="2.5" /></span>
            <span v-else>Создаём...</span>
          </button>
        </div>
      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { ChevronRight, Plus, ArrowLeft, ArrowRight, Delete } from 'lucide-vue-next'

const store  = useAppStore()
const router = useRouter()
const API    = import.meta.env.VITE_API_URL || ''

const step        = ref('pick')   // pick | pin | create | setpin
const mounted     = ref(false)
const loading     = ref(false)
const loadingUsers = ref(true)

const allUsers    = ref([])
const selectedUser = ref(null)

// PIN-вход
const pin      = ref('')
const pinError = ref('')
const createError = ref('')

// Создание
const newName   = ref('')
const newAvatar = ref('🧑')
const newColor  = ref('#7c6af7')
const newPin    = ref('')

const avatars = ['🧑','👩','👨','🧔','👩‍💻','👨‍💻','🦊','🐼','🐻','🐸','🤖','👾']
const colors  = ['#7c6af7','#4caf7d','#e8956d','#e06c75','#e8af34','#61afef','#c678dd','#56b6c2']

const downloadUrl = ref('')
const isElectron  = !!window.electronAPI

// ─── Загрузка пользователей с сервера ────────────────────
async function loadUsers() {
  loadingUsers.value = true
  try {
    const r = await fetch(`${API}/api/users`)
    allUsers.value = await r.json()
  } catch {}
  loadingUsers.value = false
}

// ─── Выбор пользователя ───────────────────────────────────
function pickUser(u) {
  selectedUser.value = u
  pin.value  = ''
  pinError.value = ''
  if (u.has_pin) {
    step.value = 'pin'
  } else {
    loginAs(u)
  }
}

// ─── PIN-пад для входа ────────────────────────────────────
function pinPress(n) {
  if (n === '⌫') { pin.value = pin.value.slice(0, -1); pinError.value = ''; return }
  if (n === '' || pin.value.length >= 4) return
  pin.value += String(n)
  if (pin.value.length === 4) verifyPin()
}

async function verifyPin() {
  try {
    const r = await fetch(`${API}/api/users/${selectedUser.value.id}/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin.value })
    })
    const d = await r.json()
    if (d.ok) {
      loginAs(selectedUser.value)
    } else {
      pinError.value = 'Неверный PIN'
      pin.value = ''
    }
  } catch {
    pinError.value = 'Ошибка сервера'
    pin.value = ''
  }
}

// ─── PIN-пад для создания ─────────────────────────────────
function newPinPress(n) {
  if (n === '⌫') { newPin.value = newPin.value.slice(0, -1); return }
  if (n === '' || newPin.value.length >= 4) return
  newPin.value += String(n)
}

// ─── Создание + вход ─────────────────────────────────────
async function createAndLogin(withPin) {
  if (loading.value) return
  loading.value = true
  createError.value = ''
  try {
    const u = await store.login(newName.value.trim(), newAvatar.value, newColor.value)
    if (withPin && newPin.value.length === 4) {
      await fetch(`${API}/api/users/${u.id}/set-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin.value })
      })
    }
    await goHome()
  } catch (e) {
    createError.value = e?.error || 'Не удалось создать профиль'
    step.value = 'create'
  } finally {
    loading.value = false
  }
}

// ─── Войти как выбранный пользователь ────────────────────
async function loginAs(u) {
  loading.value = true
  try {
    store.setUser(u)
    await goHome()
  } finally {
    loading.value = false
  }
}

async function goHome() {
  await store.fetchFolders()
  const firstCh = store.allChannels[0]
  if (firstCh) {
    await store.setChannel(firstCh.id)
    router.push({ name: 'chat', params: { channelId: firstCh.id } })
  } else {
    router.push({ name: 'chat' })
  }
}

onMounted(async () => {
  mounted.value = true
  await loadUsers()
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
  try {
    const r = await fetch(`${API}/api/latest-release`)
    const d = await r.json()
    if (d.url) downloadUrl.value = `${API}${d.url}`
  } catch {}
})
</script>

<style scoped>
.login-wrap {
  min-height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg); padding: var(--space-4);
}
.login-box {
  width: min(400px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: var(--space-8) var(--space-8) var(--space-6);
  box-shadow: var(--shadow-lg);
  opacity: 0; transform: translateY(16px);
  transition: opacity .4s ease, transform .4s ease;
}
.login-box.slide-in { opacity: 1; transform: translateY(0); }

.login-logo {
  display: flex; align-items: center; gap: var(--space-2);
  margin-bottom: var(--space-6);
}
.login-logo svg { width: 40px; height: 40px; }
.login-logo span { font-size: var(--text-lg); font-weight: 700; }

h1 { font-size: var(--text-xl); font-weight: 700; margin-bottom: var(--space-1); }
.subtitle { font-size: var(--text-sm); color: var(--text-muted); margin-bottom: var(--space-5); }

.back-btn {
  font-size: var(--text-xs); color: var(--text-muted); font-weight: 600;
  margin-bottom: var(--space-4); transition: color var(--transition);
  display: inline-flex; align-items: center;
}
.back-btn:hover { color: var(--accent); }
.login-btn-row { display: inline-flex; align-items: center; gap: 4px; }

/* ── Скелетон ── */
.users-loading { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
.skeleton {
  background: linear-gradient(90deg,var(--surface-3) 25%,var(--hover) 50%,var(--surface-3) 75%);
  background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite;
}

/* ── Список пользователей ── */
.user-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
.user-btn {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg); border: 1px solid var(--border);
  background: var(--surface-2); transition: all var(--transition); text-align: left;
}
.user-btn:hover { background: var(--hover); border-color: var(--accent-line); transform: translateX(2px); }
.avatar {
  width: 38px; height: 38px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.25rem; flex-shrink: 0;
}
.uname { flex: 1; font-weight: 600; font-size: var(--text-sm); }
.arrow { color: var(--text-faint); font-size: var(--text-sm); transition: transform var(--transition); }
.user-btn:hover .arrow { transform: translateX(3px); color: var(--accent); }

.no-users { font-size: var(--text-sm); color: var(--text-faint); text-align: center; padding: var(--space-6) 0; }

.divider-line {
  display: flex; align-items: center; gap: var(--space-3);
  color: var(--text-faint); font-size: var(--text-xs);
  margin: var(--space-3) 0;
}
.divider-line::before, .divider-line::after {
  content: ''; flex: 1; height: 1px; background: var(--divider);
}
.create-btn {
  width: 100%; padding: var(--space-3);
  border: 1px dashed var(--accent-line); border-radius: var(--radius-lg);
  font-size: var(--text-sm); font-weight: 600; color: var(--accent);
  transition: all var(--transition);
}
.create-btn:hover { background: var(--accent-soft); }

/* ── PIN ── */
.pin-profile {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.avatar-lg {
  width: 64px; height: 64px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center; font-size: 2rem;
}
.pin-name { font-size: var(--text-base); font-weight: 700; }

.pin-dots {
  display: flex; justify-content: center; gap: var(--space-4);
  margin: var(--space-4) 0;
}
.pin-dot {
  width: 16px; height: 16px; border-radius: var(--radius-full);
  border: 2px solid var(--border); background: transparent;
  transition: all .2s ease;
}
.pin-dot.filled { background: var(--accent); border-color: var(--accent); transform: scale(1.15); }

.pin-pad {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2); margin: 0 auto; max-width: 240px;
}
.pin-key {
  height: 56px; border-radius: var(--radius-lg);
  font-size: var(--text-lg); font-weight: 600;
  background: var(--surface-2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition); color: var(--text);
}
.pin-key:hover:not(.ghost) { background: var(--hover); border-color: var(--accent-line); transform: scale(1.04); }
.pin-key:active:not(.ghost) { transform: scale(.96); }
.pin-key.ghost { background: transparent; border-color: transparent; pointer-events: none; }

.pin-error {
  text-align: center; color: #e06c75;
  font-size: var(--text-xs); font-weight: 600;
  margin-top: var(--space-3);
  animation: shake .3s ease;
}
@keyframes shake {
  0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)}
}

/* ── Создание ── */
.new-user-form { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); }
.avatar-row { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.avatar-pick {
  width: 36px; height: 36px; border-radius: var(--radius-md);
  font-size: 1.1rem; border: 2px solid transparent;
  background: var(--surface-3); transition: all var(--transition);
}
.avatar-pick:hover { background: var(--hover); }
.avatar-pick.active { border-color: var(--accent); background: var(--accent-soft); }

.color-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.color-dot {
  width: 22px; height: 22px; border-radius: var(--radius-full);
  border: 2px solid transparent; transition: transform var(--transition), border-color var(--transition);
}
.color-dot:hover { transform: scale(1.15); }
.color-dot.active { border-color: var(--text); transform: scale(1.2); }

.name-input {
  background: var(--surface-3); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm); width: 100%;
  transition: border-color var(--transition); color: var(--text);
}
.name-input:focus { outline: none; border-color: var(--accent-line); }
.name-input::placeholder { color: var(--text-faint); }

.login-btn {
  width: 100%; padding: var(--space-3) var(--space-4);
  background: var(--accent); color: white;
  border-radius: var(--radius-lg);
  font-size: var(--text-sm); font-weight: 700;
  transition: all var(--transition);
}
.login-btn:hover:not(:disabled) { background: var(--accent-hover); }
.login-btn:disabled { opacity: .45; cursor: not-allowed; }

.setpin-actions { display: flex; gap: var(--space-3); margin-top: var(--space-2); }
.skip-btn {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  font-size: var(--text-sm); font-weight: 600; color: var(--text-muted);
  transition: all var(--transition); white-space: nowrap;
}
.skip-btn:hover { background: var(--hover); color: var(--text); }

.download-link {
  display: block; text-align: center; margin-top: var(--space-5);
  font-size: var(--text-xs); color: var(--text-faint);
  transition: color var(--transition);
}
.download-link:hover { color: var(--accent); }
</style>