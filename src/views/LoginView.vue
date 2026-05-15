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

      <h1>Привет 👋</h1>
      <p class="subtitle">Выбери свой профиль или создай новый</p>

      <!-- Список существующих пользователей -->
      <div v-if="existingUsers.length" class="user-list">
        <button
          v-for="u in existingUsers" :key="u.id"
          class="user-btn"
          :class="{ active: selected?.id === u.id }"
          @click="selectUser(u)"
        >
          <span class="avatar" :style="{ background: u.color + '22', color: u.color }">{{ u.avatar }}</span>
          <span class="uname">{{ u.name }}</span>
          <span v-if="selected?.id === u.id" class="check">✓</span>
        </button>
      </div>

      <!-- Создать нового -->
      <div class="divider-line"><span>или создать новый</span></div>

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
          @keydown.enter="createAndLogin"
          class="name-input"
        />
      </div>

      <button class="login-btn" :disabled="!canLogin" @click="doLogin">
        <span v-if="!loading">Войти →</span>
        <span v-else>Загружаем...</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const router = useRouter()

const existingUsers = ref([])
const selected = ref(null)
const newName = ref('')
const newAvatar = ref('🧑')
const newColor = ref('#7c6af7')
const loading = ref(false)
const mounted = ref(false)

const avatars = ['🧑','👩','👨','🧔','👩‍💻','👨‍💻','🦊','🐼','🐻','🐸','🤖','👾']
const colors  = ['#7c6af7','#4caf7d','#e8956d','#e06c75','#e8af34','#61afef','#c678dd','#56b6c2']

const canLogin = computed(() =>
  selected.value || newName.value.trim().length > 0
)

onMounted(async () => {
  existingUsers.value = await store.fetchUsers()
  mounted.value = true
  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
})

function selectUser(u) {
  selected.value = u
  newName.value = ''
}

async function doLogin() {
  if (!canLogin.value || loading.value) return
  loading.value = true
  try {
    if (selected.value) {
      await store.login(selected.value.name, selected.value.avatar, selected.value.color)
    } else {
      await store.login(newName.value.trim(), newAvatar.value, newColor.value)
    }
    await store.fetchFolders()
    const firstCh = store.allChannels[0]
    if (firstCh) {
      await store.setChannel(firstCh.id)
      router.push({ name: 'chat', params: { channelId: firstCh.id } })
    } else {
      router.push({ name: 'chat' })
    }
  } finally {
    loading.value = false
  }
}

function createAndLogin() {
  selected.value = null
  doLogin()
}
</script>

<style scoped>
.login-wrap {
  min-height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg);
  padding: var(--space-4);
}
.login-box {
  width: min(420px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: var(--space-8) var(--space-8) var(--space-6);
  box-shadow: var(--shadow-lg);
  opacity: 0;
  transform: translateY(16px);
  transition: opacity .4s ease, transform .4s ease;
}
.login-box.slide-in { opacity: 1; transform: translateY(0); }

.login-logo {
  display: flex; align-items: center; gap: var(--space-2);
  margin-bottom: var(--space-6);
}
.login-logo svg { width: 40px; height: 40px; }
.login-logo span { font-size: var(--text-lg); font-weight: 700; color: var(--text); }

h1 { font-size: var(--text-xl); font-weight: 700; margin-bottom: var(--space-1); }
.subtitle { font-size: var(--text-sm); color: var(--text-muted); margin-bottom: var(--space-5); }

.user-list { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
.user-btn {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--surface-2);
  transition: all var(--transition);
  text-align: left;
}
.user-btn:hover { background: var(--hover); border-color: var(--border); }
.user-btn.active { border-color: var(--accent-line); background: var(--accent-soft); }
.avatar {
  width: 36px; height: 36px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem; flex-shrink: 0;
}
.uname { flex: 1; font-weight: 600; font-size: var(--text-sm); }
.check { color: var(--accent); font-weight: 700; }

.divider-line {
  display: flex; align-items: center; gap: var(--space-3);
  color: var(--text-faint); font-size: var(--text-xs);
  margin: var(--space-4) 0;
}
.divider-line::before, .divider-line::after {
  content: ''; flex: 1; height: 1px; background: var(--divider);
}

.new-user-form { display: flex; flex-direction: column; gap: var(--space-3); }
.avatar-row { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.avatar-pick {
  width: 36px; height: 36px; border-radius: var(--radius-md);
  font-size: 1.1rem;
  border: 2px solid transparent;
  background: var(--surface-3);
  transition: all var(--transition);
}
.avatar-pick:hover { background: var(--hover); }
.avatar-pick.active { border-color: var(--accent); background: var(--accent-soft); }

.color-row { display: flex; gap: var(--space-2); }
.color-dot {
  width: 22px; height: 22px; border-radius: var(--radius-full);
  border: 2px solid transparent;
  transition: transform var(--transition), border-color var(--transition);
}
.color-dot:hover { transform: scale(1.15); }
.color-dot.active { border-color: var(--text); transform: scale(1.2); }

.name-input {
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  transition: border-color var(--transition);
  width: 100%;
}
.name-input:focus { outline: none; border-color: var(--accent-line); }
.name-input::placeholder { color: var(--text-faint); }

.login-btn {
  width: 100%; margin-top: var(--space-5);
  padding: var(--space-3) var(--space-4);
  background: var(--accent); color: white;
  border-radius: var(--radius-lg);
  font-size: var(--text-sm); font-weight: 700;
  transition: all var(--transition);
}
.login-btn:hover:not(:disabled) { background: var(--accent-hover); }
.login-btn:disabled { opacity: .45; cursor: not-allowed; }
</style>
