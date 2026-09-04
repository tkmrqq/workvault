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
            <span v-if="!u.has_password" class="badge-nopass">нет пароля</span>
            <ChevronRight class="arrow" :size="15" :stroke-width="2" />
          </button>
        </div>

        <p v-else class="no-users">Пока нет ни одного пользователя</p>

        <div class="divider-line"><span>или создать новый</span></div>

        <button class="create-btn" @click="startCreate">
          <Plus :size="15" :stroke-width="2.5" style="vertical-align:-2px;margin-right:4px" />Создать профиль
        </button>

        <a v-if="!isElectron" :href="downloadUrl" class="download-link" download>
          Скачать приложение для Windows
        </a>
      </template>

      <!-- ═══ ШАГ 2: ввод пароля (обычный вход) ═══ -->
      <template v-else-if="step === 'password'">
        <button class="back-btn" @click="step = 'pick'; password = ''; passError = ''"><ArrowLeft :size="12" :stroke-width="2.5" style="vertical-align:-1px;margin-right:3px" />Назад</button>

        <div class="pin-profile">
          <span class="avatar-lg" :style="{ background: selectedUser.color + '22', color: selectedUser.color }">
            {{ selectedUser.avatar }}
          </span>
          <span class="pin-name">{{ selectedUser.name }}</span>
        </div>

        <p class="subtitle">Введи пароль</p>

        <input
          ref="passInput"
          v-model="password"
          type="password"
          placeholder="Пароль"
          class="name-input"
          autofocus
          @input="passError = ''"
          @keydown.enter="submitLogin"
        />

        <p v-if="passError" class="pin-error">{{ passError }}</p>

        <button class="login-btn" style="margin-top:12px" :disabled="!password || loading" @click="submitLogin">
          <span v-if="!loading">Войти</span>
          <span v-else>Входим...</span>
        </button>
      </template>

      <!-- ═══ ШАГ 3: миграция — задать пароль старому аккаунту ═══ -->
      <template v-else-if="step === 'setpassword'">
        <button class="back-btn" @click="step = 'pick'; password = ''; password2 = ''; passError = ''"><ArrowLeft :size="12" :stroke-width="2.5" style="vertical-align:-1px;margin-right:3px" />Назад</button>

        <div class="pin-profile">
          <span class="avatar-lg" :style="{ background: selectedUser.color + '22', color: selectedUser.color }">
            {{ selectedUser.avatar }}
          </span>
          <span class="pin-name">{{ selectedUser.name }}</span>
        </div>

        <p class="subtitle">У этого профиля ещё нет пароля — задай новый, не короче 6 символов</p>

        <div class="new-user-form">
          <input
            v-model="password"
            type="password"
            placeholder="Новый пароль"
            class="name-input"
            @input="passError = ''"
          />
          <input
            v-model="password2"
            type="password"
            placeholder="Повтори пароль"
            class="name-input"
            @input="passError = ''"
            @keydown.enter="submitSetPassword"
          />
        </div>

        <p v-if="passError" class="pin-error">{{ passError }}</p>

        <button class="login-btn" :disabled="!canSubmitSetPassword || loading" @click="submitSetPassword">
          <span v-if="!loading">Задать пароль и войти</span>
          <span v-else>Сохраняем...</span>
        </button>
      </template>

      <!-- ═══ ШАГ 4: создание нового пользователя — имя/аватар/цвет ═══ -->
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
            @keydown.enter="newName.trim() && (step = 'createpassword')"
          />
        </div>

        <p v-if="createError" class="pin-error">{{ createError }}</p>

        <button class="login-btn" :disabled="!newName.trim()" @click="step = 'createpassword'">
          Далее <ArrowRight :size="15" :stroke-width="2.5" style="vertical-align:-2px;margin-left:2px" />
        </button>
      </template>

      <!-- ═══ ШАГ 5: пароль для нового профиля ═══ -->
      <template v-else-if="step === 'createpassword'">
        <button class="back-btn" @click="step = 'create'"><ArrowLeft :size="12" :stroke-width="2.5" style="vertical-align:-1px;margin-right:3px" />Назад</button>
        <h1>Придумай пароль</h1>
        <p class="subtitle">Не короче 6 символов — понадобится для входа в следующий раз</p>

        <div class="new-user-form">
          <input
            v-model="password"
            type="password"
            placeholder="Пароль"
            class="name-input"
            @input="passError = ''"
          />
          <input
            v-model="password2"
            type="password"
            placeholder="Повтори пароль"
            class="name-input"
            @input="passError = ''"
            @keydown.enter="submitRegister"
          />
        </div>

        <p v-if="passError" class="pin-error">{{ passError }}</p>

        <button class="login-btn" :disabled="!canSubmitSetPassword || loading" @click="submitRegister">
          <span v-if="!loading" class="login-btn-row">Создать <ArrowRight :size="15" :stroke-width="2.5" /></span>
          <span v-else>Создаём...</span>
        </button>
      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { ChevronRight, Plus, ArrowLeft, ArrowRight } from 'lucide-vue-next'

const store  = useAppStore()
const router = useRouter()
const API    = import.meta.env.VITE_API_URL || ''

const step         = ref('pick') // pick | password | setpassword | create | createpassword
const mounted      = ref(false)
const loading      = ref(false)
const loadingUsers = ref(true)

const allUsers     = ref([])
const selectedUser = ref(null)
const passInput    = ref(null)

// Вход / установка пароля
const password  = ref('')
const password2 = ref('')
const passError = ref('')
const createError = ref('')

// Создание нового профиля
const newName   = ref('')
const newAvatar = ref('🧑')
const newColor  = ref('#7c6af7')

const avatars = ['🧑','👩','👨','🧔','👩‍💻','👨‍💻','🦊','🐼','🐻','🐸','🤖','👾']
const colors  = ['#7c6af7','#4caf7d','#e8956d','#e06c75','#e8af34','#61afef','#c678dd','#56b6c2']

const downloadUrl = ref('')
const isElectron  = !!window.electronAPI

const canSubmitSetPassword = computed(() =>
  password.value.length >= 6 && password.value === password2.value
)

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
async function pickUser(u) {
  selectedUser.value = u
  password.value = ''; password2.value = ''; passError.value = ''
  step.value = u.has_password ? 'password' : 'setpassword'
  await nextTick()
  passInput.value?.focus()
}

function startCreate() {
  newName.value = ''; createError.value = ''
  password.value = ''; password2.value = ''; passError.value = ''
  step.value = 'create'
}

// ─── Обычный вход ──────────────────────────────────────────
async function submitLogin() {
  if (!password.value || loading.value) return
  loading.value = true
  passError.value = ''
  try {
    const result = await store.login(selectedUser.value.name, password.value)
    if (!result.ok && result.needsPasswordSetup) {
      // Редкий случай гонки: пока смотрели на экран, пароль так и не задали
      // с другого устройства — просто переключаемся на нужный шаг
      step.value = 'setpassword'
      password.value = ''
      return
    }
    await goHome()
  } catch (e) {
    passError.value = e?.error || 'Неверный пароль'
    password.value = ''
  } finally {
    loading.value = false
  }
}

// ─── Миграция: задать пароль старому аккаунту ──────────────
async function submitSetPassword() {
  if (!canSubmitSetPassword.value || loading.value) return
  loading.value = true
  passError.value = ''
  try {
    await store.setPassword(selectedUser.value.name, password.value)
    await goHome()
  } catch (e) {
    passError.value = e?.error || 'Не удалось задать пароль'
  } finally {
    loading.value = false
  }
}

// ─── Регистрация нового профиля ────────────────────────────
async function submitRegister() {
  if (!canSubmitSetPassword.value || loading.value) return
  loading.value = true
  passError.value = ''
  try {
    await store.register(newName.value.trim(), password.value, newAvatar.value, newColor.value)
    await goHome()
  } catch (e) {
    passError.value = e?.error || 'Не удалось создать профиль'
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
.badge-nopass {
  font-size: 10px; font-weight: 700; color: #e8af34;
  background: rgba(232,175,52,.15); padding: 2px 7px; border-radius: var(--radius-full);
  flex-shrink: 0;
}
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

/* ── Профиль над формой пароля ── */
.pin-profile {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.avatar-lg {
  width: 64px; height: 64px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center; font-size: 2rem;
}
.pin-name { font-size: var(--text-base); font-weight: 700; }

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

.download-link {
  display: block; text-align: center; margin-top: var(--space-5);
  font-size: var(--text-xs); color: var(--text-faint);
  transition: color var(--transition);
}
.download-link:hover { color: var(--accent); }
</style>